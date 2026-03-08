import { describe, it, expect, afterAll, beforeAll } from "vitest";
import * as http from "http";
import { startProxy } from "./proxy.js";
import * as zlib from "zlib";

const TEST_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Test</title></head>
<body>
  <h1>Hello</h1>
</body>
</html>`;

const TEST_PORT_UPSTREAM = 19876;
const TEST_PORT_PROXY = 19877;

function fetch(url: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf-8"),
        });
      });
    }).on("error", reject);
  });
}

describe("reverse proxy", () => {
  let upstream: http.Server;
  let proxy: http.Server;

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      if (req.url === "/page") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(TEST_HTML);
      } else if (req.url === "/gzipped") {
        const buf = zlib.gzipSync(Buffer.from(TEST_HTML));
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-encoding": "gzip",
        });
        res.end(buf);
      } else if (req.url === "/api/data") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(404);
        res.end("not found");
      }
    });

    await new Promise<void>((resolve) => upstream.listen(TEST_PORT_UPSTREAM, resolve));

    proxy = startProxy({
      target: `http://localhost:${TEST_PORT_UPSTREAM}`,
      port: TEST_PORT_PROXY,
      mcpEndpoint: "http://localhost:4747",
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 200));
  });

  afterAll(async () => {
    proxy?.close();
    upstream?.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  });

  it("injects script tag into HTML responses", async () => {
    const { status, body } = await fetch(`http://localhost:${TEST_PORT_PROXY}/page`);
    expect(status).toBe(200);
    expect(body).toContain("<h1>Hello</h1>");
    expect(body).toContain("/__agentation/standalone.js");
    expect(body).toContain('data-endpoint="http://localhost:4747"');
  });

  it("injects script tag before </body>", async () => {
    const { body } = await fetch(`http://localhost:${TEST_PORT_PROXY}/page`);
    const scriptIdx = body.indexOf("/__agentation/standalone.js");
    const bodyCloseIdx = body.indexOf("</body>");
    expect(scriptIdx).toBeGreaterThan(-1);
    expect(bodyCloseIdx).toBeGreaterThan(scriptIdx);
  });

  it("handles gzip-compressed HTML responses", async () => {
    const { status, body } = await fetch(`http://localhost:${TEST_PORT_PROXY}/gzipped`);
    expect(status).toBe(200);
    expect(body).toContain("<h1>Hello</h1>");
    expect(body).toContain("/__agentation/standalone.js");
  });

  it("passes through non-HTML responses unmodified", async () => {
    const { status, body, headers } = await fetch(`http://localhost:${TEST_PORT_PROXY}/api/data`);
    expect(status).toBe(200);
    expect(headers["content-type"]).toContain("application/json");
    expect(JSON.parse(body)).toEqual({ ok: true });
    expect(body).not.toContain("agentation");
  });

  it("serves the standalone bundle at /__agentation/standalone.js", async () => {
    const { status, headers, body } = await fetch(`http://localhost:${TEST_PORT_PROXY}/__agentation/standalone.js`);
    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("application/javascript");
    expect(body.length).toBeGreaterThan(1000);
  });

  it("standalone bundle served by proxy contains CSS rules", async () => {
    const { body } = await fetch(`http://localhost:${TEST_PORT_PROXY}/__agentation/standalone.js`);
    expect(body).toContain("border-radius");
    expect(body).toContain("background");
    expect(body).toContain("feedback-tool-styles-page-toolbar-css-styles");
  });

  it("passes through 404 from upstream", async () => {
    const { status } = await fetch(`http://localhost:${TEST_PORT_PROXY}/missing`);
    expect(status).toBe(404);
  });
});
