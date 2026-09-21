import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { diffBuilds } from '../src/diff.js';
import { inspectArtifact } from '../src/inspect.js';
import { runTruthGapRules, TRUTH_GAP_RULES, type RuleInput } from '../src/truthgap.js';
import { buildArtifact } from './fixtures/make-apk.js';
import {
  BASE_SPEC,
  CANDIDATE_SPEC,
  PRIVACY_POLICY_TEXT,
  STALE_DATA_SAFETY,
} from './fixtures/scenario.js';

function makeInput(withDeclarations = true): RuleInput {
  const base = inspectArtifact(buildArtifact(BASE_SPEC), 'pulsefit-1.2.0.apk');
  const candidate = inspectArtifact(buildArtifact(CANDIDATE_SPEC), 'pulsefit-1.3.0.apk');
  return {
    base,
    candidate,
    diff: diffBuilds(base, candidate),
    dataSafety: withDeclarations ? STALE_DATA_SAFETY : undefined,
    privacyPolicy: withDeclarations
      ? { kind: 'privacy_policy', text: PRIVACY_POLICY_TEXT, importedAt: '2026-09-21T00:00:00Z' }
      : undefined,
  };
}

describe('truth-gap rules (the MVP signature)', () => {
  const findings = runTruthGapRules(makeInput());

  it('ships exactly five high-confidence rules', () => {
    assert.equal(TRUTH_GAP_RULES.length, 5);
    assert.deepEqual(
      TRUTH_GAP_RULES.map((r) => r.id),
      ['TG-001', 'TG-002', 'TG-003', 'TG-004', 'TG-005'],
    );
  });

  it('TG-001: new CAMERA permission contradicts the Data Safety form', () => {
    const f = findings.find((x) => x.ruleId === 'TG-001' && x.subject === 'android.permission.CAMERA');
    assert.ok(f);
    assert.equal(f.state, 'confirmed_contradiction');
    assert.equal(f.severity, 'high');
    assert.ok(f.sources.some((s) => s.evidenceClass === 'observed'));
    assert.ok(f.sources.some((s) => s.evidenceClass === 'declared'));
  });

  it('TG-002: new Amplitude SDK is disclosed nowhere', () => {
    const f = findings.find((x) => x.ruleId === 'TG-002' && x.subject === 'com.amplitude');
    assert.ok(f);
    assert.equal(f.state, 'confirmed_contradiction');
    assert.match(f.summary, /Amplitude/);
  });

  it('TG-003: new destination metrics.amplitude.com is not disclosed', () => {
    const f = findings.find((x) => x.ruleId === 'TG-003' && x.subject === 'metrics.amplitude.com');
    assert.ok(f);
    assert.equal(f.state, 'changed_requires_review');
  });

  it('TG-004: declared calendar collection has no build evidence', () => {
    const f = findings.find((x) => x.ruleId === 'TG-004' && x.subject === 'calendar.calendar_events');
    assert.ok(f);
    assert.equal(f.state, 'evidence_missing');
  });

  it('TG-005: removed RECORD_AUDIO is still declared', () => {
    const f = findings.find((x) => x.ruleId === 'TG-005' && x.subject === 'android.permission.RECORD_AUDIO');
    assert.ok(f);
    assert.equal(f.state, 'changed_requires_review');
  });

  it('does not flag the consistent location claim', () => {
    assert.equal(
      findings.some((f) => f.subject === 'location.precise_location' && f.ruleId === 'TG-004'),
      false,
    );
    assert.equal(
      findings.some((f) => f.subject === 'android.permission.ACCESS_FINE_LOCATION'),
      false,
    );
  });

  it('is deterministic: identical inputs yield identical finding ids', () => {
    const again = runTruthGapRules(makeInput());
    assert.deepEqual(
      findings.map((f) => f.id),
      again.map((f) => f.id),
    );
  });

  it('degrades to evidence_missing (never silence) without declarations', () => {
    const bare = runTruthGapRules(makeInput(false));
    const tg001 = bare.find((x) => x.ruleId === 'TG-001');
    const tg002 = bare.find((x) => x.ruleId === 'TG-002');
    assert.equal(tg001!.state, 'evidence_missing');
    assert.equal(tg002!.state, 'evidence_missing');
    assert.equal(bare.some((f) => f.state === 'confirmed_contradiction'), false);
  });
});
