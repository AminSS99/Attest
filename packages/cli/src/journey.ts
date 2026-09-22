/**
 * Reviewer Twin (PRODUCT_PLAN §6.2): a human-guided journey recorder over ADB,
 * baseline comparison with first-changed/first-failed-step detection, journey
 * findings that feed the Release Passport, credential-readiness checks
 * (references only — secrets never enter evidence), and self-contained
 * reviewer instructions with embedded screenshots.
 *
 * Recording is deliberately human-guided: the developer performs every action
 * by hand; Attest captures screenshot, activity, expected/observed state,
 * status, and device metadata around each step.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  FINDING_SCHEMA_VERSION,
  JOURNEY_COMPARISON_SCHEMA_VERSION,
  JOURNEY_SCHEMA_VERSION,
  type CredentialRef,
  type DeviceMetadata,
  type Finding,
  type FindingState,
  type Journey,
  type JourneyComparison,
  type JourneyKind,
  type JourneyResult,
  type JourneyStep,
  type JourneyStepDelta,
  type RuleDescriptor,
  type Severity,
  type SourceRef,
  type StepResult,
} from 'attest-schema';

import { esc } from './passport.js';

export const STEP_RESULTS: readonly StepResult[] = ['pass', 'fail', 'blocked'] as const;

function isStepResult(v: string): v is StepResult {
  return (STEP_RESULTS as readonly string[]).includes(v);
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

// ---------------------------------------------------------------------------
// Credential readiness (PRODUCT_PLAN §6.2, §9 weeks 5–6)
// ---------------------------------------------------------------------------

export type CredentialReadiness = 'ready' | 'expiring_soon' | 'expired' | 'unknown';

/**
 * Expiry-based readiness for a credential *reference*. Attest stores the label
 * and expiry only; checking readiness must never require the secret itself.
 */
export function credentialReadiness(
  ref: CredentialRef | undefined,
  now: Date = new Date(),
  warnDays = 14,
): CredentialReadiness {
  if (!ref?.expiresAt) return 'unknown';
  const expires = Date.parse(ref.expiresAt);
  if (Number.isNaN(expires)) return 'unknown';
  const remainingMs = expires - now.getTime();
  if (remainingMs <= 0) return 'expired';
  if (remainingMs <= warnDays * 86_400_000) return 'expiring_soon';
  return 'ready';
}

// ---------------------------------------------------------------------------
// Identity + serialization
// ---------------------------------------------------------------------------

/** Content-addressed journey id: JN- + sha256 of the document without its id. */
export function journeyId(doc: Journey | Omit<Journey, 'id'>): string {
  const { id: _omit, ...rest } = doc as Journey;
  return `JN-${sha256Hex(JSON.stringify(rest)).slice(0, 24)}`;
}

/** Canonical on-disk bytes for a journey. The capsule seals the same serialization. */
export function serializeJourney(journey: Journey): string {
  return JSON.stringify(journey, null, 2);
}

export function deriveJourneyResult(steps: readonly { status: StepResult }[]): JourneyResult {
  if (steps.some((s) => s.status === 'fail')) return 'fail';
  if (steps.some((s) => s.status === 'blocked')) return 'blocked';
  return 'pass';
}

// ---------------------------------------------------------------------------
// Recorder
// ---------------------------------------------------------------------------

export interface RecorderIO {
  /** Ask the operator a question; `default` is displayed in brackets by real terminals. */
  prompt(message: string, opts?: { default?: string }): Promise<string>;
}

/** What the recorder needs from a device. `AdbDevice` implements this. */
export interface DeviceBridge {
  readonly serial: string;
  metadata(): Promise<DeviceMetadata>;
  currentActivity(): Promise<string | undefined>;
  screenshot(): Promise<Buffer>;
}

