// =============================================================================
// @glavin001/rrweb-source-record
// =============================================================================
//
// An rrweb RecordPlugin that captures element source metadata (React component
// names, source file locations, CSS selectors, accessibility info) during
// recording and embeds it in the rrweb event stream as Plugin events.
//
// Usage:
//   import { record } from 'rrweb';
//   import { createSourceRecordPlugin } from '@glavin001/rrweb-source-record';
//
//   const sourcePlugin = createSourceRecordPlugin();
//   record({
//     emit(event) { events.push(event); },
//     plugins: [sourcePlugin],
//   });
//
// =============================================================================

import { record } from "rrweb";
import type { ReactDetectionConfig } from "@glavin001/agentation";
import { resolveElement, shouldResolveElement } from "./resolve";
import { PLUGIN_NAME } from "./types";
import type {
  SourceNodeInfo,
  SourceMapPayload,
  SourceMapFullPayload,
  SourceMapIncrementalPayload,
} from "./types";

export type { SourceNodeInfo, SourceMapPayload, SourceMapFullPayload, SourceMapIncrementalPayload };
export { PLUGIN_NAME } from "./types";

/**
 * Options for the source record plugin.
 */
export interface SourceRecordPluginOptions {
  /** Custom filter for which elements to resolve. Default: skips script/style/meta/etc. */
  shouldResolve?: (el: Element) => boolean;
  /** Number of elements to resolve per idle callback batch. Default: 100. */
  batchSize?: number;
  /** React detection mode. Default: 'filtered'. */
  reactDetectionMode?: "all" | "filtered" | "smart";
}

/**
 * Get the rrweb mirror ID for a DOM node.
 * Uses rrweb's record.mirror to look up the serialization ID assigned during recording.
 */
function getMirrorId(node: Node): number {
  // rrweb 2.x: use record.mirror (the active recording's mirror)
  const mirror = record.mirror;
  if (mirror && typeof mirror.getId === "function") {
    const id = mirror.getId(node as any);
    if (typeof id === "number" && id !== -1) {
      return id;
    }
  }
  // Fallback: check __sn property (older rrweb versions)
  const sn = (node as any).__sn;
  if (sn && typeof sn === "object" && typeof sn.id === "number") {
    return sn.id;
  }
  if (typeof sn === "number") {
    return sn;
  }
  return -1;
}

/**
 * Build a string table from source nodes to deduplicate file paths.
 * Replaces fileName strings with indices into the table.
 */
function buildStringTable(
  nodes: Record<number, SourceNodeInfo>,
): string[] | undefined {
  const fileNames = new Set<string>();
  for (const info of Object.values(nodes)) {
    if (info.source?.fileName) {
      fileNames.add(info.source.fileName);
    }
  }
  if (fileNames.size === 0) return undefined;
  return Array.from(fileNames);
}

/**
 * Creates an rrweb RecordPlugin that captures element source metadata.
 *
 * The plugin emits Plugin events (type: 6) containing source maps that
 * associate rrweb node IDs with their source metadata (React components,
 * file locations, CSS selectors, accessibility info).
 */
