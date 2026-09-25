#!/usr/bin/env node
/**
 * attest — local release-truth CLI (PRODUCT_PLAN §5.10, §11).
 *
 * Exit codes: 0 ok/ship-or-review · 2 confirmed contradictions (hold) · 1 usage/runtime error.
 */

import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

import {
  RELEASE_PASSPORT_SCHEMA_VERSION,
  type DataSafetyDeclaration,
  type DeclaredText,
  type Finding,
  type JourneyComparison,
  type JourneyKind,
  type ReleasePassport,
} from 'attest-schema';

import { AdbDevice } from './adb.js';
import { resealCapsule, sealCapsule, verifyCapsule, CAPSULE_MANIFEST_NAME } from './capsule.js';
import { importDataSafetyFile } from './datasafety.js';
import { importDeclaredTextFile } from './declared-text.js';
import { acceptException, DecisionError, decide, describeDecision } from './decision.js';
import { diffBuilds } from './diff.js';
import { doctorProject, formatDoctorReport, initProject } from './onboarding.js';
import {
  applyComparison,
  compareJourneys,
  journeyFindings,
  loadJourneyBundle,
  recordJourney,
  renderReviewerInstructions,
  serializeComparison,
  textComparisonReport,
  textJourneyReport,
  type JourneyBundle,
  type RecorderIO,
} from './journey.js';
import { CLI_VERSION, inspectArtifactFile } from './inspect.js';
import { buildPassport, humanDate, renderPassportHtml } from './passport.js';
import { toSarif } from './sarif.js';
import { buildClaims } from './truthgraph.js';
import { runTruthGapRules, type RuleInput } from './truthgap.js';

const HELP = `attest ${CLI_VERSION} — prove your mobile release matches its promises.

Usage:
  attest inspect <artifact> [--out facts.json]
  attest diff <base> <candidate> [--out diff.json]
  attest check --base <a> --candidate <b> [--data-safety f.json|f.csv]
               [--privacy-policy f.txt] [--listing f.txt]
               [--journey j1.json[,j2.json]] [--comparison c.json]
               [--format text|json|sarif] [--out file]
  attest journey record --device <serial> --name <slug> [--title t]
               [--kind reviewer] [--credential-label l] [--credential-expires iso]
               [--artifact a.apk] [--out journeys/]
  attest journey compare --baseline <approved.json> --candidate <current.json>
               [--format text|json] [--out file] [--no-save]
  attest journey instructions --journey <current.json> [--baseline <approved.json>]
               [--out file.html]
  attest passport --base <a> --candidate <b> [declaration flags]
               [--journey j1.json[,j2.json]] [--comparison c.json] --out <dir>
  attest exception accept --passport <p.json> --finding <F-...>
               --owner <name> --reason <text> --expires <YYYY-MM-DD>
               --approved-by <name> [--out <p.json>]
  attest decide --passport <p.json> --status ship|hold --decided-by <name>
               [--reason <text>] --out <approved-passport.json>
  attest seal --passport <p.json> --out <capsule-dir> [--from <capsule-dir>]
  attest verify <capsule-dir>
  attest init [--dir <project-root>] [--force]
  attest doctor [--dir <project-root>] [--config <config.json>]

Journeys are human-guided Reviewer Twin recordings (screenshot + step +
expected/observed state) captured over ADB. Credentials appear as expiring
references only — secrets never enter evidence.

Exceptions overlay findings without erasing them; Attest's recommendation is
never changed by an exception or a human decision. Shipping over HOLD requires
--reason. Finalized decisions are immutable — corrections write a new Passport
revision via --out.

Artifacts are AAB/APK files, inspected locally. Source code is never required.`;

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Map<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next === undefined || next.startsWith('--')) flags.set(key, 'true');
      else {
        flags.set(key, next);
        i++;
      }
    } else positional.push(a);
  }
  return { command, positional, flags };
}

type RuleInputWithDeclarations = RuleInput & { _declarations: Record<string, string> };

