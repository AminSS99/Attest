#!/usr/bin/env node
/**
 * attest — local release-truth CLI (PRODUCT_PLAN §5.10, §11).
 *
 * Exit codes: 0 ok/ship-or-review · 2 confirmed contradictions (hold) · 1 usage/runtime error.
 */

import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

import type {
  DataSafetyDeclaration,
  DeclaredText,
  Finding,
  JourneyComparison,
  JourneyKind,
} from 'attest-schema';

import { AdbDevice } from './adb.js';
import { sealCapsule, verifyCapsule } from './capsule.js';
import { importDataSafetyFile } from './datasafety.js';
import { importDeclaredTextFile } from './declared-text.js';
import { diffBuilds } from './diff.js';
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
import { buildPassport, renderPassportHtml } from './passport.js';
import { toSarif } from './sarif.js';
import { buildClaims } from './truthgraph.js';
import { runTruthGapRules, type RuleInput } from './truthgap.js';

const HELP = `attest ${CLI_VERSION} — prove your mobile release matches its promises.

Usage:
  attest inspect <artifact> [--out facts.json]
  attest diff <base> <candidate> [--out diff.json]
  attest check --base <a> --candidate <b> [--data-safety f.json|f.csv]
               [--privacy-policy f.txt] [--listing f.txt]
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
  attest verify <capsule-dir>

Journeys are human-guided Reviewer Twin recordings (screenshot + step +
expected/observed state) captured over ADB. Credentials appear as expiring
references only — secrets never enter evidence.

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
      const findings = runTruthGapRules(input);
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
