import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import type { ReleasePassport } from 'attest-schema';

import { resealCapsule, sealCapsule, verifyCapsule } from '../src/capsule.js';
import { acceptException, decide, DecisionError, describeDecision, exceptionStatus, isFinalized } from '../src/decision.js';
import { diffBuilds } from '../src/diff.js';
import { inspectArtifact } from '../src/inspect.js';
import { buildPassport, humanDate, renderPassportHtml } from '../src/passport.js';
import { toSarif } from '../src/sarif.js';
import { buildClaims } from '../src/truthgraph.js';
import { runTruthGapRules, type RuleInput } from '../src/truthgap.js';
import { buildArtifact } from './fixtures/make-apk.js';
import {
  BASE_SPEC,
  CANDIDATE_SPEC,
  FIXED_DATA_SAFETY,
  FIXED_PRIVACY_POLICY_TEXT,
  PRIVACY_POLICY_TEXT,
  STALE_DATA_SAFETY,
  STORE_LISTING_TEXT,
} from './fixtures/scenario.js';

const NOW = new Date('2026-09-22T12:00:00Z');
const FUTURE = '2026-10-15';
const PAST = '2026-09-01';

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

function holdPassport(): { passport: ReleasePassport; findings: ReturnType<typeof runTruthGapRules> } {
  const input = makeInput();
  const findings = runTruthGapRules(input);
  const passport = buildPassport(input, buildClaims(input, findings), findings);
  return { passport, findings };
}

function exceptionInput(findingId: string) {
  return {
    findingId,
    owner: 'Mobile Platform',
    rationale: 'Temporary migration window',
    expiresAt: FUTURE,
    approvedBy: 'Release Lead',
  };
}

