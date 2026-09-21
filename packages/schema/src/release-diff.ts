/**
 * ReleaseDiff: the deterministic comparison of two builds (PRODUCT_PLAN §5.9,
 * §9 weeks 1–2). This is the core product object — a release delta, not a
 * generic list of findings. Everything in here is computed, never guessed.
 */

import type { ArtifactIdentity, ComponentFact, SdkFact } from './build-facts.js';

export const RELEASE_DIFF_SCHEMA_VERSION = 'attest.release-diff/1' as const;

export interface SdkChange {
  id: string;
  vendor: string;
  name: string;
  matchedPackages: string[];
}

export interface ReleaseDiff {
  schemaVersion: typeof RELEASE_DIFF_SCHEMA_VERSION;
  base: ArtifactIdentity;
  candidate: ArtifactIdentity;

  addedPermissions: string[];
  removedPermissions: string[];

  addedSdks: SdkChange[];
  removedSdks: SdkChange[];

  addedDomains: string[];
  removedDomains: string[];

  addedExportedComponents: ComponentFact[];
  removedExportedComponents: ComponentFact[];

  /** Present when either value changed. */
  targetSdkChange?: { from?: number; to?: number };
  minSdkChange?: { from?: number; to?: number };

  /** True when package names differ — almost always a setup error worth surfacing loudly. */
  packageMismatch: boolean;

  createdAt: string;
}

/** Convenience: total count of material changes. */
export function materialChangeCount(diff: ReleaseDiff): number {
  return (
    diff.addedPermissions.length +
    diff.removedPermissions.length +
    diff.addedSdks.length +
    diff.removedSdks.length +
    diff.addedDomains.length +
    diff.removedDomains.length +
    diff.addedExportedComponents.length +
    diff.removedExportedComponents.length +
    (diff.targetSdkChange ? 1 : 0)
  );
}

/** Re-export so rule authors can type against one module. */
export type { SdkFact };
