import { describe, it, expect, vi } from "vitest";
import { createSourceReplayPlugin, createSourceMapStore, PLUGIN_NAME } from "./index";
import { createSourceRecordPlugin } from "@glavin001/rrweb-source-record";
import type { SourceNodeInfo, SourceMapPayload } from "./types";

// Mock agentation (transitive dep via rrweb-source-record)
vi.mock("@glavin001/agentation", () => ({
  identifyElement: (el: HTMLElement) => el.tagName.toLowerCase(),
  getElementPath: (el: HTMLElement) => el.tagName.toLowerCase(),
  getElementClasses: (el: HTMLElement) => el.className || "",
  getAccessibilityInfo: () => "None",
  getReactComponentName: () => ({ components: [], path: "" }),
  getSourceLocation: () => ({ found: false, source: null }),
}));

const mockNode = (overrides?: Partial<SourceNodeInfo>): SourceNodeInfo => ({
  tagName: "button",
  componentName: "Button",
  source: {
    fileName: "/src/components/Button.tsx",
    lineNumber: 42,
    columnNumber: 5,
  },
  reactComponents: "<App> <Dashboard> <Button>",
  selector: "main > div > button",
  cssClasses: ["btn", "btn-primary"],
  accessibility: { role: "button", label: "Submit" },
  ...overrides,
});

/** Helper: create an rrweb Plugin event (type 6) */
function pluginEvent(payload: any, pluginName = PLUGIN_NAME) {
  return {
    type: 6, // EventType.Plugin
    data: { plugin: pluginName, payload },
    timestamp: Date.now(),
  };
}

