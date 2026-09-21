/**
 * Policy packs (PRODUCT_PLAN §6.5, §11): signed, dated, source-cited rules.
 * Versioned so a release can be re-evaluated "under the policy active when it
 * shipped" (Policy Time Machine).
 */

import type { RuleDescriptor } from './finding.js';

export const POLICY_PACK_SCHEMA_VERSION = 'attest.policy-pack/1' as const;

export interface PolicyPack {
  schemaVersion: typeof POLICY_PACK_SCHEMA_VERSION;
  id: string;
  title: string;
  /** Semver-ish pack version, e.g. "2026.09". */
  version: string;
  /** ISO-8601 date from which this pack is effective. */
  effectiveDate: string;
  /** Official source the rules were derived from. */
  sourceUrl: string;
  rules: RuleDescriptor[];
}

/** The built-in deterministic truth-gap ruleset shipped with attest-cli. */
export const CORE_TRUTH_GAP_RULESET_VERSION = 'core-truth-gap/2026.09';