async function buildRuleInput(flags: Map<string, string>): Promise<RuleInputWithDeclarations | null> {
  const basePath = flags.get('base');
  const candidatePath = flags.get('candidate');
  if (!basePath || !candidatePath) return null;

  const base = await inspectArtifactFile(basePath);
  const candidate = await inspectArtifactFile(candidatePath);
  const diff = diffBuilds(base, candidate);

  const declarations: Record<string, string> = {};
  let dataSafety: DataSafetyDeclaration | undefined;
  let privacyPolicy: DeclaredText | undefined;
  let listing: DeclaredText | undefined;

  if (flags.has('data-safety')) {
    dataSafety = await importDataSafetyFile(flags.get('data-safety')!);
    declarations['data-safety.json'] = JSON.stringify(dataSafety, null, 2);
  }
  if (flags.has('privacy-policy')) {
    privacyPolicy = await importDeclaredTextFile(flags.get('privacy-policy')!, 'privacy_policy');
    declarations['privacy-policy.txt'] = privacyPolicy.text;
  }
  if (flags.has('listing')) {
    listing = await importDeclaredTextFile(flags.get('listing')!, 'store_listing');
    declarations['store-listing.txt'] = listing.text;
  }

  return { base, candidate, diff, dataSafety, privacyPolicy, listing, _declarations: declarations };
}

const JOURNEY_KINDS: readonly string[] = [
  'reviewer', 'consent', 'deletion', 'purchase', 'restore', 'restricted_content',
];

function csvPaths(value: string | undefined): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

async function journeyDirOf(path: string): Promise<string> {
  const info = await stat(path);
  return info.isDirectory() ? path : dirname(path);
}

async function loadComparisons(flags: Map<string, string>): Promise<JourneyComparison[]> {
  const out: JourneyComparison[] = [];
  for (const p of csvPaths(flags.get('comparison'))) {
    out.push(JSON.parse(await readFile(p, 'utf8')) as JourneyComparison);
  }
  return out;
}

async function loadPassport(path: string): Promise<ReleasePassport> {
  const doc = JSON.parse(await readFile(path, 'utf8')) as ReleasePassport;
  if (doc.schemaVersion !== RELEASE_PASSPORT_SCHEMA_VERSION) {
    throw new Error(`Unsupported passport schema "${doc.schemaVersion}" in ${path}.`);
  }
  if (!Array.isArray(doc.findings) || !doc.decision || !doc.candidate) {
    throw new Error(`${path} is not a Release Passport document.`);
  }
  return doc;
}

async function hasCapsuleManifest(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, CAPSULE_MANIFEST_NAME));
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist a decision/exception outcome: write the Passport JSON to `outPath`,
 * and when the source or destination sits inside a sealed capsule, reseal it
 * so the new exceptions + decision are covered by the evidence root hash.
 *
 * Only a capsule's own `passport.json` is ever resealed. A correction written
 * to a different filename in the same directory (e.g. `approved-passport.json`
 * or `rev1.json`) is left as an untracked sidecar — resealing would overwrite
 * the sealed `passport.json` and destroy the original revision. Use
 * `attest seal --from <capsule> --passport <rev.json> --out <new-capsule>` to
 * seal a correction as a new capsule.
 */
async function persistPassport(
  sourcePath: string,
  outPath: string,
  passport: ReleasePassport,
  opts: { updateSource: boolean },
): Promise<void> {
  const json = JSON.stringify(passport, null, 2) + '\n';
  const sourceDir = dirname(sourcePath);
  const outDir = dirname(outPath);
  const sameFile = resolve(sourcePath) === resolve(outPath);
  const sourceIsPassportJson = resolve(sourcePath) === resolve(join(sourceDir, 'passport.json'));
  const outIsPassportJson = resolve(outPath) === resolve(join(outDir, 'passport.json'));
  const sourceInCapsule = await hasCapsuleManifest(sourceDir);
  const outInCapsule = await hasCapsuleManifest(outDir);

  if (opts.updateSource && sourceInCapsule && !sameFile) {
    await writeFile(sourcePath, json, 'utf8');
  }
  await writeFile(outPath, json, 'utf8');

  const resealedDirs = new Set<string>();
  if (opts.updateSource && sourceInCapsule && sourceIsPassportJson) {
    await resealCapsule(sourceDir, passport);
    resealedDirs.add(resolve(sourceDir));
  }
  if (outInCapsule && outIsPassportJson && !resealedDirs.has(resolve(outDir))) {
    await resealCapsule(outDir, passport);
  }
}

