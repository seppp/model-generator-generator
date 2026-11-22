// Minimal static server for dist/ (npm run dev).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../dist');
const port = Number(process.env.PORT) || 8080;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.woff': 'font/woff', '.fs': 'text/plain', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(dist)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}/`));
