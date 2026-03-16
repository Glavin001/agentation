# @glavin001/rrweb-annotator

Renders the [Agentation](https://www.npmjs.com/package/@glavin001/agentation) annotation toolbar on top of an [rrweb](https://github.com/rrweb-io/rrweb) replay — all annotation modes, markers, settings, and copy/export.

## Install

```bash
npm install @glavin001/rrweb-annotator
```

**Peer dependencies:** `react@>=18`, `react-dom@>=18`, `rrweb@>=2.0.0-alpha.0`

## Usage

```tsx
import React, { useEffect, useRef, useState, useMemo } from "react";
import rrwebPlayer from "rrweb-player";
import { createSourceReplayPlugin } from "@glavin001/rrweb-source-replay";
import { RRWebAnnotator } from "@glavin001/rrweb-annotator";

function ReplayWithAnnotations({ events }) {
  const playerRef = useRef(null);
  const [isPaused, setIsPaused] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const { plugin, store } = useMemo(() => createSourceReplayPlugin(), []);

  useEffect(() => {
    const player = new rrwebPlayer({
      target: playerRef.current,
      props: { events, plugins: [plugin] },
    });
    player.getReplayer().on("pause", () => setIsPaused(true));
    player.getReplayer().on("resume", () => setIsPaused(false));
  }, [events]);

  return (
    <div style={{ position: "relative" }}>
      <div ref={playerRef} />
      {isPaused && (
        <RRWebAnnotator
          playerRef={playerRef}
          sourceStore={store}
          value={annotations}
          onAnnotationAdd={(a) => setAnnotations((prev) => [...prev, a])}
          onAnnotationDelete={(a) =>
            setAnnotations((prev) => prev.filter((x) => x.id !== a.id))
          }
          onAnnotationsClear={() => setAnnotations([])}
        />
      )}
    </div>
  );
}
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `playerRef` | `RefObject<HTMLElement>` | Reference to the rrweb-player container |
| `sourceStore` | `SourceMapStore` | Store from `createSourceReplayPlugin()` |
| `value` | `Annotation[]` | Controlled annotations array |
| `onAnnotationAdd` | `(annotation) => void` | Called when an annotation is created |
| `onAnnotationDelete` | `(annotation) => void` | Called when an annotation is deleted |
| `onAnnotationsClear` | `(annotations[]) => void` | Called when all annotations are cleared |
| `onCopy` | `(markdown) => void` | Called when copy button is clicked |

All other [Agentation props](https://agentation.dev/api) are also accepted.

## License

PolyForm Shield 1.0.0
