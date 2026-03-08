# Agentation

Monorepo containing:

1. **npm package** (`package/`) - See `package/CLAUDE.md`
2. **Website/docs** (`package/example/`) - See `package/example/CLAUDE.md`
3. **MCP server** (`mcp/`) - `agentation-mcp` npm package; exposes MCP tools to AI agents
4. **Reverse proxy** (`proxy/`) - `agentation-proxy` npm package; injects toolbar into any app without source changes

## What is Agentation?

A floating toolbar for annotating web pages and collecting structured feedback for AI coding agents.

## Development

```bash
pnpm install    # Install all workspace dependencies
pnpm dev        # Package watch + website dev server  →  http://localhost:3001
pnpm build      # Build agentation package only
pnpm example    # Website only                        →  http://localhost:3001
pnpm mcp        # Build + start MCP server only       →  http://localhost:4747
pnpm proxy      # Build + start MCP server + reverse proxy
                #   mcp    → http://localhost:4747
                #   proxy  → http://localhost:4748
pnpm dev:proxy  # Example site + MCP server + proxy (all three)
                #   app    → http://localhost:3001
                #   mcp    → http://localhost:4747
                #   proxy  → http://localhost:4748  ← open this in browser
pnpm demo       # Standalone proxy demo (no example site needed)
                #   plain HTML test page → http://localhost:3002
                #   proxy with toolbar   → http://localhost:4748  ← open this
```

## Packages

| Package | Path | npm | Description |
|---------|------|-----|-------------|
| `agentation` | `package/` | public | React component + CSS |
| `agentation-mcp` | `mcp/` | public | MCP server for AI agents |
| `agentation-proxy` | `proxy/` | public | Reverse proxy for zero-config injection |
| example site | `package/example/` | private | agentation.dev docs/demo (Next.js, port 3001) |

## Important

The npm package is public. Changes to `package/src/` affect all users.
Website changes (`package/example/`) only affect agentation.dev.
`mcp/` and `proxy/` are also published — treat their public APIs with the same care.

## PR/Issue Approach

- Package size is critical - avoid bloat
- UI changes need extra scrutiny
- Plugins/extensions → encourage separate repos
- External binary files → never accept

## Annotations

Whenever the user brings up annotations, fetch all the pending annotations before doing anything else. And infer whether I am referencing any annotations.
