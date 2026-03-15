/**
 * E2E test page — real rrweb recording + real rrweb-player replay + agentation plugins.
 *
 * Flow:
 * 1. Page loads with a sample DOM ("record" mode)
 * 2. rrweb.record() starts with our source-record plugin
 * 3. User interacts with the page (clicks, typing — driven by Playwright)
 * 4. Recording is stopped, events are stored in window.__rrwebEvents
 * 5. Page switches to "replay" mode with rrweb-player + source-replay plugin
 * 6. The annotator overlay is mounted on top of the replay
 */

import { record } from "rrweb";
import rrwebPlayer from "rrweb-player";
import "rrweb-player/dist/style.css";
import { createSourceRecordPlugin } from "@agentation/rrweb-source-record";
import { createSourceReplayPlugin } from "@agentation/rrweb-source-replay";

// ---- Types ----
declare global {
  interface Window {
    __rrwebEvents: any[];
    __annotations: any[];
    __sourceStore: any;
    __stopRecording: (() => void) | null;
    __startRecording: () => void;
    __startReplay: () => void;
    __replayReady: boolean;
  }
}

// ---- State ----
const events: any[] = [];
window.__rrwebEvents = events;
window.__annotations = [];
window.__replayReady = false;

// ---- Record mode UI ----
function renderRecordPage() {
  const app = document.getElementById("app")!;
  app.innerHTML = `
    <div id="record-page" style="padding: 20px; font-family: system-ui, sans-serif;">
      <h1 id="main-heading">Test Page for Recording</h1>
      <p id="description">This page is recorded by rrweb with the agentation source plugin.</p>

      <nav id="nav-bar" style="margin: 16px 0; display: flex; gap: 8px;">
        <button id="btn-home" class="nav-btn" aria-label="Home">Home</button>
        <button id="btn-about" class="nav-btn" aria-label="About">About</button>
        <button id="btn-contact" class="nav-btn" aria-label="Contact">Contact</button>
      </nav>

      <form id="feedback-form" style="margin: 16px 0;">
        <label for="name-input">Name:</label>
        <input id="name-input" type="text" placeholder="Your name" style="margin: 0 8px;" />
        <label for="email-input">Email:</label>
        <input id="email-input" type="email" placeholder="you@example.com" style="margin: 0 8px;" />
        <button id="submit-btn" type="button" aria-label="Submit feedback">Submit</button>
      </form>

      <ul id="item-list" role="list" aria-label="Items">
        <li class="list-item" data-index="0">Item One</li>
        <li class="list-item" data-index="1">Item Two</li>
        <li class="list-item" data-index="2">Item Three</li>
      </ul>

      <div id="dynamic-area" style="margin-top: 16px; min-height: 40px; border: 1px dashed #ccc; padding: 8px;">
        <span id="dynamic-text">Click a button to change this text.</span>
      </div>
    </div>
  `;

  // Wire up buttons to change dynamic area (so we get DOM mutations in recording)
  document.getElementById("btn-home")!.addEventListener("click", () => {
    document.getElementById("dynamic-text")!.textContent = "Home clicked!";
  });
  document.getElementById("btn-about")!.addEventListener("click", () => {
    document.getElementById("dynamic-text")!.textContent = "About clicked!";
  });
  document.getElementById("btn-contact")!.addEventListener("click", () => {
    const area = document.getElementById("dynamic-area")!;
    const newEl = document.createElement("div");
    newEl.id = "contact-info";
    newEl.className = "contact-card";
    newEl.setAttribute("role", "complementary");
    newEl.setAttribute("aria-label", "Contact information");
    newEl.innerHTML = `<strong>Contact:</strong> hello@example.com`;
    area.appendChild(newEl);
  });
  document.getElementById("submit-btn")!.addEventListener("click", () => {
    const name = (document.getElementById("name-input") as HTMLInputElement).value;
    document.getElementById("dynamic-text")!.textContent = `Submitted: ${name}`;
  });
}

// ---- Recording ----
window.__startRecording = function startRecording() {
  const sourcePlugin = createSourceRecordPlugin({ batchSize: 500 });

  const stopFn = record({
    emit(event: any) {
      events.push(event);
    },
    plugins: [sourcePlugin as any],
  });

  window.__stopRecording = stopFn ?? null;
};

// ---- Replay ----
window.__startReplay = function startReplay() {
  const app = document.getElementById("app")!;
  app.innerHTML = `
    <div id="replay-container" style="position: relative; width: 100%; height: 100vh;">
      <div id="player-target"></div>
      <div id="annotator-overlay" style="position: absolute; inset: 0; pointer-events: none; z-index: 100;"></div>
    </div>
  `;

  const { plugin: replayPlugin, store } = createSourceReplayPlugin();
  window.__sourceStore = store;

  // Subscribe to store changes so we can observe when source data arrives
  store.onChange(() => {
    console.log(`[source-store] Updated — ${store.size()} entries`);
  });

  const playerTarget = document.getElementById("player-target")!;

  const player = new rrwebPlayer({
    target: playerTarget,
    props: {
      events: window.__rrwebEvents,
      plugins: [replayPlugin],
      width: 1024,
      height: 600,
      showController: true,
      autoPlay: true,
    },
  });

  // Wait for the player to be ready
  // rrweb-player fires "ui-update-player-state" when ready
  // But we can also just check after a short delay for the iframe
  const checkReady = setInterval(() => {
    const iframe = playerTarget.querySelector("iframe");
    if (iframe && iframe.contentDocument?.body) {
      clearInterval(checkReady);
      window.__replayReady = true;
      console.log("[replay] Ready — iframe found");
    }
  }, 100);
};

// ---- Init ----
renderRecordPage();
