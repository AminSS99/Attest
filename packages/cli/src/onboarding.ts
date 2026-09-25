/**
 * Pilot-ready onboarding (PRODUCT_PLAN §9 weeks 7–8): `attest init` and
 * `attest doctor`.
 *
 * `init` creates a reviewable `.attest` structure with no secrets:
 * app config, declaration templates, a journeys directory, output-directory
 * guidance, and a sample GitHub workflow. `doctor` checks the local setup
 * and reports actionable results with a nonzero exit for blocking errors.
 */

import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { JOURNEY_SCHEMA_VERSION } from 'attest-schema';

import { credentialReadiness } from './journey.js';

export const ATTEST_CONFIG_SCHEMA_VERSION = 'attest.config/1' as const;
export const MIN_NODE_MAJOR = 20;

export interface AttestConfig {
  schemaVersion: typeof ATTEST_CONFIG_SCHEMA_VERSION;
  app?: { packageName?: string };
  /** Paths relative to the project root (the directory containing `.attest`). */
  base?: string;
  candidate?: string;
  dataSafety?: string;
  privacyPolicy?: string;
  listing?: string;
  /** Journey files or directories, relative to the project root. */
  journeys?: string[];
  reviewerTwin?: { enabled?: boolean; device?: string };
  outDir?: string;
}

export interface DoctorResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  hint?: string;
}

export interface DoctorReport {
  ok: boolean;
  results: DoctorResult[];
}

function defaultConfig(): AttestConfig {
  return {
    schemaVersion: ATTEST_CONFIG_SCHEMA_VERSION,
    app: { packageName: 'com.example.app' },
    base: 'artifacts/base.apk',
    candidate: 'artifacts/candidate.apk',
    dataSafety: '.attest/declarations/data-safety.json',
    privacyPolicy: '.attest/declarations/privacy-policy.txt',
    listing: '.attest/declarations/store-listing.txt',
    journeys: ['journeys'],
    reviewerTwin: { enabled: true },
    outDir: 'attest-out',
  };
}

const DATA_SAFETY_TEMPLATE = `{
  "schemaVersion": "attest.data-safety/1",
  "collectedDataTypes": [],
  "sdkDisclosures": [],
  "domains": [],
  "effectiveDate": "2026-09-24",
  "source": "play-console-export"
}
`;

const PRIVACY_POLICY_TEMPLATE = `Paste the current privacy-policy text here for local truth-gap checks.

Attest reads this file verbatim and cites excerpts in findings. Keep the real
policy in version control; do not paste secrets or internal URLs.
`;

const LISTING_TEMPLATE = `Paste the current Play store listing copy here for local checks.

Attest compares listing claims against the build locally. No listing text ever
leaves the machine except inside the local Evidence Capsule artifact.
`;

const ATTEST_README = `# .attest — local Attest workspace

This directory is reviewable configuration for Attest's local engine.
No secrets or real credentials belong here — credential references live in
journey files as a label plus expiry only.

Layout:

- \`config.json\` — app package, artifact paths, declaration paths, journeys,
  Reviewer Twin settings, and output directory. Paths are relative to the
  project root (the directory containing \`.attest\`).
- \`declarations/\` — templates for the Data Safety export (JSON), privacy
  policy text, and store listing text. Replace the placeholders with the real
  files; Attest reads them locally and seals snapshots into the Evidence
  Capsule.
- \`journeys/\` — recorded Reviewer Twin journeys live here when you configure
  \`journeys: [".attest/journeys"]\`, or use a top-level \`journeys/\` directory.
  See \`attest journey record --help\` (human-guided over ADB).
- \`github-workflow.yml\` — sample GitHub Actions workflow using the reusable
  action at \`.github/actions/attest\`. Copy it to
  \`.github/workflows/attest.yml\` and adjust artifact paths.

Outputs:

- Attest writes Passports and Evidence Capsules under the configured
  \`outDir\` (default \`attest-out/\`, gitignored). Nothing is uploaded.

First run (five minutes):

1. Put the last-shipped build and the release candidate under \`artifacts/\`.
2. Fill in \`.attest/declarations/*\` from the Play Console and policy docs.
3. Run \`attest doctor\` until blocking checks pass.
4. Run \`attest check --base <base> --candidate <candidate> --data-safety <ds>\`
   then \`attest passport --base … --candidate … --out attest-out/capsule\`.
`;

