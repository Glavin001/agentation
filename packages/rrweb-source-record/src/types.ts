// =============================================================================
// Shared types for rrweb source map plugin events
// =============================================================================

/**
 * Source metadata for a single DOM element, captured during recording.
 */
export interface SourceNodeInfo {
  /** HTML tag name (lowercase) */
  tagName: string;
  /** React component name (innermost), or null if not in a React tree */
  componentName: string | null;
  /** Source file location from React _debugSource (dev mode only) */
  source: {
    fileName: string;
    lineNumber: number;
    columnNumber?: number;
    componentName?: string;
  } | null;
  /** React component hierarchy, e.g. "<App> <Dashboard> <Button>" */
  reactComponents: string | null;
  /** CSS selector path, e.g. "main > section > div.card" */
  selector: string;
  /** CSS class names on the element */
  cssClasses: string[];
  /** Accessibility attributes */
  accessibility: {
    role: string | null;
    label: string | null;
  } | null;
}

/**
 * Full source map payload — emitted after each rrweb full snapshot.
 * Maps rrweb node IDs to their source metadata.
 */
export interface SourceMapFullPayload {
  kind: "full";
  /** Map of rrweb node ID → source metadata */
  nodes: Record<number, SourceNodeInfo>;
  /** Deduplicated file paths (nodes reference by index) */
  stringTable?: string[];
}

/**
 * Incremental source map update — emitted after DOM mutations.
 */
export interface SourceMapIncrementalPayload {
  kind: "incremental";
  /** Newly added nodes */
  added: Record<number, SourceNodeInfo>;
  /** Updated nodes (re-rendered React components) */
  updated: Record<number, SourceNodeInfo>;
  /** Removed node IDs */
  removed: number[];
}

/** Union of all source map payload types */
export type SourceMapPayload =
  | SourceMapFullPayload
  | SourceMapIncrementalPayload;

/** Plugin event identifier used in rrweb type:6 events */
export const PLUGIN_NAME = "agentation/source-map@1";
