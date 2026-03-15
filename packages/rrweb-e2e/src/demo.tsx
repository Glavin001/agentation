/**
 * Interactive demo — human-friendly page for testing rrweb + agentation.
 *
 * Open http://localhost:3399/demo.html in a browser:
 *   1. Click "Record" → interact with the sample app
 *   2. Click "Stop"
 *   3. Click "Replay" → the player appears with an "Annotate" button
 *   4. Click "Annotate" → hover/click elements in the replay to create annotations
 *   5. Annotations appear in the panel below with full source metadata
 */

import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { record } from "rrweb";
import rrwebPlayer from "rrweb-player";
import "rrweb-player/dist/style.css";
import { createSourceRecordPlugin } from "@agentation/rrweb-source-record";
import { createSourceReplayPlugin } from "@agentation/rrweb-source-replay";
import { RRWebAnnotator } from "@agentation/rrweb-annotator";
import type { Annotation } from "agentation";

// ---- Global state ----
let events: any[] = [];
let stopRecording: (() => void) | null = null;
let replayRoot: ReturnType<typeof createRoot> | null = null;

// ---- DOM refs ----
const btnRecord = document.getElementById("btn-record") as HTMLButtonElement;
const btnStop = document.getElementById("btn-stop") as HTMLButtonElement;
const btnReplay = document.getElementById("btn-replay") as HTMLButtonElement;
const statusEl = document.getElementById("status")!;
const messageArea = document.getElementById("message-area")!;
const replaySection = document.getElementById("replay-section")!;
const replayRootEl = document.getElementById("replay-root")!;
const annotationsSection = document.getElementById("annotations-section")!;
const annotationsList = document.getElementById("annotations-list")!;
const annotationCount = document.getElementById("annotation-count")!;
const noAnnotations = document.getElementById("no-annotations")!;
const sourcePanel = document.getElementById("source-panel")!;
const sourceCount = document.getElementById("source-count")!;
const sourceEntries = document.getElementById("source-entries")!;

// ==========================================================================
// React component: Player + RRWebAnnotator overlay
// ==========================================================================

interface ReplayWithAnnotatorProps {
  events: any[];
  onAnnotation: (annotation: Annotation) => void;
}

function ReplayWithAnnotator({ events, onAnnotation }: ReplayWithAnnotatorProps) {
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [store, setStore] = useState<any>(null);
  const [isPaused, setIsPaused] = useState(false);
  const playerInstanceRef = useRef<rrwebPlayer | null>(null);

  useEffect(() => {
    if (!playerContainerRef.current) return;

    // Clear previous player
    playerContainerRef.current.innerHTML = "";
    setIsPaused(false);

    const { plugin: replayPlugin, store: sourceStore } = createSourceReplayPlugin();
    setStore(sourceStore);

    // Subscribe to source store updates for the bottom panel
    sourceStore.onChange(() => {
      renderSourcePanel(sourceStore);
    });

    const player = new rrwebPlayer({
      target: playerContainerRef.current,
      props: {
        events,
        plugins: [replayPlugin],
        width: 1050,
        height: 600,
        showController: true,
        autoPlay: true,
      },
    });
    playerInstanceRef.current = player;

    // Listen for pause/resume via the replayer
    const replayer = player.getReplayer();
    replayer.on("pause", () => setIsPaused(true));
    replayer.on("resume", () => setIsPaused(false));
    replayer.on("start", () => setIsPaused(false));
    replayer.on("finish", () => setIsPaused(true));
  }, [events]);

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div ref={playerContainerRef} />

      {/* Pause hint banner */}
      {!isPaused && store && (
        <div style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 20,
          padding: "6px 12px",
          fontSize: 12,
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          color: "#d1d5db",
          borderRadius: 6,
          pointerEvents: "none",
        }}>
          Pause to annotate
        </div>
      )}

      {/* Full Agentation toolbar when paused */}
      {isPaused && store && (
        <RRWebAnnotator
          playerRef={playerContainerRef}
          sourceStore={store}
          onAnnotationAdd={onAnnotation}
          onAnnotationDelete={(ann) => {
            const idx = annotations.findIndex(a => a.id === ann.id);
            if (idx >= 0) annotations.splice(idx, 1);
            renderAnnotations();
          }}
          onAnnotationsClear={() => {
            annotations.length = 0;
            renderAnnotations();
          }}
          onCopy={(markdown) => console.log("Copied annotations:", markdown)}
        />
      )}
    </div>
  );
}

