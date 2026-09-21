/**
 * Evidence Capsule (PRODUCT_PLAN §6.9): a portable, tamper-evident evidence
 * package for one shipped build. It proves what evidence existed and what
 * decision was made; it does not certify legal compliance, and it remains
 * readable without an Attest subscription.
 */

export const EVIDENCE_CAPSULE_SCHEMA_VERSION = 'attest.evidence-capsule/1' as const;

export interface CapsuleFileEntry {
  /** Path relative to the capsule root, using forward slashes. */
  path: string;
  sha256: string;
  bytes: number;
}

export interface CapsuleManifest {
  schemaVersion: typeof EVIDENCE_CAPSULE_SCHEMA_VERSION;
  id: string;
  createdAt: string;
  tool: { name: string; version: string };
  /** The build this capsule attests to. */
  artifact: {
    fileName: string;
    sha256: string;
    packageName?: string;
    versionName?: string;
    versionCode?: string;
  };
  /** Rule and policy-pack versions in force when the capsule was sealed. */
  toolset: { cli: string; ruleset: string };
  /** Cryptographic manifest covering every included evidence file. */
  files: CapsuleFileEntry[];
  /** Redactions applied before sealing (e.g. "reviewer credentials", "test account PII"). */
  redactions: string[];
  /** SHA-256 over the canonical serialization of `files` — one hash seals the whole capsule. */
  evidenceRootHash: string;
}

/** Result of offline verification (`attest verify`). */
export interface CapsuleVerification {
  ok: boolean;
  checked: number;
  mismatches: { path: string; expected: string; actual: string }[];
  missing: string[];
  extra: string[];
  evidenceRootOk: boolean;
  errors: string[];
}