export function createSourceRecordPlugin(
  options: SourceRecordPluginOptions = {},
): {
  name: string;
  observer: (
    cb: (payload: SourceMapPayload) => void,
    win: Window,
    options: SourceRecordPluginOptions,
  ) => () => void;
  options: SourceRecordPluginOptions;
} {
  const {
    shouldResolve: customShouldResolve,
    batchSize = 100,
    reactDetectionMode = "filtered",
  } = options;

  const reactConfig: ReactDetectionConfig = {
    mode: reactDetectionMode,
  };

  const filterElement = customShouldResolve ?? shouldResolveElement;

  return {
    name: PLUGIN_NAME,

    observer(emit, win) {
      let disposed = false;

      // Resolve all elements in the document and emit a full source map
      const doc = win?.document ?? document;
      function resolveFullSnapshot() {
        const nodes: Record<number, SourceNodeInfo> = {};
        const allElements = doc.querySelectorAll("*");
        const elements = Array.from(allElements);

        let index = 0;

        function processBatch() {
          if (disposed) return;

          const end = Math.min(index + batchSize, elements.length);
          for (; index < end; index++) {
            const el = elements[index];
            if (!filterElement(el)) continue;

            const nodeId = getMirrorId(el);
            if (nodeId === -1) continue;

            try {
              nodes[nodeId] = resolveElement(el, reactConfig);
            } catch {
              // Skip elements that fail to resolve
            }
          }

          if (index < elements.length) {
            // More elements to process — schedule next batch
            if (typeof requestIdleCallback !== "undefined") {
              requestIdleCallback(processBatch);
            } else {
              setTimeout(processBatch, 0);
            }
          } else {
            // Done — emit full source map
            const stringTable = buildStringTable(nodes);
            const payload: SourceMapFullPayload = {
              kind: "full",
              nodes,
              stringTable,
            };
            emit(payload);
          }
        }

        // Start processing
        if (typeof requestIdleCallback !== "undefined") {
          requestIdleCallback(processBatch);
        } else {
          setTimeout(processBatch, 0);
        }
      }

      // Observe DOM mutations for incremental updates
      let pendingAdded: Record<number, SourceNodeInfo> = {};
      let pendingRemoved: number[] = [];
      let flushScheduled = false;

      function flushIncrementalUpdate() {
        flushScheduled = false;
        if (disposed) return;

        const hasChanges =
          Object.keys(pendingAdded).length > 0 || pendingRemoved.length > 0;
        if (!hasChanges) return;

        const payload: SourceMapIncrementalPayload = {
          kind: "incremental",
          added: pendingAdded,
          updated: {},
          removed: pendingRemoved,
        };
        emit(payload);

        pendingAdded = {};
        pendingRemoved = [];
      }

      function scheduleFlush() {
        if (flushScheduled) return;
        flushScheduled = true;
        queueMicrotask(flushIncrementalUpdate);
      }

      const mutationObserver = new MutationObserver((mutations) => {
        if (disposed) return;

        for (const mutation of mutations) {
          // Handle added nodes
          mutation.addedNodes.forEach((node) => {
            if (!(node instanceof Element)) return;
            if (!filterElement(node)) return;

            const nodeId = getMirrorId(node);
            if (nodeId === -1) return;

            try {
              pendingAdded[nodeId] = resolveElement(node, reactConfig);
            } catch {
              // Skip
            }

            // Also resolve children of added subtrees
            const children = node.querySelectorAll("*");
            children.forEach((child) => {
              if (!filterElement(child)) return;
              const childId = getMirrorId(child);
              if (childId === -1) return;
              try {
                pendingAdded[childId] = resolveElement(child, reactConfig);
              } catch {
                // Skip
              }
            });
          });

          // Handle removed nodes
          mutation.removedNodes.forEach((node) => {
            if (!(node instanceof Element)) return;
            const nodeId = getMirrorId(node);
            if (nodeId !== -1) {
              pendingRemoved.push(nodeId);
            }
            // Also collect IDs from removed subtree children
            if (node instanceof Element) {
              const children = node.querySelectorAll("*");
              children.forEach((child) => {
                const childId = getMirrorId(child);
                if (childId !== -1) {
                  pendingRemoved.push(childId);
                }
              });
            }
          });
        }

        scheduleFlush();
      });

      // Start observing mutations
      if (doc.body) {
        mutationObserver.observe(doc.body, {
          childList: true,
          subtree: true,
        });
      }

      // Run initial full snapshot resolution
      // Delay slightly to ensure rrweb has serialized the DOM and assigned __sn IDs
      setTimeout(resolveFullSnapshot, 0);

      // Return cleanup function
      return () => {
        disposed = true;
        mutationObserver.disconnect();
      };
    },

    options,
  };
}
