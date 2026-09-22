/**
 * Journeys (PRODUCT_PLAN §6.2, §6.3, §6.4): the durable record format for
 * Reviewer Twin, Consent Replay, and Deletion Proof. The MVP recorder is
 * human-guided; the format is designed now so automated execution can attach
 * later without breaking history.
 */

export const JOURNEY_SCHEMA_VERSION = 'attest.journey/1' as const;

export const JOURNEY_COMPARISON_SCHEMA_VERSION = 'attest.journey-comparison/1' as const;

export type JourneyKind =
  | 'reviewer'
  | 'consent'
  | 'deletion'
  | 'purchase'
  | 'restore'
  | 'restricted_content';

/** Per-step and whole-journey outcome. Blocked means the operator could not continue. */
export type StepResult = 'pass' | 'fail' | 'blocked';
export type JourneyResult = StepResult;

/** Device identity captured with the run, so evidence is reproducible. */
export interface DeviceMetadata {
  /** ADB serial, e.g. "emulator-5554". */
  serial: string;
  manufacturer?: string;
  model?: string;
  androidRelease?: string;
  apiLevel?: number;
}

/** A screenshot captured at a step. Paths are relative to the journey JSON file
 *  (and to `journeys/<journeyId>/journey.json` once sealed inside a capsule). */
export interface StepScreenshot {
  path: string;
  /** Lowercase hex SHA-256 of the exact screenshot bytes. */
  sha256: string;
}

/**
 * Credential *references* only. Secrets never live inside journeys, passports,
 * or capsules (PRODUCT_PLAN §11) — only a label and an expiry so readiness can
 * be checked before a reviewer session.
 */
export interface CredentialRef {
  label: string;
  expiresAt?: string;
}

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
  /** What was actually on screen when the step was captured. */
  observedState: string;
  status: StepResult;
  /** ISO-8601 time the step was captured. */
  capturedAt: string;
  /** Current activity/screen reported by the device at capture time. */
  activity?: string;
  screenshot?: StepScreenshot;
  /** Why this step matters for review, in reviewer-facing language. */
  note?: string;
  /** Paths (relative to the journey JSON) of screenshots/clips captured at this step. */
  evidencePaths: string[];
}

export interface Journey {
  schemaVersion: typeof JOURNEY_SCHEMA_VERSION;
  /** Content-addressed id: JN- + sha256 of the journey document without the id. */
  id: string;
  kind: JourneyKind;
  /** Stable slug, e.g. "reviewer-premium-ai". */
  name: string;
  title: string;
  /** The build this journey was recorded/validated against. */
  artifactSha256?: string;
  device?: DeviceMetadata;
  steps: JourneyStep[];
  credentialRef?: CredentialRef;
  recordedBy: 'human-guided' | 'automated';
  recordedAt: string;
  lastRunAt?: string;
  lastRunResult?: JourneyResult;
  /** When a re-run fails, the 1-based order of the first step that changed. */
  firstChangedStep?: number;
}

/** How one step differs between the approved baseline and the candidate run. */
export type JourneyChangeKind =
  /** Same action, same expected state, same status. */
  | 'unchanged'
  /** Action or expected state edited since the baseline. */
  | 'changed'
  /** The step ran and failed. */
  | 'failed'
  /** The step could not be attempted (dependency on an earlier failure). */
  | 'blocked'
  /** The step exists in the baseline but was never reached in the candidate. */
  | 'missing'
  /** New step not present in the baseline. */
  | 'added';

export interface JourneyStepDelta {
  order: number;
  action: string;
  change: JourneyChangeKind;
  baseline?: { status: StepResult; expectedState: string; observedState: string; activity?: string };
  candidate?: { status: StepResult; expectedState: string; observedState: string; activity?: string };
  /** Deterministic sentence explaining the classification. */
  reason: string;
}

/** Result of `attest journey compare`: the approved journey vs the current run. */
export interface JourneyComparison {
  schemaVersion: typeof JOURNEY_COMPARISON_SCHEMA_VERSION;
  /** Content-addressed id: JC- + sha256 of the comparison document without the id. */
  id: string;
  baseline: { id: string; title: string; recordedAt: string; artifactSha256?: string };
  candidate: { id: string; title: string; recordedAt: string; artifactSha256?: string };
  steps: JourneyStepDelta[];
  result: JourneyResult;
  /** 1-based order of the first step that changed vs the baseline. */
  firstChangedStep?: number;
  /** 1-based order of the first step that failed or blocked. */
  firstFailedStep?: number;
  /** One-sentence headline, e.g. 'FAILED at step 4 of 5: ...'. */
  summary: string;
  comparedAt: string;
}
