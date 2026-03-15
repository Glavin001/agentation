import { describe, it, expect, vi } from "vitest";
import { createSourceReplayPlugin, createSourceMapStore, PLUGIN_NAME } from "./index";
import type { SourceNodeInfo } from "./types";

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

describe("createSourceMapStore", () => {
  it("creates a store with query methods", () => {
    const store = createSourceMapStore();
    expect(store.getByNodeId(1)).toBeNull();
    expect(store.getAll().size).toBe(0);
    expect(store.size()).toBe(0);
  });

  it("getByElement uses __sn property (object form)", () => {
    const store = createSourceMapStore();
    const storeInternal = store as any;

    storeInternal._applyFull({ 42: mockNode() });

    const el = document.createElement("div");
    (el as any).__sn = { id: 42 };

    expect(store.getByElement(el)).toEqual(mockNode());
  });

  it("getByElement uses __sn property (number form)", () => {
    const store = createSourceMapStore();
    const storeInternal = store as any;

    storeInternal._applyFull({ 99: mockNode({ tagName: "span" }) });

    const el = document.createElement("span");
    (el as any).__sn = 99;

    expect(store.getByElement(el)?.tagName).toBe("span");
  });

  it("getByElement returns null for elements without __sn", () => {
    const store = createSourceMapStore();
    const storeInternal = store as any;

    storeInternal._applyFull({ 42: mockNode() });

    const el = document.createElement("div");
    expect(store.getByElement(el)).toBeNull();
  });

  it("_applyFull replaces all entries", () => {
    const store = createSourceMapStore();
    const storeInternal = store as any;

    storeInternal._applyFull({ 1: mockNode({ tagName: "div" }) });
    expect(store.size()).toBe(1);

    storeInternal._applyFull({
      10: mockNode({ tagName: "span" }),
      11: mockNode({ tagName: "a" }),
    });
    expect(store.size()).toBe(2);
    expect(store.getByNodeId(1)).toBeNull(); // old entry removed
    expect(store.getByNodeId(10)?.tagName).toBe("span");
  });

  it("_applyIncremental adds, updates, and removes", () => {
    const store = createSourceMapStore();
    const storeInternal = store as any;

    storeInternal._applyFull({
      1: mockNode({ tagName: "div" }),
      2: mockNode({ tagName: "span" }),
    });

    storeInternal._applyIncremental(
      { 3: mockNode({ tagName: "button" }) },
      { 1: mockNode({ tagName: "section" }) },
      [2],
    );

    expect(store.getByNodeId(1)?.tagName).toBe("section");
    expect(store.getByNodeId(2)).toBeNull();
    expect(store.getByNodeId(3)?.tagName).toBe("button");
    expect(store.size()).toBe(2);
  });

  it("onChange fires on _applyFull and _applyIncremental", () => {
    const store = createSourceMapStore();
    const storeInternal = store as any;
    const cb = vi.fn();

    const unsub = store.onChange(cb);
    storeInternal._applyFull({ 1: mockNode() });
    expect(cb).toHaveBeenCalledTimes(1);

    storeInternal._applyIncremental({ 2: mockNode() }, {}, []);
    expect(cb).toHaveBeenCalledTimes(2);

    unsub();
    storeInternal._applyFull({ 3: mockNode() });
    expect(cb).toHaveBeenCalledTimes(2); // not called after unsub
  });

  it("getAll returns a copy of the map", () => {
    const store = createSourceMapStore();
    const storeInternal = store as any;

    storeInternal._applyFull({ 1: mockNode() });
    const all = store.getAll();
    expect(all.size).toBe(1);

    // Modifying the returned map doesn't affect the store
    all.delete(1);
    expect(store.getByNodeId(1)).not.toBeNull();
  });
});

describe("createSourceReplayPlugin", () => {
  it("returns a plugin and store", () => {
    const { plugin, store } = createSourceReplayPlugin();
    expect(plugin).toHaveProperty("handler");
    expect(typeof plugin.handler).toBe("function");
    expect(store).toBeDefined();
    expect(typeof store.getByNodeId).toBe("function");
  });

  it("processes full source map events", () => {
    const { plugin, store } = createSourceReplayPlugin();

    // Simulate rrweb Plugin event (type: 6)
    plugin.handler(
      {
        type: 6,
        data: {
          plugin: PLUGIN_NAME,
          payload: {
            kind: "full",
            nodes: {
              42: mockNode(),
              43: mockNode({ tagName: "input" }),
            },
          },
        },
        timestamp: Date.now(),
      },
      false,
      { replayer: {} },
    );

    expect(store.size()).toBe(2);
    expect(store.getByNodeId(42)?.componentName).toBe("Button");
    expect(store.getByNodeId(43)?.tagName).toBe("input");
  });

  it("processes incremental source map events", () => {
    const { plugin, store } = createSourceReplayPlugin();

    // Apply full first
    plugin.handler(
      {
        type: 6,
        data: {
          plugin: PLUGIN_NAME,
          payload: {
            kind: "full",
            nodes: { 1: mockNode({ tagName: "div" }) },
          },
        },
        timestamp: Date.now(),
      },
      false,
      { replayer: {} },
    );

    // Then incremental
    plugin.handler(
      {
        type: 6,
        data: {
          plugin: PLUGIN_NAME,
          payload: {
            kind: "incremental",
            added: { 2: mockNode({ tagName: "span" }) },
            updated: {},
            removed: [1],
          },
        },
        timestamp: Date.now(),
      },
      false,
      { replayer: {} },
    );

    expect(store.getByNodeId(1)).toBeNull();
    expect(store.getByNodeId(2)?.tagName).toBe("span");
  });

  it("ignores non-plugin events", () => {
    const { plugin, store } = createSourceReplayPlugin();

    // Type 2 = FullSnapshot, not a plugin event
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
      {
        type: 6,
        data: {
          plugin: "some-other-plugin@1",
          payload: { kind: "full", nodes: { 1: mockNode() } },
        },
        timestamp: Date.now(),
      },
      false,
      { replayer: {} },
    );

    expect(store.size()).toBe(0);
  });
});
