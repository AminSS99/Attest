/**
 * The MVP signature demo (PRODUCT_PLAN §9):
 *
 *   Upload last week's build and today's release candidate. Attest shows that
 *   a newly added SDK introduced a permission and destination, the Data Safety
 *   answers and privacy policy do not cover them — and one screen explains the
 *   evidence and creates the repair checklist.
 *
 * Writes everything under attest-out/demo/ and finishes with a sealed,
 * verified Evidence Capsule.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { sealCapsule, verifyCapsule } from '../src/capsule.js';
import { diffBuilds } from '../src/diff.js';
import { inspectArtifact } from '../src/inspect.js';
import { buildPassport, renderPassportHtml } from '../src/passport.js';
import { toSarif } from '../src/sarif.js';
import { buildClaims } from '../src/truthgraph.js';
import { runTruthGapRules } from '../src/truthgap.js';
import { buildArtifact } from '../test/fixtures/make-apk.js';
import {
  BASE_SPEC,
  CANDIDATE_SPEC,
  PRIVACY_POLICY_TEXT,
  STALE_DATA_SAFETY,
  STORE_LISTING_TEXT,
} from '../test/fixtures/scenario.js';

const OUT = join(process.cwd(), 'attest-out', 'demo');

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });

  // 1. The two artifacts a team would upload.
  const baseBytes = buildArtifact(BASE_SPEC);
  const candidateBytes = buildArtifact(CANDIDATE_SPEC);
  await writeFile(join(OUT, 'pulsefit-1.2.0.apk'), baseBytes);
  await writeFile(join(OUT, 'pulsefit-1.3.0.apk'), candidateBytes);
  await writeFile(join(OUT, 'data-safety.json'), JSON.stringify(STALE_DATA_SAFETY, null, 2));
  await writeFile(join(OUT, 'privacy-policy.txt'), PRIVACY_POLICY_TEXT);
  await writeFile(join(OUT, 'store-listing.txt'), STORE_LISTING_TEXT);

  console.log('━'.repeat(72));
  console.log('ATTEST DEMO — PulseFit release 1.2.0 → 1.3.0');
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

  // 4. Truth gaps.
  const input = {
    base,
    candidate,
    diff,
    dataSafety: STALE_DATA_SAFETY,
    privacyPolicy: { kind: 'privacy_policy' as const, text: PRIVACY_POLICY_TEXT, importedAt: new Date().toISOString() },
    listing: { kind: 'store_listing' as const, text: STORE_LISTING_TEXT, importedAt: new Date().toISOString() },
  };
  const findings = runTruthGapRules(input);
  console.log(`\n③ Truth gaps: ${findings.length}`);
  for (const f of findings) {
    console.log(`   [${f.severity.toUpperCase()}] ${f.ruleId} ${f.state.replaceAll('_', ' ')}`);
    console.log(`      ${f.summary}`);
  }

  // 5. Release Passport + Evidence Capsule.
  const claims = buildClaims(input, findings);
  const passport = buildPassport(input, claims, findings);
  const html = renderPassportHtml(passport);
  const sarif = toSarif(findings, candidate.artifact.fileName);

  const capsuleDir = join(OUT, 'capsule');
  const manifest = await sealCapsule(capsuleDir, {
    passport,
    passportHtml: html,
    sarif,
    declarations: {
      'data-safety.json': JSON.stringify(STALE_DATA_SAFETY, null, 2),
      'privacy-policy.txt': PRIVACY_POLICY_TEXT,
      'store-listing.txt': STORE_LISTING_TEXT,
    },
    redactions: ['reviewer credentials', 'test account identities'],
  });

  console.log('\n④ Release Passport');
  console.log(`   ${passport.id} → ${join(capsuleDir, 'passport.html')}`);
  console.log(`   recommendation: ${passport.decision.recommendation.toUpperCase()}`);
  for (const r of passport.decision.rationale) console.log(`     • ${r}`);

  console.log('\n⑤ Evidence Capsule');
  console.log(`   ${manifest.id} sealed: ${manifest.files.length} files, root ${manifest.evidenceRootHash.slice(0, 16)}…`);

  const verification = await verifyCapsule(capsuleDir);
  console.log(
    `   offline verify: ${verification.ok ? `OK — ${verification.checked} files, evidence root intact` : 'FAILED'}`,
  );

  console.log('\n' + '━'.repeat(72));
  console.log('Try it:');
  console.log(`  node packages/cli/dist/src/cli.js check --base ${OUT}/pulsefit-1.2.0.apk \\`);
  console.log(`    --candidate ${OUT}/pulsefit-1.3.0.apk --data-safety ${OUT}/data-safety.json \\`);
  console.log(`    --privacy-policy ${OUT}/privacy-policy.txt`);
  console.log(`  open ${join(capsuleDir, 'passport.html')}`);
  console.log('━'.repeat(72));
}

await main();
