import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const source = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = process.argv.includes('--built') ? join(source, 'dist') : source;
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4' };
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url || '/', 'http://localhost').pathname;
    const relative = decodeURIComponent(path).replace(/^\/+/, '') || 'index.html';
    const base = resolve(root);
    let file = resolve(base, relative);
    if (file !== base && !file.startsWith(base + sep)) throw new Error('Forbidden');
    if (!process.argv.includes('--built')) {
      const fromPublic = resolve(source, 'public', relative);
      if (fromPublic.startsWith(resolve(source, 'public') + sep) && (await stat(fromPublic).catch(() => null))?.isFile()) file = fromPublic;
    }
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not found');
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': types[extname(file)] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'SAMEORIGIN',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'content-security-policy': "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Attest website: http://127.0.0.1:${port}`));