describe('exception accept', () => {
  it('overlays an exception without mutating findings or the recommendation', () => {
    const { passport, findings } = holdPassport();
    assert.equal(passport.decision.recommendation, 'hold');

    const blocking = findings.find((f) => f.state === 'confirmed_contradiction')!;
    const next = acceptException(passport, exceptionInput(blocking.id), NOW);

    // Findings byte-identical — exceptions never rewrite evidence.
    assert.deepEqual(next.findings, passport.findings);
    assert.equal(next.decision.recommendation, 'hold');
    assert.equal(next.decision.status, 'pending');

    assert.equal(next.exceptions.length, 1);
    const e = next.exceptions[0]!;
    assert.equal(e.findingId, blocking.id);
    assert.equal(e.covers, blocking.ruleId);
    assert.equal(e.artifactSha256, passport.candidate.sha256);
    assert.equal(e.owner, 'Mobile Platform');
    assert.equal(e.rationale, 'Temporary migration window');
    assert.equal(e.approvedBy, 'Release Lead');
    assert.equal(e.expiresAt, FUTURE);
    assert.match(e.approvedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(e.id, /^EX-[0-9a-f]{16}$/);

    // Id re-derives over the new document.
    assert.notEqual(next.id, passport.id);
    assert.match(next.id, /^RP-[0-9a-f]{24}$/);
  });

  it('rejects references to nonexistent findings', () => {
    const { passport } = holdPassport();
    assert.throws(
      () => acceptException(passport, exceptionInput('F-doesnotexist'), NOW),
      (err: unknown) =>
        err instanceof DecisionError && /unknown finding/.test(err.message),
    );
  });

  it('rejects expired exceptions', () => {
    const { passport, findings } = holdPassport();
    const blocking = findings.find((f) => f.state === 'confirmed_contradiction')!;
    assert.throws(
      () => acceptException(passport, { ...exceptionInput(blocking.id), expiresAt: PAST }, NOW),
      (err: unknown) => err instanceof DecisionError && /expire in the future/.test(err.message),
    );
    // An expiry earlier today than "now" also fails.
    assert.throws(
      () =>
        acceptException(
          passport,
          { ...exceptionInput(blocking.id), expiresAt: '2026-09-22T11:00:00Z' },
          NOW,
        ),
      (err: unknown) => err instanceof DecisionError && /expire in the future/.test(err.message),
    );
  });

  it('rejects missing owner/reason/approver fields', () => {
    const { passport, findings } = holdPassport();
    const blocking = findings.find((f) => f.state === 'confirmed_contradiction')!;
    for (const field of ['owner', 'rationale', 'approvedBy'] as const) {
      const input = { ...exceptionInput(blocking.id), [field]: '  ' };
      assert.throws(
        () => acceptException(passport, input, NOW),
        (err: unknown) => err instanceof DecisionError,
        `empty ${field} must be rejected`,
      );
    }
  });

  it('rejects a second active exception for the same finding', () => {
    const { passport, findings } = holdPassport();
    const blocking = findings.find((f) => f.state === 'confirmed_contradiction')!;
    const once = acceptException(passport, exceptionInput(blocking.id), NOW);
    assert.throws(
      () => acceptException(once, exceptionInput(blocking.id), NOW),
      (err: unknown) => err instanceof DecisionError && /already covered/.test(err.message),
    );
  });

  it('rejects exceptions on a finalized decision', () => {
    const { passport, findings } = holdPassport();
    const blocking = findings.find((f) => f.state === 'confirmed_contradiction')!;
    const finalized = decide(
      passport,
      { status: 'hold', decidedBy: 'Release Lead', reason: 'Blocking contradictions stand' },
      NOW,
    );
    assert.ok(isFinalized(finalized));
    assert.throws(
      () => acceptException(finalized, exceptionInput(blocking.id), NOW),
      (err: unknown) => err instanceof DecisionError && /already finalized/.test(err.message),
    );
  });
});

describe('decide', () => {
  it('ships over HOLD only with an explicit reason (override recorded)', () => {
    const { passport } = holdPassport();
    assert.equal(passport.decision.recommendation, 'hold');

    assert.throws(
      () => decide(passport, { status: 'ship', decidedBy: 'Release Lead' }, NOW),
      (err: unknown) => err instanceof DecisionError && /--reason is required/.test(err.message),
    );

    const next = decide(
      passport,
      { status: 'ship', decidedBy: 'Release Lead', reason: 'Reviewed remaining evidence' },
      NOW,
    );
    assert.equal(next.decision.recommendation, 'hold'); // unchanged
    assert.equal(next.decision.status, 'ship');
    assert.equal(next.decision.override, true);
    assert.equal(next.decision.reason, 'Reviewed remaining evidence');
    assert.equal(next.decision.decidedBy, 'Release Lead');
    assert.equal(next.findings, passport.findings);
    assert.equal(isFinalized(next), true);
  });

  it('accepts hold without a reason', () => {
    const { passport } = holdPassport();
    const next = decide(passport, { status: 'hold', decidedBy: 'Release Lead' }, NOW);
    assert.equal(next.decision.status, 'hold');
    assert.equal(next.decision.override, undefined);
    assert.equal(next.decision.reason, undefined);
  });

  it('requires --decided-by and a valid status', () => {
    const { passport } = holdPassport();
    assert.throws(
      () => decide(passport, { status: 'ship', decidedBy: '  ' }, NOW),
      (err: unknown) => err instanceof DecisionError && /--decided-by/.test(err.message),
    );
    assert.throws(
      () =>
        decide(
          passport,
          { status: 'maybe' as 'ship', decidedBy: 'X' },
          NOW,
        ),
      (err: unknown) => err instanceof DecisionError && /--status/.test(err.message),
    );
  });

  it('keeps a finalized decision immutable; a correction is a new revision', () => {
    const { passport } = holdPassport();
    const first = decide(
      passport,
      { status: 'ship', decidedBy: 'Release Lead', reason: 'Reviewed remaining evidence' },
      NOW,
    );
    const firstJson = JSON.stringify(first, null, 2);

    // Re-deciding the finalized document produces a superseding revision with
    // a different id; the caller must write it to a new file (CLI enforces).
    const corrected = decide(
      first,
      { status: 'hold', decidedBy: 'VP Release', reason: 'Changed my mind after legal review' },
      new Date('2026-09-23T09:00:00Z'),
    );
    assert.equal(corrected.revision, first.revision + 1);
    assert.equal(corrected.supersedes, first.id);
    assert.notEqual(corrected.id, first.id);
    assert.equal(corrected.decision.status, 'hold');
    // A correction does not inherit the prior revision's override flag.
    assert.equal(corrected.decision.override, undefined);
    assert.equal(corrected.decision.decidedBy, 'VP Release');

    // Original object untouched.
    assert.equal(JSON.stringify(first, null, 2), firstJson);
    assert.equal(first.decision.status, 'ship');
  });

  it('ships a repaired release without a reason', () => {
    const input = makeInput({
      dataSafety: FIXED_DATA_SAFETY,
      privacyPolicy: {
        kind: 'privacy_policy',
        text: FIXED_PRIVACY_POLICY_TEXT,
        importedAt: '2026-09-22T00:00:00Z',
      },
    });
    const findings = runTruthGapRules(input);
    assert.deepEqual(findings, []);
    const passport = buildPassport(input, buildClaims(input, findings), findings);
    assert.equal(passport.decision.recommendation, 'ship');
    const next = decide(passport, { status: 'ship', decidedBy: 'Release Lead' }, NOW);
    assert.equal(next.decision.status, 'ship');
    assert.equal(next.decision.override, undefined);
  });
});

describe('decision display', () => {
  it('renders recommendation, human decision, override, reason, and exception expiry', () => {
    const { passport, findings } = holdPassport();
    const blocking = findings.find((f) => f.state === 'confirmed_contradiction')!;
    const withException = acceptException(passport, exceptionInput(blocking.id), NOW);
    const decided = decide(
      withException,
      { status: 'ship', decidedBy: 'Release Lead', reason: 'Reviewed remaining evidence' },
      NOW,
    );

    const html = renderPassportHtml(decided);
    assert.match(html, /Attest recommendation:/);
    assert.match(html, /Human decision:/);
    assert.match(html, /SHIP/);
    assert.match(html, /Override approved by:<\/strong> Release Lead/);
    assert.match(html, /Reason:<\/strong> Reviewed remaining evidence/);
    assert.match(html, /Exception expires:<\/strong> 15 October 2026/);
    assert.match(html, /Approved exceptions \(1\)/);
    assert.match(html, /15 October 2026/);
    assert.match(html, /exceptions overlay the evidence/i);

    const lines = describeDecision(decided);
    assert.ok(lines.some((l) => l.startsWith('Attest recommendation: HOLD')));
    assert.ok(lines.includes('Human decision: SHIP'));
    assert.ok(lines.includes('Override approved by: Release Lead'));
    assert.ok(lines.includes('Reason: Reviewed remaining evidence'));
    assert.ok(lines.some((l) => l.includes('expires 15 October 2026')));
  });

  it('formats dates in the human style', () => {
    assert.equal(humanDate('2026-10-15'), '15 October 2026');
    assert.equal(humanDate('2026-01-02T10:00:00Z'), '2 January 2026');
  });

  it('flags expired exceptions', () => {
    assert.equal(
      exceptionStatus({ expiresAt: PAST } as never, NOW),
      'expired',
    );
    assert.equal(
      exceptionStatus({ expiresAt: FUTURE } as never, NOW),
      'active',
    );
    // Date-only expiry stays active through the end of that UTC day.
    assert.equal(
      exceptionStatus({ expiresAt: '2026-09-22' } as never, NOW),
      'active',
    );
  });
});

describe('exceptions + decision sealed in the Evidence Capsule', () => {
  const cleanups: string[] = [];
  after(async () => {
    await Promise.all(cleanups.map((d) => rm(d, { recursive: true, force: true })));
  });

  async function sealHold(): Promise<{ dir: string; passport: ReleasePassport; findingId: string }> {
    const { passport, findings } = holdPassport();
    const dir = await mkdtemp(join(tmpdir(), 'attest-decision-'));
    cleanups.push(dir);
    await sealCapsule(dir, {
      passport,
      passportHtml: renderPassportHtml(passport),
      sarif: toSarif(findings, passport.candidate.fileName),
      declarations: { 'data-safety.json': JSON.stringify(STALE_DATA_SAFETY, null, 2) },
      redactions: ['reviewer credentials'],
    });
    const blocking = findings.find((f) => f.state === 'confirmed_contradiction')!;
    return { dir, passport, findingId: blocking.id };
  }

  it('reseals after exception accept and decide, and still verifies offline', async () => {
    const { dir, passport, findingId } = await sealHold();
    assert.equal((await verifyCapsule(dir)).ok, true);

    const withException = acceptException(passport, exceptionInput(findingId), NOW);
    await resealCapsule(dir, withException);
    const afterException = await verifyCapsule(dir);
    assert.equal(afterException.ok, true);
    const sealedPassport = JSON.parse(await readFile(join(dir, 'passport.json'), 'utf8'));
    assert.equal(sealedPassport.exceptions.length, 1);
    assert.deepEqual(sealedPassport.findings, passport.findings);
    assert.equal(sealedPassport.decision.status, 'pending');

    const decided = decide(
      withException,
      { status: 'ship', decidedBy: 'Release Lead', reason: 'Reviewed remaining evidence' },
      NOW,
    );
    await resealCapsule(dir, decided);
    const afterDecision = await verifyCapsule(dir);
    assert.equal(afterDecision.ok, true);
    const finalPassport = JSON.parse(await readFile(join(dir, 'passport.json'), 'utf8'));
    assert.equal(finalPassport.decision.status, 'ship');
    assert.equal(finalPassport.decision.override, true);

    // Declaration evidence untouched by the reseal.
    const html = await readFile(join(dir, 'passport.html'), 'utf8');
    assert.match(html, /Reviewed remaining evidence/);
    const ds = await readFile(join(dir, 'declarations/data-safety.json'), 'utf8');
    assert.equal(ds, JSON.stringify(STALE_DATA_SAFETY, null, 2));
  });

  it('any post-decision modification fails verifyCapsule (hash or passport id)', async () => {
    const { dir, passport, findingId } = await sealHold();
    const decided = decide(
      acceptException(passport, exceptionInput(findingId), NOW),
      { status: 'ship', decidedBy: 'Release Lead', reason: 'Reviewed remaining evidence' },
      NOW,
    );
    await resealCapsule(dir, decided);
    assert.equal((await verifyCapsule(dir)).ok, true);

    // 1. Flip the decision after sealing → hash mismatch.
    const passportPath = join(dir, 'passport.json');
    const doc = JSON.parse(await readFile(passportPath, 'utf8'));
    doc.decision.status = 'hold';
    await writeFile(passportPath, JSON.stringify(doc, null, 2), 'utf8');
    const tampered = await verifyCapsule(dir);
    assert.equal(tampered.ok, false);
    assert.deepEqual(tampered.mismatches.map((m) => m.path), ['passport.json']);

    // 2. Attacker fixes the manifest hash but not the content-addressed id.
    const manifestPath = join(dir, 'capsule-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const { createHash } = await import('node:crypto');
    const bytes = await readFile(passportPath);
    const entry = manifest.files.find((f: { path: string }) => f.path === 'passport.json');
    entry.sha256 = createHash('sha256').update(bytes).digest('hex');
    entry.bytes = bytes.length;
    const canonical = [...manifest.files]
      .sort((a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path))
      .map((f: { sha256: string; path: string }) => `${f.sha256}  ${f.path}`)
      .join('\n');
    manifest.evidenceRootHash = createHash('sha256').update(canonical).digest('hex');
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    const idTampered = await verifyCapsule(dir);
    assert.equal(idTampered.ok, false);
    assert.ok(idTampered.errors.some((e) => /Passport id mismatch/.test(e)));
  });
});
