// =============================================================================
// @agentation/rrweb-annotator
// =============================================================================
//
// Adapts agentation's annotation UI to work on top of an rrweb replay player.
// Uses the SourceMapStore from @agentation/rrweb-source-replay to provide
// rich element metadata (React components, source files) from the recording.
//
// Usage:
//   import { RRWebAnnotator } from '@agentation/rrweb-annotator';
//   import { createSourceReplayPlugin } from '@agentation/rrweb-source-replay';
//
//   const { plugin, store } = createSourceReplayPlugin();
//   // ... set up rrweb player with plugin ...
//
//   <div style={{ position: 'relative' }}>
//     <div ref={playerRef} />
//     <RRWebAnnotator
//       playerRef={playerRef}
//       sourceStore={store}
//       onAnnotation={(annotation) => console.log(annotation)}
//     />
//   </div>
//
// =============================================================================

import React, { useCallback, useRef, useState } from "react";
import type { Annotation } from "agentation";
import type { SourceNodeInfo } from "@agentation/rrweb-source-replay";
import type { RRWebAnnotatorProps, HighlightedElement } from "./types";
import { useIframeFromPlayer } from "./use-iframe";
import { AnnotationOverlay } from "./overlay";

export type { RRWebAnnotatorProps, HighlightedElement } from "./types";
export type { Annotation } from "agentation";
export type { SourceMapStore, SourceNodeInfo } from "@agentation/rrweb-source-replay";
export { useIframeFromPlayer } from "./use-iframe";

let annotationCounter = 0;

function generateId(): string {
  return `rrweb-ann-${Date.now()}-${++annotationCounter}`;
}

/**
 * Build a CSS selector path for an element in the replay iframe.
 */
function buildSelectorPath(el: Element, maxDepth = 4): string {
  const parts: string[] = [];
  let current: Element | null = el;
  let depth = 0;

  while (current && depth < maxDepth) {
    let segment = current.tagName.toLowerCase();
    if (current.id) {
      segment += `#${current.id}`;
      parts.unshift(segment);
      break;
    }
    const classes = Array.from(current.classList)
      .filter((c) => !c.startsWith("rr-")) // Skip rrweb internal classes
      .slice(0, 2);
    if (classes.length) {
      segment += `.${classes.join(".")}`;
    }
    parts.unshift(segment);
    current = current.parentElement;
    depth++;
  }

  return parts.join(" > ");
}

/**
 * Format source location as a short string like "src/Button.tsx:42"
 */
function formatSourceFile(
  source: SourceNodeInfo["source"],
): string | undefined {
  if (!source) return undefined;
  let result = source.fileName;
  // Shorten absolute paths
  const srcIdx = result.indexOf("/src/");
  if (srcIdx !== -1) {
    result = result.slice(srcIdx + 1);
  }
  result += `:${source.lineNumber}`;
  if (source.columnNumber !== undefined) {
    result += `:${source.columnNumber}`;
  }
  return result;
}

/**
 * Create an Annotation from a clicked element and its source metadata.
 */
function createAnnotation(
  el: Element,
  sourceInfo: SourceNodeInfo | null,
  iframeRect: DOMRect,
  containerRect: DOMRect,
): Annotation {
  const elementRect = el.getBoundingClientRect();

  // Position relative to the overlay container (as percentage of width, px from top)
  const relX =
    ((iframeRect.left - containerRect.left + elementRect.x + elementRect.width / 2) /
      containerRect.width) *
    100;
  const relY =
    iframeRect.top - containerRect.top + elementRect.y + elementRect.height / 2;

  const tagName = el.tagName.toLowerCase();
  const elementName =
    sourceInfo?.componentName ??
    (el.id ? `${tagName}#${el.id}` : tagName);

  return {
    id: generateId(),
    x: relX,
    y: relY,
    comment: "",
    element: elementName,
    elementPath: sourceInfo?.selector ?? buildSelectorPath(el),
    timestamp: Date.now(),
    boundingBox: {
      x: elementRect.x,
      y: elementRect.y,
      width: elementRect.width,
      height: elementRect.height,
    },
    cssClasses: sourceInfo?.cssClasses?.join(" "),
    accessibility: sourceInfo?.accessibility
      ? [
          sourceInfo.accessibility.role
            ? `role=${sourceInfo.accessibility.role}`
            : null,
          sourceInfo.accessibility.label
            ? `aria-label=${sourceInfo.accessibility.label}`
            : null,
        ]
          .filter(Boolean)
          .join(", ") || undefined
      : undefined,
    reactComponents: sourceInfo?.reactComponents ?? undefined,
    sourceFile: formatSourceFile(sourceInfo?.source ?? null),
  };
}

/**
 * Translate a mouse event's page coordinates to the iframe's internal
 * coordinate space, then use elementFromPoint to find the target element.
 *
 * The iframe may be visually scaled by rrweb-player's CSS transform.
 * We compute the scale factor (visual size / internal size) and divide
 * the visual-space offset by it to get internal coordinates.
 */
