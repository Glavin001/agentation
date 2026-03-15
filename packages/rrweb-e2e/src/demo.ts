/**
 * Interactive demo — human-friendly page for testing rrweb + agentation end-to-end.
 *
 * Open http://localhost:3399/demo.html in a browser:
 *   1. Click "Record" to start rrweb recording with the source plugin
 *   2. Interact with the sample app (click cards, toggle todos, add items)
 *   3. Click "Stop" to end recording
 *   4. Click "Replay" to watch the recording with source metadata overlay
 */

import { record } from "rrweb";
import rrwebPlayer from "rrweb-player";
import "rrweb-player/dist/style.css";
import { createSourceRecordPlugin } from "@agentation/rrweb-source-record";
import { createSourceReplayPlugin } from "@agentation/rrweb-source-replay";

// ---- State ----
let events: any[] = [];
let stopRecording: (() => void) | null = null;

// ---- DOM refs ----
const btnRecord = document.getElementById("btn-record") as HTMLButtonElement;
const btnStop = document.getElementById("btn-stop") as HTMLButtonElement;
const btnReplay = document.getElementById("btn-replay") as HTMLButtonElement;
const status = document.getElementById("status")!;
const messageArea = document.getElementById("message-area")!;
const replaySection = document.getElementById("replay-section")!;
const playerContainer = document.getElementById("player-container")!;
const sourcePanel = document.getElementById("source-panel")!;
const sourceCount = document.getElementById("source-count")!;
const sourceEntries = document.getElementById("source-entries")!;

// ---- Sample app interactions ----
function setupSampleApp() {
  // Card clicks
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => {
      const name = card.querySelector("h3")?.textContent ?? "Unknown";
      messageArea.textContent = `Opened "${name}" — ${new Date().toLocaleTimeString()}`;
      messageArea.style.background = "#ecfdf5";
      setTimeout(() => { messageArea.style.background = "#fafafa"; }, 800);
    });
  });

  // Todo checkboxes
  document.getElementById("todo-list")!.addEventListener("change", (e) => {
    const target = e.target as HTMLInputElement;
    if (target.type === "checkbox") {
      const li = target.closest("li")!;
      li.classList.toggle("done", target.checked);
      messageArea.textContent = `${target.checked ? "Completed" : "Uncompleted"}: ${li.querySelector("span")?.textContent}`;
    }
  });

  // Add todo
  let todoCounter = 0;
  document.getElementById("btn-add-todo")!.addEventListener("click", () => {
    todoCounter++;
    const li = document.createElement("li");
    li.innerHTML = `<input type="checkbox" aria-label="Toggle: New todo ${todoCounter}" /><span>New todo item #${todoCounter}</span>`;
    document.getElementById("todo-list")!.appendChild(li);
    messageArea.textContent = `Added todo #${todoCounter}`;
  });

  // Toggle theme
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

  // Show notification
  document.getElementById("btn-show-alert")!.addEventListener("click", () => {
    const notif = document.createElement("div");
    notif.setAttribute("role", "alert");
    notif.setAttribute("aria-label", "Notification");
    notif.className = "notification-toast";
    notif.style.cssText = `
      position: fixed; top: 60px; right: 20px; z-index: 100;
      padding: 12px 20px; background: #059669; color: #fff;
      border-radius: 8px; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,.2);
      animation: slideIn .3s ease;
    `;
    notif.textContent = "Action completed successfully!";
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 2500);
    messageArea.textContent = "Notification shown";
  });

  // Add card
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
    card.innerHTML = `<h3>New Card #${cardCounter}</h3><p>Dynamically added card with source tracking.</p>`;
    card.addEventListener("click", () => {
      messageArea.textContent = `Clicked "New Card #${cardCounter}" — ${new Date().toLocaleTimeString()}`;
    });
    document.querySelector(".card-grid")!.appendChild(card);
    messageArea.textContent = `Added card #${cardCounter}`;
  });
}

// ---- Recording ----
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
  sourcePanel.style.display = "none";
  status.textContent = `Recording... (0 events)`;

  // Update event count
  const interval = setInterval(() => {
    if (!stopRecording) {
      clearInterval(interval);
      return;
    }
    status.textContent = `Recording... (${events.length} events)`;
  }, 500);
});

// ---- Stop ----
btnStop.addEventListener("click", () => {
  if (stopRecording) {
    stopRecording();
    stopRecording = null;
  }

  btnRecord.disabled = false;
  btnRecord.classList.remove("recording");
  btnStop.disabled = true;
  btnReplay.disabled = false;
  status.textContent = `Stopped — ${events.length} events captured`;
});

// ---- Replay ----
btnReplay.addEventListener("click", () => {
  if (events.length === 0) {
    status.textContent = "No events to replay!";
    return;
  }

  replaySection.style.display = "block";
  sourcePanel.style.display = "block";
  playerContainer.innerHTML = "";
  sourceEntries.innerHTML = "";

  const { plugin: replayPlugin, store } = createSourceReplayPlugin();

  // Subscribe to store updates
  store.onChange(() => {
    renderSourcePanel(store);
  });

  const player = new rrwebPlayer({
    target: playerContainer,
    props: {
      events,
      plugins: [replayPlugin],
      width: 1050,
      height: 600,
      showController: true,
      autoPlay: true,
    },
  });

  status.textContent = `Replaying ${events.length} events...`;

  // Scroll to replay
  replaySection.scrollIntoView({ behavior: "smooth" });
});

// ---- Source panel rendering ----
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
    if (info.reactComponents) {
      html += ` <span style="color:#fbbf24">React: ${escapeHtml(info.reactComponents)}</span>`;
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
