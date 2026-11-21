// Static server for the /rigs tests.
//
// Why this exists instead of `python3 -m http.server`: that server sends no
// Cache-Control, so Chromium applies heuristic freshness from Last-Modified
// and serves the whole page out of its OWN http cache. Every "works offline"
// assertion then passes whether or not the service worker exists, which is
// exactly how two service worker defects shipped past a green suite.
//
// no-store forces the browser to have nothing of its own, so anything that
// still renders with the network cut is genuinely the service worker.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export function startServer(root, port, opts = {}) {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    // Lets a test simulate a server that accepts the connection and never
    // answers, which is what weak signal and captive portals actually do.
    if (opts.hang) return;
    // Or one that answers, eventually. Deterministic stand-in for weak signal:
    // if the page waits on the network it takes at least this long.
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      let p = join(base, decodeURIComponent(url.pathname));
      if (!p.startsWith(base)) { res.writeHead(403).end("forbidden"); return; }
      let s = await stat(p).catch(() => null);
      if (s && s.isDirectory()) { p = join(p, "index.html"); s = await stat(p).catch(() => null); }
      if (!s) {
        res.writeHead(404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end("<!doctype html><title>404</title><h1>SERVER 404 NOT FOUND</h1>");
        return;
      }
      const body = await readFile(p);
      res.writeHead(200, {
        "content-type": TYPES[extname(p)] || "application/octet-stream",
        "cache-control": "no-store",
        "content-length": body.length,
      });
      res.end(body);
    } catch (e) {
      res.writeHead(500, { "cache-control": "no-store" }).end("error");
    }
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}