/** `attest exception accept` — overlay an approved exception on a finding. */
async function exceptionAccept(flags: Map<string, string>): Promise<number> {
  const passportPath = flags.get('passport');
  if (!passportPath) return usage('exception accept requires --passport');
  for (const req of ['finding', 'owner', 'reason', 'expires', 'approved-by']) {
    if (!flags.get(req)) return usage(`exception accept requires --${req}`);
  }

  const passport = await loadPassport(passportPath);
  try {
    const next = acceptException(passport, {
      findingId: flags.get('finding')!,
      owner: flags.get('owner')!,
      rationale: flags.get('reason')!,
      expiresAt: flags.get('expires')!,
      approvedBy: flags.get('approved-by')!,
    });
    const outPath = flags.get('out') ?? passportPath;
    await persistPassport(passportPath, outPath, next, { updateSource: outPath === passportPath });

    const added = next.exceptions[next.exceptions.length - 1]!;
    console.log(`Exception ${added.id} accepted for finding ${added.findingId} (${added.covers}).`);
    console.log(`Finding ${added.findingId} is unchanged — exceptions overlay evidence, never rewrite it.`);
    console.log(`Exception expires: ${humanDate(added.expiresAt)}`);
    console.log(
      `Attest recommendation remains ${next.decision.recommendation.toUpperCase()} — decisions are human, the recommendation is arithmetic.`,
    );
    console.log(`Passport ${next.id} written to ${outPath}`);
    return 0;
  } catch (err) {
    if (err instanceof DecisionError) return usage(err.message);
    throw err;
  }
}

/** `attest decide` — record the final human ship/hold decision. */
async function decideCommand(flags: Map<string, string>): Promise<number> {
  const passportPath = flags.get('passport');
  const status = flags.get('status');
  const outPath = flags.get('out');
  if (!passportPath) return usage('decide requires --passport');
  if (status !== 'ship' && status !== 'hold') return usage('decide requires --status ship|hold');
  if (!flags.get('decided-by')) return usage('decide requires --decided-by');
  if (!outPath) return usage('decide requires --out <approved-passport.json>');

  const passport = await loadPassport(passportPath);
  const wasFinalized = passport.decision.status === 'ship' || passport.decision.status === 'hold';
  const sameFile = resolve(passportPath) === resolve(outPath);
  if (wasFinalized && sameFile) {
    return usage(
      'finalized decisions are immutable; write the corrected Passport to a new file with --out',
    );
  }

  try {
    const next = decide(passport, {
      status,
      decidedBy: flags.get('decided-by')!,
      reason: flags.get('reason'),
    });
    // When finalizing a capsule's pending passport, also refresh the source so
    // the decision is sealed inside the Evidence Capsule. Corrections only
    // touch --out (the original stays byte-identical).
    await persistPassport(passportPath, outPath, next, { updateSource: !wasFinalized });

    console.log(`Passport ${next.id}${wasFinalized ? ` (revision ${next.revision}, supersedes ${next.supersedes})` : ''} written to ${outPath}`);
    for (const line of describeDecision(next)) console.log(line);
    return next.decision.status === 'ship' ? 0 : 2;
  } catch (err) {
    if (err instanceof DecisionError) return usage(err.message);
    throw err;
  }
}

/** `attest seal` — seal a Passport (optionally from an existing capsule) into a capsule dir. */
async function sealCommand(flags: Map<string, string>): Promise<number> {
  const passportPath = flags.get('passport');
  const outDir = flags.get('out');
  if (!passportPath) return usage('seal requires --passport');
  if (!outDir) return usage('seal requires --out <capsule-dir>');

  const passport = await loadPassport(passportPath);
  const html = renderPassportHtml(passport);

  if (flags.has('from')) {
    const fromDir = flags.get('from')!;
    if (!(await hasCapsuleManifest(fromDir))) {
      return usage(`seal --from ${fromDir} is not a sealed capsule (missing ${CAPSULE_MANIFEST_NAME})`);
    }
    const { cp } = await import('node:fs/promises');
    await cp(fromDir, outDir, { recursive: true });
    await resealCapsule(outDir, passport);
    console.log(`Evidence Capsule resealed from ${fromDir} to ${outDir} with Passport ${passport.id}.`);
    return 0;
  }

  const manifest = await sealCapsule(outDir, {
    passport,
    passportHtml: html,
    sarif: toSarif(passport.findings, passport.candidate.fileName),
    declarations: {},
    redactions: [],
  });
  console.log(
    `Evidence Capsule ${manifest.id} sealed to ${outDir} (${manifest.files.length} files, root ${manifest.evidenceRootHash.slice(0, 12)}...)`,
  );
  return 0;
}