function elementFromOverlayEvent(
  e: React.MouseEvent,
  iframe: HTMLIFrameElement | null,
): Element | null {
  if (!iframe?.contentDocument) return null;

  const iframeRect = iframe.getBoundingClientRect();

  // Visual-space offset from the iframe's top-left
  const visualX = e.clientX - iframeRect.left;
  const visualY = e.clientY - iframeRect.top;

  if (visualX < 0 || visualY < 0 || visualX > iframeRect.width || visualY > iframeRect.height) {
    return null;
  }

  // Convert from visual (scaled) space to iframe-internal (unscaled) space.
  // iframe.clientWidth/Height is the CSS layout size (unscaled).
  // iframeRect.width/height is the visual size after parent CSS transforms.
  const internalWidth = iframe.clientWidth;
  const internalHeight = iframe.clientHeight;
  if (internalWidth === 0 || internalHeight === 0) return null;

  const scaleX = iframeRect.width / internalWidth;
  const scaleY = iframeRect.height / internalHeight;

  const internalX = visualX / scaleX;
  const internalY = visualY / scaleY;

  return iframe.contentDocument.elementFromPoint(internalX, internalY);
}

/**
 * RRWebAnnotator — annotation overlay for rrweb replay player.
 *
 * Mount this component on top of an rrweb-player container. It renders an
 * overlay that intercepts mouse events, translates coordinates to the
 * replay iframe, and uses elementFromPoint to identify the target element.
 *
 * This approach works with sandboxed iframes (sandbox="allow-same-origin")
 * where attaching event listeners to contentDocument does not receive
 * browser-dispatched events.
 */
export function RRWebAnnotator({
  playerRef,
  sourceStore,
  onAnnotation,
  onAnnotationsClear,
  accentColor = "#3b82f6",
  showSourceInfo = true,
}: RRWebAnnotatorProps) {
  const iframe = useIframeFromPlayer(playerRef);
  const [highlight, setHighlight] = useState<HighlightedElement | null>(null);
  const [isActive, setIsActive] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Handle hover — translate coordinates and find element under cursor
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isActive) return;

      const target = elementFromOverlayEvent(e, iframe);
      if (!target || target === iframe?.contentDocument?.documentElement) {
        setHighlight(null);
        return;
      }

      const sourceInfo = sourceStore.getByElement(target);
      const elementRect = target.getBoundingClientRect();

      setHighlight({
        element: target,
        rect: {
          x: elementRect.x,
          y: elementRect.y,
          width: elementRect.width,
          height: elementRect.height,
        },
        componentName: sourceInfo?.componentName,
        sourceFile: formatSourceFile(sourceInfo?.source ?? null),
        reactComponents: sourceInfo?.reactComponents,
      });
    },
    [isActive, iframe, sourceStore],
  );

  // Handle click — create annotation from element under cursor
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isActive || !iframe || !playerRef.current) return;

      const target = elementFromOverlayEvent(e, iframe);
      if (!target) return;

      const sourceInfo = sourceStore.getByElement(target);
      const iframeRect = iframe.getBoundingClientRect();
      const containerRect = playerRef.current.getBoundingClientRect();

      const annotation = createAnnotation(
        target,
        sourceInfo,
        iframeRect,
        containerRect,
      );
      onAnnotation?.(annotation);
    },
    [isActive, iframe, playerRef, sourceStore, onAnnotation],
  );

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setHighlight(null);
  }, []);

  // Toggle button style
  const buttonStyle: React.CSSProperties = {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 20,
    padding: "6px 12px",
    fontSize: 12,
    fontFamily: "system-ui, sans-serif",
    fontWeight: 500,
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    backgroundColor: isActive ? accentColor : "rgba(0, 0, 0, 0.6)",
    color: "#fff",
    transition: "all 0.2s ease",
    pointerEvents: "auto" as const,
  };

  return (
    <div
      ref={overlayRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: isActive ? "auto" : "none",
        cursor: isActive ? "crosshair" : undefined,
      }}
      onMouseMove={isActive ? handleMouseMove : undefined}
      onClick={isActive ? handleClick : undefined}
      onMouseLeave={isActive ? handleMouseLeave : undefined}
    >
      {/* Toggle button */}
      <button
        type="button"
        style={buttonStyle}
        onClick={(e) => {
          e.stopPropagation();
          setIsActive(!isActive);
          if (isActive) setHighlight(null);
        }}
      >
        {isActive ? "Stop Annotating" : "Annotate"}
      </button>

      {/* Highlight overlay */}
      {isActive && (
        <AnnotationOverlay
          iframe={iframe}
          highlight={highlight}
          accentColor={accentColor}
          showSourceInfo={showSourceInfo}
        />
      )}
    </div>
  );
}
