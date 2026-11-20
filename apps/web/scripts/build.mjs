import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const files = [
  'index.html', 'guide.html', 'styles.css', 'reveal.js', 'try.js',
  'attest-logo.png', 'favicon.ico', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'site.webmanifest',
  'og-image.png', 'video-poster.jpg', 'attest-demo.mp4',
];
for (const file of files) {
  await cp(join(root, file), join(out, file));
}
await cp(join(root, 'public'), out, { recursive: true });
console.log(`Built static website: ${out}`);
