import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm', '.traineddata': 'application/octet-stream' };
http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = u.startsWith('/fx/') ? path.join('fixtures-private/docs', path.basename(u)) : path.join('dist', path.normalize(u === '/' ? '/harness.html' : u));
  if (!file.startsWith('dist') && !file.startsWith('fixtures-private')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  });
}).listen(8123, () => console.log('http://localhost:8123/'));
