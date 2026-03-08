# agentation-proxy

Reverse proxy that auto-injects the [Agentation](https://agentation.dev) toolbar into **any** web app — no source code changes required.

## How it works

The proxy sits in front of your dev server. It intercepts every HTML response and injects a self-contained `<script>` tag that includes React, ReactDOM, and Agentation bundled together (IIFE). Non-HTML responses (JS, CSS, images, APIs) and WebSocket connections (HMR, live-reload) are passed through unmodified.

```
Browser → agentation-proxy (:4748) → Your app (:3000)
                  ↓
         injects <script> into HTML
                  ↓
         toolbar appears on every page
```

## Installation

```bash
npm install agentation-proxy
# or
pnpm add agentation-proxy
```

Or use without installing via `npx`:

```bash
npx agentation-proxy --target http://localhost:3000
```

## Usage

### CLI

```bash
agentation-proxy --target <url> [options]
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--target <url>` | Target app URL to proxy (**required**) | — |
| `--port <port>` | Proxy listen port | `4748` |
| `--mcp-endpoint <url>` | Agentation MCP server URL | `http://localhost:4747` |
| `--help`, `-h` | Show help | — |

**Examples:**

```bash
# Wrap a Vite/Next/CRA dev server
agentation-proxy --target http://localhost:3000

# Custom proxy port
agentation-proxy --target http://localhost:5173 --port 8080

# Custom MCP endpoint
agentation-proxy --target http://localhost:3000 --mcp-endpoint http://localhost:9999
```

Then open `http://localhost:4748` instead of your app's URL.

### Programmatic

```typescript
import { startProxy } from 'agentation-proxy';

const server = startProxy({
  target: 'http://localhost:3000',
  port: 4748,
  mcpEndpoint: 'http://localhost:4747',
});
```

### Via agentation-mcp

The MCP server can start the proxy alongside itself using `--proxy`:

```bash
agentation-mcp server --proxy http://localhost:3000
```

This starts:
- **MCP + HTTP server** on port 4747 (receives annotations)
- **Reverse proxy** on port 4748 (injects toolbar into your app)

Use `--proxy-port` to change the proxy port:

```bash
agentation-mcp server --proxy http://localhost:5173 --proxy-port 8080
```

## Full workflow

```bash
# Terminal 1 — your normal dev server
pnpm dev   # → http://localhost:3000

# Terminal 2 — Agentation (MCP + proxy together)
agentation-mcp server --proxy http://localhost:3000

# Browser — open the proxy instead of your app
open http://localhost:4748
```

The Agentation toolbar appears on every page. Annotations are sent to the MCP server on port 4747, where AI agents can read them.

## Bundle details

The injected script (`/__agentation/standalone.js`) is a self-contained IIFE that:

- Bundles React 18, ReactDOM, and Agentation together (~300 KB minified)
- Does **not** set `window.React` or `window.ReactDOM` globals
- Is safe on pages that already have their own React (different or same version)
- Is safe on plain HTML pages with no framework at all

## Requirements

- Node.js 18+

## License

PolyForm Shield 1.0.0
