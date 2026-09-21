/**
 * The Release Passport — Attest's durable object (PRODUCT_PLAN §1):
 * a versioned, evidence-backed record connecting a particular build to store
 * declarations, privacy claims, findings, exceptions, owners, and the final
 * release decision.
 *
 * Attest never marks a release "compliant" and never guarantees store
 * approval. The Passport recommends; a human decides.
 */

import type { ArtifactIdentity } from './build-facts.js';
import type { ExceptionRecord } from './declarations.js';
import type { Claim, Finding } from './finding.js';
import type { ReleaseDiff } from './release-diff.js';

export const RELEASE_PASSPORT_SCHEMA_VERSION = 'attest.release-passport/1' as const;

export type ReleaseRecommendation = 'ship' | 'review' | 'hold';

export interface ReleaseDecision {
  /** Deterministic recommendation derived from finding states. */
  recommendation: ReleaseRecommendation;
  /** Plain-language reasons backing the recommendation. */
  rationale: string[];
  /** Human decision. Starts pending; a person, never the tool, sets ship/hold. */
  status: 'pending' | 'ship' | 'hold';
  decidedBy?: string;
  decidedAt?: string;
}

export interface ReleasePassport {
  schemaVersion: typeof RELEASE_PASSPORT_SCHEMA_VERSION;
  /** Content-addressed id of the passport document. */
  id: string;
  app: { packageName: string };
  base: ArtifactIdentity;
  candidate: ArtifactIdentity;
  createdAt: string;
  /** Rule/policy-pack versions used, so the capsule is reproducible. */
  toolset: { cli: string; ruleset: string };
  diff: ReleaseDiff;
  claims: Claim[];
  findings: Finding[];
  exceptions: ExceptionRecord[];
  /** Open questions a human must answer before the release decision. */
  unresolvedQuestions: string[];
  decision: ReleaseDecision;
}

/**
 * Deterministic recommendation logic (PRODUCT_PLAN §11 — AI never marks a
 * release compliant; this is pure, auditable arithmetic over finding states).
 */
export function computeRecommendation(findings: Finding[]): ReleaseDecision {
  const blockers = findings.filter((f) => f.state === 'confirmed_contradiction');
  const review = findings.filter(
    (f) => f.state === 'changed_requires_review' || f.state === 'evidence_missing',
  );
  const rationale: string[] = [];
  let recommendation: ReleaseRecommendation = 'ship';
  if (blockers.length > 0) {
    recommendation = 'hold';
    rationale.push(
      `${blockers.length} confirmed contradiction${blockers.length === 1 ? '' : 's'} between the build and its declarations.`,
    );
  }
  if (review.length > 0) {
    if (recommendation === 'ship') recommendation = 'review';
    rationale.push(
      `${review.length} change${review.length === 1 ? '' : 's'} require${review.length === 1 ? 's' : ''} human review before submission.`,
    );
  }
  if (rationale.length === 0) {
    rationale.push('All checked declarations are consistent with the observed build changes.');
  }
  return { recommendation, rationale, status: 'pending' };
}