// ==========================================================================
// Sample app interactions (vanilla DOM — this is what gets recorded)
// ==========================================================================

function setupSampleApp() {
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => {
      const name = card.querySelector("h3")?.textContent ?? "Unknown";
      messageArea.textContent = `Opened "${name}" — ${new Date().toLocaleTimeString()}`;
      messageArea.style.background = "#ecfdf5";
      setTimeout(() => { messageArea.style.background = "#fafafa"; }, 800);
    });
  });

  document.getElementById("todo-list")!.addEventListener("change", (e) => {
    const target = e.target as HTMLInputElement;
    if (target.type === "checkbox") {
      const li = target.closest("li")!;
      li.classList.toggle("done", target.checked);
      messageArea.textContent = `${target.checked ? "Completed" : "Uncompleted"}: ${li.querySelector("span")?.textContent}`;
    }
  });

  let todoCounter = 0;
  document.getElementById("btn-add-todo")!.addEventListener("click", () => {
    todoCounter++;
    const li = document.createElement("li");
    li.innerHTML = `<input type="checkbox" aria-label="Toggle: New todo ${todoCounter}" /><span>New todo item #${todoCounter}</span>`;
    document.getElementById("todo-list")!.appendChild(li);
    messageArea.textContent = `Added todo #${todoCounter}`;
  });

  document.getElementById("btn-toggle-theme")!.addEventListener("click", () => {
    const app = document.getElementById("sample-app")!;
    const isDark = app.style.background === "rgb(30, 41, 59)";
    if (isDark) {
      app.style.background = "#fff";
      app.style.color = "#1a1a1a";
      messageArea.textContent = "Switched to light theme";
    } else {
      app.style.background = "#1e293b";
      app.style.color = "#e2e8f0";
      messageArea.textContent = "Switched to dark theme";
    }
  });

  document.getElementById("btn-show-alert")!.addEventListener("click", () => {
    const notif = document.createElement("div");
    notif.setAttribute("role", "alert");
    notif.setAttribute("aria-label", "Notification");
    notif.style.cssText = `
      position: fixed; top: 60px; right: 20px; z-index: 100;
      padding: 12px 20px; background: #059669; color: #fff;
      border-radius: 8px; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,.2);
    `;
    notif.textContent = "Action completed successfully!";
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 2500);
    messageArea.textContent = "Notification shown";
  });

  let cardCounter = 0;
  document.getElementById("btn-add-card")!.addEventListener("click", () => {
    cardCounter++;
    const colors = ["blue", "green", "purple", "orange"];
    const color = colors[cardCounter % colors.length];
    const card = document.createElement("div");
    card.className = `card card-${color}`;
    card.id = `card-new-${cardCounter}`;
    card.setAttribute("role", "article");
    card.setAttribute("aria-label", `New card ${cardCounter}`);
    card.innerHTML = `<h3>New Card #${cardCounter}</h3><p>Dynamically added card.</p>`;
    card.addEventListener("click", () => {
      messageArea.textContent = `Clicked "New Card #${cardCounter}" — ${new Date().toLocaleTimeString()}`;
    });
    document.querySelector(".card-grid")!.appendChild(card);
    messageArea.textContent = `Added card #${cardCounter}`;
  });
}

// ==========================================================================
// Recording controls
// ==========================================================================

btnRecord.addEventListener("click", () => {
  events = [];
  const sourcePlugin = createSourceRecordPlugin({ batchSize: 200 });

  const stopFn = record({
    emit(event: any) {
      events.push(event);
    },
    plugins: [sourcePlugin as any],
  });

  stopRecording = stopFn ?? null;

  btnRecord.disabled = true;
  btnRecord.classList.add("recording");
  btnStop.disabled = false;
  btnReplay.disabled = true;
  replaySection.style.display = "none";
  annotationsSection.style.display = "none";
  sourcePanel.style.display = "none";
  statusEl.textContent = `Recording... (0 events)`;

  const interval = setInterval(() => {
    if (!stopRecording) {
      clearInterval(interval);
      return;
    }
    statusEl.textContent = `Recording... (${events.length} events)`;
  }, 500);
});

btnStop.addEventListener("click", () => {
  if (stopRecording) {
    stopRecording();
    stopRecording = null;
  }
  btnRecord.disabled = false;
  btnRecord.classList.remove("recording");
  btnStop.disabled = true;
  btnReplay.disabled = false;
  statusEl.textContent = `Stopped — ${events.length} events captured`;
});

// ==========================================================================
// Replay with annotator
// ==========================================================================

