/**
 * The five high-confidence truth-gap rules (PRODUCT_PLAN §9 weeks 3–4,
 * §17 action 4).
 *
 * A truth gap fires when two sources disagree or a claim has no evidence.
 * Every rule here is deterministic: same inputs → same findings, with cited
 * sources and the exact comparison that triggered them. No opaque scores.
 */

import { createHash } from 'node:crypto';

import {
  FINDING_SCHEMA_VERSION,
  type BuildFacts,
  type DataSafetyDeclaration,
  type DeclaredText,
  type Finding,
  type FindingState,
  type ReleaseDiff,
  type RuleDescriptor,
  type Severity,
  type SourceRef,
} from 'attest-schema';

import { excerptAround, textMentions } from './declared-text.js';
import { mappingForPermission, permissionsForDataType, NOTABLE_PERMISSIONS } from './mappings.js';

export interface RuleInput {
  base: BuildFacts;
  candidate: BuildFacts;
  diff: ReleaseDiff;
  dataSafety?: DataSafetyDeclaration;
  privacyPolicy?: DeclaredText;
  listing?: DeclaredText;
}

export const TRUTH_GAP_RULES: readonly RuleDescriptor[] = [
  {
    id: 'TG-001',
    title: 'New dangerous permission not covered by Data Safety answers',
    severity: 'high',
    description:
      'The candidate build declares a new dangerous permission whose mapped data type is absent from the imported Data Safety declaration.',
    remediation:
      'Update the Data Safety form to disclose the data type, or remove the permission and the code path that requires it.',
  },
  {
    id: 'TG-002',
    title: 'New third-party SDK without any disclosure',
    severity: 'high',
    description:
      'A third-party SDK appears in the candidate build but is not disclosed in the Data Safety form or mentioned in the privacy policy.',
    remediation:
      'Disclose the SDK and its data practices in the Data Safety form and privacy policy, or remove it from the build.',
  },
  {
    id: 'TG-003',
    title: 'New network destination not disclosed',
    severity: 'high',
    description:
      'A new destination host is embedded in the candidate build and appears neither in Data Safety destinations nor in the privacy policy.',
    remediation:
      'Confirm what data flows to this destination and disclose it, or remove the integration that introduced it.',
  },
  {
    id: 'TG-004',
    title: 'Declared data type has no supporting build evidence',
    severity: 'medium',
    description:
      'The Data Safety form declares a collected data type, but neither build contains the permission evidence that usually supports it. The claim may be stale or may rely on behavior the binary cannot show.',
    remediation:
      'Confirm the collection path and attach evidence, or narrow the Data Safety declaration.',
  },
  {
    id: 'TG-005',
    title: 'Removed permission still declared in Data Safety',
    severity: 'medium',
    description:
      'A permission present in the previous build is gone from the candidate, yet the Data Safety form still declares the mapped data type. The store surface has drifted from the product.',
    remediation:
      'Re-answer the affected Data Safety questions for this release so the form stops over-claiming.',
  },
];

export function runTruthGapRules(input: RuleInput): Finding[] {
  const findings: Finding[] = [
    ...tg001(input),
    ...tg002(input),
    ...tg003(input),
    ...tg004(input),
    ...tg005(input),
  ];
  return findings.sort((a, b) => a.id.localeCompare(b.id));
}

function finding(
  ruleId: string,
  subject: string,
  state: FindingState,
  severity: Severity,
  summary: string,
  comparison: string,
  sources: SourceRef[],
  remediation: string,
): Finding {
  const digest = createHash('sha256').update(`${ruleId}|${subject}|${comparison}`).digest('hex');
  const rule = TRUTH_GAP_RULES.find((r) => r.id === ruleId)!;
  return {
    schemaVersion: FINDING_SCHEMA_VERSION,
    id: `F-${digest.slice(0, 16)}`,
    ruleId,
    title: rule.title,
    severity,
    state,
    subject,
    summary,
    comparison,
    sources,
    remediation,
  };
}

