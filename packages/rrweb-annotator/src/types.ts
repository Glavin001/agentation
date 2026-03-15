import type { Annotation } from "agentation";
import type { SourceMapStore } from "@agentation/rrweb-source-replay";

export type { Annotation } from "agentation";
export type { SourceMapStore, SourceNodeInfo } from "@agentation/rrweb-source-replay";

/**
 * Props for the RRWebAnnotator component.
 */
export interface RRWebAnnotatorProps {
  /** Reference to the rrweb-player container element */
  playerRef: React.RefObject<HTMLElement>;
  /** The source map store from createSourceReplayPlugin() */
  sourceStore: SourceMapStore;
  /** Called when an annotation is created */
  onAnnotation?: (annotation: Annotation) => void;
  /** Called when all annotations are cleared */
  onAnnotationsClear?: () => void;
  /** Accent color for highlight overlays (hex). Default: "#3b82f6" */
  accentColor?: string;
  /** Whether to show source info in the annotation tooltip. Default: true */
  showSourceInfo?: boolean;
}

/**
 * Highlighted element state during hover/selection.
 */
export interface HighlightedElement {
  /** The DOM element being highlighted */
  element: Element;
  /** Bounding rect relative to the overlay container */
  rect: { x: number; y: number; width: number; height: number };
  /** Source metadata (if available) */
  componentName?: string | null;
  sourceFile?: string | null;
  reactComponents?: string | null;
}
