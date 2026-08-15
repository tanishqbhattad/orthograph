#!/usr/bin/env node
'use strict';
/* ============================================================
   Zero-dependency static server for the project root.
   The app is a single file, but it must be served over HTTP —
   loaded as file:// a browser gives it no origin, which breaks
   canvas readback and any storage the app touches.

     node tools/serve.js [port]        default 8017
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.argv[2] || process.env.PORT || 8017);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.dxf': 'application/dxf',
  '.ocad': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/orthograph.html';
  /* contain the path inside ROOT — this server is only ever local, but a
     traversal here would hand out the rest of the disk to any page. */
  const abs = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!abs.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }

  fs.readFile(abs, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found: ' + rel); return; }
    res.writeHead(200, {
      'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      /* the build changes under the browser constantly during a work loop */
      'cache-control': 'no-store, no-cache, must-revalidate',
    });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`orthograph serving ${ROOT}`);
  console.log(`  http://127.0.0.1:${PORT}/`);
});
