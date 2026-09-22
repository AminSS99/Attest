/**
 * SARIF 2.1.0 export (PRODUCT_PLAN §5.6): findings flow into GitHub code
 * scanning and pull-request annotations without a hosted round-trip.
 */

import type { Finding, Severity } from 'attest-schema';

import { CLI_VERSION } from './inspect.js';
import { JOURNEY_RULES } from './journey.js';
import { TRUTH_GAP_RULES } from './truthgap.js';

function sarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
  switch (severity) {
    case 'blocker':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    default:
      return 'note';
  }
}

export function toSarif(findings: Finding[], artifactFileName: string): string {
  const doc = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Attest',
            version: CLI_VERSION,
            informationUri: 'https://github.com/attest-dev/attest',
            rules: [...TRUTH_GAP_RULES, ...JOURNEY_RULES].map((r) => ({
              id: r.id,
              name: r.title,
              shortDescription: { text: r.title },
              fullDescription: { text: r.description },
              help: { text: r.remediation },
            })),
          },
        },
        results: findings.map((f) => ({
          ruleId: f.ruleId,
          level: sarifLevel(f.severity),
          message: { text: `${f.summary}\n\nComparison: ${f.comparison}\n\nRemediation: ${f.remediation}` },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: artifactFileName },
              },
            },
          ],
          partialFingerprints: { 'attest/finding-id': f.id },
          properties: { state: f.state, severity: f.severity, subject: f.subject },
        })),
      },
    ],
  };
  return JSON.stringify(doc, null, 2);
}
