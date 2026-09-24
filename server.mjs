import { createServer } from 'node:http';
import { readFile } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon'
};

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Método no permitido');
  }
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  let pathname;
  try { pathname = decodeURIComponent(requestUrl.pathname); }
  catch { res.writeHead(400); return res.end('Ruta no válida'); }
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(ROOT, relativePath);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, 'index.html')) {
    res.writeHead(403); return res.end('Ruta no permitida');
  }
  readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('No encontrado');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    res.end(content);
  });
});

server.listen(PORT, () => console.log('FitAI listo en http://localhost:' + PORT));