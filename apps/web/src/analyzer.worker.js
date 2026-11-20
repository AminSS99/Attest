// Runs the same inspection, diff, rules, and Passport code as the CLI, fully
// in the browser. Selected files are read into memory here and never uploaded.
import { Buffer } from 'buffer';

import { inspectArtifact } from '../../../packages/cli/dist/src/inspect.js';
import { diffBuilds } from '../../../packages/cli/dist/src/diff.js';
import { runTruthGapRules } from '../../../packages/cli/dist/src/truthgap.js';
import { buildClaims } from '../../../packages/cli/dist/src/truthgraph.js';
import { buildPassport, renderPassportHtml } from '../../../packages/cli/dist/src/passport.js';
import { parseDataSafetyJson } from '../../../packages/cli/dist/src/datasafety.js';

function declaredText(kind, name, text) {
  if (!text) return undefined;
  return { kind, text: text.normalize('NFC'), source: name, importedAt: new Date().toISOString() };
}

async function read(file) {
  return { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) };
}

async function analyze({ base, candidate, dataSafety, privacyPolicy, listing }) {
  const [b, c] = await Promise.all([read(base), read(candidate)]);
  const baseFacts = inspectArtifact(b.bytes, b.name);
  const candidateFacts = inspectArtifact(c.bytes, c.name);
  const diff = diffBuilds(baseFacts, candidateFacts);

  const input = {
    base: baseFacts,
    candidate: candidateFacts,
    diff,
    dataSafety: dataSafety ? parseDataSafetyJson(dataSafety) : undefined,
    privacyPolicy: declaredText('privacy_policy', 'privacy policy', privacyPolicy),
    listing: declaredText('store_listing', 'store listing', listing),
  };
  const findings = runTruthGapRules(input);
  const passport = buildPassport(input, buildClaims(input, findings), findings, []);
  return { passport, html: renderPassportHtml(passport) };
}

self.onmessage = async (event) => {
  try {
    self.postMessage({ ok: true, result: await analyze(event.data) });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