const GITHUB_WORKFLOW_SAMPLE = `# Sample Attest release-truth gate. Copy to .github/workflows/attest.yml
# and adjust artifact paths. See examples/github-action.yml in the Attest repo.
#
# NOTE: attest-cli is not published; the action below builds Attest from source
# at github.action_path/../../.., so it only works when the Attest source tree
# is in the workspace. An app repo must vendor the full Attest source (e.g.
# clone to attest-vendor/) and use ./attest-vendor/.github/actions/attest.
# Copying just the action directory fails at the resolve step.
name: attest

on:
  pull_request:
    paths:
      - 'app/**'
      - 'declarations/**'

permissions:
  contents: read
  security-events: write

jobs:
  release-truth:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Vendor Attest source (required — the action builds from source)
        run: git clone --depth 1 <attest-repo-url> attest-vendor

      - name: Build release candidate (your existing Gradle step)
        run: ./gradlew :app:assembleRelease

      - name: Attest release-truth gate
        uses: ./attest-vendor/.github/actions/attest
        with:
          base: .attest/artifacts/base.apk
          candidate: app/build/outputs/apk/release/app-release.apk
          data-safety: .attest/declarations/data-safety.json
          privacy-policy: .attest/declarations/privacy-policy.txt
          listing: .attest/declarations/store-listing.txt
`;

export async function initProject(
  projectRoot: string,
  opts: { force?: boolean } = {},
): Promise<string[]> {
  const root = resolve(projectRoot);
  const attestDir = join(root, '.attest');
  const declarationsDir = join(attestDir, 'declarations');
  const attestJourneysDir = join(attestDir, 'journeys');
  const topJourneysDir = join(root, 'journeys');
  const created: string[] = [];

  async function writeIfAbsent(abs: string, contents: string): Promise<void> {
    try {
      await stat(abs);
      if (!opts.force) return;
    } catch {
      // absent — write below
    }
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, contents, 'utf8');
    created.push(abs);
  }

  await mkdir(attestDir, { recursive: true });
  await mkdir(declarationsDir, { recursive: true });
  await mkdir(attestJourneysDir, { recursive: true });
  await mkdir(topJourneysDir, { recursive: true });

  await writeIfAbsent(join(attestDir, 'config.json'), JSON.stringify(defaultConfig(), null, 2) + '\n');
  await writeIfAbsent(join(declarationsDir, 'data-safety.json'), DATA_SAFETY_TEMPLATE);
  await writeIfAbsent(join(declarationsDir, 'privacy-policy.txt'), PRIVACY_POLICY_TEMPLATE);
  await writeIfAbsent(join(declarationsDir, 'store-listing.txt'), LISTING_TEMPLATE);
  await writeIfAbsent(join(attestDir, 'README.md'), ATTEST_README);
  await writeIfAbsent(join(attestDir, 'github-workflow.yml'), GITHUB_WORKFLOW_SAMPLE);
  // Keep empty journey dirs reviewable without committing media.
  await writeIfAbsent(join(attestJourneysDir, '.gitkeep'), '');
  await writeIfAbsent(join(topJourneysDir, '.gitkeep'), '');

  return created;
}

export async function loadConfig(configPath: string): Promise<{ config: AttestConfig; raw: string }> {
  const raw = await readFile(configPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Cannot parse ${configPath}: ${(err as Error).message}`);
  }
  const config = parsed as AttestConfig;
  if (config?.schemaVersion !== ATTEST_CONFIG_SCHEMA_VERSION) {
    throw new Error(
      `${configPath}: unsupported schemaVersion "${String((config as { schemaVersion?: unknown })?.schemaVersion)}" (expected "${ATTEST_CONFIG_SCHEMA_VERSION}"). Re-run \`attest init --force\` to refresh the template.`,
    );
  }
  return { config, raw };
}

function nodeMajor(): number {
  const m = /^v(\d+)\./.exec(process.version);
  return m ? Number(m[1]) : 0;
}