/** `attest journey record` — human-guided capture over ADB (PRODUCT_PLAN §6.2). */
async function journeyRecord(flags: Map<string, string>): Promise<number> {
  const serial = flags.get('device');
  const name = flags.get('name');
  if (!serial || !name) return usage('journey record requires --device and --name');

  const kind = flags.get('kind') ?? 'reviewer';
  if (!JOURNEY_KINDS.includes(kind)) {
    return usage(`journey --kind must be one of: ${JOURNEY_KINDS.join(', ')}`);
  }
  const label = flags.get('credential-label');
  const credentialRef = label
    ? { label, expiresAt: flags.get('credential-expires') }
    : undefined;
  let artifactSha256: string | undefined;
  if (flags.has('artifact')) {
    const bytes = await readFile(flags.get('artifact')!);
    artifactSha256 = createHash('sha256').update(bytes).digest('hex');
  }

  const device = new AdbDevice(serial);
  await device.assertConnected();

  const rl = createInterface({ input: stdin, output: stdout });
  const io: RecorderIO = {
    prompt: async (message, opts) => {
      const suffix = opts?.default ? ` [${opts.default}]` : '';
      return rl.question(`${message}${suffix}: `);
    },
  };
  try {
    const recorded = await recordJourney({
      name,
      title: flags.get('title'),
      kind: kind as JourneyKind,
      credentialRef,
      artifactSha256,
      device,
      io,
      outDir: flags.get('out') ?? 'journeys',
    });
    console.log(textJourneyReport(recorded.journey));
    console.log('');
    console.log(
      `Journey written to ${recorded.journeyPath} (${Object.keys(recorded.files).length} screenshot(s)).`,
    );
    return 0;
  } finally {
    rl.close();
  }
}

/** `attest journey compare` — first changed/failed step vs the approved baseline. */
async function journeyCompare(flags: Map<string, string>): Promise<number> {
  const baselinePath = flags.get('baseline');
  const candidatePath = flags.get('candidate');
  if (!baselinePath || !candidatePath) {
    return usage('journey compare requires --baseline and --candidate');
  }
  const baseline = await loadJourneyBundle(baselinePath);
  const candidate = await loadJourneyBundle(candidatePath);
  const comparison = compareJourneys(baseline.journey, candidate.journey);

  const format = flags.get('format') ?? 'text';
  const output =
    format === 'json' ? JSON.stringify(comparison, null, 2) : textComparisonReport(comparison);
  if (flags.has('out')) await writeFile(flags.get('out')!, output + '\n', 'utf8');
  else console.log(output);

  // Persist next to the candidate journey (id-named, collision-free) so
  // `attest passport --journey` can attach it automatically.
  if (!flags.has('no-save')) {
    const dir = await journeyDirOf(candidatePath);
    const savePath = join(dir, `${comparison.candidate.id}.comparison.json`);
    await writeFile(savePath, serializeComparison(comparison), 'utf8');
    if (format !== 'json') console.error(`\nComparison saved to ${savePath}`);
  }
  return comparison.result === 'pass' ? 0 : 2;
}

/** `attest journey instructions` — exact steps + embedded screenshots, offline. */
async function journeyInstructions(flags: Map<string, string>): Promise<number> {
  const journeyPath = flags.get('journey');
  if (!journeyPath) return usage('journey instructions requires --journey');
  const bundle = await loadJourneyBundle(journeyPath);
  let comparison = bundle.comparison;
  if (flags.has('baseline')) {
    const baseline = await loadJourneyBundle(flags.get('baseline')!);
    comparison = compareJourneys(baseline.journey, bundle.journey);
  }
  const html = renderReviewerInstructions(bundle, comparison);
  if (flags.has('out')) {
    await writeFile(flags.get('out')!, html, 'utf8');
    console.log(`Reviewer instructions written to ${flags.get('out')}`);
  } else {
    console.log(html);
  }
  return 0;
}

