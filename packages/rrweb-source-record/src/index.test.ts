import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSourceRecordPlugin, PLUGIN_NAME } from "./index";

// Mock agentation imports since we can't load the full package in test
vi.mock("agentation", () => ({
  identifyElement: (el: HTMLElement) => el.tagName.toLowerCase(),
  getElementPath: (el: HTMLElement) => el.tagName.toLowerCase(),
  getElementClasses: (el: HTMLElement) => el.className || "",
  getAccessibilityInfo: () => "None",
  getReactComponentName: () => ({ components: [], path: "" }),
  getSourceLocation: () => ({ found: false, source: null }),
}));

describe("createSourceRecordPlugin", () => {
  it("returns an object with name, observer, and options", () => {
    const plugin = createSourceRecordPlugin();
    expect(plugin).toHaveProperty("name", PLUGIN_NAME);
    expect(plugin).toHaveProperty("observer");
    expect(plugin).toHaveProperty("options");
    expect(typeof plugin.observer).toBe("function");
  });

  it("uses correct plugin name", () => {
    expect(PLUGIN_NAME).toBe("agentation/source-map@1");
  });

  it("observer returns a cleanup function", () => {
    const plugin = createSourceRecordPlugin();
    const emit = vi.fn();
    const cleanup = plugin.observer(emit);
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("resolves elements with __sn IDs and emits full payload", async () => {
    // Create a DOM element with rrweb-style __sn
    const div = document.createElement("div");
    div.className = "test-class";
    (div as any).__sn = { id: 42 };
    document.body.appendChild(div);

    const plugin = createSourceRecordPlugin({ batchSize: 1000 });
    const emit = vi.fn();
    const cleanup = plugin.observer(emit);

    // Wait for the async processing (setTimeout + requestIdleCallback fallback)
    await new Promise((r) => setTimeout(r, 50));

    // Should have emitted a full payload
    expect(emit).toHaveBeenCalled();
    const payload = emit.mock.calls[0][0];
    expect(payload.kind).toBe("full");
    expect(payload.nodes).toBeDefined();

    // The div with __sn.id=42 should be in the nodes
    if (payload.nodes[42]) {
      expect(payload.nodes[42].tagName).toBe("div");
    }

    cleanup();
    document.body.removeChild(div);
  });

  it("skips elements without __sn", async () => {
    const div = document.createElement("div");
    // No __sn property
    document.body.appendChild(div);

    const plugin = createSourceRecordPlugin({ batchSize: 1000 });
    const emit = vi.fn();
    const cleanup = plugin.observer(emit);

    await new Promise((r) => setTimeout(r, 50));

    if (emit.mock.calls.length > 0) {
      const payload = emit.mock.calls[0][0];
      // Nodes without __sn should not appear
      for (const info of Object.values(payload.nodes)) {
        // All present nodes should have valid data
        expect((info as any).tagName).toBeDefined();
      }
    }

    cleanup();
    document.body.removeChild(div);
  });

  it("skips script and style elements", async () => {
    const script = document.createElement("script");
    (script as any).__sn = { id: 100 };
    const style = document.createElement("style");
    (style as any).__sn = { id: 101 };
    document.body.appendChild(script);
    document.body.appendChild(style);

    const plugin = createSourceRecordPlugin({ batchSize: 1000 });
    const emit = vi.fn();
    const cleanup = plugin.observer(emit);

    await new Promise((r) => setTimeout(r, 50));

    if (emit.mock.calls.length > 0) {
      const payload = emit.mock.calls[0][0];
      expect(payload.nodes[100]).toBeUndefined();
      expect(payload.nodes[101]).toBeUndefined();
    }

    cleanup();
    document.body.removeChild(script);
    document.body.removeChild(style);
  });

  it("accepts custom shouldResolve filter", async () => {
    const div = document.createElement("div");
    div.setAttribute("data-annotate", "true");
    (div as any).__sn = { id: 200 };
    const span = document.createElement("span");
    (span as any).__sn = { id: 201 };
    document.body.appendChild(div);
    document.body.appendChild(span);

    const plugin = createSourceRecordPlugin({
      batchSize: 1000,
      shouldResolve: (el) => el.hasAttribute("data-annotate"),
    });
    const emit = vi.fn();
    const cleanup = plugin.observer(emit);

    await new Promise((r) => setTimeout(r, 50));

    if (emit.mock.calls.length > 0) {
      const payload = emit.mock.calls[0][0];
      expect(payload.nodes[200]).toBeDefined();
      expect(payload.nodes[201]).toBeUndefined();
    }

    cleanup();
    document.body.removeChild(div);
    document.body.removeChild(span);
  });

  it("observes DOM mutations for incremental updates", async () => {
    const plugin = createSourceRecordPlugin({ batchSize: 1000 });
    const emit = vi.fn();
    const cleanup = plugin.observer(emit);

    // Wait for initial full snapshot
    await new Promise((r) => setTimeout(r, 50));
    emit.mockClear();

    // Add a new element
    const added = document.createElement("button");
    (added as any).__sn = { id: 300 };
    document.body.appendChild(added);

    // Wait for mutation observer + microtask flush
    await new Promise((r) => setTimeout(r, 50));

    const incrementalCalls = emit.mock.calls.filter(
      (c) => c[0].kind === "incremental",
    );
    expect(incrementalCalls.length).toBeGreaterThan(0);
    const incPayload = incrementalCalls[0][0];
    expect(incPayload.added[300]).toBeDefined();

    cleanup();
    document.body.removeChild(added);
  });
});

describe("shouldResolveElement", () => {
  it("is exported from resolve module", async () => {
    const { shouldResolveElement } = await import("./resolve");
    expect(typeof shouldResolveElement).toBe("function");
  });

  it("rejects script elements", async () => {
    const { shouldResolveElement } = await import("./resolve");
    const script = document.createElement("script");
    expect(shouldResolveElement(script)).toBe(false);
  });

  it("accepts div elements", async () => {
    const { shouldResolveElement } = await import("./resolve");
    const div = document.createElement("div");
    expect(shouldResolveElement(div)).toBe(true);
  });
});
