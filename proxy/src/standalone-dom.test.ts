import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { JSDOM } from "jsdom";

const BUNDLE_PATH = path.resolve(__dirname, "../dist/standalone.global.js");

function createDomWithBundle(extraHeadHtml = ""): { dom: JSDOM; errors: string[]; ready: Promise<void> } {
  const code = fs.readFileSync(BUNDLE_PATH, "utf-8");
  const errors: string[] = [];

  const dom = new JSDOM(
    `<!DOCTYPE html><html><head>${extraHeadHtml}</head><body><h1>Test</h1></body></html>`,
    {
      runScripts: "dangerously",
      url: "http://localhost:4748/test",
      pretendToBeVisual: true,
    },
  );

  dom.window.console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  const script = dom.window.document.createElement("script");
  script.dataset.endpoint = "http://localhost:4747";
  Object.defineProperty(dom.window.document, "currentScript", {
    value: script,
    writable: false,
  });

  try {
    dom.window.eval(code);
  } catch (e) {
    errors.push(`eval error: ${e}`);
  }

  const ready = new Promise<void>((resolve) => setTimeout(resolve, 100));
  return { dom, errors, ready };
}

describe("standalone bundle DOM injection", () => {
  let dom: JSDOM;
  let errors: string[];

  beforeAll(async () => {
    const result = createDomWithBundle();
    dom = result.dom;
    errors = result.errors;
    await result.ready;
  });

  it("does not throw errors during execution", () => {
    const criticalErrors = errors.filter(
      (e) => !e.includes("requestAnimationFrame") && !e.includes("fetch"),
    );
    expect(criticalErrors).toEqual([]);
  });

  it("injects toolbar CSS style element into head", () => {
    const styleEl = dom.window.document.getElementById(
      "feedback-tool-styles-page-toolbar-css-styles",
    );
    expect(styleEl).not.toBeNull();
    expect(styleEl?.tagName.toLowerCase()).toBe("style");
  });

  it("toolbar style element contains actual CSS rules", () => {
    const styleEl = dom.window.document.getElementById(
      "feedback-tool-styles-page-toolbar-css-styles",
    );
    const css = styleEl?.textContent ?? "";
    expect(css.length).toBeGreaterThan(1000);
    expect(css).toContain("border-radius");
    expect(css).toContain("background");
    expect(css).toContain("z-index");
  });

  it("injects popup CSS style element into head", () => {
    const styleEl = dom.window.document.getElementById(
      "feedback-tool-styles-annotation-popup-css-styles",
    );
    expect(styleEl).not.toBeNull();
  });

  it("creates the agentation root container", () => {
    const container = dom.window.document.getElementById("__agentation-root");
    expect(container).not.toBeNull();
  });

  it("does not pollute window.React", () => {
    expect((dom.window as unknown as Record<string, unknown>).React).toBeUndefined();
  });
});

describe("standalone CSS isolation from host page styles", () => {
  let dom: JSDOM;

  beforeAll(async () => {
    const hostStyles = `<style>
      button { padding: 8px 16px; border: 1px solid #333; font-size: 24px; }
      * { box-sizing: border-box; }
      div { margin: 10px; }
    </style>`;
    const result = createDomWithBundle(hostStyles);
    dom = result.dom;
    await result.ready;
  });

  it("library CSS includes defensive box-sizing reset for toolbar descendants", () => {
    const toolbarStyle = dom.window.document.getElementById(
      "feedback-tool-styles-page-toolbar-css-styles",
    );
    const css = toolbarStyle?.textContent ?? "";
    expect(css).toContain("box-sizing");
  });

  it("library CSS includes scoped button reset using :where()", () => {
    const toolbarStyle = dom.window.document.getElementById(
      "feedback-tool-styles-page-toolbar-css-styles",
    );
    const css = toolbarStyle?.textContent ?? "";
    expect(css).toContain("font: inherit");
  });

  it("library CSS includes defensive font-size on toolbar root", () => {
    const toolbarStyle = dom.window.document.getElementById(
      "feedback-tool-styles-page-toolbar-css-styles",
    );
    const css = toolbarStyle?.textContent ?? "";
    expect(css).toContain("font-size: 14px");
  });

  it("popup CSS includes scoped button reset", () => {
    const popupStyle = dom.window.document.getElementById(
      "feedback-tool-styles-annotation-popup-css-styles",
    );
    const css = popupStyle?.textContent ?? "";
    expect(css).toContain("font: inherit");
    expect(css).toContain("box-sizing");
  });

  it("does not inject a separate reset style element (isolation is in the library)", () => {
    const resetEl = dom.window.document.getElementById("__agentation-reset");
    expect(resetEl).toBeNull();
  });
});
