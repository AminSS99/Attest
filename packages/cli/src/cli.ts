#!/usr/bin/env node
/**
 * attest — local release-truth CLI (PRODUCT_PLAN §5.10, §11).
 *
 * Exit codes: 0 ok/ship-or-review · 2 confirmed contradictions (hold) · 1 usage/runtime error.
 */

import { writeFile } from 'node:fs/promises';

import type { DataSafetyDeclaration, DeclaredText, Finding } from 'attest-schema';

import { sealCapsule, verifyCapsule } from './capsule.js';
import { importDataSafetyFile } from './datasafety.js';
import { importDeclaredTextFile } from './declared-text.js';
import { diffBuilds } from './diff.js';
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
  attest passport --base <a> --candidate <b> [declaration flags] --out <dir>
  attest verify <capsule-dir>

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
      const findings = runTruthGapRules(input);
      const claims = buildClaims(input, findings);
      const passport = buildPassport(input, claims, findings);
      const html = renderPassportHtml(passport);
      const sarif = toSarif(findings, input.candidate.artifact.fileName);
      const manifest = await sealCapsule(outDir, {
        passport,
        passportHtml: html,
        sarif,
        declarations: input._declarations,
        redactions: ['reviewer credentials', 'test account identities'],
      });
      console.log(`Release Passport ${passport.id} written to ${outDir}/passport.html`);
      console.log(
        `Evidence Capsule ${manifest.id} sealed (${manifest.files.length} files, root ${manifest.evidenceRootHash.slice(0, 12)}...)`,
      );
      console.log(
        `Recommendation: ${passport.decision.recommendation.toUpperCase()} — ${passport.decision.rationale.join(' ')}`,
      );
      return passport.decision.recommendation === 'hold' ? 2 : 0;
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
