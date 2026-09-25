import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const source = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = process.argv.includes('--built') ? join(source, 'dist') : source;
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url || '/', 'http://localhost').pathname;
    const relative = decodeURIComponent(path).replace(/^\/+/, '') || 'index.html';
    const base = resolve(root);
    let file = resolve(base, relative);
    if (file !== base && !file.startsWith(base + sep)) throw new Error('Forbidden');
    if (!process.argv.includes('--built') && relative.startsWith('demo/')) file = resolve(source, 'public', relative);
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not found');
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Attest website: http://127.0.0.1:${port}`));
