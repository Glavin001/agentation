import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const BUNDLE_PATH = path.resolve(__dirname, "../dist/standalone.global.js");

function readBundle(): string {
  return fs.readFileSync(BUNDLE_PATH, "utf-8");
}

describe("standalone bundle", () => {
  it("exists and is non-empty", () => {
    expect(fs.existsSync(BUNDLE_PATH)).toBe(true);
    const code = readBundle();
    expect(code.length).toBeGreaterThan(1000);
  });

  it("contains toolbar CSS class name mappings", () => {
    const code = readBundle();
    expect(code).toContain("styles-module__toolbar___");
    expect(code).toContain("styles-module__toolbarContainer___");
    expect(code).toContain("styles-module__expanded___");
  });

  it("contains actual CSS rules (not just class name mappings)", () => {
    const code = readBundle();
    // The CSS should contain actual style declarations like background, border-radius, etc.
    expect(code).toContain("border-radius");
    expect(code).toContain("background");
    expect(code).toContain("position:");
    expect(code).toContain("z-index:");
  });

  it("contains style injection code for toolbar styles", () => {
    const code = readBundle();
    expect(code).toContain("feedback-tool-styles-page-toolbar-css-styles");
    expect(code).toContain("document.head.appendChild");
  });

  it("contains style injection code for popup styles", () => {
    const code = readBundle();
    expect(code).toContain("feedback-tool-styles-annotation-popup-css-styles");
  });

  it("CSS template literal is properly closed (not truncated)", () => {
    const code = readBundle();
    // Find the toolbar CSS variable definition
    const toolbarCssStart = code.indexOf("svg[fill=none]");
    expect(toolbarCssStart).toBeGreaterThan(-1);

    // The CSS should contain keyframe definitions that appear near the end
    expect(code).toContain("@keyframes styles-module__settingsPanelOut___");
    expect(code).toContain("@keyframes styles-module__toolbarEnter___");
  });

  it("does not set window.React or window.ReactDOM globals", () => {
    const code = readBundle();
    expect(code).not.toContain("window.React=");
    expect(code).not.toContain("window.ReactDOM=");
    expect(code).not.toContain("window.React =");
    expect(code).not.toContain("window.ReactDOM =");
  });
});
