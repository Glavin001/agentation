# @glavin001/rrweb-source-replay

An [rrweb](https://github.com/rrweb-io/rrweb) ReplayPlugin that processes source map events from [@glavin001/rrweb-source-record](https://www.npmjs.com/package/@glavin001/rrweb-source-record) and maintains a queryable store during playback.

## Install

```bash
npm install @glavin001/rrweb-source-replay
```

**Peer dependency:** `rrweb@>=2.0.0-alpha.0`

## Usage

```ts
import rrwebPlayer from "rrweb-player";
import { createSourceReplayPlugin } from "@glavin001/rrweb-source-replay";

const { plugin, store } = createSourceReplayPlugin();

const player = new rrwebPlayer({
  target: document.getElementById("player"),
  props: { events, plugins: [plugin] },
});

// Query source metadata for a replay element
const info = store.getByNodeId(42);
```

## Store API

| Method | Returns | Description |
|--------|---------|-------------|
| `getByNodeId(id)` | `SourceNodeInfo \| null` | Get metadata by rrweb node ID |
| `getByElement(el)` | `SourceNodeInfo \| null` | Get metadata by DOM element (reads `__sn`) |
| `getAll()` | `Map<number, SourceNodeInfo>` | All entries (defensive copy) |
| `size()` | `number` | Number of entries |
| `onChange(cb)` | `() => void` | Subscribe to updates; returns unsubscribe function |

## License

PolyForm Shield 1.0.0
