# Agentation

## Cursor Cloud specific instructions

### Overview

Monorepo with four packages managed by pnpm workspaces. See `CLAUDE.md` for full details.

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Package (watch + example site) | `pnpm dev` | dynamic (portless) | `portless` maps to `agentation.localhost:1355`; actual Next.js port is assigned dynamically |
| Standalone proxy demo | `pnpm demo` | 3002 (HTML), 4748 (proxy) | Best way to demo the full annotation flow without React app |
| MCP server | `pnpm mcp` | 4747 | Builds and starts MCP server |
| All services | `pnpm dev:proxy` | 13551, 4747, 4748 | Example site + MCP + proxy together; open http://localhost:4748 |

### Gotchas

- **`portless` must be installed globally** (`npm install -g portless`). It is not a workspace dependency; the example site dev script (`portless agentation next dev`) will fail with `spawn ENOENT` without it.
- **`pnpm dev` port is dynamic**: `portless` picks a random port for Next.js (not 3001). The canonical URL is `http://agentation.localhost:1355`, but in headless/cloud environments use the raw `http://localhost:<port>` printed in the terminal output.
- **No external services required**: The MCP server uses embedded `better-sqlite3`; no databases, Docker, or Redis needed.
- **`@parcel/watcher` build script is ignored** by `pnpm.onlyBuiltDependencies` allowlist. This is expected and does not affect functionality; Next.js falls back to polling.

### Testing

- `pnpm --filter agentation test` — vitest for the core package (83 tests)
- `pnpm --filter agentation-proxy test` — vitest for the proxy (25 tests)
- `pnpm build` — builds the core `agentation` package (must pass before other packages work)

### Linting / Type-checking

No dedicated lint script at root level. Use `pnpm build` as the primary correctness check (tsup + TypeScript compilation). The proxy and MCP packages also compile via their own `pnpm build` scripts.
