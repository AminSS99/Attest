import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { sealCapsule, verifyCapsule, CAPSULE_MANIFEST_NAME } from '../src/capsule.js';
import { diffBuilds } from '../src/diff.js';
import { inspectArtifact } from '../src/inspect.js';
import { buildPassport, renderPassportHtml } from '../src/passport.js';
import { toSarif } from '../src/sarif.js';
import { buildClaims } from '../src/truthgraph.js';
import { runTruthGapRules, type RuleInput } from '../src/truthgap.js';
import { buildArtifact } from './fixtures/make-apk.js';
import {
  BASE_SPEC,
  CANDIDATE_SPEC,
  PRIVACY_POLICY_TEXT,
  STALE_DATA_SAFETY,
  STORE_LISTING_TEXT,
} from './fixtures/scenario.js';

function makeInput(): RuleInput {
  const base = inspectArtifact(buildArtifact(BASE_SPEC), 'pulsefit-1.2.0.apk');
  const candidate = inspectArtifact(buildArtifact(CANDIDATE_SPEC), 'pulsefit-1.3.0.apk');
  return {
    base,
    candidate,
    diff: diffBuilds(base, candidate),
    dataSafety: STALE_DATA_SAFETY,
    privacyPolicy: { kind: 'privacy_policy', text: PRIVACY_POLICY_TEXT, importedAt: '2026-09-21T00:00:00Z' },
    listing: { kind: 'store_listing', text: STORE_LISTING_TEXT, importedAt: '2026-09-21T00:00:00Z' },
  };
}

describe('end-to-end: artifact → diff → truth gaps → passport → capsule → verify', () => {
  let dir: string;
  after(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('produces a Passport recommending HOLD with a complete evidence chain', async () => {
    const input = makeInput();
    const findings = runTruthGapRules(input);
    const claims = buildClaims(input, findings);
    const passport = buildPassport(input, claims, findings);

    assert.equal(passport.decision.recommendation, 'hold');
    assert.equal(passport.decision.status, 'pending'); // a human decides
    assert.match(passport.id, /^RP-[0-9a-f]{24}$/);
    assert.ok(passport.unresolvedQuestions.length > 0);

    // The truth graph contradicts the camera/data-safety pair and supports location.
    const camera = claims.find((c) => c.id === 'permission:android.permission.CAMERA');
    assert.equal(camera!.status, 'contradicted');
    const location = claims.find((c) => c.id === 'data-type:location.precise_location');
    assert.equal(location!.status, 'supported');
    assert.ok(location!.supporting.some((s) => s.evidenceClass === 'observed'));
    assert.ok(location!.supporting.some((s) => s.evidenceClass === 'declared'));

    const html = renderPassportHtml(passport);
    assert.match(html, /Release Passport/);
    assert.match(html, /HOLD/);
    assert.match(html, /metrics\.amplitude\.com/);
    assert.ok(!html.includes('http://cdn'), 'passport HTML must be self-contained');

    const sarif = JSON.parse(toSarif(findings, input.candidate.artifact.fileName));
    assert.equal(sarif.version, '2.1.0');
    assert.equal(sarif.runs[0].results.length, findings.length);
    assert.equal(sarif.runs[0].tool.driver.rules.length, 5);

    dir = await mkdtemp(join(tmpdir(), 'attest-capsule-'));
    const manifest = await sealCapsule(dir, {
      passport,
      passportHtml: html,
      sarif: JSON.stringify(sarif, null, 2),
      declarations: {
        'data-safety.json': JSON.stringify(STALE_DATA_SAFETY, null, 2),
        'privacy-policy.txt': PRIVACY_POLICY_TEXT,
        'store-listing.txt': STORE_LISTING_TEXT,
      },
      redactions: ['reviewer credentials'],
    });

    assert.match(manifest.evidenceRootHash, /^[0-9a-f]{64}$/);
    assert.ok(manifest.files.length >= 8);

    const verification = await verifyCapsule(dir);
    assert.equal(verification.ok, true);
    assert.equal(verification.checked, manifest.files.length);
    assert.equal(verification.evidenceRootOk, true);
  });

  it('detects tampering with sealed evidence', async () => {
    const input = makeInput();
    const findings = runTruthGapRules(input);
    const passport = buildPassport(input, buildClaims(input, findings), findings);

    const tampered = await mkdtemp(join(tmpdir(), 'attest-tamper-'));
    after(async () => {
      await rm(tampered, { recursive: true, force: true });
    });
    await sealCapsule(tampered, {
      passport,
      passportHtml: renderPassportHtml(passport),
      sarif: toSarif(findings, 'x.apk'),
      declarations: {},
      redactions: [],
    });

    // An attacker edits the findings after sealing.
    const findingsPath = join(tampered, 'findings.json');
    const edited = JSON.parse(await readFile(findingsPath, 'utf8'));
    edited[0].state = 'verified_consistent';
    await writeFile(findingsPath, JSON.stringify(edited, null, 2), 'utf8');

    const result = await verifyCapsule(tampered);
    assert.equal(result.ok, false);
    assert.deepEqual(result.mismatches.map((m) => m.path), ['findings.json']);
  });

  it('manifest itself carries the seal and stays verifiable', async () => {
    const manifest = JSON.parse(await readFile(join(dir, CAPSULE_MANIFEST_NAME), 'utf8'));
    assert.equal(manifest.schemaVersion, 'attest.evidence-capsule/1');
    assert.equal(manifest.artifact.packageName, 'app.pulsefit');
    assert.equal(manifest.artifact.versionName, '1.3.0');
    assert.deepEqual(manifest.redactions, ['reviewer credentials']);
  });
});
