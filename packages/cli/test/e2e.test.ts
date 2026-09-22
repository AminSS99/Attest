import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { sealCapsule, verifyCapsule, CAPSULE_MANIFEST_NAME } from '../src/capsule.js';
import { diffBuilds } from '../src/diff.js';
import {
  applyComparison,
  compareJourneys,
  journeyFindings,
  loadJourneyBundle,
  recordJourney,
  renderReviewerInstructions,
} from '../src/journey.js';
import { inspectArtifact } from '../src/inspect.js';
import { buildPassport, renderPassportHtml } from '../src/passport.js';
import { toSarif } from '../src/sarif.js';
import { buildClaims } from '../src/truthgraph.js';
import { runTruthGapRules, type RuleInput } from '../src/truthgap.js';
import { buildArtifact } from './fixtures/make-apk.js';
import {
  BASELINE_SESSION,
  BASELINE_SCREENS,
  FAILURE_SESSION,
  FAILURE_SCREENS,
  PULSEFIT_CREDENTIAL_REF,
  REPAIRED_SESSION,
  REPAIRED_SCREENS,
  answersFor,
  scriptedDevice,
  scriptedIO,
} from './fixtures/journey.js';
import {
  BASE_SPEC,
  CANDIDATE_SPEC,
  FIXED_DATA_SAFETY,
  FIXED_PRIVACY_POLICY_TEXT,
  PRIVACY_POLICY_TEXT,
  STALE_DATA_SAFETY,
  STORE_LISTING_TEXT,
} from './fixtures/scenario.js';

