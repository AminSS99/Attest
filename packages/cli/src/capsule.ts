/**
 * Evidence Capsule (PRODUCT_PLAN §6.9): seal a portable, tamper-evident
 * evidence package for one release, and verify it offline later.
 *
 * Layout:
 *   capsule/
 *     passport.json / passport.html
 *     diff.json / findings.json / findings.sarif
 *     facts/base.facts.json / facts/candidate.facts.json
 *     declarations/… (snapshots of what was imported)
 *     journeys/<journeyId>/journey.json    ← recorded Reviewer Twin runs
 *     journeys/<journeyId>/comparison.json ← baseline vs candidate comparison
 *     journeys/<journeyId>/<evidence>/…    ← screenshots (binary, hashed)
 *     capsule-manifest.json  ← SHA-256 over every file + evidence root hash
 *
 * The capsule proves what evidence existed and what decision was made. It
 * does not certify legal compliance.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import {
  CORE_TRUTH_GAP_RULESET_VERSION,
  EVIDENCE_CAPSULE_SCHEMA_VERSION,
  type CapsuleFileEntry,
  type CapsuleManifest,
  type CapsuleVerification,
  type ReleasePassport,
} from 'attest-schema';

import type { JourneyBundle } from './journey.js';
import { serializeComparison, serializeJourney } from './journey.js';
import { CLI_VERSION } from './inspect.js';
import { computePassportId, renderPassportHtml } from './passport.js';

export const CAPSULE_MANIFEST_NAME = 'capsule-manifest.json';

export interface CapsuleInput {
  passport: ReleasePassport;
  passportHtml: string;
  sarif: string;
  /** Declaration snapshots: path-suffix → contents (already redacted). */
  declarations: Record<string, string>;
  /** Recorded journeys with screenshot bytes and optional baseline comparison. */
  journeys?: JourneyBundle[];
  redactions: string[];
}

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Canonical seal: sha256 over sorted "sha256  path" lines. */
export function evidenceRootHash(files: CapsuleFileEntry[]): string {
  const canonical = [...files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `${f.sha256}  ${f.path}`)
    .join('\n');
  return sha256(canonical);
}

