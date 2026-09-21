/**
 * Journeys (PRODUCT_PLAN §6.2, §6.3, §6.4): the durable record format for
 * Reviewer Twin, Consent Replay, and Deletion Proof. The MVP recorder is
 * human-guided; the format is designed now so automated execution can attach
 * later without breaking history.
 */

export const JOURNEY_SCHEMA_VERSION = 'attest.journey/1' as const;

export type JourneyKind =
  | 'reviewer'
  | 'consent'
  | 'deletion'
  | 'purchase'
  | 'restore'
  | 'restricted_content';

/**
 * The primary object is a step with an expected visible state and evidence —
 * not a brittle coordinate script (PRODUCT_PLAN §8, Journey Studio).
 */
export interface JourneyStep {
  order: number;
  /** What the operator/runner does, e.g. "Tap 'Delete my account'". */
  action: string;
  /** What must be visibly true afterwards, e.g. "Confirmation dialog shown". */
  expectedState: string;
  /** Why this step matters for review, in reviewer-facing language. */
  note?: string;
  /** Relative paths (inside the capsule) of screenshots/clips captured at this step. */
  evidencePaths: string[];
}

export interface Journey {
  schemaVersion: typeof JOURNEY_SCHEMA_VERSION;
  id: string;
  kind: JourneyKind;
  title: string;
  /** The build this journey was recorded/validated against. */
  artifactSha256?: string;
  steps: JourneyStep[];
  /** Credential *references* only. Secrets never live inside journeys or capsules (PRODUCT_PLAN §11). */
  credentialRef?: { label: string; expiresAt?: string };
  recordedBy: 'human-guided' | 'automated';
  recordedAt: string;
  lastRunAt?: string;
  lastRunResult?: 'pass' | 'fail' | 'blocked';
  /** When a re-run fails, the 1-based order of the first step that changed. */
  firstChangedStep?: number;
}
