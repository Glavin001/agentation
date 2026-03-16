# @glavin001/rrweb-source-record

An [rrweb](https://github.com/rrweb-io/rrweb) RecordPlugin that captures element source metadata during recording — React component names, source file locations, CSS selectors, and accessibility info.

## Install

```bash
npm install @glavin001/rrweb-source-record
```

**Peer dependency:** `rrweb@>=2.0.0-alpha.0`

## Usage

```ts
import { record } from "rrweb";
import { createSourceRecordPlugin } from "@glavin001/rrweb-source-record";

const sourcePlugin = createSourceRecordPlugin();

const stop = record({
  emit(event) {
    events.push(event);
  },
  plugins: [sourcePlugin],
});
```

Source metadata is emitted as standard rrweb plugin events (type 6). Store and transmit them alongside your normal rrweb events.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `batchSize` | `number` | `100` | Elements resolved per idle callback batch |
| `reactDetectionMode` | `"all" \| "filtered" \| "smart"` | `"filtered"` | How React components are detected |
| `shouldResolve` | `(el: Element) => boolean` | built-in filter | Custom filter for which elements to resolve |

## Replay

Use [@glavin001/rrweb-source-replay](https://www.npmjs.com/package/@glavin001/rrweb-source-replay) to process these events during playback.

## License

PolyForm Shield 1.0.0
