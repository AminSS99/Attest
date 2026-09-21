/**
 * Declared-text import: privacy policies, store listing copy, reviewer
 * instructions. Plain UTF-8 in, normalized DeclaredText out. Attest quotes
 * excerpts verbatim in findings; it never paraphrases a declared source.
 */

import { readFile } from 'node:fs/promises';

import type { DeclaredText, DeclaredTextKind } from 'attest-schema';

export async function importDeclaredTextFile(
  path: string,
  kind: DeclaredTextKind,
): Promise<DeclaredText> {
  const text = (await readFile(path, 'utf8')).normalize('NFC');
  return { kind, text, source: path, importedAt: new Date().toISOString() };
}

/** Case-insensitive whole-text search, normalized. Used only to test "mentioned". */
export function textMentions(text: string | undefined, needle: string): boolean {
  if (!text) return false;
  return text.toLowerCase().includes(needle.toLowerCase());
}

/** Extract a short verbatim excerpt around the first mention, for citation. */
export function excerptAround(text: string, needle: string, radius = 120): string | undefined {
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return undefined;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + needle.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return (prefix + text.slice(start, end).replace(/\s+/g, ' ').trim() + suffix);
}