function adbAvailable(): { found: boolean; detail: string } {
  try {
    const r = spawnSync('adb', ['version'], { encoding: 'utf8' });
    if (r.error) return { found: false, detail: (r.error as Error).message };
    if (r.status !== 0) {
      return { found: false, detail: (r.stderr || r.stdout || `exit ${r.status}`).trim() };
    }
    const first = (r.stdout || '').split('\n')[0]?.trim() || 'adb found';
    return { found: true, detail: first };
  } catch (err) {
    return { found: false, detail: (err as Error).message };
  }
}

const SECRET_KEY_PATTERN =
  /(password|passwd|secret|api[_-]?key|auth[_-]?token|access[_-]?token|private[_-]?key|client[_-]?secret|bearer|aws_secret|aws_access|ghp_|gho_|ghu_|sk-live|sk-test|xox[bap]-|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

function findSecretHint(raw: string): string | undefined {
  // Look for secret-like keys with an assigned value, not prose mentioning the word.
  const lines = raw.split('\n');
  for (const line of lines) {
    const m = /"([^"]+)"\s*:\s*"([^"]+)"/.exec(line);
    if (!m) continue;
    const [, key = '', value = ''] = m;
    if (key === 'schemaVersion' || key === 'source') continue;
    if (SECRET_KEY_PATTERN.test(key) && value.trim().length > 0) {
      return `key "${key}" looks like a secret value`;
    }
    if (SECRET_KEY_PATTERN.test(value) && /BEGIN .*PRIVATE KEY/.test(value)) {
      return `value for "${key}" looks like an embedded private key`;
    }
  }
  // Long opaque token assigned to an unknown key is also suspicious.
  for (const line of lines) {
    const m = /"([^"]+)"\s*:\s*"([A-Za-z0-9_\-+/=]{32,})"/.exec(line);
    if (m && SECRET_KEY_PATTERN.test(m[1]!)) return `key "${m[1]}" holds a long opaque value`;
  }
  return undefined;
}

async function fileExists(abs: string): Promise<boolean> {
  try {
    const s = await stat(abs);
    return s.isFile() || s.isDirectory();
  } catch {
    return false;
  }
}

async function collectJourneyFiles(projectRoot: string, journeys?: string[]): Promise<string[]> {
  if (!journeys || journeys.length === 0) return [];
  const out: string[] = [];
  for (const entry of journeys) {
    const abs = resolve(projectRoot, entry);
    let s;
    try {
      s = await stat(abs);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      let names: string[] = [];
      try {
        names = await readdir(abs);
      } catch {
        continue;
      }
      for (const n of names.filter((f) => f.endsWith('.json'))) out.push(join(abs, n));
    } else if (s.isFile() && abs.endsWith('.json')) {
      out.push(abs);
    }
  }
  return out.sort();
}