const annotations: Annotation[] = [];

function handleAnnotation(annotation: Annotation) {
  annotations.push(annotation);
  renderAnnotations();
}

function renderAnnotations() {
  annotationCount.textContent = `(${annotations.length})`;
  noAnnotations.style.display = annotations.length > 0 ? "none" : "block";

  annotationsList.innerHTML = "";
  // Show newest first
  for (let i = annotations.length - 1; i >= 0; i--) {
    const ann = annotations[i];
    const card = document.createElement("div");
    card.className = "annotation-card";

    let html = `<div class="ann-header">`;
    html += `<span class="ann-element">${escapeHtml(ann.element)}</span>`;
    html += `<span class="ann-id">${ann.id}</span>`;
    html += `</div>`;

    if (ann.comment) {
      html += `<div class="ann-comment">${escapeHtml(ann.comment)}</div>`;
    }

    html += `<div class="ann-detail">`;

    html += `<span class="ann-label">Path:</span> <span class="ann-value">${escapeHtml(ann.elementPath)}</span><br>`;

    if (ann.sourceFile) {
      html += `<span class="ann-label">Source:</span> <span class="ann-value ann-source">${escapeHtml(ann.sourceFile)}</span><br>`;
    }
    if (ann.reactComponents) {
      html += `<span class="ann-label">Components:</span> <span class="ann-value ann-source">${escapeHtml(ann.reactComponents)}</span><br>`;
    }
    if (ann.cssClasses) {
      html += `<span class="ann-label">Classes:</span> <span class="ann-value">${escapeHtml(ann.cssClasses)}</span><br>`;
    }
    if (ann.accessibility) {
      html += `<span class="ann-label">Accessibility:</span> <span class="ann-value ann-a11y">${escapeHtml(ann.accessibility)}</span><br>`;
    }
    html += `<span class="ann-label">Position:</span> <span class="ann-value">x=${ann.x.toFixed(1)}%, y=${ann.y.toFixed(0)}px</span><br>`;
    html += `<span class="ann-label">Bounding box:</span> <span class="ann-value">${ann.boundingBox.width.toFixed(0)}x${ann.boundingBox.height.toFixed(0)} at (${ann.boundingBox.x.toFixed(0)}, ${ann.boundingBox.y.toFixed(0)})</span>`;

    html += `</div>`;
    card.innerHTML = html;
    annotationsList.appendChild(card);
  }
}

btnReplay.addEventListener("click", () => {
  if (events.length === 0) {
    statusEl.textContent = "No events to replay!";
    return;
  }

  // Clear previous annotations
  annotations.length = 0;
  renderAnnotations();

  replaySection.style.display = "block";
  annotationsSection.style.display = "block";
  sourcePanel.style.display = "block";
  sourceEntries.innerHTML = "";

  // Mount React replay component
  if (!replayRoot) {
    replayRoot = createRoot(replayRootEl);
  }

  replayRoot.render(
    <ReplayWithAnnotator events={[...events]} onAnnotation={handleAnnotation} />
  );

  statusEl.textContent = `Replaying ${events.length} events — pause to annotate`;
  replaySection.scrollIntoView({ behavior: "smooth" });
});

// ==========================================================================
// Source panel (vanilla DOM, fed from React component via callback)
// ==========================================================================

function renderSourcePanel(store: any) {
  const all = store.getAll() as Map<number, any>;
  sourceCount.textContent = String(all.size);

  const fragment = document.createDocumentFragment();
  all.forEach((info: any, nodeId: number) => {
    const div = document.createElement("div");
    div.className = "source-entry";

    let html = `<span class="node-id">#${nodeId}</span> `;
    html += `<span class="tag">&lt;${info.tagName}&gt;</span>`;
    if (info.selector) {
      html += ` <span class="selector">${escapeHtml(info.selector)}</span>`;
    }
    if (info.cssClasses?.length > 0) {
      html += ` .${info.cssClasses.join(".")}`;
    }
    if (info.accessibility?.role || info.accessibility?.label) {
      const parts: string[] = [];
      if (info.accessibility.role) parts.push(`role=${info.accessibility.role}`);
      if (info.accessibility.label) parts.push(`label=${info.accessibility.label}`);
      html += ` <span class="a11y">[${parts.join(" ")}]</span>`;
    }
    div.innerHTML = html;
    fragment.appendChild(div);
  });

  sourceEntries.innerHTML = "";
  sourceEntries.appendChild(fragment);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---- Init ----
setupSampleApp();