function textReport(input: RuleInput, findings: Finding[]): string {
  const lines: string[] = [];
  lines.push(`attest check — ${input.base.artifact.fileName} -> ${input.candidate.artifact.fileName}`);
  lines.push(
    `delta: +${input.diff.addedPermissions.length} perms, -${input.diff.removedPermissions.length} perms, +${input.diff.addedSdks.length} SDKs, +${input.diff.addedDomains.length} destinations, +${input.diff.addedExportedComponents.length} exported components`,
  );
  lines.push('');
  if (findings.length === 0) {
    lines.push('No truth gaps detected. All checked declarations match the observed build changes.');
    return lines.join('\n');
  }
  for (const f of findings) {
    lines.push(`[${f.severity.toUpperCase()}] ${f.id} ${f.ruleId} — ${f.title}`);
    lines.push(`  state: ${f.state.replaceAll('_', ' ')}`);
    lines.push(`  ${f.summary}`);
    lines.push(`  comparison: ${f.comparison}`);
    lines.push(`  fix: ${f.remediation}`);
    lines.push('');
  }
  const contradictions = findings.filter((f) => f.state === 'confirmed_contradiction').length;
  lines.push(
    contradictions > 0
      ? `${contradictions} confirmed contradiction(s). Recommendation: HOLD until declarations match the build.`
      : 'No confirmed contradictions. Review the items above before submission.',
  );
  return lines.join('\n');
}

function usage(msg: string): number {
  console.error(`attest: ${msg}\n`);
  console.error(HELP);
  return 1;
}