function makeInput(overrides: Partial<RuleInput> = {}): RuleInput {
  const base = inspectArtifact(buildArtifact(BASE_SPEC), 'pulsefit-1.2.0.apk');
  const candidate = inspectArtifact(buildArtifact(CANDIDATE_SPEC), 'pulsefit-1.3.0.apk');
  return {
    base,
    candidate,
    diff: diffBuilds(base, candidate),
    dataSafety: STALE_DATA_SAFETY,
    privacyPolicy: { kind: 'privacy_policy', text: PRIVACY_POLICY_TEXT, importedAt: '2026-09-21T00:00:00Z' },
    listing: { kind: 'store_listing', text: STORE_LISTING_TEXT, importedAt: '2026-09-21T00:00:00Z' },
    ...overrides,
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
    // 5 truth-gap rules + 2 journey rules.
    assert.equal(sarif.runs[0].tool.driver.rules.length, 7);

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

describe('Reviewer Twin e2e: record → compare → passport → capsule → repair → SHIP', () => {
  const cleanups: string[] = [];
  after(async () => {
    await Promise.all(cleanups.map((d) => rm(d, { recursive: true, force: true })));
  });

  async function record(
    name: string,
    session: typeof BASELINE_SESSION,
    screens: typeof BASELINE_SCREENS,
    artifactSha256?: string,
  ) {
    const outDir = await mkdtemp(join(tmpdir(), 'attest-rt-'));
    cleanups.push(outDir);
    const recorded = await recordJourney({
      name,
      title: 'Reviewer reaches premium AI feature',
      credentialRef: PULSEFIT_CREDENTIAL_REF,
      artifactSha256,
      device: scriptedDevice('emulator-5554', screens),
      io: scriptedIO(answersFor(session)),
      outDir,
    });
    return { ...recorded, outDir };
  }

  it('passes all seven definition-of-done checks', async () => {
    const input = makeInput();

    // 1–2. Release delta + declaration contradictions (covered by truth-gap rules).
    assert.ok(input.diff.addedSdks.some((s) => s.id.includes('amplitude')));
    assert.ok(input.diff.addedPermissions.includes('android.permission.CAMERA'));
    assert.ok(input.diff.addedDomains.includes('metrics.amplitude.com'));
    const tgFindings = runTruthGapRules(input);
    assert.equal(
      tgFindings.filter((f) => f.state === 'confirmed_contradiction').length,
      2,
      'CAMERA and Amplitude are confirmed contradictions (destination is review-required by design)',
    );

    // 3. Record the approved baseline on 1.2.0 and the failing run on 1.3.0.
    const baseline = await record('reviewer-premium-ai-1.2.0', BASELINE_SESSION, BASELINE_SCREENS, input.base.artifact.sha256);
    const candidate = await record('reviewer-premium-ai-1.3.0', FAILURE_SESSION, FAILURE_SCREENS, input.candidate.artifact.sha256);
    assert.equal(baseline.journey.lastRunResult, 'pass');
    assert.equal(candidate.journey.lastRunResult, 'fail');

    const comparison = compareJourneys(baseline.journey, candidate.journey);
    assert.equal(comparison.result, 'fail');
    assert.equal(comparison.firstFailedStep, 4);
    assert.equal(comparison.firstChangedStep, 4);

    // 4. Passport explains technical truth gaps AND the failed reviewer path.
    const candidateBundle = await loadJourneyBundle(candidate.journeyPath);
    const stampedCandidate = applyComparison(candidate.journey, comparison);
    const findings = [
      ...tgFindings,
      ...journeyFindings(stampedCandidate, comparison),
    ].sort((a, b) => a.id.localeCompare(b.id));
    assert.equal(findings.length, 6); // 5 TG + JT-001
    assert.ok(findings.some((f) => f.ruleId === 'JT-001' && f.state === 'confirmed_contradiction'));

    const claims = buildClaims(input, findings);
    const passport = buildPassport(input, claims, findings, [stampedCandidate]);
    assert.equal(passport.decision.recommendation, 'hold');
    assert.ok(passport.decision.rationale.join(' ').includes('3 confirmed contradictions'));

    // Passport carries the journey: result, failed step, steps, screenshot hashes, credential ref.
    assert.equal(passport.journeys.length, 1);
    const js = passport.journeys[0]!;
    assert.equal(js.result, 'fail');
    assert.equal(js.firstFailedStep, 4);
    assert.equal(js.firstChangedStep, 4);
    assert.equal(js.stepCount, 4);
    assert.equal(js.credentialRef?.label, PULSEFIT_CREDENTIAL_REF.label);
    assert.ok(js.steps.every((s) => s.screenshot && /^[0-9a-f]{64}$/.test(s.screenshot.sha256)));

    const html = renderPassportHtml(passport);
    assert.match(html, /Reviewer Twin journeys \(1\)/);
    assert.match(html, /First failed step:<\/strong> 4/);
    assert.match(html, /Something went wrong/);
    assert.match(html, /metrics\.amplitude\.com/);
    assert.match(html, /credential reference/);
    assert.match(html, /step-004\.png/);

    // 5. Reviewer instructions contain screenshots and exact steps.
    const instructions = renderReviewerInstructions(
      { ...candidateBundle, journey: stampedCandidate },
      comparison,
    );
    assert.equal(instructions.match(/data:image\/png;base64,/gu)?.length, 4);
    assert.match(instructions, /Step 4 — Tap/);
    assert.match(instructions, /FAILED at step 4/);

    // 6. Capsule seals journey evidence (JSON + screenshots + comparison) and verifies offline.
    const capsuleDir = await mkdtemp(join(tmpdir(), 'attest-rt-capsule-'));
    cleanups.push(capsuleDir);
    const manifest = await sealCapsule(capsuleDir, {
      passport,
      passportHtml: html,
      sarif: toSarif(findings, input.candidate.artifact.fileName),
      declarations: { 'data-safety.json': JSON.stringify(STALE_DATA_SAFETY, null, 2) },
      journeys: [{ ...candidateBundle, journey: stampedCandidate, comparison }],
      redactions: ['reviewer credentials', 'test account identities'],
    });
    const journeyFiles = manifest.files.filter((f) => f.path.startsWith('journeys/'));
    assert.equal(
      journeyFiles.filter((f) => f.path.endsWith('.png')).length,
      4,
      'all step screenshots are hashed into the manifest',
    );
    assert.ok(journeyFiles.some((f) => f.path.endsWith('journey.json')));
    assert.ok(journeyFiles.some((f) => f.path.endsWith('comparison.json')));

    const verification = await verifyCapsule(capsuleDir);
    assert.equal(verification.ok, true);

    // Tampering with a sealed screenshot is detected offline.
    const shotPath = journeyFiles.find((f) => f.path.endsWith('step-004.png'))!.path;
    const shotAbs = join(capsuleDir, shotPath);
    const original = await readFile(shotAbs);
    await writeFile(shotAbs, Buffer.from([0x00, 0x01, 0x02]));
    const tampered = await verifyCapsule(capsuleDir);
    assert.equal(tampered.ok, false);
    assert.deepEqual(tampered.mismatches.map((m) => m.path), [shotPath]);
    await writeFile(shotAbs, original);
    assert.equal((await verifyCapsule(capsuleDir)).ok, true);

    // 7. Correcting declarations AND the journey flips HOLD → SHIP.
    const fixedInput = makeInput({
      dataSafety: FIXED_DATA_SAFETY,
      privacyPolicy: { kind: 'privacy_policy', text: FIXED_PRIVACY_POLICY_TEXT, importedAt: '2026-09-22T00:00:00Z' },
    });
    const repaired = await record(
      'reviewer-premium-ai-1.3.0-fixed',
      REPAIRED_SESSION,
      REPAIRED_SCREENS,
      fixedInput.candidate.artifact.sha256,
    );
    const fixedComparison = compareJourneys(baseline.journey, repaired.journey);
    assert.equal(fixedComparison.result, 'pass');

    const fixedFindings = [
      ...runTruthGapRules(fixedInput),
      ...journeyFindings(repaired.journey, fixedComparison),
    ].sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(fixedFindings, [], 'repaired declarations + journey leave no findings');

    const fixedPassport = buildPassport(
      fixedInput,
      buildClaims(fixedInput, fixedFindings),
      fixedFindings,
      [applyComparison(repaired.journey, fixedComparison)],
    );
    assert.equal(fixedPassport.decision.recommendation, 'ship');
    assert.equal(fixedPassport.journeys[0]!.result, 'pass');

    const fixedCapsuleDir = await mkdtemp(join(tmpdir(), 'attest-rt-capsule-fixed-'));
    cleanups.push(fixedCapsuleDir);
    const repairedBundle = await loadJourneyBundle(repaired.journeyPath);
    await sealCapsule(fixedCapsuleDir, {
      passport: fixedPassport,
      passportHtml: renderPassportHtml(fixedPassport),
      sarif: toSarif(fixedFindings, fixedInput.candidate.artifact.fileName),
      declarations: { 'data-safety.json': JSON.stringify(FIXED_DATA_SAFETY, null, 2) },
      journeys: [{ ...repairedBundle, comparison: fixedComparison }],
      redactions: ['reviewer credentials', 'test account identities'],
    });
    assert.equal((await verifyCapsule(fixedCapsuleDir)).ok, true);
  });
});