/** TG-001: new dangerous permission vs Data Safety coverage. */
function tg001({ candidate, diff, dataSafety }: RuleInput): Finding[] {
  const out: Finding[] = [];
  for (const permission of diff.addedPermissions) {
    const mapping = mappingForPermission(permission);
    const notable = NOTABLE_PERMISSIONS.includes(permission);
    const observed: SourceRef = {
      kind: 'build_fact',
      evidenceClass: 'observed',
      ref: `manifest:uses-permission ${permission}`,
    };
    if (!dataSafety) {
      if (notable || mapping) {
        out.push(
          finding('TG-001', permission, 'evidence_missing', 'medium',
            `New permission ${permission} appeared in ${candidate.artifact.fileName}, but no Data Safety declaration was imported to check it against.`,
            `addedPermissions contains ${permission}; dataSafety not provided`,
            [observed],
            TRUTH_GAP_RULES[0]!.remediation),
        );
      }
      continue;
    }
    if (!mapping) {
      if (notable) {
        out.push(
          finding('TG-001', permission, 'changed_requires_review', 'medium',
            `New notable permission ${permission} has no deterministic Data Safety mapping; a human must confirm coverage.`,
            `addedPermissions contains ${permission}; no mapping in PERMISSION_MAPPINGS`,
            [observed, declared(dataSafety, 'data-safety:collectedDataTypes')],
            TRUTH_GAP_RULES[0]!.remediation),
        );
      }
      continue;
    }
    if (!dataSafety.collectedDataTypes.some((d) => d.id === mapping.dataType)) {
      out.push(
        finding('TG-001', permission, 'confirmed_contradiction', 'high',
          `Build declares ${permission} (${mapping.label}), but the Data Safety form does not list "${mapping.dataType}". One of them is wrong.`,
          `observed(${permission}) vs declared(collectedDataTypes missing "${mapping.dataType}")`,
          [observed, declared(dataSafety, `data-safety:collectedDataTypes ("${mapping.dataType}" absent)`)],
          TRUTH_GAP_RULES[0]!.remediation),
      );
    }
  }
  return out;
}

/** TG-002: new SDK vs Data Safety disclosures + privacy policy mentions. */
function tg002({ diff, dataSafety, privacyPolicy }: RuleInput): Finding[] {
  const out: Finding[] = [];
  for (const sdk of diff.addedSdks) {
    const observed: SourceRef = {
      kind: 'build_fact',
      evidenceClass: 'observed',
      ref: `dex:packages ${sdk.matchedPackages.join(', ')}`,
    };
    const inDataSafety =
      !!dataSafety &&
      (dataSafety.sdkDisclosures.some((d) => mentions(d, sdk.name) || mentions(d, sdk.vendor)) );
    const inPolicy =
      !!privacyPolicy &&
      (textMentions(privacyPolicy.text, sdk.name) || textMentions(privacyPolicy.text, sdk.vendor));

    if (!dataSafety && !privacyPolicy) {
      out.push(
        finding('TG-002', sdk.id, 'evidence_missing', 'medium',
          `New SDK ${sdk.name} (${sdk.vendor}) detected, but no declarations were imported to check disclosure.`,
          `addedSdks contains ${sdk.id}; dataSafety and privacyPolicy not provided`,
          [observed],
          TRUTH_GAP_RULES[1]!.remediation),
      );
      continue;
    }
    if (inDataSafety || inPolicy) continue;

    const sources: SourceRef[] = [observed];
    if (dataSafety) sources.push(declared(dataSafety, 'data-safety:sdkDisclosures'));
    if (privacyPolicy) {
      sources.push({
        kind: 'privacy_policy',
        evidenceClass: 'declared',
        ref: `${privacyPolicy.source ?? 'privacy-policy'} (no mention of "${sdk.name}" or "${sdk.vendor}")`,
      });
    }
    // A Data Safety form asserts completeness of SDK disclosure; absence there is the stronger signal.
    const state: FindingState = dataSafety ? 'confirmed_contradiction' : 'changed_requires_review';
    out.push(
      finding('TG-002', sdk.id, state, 'high',
        `New SDK ${sdk.name} (${sdk.vendor}) is present in the build but disclosed nowhere the team has declared.`,
        `observed(${sdk.id} via ${sdk.matchedPackages.join(', ')}) vs declared(no Data Safety disclosure, no privacy-policy mention)`,
        sources,
        TRUTH_GAP_RULES[1]!.remediation),
    );
  }
  return out;
}

