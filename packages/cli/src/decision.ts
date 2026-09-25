/**
 * Release Decision Workflow (PRODUCT_PLAN §9 weeks 7–8): approved exceptions
 * and the final human ship/hold decision.
 *
 * Invariants:
 * - Findings are never mutated. Exceptions overlay evidence; Attest's
 *   deterministic recommendation is unchanged by exceptions and decisions.
 * - Every exception binds to a finding id + the candidate artifact hash, with
 *   owner, rationale, approver, approval time, and a future expiry.
 * - A finalized decision is immutable. Corrections create a new Passport
 *   revision (`revision++`, `supersedes`) written to a new file.
 * - Shipping over a HOLD recommendation requires an explicit human reason.
 */

import { createHash } from 'node:crypto';

import type { ExceptionRecord, ReleasePassport } from 'attest-schema';

import { humanDate, recomputePassportId } from './passport.js';

/** Validation failure in the decision workflow — maps to exit code 1. */
export class DecisionError extends Error {}

export interface AcceptExceptionInput {
  findingId: string;
  owner: string;
  rationale: string;
  /** ISO-8601 date (`2026-10-15`) or timestamp after which the exception expires. */
  expiresAt: string;
  approvedBy: string;
  /** Approval time; defaults to now. */
  approvedAt?: string;
}

export interface DecideInput {
  status: 'ship' | 'hold';
  decidedBy: string;
  reason?: string;
}

export function isFinalized(p: ReleasePassport): boolean {
  return p.decision.status === 'ship' || p.decision.status === 'hold';
}

export function exceptionStatus(
  e: ExceptionRecord,
  now: Date = new Date(),
): 'active' | 'expired' {
  return expiryInstant(e.expiresAt).getTime() < now.getTime() ? 'expired' : 'active';
}

/**
 * Expiry semantics for a date-only value: the exception stays valid through
 * the end of that UTC day.
 */
function expiryInstant(iso: string): Date {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T23:59:59.999Z`) : new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new DecisionError(`invalid expiry date "${iso}" (expected ISO-8601)`);
  }
  return d;
}

function exceptionId(e: Omit<ExceptionRecord, 'id'>): string {
  const digest = createHash('sha256')
    .update(`${e.findingId}|${e.artifactSha256}|${e.expiresAt}|${e.rationale}|${e.owner}|${e.approvedBy}|${e.approvedAt}`)
    .digest('hex');
  return `EX-${digest.slice(0, 16)}`;
}

/**
 * Overlay an approved exception on a Passport. Findings and the deterministic
 * recommendation stay exactly as they were.
 */
export function acceptException(
  passport: ReleasePassport,
  input: AcceptExceptionInput,
  now: Date = new Date(),
): ReleasePassport {
  if (isFinalized(passport)) {
    throw new DecisionError(
      'passport decision is already finalized; create a new revision with attest decide --out <new-file>',
    );
  }
  for (const [name, value] of [
    ['--finding', input.findingId],
    ['--owner', input.owner],
    ['--reason', input.rationale],
    ['--expires', input.expiresAt],
    ['--approved-by', input.approvedBy],
  ] as const) {
    if (!value?.trim()) throw new DecisionError(`${name} is required`);
  }

  const finding = passport.findings.find((f) => f.id === input.findingId);
  if (!finding) {
    throw new DecisionError(
      `unknown finding "${input.findingId}" — exceptions may only cover findings recorded in this Passport`,
    );
  }

  const expiresAt = input.expiresAt.trim();
  if (expiryInstant(expiresAt).getTime() <= now.getTime()) {
    throw new DecisionError(`exception must expire in the future (got "${expiresAt}")`);
  }

  const covering = passport.exceptions.filter(
    (e) => e.findingId === finding.id && exceptionStatus(e, now) === 'active',
  );
  if (covering.length > 0) {
    throw new DecisionError(
      `finding ${finding.id} is already covered by active exception ${covering[0]!.id}`,
    );
  }

  const record: Omit<ExceptionRecord, 'id'> = {
    findingId: finding.id,
    covers: finding.ruleId,
    artifactSha256: passport.candidate.sha256,
    rationale: input.rationale.trim(),
    owner: input.owner.trim(),
    expiresAt,
    approvedBy: input.approvedBy.trim(),
    approvedAt: input.approvedAt ?? now.toISOString(),
  };
  const full: ExceptionRecord = { id: exceptionId(record), ...record };

  return recomputePassportId({
    ...passport,
    exceptions: [...passport.exceptions, full],
  });
}

/**
 * Record the human ship/hold decision. `ship` over a `hold` (or `review`)
 * recommendation is an override and requires `reason`.
 */
export function decide(
  passport: ReleasePassport,
  input: DecideInput,
  now: Date = new Date(),
): ReleasePassport {
  if (input.status !== 'ship' && input.status !== 'hold') {
    throw new DecisionError('--status must be "ship" or "hold"');
  }
  if (!input.decidedBy?.trim()) throw new DecisionError('--decided-by is required');

  const recommendation = passport.decision.recommendation;
  const override = input.status === 'ship' && recommendation !== 'ship';
  const reason = input.reason?.trim() || undefined;

  if (override && recommendation === 'hold' && !reason) {
    throw new DecisionError(
      `--reason is required: the human decision is ship but Attest recommends hold`,
    );
  }
  if (override && recommendation === 'review' && !reason) {
    throw new DecisionError(
      `--reason is required: the human decision is ship but Attest recommends review`,
    );
  }

  for (const e of passport.exceptions) {
    if (!passport.findings.some((f) => f.id === e.findingId)) {
      throw new DecisionError(
        `exception ${e.id} references finding ${e.findingId}, which no longer exists in this Passport`,
      );
    }
  }

  const wasFinalized = isFinalized(passport);
  const { id: _prevId, ...rest } = passport;
  const doc: Omit<ReleasePassport, 'id'> = {
    ...rest,
    revision: wasFinalized ? (passport.revision ?? 0) + 1 : (passport.revision ?? 0),
    decision: {
      // Human fields are rebuilt from scratch — a correction must not inherit
      // the prior revision's override/reason/decidedBy.
      recommendation: passport.decision.recommendation,
      rationale: passport.decision.rationale,
      status: input.status,
      decidedBy: input.decidedBy.trim(),
      decidedAt: now.toISOString(),
      ...(reason ? { reason } : {}),
      ...(override ? { override: true } : {}),
    },
    ...(wasFinalized ? { supersedes: passport.id } : {}),
  };
  return recomputePassportId(doc);
}

/** Text summary printed by `attest decide` / `attest exception accept`. */
export function describeDecision(passport: ReleasePassport): string[] {
  const lines: string[] = [];
  const d = passport.decision;
  lines.push(
    `Attest recommendation: ${d.recommendation.toUpperCase()} — ${d.rationale.join(' ')}`,
  );
  if (d.status === 'pending') {
    lines.push('Human decision: PENDING');
    return lines;
  }
  lines.push(`Human decision: ${d.status.toUpperCase()}`);
  if (d.override && d.decidedBy) lines.push(`Override approved by: ${d.decidedBy}`);
  else if (d.decidedBy) lines.push(`Decided by: ${d.decidedBy}`);
  if (d.reason) lines.push(`Reason: ${d.reason}`);
  const now = new Date();
  for (const e of passport.exceptions) {
    const status = exceptionStatus(e, now);
    lines.push(
      `Exception ${e.id} (${e.findingId}): expires ${humanDate(e.expiresAt)}${status === 'expired' ? ' — EXPIRED' : ''}`,
    );
  }
  return lines;
}
