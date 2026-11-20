// Builds the browser analyzer and the sample APKs into apps/web/public (generated, git-ignored).
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(web, '..', '..');
const pub = join(web, 'public');
const shim = (name) => join(web, 'src', 'shims', name);

await mkdir(join(pub, 'demo'), { recursive: true });

await build({
  entryPoints: [join(web, 'src', 'analyzer.worker.js')],
  outfile: join(pub, 'analyzer.worker.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  alias: {
    'node:zlib': shim('zlib.js'),
    'node:crypto': shim('crypto.js'),
    'node:fs/promises': shim('fs.js'),
    'node:path': shim('path.js'),
  },
  inject: [join(web, 'src', 'buffer-global.js')],
  logLevel: 'warning',
});

// Sample inputs: the synthetic PulseFit builds from the CLI's own demo fixtures.
const fixtures = (name) => import(pathToFileURL(join(repo, 'packages/cli/dist/test/fixtures', name)).href);
const { buildArtifact } = await fixtures('make-apk.js');
const { BASE_SPEC, CANDIDATE_SPEC } = await fixtures('scenario.js');
await writeFile(join(pub, 'demo', 'pulsefit-1.2.0.apk'), buildArtifact(BASE_SPEC));
await writeFile(join(pub, 'demo', 'pulsefit-1.3.0.apk'), buildArtifact(CANDIDATE_SPEC));
console.log('Built browser analyzer and sample builds.');