/** TG-003: new network destination vs disclosed destinations. */
function tg003({ diff, dataSafety, privacyPolicy }: RuleInput): Finding[] {
  const out: Finding[] = [];
  for (const host of diff.addedDomains) {
    const observed: SourceRef = {
      kind: 'build_fact',
      evidenceClass: 'observed',
      ref: `dex:url https://${host}`,
    };
    const inDataSafety = !!dataSafety && dataSafety.domains.some((d) => hostCovers(d, host));
    const inPolicy = !!privacyPolicy && textMentions(privacyPolicy.text, host);

    if (!dataSafety && !privacyPolicy) {
      out.push(
        finding('TG-003', host, 'evidence_missing', 'medium',
          `New destination host ${host} is embedded in the build, but no declarations were imported to check disclosure.`,
          `addedDomains contains ${host}; dataSafety and privacyPolicy not provided`,
          [observed],
          TRUTH_GAP_RULES[2]!.remediation),
      );
      continue;
    }
    if (inDataSafety || inPolicy) continue;

    const sources: SourceRef[] = [observed];
    if (dataSafety) sources.push(declared(dataSafety, 'data-safety:domains'));
    if (privacyPolicy) {
      sources.push({
        kind: 'privacy_policy',
        evidenceClass: 'declared',
        ref: `${privacyPolicy.source ?? 'privacy-policy'} (no mention of "${host}")`,
      });
    }
    out.push(
      finding('TG-003', host, 'changed_requires_review', 'high',
        `New network destination ${host} appears in the candidate build and is disclosed in neither the Data Safety destinations nor the privacy policy.`,
        `observed(${host}) vs declared(destination not listed)`,
        sources,
        TRUTH_GAP_RULES[2]!.remediation),
    );
  }
  return out;
}

/** TG-004: declared data types with no supporting permission evidence in either build. */
function tg004({ base, candidate, dataSafety }: RuleInput): Finding[] {
  if (!dataSafety) return [];
  const out: Finding[] = [];
  const present = new Set([
    ...base.permissions.map((p) => p.name),
    ...candidate.permissions.map((p) => p.name),
  ]);
  for (const dt of dataSafety.collectedDataTypes) {
    const supporting = permissionsForDataType(dt.id);
    if (supporting.length === 0) continue; // no deterministic mapping → never fabricate
    if (supporting.some((p) => present.has(p))) continue;
    out.push(
      finding('TG-004', dt.id, 'evidence_missing', 'medium',
        `Data Safety declares collection of "${dt.id}", but neither the base nor the candidate build contains ${supporting.join(' or ')}. The claim currently rests on nothing observable.`,
        `declared("${dt.id}") vs observed(no ${supporting.join('|')} in either build)`,
        [
          declared(dataSafety, `data-safety:collectedDataTypes["${dt.id}"]`),
          { kind: 'build_fact', evidenceClass: 'observed', ref: 'manifest:uses-permission (absent in base and candidate)' },
        ],
        TRUTH_GAP_RULES[3]!.remediation),
    );
  }
  return out;
}

/** TG-005: removed permission whose Data Safety declaration is still live. */
function tg005({ base, candidate, diff, dataSafety }: RuleInput): Finding[] {
  if (!dataSafety) return [];
  const out: Finding[] = [];
  for (const permission of diff.removedPermissions) {
    const mapping = mappingForPermission(permission);
    if (!mapping) continue;
    const stillDeclared = dataSafety.collectedDataTypes.find((d) => d.id === mapping.dataType);
    if (!stillDeclared) continue;
    out.push(
      finding('TG-005', permission, 'changed_requires_review', 'medium',
        `${permission} was removed between ${base.artifact.fileName} and ${candidate.artifact.fileName}, but the Data Safety form still declares "${mapping.dataType}". The store surface has drifted from the product.`,
        `removedPermissions contains ${permission}; declared(collectedDataTypes still contains "${mapping.dataType}")`,
        [
          { kind: 'build_fact', evidenceClass: 'observed', ref: `diff:removedPermissions ${permission}` },
          declared(dataSafety, `data-safety:collectedDataTypes["${mapping.dataType}"]`),
        ],
        TRUTH_GAP_RULES[4]!.remediation),
    );
  }
  return out;
}

function declared(decl: DataSafetyDeclaration, ref: string): SourceRef {
  return { kind: 'data_safety', evidenceClass: 'declared', ref, excerpt: decl.source };
}

function mentions(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** A disclosed destination covers the host itself or any of its subdomains. */
function hostCovers(disclosed: string, host: string): boolean {
  const d = disclosed.toLowerCase();
  return host === d || host.endsWith('.' + d);
}
