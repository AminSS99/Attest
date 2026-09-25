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
import type {
  CredentialRef,
  DeviceMetadata,
  JourneyKind,
  JourneyResult,
  JourneyStep,
} from './journey.js';
import type { ReleaseDiff } from './release-diff.js';

export const RELEASE_PASSPORT_SCHEMA_VERSION = 'attest.release-passport/1' as const;

/**
 * A journey embedded in the Passport: the run result, the first failed step,
 * every step with expected/observed state, and screenshot hashes — so the
 * Passport explains the reviewer path without external lookups. Full media
 * lives in the Evidence Capsule at `journeys/<id>/…`.
 */
export interface JourneySummary {
  id: string;
  kind: JourneyKind;
  name: string;
  title: string;
  result: JourneyResult;
  stepCount: number;
  firstFailedStep?: number;
  firstChangedStep?: number;
  recordedAt: string;
  lastRunAt?: string;
  artifactSha256?: string;
  device?: DeviceMetadata;
  credentialRef?: CredentialRef;
  steps: JourneyStep[];
}

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
  /** Required when the human decision overrides the recommendation (e.g. ship over hold). */
  reason?: string;
  /** True when the human decision disagrees with the deterministic recommendation. */
  override?: boolean;
}

export interface ReleasePassport {
  schemaVersion: typeof RELEASE_PASSPORT_SCHEMA_VERSION;
  /** Content-addressed id of the passport document. */
  id: string;
  /** Passport revision. Corrections supersede the prior finalized decision. */
  revision: number;
  /** Id of the passport this one supersedes, when this is a corrective revision. */
  supersedes?: string;
  app: { packageName: string };
  base: ArtifactIdentity;
  candidate: ArtifactIdentity;
  createdAt: string;
  /** Rule/policy-pack versions used, so the capsule is reproducible. */
  toolset: { cli: string; ruleset: string };
  diff: ReleaseDiff;
  claims: Claim[];
  findings: Finding[];
  /** Reviewer/consent journeys attached to this release, with step evidence and hashes. */
  journeys: JourneySummary[];
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
      `${blockers.length} confirmed contradiction${blockers.length === 1 ? '' : 's'} between the release candidate and the promises made about it (declarations, claims, or approved journeys).`,
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