export async function sealCapsule(dir: string, input: CapsuleInput): Promise<CapsuleManifest> {
  const p = input.passport;
  const textFiles: Record<string, string> = {
    'passport.json': JSON.stringify(p, null, 2),
    'passport.html': input.passportHtml,
    'diff.json': JSON.stringify(p.diff, null, 2),
    'findings.json': JSON.stringify(p.findings, null, 2),
    'findings.sarif': input.sarif,
    ...Object.fromEntries(
      Object.entries(input.declarations).map(([name, text]) => [`declarations/${name}`, text]),
    ),
  };
  const binaryFiles: Record<string, Buffer> = {};

  for (const bundle of input.journeys ?? []) {
    const base = `journeys/${bundle.journey.id}`;
    textFiles[`${base}/journey.json`] = serializeJourney(bundle.journey);
    if (bundle.comparison) textFiles[`${base}/comparison.json`] = serializeComparison(bundle.comparison);
    for (const [rel, bytes] of Object.entries(bundle.files)) {
      binaryFiles[`${base}/${rel}`] = bytes;
    }
  }

  await mkdir(dir, { recursive: true });
  const entries: CapsuleFileEntry[] = [];
  const allFiles = [
    ...Object.entries(textFiles).map(
      ([rel, text]): [string, Buffer] => [rel, Buffer.from(text, 'utf8')],
    ),
    ...Object.entries(binaryFiles),
  ];
  for (const [rel, bytes] of allFiles.sort(([a], [b]) => a.localeCompare(b))) {
    const abs = join(dir, rel);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, bytes);
    entries.push({ path: rel, sha256: sha256(bytes), bytes: bytes.length });
  }

  const manifest: CapsuleManifest = {
    schemaVersion: EVIDENCE_CAPSULE_SCHEMA_VERSION,
    id: `EC-${sha256(p.id + p.createdAt).slice(0, 24)}`,
    createdAt: new Date().toISOString(),
    tool: { name: 'attest-cli', version: CLI_VERSION },
    artifact: {
      fileName: p.candidate.fileName,
      sha256: p.candidate.sha256,
      packageName: p.candidate.packageName,
      versionName: p.candidate.versionName,
      versionCode: p.candidate.versionCode,
    },
    toolset: { cli: CLI_VERSION, ruleset: CORE_TRUTH_GAP_RULESET_VERSION },
    files: entries,
    redactions: input.redactions,
    evidenceRootHash: evidenceRootHash(entries),
  };
  await writeFile(join(dir, CAPSULE_MANIFEST_NAME), JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

/** Offline verification: recompute every hash, the evidence root, and the Passport id. */
export async function verifyCapsule(dir: string): Promise<CapsuleVerification> {
  const errors: string[] = [];
  let manifest: CapsuleManifest;
  try {
    manifest = JSON.parse(await readFile(join(dir, CAPSULE_MANIFEST_NAME), 'utf8'));
  } catch (err) {
    return {
      ok: false, checked: 0, mismatches: [], missing: [], extra: [],
      evidenceRootOk: false,
      errors: [`Cannot read ${CAPSULE_MANIFEST_NAME}: ${(err as Error).message}`],
    };
  }
  if (manifest.schemaVersion !== EVIDENCE_CAPSULE_SCHEMA_VERSION) {
    errors.push(`Unsupported capsule schema "${manifest.schemaVersion}".`);
  }

  const onDisk = await listFiles(dir);
  const expected = new Map(manifest.files.map((f) => [f.path, f]));
  const mismatches: CapsuleVerification['mismatches'] = [];
  const missing: string[] = [];
  let checked = 0;

  for (const [path, entry] of expected) {
    if (!onDisk.has(path)) {
      missing.push(path);
      continue;
    }
    const actual = sha256(await readFile(join(dir, path)));
    checked++;
    if (actual !== entry.sha256) {
      mismatches.push({ path, expected: entry.sha256, actual });
    }
  }
  const extra = [...onDisk].filter((p) => p !== CAPSULE_MANIFEST_NAME && !expected.has(p));
  const evidenceRootOk =
    manifest.files.length > 0 && evidenceRootHash(manifest.files) === manifest.evidenceRootHash;

  // The Passport carries its own content-addressed id — recompute it so a
  // swapped passport.json fails even when the attacker also fixed the hash.
  if (onDisk.has('passport.json') && !mismatches.some((m) => m.path === 'passport.json')) {
    try {
      const p = JSON.parse(await readFile(join(dir, 'passport.json'), 'utf8')) as ReleasePassport;
      const { id: claimed, ...rest } = p;
      const actual = computePassportId(rest);
      if (claimed !== actual) {
        errors.push(`Passport id mismatch: document claims ${claimed}, content hashes to ${actual}.`);
      }
    } catch (err) {
      errors.push(`Cannot verify passport.json integrity: ${(err as Error).message}`);
    }
  }

  return {
    ok: errors.length === 0 && mismatches.length === 0 && missing.length === 0 && evidenceRootOk,
    checked,
    mismatches,
    missing,
    extra,
    evidenceRootOk,
    errors,
  };
}

/**
 * Re-seal an existing capsule after its Passport gained exceptions or a final
 * decision. Every other evidence file keeps its bytes and its manifest entry;
 * only `passport.json` / `passport.html` are rewritten and the evidence root
 * is recomputed. Post-decision edits outside this function fail `verifyCapsule`.
 */
export async function resealCapsule(
  dir: string,
  passport: ReleasePassport,
): Promise<CapsuleManifest> {
  let previous: CapsuleManifest;
  try {
    previous = JSON.parse(await readFile(join(dir, CAPSULE_MANIFEST_NAME), 'utf8'));
  } catch (err) {
    throw new Error(
      `Cannot reseal ${dir}: no readable ${CAPSULE_MANIFEST_NAME} (${(err as Error).message})`,
    );
  }

  const passportJson = Buffer.from(JSON.stringify(passport, null, 2), 'utf8');
  const passportHtml = Buffer.from(renderPassportHtml(passport), 'utf8');
  await writeFile(join(dir, 'passport.json'), passportJson);
  await writeFile(join(dir, 'passport.html'), passportHtml);

  const files: CapsuleFileEntry[] = [];
  for (const entry of previous.files) {
    if (entry.path === 'passport.json') {
      files.push({ ...entry, sha256: sha256(passportJson), bytes: passportJson.length });
    } else if (entry.path === 'passport.html') {
      files.push({ ...entry, sha256: sha256(passportHtml), bytes: passportHtml.length });
    } else {
      files.push(entry);
    }
  }
  // A capsule sealed without a rendered HTML still gets one on reseal.
  if (!files.some((f) => f.path === 'passport.html')) {
    files.push({ path: 'passport.html', sha256: sha256(passportHtml), bytes: passportHtml.length });
    files.sort((a, b) => a.path.localeCompare(b.path));
  }

  const manifest: CapsuleManifest = {
    ...previous,
    files,
    evidenceRootHash: evidenceRootHash(files),
  };
  await writeFile(join(dir, CAPSULE_MANIFEST_NAME), JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

async function listFiles(dir: string, base = dir): Promise<Set<string>> {
  const out = new Set<string>();
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const f of await listFiles(abs, base)) out.add(f);
    } else {
      out.add(relative(base, abs).split('\\').join('/'));
    }
  }
  return out;
}