export interface RecordJourneyOptions {
  /** Slug used for the JSON file and screenshot folder, e.g. "reviewer-premium-ai". */
  name: string;
  title?: string;
  kind?: JourneyKind;
  /** Credential *reference* and expiry — never the secret itself. */
  credentialRef?: CredentialRef;
  artifactSha256?: string;
  device: DeviceBridge;
  io: RecorderIO;
  /** Directory that receives `<name>.json` and `<name>/step-*.png` (created as needed). */
  outDir: string;
  now?: () => Date;
}

export interface RecordedJourney {
  journey: Journey;
  /** Absolute path of the written journey JSON. */
  journeyPath: string;
  /** Screenshot bytes keyed by evidence path relative to the journey JSON. */
  files: Record<string, Buffer>;
}

/**
 * Human-guided recording loop: prompt for the action, let the operator perform
 * it, then capture screenshot + foreground activity + observed state + status.
 * An empty action on the first prompt is an error; on later prompts it ends
 * the session.
 */
export async function recordJourney(opts: RecordJourneyOptions): Promise<RecordedJourney> {
  const name = opts.name.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(
      `Journey name must be a slug of letters, digits, ".", "_", "-"; got "${opts.name}".`,
    );
  }
  const kind = opts.kind ?? 'reviewer';
  const now = opts.now ?? (() => new Date());
  const device = await opts.device.metadata();
  const steps: JourneyStep[] = [];
  const files: Record<string, Buffer> = {};
  await mkdir(join(opts.outDir, name), { recursive: true });

  for (;;) {
    const order = steps.length + 1;
    const action = (
      await opts.io.prompt(`Step ${order} — what do you do? (Enter on an empty answer to finish)`)
    ).trim();
    if (action === '') {
      if (steps.length === 0) throw new Error('A journey needs at least one recorded step.');
      break;
    }

    const expectedState = (await opts.io.prompt(`Step ${order} — expected visible result`)).trim();
    if (expectedState === '') {
      throw new Error(`Step ${order} needs an expected visible result.`);
    }

    await opts.io.prompt(
      `Perform step ${order} on ${opts.device.serial} now, then press Enter to capture`,
    );
    const activity = await opts.device.currentActivity();
    const png = await opts.device.screenshot();
    const evidencePath = `${name}/step-${String(order).padStart(3, '0')}.png`;
    files[evidencePath] = png;

    const observedAnswer = (
      await opts.io.prompt(`Step ${order} — observed result`, { default: activity ?? '' })
    ).trim();
    const observedState = observedAnswer || activity || '(not captured)';

    let status = (
      await opts.io.prompt(`Step ${order} — result [pass/fail/blocked]`, { default: 'pass' })
    )
      .trim()
      .toLowerCase();
    if (status === '') status = 'pass';
    for (let attempt = 1; !isStepResult(status) && attempt < 5; attempt++) {
      status = (
        await opts.io.prompt(`Step ${order} — result must be pass, fail, or blocked`, {
          default: 'pass',
        })
      )
        .trim()
        .toLowerCase();
      if (status === '') status = 'pass';
    }
    if (!isStepResult(status)) {
      throw new Error(`Step ${order}: result must be pass, fail, or blocked.`);
    }

    const note = (await opts.io.prompt(`Step ${order} — note (optional, Enter to skip)`)).trim();

    steps.push({
      order,
      action,
      expectedState,
      observedState,
      status,
      capturedAt: now().toISOString(),
      activity,
      screenshot: { path: evidencePath, sha256: sha256Hex(png) },
      ...(note ? { note } : {}),
      evidencePaths: [evidencePath],
    });
  }

  const recordedAt = now().toISOString();
  const doc: Omit<Journey, 'id'> = {
    schemaVersion: JOURNEY_SCHEMA_VERSION,
    name,
    kind,
    title: opts.title?.trim() || name,
    artifactSha256: opts.artifactSha256,
    device,
    steps,
    credentialRef: opts.credentialRef,
    recordedBy: 'human-guided',
    recordedAt,
    lastRunAt: recordedAt,
    lastRunResult: deriveJourneyResult(steps),
  };
  const journey: Journey = { ...doc, id: journeyId(doc) };

  for (const [rel, bytes] of Object.entries(files)) {
    const abs = join(opts.outDir, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
  }
  const journeyPath = join(opts.outDir, `${name}.json`);
  await writeFile(journeyPath, serializeJourney(journey), 'utf8');

  return { journey, journeyPath, files };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export interface JourneyBundle {
  journey: Journey;
  /** Bytes keyed by evidence path relative to the journey JSON file. */
  files: Record<string, Buffer>;
  /** Baseline comparison, when `comparison.json` sits next to the journey. */
  comparison?: JourneyComparison;
}

/**
 * Load a journey JSON (or a directory containing `journey.json`) plus its
 * screenshot evidence. Missing media never blocks loading the text record.
 */
export async function loadJourneyBundle(path: string): Promise<JourneyBundle> {
  let journeyPath = path;
  const info = await stat(path);
  if (info.isDirectory()) journeyPath = join(path, 'journey.json');

  const journey = JSON.parse(await readFile(journeyPath, 'utf8')) as Journey;
  if (journey.schemaVersion !== JOURNEY_SCHEMA_VERSION) {
    throw new Error(`Unsupported journey schema "${journey.schemaVersion}" in ${journeyPath}.`);
  }

  const baseDir = dirname(journeyPath);
  const files: Record<string, Buffer> = {};
  for (const step of journey.steps) {
    for (const rel of step.evidencePaths) {
      if (files[rel]) continue;
      try {
        files[rel] = await readFile(join(baseDir, rel));
      } catch {
        // Missing media is reported at render time; the step record still stands.
      }
    }
  }

  const bundle: JourneyBundle = { journey, files };
  // A persisted comparison sits next to the journey: id-named by
  // `journey compare`, or `comparison.json` when copied beside the journey.
  for (const candidateName of ['comparison.json', `${journey.id}.comparison.json`]) {
    try {
      const cmp = JSON.parse(await readFile(join(baseDir, candidateName), 'utf8')) as JourneyComparison;
      if (cmp.schemaVersion === JOURNEY_COMPARISON_SCHEMA_VERSION && cmp.candidate.id === journey.id) {
        bundle.comparison = cmp;
        break;
      }
    } catch {
      // No (usable) comparison under this name.
    }
  }
  return bundle;
}

// ---------------------------------------------------------------------------
// Comparison — the first step that changed or failed
// ---------------------------------------------------------------------------

export interface CompareOptions {
  now?: () => Date;
}

function stepSide(s: JourneyStep): JourneyStepDelta['candidate'] {
  return {
    status: s.status,
    expectedState: s.expectedState,
    observedState: s.observedState,
    activity: s.activity,
  };
}

function deltaFor(order: number, b?: JourneyStep, c?: JourneyStep): JourneyStepDelta {
  if (!c && b) {
    return {
      order,
      action: b.action,
      change: 'missing',
      baseline: stepSide(b),
      reason: `Step ${order} exists in the approved baseline but was never reached in the candidate run.`,
    };
  }
  if (!b && c) {
    return {
      order,
      action: c.action,
      change: 'added',
      candidate: stepSide(c),
      reason: `Step ${order} is new in the candidate run and has no baseline counterpart.`,
    };
  }
  const base = b!;
  const cand = c!;
  const shared = { order, action: cand.action, baseline: stepSide(base), candidate: stepSide(cand) };
  if (cand.status === 'fail') {
    return {
      ...shared,
      change: 'failed',
      reason: `Candidate step ${order} failed: expected "${cand.expectedState}" but observed "${cand.observedState}".`,
    };
  }
  if (cand.status === 'blocked') {
    return {
      ...shared,
      change: 'blocked',
      reason: `Candidate step ${order} was blocked: ${cand.observedState}`,
    };
  }
  if (base.status !== cand.status) {
    return {
      ...shared,
      change: 'changed',
      reason: `Status changed from ${base.status} to ${cand.status} at step ${order}.`,
    };
  }
  if (base.action !== cand.action) {
    return {
      ...shared,
      change: 'changed',
      reason: `Action changed at step ${order}: "${base.action}" → "${cand.action}".`,
    };
  }
  if (base.expectedState !== cand.expectedState) {
    return {
      ...shared,
      change: 'changed',
      reason: `Expected visible result changed at step ${order}: "${base.expectedState}" → "${cand.expectedState}".`,
    };
  }
  return {
    ...shared,
    change: 'unchanged',
    reason: 'Action, expected visible result, and status match the approved baseline.',
  };
}

export function comparisonId(doc: JourneyComparison | Omit<JourneyComparison, 'id'>): string {
  const { id: _omit, ...rest } = doc as JourneyComparison;
  return `JC-${sha256Hex(JSON.stringify(rest)).slice(0, 24)}`;
}

/**
 * Compare a candidate run against the previously approved journey and identify
 * the first changed step and the first failed step. Observed wording alone does
 * not count as a change — action, expected visible result, and status do — so a
 * healthy re-run stays `unchanged` even when the operator phrases observations
 * differently.
 */
export function compareJourneys(
  baseline: Journey,
  candidate: Journey,
  opts: CompareOptions = {},
): JourneyComparison {
  const now = opts.now ?? (() => new Date());
  const baseByOrder = new Map(baseline.steps.map((s) => [s.order, s]));
  const candByOrder = new Map(candidate.steps.map((s) => [s.order, s]));
  const orders = [...new Set([...baseByOrder.keys(), ...candByOrder.keys()])].sort(
    (a, b) => a - b,
  );
  const steps = orders.map((order) =>
    deltaFor(order, baseByOrder.get(order), candByOrder.get(order)),
  );

  const firstFailed = steps.find((d) => d.change === 'failed' || d.change === 'blocked');
  const firstMissing = steps.find((d) => d.change === 'missing');
  const firstChanged = steps.find((d) => d.change !== 'unchanged');

  let result: JourneyResult = 'pass';
  if (steps.some((d) => d.change === 'failed')) result = 'fail';
  else if (steps.some((d) => d.change === 'blocked')) result = 'blocked';
  else if (firstMissing) result = 'fail'; // incomplete run counts as failure

  const total = orders.length;
  let summary: string;
  if (result === 'pass') {
    summary = firstChanged
      ? `PASSED with changes — first changed step ${firstChanged.order} of ${total}.`
      : `PASSED — ${total} step${total === 1 ? '' : 's'} match the approved baseline.`;
  } else if (firstFailed) {
    const label = result === 'blocked' ? 'BLOCKED' : 'FAILED';
    summary = `${label} at step ${firstFailed.order} of ${total}: ${firstFailed.reason}`;
  } else if (firstMissing) {
    summary = `FAILED — approved baseline step ${firstMissing.order} was never reached in the candidate run.`;
  } else {
    summary = `FAILED — journey did not match the approved baseline.`;
  }

  const doc: Omit<JourneyComparison, 'id'> = {
    schemaVersion: JOURNEY_COMPARISON_SCHEMA_VERSION,
    baseline: {
      id: baseline.id,
      title: baseline.title,
      recordedAt: baseline.recordedAt,
      artifactSha256: baseline.artifactSha256,
    },
    candidate: {
      id: candidate.id,
      title: candidate.title,
      recordedAt: candidate.recordedAt,
      artifactSha256: candidate.artifactSha256,
    },
    steps,
    result,
    firstChangedStep: firstChanged?.order,
    firstFailedStep: firstFailed?.order,
    summary,
    comparedAt: now().toISOString(),
  };
  return { ...doc, id: comparisonId(doc) };
}

/** Stamp a journey run with the comparison outcome (result + first changed step). */
export function applyComparison(
  journey: Journey,
  comparison: JourneyComparison,
  opts: CompareOptions = {},
): Journey {
  const now = opts.now ?? (() => new Date());
  return {
    ...journey,
    lastRunAt: now().toISOString(),
    lastRunResult: comparison.result,
    firstChangedStep: comparison.firstChangedStep,
  };
}

export function serializeComparison(comparison: JourneyComparison): string {
  return JSON.stringify(comparison, null, 2);
}

// ---------------------------------------------------------------------------
// Journey rules → findings for the Passport
// ---------------------------------------------------------------------------

export const JOURNEY_RULES: readonly RuleDescriptor[] = [
  {
    id: 'JT-001',
    title: 'Reviewer journey failed at a recorded step',
    severity: 'high',
    description:
      'A run of an approved journey did not reach the expected visible state at some step, so the reviewer path no longer completes on this build.',
    remediation:
      'Fix the app or reviewer setup so the approved flow completes, then re-record the journey. If the flow intentionally changed, update the reviewer instructions and re-approve the baseline.',
  },
  {
    id: 'JT-002',
    title: 'Journey step changed since the approved baseline',
    severity: 'medium',
    description:
      'The journey still passes, but an action or expected visible result differs from the previously approved baseline recording.',
    remediation:
      'Confirm the step change is intentional, update the reviewer instructions, and re-approve the baseline journey for this release.',
  },
];

function journeyFinding(
  ruleId: string,
  subject: string,
  state: FindingState,
  severity: Severity,
  summary: string,
  comparison: string,
  sources: SourceRef[],
): Finding {
  const digest = createHash('sha256').update(`${ruleId}|${subject}|${comparison}`).digest('hex');
  const rule = JOURNEY_RULES.find((r) => r.id === ruleId)!;
  return {
    schemaVersion: FINDING_SCHEMA_VERSION,
    id: `F-${digest.slice(0, 16)}`,
    ruleId,
    title: rule.title,
    severity,
    state,
    subject,
    summary,
    comparison,
    sources,
    remediation: rule.remediation,
  };
}

/**
 * Turn a journey run (optionally compared against its approved baseline) into
 * Passport findings. A failed or incomplete run is a confirmed contradiction
 * between the approved reviewer path and observed behavior; a passing run with
 * edited steps requires review.
 */
export function journeyFindings(journey: Journey, comparison?: JourneyComparison): Finding[] {
  const failedStep = journey.steps.find((s) => s.status !== 'pass');
  const comparisonFailed = !!comparison && comparison.result !== 'pass';

  if (comparisonFailed || failedStep) {
    const stepOrder = failedStep?.order ?? comparison?.firstFailedStep;
    const step =
      stepOrder !== undefined
        ? (journey.steps.find((s) => s.order === stepOrder) ?? failedStep)
        : undefined;

    const summary = step
      ? `Reviewer journey "${journey.title}" failed at step ${step.order} ("${step.action}"): expected "${step.expectedState}" but observed "${step.observedState}". The approved reviewer path no longer completes on this build.`
      : `Reviewer journey "${journey.title}" did not complete: ${comparison!.summary}`;
    const comparisonStr = step
      ? comparison
        ? `approved(${comparison.baseline.id} step ${step.order} pass) vs observed(${journey.id} step ${step.order} ${step.status})`
        : `expected("${step.expectedState}") vs observed("${step.observedState}") at step ${step.order}`
      : `approved(${comparison!.baseline.id}) vs candidate(${comparison!.candidate.id})`;

    const sources: SourceRef[] = [];
    if (step) {
      sources.push({
        kind: 'journey',
        evidenceClass: 'observed',
        ref: `${journey.id}#step-${step.order}`,
        excerpt: step.observedState,
      });
      sources.push({
        kind: 'journey',
        evidenceClass: 'attested',
        ref: `${comparison?.baseline.id ?? journey.name}#step-${step.order}:expected`,
        excerpt: step.expectedState,
      });
    }
    if (comparison) {
      sources.push({ kind: 'journey', evidenceClass: 'observed', ref: comparison.id, excerpt: comparison.summary });
    }
    return [journeyFinding('JT-001', journey.name, 'confirmed_contradiction', 'high', summary, comparisonStr, sources)];
  }

  if (comparison && comparison.result === 'pass' && comparison.firstChangedStep !== undefined) {
    const delta = comparison.steps.find((d) => d.order === comparison.firstChangedStep);
    if (delta) {
      const summary = `Reviewer journey "${journey.title}" still passes, but step ${delta.order} changed since the approved baseline: ${delta.reason}`;
      const comparisonStr = `approved(${comparison.baseline.id}) vs candidate(${comparison.candidate.id}); first changed step ${delta.order}`;
      return [
        journeyFinding('JT-002', journey.name, 'changed_requires_review', 'medium', summary, comparisonStr, [
          { kind: 'journey', evidenceClass: 'attested', ref: comparison.baseline.id, excerpt: comparison.baseline.title },
          { kind: 'journey', evidenceClass: 'observed', ref: `${journey.id}#step-${delta.order}`, excerpt: delta.reason },
        ]),
      ];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export function textJourneyReport(journey: Journey): string {
  const lines: string[] = [];
  const result = (journey.lastRunResult ?? deriveJourneyResult(journey.steps)).toUpperCase();
  lines.push(`journey ${journey.name} — ${journey.title}`);
  lines.push(
    `  ${journey.id} · ${journey.kind} · ${journey.steps.length} step${journey.steps.length === 1 ? '' : 's'} · result ${result}${journey.firstChangedStep ? ` · first changed step ${journey.firstChangedStep}` : ''}`,
  );
  if (journey.device) {
    const d = journey.device;
    const props = [d.manufacturer, d.model, d.androidRelease ? `Android ${d.androidRelease}` : undefined, d.apiLevel ? `API ${d.apiLevel}` : undefined]
      .filter(Boolean)
      .join(', ');
    lines.push(`  device: ${d.serial}${props ? ` (${props})` : ''}`);
  }
  if (journey.credentialRef) {
    const readiness = credentialReadiness(journey.credentialRef);
    lines.push(
      `  credential: ${journey.credentialRef.label}${journey.credentialRef.expiresAt ? ` (expires ${journey.credentialRef.expiresAt}, ${readiness})` : ` (${readiness})`}`,
    );
  }
  for (const s of journey.steps) {
    lines.push(`  step ${s.order} ${s.status.toUpperCase().padEnd(7)} ${s.action}`);
    if (s.status !== 'pass') {
      lines.push(`         expected: ${s.expectedState}`);
      lines.push(`         observed: ${s.observedState}`);
    }
  }
  return lines.join('\n');
}

export function textComparisonReport(c: JourneyComparison): string {
  const lines: string[] = [];
  lines.push(`journey compare — ${c.baseline.title} vs ${c.candidate.title}`);
  lines.push(`  baseline:  ${c.baseline.id} (recorded ${c.baseline.recordedAt}${c.baseline.artifactSha256 ? `, artifact ${c.baseline.artifactSha256.slice(0, 12)}…` : ''})`);
  lines.push(`  candidate: ${c.candidate.id} (recorded ${c.candidate.recordedAt}${c.candidate.artifactSha256 ? `, artifact ${c.candidate.artifactSha256.slice(0, 12)}…` : ''})`);
  lines.push(`  result: ${c.result.toUpperCase()}`);
  if (c.firstChangedStep !== undefined) lines.push(`  first changed step: ${c.firstChangedStep}`);
  if (c.firstFailedStep !== undefined) lines.push(`  first failed step:  ${c.firstFailedStep}`);
  lines.push(`  ${c.summary}`);
  lines.push('');
  for (const d of c.steps) {
    const status = (d.candidate?.status ?? '—').toUpperCase().padEnd(7);
    const change = d.change.padEnd(9);
    lines.push(`  step ${String(d.order).padStart(2)}  ${status}  ${change}  ${d.action}`);
    if (d.change !== 'unchanged') lines.push(`          ${d.reason}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Reviewer instructions (PRODUCT_PLAN §6.2 — exact steps + annotated screens)
// ---------------------------------------------------------------------------

const INSTRUCTIONS_CSS = `
:root{font-family:-apple-system,"SF Pro Text",Helvetica,Arial,sans-serif;color:#16232e}
body{max-width:860px;margin:2rem auto;padding:0 1rem}
header{border-bottom:3px solid #16232e;padding-bottom:1rem;margin-bottom:1.25rem}
.badge{font-weight:700;padding:.2rem .7rem;border-radius:6px;color:#fff;font-size:.95rem}
.badge.pass{background:#1e7d32}.badge.fail{background:#b3261e}.badge.blocked{background:#9a6a00}
.meta{color:#52616e;font-size:.9rem}
code{background:#eef2f5;padding:.1rem .3rem;border-radius:4px}
.step{border:1px solid #d5dde3;border-left:6px solid #1e7d32;border-radius:8px;padding:.9rem 1.1rem;margin:1rem 0}
.step.fail{border-left-color:#b3261e}.step.blocked{border-left-color:#9a6a00}
.step h3{margin:.1rem 0 .6rem}
.chip{font-size:.75rem;font-weight:700;padding:.1rem .5rem;border-radius:4px;color:#fff;vertical-align:middle;margin-left:.5rem}
.chip.pass{background:#1e7d32}.chip.fail{background:#b3261e}.chip.blocked{background:#9a6a00}
dl{display:grid;grid-template-columns:11rem 1fr;gap:.3rem .8rem;margin:.4rem 0;font-size:.95rem}
dt{color:#52616e}dd{margin:0}
img{display:block;max-width:180px;border:1px solid #d5dde3;border-radius:6px;margin-top:.6rem}
figcaption{font-size:.75rem;color:#52616e;margin-top:.25rem}
.box{border:1px solid #d5dde3;border-radius:10px;padding:.9rem 1.1rem;margin:1rem 0;background:#f8fafb}
.callout{border:1px solid #b3261e;background:#fdecea;border-radius:8px;padding:.8rem 1rem;margin:1rem 0}
.callout.ok{border-color:#1e7d32;background:#e9f6ec}
footer{margin-top:2rem;border-top:1px solid #d5dde3;padding-top:1rem;font-size:.8rem;color:#52616e}
`;

/**
 * Self-contained reviewer instructions: exact steps, expected vs observed
 * results, device/session metadata, credential readiness (reference only),
 * and screenshots embedded as data URIs so the file works offline.
 */
export function renderReviewerInstructions(
  bundle: JourneyBundle,
  comparison?: JourneyComparison,
  opts: CompareOptions = {},
): string {
  const j = bundle.journey;
  const now = opts.now ?? (() => new Date());
  const readiness = credentialReadiness(j.credentialRef, now());
  const result = j.lastRunResult ?? deriveJourneyResult(j.steps);
  const cmp = comparison ?? bundle.comparison;

  const callout = cmp
    ? cmp.result === 'pass'
      ? `<div class="callout ok"><strong>Matches approved baseline</strong> — ${esc(cmp.summary)} (baseline <code>${esc(cmp.baseline.id)}</code>)</div>`
      : `<div class="callout"><strong>Journey comparison vs approved baseline</strong> — ${esc(cmp.summary)}${
          cmp.firstFailedStep !== undefined ? ` First failed step: <strong>${cmp.firstFailedStep}</strong>.` : ''
        }${cmp.firstChangedStep !== undefined ? ` First changed step: <strong>${cmp.firstChangedStep}</strong>.` : ''}</div>`
    : '';

  const credentialBox = j.credentialRef
    ? `<div class="box"><h2>Reviewer credential</h2>
      <dl>
        <dt>Reference</dt><dd>${esc(j.credentialRef.label)}</dd>
        <dt>Expires</dt><dd>${j.credentialRef.expiresAt ? esc(j.credentialRef.expiresAt) : '—'}</dd>
        <dt>Readiness</dt><dd><strong>${esc(readiness)}</strong></dd>
      </dl>
      <p class="meta">Reference only — Attest never stores the credential itself, and no secret appears in this document or the Evidence Capsule.</p>
    </div>`
    : '';

  const deviceBox = j.device
    ? `<div class="box"><h2>Session</h2>
      <dl>
        <dt>Device</dt><dd><code>${esc(j.device.serial)}</code>${j.device.model ? ` — ${esc([j.device.manufacturer, j.device.model].filter(Boolean).join(' '))}` : ''}</dd>
        <dt>Android</dt><dd>${j.device.androidRelease ? esc(j.device.androidRelease) : '—'}${j.device.apiLevel ? ` (API ${j.device.apiLevel})` : ''}</dd>
        <dt>Recorded</dt><dd>${esc(j.recordedAt)} · human-guided</dd>
        <dt>Last run</dt><dd>${esc(j.lastRunAt ?? j.recordedAt)}</dd>
        ${j.artifactSha256 ? `<dt>Build</dt><dd><code>${esc(j.artifactSha256.slice(0, 16))}…</code></dd>` : ''}
        <dt>Journey</dt><dd><code>${esc(j.id)}</code></dd>
      </dl>
    </div>`
    : '';

  const stepsHtml = j.steps
    .map((s) => {
      const bytes = s.screenshot ? bundle.files[s.screenshot.path] : undefined;
      const shot =
        s.screenshot && bytes
          ? `<figure><img alt="Step ${s.order} screenshot" src="data:image/png;base64,${bytes.toString('base64')}">
             <figcaption>${esc(s.screenshot.path)} · sha256 ${esc(s.screenshot.sha256.slice(0, 16))}…</figcaption></figure>`
          : s.screenshot
            ? `<p class="meta">Screenshot evidence missing: <code>${esc(s.screenshot.path)}</code></p>`
            : '';
      return `<section class="step ${esc(s.status)}">
  <h3>Step ${s.order} — ${esc(s.action)}<span class="chip ${esc(s.status)}">${esc(s.status.toUpperCase())}</span></h3>
  <dl>
    <dt>Exact step</dt><dd>${esc(s.action)}</dd>
    <dt>Expected visible result</dt><dd>${esc(s.expectedState)}</dd>
    <dt>Observed result</dt><dd>${esc(s.observedState)}</dd>
    <dt>Screen / activity</dt><dd>${s.activity ? `<code>${esc(s.activity)}</code>` : '—'}</dd>
    <dt>Captured</dt><dd>${esc(s.capturedAt)}</dd>
    ${s.note ? `<dt>Note</dt><dd>${esc(s.note)}</dd>` : ''}
  </dl>
  ${shot}
</section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Reviewer instructions — ${esc(j.title)}</title>
<style>${INSTRUCTIONS_CSS}</style></head><body>
<header>
  <h1>Reviewer instructions — ${esc(j.title)} <span class="badge ${esc(result)}">${esc(result.toUpperCase())}</span></h1>
  <p class="meta">Journey <code>${esc(j.id)}</code> · kind <code>${esc(j.kind)}</code> · ${j.steps.length} step${j.steps.length === 1 ? '' : 's'} · generated by attest</p>
</header>
${callout}
${credentialBox}
${deviceBox}
<h2>Steps</h2>
${stepsHtml}
<footer>
  <p>Exact steps and screenshots captured by the human-guided Reviewer Twin recorder. Evidence hashes live in the Release Passport and Evidence Capsule.</p>
  <p>Attest provides traceable technical evidence. It is not legal advice and does not guarantee store approval.</p>
</footer>
</body></html>`;
}
