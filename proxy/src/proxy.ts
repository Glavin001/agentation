import * as http from "http";
import * as https from "https";
import * as zlib from "zlib";
import * as path from "path";
import * as fs from "fs";
import { URL } from "url";

export interface ProxyOptions {
  target: string;
  port?: number;
  mcpEndpoint?: string;
}

const DEFAULT_PORT = 4748;
const DEFAULT_MCP_ENDPOINT = "http://localhost:4747";
const STANDALONE_ROUTE = "/__agentation/standalone.js";

function getStandalonePath(): string {
  // tsup IIFE format outputs as .global.js
  // Try __dirname first (works in built dist/), then fall back to dist/ relative to package root
  const candidates = [
    path.resolve(__dirname, "standalone.global.js"),
    path.resolve(__dirname, "../dist/standalone.global.js"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function makeScriptTag(mcpEndpoint: string): string {
  return `<script src="${STANDALONE_ROUTE}" data-endpoint="${mcpEndpoint}"></script>`;
}

function decompressBody(
  encoding: string | undefined,
  data: Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!encoding) {
      resolve(data);
      return;
    }
    switch (encoding.trim().toLowerCase()) {
      case "gzip":
        zlib.gunzip(data, (err, result) => (err ? reject(err) : resolve(result)));
        break;
      case "br":
        zlib.brotliDecompress(data, (err, result) =>
          err ? reject(err) : resolve(result),
        );
        break;
      case "deflate":
        zlib.inflate(data, (err, result) => (err ? reject(err) : resolve(result)));
        break;
      default:
        resolve(data);
    }
  });
}

function injectIntoHtml(html: string, scriptTag: string): string {
  const bodyClose = html.lastIndexOf("</body>");
  if (bodyClose !== -1) {
    return html.slice(0, bodyClose) + scriptTag + html.slice(bodyClose);
  }
  const htmlClose = html.lastIndexOf("</html>");
  if (htmlClose !== -1) {
    return html.slice(0, htmlClose) + scriptTag + html.slice(htmlClose);
  }
  return html + scriptTag;
}

function isHtmlResponse(contentType: string | undefined): boolean {
  return !!contentType && contentType.toLowerCase().includes("text/html");
}

function getRequestModule(
  targetUrl: URL,
): typeof http | typeof https {
  return targetUrl.protocol === "https:" ? https : http;
}

export function startProxy(options: ProxyOptions): http.Server {
  const targetUrl = new URL(options.target);
  const port = options.port ?? DEFAULT_PORT;
  const mcpEndpoint = options.mcpEndpoint ?? DEFAULT_MCP_ENDPOINT;
  const scriptTag = makeScriptTag(mcpEndpoint);
  const standalonePath = getStandalonePath();

  const server = http.createServer((clientReq, clientRes) => {
    // Serve the standalone bundle
    if (clientReq.url === STANDALONE_ROUTE) {
      try {
        const js = fs.readFileSync(standalonePath);
        clientRes.writeHead(200, {
          "content-type": "application/javascript",
          "content-length": js.length,
          "cache-control": "no-cache",
        });
        clientRes.end(js);
      } catch {
        clientRes.writeHead(500, { "content-type": "text/plain" });
        clientRes.end("Failed to load standalone bundle");
      }
      return;
    }

    const reqModule = getRequestModule(targetUrl);

    const proxyReqOptions: http.RequestOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
      path: clientReq.url,
      method: clientReq.method,
      headers: {
        ...clientReq.headers,
        host: targetUrl.host,
      },
    };

    // Remove accept-encoding so upstream sends uncompressed when possible.
    // If upstream still compresses, we decompress before injecting.
    if (proxyReqOptions.headers && isHtmlRequest(clientReq)) {
      const h = proxyReqOptions.headers as Record<string, unknown>;
      delete h["accept-encoding"];
    }

    const proxyReq = reqModule.request(proxyReqOptions, (proxyRes) => {
      const contentType = proxyRes.headers["content-type"];

      if (!isHtmlResponse(contentType)) {
        // Pass non-HTML through unmodified
        clientRes.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
        proxyRes.pipe(clientRes, { end: true });
        return;
      }

      // Buffer HTML response for injection
      const chunks: Buffer[] = [];
      proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
      proxyRes.on("end", async () => {
        try {
          const raw = Buffer.concat(chunks);
          const encoding = proxyRes.headers["content-encoding"];
          const body = await decompressBody(encoding, raw);
          const html = body.toString("utf-8");
          const modified = injectIntoHtml(html, scriptTag);
          const modifiedBuf = Buffer.from(modified, "utf-8");

          const headers = { ...proxyRes.headers };
          headers["content-length"] = String(modifiedBuf.length);
          delete headers["content-encoding"];
          delete headers["transfer-encoding"];

          clientRes.writeHead(proxyRes.statusCode ?? 200, headers);
          clientRes.end(modifiedBuf);
        } catch (err) {
          console.error("[agentation-proxy] injection error:", err);
          // Fall back to original response
          const raw = Buffer.concat(chunks);
          clientRes.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
          clientRes.end(raw);
        }
      });
    });

    proxyReq.on("error", (err) => {
      console.error("[agentation-proxy] upstream error:", err.message);
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { "content-type": "text/plain" });
        clientRes.end(`Proxy error: ${err.message}`);
      }
    });

    clientReq.pipe(proxyReq, { end: true });
  });

  // WebSocket upgrade pass-through for HMR / live-reload
  server.on("upgrade", (clientReq, clientSocket, head) => {
    const reqModule = getRequestModule(targetUrl);
    const wsPort = targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80);

    const proxyReqOptions: http.RequestOptions = {
      hostname: targetUrl.hostname,
      port: wsPort,
      path: clientReq.url,
      method: "GET",
      headers: {
        ...clientReq.headers,
        host: targetUrl.host,
      },
    };

    const proxyReq = reqModule.request(proxyReqOptions);

    proxyReq.on("upgrade", (_proxyRes, proxySocket, proxyHead) => {
      clientSocket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          "\r\n",
      );

      if (proxyHead && proxyHead.length > 0) {
        clientSocket.write(proxyHead);
      }

      proxySocket.pipe(clientSocket);
      clientSocket.pipe(proxySocket);

      proxySocket.on("error", () => clientSocket.destroy());
      clientSocket.on("error", () => proxySocket.destroy());
    });

    proxyReq.on("error", (err) => {
      console.error("[agentation-proxy] WebSocket upstream error:", err.message);
      clientSocket.destroy();
    });

    proxyReq.end();
    if (head && head.length > 0) {
      // The head buffer from the upgrade request needs to be forwarded
      // but since we use pipe, the proxy socket handles this after connection
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`[agentation-proxy] Proxying ${url} → ${options.target}`);
    console.log(`[agentation-proxy] Agentation toolbar will be injected automatically`);
    console.log(`[agentation-proxy] MCP endpoint: ${mcpEndpoint}`);
    console.log("");
    console.log(`[agentation-proxy]   >>>  Open ${url} in your browser  <<<`);
    console.log("");
  });

  return server;
}

function isHtmlRequest(req: http.IncomingMessage): boolean {
  const accept = req.headers["accept"] || "";
  return accept.includes("text/html");
}
