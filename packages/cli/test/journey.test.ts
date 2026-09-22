import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import type { Journey } from 'attest-schema';

import { AdbDevice, listAdbDevices, parseFocusedActivity } from '../src/adb.js';
import {
  applyComparison,
  compareJourneys,
  credentialReadiness,
  journeyFindings,
  journeyId,
  loadJourneyBundle,
  recordJourney,
  renderReviewerInstructions,
} from '../src/journey.js';
import {
  BASELINE_SESSION,
  BASELINE_SCREENS,
  FAILURE_SESSION,
  FAILURE_SCREENS,
  PULSEFIT_CREDENTIAL_REF,
  REPAIRED_SESSION,
  REPAIRED_SCREENS,
  answersFor,
  fakeAdbDevice,
  fakeAdbExec,
  scriptedDevice,
  scriptedIO,
} from './fixtures/journey.js';

const FIXED_NOW = new Date('2026-09-22T12:00:00.000Z');

async function recordSession(
  name: string,
  session: typeof BASELINE_SESSION,
  screens: typeof BASELINE_SCREENS,
  artifactSha256?: string,
) {
  const outDir = await mkdtemp(join(tmpdir(), 'attest-journey-'));
  const recorded = await recordJourney({
    name,
    title: 'Reviewer reaches premium AI feature',
    credentialRef: PULSEFIT_CREDENTIAL_REF,
    artifactSha256,
    device: scriptedDevice('emulator-5554', screens),
    io: scriptedIO(answersFor(session)),
    outDir,
    now: () => FIXED_NOW,
  });
  return { ...recorded, outDir };
}

describe('Reviewer Twin recorder', () => {
  const cleanups: string[] = [];
  after(async () => {
    await Promise.all(cleanups.map((d) => rm(d, { recursive: true, force: true })));
  });

  it('records steps with screenshot, activity, status, timestamps, and device metadata', async () => {
    const { journey, journeyPath, files, outDir } = await recordSession(
      'reviewer-premium-ai-1.2.0',
      BASELINE_SESSION,
      BASELINE_SCREENS,
      'a'.repeat(64),
    );
    cleanups.push(outDir);

    assert.equal(journey.schemaVersion, 'attest.journey/1');
    assert.equal(journey.kind, 'reviewer');
    assert.equal(journey.recordedBy, 'human-guided');
    assert.equal(journey.steps.length, 5);
    assert.equal(journey.lastRunResult, 'pass');
    assert.equal(journey.artifactSha256, 'a'.repeat(64));
    assert.deepEqual(journey.device, {
      serial: 'emulator-5554',
      manufacturer: 'Google',
      model: 'sdk_gphone64_x86_64',
      androidRelease: '14',
      apiLevel: 34,
    });

    const step4 = journey.steps[3]!;
    assert.equal(step4.order, 4);
    assert.equal(step4.status, 'pass');
    assert.equal(step4.expectedState, BASELINE_SESSION[3]!.expected);
    assert.equal(step4.observedState, BASELINE_SESSION[3]!.observed);
    assert.equal(step4.activity, 'app.pulsefit.PremiumAiActivity');
    assert.equal(step4.capturedAt, FIXED_NOW.toISOString());
    assert.ok(step4.screenshot);
    assert.equal(step4.evidencePaths.length, 1);

    // Screenshots exist on disk, match the recorded hash, and are real PNGs.
    const png = await readFile(join(outDir, step4.screenshot!.path));
    assert.deepEqual(png, files[step4.screenshot!.path]);
    assert.deepEqual(png.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    // Journey JSON round-trips through the loader with its evidence.
    const bundle = await loadJourneyBundle(journeyPath);
    assert.equal(bundle.journey.id, journey.id);
    assert.equal(Object.keys(bundle.files).length, 5);
    assert.equal(bundle.comparison, undefined);
  });

  it('stores credential references and expiry but never a secret', async () => {
    const { journey, outDir } = await recordSession(
      'reviewer-creds',
      BASELINE_SESSION.slice(0, 1),
      BASELINE_SCREENS.slice(0, 1),
    );
    cleanups.push(outDir);

    assert.deepEqual(journey.credentialRef, PULSEFIT_CREDENTIAL_REF);
    // Only label + expiry are representable — no secret-shaped keys anywhere.
    const json = JSON.stringify(journey);
    assert.ok(!/"password"|"secret"|"token"|"otp"/i.test(json), 'no secret-shaped keys in journey JSON');
    assert.deepEqual(Object.keys(journey.credentialRef!).sort(), ['expiresAt', 'label']);
  });

  it('derives a content-addressed, stable journey id', async () => {
    const a = await recordSession('stable-id', BASELINE_SESSION.slice(0, 1), BASELINE_SCREENS.slice(0, 1));
    const b = await recordSession('stable-id', BASELINE_SESSION.slice(0, 1), BASELINE_SCREENS.slice(0, 1));
    cleanups.push(a.outDir, b.outDir);
    assert.equal(a.journey.id, b.journey.id);
    assert.match(a.journey.id, /^JN-[0-9a-f]{24}$/);
    const { id: _id, ...doc } = a.journey;
    assert.equal(a.journey.id, journeyId(doc));
  });

  it('rejects an empty session and a non-slug name', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'attest-journey-'));
    cleanups.push(outDir);
    await assert.rejects(
      recordJourney({
        name: 'empty',
        device: scriptedDevice('emulator-5554', []),
        io: scriptedIO(['']),
        outDir,
      }),
      /at least one/,
    );
    await assert.rejects(
      recordJourney({
        name: 'bad name!',
        device: scriptedDevice('emulator-5554', BASELINE_SCREENS),
        io: scriptedIO(answersFor(BASELINE_SESSION)),
        outDir,
      }),
      /slug/,
    );
  });
});

