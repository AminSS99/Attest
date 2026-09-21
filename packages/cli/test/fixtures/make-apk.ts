/**
 * Synthetic AAB/APK factory: manifest spec → AXML, DEX strings → classes.dex,
 * wrapped in a real ZIP. This is how tests and the demo produce artifacts
 * that exercise the entire production pipeline without a build toolchain.
 */

import { buildAxml, type AxmlSpecElement } from './make-axml.js';
import { buildDex } from './make-dex.js';
import { buildZip, type ZipInputEntry } from './make-zip.js';

export interface ComponentSpec {
  kind: 'activity' | 'activity-alias' | 'service' | 'receiver' | 'provider';
  name: string;
  exported?: boolean;
  actions?: string[];
  authorities?: string;
}

export interface AppSpec {
  packageName: string;
  versionName: string;
  versionCode: number;
  minSdk?: number;
  targetSdk?: number;
  permissions?: string[];
  features?: string[];
  components?: ComponentSpec[];
  /** Slash-style package prefixes; emitted as DEX type descriptors. */
  sdkPackages?: string[];
  /** Full URLs embedded in binary strings. */
  urls?: string[];
  extraStrings?: string[];
  aab?: boolean;
}

export function buildArtifact(spec: AppSpec): Buffer {
  const manifestChildren: AxmlSpecElement[] = [];

  if (spec.minSdk !== undefined || spec.targetSdk !== undefined) {
    manifestChildren.push({
      name: 'uses-sdk',
      attrs: {
        ...(spec.minSdk !== undefined ? { 'android:minSdkVersion': spec.minSdk } : {}),
        ...(spec.targetSdk !== undefined ? { 'android:targetSdkVersion': spec.targetSdk } : {}),
      },
    });
  }
  for (const p of spec.permissions ?? []) {
    manifestChildren.push({ name: 'uses-permission', attrs: { 'android:name': p } });
  }
  for (const f of spec.features ?? []) {
    manifestChildren.push({
      name: 'uses-feature',
      attrs: { 'android:name': f, 'android:required': false },
    });
  }

  const application: AxmlSpecElement = {
    name: 'application',
    attrs: { 'android:label': 'Demo App' },
    children: (spec.components ?? []).map((c) => ({
      name: c.kind,
      attrs: {
        'android:name': c.name,
        ...(c.exported !== undefined ? { 'android:exported': c.exported } : {}),
        ...(c.authorities ? { 'android:authorities': c.authorities } : {}),
      },
      children:
        c.actions && c.actions.length > 0
          ? [
              {
                name: 'intent-filter',
                children: c.actions.map((a) => ({
                  name: 'action',
                  attrs: { 'android:name': a },
                })),
              },
            ]
          : [],
    })),
  };
  manifestChildren.push(application);

  const manifest = buildAxml({
    name: 'manifest',
    attrs: {
      package: spec.packageName,
      'android:versionCode': spec.versionCode,
      'android:versionName': spec.versionName,
    },
    children: manifestChildren,
  });

  const dexStrings = [
    ...(spec.sdkPackages ?? []).map((p) => `L${p}/Sdk;`),
    ...(spec.urls ?? []),
    ...(spec.extraStrings ?? []),
    'Lkotlin/Unit;',
  ];
  const dex = buildDex(dexStrings);

  const entries: ZipInputEntry[] = spec.aab
    ? [
        { name: 'BundleConfig.pb', data: Buffer.from([0x0a, 0x00]) },
        { name: 'base/manifest/AndroidManifest.xml', data: manifest },
        { name: 'base/dex/classes.dex', data: dex },
        { name: 'base/res/resources.pb', data: Buffer.from('res') },
      ]
    : [
        { name: 'AndroidManifest.xml', data: manifest },
        { name: 'classes.dex', data: dex },
        { name: 'META-INF/MANIFEST.MF', data: Buffer.from('Manifest-Version: 1.0\r\n\r\n') },
      ];
  return buildZip(entries);
}
