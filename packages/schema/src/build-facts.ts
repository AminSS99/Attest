/**
 * BuildFacts: the deterministic, observed truth extracted from one compiled
 * artifact (AAB/APK first, IPA later). This is the "Observed" evidence class
 * made concrete. Facts are never inferred here; the inspector only reports
 * what the artifact actually contains.
 */

export const BUILD_FACTS_SCHEMA_VERSION = 'attest.build-facts/1' as const;

export interface ArtifactIdentity {
  fileName: string;
  /** Lowercase hex SHA-256 of the exact bytes inspected. */
  sha256: string;
  sizeBytes: number;
  kind: 'apk' | 'aab' | 'ipa';
  packageName?: string;
  versionName?: string;
  versionCode?: string;
}

export interface PermissionFact {
  /** e.g. android.permission.ACCESS_FINE_LOCATION */
  name: string;
  /** Raw attributes from <uses-permission> (maxSdkVersion, usesPermissionFlags, ...). */
  attributes: Record<string, string>;
}

export interface FeatureFact {
  /** Hardware/software feature from <uses-feature>, or undefined for glEsVersion entries. */
  name?: string;
  required?: boolean;
  glEsVersion?: string;
}

export type ComponentKind = 'activity' | 'service' | 'receiver' | 'provider';

export interface ComponentFact {
  kind: ComponentKind;
  /** Fully-qualified class name, e.g. com.example.app.SettingsActivity */
  name: string;
  exported: boolean;
  /** True when exported was not explicit but intent-filters make it effectively exported (pre-API-31 semantics). */
  exportedImplicitly?: boolean;
  /** Intent-filter actions declared on this component. */
  actions: string[];
  /** Content-provider authorities, when applicable. */
  authorities?: string;
}

export interface SdkFact {
  /** Stable identifier, e.g. "com.google.firebase.analytics". */
  id: string;
  vendor: string;
  name: string;
  /** Binary package prefixes that matched inside DEX strings (evidence for the detection). */
  matchedPackages: string[];
}

export interface DomainFact {
  /** Lowercase host name observed in binary strings, e.g. firebaseinstallations.googleapis.com */
  host: string;
  /** How the host was observed. */
  source: 'dex_url';
}

export interface BuildFacts {
  schemaVersion: typeof BUILD_FACTS_SCHEMA_VERSION;
  artifact: ArtifactIdentity;
  packageName: string;
  versionName?: string;
  versionCode?: string;
  minSdk?: number;
  targetSdk?: number;
  permissions: PermissionFact[];
  features: FeatureFact[];
  /** Only exported (or effectively exported) components are listed — they are the attack/review surface. */
  exportedComponents: ComponentFact[];
  sdks: SdkFact[];
  domains: DomainFact[];
  /** ISO-8601 time the inspection ran. */
  capturedAt: string;
  inspector: { name: 'attest-cli'; version: string };
}
