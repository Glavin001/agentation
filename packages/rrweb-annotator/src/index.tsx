// =============================================================================
// @glavin001/rrweb-annotator
// =============================================================================
//
// Thin wrapper that renders the real <Agentation /> component on top of an
// rrweb replay player, targeting the replay iframe for annotations.
//
// Usage:
//   import { RRWebAnnotator } from '@glavin001/rrweb-annotator';
//   import { createSourceReplayPlugin } from '@glavin001/rrweb-source-replay';
//
//   const { plugin, store } = createSourceReplayPlugin();
//   // ... set up rrweb player with plugin ...
//
//   <div style={{ position: 'relative' }}>
//     <div ref={playerRef} />
//     <RRWebAnnotator
//       playerRef={playerRef}
//       sourceStore={store}
//       onAnnotationAdd={(annotation) => console.log(annotation)}
//     />
//   </div>
//
// =============================================================================

import React, { useEffect, useRef } from "react";
import { Agentation } from "@glavin001/agentation";
import type { AgentationProps } from "@glavin001/agentation";
import type { SourceMapStore } from "@glavin001/rrweb-source-replay";
import { useIframeFromPlayer } from "./use-iframe";

export type { Annotation, AgentationProps } from "@glavin001/agentation";
export type { SourceMapStore, SourceNodeInfo } from "@glavin001/rrweb-source-replay";
export { useIframeFromPlayer } from "./use-iframe";

/**
 * Props for the RRWebAnnotator component.
 *
 * Extends AgentationProps (minus targetIframe/containerRef which are wired internally)
 * and adds rrweb-specific props.
 */
export interface RRWebAnnotatorProps
  extends Omit<AgentationProps, "targetIframe" | "containerRef"> {
  /** Reference to the rrweb-player container element */
  playerRef: React.RefObject<HTMLElement>;
  /** The source map store from createSourceReplayPlugin() */
  sourceStore?: SourceMapStore;
}

/**
 * RRWebAnnotator — renders the real Agentation toolbar on top of an rrweb
 * replay player, with all annotation modes, markers, settings, and copy/export.
 *
 * This is a thin wrapper: it finds the replay iframe inside the player,
 * creates a container overlay, and passes both refs to <Agentation /> which
 * handles everything else.
 */
export function RRWebAnnotator({
  playerRef,
  sourceStore,
  ...agentationProps
}: RRWebAnnotatorProps) {
  const iframe = useIframeFromPlayer(playerRef);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Keep ref in sync with the hook's value
  useEffect(() => {
    iframeRef.current = iframe;
  }, [iframe]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 10,
        // Let Agentation manage pointer-events based on isActive state
        pointerEvents: "none",
        // transform creates a containing block for position:fixed descendants,
        // making them position relative to this container instead of the viewport.
        // This is essential for correct popup/overlay/marker positioning.
        transform: "translate(0,0)",
      }}
      data-rrweb-annotator
    >
      {iframe && (
        <Agentation
          targetIframe={iframeRef as React.RefObject<HTMLIFrameElement>}
          containerRef={containerRef as React.RefObject<HTMLElement>}
          disableStorage
          {...agentationProps}
        />
      )}
    </div>
  );
}
