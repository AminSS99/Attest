/**
 * Release Passport assembly + self-contained HTML rendering
 * (PRODUCT_PLAN §8 Release Command Center: one release, one decision).
 *
 * The HTML is fully offline: inline styles, no external assets, readable
 * years later without an Attest subscription.
 */

import { createHash } from 'node:crypto';

import {
  CORE_TRUTH_GAP_RULESET_VERSION,
  RELEASE_PASSPORT_SCHEMA_VERSION,
  computeRecommendation,
  materialChangeCount,
  type Claim,
  type Finding,
  type ReleasePassport,
} from 'attest-schema';

import { CLI_VERSION } from './inspect.js';
import type { RuleInput } from './truthgap.js';

export function buildPassport(input: RuleInput, claims: Claim[], findings: Finding[]): ReleasePassport {
  const decision = computeRecommendation(findings);
  const unresolvedQuestions = findings
    .filter((f) => f.state === 'changed_requires_review' || f.state === 'evidence_missing')
    .map((f) => `${f.subject}: ${f.summary}`);

  const doc: Omit<ReleasePassport, 'id'> = {
    schemaVersion: RELEASE_PASSPORT_SCHEMA_VERSION,
    app: { packageName: input.candidate.packageName || input.base.packageName },
    base: input.base.artifact,
    candidate: input.candidate.artifact,
    createdAt: new Date().toISOString(),
    toolset: { cli: CLI_VERSION, ruleset: CORE_TRUTH_GAP_RULESET_VERSION },
    diff: input.diff,
    claims,
    findings,
    exceptions: [],
    unresolvedQuestions,
    decision,
  };
  const id = createHash('sha256').update(JSON.stringify(doc)).digest('hex').slice(0, 24);
  return { ...doc, id: `RP-${id}` };
}

export function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function shortSha(sha: string): string {
  return sha.slice(0, 12);
}

const SEVERITY_ORDER: Record<string, number> = { blocker: 0, high: 1, medium: 2, low: 3, info: 4 };

