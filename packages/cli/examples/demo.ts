/**
 * The MVP signature demo (PRODUCT_PLAN §9), now with Reviewer Twin:
 *
 *   Upload last week's build and today's release candidate. Attest shows that
 *   a newly added SDK introduced a permission and destination, the Data Safety
 *   answers and privacy policy do not cover them — AND the recorded reviewer
 *   journey fails at step four. One Passport explains both the technical truth
 *   gaps and the failed reviewer path; the Capsule seals the journey evidence;
 *   fixing declarations + journey flips HOLD → SHIP.
 *
 * The journey recorder runs the exact production pipeline against a scripted
 * device session (swap in a real emulator with:
 *   attest journey record --device emulator-5554 --name reviewer-premium-ai).
 *
 * Writes everything under attest-out/demo/ and finishes with sealed,
 * verified Evidence Capsules.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Journey } from 'attest-schema';

import { sealCapsule, verifyCapsule } from '../src/capsule.js';
import { diffBuilds } from '../src/diff.js';
import {
  applyComparison,
  compareJourneys,
  journeyFindings,
  recordJourney,
  renderReviewerInstructions,
  type JourneyBundle,
} from '../src/journey.js';
import { inspectArtifact } from '../src/inspect.js';
import { buildPassport, renderPassportHtml } from '../src/passport.js';
import { toSarif } from '../src/sarif.js';
import { buildClaims } from '../src/truthgraph.js';
import { runTruthGapRules, type RuleInput } from '../src/truthgap.js';
import { buildArtifact } from '../test/fixtures/make-apk.js';
import {
  BASELINE_SESSION,
  BASELINE_SCREENS,
  FAILURE_SESSION,
  FAILURE_SCREENS,
  PULSEFIT_CREDENTIAL_REF,
  REPAIRED_SESSION,
  REPAIRED_SCREENS,
  answersFor,
  scriptedDevice,
  scriptedIO,
} from '../test/fixtures/journey.js';
import {
  BASE_SPEC,
  CANDIDATE_SPEC,
  FIXED_DATA_SAFETY,
  FIXED_PRIVACY_POLICY_TEXT,
  PRIVACY_POLICY_TEXT,
  STALE_DATA_SAFETY,
  STORE_LISTING_TEXT,
} from '../test/fixtures/scenario.js';

const OUT = join(process.cwd(), 'attest-out', 'demo');
const JOURNEYS = join(OUT, 'journeys');

interface RecordedBundle extends JourneyBundle {
  journeyPath: string;
}

async function record(
  name: string,
  session: typeof BASELINE_SESSION,
  screens: typeof BASELINE_SCREENS,
  artifactSha256: string,
): Promise<RecordedBundle> {
  const recorded = await recordJourney({
    name,
    title: 'Reviewer reaches premium AI feature',
    kind: 'reviewer',
    credentialRef: PULSEFIT_CREDENTIAL_REF,
    artifactSha256,
    device: scriptedDevice('emulator-5554', screens),
    io: scriptedIO(answersFor(session)),
    outDir: JOURNEYS,
  });
  return { ...recorded, journeyPath: recorded.journeyPath };
}

function buildRelease(input: RuleInput, bundles: JourneyBundle[]) {
  const truthGap = runTruthGapRules(input);
  const journey = bundles.flatMap((b) => journeyFindings(b.journey, b.comparison));
  const findings = [...truthGap, ...journey].sort((a, b) => a.id.localeCompare(b.id));
  const claims = buildClaims(input, findings);
  const journeys: Journey[] = bundles.map((b) => b.journey);
  const passport = buildPassport(input, claims, findings, journeys);
  return {
    truthGap,
    journey,
    findings,
    passport,
    html: renderPassportHtml(passport),
    sarif: toSarif(findings, input.candidate.artifact.fileName),
  };
}

async function main(): Promise<void> {
  const { rm } = await import('node:fs/promises');
  // Fresh output each run: journey/capsule ids are content-addressed with
  // timestamps, so stale ID-named dirs would otherwise linger as EXTRA.
  await rm(join(OUT, 'capsule'), { recursive: true, force: true });
  await rm(join(OUT, 'capsule-repaired'), { recursive: true, force: true });
  await rm(join(OUT, 'capsule-cli'), { recursive: true, force: true });
  await mkdir(JOURNEYS, { recursive: true });

  // 1. The two artifacts a team would upload.
  const baseBytes = buildArtifact(BASE_SPEC);
  const candidateBytes = buildArtifact(CANDIDATE_SPEC);
  await writeFile(join(OUT, 'pulsefit-1.2.0.apk'), baseBytes);
  await writeFile(join(OUT, 'pulsefit-1.3.0.apk'), candidateBytes);
  await writeFile(join(OUT, 'data-safety.json'), JSON.stringify(STALE_DATA_SAFETY, null, 2));
  await writeFile(join(OUT, 'privacy-policy.txt'), PRIVACY_POLICY_TEXT);
  await writeFile(join(OUT, 'store-listing.txt'), STORE_LISTING_TEXT);

  console.log('━'.repeat(72));
  console.log('ATTEST DEMO — PulseFit release 1.2.0 → 1.3.0 (with Reviewer Twin)');
  console.log('━'.repeat(72));

  // 2. Local inspection — nothing leaves the machine.
  const base = inspectArtifact(baseBytes, 'pulsefit-1.2.0.apk');
  const candidate = inspectArtifact(candidateBytes, 'pulsefit-1.3.0.apk');
  console.log(`\n① Inspected ${base.artifact.fileName} (${base.artifact.sha256.slice(0, 12)}…)`);
  console.log(`① Inspected ${candidate.artifact.fileName} (${candidate.artifact.sha256.slice(0, 12)}…)`);

  // 3. Deterministic release delta.
  const diff = diffBuilds(base, candidate);
  console.log('\n② Release delta (deterministic):');
  console.log(`   + permissions:  ${diff.addedPermissions.join(', ') || '—'}`);
  console.log(`   − permissions:  ${diff.removedPermissions.join(', ') || '—'}`);
  console.log(`   + SDKs:         ${diff.addedSdks.map((s) => s.name).join(', ') || '—'}`);
  console.log(`   + destinations: ${diff.addedDomains.join(', ') || '—'}`);
  console.log(`   + exported:     ${diff.addedExportedComponents.map((c) => c.name).join(', ') || '—'}`);

  const input: RuleInput = {
    base,
    candidate,
    diff,
    dataSafety: STALE_DATA_SAFETY,
    privacyPolicy: { kind: 'privacy_policy', text: PRIVACY_POLICY_TEXT, importedAt: new Date().toISOString() },
    listing: { kind: 'store_listing', text: STORE_LISTING_TEXT, importedAt: new Date().toISOString() },
  };

  // 4. Truth gaps.
  const tgFindings = runTruthGapRules(input);
  console.log(`\n③ Declaration truth gaps: ${tgFindings.length}`);
  for (const f of tgFindings) {
    console.log(`   [${f.severity.toUpperCase()}] ${f.ruleId} ${f.state.replaceAll('_', ' ')}`);
    console.log(`      ${f.summary}`);
  }

  // 5. Reviewer Twin: record the approved baseline on 1.2.0, re-run on 1.3.0.
  console.log('\n④ Reviewer Twin (human-guided recorder, scripted device session):');
  const baseline = await record(
    'reviewer-premium-ai-1.2.0',
    BASELINE_SESSION,
    BASELINE_SCREENS,
    base.artifact.sha256,
  );
  console.log(`   baseline on 1.2.0: ${baseline.journey.steps.length}/${baseline.journey.steps.length} steps pass`);
  console.log(`   → ${baseline.journeyPath}`);

  const failing = await record(
    'reviewer-premium-ai-1.3.0',
    FAILURE_SESSION,
    FAILURE_SCREENS,
    candidate.artifact.sha256,
  );
  const comparison = compareJourneys(baseline.journey, failing.journey);
  const failingBundle: JourneyBundle = {
    ...failing,
    comparison,
    journey: applyComparison(failing.journey, comparison),
  };
  console.log(`   re-run on 1.3.0:  ${failing.journey.steps.length}/${BASELINE_SESSION.length} steps reached — FAILED at step ${comparison.firstFailedStep}`);
  console.log(`   ${comparison.summary}`);
  console.log(`   first changed step: ${comparison.firstChangedStep ?? '—'} · first failed step: ${comparison.firstFailedStep ?? '—'}`);
  console.log(`   → ${failing.journeyPath}`);

  // 6. Reviewer instructions with exact steps + screenshots.
  const instructionsPath = join(OUT, 'reviewer-instructions-1.3.0.html');
  await writeFile(
    instructionsPath,
    renderReviewerInstructions(failing, comparison),
    'utf8',
  );
  console.log(`\n⑤ Reviewer instructions → ${instructionsPath}`);
  console.log(`   ${failing.journey.steps.length} exact steps, ${Object.keys(failing.files).length} embedded screenshots, credential readiness checked`);

  // 7. Release Passport: truth gaps + failed reviewer path → HOLD; seal capsule.
  const release = buildRelease(input, [failingBundle]);
  const capsuleDir = join(OUT, 'capsule');
  const manifest = await sealCapsule(capsuleDir, {
    passport: release.passport,
    passportHtml: release.html,
    sarif: release.sarif,
    declarations: {
      'data-safety.json': JSON.stringify(STALE_DATA_SAFETY, null, 2),
      'privacy-policy.txt': PRIVACY_POLICY_TEXT,
      'store-listing.txt': STORE_LISTING_TEXT,
    },
    journeys: [failingBundle],
    redactions: ['reviewer credentials', 'test account identities'],
  });

  console.log('\n⑥ Release Passport');
  console.log(`   ${release.passport.id} → ${join(capsuleDir, 'passport.html')}`);
  console.log(`   recommendation: ${release.passport.decision.recommendation.toUpperCase()}`);
  for (const r of release.passport.decision.rationale) console.log(`     • ${r}`);
  console.log(`   ${release.truthGap.length} declaration truth gaps + ${release.journey.length} journey finding(s)`);
  const jt = release.findings.find((f) => f.ruleId === 'JT-001');
  if (jt) console.log(`     • ${jt.id} ${jt.ruleId}: ${jt.summary}`);

  console.log('\n⑦ Evidence Capsule (journey evidence included)');
  const journeyFiles = manifest.files.filter((f) => f.path.startsWith('journeys/'));
  console.log(`   ${manifest.id} sealed: ${manifest.files.length} files (${journeyFiles.length} journey evidence), root ${manifest.evidenceRootHash.slice(0, 16)}…`);
  const verification = await verifyCapsule(capsuleDir);
  console.log(
    `   offline verify: ${verification.ok ? `OK — ${verification.checked} files, evidence root intact` : 'FAILED'}`,
  );

  // 8. The repair path: update declarations AND re-record the journey → SHIP.
  console.log('\n⑧ Repair path — updated declarations + fixed journey:');
  const fixedInput: RuleInput = {
    ...input,
    dataSafety: FIXED_DATA_SAFETY,
    privacyPolicy: { kind: 'privacy_policy', text: FIXED_PRIVACY_POLICY_TEXT, importedAt: new Date().toISOString() },
  };
  const repaired = await record(
    'reviewer-premium-ai-1.3.0-repaired',
    REPAIRED_SESSION,
    REPAIRED_SCREENS,
    candidate.artifact.sha256,
  );
  const fixedComparison = compareJourneys(baseline.journey, repaired.journey);
  const repairedBundle: JourneyBundle = {
    ...repaired,
    comparison: fixedComparison,
    journey: applyComparison(repaired.journey, fixedComparison),
  };
  console.log(`   ${fixedComparison.summary}`);

  const fixedRelease = buildRelease(fixedInput, [repairedBundle]);
  const fixedCapsuleDir = join(OUT, 'capsule-repaired');
  const fixedManifest = await sealCapsule(fixedCapsuleDir, {
    passport: fixedRelease.passport,
    passportHtml: fixedRelease.html,
    sarif: fixedRelease.sarif,
    declarations: {
      'data-safety.json': JSON.stringify(FIXED_DATA_SAFETY, null, 2),
      'privacy-policy.txt': FIXED_PRIVACY_POLICY_TEXT,
      'store-listing.txt': STORE_LISTING_TEXT,
    },
    journeys: [repairedBundle],
    redactions: ['reviewer credentials', 'test account identities'],
  });
  const fixedInstructionsPath = join(OUT, 'reviewer-instructions-1.3.0-repaired.html');
  await writeFile(fixedInstructionsPath, renderReviewerInstructions(repaired, fixedComparison), 'utf8');

  console.log(`   findings after repair: ${fixedRelease.findings.length}`);
  console.log(`   ${fixedRelease.passport.id} recommendation: ${fixedRelease.passport.decision.recommendation.toUpperCase()}`);
  const fixedVerification = await verifyCapsule(fixedCapsuleDir);
  console.log(
    `   capsule ${fixedManifest.id} offline verify: ${fixedVerification.ok ? `OK — ${fixedVerification.checked} files` : 'FAILED'}`,
  );

  console.log('\n' + '━'.repeat(72));
  console.log('Try it:');
  console.log(`  node packages/cli/dist/src/cli.js journey compare \\`);
  console.log(`    --baseline ${JOURNEYS}/reviewer-premium-ai-1.2.0.json \\`);
  console.log(`    --candidate ${JOURNEYS}/reviewer-premium-ai-1.3.0.json`);
  console.log(`  node packages/cli/dist/src/cli.js journey instructions \\`);
  console.log(`    --journey ${JOURNEYS}/reviewer-premium-ai-1.3.0.json \\`);
  console.log(`    --baseline ${JOURNEYS}/reviewer-premium-ai-1.2.0.json \\`);
  console.log(`    --out ${instructionsPath}`);
  console.log(`  node packages/cli/dist/src/cli.js passport --base ${OUT}/pulsefit-1.2.0.apk \\`);
  console.log(`    --candidate ${OUT}/pulsefit-1.3.0.apk --data-safety ${OUT}/data-safety.json \\`);
  console.log(`    --journey ${JOURNEYS}/reviewer-premium-ai-1.3.0.json --out ${join(OUT, 'capsule-cli')}`);
  console.log(`  node packages/cli/dist/src/cli.js verify ${capsuleDir}`);
  console.log(`  open ${join(capsuleDir, 'passport.html')}`);
  console.log('━'.repeat(72));
}

await main();
