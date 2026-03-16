// =============================================================================
// Element resolution — wraps agentation's existing utilities
// =============================================================================

import {
  identifyElement,
  getElementPath,
  getElementClasses,
  getAccessibilityInfo,
  getReactComponentName,
  getSourceLocation,
} from "@glavin001/agentation";
import type { ReactDetectionConfig } from "@glavin001/agentation";
import type { SourceNodeInfo } from "./types";

/** Tags to skip when resolving source metadata */
const SKIP_TAGS = new Set([
  "script",
  "style",
  "meta",
  "link",
  "head",
  "noscript",
  "br",
  "hr",
]);

/**
 * Check whether an element is worth resolving source metadata for.
 * Skips invisible, non-interactive, and structural-only elements.
 */
export function shouldResolveElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return false;
  // Skip text-only nodes (no children, no meaningful content)
  if (el.nodeType !== Node.ELEMENT_NODE) return false;
  return true;
}

/**
 * Parse agentation's getAccessibilityInfo string output into structured data.
 * The function returns a string like "role=button, aria-label=Submit"
 */
function parseAccessibility(
  accessibilityStr: string,
): { role: string | null; label: string | null } | null {
  if (!accessibilityStr || accessibilityStr === "None") return null;

  let role: string | null = null;
  let label: string | null = null;

  // Parse key=value pairs from the accessibility string
  const parts = accessibilityStr.split(",").map((s) => s.trim());
  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim().toLowerCase();
    const value = part.slice(eqIdx + 1).trim();
    if (key === "role") role = value;
    if (key === "aria-label" || key === "label") label = value;
  }

  if (!role && !label) return null;
  return { role, label };
}

/**
 * Resolve full source metadata for a DOM element.
 * Combines element identification, React detection, and source location.
 */
export function resolveElement(
  el: Element,
  reactConfig?: ReactDetectionConfig,
): SourceNodeInfo {
  const tagName = el.tagName.toLowerCase();

  // CSS selector path
  const selector = getElementPath(el as HTMLElement);

  // CSS classes
  const classStr = getElementClasses(el as HTMLElement);
  const cssClasses = classStr
    ? classStr
        .split(/\s+/)
        .map((c) => c.trim())
        .filter(Boolean)
    : [];

  // Accessibility info
  const accessStr = getAccessibilityInfo(el as HTMLElement);
  const accessibility = parseAccessibility(accessStr);

  // React component detection
  let componentName: string | null = null;
  let reactComponents: string | null = null;
  try {
    const reactInfo = getReactComponentName(el as HTMLElement, reactConfig);
    componentName =
      reactInfo.components.length > 0 ? reactInfo.components[0] : null;
    reactComponents = reactInfo.path;
  } catch {
    // Not a React app or element not in React tree — that's fine
  }

  // Source location (React _debugSource, dev mode only)
  let source: SourceNodeInfo["source"] = null;
  try {
    const sourceResult = getSourceLocation(el as HTMLElement);
    if (sourceResult.found && sourceResult.source) {
      source = {
        fileName: sourceResult.source.fileName,
        lineNumber: sourceResult.source.lineNumber,
        columnNumber: sourceResult.source.columnNumber,
        componentName: sourceResult.source.componentName,
      };
    }
  } catch {
    // Source location not available — that's fine
  }

  return {
    tagName,
    componentName,
    source,
    reactComponents,
    selector,
    cssClasses,
    accessibility,
  };
}
