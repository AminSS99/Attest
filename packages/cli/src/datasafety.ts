/**
 * Data Safety declaration import (PRODUCT_PLAN §9 weeks 3–4):
 * a versioned JSON representation, plus a pragmatic CSV form for teams that
 * export answers by hand:
 *
 *   kind,value,details
 *   data_type,location.precise_location,shared=false;optional=false
 *   sdk,Firebase Analytics
 *   domain,api.example.com
 */

import { readFile } from 'node:fs/promises';

import {
  DATA_SAFETY_SCHEMA_VERSION,
  type CollectedDataType,
  type DataSafetyDeclaration,
} from 'attest-schema';

export class DeclarationImportError extends Error {}

export async function importDataSafetyFile(path: string): Promise<DataSafetyDeclaration> {
  const raw = await readFile(path, 'utf8');
  const decl = path.toLowerCase().endsWith('.csv')
    ? parseDataSafetyCsv(raw)
    : parseDataSafetyJson(raw);
  return { ...decl, source: decl.source ?? path };
}

export function parseDataSafetyJson(raw: string): DataSafetyDeclaration {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new DeclarationImportError(`Data Safety JSON is not valid JSON: ${(err as Error).message}`);
  }
  const obj = parsed as Partial<DataSafetyDeclaration>;
  if (obj?.schemaVersion !== DATA_SAFETY_SCHEMA_VERSION) {
    throw new DeclarationImportError(
      `Unsupported Data Safety schemaVersion "${String(obj?.schemaVersion)}" (expected "${DATA_SAFETY_SCHEMA_VERSION}").`,
    );
  }
  if (!Array.isArray(obj.collectedDataTypes) || !Array.isArray(obj.sdkDisclosures) || !Array.isArray(obj.domains)) {
    throw new DeclarationImportError(
      'Data Safety JSON must contain collectedDataTypes, sdkDisclosures, and domains arrays.',
    );
  }
  return normalize(obj as DataSafetyDeclaration);
}

export function parseDataSafetyCsv(raw: string): DataSafetyDeclaration {
  const decl: DataSafetyDeclaration = {
    schemaVersion: DATA_SAFETY_SCHEMA_VERSION,
    collectedDataTypes: [],
    sdkDisclosures: [],
    domains: [],
  };
  const rows = parseCsv(raw);
  for (const [i, row] of rows.entries()) {
    if (i === 0 && row[0]?.trim().toLowerCase() === 'kind') continue; // header
    if (row.length === 0 || row[0] === undefined || row[0].trim() === '') continue;
    const kind = row[0].trim().toLowerCase();
    const value = (row[1] ?? '').trim();
    const details = (row[2] ?? '').trim();
    if (!value) throw new DeclarationImportError(`CSV row ${i + 1}: missing value.`);
    switch (kind) {
      case 'data_type': {
        const entry: CollectedDataType = { id: value };
        for (const kv of details.split(';')) {
          const [k, v] = kv.split('=').map((s) => s?.trim());
          if (k === 'shared') entry.shared = v === 'true';
          if (k === 'optional') entry.optional = v === 'true';
          if (k === 'purpose' && v) entry.purpose = v;
        }
        decl.collectedDataTypes.push(entry);
        break;
      }
      case 'sdk':
        decl.sdkDisclosures.push(value);
        break;
      case 'domain':
        decl.domains.push(value.toLowerCase());
        break;
      default:
        throw new DeclarationImportError(
          `CSV row ${i + 1}: unknown kind "${kind}" (expected data_type|sdk|domain).`,
        );
    }
  }
  return normalize(decl);
}

function normalize(decl: DataSafetyDeclaration): DataSafetyDeclaration {
  return {
    ...decl,
    collectedDataTypes: [...decl.collectedDataTypes].sort((a, b) => a.id.localeCompare(b.id)),
    sdkDisclosures: [...new Set(decl.sdkDisclosures)].sort(),
    domains: [...new Set(decl.domains.map((d) => d.toLowerCase()))].sort(),
  };
}

/** Small RFC-4180-ish CSV reader: quoted fields, escaped quotes, CRLF. */
function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && raw[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
