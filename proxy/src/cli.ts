/**
 * Agentation Proxy CLI
 *
 * Usage:
 *   agentation-proxy --target http://localhost:3000
 *   agentation-proxy --target http://localhost:3000 --port 4748 --mcp-endpoint http://localhost:4747
 */

import { startProxy } from "./proxy.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
agentation-proxy - Auto-inject Agentation into any web app

Usage:
  agentation-proxy --target <url> [options]

Options:
  --target <url>          Target app URL to proxy (required)
  --port <port>           Proxy listen port (default: 4748)
  --mcp-endpoint <url>    MCP server URL for annotations (default: http://localhost:4747)
  --help, -h              Show this help message

Examples:
  agentation-proxy --target http://localhost:3000
  agentation-proxy --target http://localhost:5173 --port 8080
  agentation-proxy --target http://localhost:3000 --mcp-endpoint http://localhost:9999
`);
  process.exit(0);
}

let target: string | undefined;
let port: number | undefined;
let mcpEndpoint: string | undefined;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--target":
      target = args[++i];
      break;
    case "--port": {
      const parsed = parseInt(args[++i], 10);
      if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
        port = parsed;
      } else {
        console.error("Invalid port number");
        process.exit(1);
      }
      break;
    }
    case "--mcp-endpoint":
      mcpEndpoint = args[++i];
      break;
    default:
      if (!args[i].startsWith("-")) {
        target = args[i];
      } else {
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
      }
  }
}

if (!target) {
  console.error("Error: --target is required\n");
  console.error("Usage: agentation-proxy --target http://localhost:3000");
  process.exit(1);
}

try {
  new URL(target);
} catch {
  console.error(`Error: invalid target URL: ${target}`);
  process.exit(1);
}

startProxy({ target, port, mcpEndpoint });
