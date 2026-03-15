// =============================================================================
// SourceMapStore — maintains a live lookup table of element source metadata
// =============================================================================

import type { SourceNodeInfo } from "./types";

/**
 * A queryable store of element source metadata, updated during rrweb playback.
 */
export interface SourceMapStore {
  /** Look up source metadata by rrweb node ID */
  getByNodeId(nodeId: number): SourceNodeInfo | null;

  /**
   * Look up source metadata by DOM element in the replay iframe.
   * Uses rrweb's internal `__sn` property to find the node ID.
   */
  getByElement(el: Element): SourceNodeInfo | null;

  /** Get all resolved nodes at the current playback position */
  getAll(): Map<number, SourceNodeInfo>;

  /** Get the number of entries in the store */
  size(): number;

  /** Subscribe to store changes. Returns an unsubscribe function. */
  onChange(callback: () => void): () => void;
}

/**
 * Creates a new SourceMapStore instance.
 */
export function createSourceMapStore(): SourceMapStore {
  const sourceMap = new Map<number, SourceNodeInfo>();
  const listeners = new Set<() => void>();

  function notify() {
    for (const fn of listeners) {
      try {
        fn();
      } catch {
        // Listener errors shouldn't break the store
      }
    }
  }

  return {
    getByNodeId(nodeId: number): SourceNodeInfo | null {
      return sourceMap.get(nodeId) ?? null;
    },

    getByElement(el: Element): SourceNodeInfo | null {
      // rrweb attaches __sn to serialized/reconstructed DOM nodes.
      // On record side: __sn is { id: number, ... }
      // On replay side: __sn is also { id: number, ... } (reconstructed mirror)
      const sn = (el as any).__sn;
      let nodeId: number | undefined;
      if (sn && typeof sn === "object" && typeof sn.id === "number") {
        nodeId = sn.id;
      } else if (typeof sn === "number") {
        nodeId = sn;
      }
      if (nodeId === undefined || nodeId === -1) return null;
      return sourceMap.get(nodeId) ?? null;
    },

    getAll(): Map<number, SourceNodeInfo> {
      return new Map(sourceMap);
    },

    size(): number {
      return sourceMap.size;
    },

    onChange(callback: () => void): () => void {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },

    // Internal methods accessed by the plugin (via casting)
    /** @internal */
    _applyFull(nodes: Record<number, SourceNodeInfo>) {
      sourceMap.clear();
      for (const [idStr, info] of Object.entries(nodes)) {
        sourceMap.set(Number(idStr), info);
      }
      notify();
    },

    /** @internal */
    _applyIncremental(
      added: Record<number, SourceNodeInfo>,
      updated: Record<number, SourceNodeInfo>,
      removed: number[],
    ) {
      for (const [idStr, info] of Object.entries(added)) {
        sourceMap.set(Number(idStr), info);
      }
      for (const [idStr, info] of Object.entries(updated)) {
        sourceMap.set(Number(idStr), info);
      }
      for (const id of removed) {
        sourceMap.delete(id);
      }
      notify();
    },
  } as SourceMapStore;
}