describe('journey comparison — first changed or failed step', () => {
  let baseline: Journey;
  let baselineDir: string;

  it('setup: records the approved baseline', async () => {
    const recorded = await recordSession(
      'reviewer-premium-ai-1.2.0',
      BASELINE_SESSION,
      BASELINE_SCREENS,
      'b'.repeat(64),
    );
    baseline = recorded.journey;
    baselineDir = recorded.outDir;
  });

  it('identifies step four as the first changed and first failed step', async () => {
    const { journey: candidate, outDir } = await recordSession(
      'reviewer-premium-ai-1.3.0',
      FAILURE_SESSION,
      FAILURE_SCREENS,
      'c'.repeat(64),
    );
    const comparison = compareJourneys(baseline, candidate, { now: () => FIXED_NOW });

    assert.equal(comparison.result, 'fail');
    assert.equal(comparison.firstFailedStep, 4);
    assert.equal(comparison.firstChangedStep, 4);
    assert.match(comparison.summary, /FAILED at step 4 of 5/);
    assert.equal(comparison.steps.length, 5); // union: candidate stopped at 4
    assert.equal(comparison.steps[3]!.change, 'failed');
    assert.equal(comparison.steps[4]!.change, 'missing');
    assert.match(comparison.steps[3]!.reason, /expected .* but observed/);
    assert.match(comparison.id, /^JC-[0-9a-f]{24}$/);

    const stamped = applyComparison(candidate, comparison, { now: () => FIXED_NOW });
    assert.equal(stamped.lastRunResult, 'fail');
    assert.equal(stamped.firstChangedStep, 4);
    await rm(outDir, { recursive: true, force: true });
  });

  it('reports a healthy re-run as unchanged and passing', async () => {
    const { journey: repaired, outDir } = await recordSession(
      'reviewer-premium-ai-1.3.0-fixed',
      REPAIRED_SESSION,
      REPAIRED_SCREENS,
      'c'.repeat(64),
    );
    const comparison = compareJourneys(baseline, repaired, { now: () => FIXED_NOW });
    assert.equal(comparison.result, 'pass');
    assert.equal(comparison.firstChangedStep, undefined);
    assert.equal(comparison.firstFailedStep, undefined);
    assert.ok(comparison.steps.every((s) => s.change === 'unchanged'));
    assert.match(comparison.summary, /PASSED — 5 steps match/);
    await rm(outDir, { recursive: true, force: true });
  });

  it('flags an edited expected state as a change even when the run passes', async () => {
    const edited = REPAIRED_SESSION.map((s, i) =>
      i === 2 ? { ...s, expected: 'Settings screen with an Account entry only' } : s,
    );
    const { journey, outDir } = await recordSession(
      'reviewer-edited',
      edited,
      REPAIRED_SCREENS,
    );
    const comparison = compareJourneys(baseline, journey);
    assert.equal(comparison.result, 'pass');
    assert.equal(comparison.firstChangedStep, 3);
    assert.equal(comparison.steps[2]!.change, 'changed');
    await rm(outDir, { recursive: true, force: true });
    await rm(baselineDir, { recursive: true, force: true });
  });
});

