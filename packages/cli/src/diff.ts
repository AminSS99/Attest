/**
 * Deterministic two-build release diff (PRODUCT_PLAN §9 weeks 1–2).
 * Pure set arithmetic over observed facts — no heuristics, no scores.
 */

import {
  RELEASE_DIFF_SCHEMA_VERSION,
  type BuildFacts,
  type ComponentFact,
  type ReleaseDiff,
} from 'attest-schema';

export function diffBuilds(base: BuildFacts, candidate: BuildFacts): ReleaseDiff {
  const addedPermissions = diffSet(candidate.permissions.map((p) => p.name), base.permissions.map((p) => p.name));
  const removedPermissions = diffSet(base.permissions.map((p) => p.name), candidate.permissions.map((p) => p.name));

  const addedSdks = candidate.sdks
    .filter((s) => !base.sdks.some((b) => b.id === s.id))
    .map(({ id, vendor, name, matchedPackages }) => ({ id, vendor, name, matchedPackages }));
  const removedSdks = base.sdks
    .filter((s) => !candidate.sdks.some((c) => c.id === s.id))
    .map(({ id, vendor, name, matchedPackages }) => ({ id, vendor, name, matchedPackages }));

  const addedDomains = diffSet(candidate.domains.map((d) => d.host), base.domains.map((d) => d.host));
  const removedDomains = diffSet(base.domains.map((d) => d.host), candidate.domains.map((d) => d.host));

  const addedExportedComponents = candidate.exportedComponents.filter(
    (c) => !base.exportedComponents.some((b) => componentKey(b) === componentKey(c)),
  );
  const removedExportedComponents = base.exportedComponents.filter(
    (b) => !candidate.exportedComponents.some((c) => componentKey(c) === componentKey(b)),
  );

  return {
    schemaVersion: RELEASE_DIFF_SCHEMA_VERSION,
    base: base.artifact,
    candidate: candidate.artifact,
    addedPermissions,
    removedPermissions,
    addedSdks,
    removedSdks,
    addedDomains,
    removedDomains,
    addedExportedComponents,
    removedExportedComponents,
    targetSdkChange:
      base.targetSdk === candidate.targetSdk
        ? undefined
        : { from: base.targetSdk, to: candidate.targetSdk },
    minSdkChange:
      base.minSdk === candidate.minSdk ? undefined : { from: base.minSdk, to: candidate.minSdk },
    packageMismatch: !!base.packageName && !!candidate.packageName && base.packageName !== candidate.packageName,
    createdAt: new Date().toISOString(),
  };
}

function diffSet(a: string[], b: string[]): string[] {
  const other = new Set(b);
  return [...new Set(a.filter((x) => !other.has(x)))].sort();
}

function componentKey(c: ComponentFact): string {
  return `${c.kind}:${c.name}`;
}
