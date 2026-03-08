<img src="./package/logo.svg" alt="Agentation" width="50" />

[![npm version](https://img.shields.io/npm/v/agentation)](https://www.npmjs.com/package/agentation)
[![downloads](https://img.shields.io/npm/dm/agentation)](https://www.npmjs.com/package/agentation)

**[Agentation](https://agentation.dev)** is an agent-agnostic visual feedback tool. Click elements on your page, add notes, and copy structured output that helps AI coding agents find the exact code you're referring to.

## Install

```bash
npm install agentation -D
# proxy + MCP server (optional)
npm install agentation-proxy agentation-mcp -D
```

## Usage

### Option 1 — React component (recommended for React apps)

```tsx
import { Agentation } from 'agentation';

function App() {
  return (
    <>
      <YourApp />
      <Agentation />
    </>
  );
}
```

### Option 2 — Reverse proxy (any app, no source changes)

Inject Agentation into **any** web app — React, Vue, Svelte, plain HTML — without touching its source code:

```bash
# Start your app as usual, then wrap it with the proxy
npx agentation-proxy --target http://localhost:3000
```

Open `http://localhost:4748` instead of your app's URL. The toolbar appears on every page automatically.

Or start both the MCP server and proxy together:

```bash
agentation-mcp server --proxy http://localhost:3000
```

See [proxy/README.md](./proxy/README.md) for full proxy documentation.

The toolbar appears in the bottom-right corner. Click to activate, then click any element to annotate it.

## Features

- **Click to annotate** – Click any element with automatic selector identification
- **Text selection** – Select text to annotate specific content
- **Multi-select** – Drag to select multiple elements at once
- **Area selection** – Drag to annotate any region, even empty space
- **Animation pause** – Freeze all animations (CSS, JS, videos) to capture specific states
- **Structured output** – Copy markdown with selectors, positions, and context
- **Dark/light mode** – Matches your preference or set manually
- **Zero dependencies** – Pure CSS animations, no runtime libraries
- **Framework-agnostic injection** – Works on any page via the reverse proxy

## How it works

Agentation captures class names, selectors, and element positions so AI agents can `grep` for the exact code you're referring to. Instead of describing "the blue button in the sidebar," you give the agent `.sidebar > button.primary` and your feedback.

## Requirements

- React 18+ (for the React component)
- Node.js 18+ (for the proxy and MCP server)
- Desktop browser (mobile not supported)

## Docs

Full documentation at [agentation.dev](https://agentation.dev)

## License

© 2026 Benji Taylor

Licensed under PolyForm Shield 1.0.0
