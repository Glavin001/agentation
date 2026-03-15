// =============================================================================
// @agentation/rrweb-annotator
// =============================================================================
//
// Adapts agentation's annotation UI to work on top of an rrweb replay player.
// Uses the SourceMapStore from @agentation/rrweb-source-replay to provide
// rich element metadata (React components, source files) from the recording.
//
// Leverages agentation's AnnotationPopupCSS, identifyElement, computed styles,
// accessibility info, and full path utilities for a rich annotation experience
// matching the agentation toolbar's annotation quality.
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
import {
  AnnotationPopupCSS,
  identifyElement,
  getElementPath,
  getAccessibilityInfo,
  getFullElementPath,
  getNearbyElements,
  getDetailedComputedStyles,
  getElementClasses,
  getNearbyText,
} from "agentation";
import type { AnnotationPopupCSSHandle } from "agentation";
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
 * Format source location as a short string like "src/Button.tsx:42"
 */
function formatSourceFile(
  source: SourceNodeInfo["source"],
): string | undefined {
  if (!source) return undefined;
  let result = source.fileName;
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

/** State for the pending annotation popup */
interface PendingAnnotation {
  element: Element;
  elementName: string;
  sourceInfo: SourceNodeInfo | null;
  iframeRect: DOMRect;
  containerRect: DOMRect;
  /** Position for the popup in overlay coordinates */
  popupPosition: { left: number; top: number };
  /** Computed styles from agentation's utility */
  computedStyles?: Record<string, string>;
}

/**
 * Create a full Annotation from a clicked element using agentation's utilities.
 */
function createAnnotation(
  el: Element,
  comment: string,
  sourceInfo: SourceNodeInfo | null,
  iframeRect: DOMRect,
  containerRect: DOMRect,
): Annotation {
  const elementRect = el.getBoundingClientRect();
  const htmlEl = el as HTMLElement;

  // Position relative to the overlay container
  const relX =
    ((iframeRect.left - containerRect.left + elementRect.x + elementRect.width / 2) /
      containerRect.width) *
    100;
  const relY =
    iframeRect.top - containerRect.top + elementRect.y + elementRect.height / 2;

  // Use agentation's identifyElement for rich element naming
  const identified = identifyElement(htmlEl);

  // Use source info component name if available, otherwise agentation's identification
  const elementName =
    sourceInfo?.componentName ??
    identified.name;

  return {
    id: generateId(),
    x: relX,
    y: relY,
    comment,
    element: elementName,
    elementPath: sourceInfo?.selector ?? identified.path,
    timestamp: Date.now(),
    boundingBox: {
      x: elementRect.x,
      y: elementRect.y,
      width: elementRect.width,
      height: elementRect.height,
    },
    // Use agentation utilities for rich metadata
    cssClasses: sourceInfo?.cssClasses?.join(" ") || getElementClasses(htmlEl) || undefined,
    accessibility: getAccessibilityInfo(htmlEl) || undefined,
    fullPath: getFullElementPath(htmlEl) || undefined,
    nearbyElements: getNearbyElements(htmlEl) || undefined,
    nearbyText: getNearbyText(htmlEl) || undefined,
    computedStyles: (() => {
      const styles = getDetailedComputedStyles(htmlEl);
      return Object.keys(styles).length > 0
        ? Object.entries(styles).map(([k, v]) => `${k}: ${v}`).join("; ")
        : undefined;
    })(),
    reactComponents: sourceInfo?.reactComponents ?? undefined,
    sourceFile: formatSourceFile(sourceInfo?.source ?? null),
  };
}

/**
 * Translate a mouse event's page coordinates to the iframe's internal
 * coordinate space, then use elementFromPoint to find the target element.
 */
function elementFromOverlayEvent(
  e: React.MouseEvent,
  iframe: HTMLIFrameElement | null,
): Element | null {
  if (!iframe?.contentDocument) return null;

  const iframeRect = iframe.getBoundingClientRect();
  const visualX = e.clientX - iframeRect.left;
  const visualY = e.clientY - iframeRect.top;

  if (visualX < 0 || visualY < 0 || visualX > iframeRect.width || visualY > iframeRect.height) {
    return null;
  }

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
 * Compute the visual position of an element's bounding box in overlay space,
 * accounting for the iframe's CSS transform scale.
 */
function getVisualRect(
  el: Element,
  iframe: HTMLIFrameElement,
  containerRect: DOMRect,
): { left: number; top: number; width: number; height: number } {
  const elementRect = el.getBoundingClientRect();
  const iframeRect = iframe.getBoundingClientRect();
  const scaleX = iframeRect.width / iframe.clientWidth;
  const scaleY = iframeRect.height / iframe.clientHeight;

  return {
    left: iframeRect.left - containerRect.left + elementRect.x * scaleX,
    top: iframeRect.top - containerRect.top + elementRect.y * scaleY,
    width: elementRect.width * scaleX,
    height: elementRect.height * scaleY,
  };
}

/**
 * RRWebAnnotator — annotation overlay for rrweb replay player.
 *
 * Uses agentation's AnnotationPopupCSS for the annotation UI and
 * agentation's element identification utilities for rich metadata.
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
  const [pending, setPending] = useState<PendingAnnotation | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<AnnotationPopupCSSHandle>(null);

  // Handle hover — translate coordinates and find element under cursor
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isActive || pending) return; // Don't highlight while popup is open

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
    [isActive, iframe, sourceStore, pending],
  );

  // Handle click — open annotation popup using agentation's AnnotationPopupCSS
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isActive || !iframe || !playerRef.current) return;

      // If popup is open and click is outside it, shake or close
      if (pending) {
        popupRef.current?.shake();
        return;
      }

      const target = elementFromOverlayEvent(e, iframe);
      if (!target) return;

      const sourceInfo = sourceStore.getByElement(target);
      const iframeRect = iframe.getBoundingClientRect();
      const containerRect = playerRef.current.getBoundingClientRect();

      // Use agentation's identifyElement for the popup header
      const identified = identifyElement(target as HTMLElement);
      const elementName = sourceInfo?.componentName
        ? `<${sourceInfo.componentName}>`
        : identified.name;

      // Compute popup position in overlay coordinates (below the element)
      const visualRect = getVisualRect(target, iframe, containerRect);
      const popupLeft = Math.min(
        visualRect.left,
        containerRect.width - 320, // popup max width ~300px
      );
      const popupTop = visualRect.top + visualRect.height + 8;

      // Get computed styles using agentation's utility
      const computedStyles = getDetailedComputedStyles(target as HTMLElement);

      setPending({
        element: target,
        elementName,
        sourceInfo,
        iframeRect,
        containerRect,
        popupPosition: { left: Math.max(8, popupLeft), top: popupTop },
        computedStyles: Object.keys(computedStyles).length > 0 ? computedStyles : undefined,
      });
    },
    [isActive, iframe, playerRef, sourceStore, pending],
  );

  // Handle annotation submission from popup
  const handlePopupSubmit = useCallback(
    (comment: string) => {
      if (!pending) return;

      const annotation = createAnnotation(
        pending.element,
        comment,
        pending.sourceInfo,
        pending.iframeRect,
        pending.containerRect,
      );
      onAnnotation?.(annotation);
      setPending(null);
      setHighlight(null);
    },
    [pending, onAnnotation],
  );

  // Handle popup cancel
  const handlePopupCancel = useCallback(() => {
    setPending(null);
  }, []);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    if (!pending) setHighlight(null);
  }, [pending]);

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
        cursor: isActive && !pending ? "crosshair" : undefined,
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
          if (isActive) {
            setHighlight(null);
            setPending(null);
          }
        }}
      >
        {isActive ? "Stop Annotating" : "Annotate"}
      </button>

      {/* Highlight overlay */}
      {isActive && !pending && (
        <AnnotationOverlay
          iframe={iframe}
          highlight={highlight}
          accentColor={accentColor}
          showSourceInfo={showSourceInfo}
        />
      )}

      {/* Agentation annotation popup */}
      {pending && (
        <div
          style={{ pointerEvents: "auto" }}
          onClick={(e) => e.stopPropagation()}
          data-annotation-popup-wrapper
        >
          <AnnotationPopupCSS
            ref={popupRef}
            element={pending.elementName}
            placeholder="What should change?"
            onSubmit={handlePopupSubmit}
            onCancel={handlePopupCancel}
            accentColor={accentColor}
            computedStyles={pending.computedStyles}
            style={{
              position: "absolute",
              left: pending.popupPosition.left,
              top: pending.popupPosition.top,
              zIndex: 30,
            }}
          />
        </div>
      )}
    </div>
  );
}