describe("createSourceMapStore", () => {
  it("starts empty", () => {
    const store = createSourceMapStore();
    expect(store.getByNodeId(1)).toBeNull();
    expect(store.getAll().size).toBe(0);
    expect(store.size()).toBe(0);
  });

  describe("getByElement with __sn", () => {
    it("resolves from __sn object form { id: number }", () => {
      const store = createSourceMapStore();
      (store as any)._applyFull({ 42: mockNode() });

      const el = document.createElement("div");
      (el as any).__sn = { id: 42 };
      expect(store.getByElement(el)).toEqual(mockNode());
    });

    it("resolves from __sn number form", () => {
      const store = createSourceMapStore();
      (store as any)._applyFull({ 99: mockNode({ tagName: "span" }) });

      const el = document.createElement("span");
      (el as any).__sn = 99;
      expect(store.getByElement(el)?.tagName).toBe("span");
    });

    it("returns null for elements without __sn", () => {
      const store = createSourceMapStore();
      (store as any)._applyFull({ 42: mockNode() });
      expect(store.getByElement(document.createElement("div"))).toBeNull();
    });

    it("returns null for __sn = -1", () => {
      const store = createSourceMapStore();
      (store as any)._applyFull({ 42: mockNode() });

      const el = document.createElement("div");
      (el as any).__sn = { id: -1 };
      expect(store.getByElement(el)).toBeNull();
    });
  });

  it("_applyFull replaces all entries", () => {
    const store = createSourceMapStore();
    const s = store as any;
    s._applyFull({ 1: mockNode({ tagName: "div" }) });
    expect(store.size()).toBe(1);

    s._applyFull({ 10: mockNode({ tagName: "span" }), 11: mockNode({ tagName: "a" }) });
    expect(store.size()).toBe(2);
    expect(store.getByNodeId(1)).toBeNull();
    expect(store.getByNodeId(10)?.tagName).toBe("span");
  });

  it("_applyIncremental adds, updates, and removes", () => {
    const store = createSourceMapStore();
    const s = store as any;
    s._applyFull({ 1: mockNode({ tagName: "div" }), 2: mockNode({ tagName: "span" }) });

    s._applyIncremental(
      { 3: mockNode({ tagName: "button" }) },
      { 1: mockNode({ tagName: "section" }) },
      [2],
    );

    expect(store.getByNodeId(1)?.tagName).toBe("section");
    expect(store.getByNodeId(2)).toBeNull();
    expect(store.getByNodeId(3)?.tagName).toBe("button");
    expect(store.size()).toBe(2);
  });

  it("onChange fires and unsubscribes correctly", () => {
    const store = createSourceMapStore();
    const s = store as any;
    const cb = vi.fn();

    const unsub = store.onChange(cb);
    s._applyFull({ 1: mockNode() });
    expect(cb).toHaveBeenCalledTimes(1);

    s._applyIncremental({ 2: mockNode() }, {}, []);
    expect(cb).toHaveBeenCalledTimes(2);

    unsub();
    s._applyFull({ 3: mockNode() });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("getAll returns a defensive copy", () => {
    const store = createSourceMapStore();
    (store as any)._applyFull({ 1: mockNode() });

    const copy = store.getAll();
    copy.delete(1);
    expect(store.getByNodeId(1)).not.toBeNull();
  });
});

describe("createSourceReplayPlugin", () => {
  it("returns a plugin with handler and a store", () => {
    const { plugin, store } = createSourceReplayPlugin();
    expect(typeof plugin.handler).toBe("function");
    expect(typeof store.getByNodeId).toBe("function");
  });

  it("processes full source map events", () => {
    const { plugin, store } = createSourceReplayPlugin();

    plugin.handler(
      pluginEvent({ kind: "full", nodes: { 42: mockNode(), 43: mockNode({ tagName: "input" }) } }),
      false,
      { replayer: {} },
    );

    expect(store.size()).toBe(2);
    expect(store.getByNodeId(42)?.componentName).toBe("Button");
    expect(store.getByNodeId(43)?.tagName).toBe("input");
  });

  it("processes incremental source map events", () => {
    const { plugin, store } = createSourceReplayPlugin();

    plugin.handler(
      pluginEvent({ kind: "full", nodes: { 1: mockNode({ tagName: "div" }) } }),
      false,
      { replayer: {} },
    );

    plugin.handler(
      pluginEvent({
        kind: "incremental",
        added: { 2: mockNode({ tagName: "span" }) },
        updated: {},
        removed: [1],
      }),
      false,
      { replayer: {} },
    );

    expect(store.getByNodeId(1)).toBeNull();
    expect(store.getByNodeId(2)?.tagName).toBe("span");
  });

  it("ignores non-plugin events (type != 6)", () => {
    const { plugin, store } = createSourceReplayPlugin();
    plugin.handler(
      { type: 2, data: {}, timestamp: Date.now() },
      false,
      { replayer: {} },
    );
    expect(store.size()).toBe(0);
  });

  it("ignores events from other plugins", () => {
    const { plugin, store } = createSourceReplayPlugin();
    plugin.handler(
      pluginEvent({ kind: "full", nodes: { 1: mockNode() } }, "other-plugin@1"),
      false,
      { replayer: {} },
    );
    expect(store.size()).toBe(0);
  });

  it("ignores events with missing payload", () => {
    const { plugin, store } = createSourceReplayPlugin();
    plugin.handler(
      { type: 6, data: { plugin: PLUGIN_NAME }, timestamp: Date.now() },
      false,
      { replayer: {} },
    );
    expect(store.size()).toBe(0);
  });

  it("store.getByElement works with replay DOM nodes", () => {
    const { plugin, store } = createSourceReplayPlugin();

    plugin.handler(
      pluginEvent({ kind: "full", nodes: { 50: mockNode({ tagName: "button" }) } }),
      false,
      { replayer: {} },
    );

    // Simulate an element in the replay iframe DOM with __sn set by rrweb rebuilder
    const replayEl = document.createElement("button");
    (replayEl as any).__sn = { id: 50, type: 2, tagName: "button" };

    const info = store.getByElement(replayEl);
    expect(info).not.toBeNull();
    expect(info!.tagName).toBe("button");
  });
});

describe("integration: record + replay round-trip", () => {
  it("replay plugin processes events emitted by the real record plugin", () => {
    // Step 1: Use the real record plugin to emit source maps
    const sourcePlugin = createSourceRecordPlugin();
    const emittedPayloads: SourceMapPayload[] = [];

    const emit = (payload: SourceMapPayload) => {
      emittedPayloads.push(payload);
    };

    // Create elements with __sn (as rrweb would set during recording)
    const btn = document.createElement("button");
    btn.className = "submit";
    (btn as any).__sn = { id: 50 };
    document.body.appendChild(btn);

    const cleanup = sourcePlugin.observer(emit, window, sourcePlugin.options);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        cleanup();
        document.body.removeChild(btn);

        expect(emittedPayloads.length).toBeGreaterThan(0);

        // Step 2: Feed real payloads through the replay plugin
        const { plugin: replayPlugin, store } = createSourceReplayPlugin();

        for (const payload of emittedPayloads) {
          replayPlugin.handler(
            pluginEvent(payload),
            false,
            { replayer: {} },
          );
        }

        // Step 3: Verify the store has our button's metadata
        expect(store.size()).toBeGreaterThan(0);
        const btnInfo = store.getByNodeId(50);
        expect(btnInfo).not.toBeNull();
        expect(btnInfo!.tagName).toBe("button");

        resolve();
      }, 100);
    });
  });
});