export async function doctorProject(
  opts: { projectRoot?: string; configPath?: string; now?: Date } = {},
): Promise<DoctorReport> {
  const now = opts.now ?? new Date();
  const projectRoot = resolve(opts.projectRoot ?? process.cwd());
  const configPath = opts.configPath ?? join(projectRoot, '.attest', 'config.json');
  const results: DoctorResult[] = [];
  let blockingFailed = false;
  const fail = (r: DoctorResult) => {
    results.push(r);
    if (r.status === 'fail') blockingFailed = true;
  };

  // 1. Supported Node version.
  const major = nodeMajor();
  if (major >= MIN_NODE_MAJOR) {
    results.push({ name: 'node', status: 'pass', detail: `${process.version} meets >=${MIN_NODE_MAJOR}` });
  } else {
    fail({
      name: 'node',
      status: 'fail',
      detail: `${process.version} is older than the supported >=${MIN_NODE_MAJOR}`,
      hint: `Install Node.js ${MIN_NODE_MAJOR} or newer (https://nodejs.org) and re-run attest doctor.`,
    });
  }

  // 2. Config present and parseable.
  let config: AttestConfig | undefined;
  let raw = '';
  try {
    const loaded = await loadConfig(configPath);
    config = loaded.config;
    raw = loaded.raw;
    results.push({ name: 'config', status: 'pass', detail: `${configPath} parses (${config.schemaVersion})` });
  } catch (err) {
    fail({
      name: 'config',
      status: 'fail',
      detail: (err as Error).message,
      hint: 'Run `attest init` from the project root to create .attest/config.json.',
    });
    return { ok: false, results };
  }

  // 3. Accidental secrets in configuration.
  const secretHint = findSecretHint(raw);
  if (secretHint) {
    fail({
      name: 'secrets',
      status: 'fail',
      detail: `${secretHint} in ${configPath}`,
      hint: 'Remove the secret value; store only a vault reference or label plus expiry (journeys keep label + expiresAt, never the credential).',
    });
  } else {
    results.push({ name: 'secrets', status: 'pass', detail: 'no secret-like values in config.json' });
  }

  // 4. Artifact and declaration paths exist.
  const pathChecks: Array<{ label: string; value?: string; kind: 'artifact' | 'declaration' }> = [
    { label: 'base artifact', value: config.base, kind: 'artifact' },
    { label: 'candidate artifact', value: config.candidate, kind: 'artifact' },
    { label: 'data-safety declaration', value: config.dataSafety, kind: 'declaration' },
    { label: 'privacy-policy declaration', value: config.privacyPolicy, kind: 'declaration' },
    { label: 'store-listing declaration', value: config.listing, kind: 'declaration' },
  ];
  for (const check of pathChecks) {
    if (!check.value) {
      results.push({ name: check.label, status: 'warn', detail: 'not configured — skipped' });
      continue;
    }
    const abs = resolve(projectRoot, check.value);
    if (await fileExists(abs)) {
      results.push({ name: check.label, status: 'pass', detail: `${check.value} exists` });
    } else {
      fail({
        name: check.label,
        status: 'fail',
        detail: `${check.value} not found (resolved to ${abs})`,
        hint:
          check.kind === 'artifact'
            ? 'Place the AAB/APK at the configured path or update .attest/config.json.'
            : 'Fill in the template under .attest/declarations/ or update the path in .attest/config.json.',
      });
    }
  }

  // 5. Journey files parse correctly.
  const journeyFiles = await collectJourneyFiles(projectRoot, config.journeys);
  if (!config.journeys || config.journeys.length === 0) {
    results.push({ name: 'journeys', status: 'warn', detail: 'no journeys configured — Reviewer Twin skipped' });
  } else if (journeyFiles.length === 0) {
    const missing = [];
    for (const entry of config.journeys) {
      if (!(await fileExists(resolve(projectRoot, entry)))) missing.push(entry);
    }
    if (missing.length > 0) {
      fail({
        name: 'journeys',
        status: 'fail',
        detail: `configured journey path(s) not found: ${missing.join(', ')}`,
        hint: 'Run `attest journey record --device <serial> --name <slug>` to record one, or fix the paths in .attest/config.json.',
      });
    } else {
      results.push({
        name: 'journeys',
        status: 'warn',
        detail: `journey directorie(s) exist but hold no .json files (${config.journeys.join(', ')})`,
        hint: 'Record a journey with `attest journey record --device <serial> --name <slug> --out journeys/`.',
      });
    }
  } else {
    let parsed = 0;
    for (const f of journeyFiles) {
      try {
        const doc = JSON.parse(await readFile(f, 'utf8')) as {
          schemaVersion?: string;
          steps?: unknown[];
          credentialRef?: { label?: string; expiresAt?: string } & Record<string, unknown>;
        };
        if (doc.schemaVersion !== JOURNEY_SCHEMA_VERSION) {
          fail({
            name: `journey ${f}`,
            status: 'fail',
            detail: `unsupported schema "${String(doc.schemaVersion)}" (expected "${JOURNEY_SCHEMA_VERSION}")`,
            hint: 'Re-record the journey with the current attest version.',
          });
          continue;
        }
        if (!Array.isArray(doc.steps) || doc.steps.length === 0) {
          fail({
            name: `journey ${f}`,
            status: 'fail',
            detail: 'journey has no steps',
            hint: 'Re-record the journey; a journey needs at least one recorded step.',
          });
          continue;
        }
        const cred = doc.credentialRef as Record<string, unknown> | undefined;
        if (cred && Object.keys(cred).some((k) => /secret|password|token|value/i.test(k))) {
          fail({
            name: `journey ${f}`,
            status: 'fail',
            detail: 'credential object holds a secret-like field (only label + expiresAt belong in evidence)',
            hint: 'Replace the secret with a vault reference label plus expiresAt; secrets never enter journeys, Passports, or Capsules.',
          });
          continue;
        }
        parsed++;
        results.push({ name: `journey ${f}`, status: 'pass', detail: `${doc.steps.length} step(s) parse` });
      } catch (err) {
        fail({
          name: `journey ${f}`,
          status: 'fail',
          detail: `cannot parse journey JSON: ${(err as Error).message}`,
          hint: 'Fix the JSON or re-record the journey.',
        });
      }
    }
    if (parsed === journeyFiles.length && journeyFiles.length > 0) {
      results.push({ name: 'journeys', status: 'pass', detail: `${parsed} journey file(s) parse` });
    }
  }

  // 6. Credential references: expired or near expiry.
  for (const f of journeyFiles) {
    try {
      const doc = JSON.parse(await readFile(f, 'utf8')) as {
        credentialRef?: { label?: string; expiresAt?: string };
      };
      if (!doc.credentialRef) continue;
      if (!doc.credentialRef.label) continue;
      const readiness = credentialReadiness(
        { label: doc.credentialRef.label, expiresAt: doc.credentialRef.expiresAt },
        now,
      );
      const label = doc.credentialRef.label ?? '(unlabeled)';
      if (readiness === 'expired') {
        fail({
          name: `credential ${label}`,
          status: 'fail',
          detail: `${f}: credential "${label}" expired${doc.credentialRef.expiresAt ? ` (${doc.credentialRef.expiresAt})` : ''}`,
          hint: 'Refresh the reviewer credential and re-record or update the journey expiresAt before submission.',
        });
      } else if (readiness === 'expiring_soon') {
        results.push({
          name: `credential ${label}`,
          status: 'warn',
          detail: `${f}: credential "${label}" expires soon (${doc.credentialRef.expiresAt})`,
          hint: 'Rotate the credential before the release to avoid a blocked review.',
        });
      } else if (readiness === 'ready') {
        results.push({
          name: `credential ${label}`,
          status: 'pass',
          detail: `credential "${label}" ready (expires ${doc.credentialRef.expiresAt})`,
        });
      }
    } catch {
      // Parse errors already reported above.
    }
  }

  // 7. ADB available when Reviewer Twin is configured.
  const twinEnabled = config.reviewerTwin?.enabled !== false && (config.journeys?.length ?? 0) > 0;
  if (!twinEnabled) {
    results.push({ name: 'adb', status: 'pass', detail: 'Reviewer Twin not configured — ADB check skipped' });
  } else {
    const adb = adbAvailable();
    if (adb.found) {
      results.push({ name: 'adb', status: 'pass', detail: adb.detail });
    } else {
      fail({
        name: 'adb',
        status: 'fail',
        detail: `adb not available (${adb.detail}) but Reviewer Twin journeys are configured`,
        hint: 'Install Android platform-tools and ensure `adb` is on PATH, or set reviewerTwin.enabled to false in .attest/config.json for declaration-only checks.',
      });
    }
  }

  // 8. Output location writable.
  const outDir = resolve(projectRoot, config.outDir ?? 'attest-out');
  try {
    await mkdir(outDir, { recursive: true });
    const probe = join(outDir, '.attest-write-test');
    await writeFile(probe, 'ok', 'utf8');
    await rm(probe, { force: true });
    results.push({ name: 'outDir', status: 'pass', detail: `${config.outDir ?? 'attest-out/'} is writable` });
  } catch (err) {
    fail({
      name: 'outDir',
      status: 'fail',
      detail: `output directory ${outDir} is not writable: ${(err as Error).message}`,
      hint: 'Point outDir at a writable directory in .attest/config.json.',
    });
  }

  return { ok: !blockingFailed, results };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = ['attest doctor — local setup check'];
  for (const r of report.results) {
    const badge = r.status === 'pass' ? 'PASS' : r.status === 'warn' ? 'WARN' : 'FAIL';
    lines.push(`  [${badge}] ${r.name}: ${r.detail}`);
    if (r.hint) lines.push(`        → ${r.hint}`);
  }
  lines.push(report.ok ? 'doctor: ready (warnings are advisory).' : 'doctor: blocking setup errors found.');
  return lines.join('\n');
}