describe('journey findings feed the Passport', () => {
  it('emits a confirmed contradiction for the failed step', async () => {
    const { journey: baseline, outDir: bDir } = await recordSession(
      'jf-baseline',
      BASELINE_SESSION,
      BASELINE_SCREENS,
    );
    const { journey: candidate, outDir: cDir } = await recordSession(
      'jf-candidate',
      FAILURE_SESSION,
      FAILURE_SCREENS,
    );
    const comparison = compareJourneys(baseline, candidate);
    const findings = journeyFindings(candidate, comparison);

    assert.equal(findings.length, 1);
    const f = findings[0]!;
    assert.equal(f.ruleId, 'JT-001');
    assert.equal(f.state, 'confirmed_contradiction');
    assert.equal(f.severity, 'high');
    assert.equal(f.subject, 'jf-candidate');
    assert.match(f.summary, /failed at step 4/);
    assert.equal(f.sources[0]!.kind, 'journey');
    assert.equal(f.sources[0]!.evidenceClass, 'observed');
    assert.equal(f.sources[0]!.excerpt, FAILURE_SESSION[3]!.observed);
    assert.equal(f.sources[1]!.evidenceClass, 'attested');
    assert.match(f.comparison, /approved\(JN-/);

    // Deterministic id: same inputs, same finding.
    assert.deepEqual(journeyFindings(candidate, comparison)[0]!.id, f.id);
    assert.match(f.id, /^F-[0-9a-f]{16}$/);

    await rm(bDir, { recursive: true, force: true });
    await rm(cDir, { recursive: true, force: true });
  });

  it('fires from a recorded failure even without a baseline comparison', async () => {
    const { journey, outDir } = await recordSession('solo-fail', FAILURE_SESSION, FAILURE_SCREENS);
    const findings = journeyFindings(journey);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.ruleId, 'JT-001');
    assert.match(findings[0]!.comparison, /expected\(.*\) vs observed\(.*\) at step 4/);
    await rm(outDir, { recursive: true, force: true });
  });

  it('requires review for a passing-but-changed run, and stays silent when identical', async () => {
    const { journey: baseline, outDir: bDir } = await recordSession(
      'jt-baseline',
      BASELINE_SESSION,
      BASELINE_SCREENS,
    );
    const edited = BASELINE_SESSION.map((s, i) =>
      i === 0 ? { ...s, action: 'Launch PulseFit and accept notifications' } : s,
    );
    const { journey: changed, outDir: cDir } = await recordSession('jt-changed', edited, BASELINE_SCREENS);
    const { journey: same, outDir: sDir } = await recordSession('jt-same', BASELINE_SESSION, BASELINE_SCREENS);

    const changedFindings = journeyFindings(changed, compareJourneys(baseline, changed));
    assert.equal(changedFindings.length, 1);
    assert.equal(changedFindings[0]!.ruleId, 'JT-002');
    assert.equal(changedFindings[0]!.state, 'changed_requires_review');

    assert.deepEqual(journeyFindings(same, compareJourneys(baseline, same)), []);

    await rm(bDir, { recursive: true, force: true });
    await rm(cDir, { recursive: true, force: true });
    await rm(sDir, { recursive: true, force: true });
  });
});

describe('credential readiness', () => {
  it('classifies expiry without ever seeing the secret', () => {
    const now = FIXED_NOW;
    assert.equal(credentialReadiness(undefined, now), 'unknown');
    assert.equal(credentialReadiness({ label: 'x' }, now), 'unknown');
    assert.equal(credentialReadiness({ label: 'x', expiresAt: 'not-a-date' }, now), 'unknown');
    assert.equal(credentialReadiness({ label: 'x', expiresAt: '2026-01-01T00:00:00Z' }, now), 'expired');
    assert.equal(credentialReadiness({ label: 'x', expiresAt: '2026-09-25T00:00:00Z' }, now), 'expiring_soon');
    assert.equal(credentialReadiness({ label: 'x', expiresAt: '2027-01-15T00:00:00Z' }, now), 'ready');
    assert.equal(credentialReadiness(PULSEFIT_CREDENTIAL_REF, now), 'ready');
  });
});

