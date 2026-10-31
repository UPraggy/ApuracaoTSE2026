// Servidor estático mínimo para abrir o site localmente (fetch dos JSON não funciona em file://).
// Uso: npm run servir  →  http://localhost:5174
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../site/', import.meta.url));
const PORTA = Number(process.env.PORT || 5174);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const arq = path.join(RAIZ, path.normalize(url === '/' ? '/index.html' : url));
  if (!arq.startsWith(RAIZ)) { res.writeHead(403).end(); return; }
  fs.readFile(arq, (erro, dados) => {
    if (erro) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Não encontrado'); return; }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(arq)] || 'application/octet-stream', 'cache-control': 'no-cache' }).end(dados);
  });
}).listen(PORTA, () => console.log(`Site em http://localhost:${PORTA}`));
