/**
 * Artifact inspector: AAB/APK → BuildFacts.
 *
 * Reports only observed facts: manifest declarations, exported components,
 * SDK package evidence, and network hosts found in binary strings.
 * The artifact is read locally and never uploaded (PRODUCT_PLAN §11).
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import {
  BUILD_FACTS_SCHEMA_VERSION,
  type BuildFacts,
  type ComponentFact,
  type ComponentKind,
  type FeatureFact,
  type PermissionFact,
} from 'attest-schema';

import { parseAxml, type AxmlElement } from './axml.js';
import { extractDexStrings } from './dex.js';
import { detectSdks, extractDomains } from './sdk-signatures.js';
import { ZipArchive } from './zip.js';

export const CLI_VERSION = '0.1.0';

const COMPONENT_KINDS = ['activity', 'activity-alias', 'service', 'receiver', 'provider'] as const;

export async function inspectArtifactFile(path: string): Promise<BuildFacts> {
  const bytes = await readFile(path);
  return inspectArtifact(bytes, basename(path));
}

export function inspectArtifact(bytes: Buffer, fileName: string): BuildFacts {
  const zip = new ZipArchive(bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const kind = detectKind(zip, fileName);
  const manifestEntry = findManifest(zip, kind);
  if (!manifestEntry) throw new Error(`No AndroidManifest.xml found in ${fileName}.`);
  const manifest = parseAxml(zip.read(manifestEntry));

  const dexStrings: string[] = [];
  for (const entry of zip.match((n) => n.endsWith('.dex'))) {
    try {
      dexStrings.push(...extractDexStrings(zip.read(entry)));
    } catch {
      // A non-parseable dex must not abort the whole inspection; other evidence stays intact.
    }
  }

  const identity = manifestFacts(manifest);
  return {
    schemaVersion: BUILD_FACTS_SCHEMA_VERSION,
    artifact: {
      fileName,
      sha256,
      sizeBytes: bytes.length,
      kind,
      packageName: identity.packageName,
      versionName: identity.versionName,
      versionCode: identity.versionCode,
    },
    ...identity,
    permissions: permissionsOf(manifest),
    features: featuresOf(manifest),
    exportedComponents: exportedComponentsOf(manifest),
    sdks: detectSdks(dexStrings),
    domains: extractDomains(dexStrings).map((host) => ({ host, source: 'dex_url' as const })),
    capturedAt: new Date().toISOString(),
    inspector: { name: 'attest-cli', version: CLI_VERSION },
  };
}

function detectKind(zip: ZipArchive, fileName: string): 'apk' | 'aab' {
  if (zip.has('base/manifest/AndroidManifest.xml') || zip.has('BundleConfig.pb')) return 'aab';
  if (fileName.toLowerCase().endsWith('.aab')) return 'aab';
  return 'apk';
}

function findManifest(zip: ZipArchive, kind: 'apk' | 'aab') {
  if (kind === 'aab') {
    return (
      zip.entries.get('base/manifest/AndroidManifest.xml') ??
      zip.match((n) => n.endsWith('manifest/AndroidManifest.xml'))[0]
    );
  }
  return (
    zip.entries.get('AndroidManifest.xml') ?? zip.match((n) => n.endsWith('AndroidManifest.xml'))[0]
  );
}

function intAttr(el: AxmlElement, name: string): number | undefined {
  const raw = el.get(name);
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

function manifestFacts(manifest: AxmlElement) {
  const usesSdk = manifest.children.find((c) => c.name === 'uses-sdk');
  return {
    packageName: manifest.get('package') ?? '',
    versionName: manifest.get('android:versionName'),
    versionCode: manifest.get('android:versionCode'),
    minSdk: usesSdk ? intAttr(usesSdk, 'android:minSdkVersion') : undefined,
    targetSdk: usesSdk ? intAttr(usesSdk, 'android:targetSdkVersion') : undefined,
  };
}

function permissionsOf(manifest: AxmlElement): PermissionFact[] {
  const out: PermissionFact[] = [];
  for (const el of manifest.children) {
    if (el.name !== 'uses-permission' && el.name !== 'uses-permission-sdk-23') continue;
    const name = el.get('android:name');
    if (!name) continue;
    const attributes: Record<string, string> = {};
    for (const attr of el.attributes) {
      if (attr.name === 'android:name') continue;
      attributes[attr.name] = el.get(attr.name) ?? '';
    }
    out.push({ name, attributes });
  }
  return dedupeBy(out, (p) => p.name).sort((a, b) => a.name.localeCompare(b.name));
}

function featuresOf(manifest: AxmlElement): FeatureFact[] {
  const out: FeatureFact[] = [];
  for (const el of manifest.children) {
    if (el.name !== 'uses-feature') continue;
    out.push({
      name: el.get('android:name'),
      required:
        el.get('android:required') === undefined
          ? undefined
          : el.get('android:required') === 'true',
      glEsVersion: el.get('android:glEsVersion'),
    });
  }
  return out.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

function exportedComponentsOf(manifest: AxmlElement): ComponentFact[] {
  const app = manifest.children.find((c) => c.name === 'application');
  if (!app) return [];
  const out: ComponentFact[] = [];

  for (const el of app.children) {
    if (!(COMPONENT_KINDS as readonly string[]).includes(el.name)) continue;
    const name = el.get('android:name');
    if (!name) continue;

    const actions = el.children
      .filter((c) => c.name === 'intent-filter')
      .flatMap((f) => f.children)
      .filter((c) => c.name === 'action')
      .map((a) => a.get('android:name'))
      .filter((x): x is string => !!x)
      .sort();

    const exportedAttr = el.get('android:exported');
    const exportedExplicit = exportedAttr === undefined ? undefined : exportedAttr === 'true';
    if (exportedExplicit === false) continue;
    if (exportedExplicit === undefined && actions.length === 0) continue;

    out.push({
      kind: el.name as ComponentKind,
      name,
      exported: true,
      exportedImplicitly: exportedExplicit === undefined,
      actions,
      authorities: el.name === 'provider' ? el.get('android:authorities') : undefined,
    });
  }
  return dedupeBy(out, (c) => `${c.kind}:${c.name}`).sort((a, b) =>
    `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`),
  );
}

function dedupeBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = key(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
