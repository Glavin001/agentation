import React, { useCallback, useEffect, useRef, useState } from "react";
import type { HighlightedElement } from "./types";

interface AnnotationOverlayProps {
  /** The rrweb replay iframe */
  iframe: HTMLIFrameElement | null;
  /** Currently highlighted element info */
  highlight: HighlightedElement | null;
  /** Accent color for highlights */
  accentColor: string;
  /** Whether to show source info tooltip */
  showSourceInfo: boolean;
}

/**
 * Translates a bounding rect from the iframe's internal coordinate space
 * to the overlay's coordinate space (relative to the overlay container).
 *
 * rrweb-player's .replayer-wrapper applies a CSS transform to scale the
 * recorded content to fit the player dimensions. element.getBoundingClientRect()
 * inside the iframe returns coordinates in the iframe's internal (unscaled)
 * space, while the iframe's own getBoundingClientRect() returns its visual
 * (scaled) position in page space. We compute the scale factor to bridge
 * these two coordinate systems.
 */
function translateRect(
  iframe: HTMLIFrameElement,
  elementRect: DOMRect,
  containerRect: DOMRect,
): { x: number; y: number; width: number; height: number } | null {
  const iframeRect = iframe.getBoundingClientRect();

  // Compute scale factor: visual (page) size vs internal (CSS) size.
  // iframe.clientWidth is the iframe's CSS layout width (unscaled).
  // iframeRect.width is the visual width after any parent CSS transforms.
  const internalWidth = iframe.clientWidth;
  const internalHeight = iframe.clientHeight;
  if (internalWidth === 0 || internalHeight === 0) return null;

  const scaleX = iframeRect.width / internalWidth;
  const scaleY = iframeRect.height / internalHeight;

  return {
    x: iframeRect.left - containerRect.left + elementRect.x * scaleX,
    y: iframeRect.top - containerRect.top + elementRect.y * scaleY,
    width: elementRect.width * scaleX,
    height: elementRect.height * scaleY,
  };
}

/**
 * Overlay component that renders highlight boxes and tooltips on top of
 * the rrweb replay iframe.
 */
export function AnnotationOverlay({
  iframe,
  highlight,
  accentColor,
  showSourceInfo,
}: AnnotationOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Recalculate highlight position when highlight changes or window resizes
  const updateRect = useCallback(() => {
    if (!highlight || !iframe || !overlayRef.current) {
      setRect(null);
      return;
    }

    const containerRect = overlayRef.current.getBoundingClientRect();

    try {
      const elementRect = highlight.element.getBoundingClientRect();
      setRect(translateRect(iframe, elementRect, containerRect));
    } catch {
      setRect(null);
    }
  }, [highlight, iframe]);

  useEffect(() => {
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect);
    };
  }, [updateRect]);

  return (
    <div
      ref={overlayRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
        overflow: "hidden",
      }}
    >
      {/* Highlight box */}
      {rect && (
        <>
          <div
            style={{
              position: "absolute",
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              border: `2px solid ${accentColor}`,
              backgroundColor: `${accentColor}1a`,
              borderRadius: 3,
              transition: "all 0.15s ease",
            }}
          />

          {/* Tooltip with source info */}
          {showSourceInfo && highlight && (highlight.componentName || highlight.sourceFile) && (
            <div
              style={{
                position: "absolute",
                left: rect.x,
                top: Math.max(0, rect.y - 28),
                backgroundColor: "rgba(0, 0, 0, 0.85)",
                color: "#fff",
                fontSize: 11,
                fontFamily: "monospace",
                padding: "3px 8px",
                borderRadius: 4,
                whiteSpace: "nowrap",
                maxWidth: 400,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {highlight.componentName && (
                <span style={{ color: "#93c5fd" }}>
                  {"<"}
                  {highlight.componentName}
                  {">"}
                </span>
              )}
              {highlight.componentName && highlight.sourceFile && (
                <span style={{ color: "#6b7280" }}>{" \u2022 "}</span>
              )}
              {highlight.sourceFile && (
                <span style={{ color: "#a5b4fc" }}>{highlight.sourceFile}</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
