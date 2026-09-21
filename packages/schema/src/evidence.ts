/**
 * Attest evidence model (PRODUCT_PLAN §7).
 *
 * Confidence and provenance are part of the product language. Every finding
 * carries source references, the comparison that triggered it, and a
 * deterministic reason whenever possible.
 */

/**
 * Evidence classes describe *how* a fact came to exist inside Attest.
 * None of them are silently converted into another.
 */
export type EvidenceClass =
  /** Captured from a compiled artifact or a controlled runtime journey. */
  | 'observed'
  /** Supplied through App Store Connect, Play Console, a privacy policy, or vendor documentation. */
  | 'declared'
  /** Confirmed by an authorized team member but not independently observable. */
  | 'attested'
  /** Suggested from several signals and awaiting review. */
  | 'inferred'
  /** Required evidence has not been supplied or observed. */
  | 'missing';

export const EVIDENCE_CLASSES: readonly EvidenceClass[] = [
  'observed',
  'declared',
  'attested',
  'inferred',
  'missing',
] as const;

/**
 * Finding states (PRODUCT_PLAN §7). A finding is a state machine, not a score.
 */
export type FindingState =
  /** Two sources deterministically disagree. */
  | 'confirmed_contradiction'
  /** Something changed between releases and a human must look at it. */
  | 'changed_requires_review'
  /** A claim exists but required evidence has not been supplied or observed. */
  | 'evidence_missing'
  /** All sources currently agree. */
  | 'verified_consistent'
  /** The team accepted the gap, with an owner and an expiry date. */
  | 'accepted_exception'
  /** Does not apply, with a recorded rationale. */
  | 'not_applicable';

export const FINDING_STATES: readonly FindingState[] = [
  'confirmed_contradiction',
  'changed_requires_review',
  'evidence_missing',
  'verified_consistent',
  'accepted_exception',
  'not_applicable',
] as const;

export type Severity = 'blocker' | 'high' | 'medium' | 'low' | 'info';

export const SEVERITIES: readonly Severity[] = [
  'blocker',
  'high',
  'medium',
  'low',
  'info',
] as const;

/** Where a piece of evidence originally came from. */
export type SourceKind =
  | 'build_fact'
  | 'data_safety'
  | 'privacy_policy'
  | 'store_listing'
  | 'journey'
  | 'attestation'
  | 'vendor_doc'
  | 'policy_pack';

/**
 * A single cited source. `ref` is a stable, human-readable pointer such as
 * `manifest:uses-permission android.permission.CAMERA` or
 * `privacy-policy.txt#L42`.
 */
export interface SourceRef {
  kind: SourceKind;
  evidenceClass: EvidenceClass;
  ref: string;
  /** Verbatim quoted text for declared sources, so the reader never has to trust a paraphrase. */
  excerpt?: string;
}
