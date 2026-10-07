/* Minimal static file server for local development.
 *
 * ES modules cannot be loaded over file:// (CORS), so the project needs an HTTP
 * origin to run at all. This is a zero-dependency stand-in for `python -m http.server`
 * that also sets the headers a production host would set.
 *
 * Run with: node scripts/serve.mjs [port]
 */

import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8080;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

createServer((req, res) => {
  const requested = decodeURIComponent((req.url || "/").split("?")[0]);
  const relative = normalize(requested === "/" ? "index.html" : requested.replace(/^\/+/, ""));

  // Path traversal guard.
  if (relative.split(sep).includes("..")) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  const filePath = join(ROOT, relative);

  let stats;
  try {
    stats = statSync(filePath);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }

  const target = stats.isDirectory() ? join(filePath, "index.html") : filePath;
  const type = TYPES[extname(target).toLowerCase()] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": type,
    // No caching during development so an edit is always picked up.
    "Cache-Control": "no-store",
    // Allows getBattery / Wake Lock / clipboard in secure contexts.
    "Permissions-Policy": "geolocation=(self), fullscreen=(self)"
  });

  createReadStream(target).pipe(res);
}).listen(PORT, () => {
  console.log(`StandBy Mode Pro dev server: http://localhost:${PORT}/`);
  console.log("Press Ctrl+C to stop.");
});