describe('reviewer instructions', () => {
  it('contains exact steps, expected/observed results, and embedded screenshots', async () => {
    const { journey: baseline, outDir: bDir } = await recordSession(
      'ri-baseline',
      BASELINE_SESSION,
      BASELINE_SCREENS,
    );
    const { journey: candidate, outDir: cDir } = await recordSession(
      'ri-candidate',
      FAILURE_SESSION,
      FAILURE_SCREENS,
    );
    const comparison = compareJourneys(baseline, candidate);
    const bundle = await loadJourneyBundle(cDir + '/ri-candidate.json');
    const html = renderReviewerInstructions(bundle, comparison, { now: () => FIXED_NOW });

    assert.match(html, /Reviewer instructions/);
    assert.match(html, /Exact step/);
    assert.match(html, /Expected visible result/);
    assert.match(html, /Observed result/);
    assert.match(html, /Tap &quot;Premium AI Coach&quot;|Tap "Premium AI Coach"/);
    assert.match(html, /Something went wrong/);
    // 4 screenshots for 4 recorded steps, inlined as data URIs.
    assert.equal(html.match(/data:image\/png;base64,/gu)?.length, 4);
    // Failed-step comparison callout with the first failed step.
    assert.match(html, /FAILED at step 4/);
    assert.match(html, /First failed step: <strong>4<\/strong>/);
    // Credential reference + readiness, no secret.
    assert.match(html, /team vault \(ref only\)/);
    assert.match(html, /Readiness<\/dt><dd><strong>ready<\/strong>/);
    assert.ok(!html.includes('TOTP secret'), 'instructions must not embed secrets');
    // Self-contained: no external asset references.
    assert.ok(!/src="http/u.test(html));

    await rm(bDir, { recursive: true, force: true });
    await rm(cDir, { recursive: true, force: true });
  });
});

describe('ADB bridge', () => {
  it('parses device metadata from getprop', async () => {
    const device = fakeAdbDevice('emulator-5554', {
      'getprop ro.product.manufacturer': 'Google\n',
      'getprop ro.product.model': 'sdk_gphone64_x86_64\n',
      'getprop ro.build.version.release': '14\n',
      'getprop ro.build.version.sdk': '34\n',
    });
    assert.deepEqual(await device.metadata(), {
      serial: 'emulator-5554',
      manufacturer: 'Google',
      model: 'sdk_gphone64_x86_64',
      androidRelease: '14',
      apiLevel: 34,
    });
  });

  it('asserts the device state and passes screencap bytes through', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const device = fakeAdbDevice('emulator-5554', {
      'get-state': 'device\n',
      'screencap -p': png,
    });
    await device.assertConnected();
    assert.deepEqual(await device.screenshot(), png);

    const offline = fakeAdbDevice('emulator-5554', { 'get-state': 'offline\n' });
    await assert.rejects(offline.assertConnected(), /reports state "offline"/);
  });

  it('parses the focused activity across dumpsys shapes', () => {
    assert.equal(
      parseFocusedActivity(
        '  mCurrentFocus=Window{abc123 u0 app.pulsefit/app.pulsefit.MainActivity}\n',
      ),
      'app.pulsefit.MainActivity',
    );
    assert.equal(
      parseFocusedActivity(
        '  mCurrentFocus=Window{abc u0 app.pulsefit/.SettingsActivity}\n',
      ),
      'app.pulsefit.SettingsActivity',
    );
    assert.equal(
      parseFocusedActivity(
        '  topResumedActivity=ActivityRecord{def u0 app.pulsefit/.PremiumAiActivity t42}\n',
      ),
      'app.pulsefit.PremiumAiActivity',
    );
    assert.equal(parseFocusedActivity('no focus here'), undefined);
  });

  it('reads current activity from a fake dumpsys and lists devices', async () => {
    const dumpsys =
      'WINDOW MANAGER LAST ANR\n  mCurrentFocus=Window{1 u0 app.pulsefit/.MainActivity}\n';
    const device = fakeAdbDevice('emulator-5554', { dumpsys: dumpsys });
    assert.equal(await device.currentActivity(), 'app.pulsefit.MainActivity');

    const devices = await listAdbDevices(
      fakeAdbExec({ devices: 'List of devices attached\nemulator-5554\tdevice\noffline-1\toffline\n' }),
    );
    assert.deepEqual(devices, ['emulator-5554']);
  });

  it('surfaces a missing adb binary with actionable guidance', async () => {
    const device = new AdbDevice('emulator-5554', async () => {
      const err = new Error('spawn adb ENOENT') as Error & { code: string };
      err.code = 'ENOENT';
      throw new Error(`adb not found on PATH (${err.message}). Install Android platform-tools and retry.`);
    });
    await assert.rejects(device.assertConnected(), /Install Android platform-tools/);
  });
});

describe('journey bundle round-trip', () => {
  it('loads a comparison persisted next to the candidate journey', async () => {
    const { journey: baseline, outDir } = await recordSession(
      'rt-baseline',
      BASELINE_SESSION,
      BASELINE_SCREENS,
    );
    const { journey: candidate, outDir: cDir } = await recordSession(
      'rt-candidate',
      FAILURE_SESSION,
      FAILURE_SCREENS,
    );
    const comparison = compareJourneys(baseline, candidate);
    await writeFile(join(cDir, `${candidate.id}.comparison.json`), JSON.stringify(comparison, null, 2));

    const bundle = await loadJourneyBundle(join(cDir, 'rt-candidate.json'));
    assert.ok(bundle.comparison);
    assert.equal(bundle.comparison.id, comparison.id);
    // A comparison for another journey is ignored.
    const baselineBundle = await loadJourneyBundle(join(outDir, 'rt-baseline.json'));
    assert.equal(baselineBundle.comparison, undefined);

    await rm(outDir, { recursive: true, force: true });
    await rm(cDir, { recursive: true, force: true });
  });
});