async function main(argv: string[]): Promise<number> {
  const { command, positional, flags } = parseArgs(argv);

  switch (command) {
    case 'inspect': {
      const target = positional[0];
      if (!target) return usage('inspect requires an artifact path');
      const facts = await inspectArtifactFile(target);
      const json = JSON.stringify(facts, null, 2);
      if (flags.has('out')) await writeFile(flags.get('out')!, json + '\n', 'utf8');
      else console.log(json);
      return 0;
    }

    case 'diff': {
      const [base, candidate] = positional;
      if (!base || !candidate) return usage('diff requires <base> and <candidate>');
      const diff = diffBuilds(await inspectArtifactFile(base), await inspectArtifactFile(candidate));
      const json = JSON.stringify(diff, null, 2);
      if (flags.has('out')) await writeFile(flags.get('out')!, json + '\n', 'utf8');
      else console.log(json);
      return 0;
    }

    case 'check': {
      const input = await buildRuleInput(flags);
      if (!input) return usage('check requires --base and --candidate');
      const findings = [...runTruthGapRules(input)];
      const comparisons = await loadComparisons(flags);
      for (const p of csvPaths(flags.get('journey'))) {
        const bundle = await loadJourneyBundle(p);
        const comparison =
          comparisons.find((c) => c.candidate.id === bundle.journey.id) ?? bundle.comparison;
        findings.push(
          ...journeyFindings(
            comparison ? applyComparison(bundle.journey, comparison) : bundle.journey,
            comparison,
          ),
        );
      }
      findings.sort((a, b) => a.id.localeCompare(b.id));
      const format = flags.get('format') ?? 'text';
      const output =
        format === 'json'
          ? JSON.stringify(findings, null, 2)
          : format === 'sarif'
            ? toSarif(findings, input.candidate.artifact.fileName)
            : textReport(input, findings);
      if (flags.has('out')) await writeFile(flags.get('out')!, output + '\n', 'utf8');
      else console.log(output);
      return findings.some((f) => f.state === 'confirmed_contradiction') ? 2 : 0;
    }

    case 'passport': {
      const input = await buildRuleInput(flags);
      const outDir = flags.get('out');
      if (!input || !outDir) return usage('passport requires --base, --candidate, and --out <dir>');

      const journeyBundles: JourneyBundle[] = [];
      for (const p of csvPaths(flags.get('journey'))) {
        journeyBundles.push(await loadJourneyBundle(p));
      }
      const comparisons = await loadComparisons(flags);

      const journeyAttached = journeyBundles.map((b) => {
        const comparison =
          comparisons.find((c) => c.candidate.id === b.journey.id) ?? b.comparison;
        return {
          bundle: comparison ? { ...b, journey: applyComparison(b.journey, comparison) } : b,
          comparison,
        };
      });

      const findings = [
        ...runTruthGapRules(input),
        ...journeyAttached.flatMap(({ bundle, comparison }) =>
          journeyFindings(bundle.journey, comparison),
        ),
      ].sort((a, b) => a.id.localeCompare(b.id));
      const claims = buildClaims(input, findings);
      const passport = buildPassport(
        input,
        claims,
        findings,
        journeyAttached.map(({ bundle }) => bundle.journey),
      );
      const html = renderPassportHtml(passport);
      const sarif = toSarif(findings, input.candidate.artifact.fileName);
      const manifest = await sealCapsule(outDir, {
        passport,
        passportHtml: html,
        sarif,
        declarations: input._declarations,
        journeys: journeyAttached.map(({ bundle }) => bundle),
        redactions: ['reviewer credentials', 'test account identities'],
      });
      console.log(`Release Passport ${passport.id} written to ${outDir}/passport.html`);
      console.log(
        `Evidence Capsule ${manifest.id} sealed (${manifest.files.length} files, root ${manifest.evidenceRootHash.slice(0, 12)}...)`,
      );
      if (passport.journeys.length > 0) {
        for (const j of passport.journeys) {
          console.log(
            `Journey ${j.name}: ${j.result.toUpperCase()} (${j.stepCount} steps${j.firstFailedStep !== undefined ? `, first failed step ${j.firstFailedStep}` : ''})`,
          );
        }
      }
      console.log(
        `Recommendation: ${passport.decision.recommendation.toUpperCase()} — ${passport.decision.rationale.join(' ')}`,
      );
      return passport.decision.recommendation === 'hold' ? 2 : 0;
    }

    case 'journey': {
      const sub = positional[0];
      if (sub === 'record') return journeyRecord(flags);
      if (sub === 'compare') return journeyCompare(flags);
      if (sub === 'instructions') return journeyInstructions(flags);
      return usage('journey requires a subcommand: record, compare, or instructions');
    }

    case 'exception': {
      const sub = positional[0];
      if (sub === 'accept') return exceptionAccept(flags);
      return usage('exception requires a subcommand: accept');
    }

    case 'decide':
      return decideCommand(flags);

    case 'seal':
      return sealCommand(flags);

    case 'init': {
      const root = flags.get('dir') ?? '.';
      const created = await initProject(root, { force: flags.has('force') });
      if (created.length === 0) {
        console.log('.attest workspace already exists — nothing to do (use --force to refresh templates).');
      } else {
        console.log(`attest init — ${created.length} file(s) created under ${resolve(root)}/.attest:`);
        for (const f of created) console.log(`  ${f}`);
        console.log('Next: fill in .attest/declarations/*, place builds under artifacts/, then run `attest doctor`.');
      }
      return 0;
    }

    case 'doctor': {
      const root = flags.get('dir');
      const configFlag = flags.get('config');
      const report = await doctorProject({
        projectRoot: root ?? (configFlag ? dirname(resolve(configFlag)) : process.cwd()),
        configPath: configFlag ?? undefined,
      });
      console.log(formatDoctorReport(report));
      return report.ok ? 0 : 1;
    }

    case 'verify': {
      const dir = positional[0];
      if (!dir) return usage('verify requires a capsule directory');
      const result = await verifyCapsule(dir);
      for (const e of result.errors) console.error(`error: ${e}`);
      for (const m of result.mismatches) console.error(`MISMATCH ${m.path}`);
      for (const m of result.missing) console.error(`MISSING  ${m}`);
      for (const x of result.extra) console.error(`EXTRA    ${x}`);
      console.log(
        result.ok
          ? `Capsule OK — ${result.checked} files verified, evidence root intact.`
          : 'Capsule verification FAILED.',
      );
      return result.ok ? 0 : 2;
    }

    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return 0;

    default:
      return usage(`unknown command "${command}"`);
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`attest: ${(err as Error).message}`);
    process.exit(1);
  });
