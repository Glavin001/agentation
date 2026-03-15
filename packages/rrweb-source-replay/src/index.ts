// =============================================================================
// @agentation/rrweb-source-replay
// =============================================================================
//
// An rrweb ReplayPlugin that processes source map events emitted by
// @agentation/rrweb-source-record and maintains a queryable store of element
// source metadata during playback.
//
// Usage:
//   import rrwebPlayer from 'rrweb-player';
//   import { createSourceReplayPlugin } from '@agentation/rrweb-source-replay';
//
//   const { plugin, store } = createSourceReplayPlugin();
//   const player = new rrwebPlayer({
//     target: document.getElementById('player'),
//     props: { events, plugins: [plugin] },
//   });
//
//   // Query source metadata for a replay element
//   const info = store.getByNodeId(42);
//
// =============================================================================

import { PLUGIN_NAME } from "./types";
import { createSourceMapStore } from "./store";
import type { SourceMapStore } from "./store";
import type {
  SourceMapPayload,
  SourceMapFullPayload,
  SourceMapIncrementalPayload,
  SourceNodeInfo,
} from "./types";

export type { SourceMapStore } from "./store";
export type {
  SourceNodeInfo,
  SourceMapPayload,
  SourceMapFullPayload,
  SourceMapIncrementalPayload,
} from "./types";
export { PLUGIN_NAME } from "./types";
export { createSourceMapStore } from "./store";

/** rrweb event type constants */
const EVENT_TYPE_PLUGIN = 6;

/**
 * Creates an rrweb ReplayPlugin and its associated SourceMapStore.
 *
 * The plugin processes source map events from @agentation/rrweb-source-record
 * and keeps the store up-to-date as playback progresses.
 *
 * @returns An object containing the replay plugin and the source map store
 */
export function createSourceReplayPlugin(): {
  /** The rrweb ReplayPlugin to pass to the player */
  plugin: {
    handler: (
      event: { type: number; data: any; timestamp: number },
      isSync: boolean,
      context: { replayer: any },
    ) => void;
  };
  /** The source map store — query it for element metadata */
  store: SourceMapStore;
} {
  const store = createSourceMapStore();

  // Access internal methods for applying updates
  const storeInternal = store as any;

  const plugin = {
    handler(
      event: { type: number; data: any; timestamp: number },
      _isSync: boolean,
      _context: { replayer: any },
    ) {
      // Only process Plugin events (type: 6)
      if (event.type !== EVENT_TYPE_PLUGIN) return;

      // Only process our plugin's events
      if (event.data?.plugin !== PLUGIN_NAME) return;

      const payload = event.data.payload as SourceMapPayload;
      if (!payload || !payload.kind) return;

      if (payload.kind === "full") {
        storeInternal._applyFull(payload.nodes);
      }

      if (payload.kind === "incremental") {
        storeInternal._applyIncremental(
          payload.added,
          payload.updated,
          payload.removed,
        );
      }
    },
  };

  return { plugin, store };
}
