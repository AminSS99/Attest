/**
 * Truth Graph lite (PRODUCT_PLAN §6.1): connect every public claim to its
 * supporting and conflicting evidence. The full graph explorer is a hosted
 * surface; the local engine emits the same claim records inside the Passport
 * so the evidence chain is readable anywhere.
 */

import type {
  Claim,
  EvidenceClass,
  Finding,
  SourceRef,
} from 'attest-schema';

import type { RuleInput } from './truthgap.js';
import { mappingForPermission } from './mappings.js';

const EVIDENCE_RANK: Record<EvidenceClass, number> = {
  observed: 4,
  declared: 3,
  attested: 2,
  inferred: 1,
  missing: 0,
};

export function buildClaims(input: RuleInput, findings: Finding[]): Claim[] {
  const claims = new Map<string, Claim>();

  const ensure = (id: string, kind: Claim['kind'], text: string): Claim => {
    let c = claims.get(id);
    if (!c) {
      c = { id, kind, text, supporting: [], conflicting: [], bestEvidence: 'missing', status: 'unreviewed' };
      claims.set(id, c);
    }
    return c;
  };

  const support = (id: string, kind: Claim['kind'], text: string, src: SourceRef) => {
    const c = ensure(id, kind, text);
    if (!c.supporting.some((s) => s.ref === src.ref)) c.supporting.push(src);
  };
  const conflict = (id: string, kind: Claim['kind'], text: string, src: SourceRef) => {
    const c = ensure(id, kind, text);
    if (!c.conflicting.some((s) => s.ref === src.ref)) c.conflicting.push(src);
  };

  // Claims from Data Safety declarations.
  for (const dt of input.dataSafety?.collectedDataTypes ?? []) {
    const id = `data-type:${dt.id}`;
    const text = `We collect ${dt.id}`;
    support(id, 'data_type', text, {
      kind: 'data_safety',
      evidenceClass: 'declared',
      ref: `data-safety:collectedDataTypes["${dt.id}"]`,
      excerpt: dt.purpose,
    });
  }

  // Claims from observed build facts (candidate).
  for (const p of input.candidate.permissions) {
    const mapping = mappingForPermission(p.name);
    const id = `permission:${p.name}`;
    const text = mapping
      ? `The app can access ${mapping.label.toLowerCase()}`
      : `The app requests ${p.name}`;
    support(id, 'permission', text, {
      kind: 'build_fact',
      evidenceClass: 'observed',
      ref: `manifest:uses-permission ${p.name}`,
    });
    if (mapping) {
      support(`data-type:${mapping.dataType}`, 'data_type', `We collect ${mapping.dataType}`, {
        kind: 'build_fact',
        evidenceClass: 'observed',
        ref: `manifest:uses-permission ${p.name}`,
      });
    }
  }
  for (const sdk of input.candidate.sdks) {
    support(`sdk:${sdk.id}`, 'sdk', `The app embeds ${sdk.name}`, {
      kind: 'build_fact',
      evidenceClass: 'observed',
      ref: `dex:packages ${sdk.matchedPackages.join(', ')}`,
    });
  }
  for (const d of input.candidate.domains) {
    support(`domain:${d.host}`, 'domain', `The app contacts ${d.host}`, {
      kind: 'build_fact',
      evidenceClass: 'observed',
      ref: `dex:url https://${d.host}`,
    });
  }

  // Findings attach as conflicting evidence on their subject claims.
  for (const f of findings) {
    const claimIds = claimIdsForSubject(f.subject);
    for (const id of claimIds) {
      const kind = id.split(':')[0] === 'data-type' ? 'data_type' : (id.split(':')[0] as Claim['kind']);
      for (const src of f.sources) conflict(id, kind, f.subject, src);
    }
  }

  for (const c of claims.values()) {
    c.bestEvidence = bestEvidenceOf(c);
    c.status = statusOf(c, findings);
    c.supporting.sort((a, b) => a.ref.localeCompare(b.ref));
    c.conflicting.sort((a, b) => a.ref.localeCompare(b.ref));
  }
  return [...claims.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function claimIdsForSubject(subject: string): string[] {
  // A finding subject is a permission, sdk id, host, or data type id.
  const ids = [
    `permission:${subject}`,
    `sdk:${subject}`,
    `domain:${subject}`,
    `data-type:${subject}`,
  ];
  const mapping = mappingForPermission(subject);
  if (mapping) ids.push(`data-type:${mapping.dataType}`);
  return ids;
}

function bestEvidenceOf(c: Claim): EvidenceClass {
  let best: EvidenceClass = 'missing';
  for (const s of [...c.supporting, ...c.conflicting]) {
    if (EVIDENCE_RANK[s.evidenceClass] > EVIDENCE_RANK[best]) best = s.evidenceClass;
  }
  return best;
}

function statusOf(c: Claim, findings: Finding[]): Claim['status'] {
  const related = findings.filter((f) => claimIdsForSubject(f.subject).includes(c.id));
  if (related.some((f) => f.state === 'confirmed_contradiction')) return 'contradicted';
  if (related.some((f) => f.state === 'evidence_missing')) return 'unsupported';
  if (c.supporting.length > 0 && c.conflicting.length === 0) return 'supported';
  if (c.conflicting.length > 0) return 'contradicted';
  return 'unreviewed';
}
