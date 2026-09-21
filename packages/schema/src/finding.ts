/**
 * Findings, claims, and rules — the Truth Graph's unit of work
 * (PRODUCT_PLAN §6.1, §7).
 */

import type { EvidenceClass, FindingState, Severity, SourceRef } from './evidence.js';

export const FINDING_SCHEMA_VERSION = 'attest.finding/1' as const;

/**
 * No finding consists only of an AI-generated paragraph. Every finding needs:
 * source references, the comparison that triggered it, and a deterministic
 * reason whenever possible.
 */
export interface Finding {
  schemaVersion: typeof FINDING_SCHEMA_VERSION;
  /** Stable content-addressed id (sha256 of ruleId + comparison + subject), so re-runs do not churn. */
  id: string;
  ruleId: string;
  title: string;
  severity: Severity;
  state: FindingState;
  /** The subject of the gap: a permission, SDK id, host, or data type. */
  subject: string;
  /** Deterministic reason sentence — which sources conflicted, in plain language. */
  summary: string;
  /** The exact comparison that triggered the finding. */
  comparison: string;
  sources: SourceRef[];
  remediation: string;
  owner?: string;
}

/** A claim in the Release Truth Graph: one public promise with its evidence. */
export interface Claim {
  /** Stable slug, e.g. "data-type:location.precise_location". */
  id: string;
  kind: 'permission' | 'data_type' | 'sdk' | 'domain';
  /** Human-readable promise, e.g. "We collect precise location". */
  text: string;
  supporting: SourceRef[];
  conflicting: SourceRef[];
  /** Highest-priority evidence class currently attached to this claim. */
  bestEvidence: EvidenceClass;
  status: 'supported' | 'contradicted' | 'unsupported' | 'unreviewed';
}

/** Rule metadata — rules themselves live in attest-cli's deterministic engine. */
export interface RuleDescriptor {
  id: string;
  title: string;
  severity: Severity;
  description: string;
  /** What a team should do when the rule fires. */
  remediation: string;
}