export function sortByImpact(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

function changeRow(label: string, items: readonly string[], sign: string, cls: string): string {
  if (items.length === 0) return '';
  return `<li><strong>${esc(label)}</strong><ul>${items
    .map((i) => `<li class="${cls}">${sign} ${esc(i)}</li>`)
    .join('')}</ul></li>`;
}

function findingCard(f: Finding): string {
  const srcs = f.sources
    .map(
      (s) =>
        `<li><span class="cls">${esc(s.evidenceClass)}</span> <code>${esc(s.kind)}</code> — ${esc(s.ref)}${
          s.excerpt ? `<blockquote>${esc(s.excerpt)}</blockquote>` : ''
        }</li>`,
    )
    .join('');
  return `<section class="finding ${esc(f.severity)}">
  <header><span class="sev">${esc(f.severity.toUpperCase())}</span>
    <span class="state">${esc(f.state.replaceAll('_', ' '))}</span>
    <code>${esc(f.id)}</code> · <code>${esc(f.ruleId)}</code></header>
  <h3>${esc(f.title)}</h3>
  <p>${esc(f.summary)}</p>
  <p class="cmp"><strong>Comparison:</strong> <code>${esc(f.comparison)}</code></p>
  <p class="rem"><strong>Remediation:</strong> ${esc(f.remediation)}</p>
  <details><summary>Evidence (${f.sources.length})</summary><ul>${srcs}</ul></details>
</section>`;
}

function claimRow(c: Claim): string {
  return `<tr class="st-${esc(c.status)}">
  <td>${esc(c.text)}</td><td><code>${esc(c.kind)}</code></td>
  <td>${esc(c.bestEvidence)}</td><td>${esc(c.status.replace('_', ' '))}</td>
  <td>${c.supporting.length} / ${c.conflicting.length}</td>
</tr>`;
}

export function renderPassportHtml(p: ReleasePassport): string {
  const badge =
    p.decision.recommendation === 'hold'
      ? '<span class="badge hold">HOLD</span>'
      : p.decision.recommendation === 'review'
        ? '<span class="badge review">REVIEW</span>'
        : '<span class="badge ship">SHIP</span>';
  const changes = materialChangeCount(p.diff);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Release Passport — ${esc(p.app.packageName)} ${esc(p.candidate.versionName ?? '')}</title>
<style>
:root{font-family:-apple-system,"SF Pro Text",Helvetica,Arial,sans-serif;color:#16232e}
body{max-width:960px;margin:2rem auto;padding:0 1rem}
header.top{border-bottom:3px solid #16232e;padding-bottom:1rem;margin-bottom:1.5rem}
.badge{font-size:1.1rem;font-weight:700;padding:.25rem .8rem;border-radius:6px;color:#fff}
.badge.hold{background:#b3261e}.badge.review{background:#9a6a00}.badge.ship{background:#1e7d32}
.meta{color:#52616e;font-size:.9rem}code{background:#eef2f5;padding:.1rem .3rem;border-radius:4px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.card{border:1px solid #d5dde3;border-radius:10px;padding:1rem}
.finding{border:1px solid #d5dde3;border-left:6px solid #9aa7b0;border-radius:8px;padding:.8rem 1rem;margin:.8rem 0}
.finding.blocker,.finding.high{border-left-color:#b3261e}
.finding.medium{border-left-color:#9a6a00}
.finding header{font-size:.8rem;color:#52616e}
.sev{font-weight:700;margin-right:.6rem}.state{margin-right:.6rem}
.cmp,.rem{font-size:.9rem}
table{border-collapse:collapse;width:100%;font-size:.9rem}
th,td{border-bottom:1px solid #e3e9ed;padding:.45rem;text-align:left}
tr.st-contradicted td{background:#fdecea}tr.st-unsupported td{background:#fff7e0}
.add{color:#1e7d32}.del{color:#b3261e}
footer{margin-top:2rem;border-top:1px solid #d5dde3;padding-top:1rem;font-size:.8rem;color:#52616e}
blockquote{margin:.3rem 0 .3rem 1rem;color:#52616e;font-style:italic}
</style></head><body>
<header class="top">
  <h1>Release Passport ${badge}</h1>
  <p class="meta"><strong>${esc(p.app.packageName)}</strong> ·
  ${esc(p.base.versionName ?? '?')} &rarr; <strong>${esc(p.candidate.versionName ?? '?')}</strong> ·
  Passport <code>${esc(p.id)}</code> · created ${esc(p.createdAt)}</p>
  <p class="meta">base <code>${esc(p.base.fileName)}</code> (${shortSha(p.base.sha256)}&hellip;)
   &rarr; candidate <code>${esc(p.candidate.fileName)}</code> (${shortSha(p.candidate.sha256)}&hellip;)</p>
  <p>${p.decision.rationale.map(esc).join('<br>')}</p>
</header>

<div class="grid">
  <div class="card"><h2>Release delta</h2>
    <p>${changes} material change${changes === 1 ? '' : 's'} detected.</p>
    <ul>
      ${changeRow('Permissions added', p.diff.addedPermissions, '+', 'add')}
      ${changeRow('Permissions removed', p.diff.removedPermissions, '&minus;', 'del')}
      ${changeRow('SDKs added', p.diff.addedSdks.map((s) => `${s.name} (${s.vendor})`), '+', 'add')}
      ${changeRow('SDKs removed', p.diff.removedSdks.map((s) => `${s.name} (${s.vendor})`), '&minus;', 'del')}
      ${changeRow('Destinations added', p.diff.addedDomains, '+', 'add')}
      ${changeRow('Destinations removed', p.diff.removedDomains, '&minus;', 'del')}
      ${changeRow('Exported components added', p.diff.addedExportedComponents.map((c) => c.name), '+', 'add')}
      ${changeRow('Exported components removed', p.diff.removedExportedComponents.map((c) => c.name), '&minus;', 'del')}
      ${p.diff.targetSdkChange ? `<li><strong>targetSdk</strong> ${p.diff.targetSdkChange.from ?? '?'} &rarr; ${p.diff.targetSdkChange.to ?? '?'}</li>` : ''}
    </ul>
    ${p.diff.packageMismatch ? '<p class="del"><strong>Package name changed between builds.</strong></p>' : ''}
  </div>
  <div class="card"><h2>Decision</h2>
    <p>Recommendation: ${badge}</p>
    <p>Status: <strong>${esc(p.decision.status)}</strong> — a human makes the final call. Attest never certifies approval or legal compliance.</p>
    <h3>Open questions (${p.unresolvedQuestions.length})</h3>
    <ul>${p.unresolvedQuestions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>
  </div>
</div>

<h2>Truth gaps (${p.findings.length})</h2>
${p.findings.length === 0 ? `<p>No truth gaps detected by ruleset ${esc(p.toolset.ruleset)}.</p>` : sortByImpact(p.findings).map(findingCard).join('\n')}

<h2>Truth Graph claims (${p.claims.length})</h2>
<table><thead><tr><th>Claim</th><th>Kind</th><th>Best evidence</th><th>Status</th><th>Support/Conflict</th></tr></thead>
<tbody>${p.claims.map(claimRow).join('')}</tbody></table>

<footer>
  <p>Generated by attest-cli ${esc(p.toolset.cli)} · ruleset ${esc(p.toolset.ruleset)} · schema ${esc(p.schemaVersion)}.</p>
  <p>Attest provides traceable technical evidence. It is not legal advice and does not guarantee store approval.</p>
</footer>
</body></html>`;
}
