/**
 * DEX string-table reader — dependency-free.
 *
 * Walks the Dalvik/ART string_ids table and decodes MUTF-8 string data.
 * Attest uses these strings only as *observed evidence*: SDK package prefixes
 * and network URLs. It never infers behavior beyond what the bytes contain.
 */

export class DexError extends Error {}

const DEX_HEADER_SIZE = 0x70;
const MAX_STRINGS = 4_000_000;

export function isDex(buf: Buffer): boolean {
  return buf.length >= 8 && buf.readUInt32LE(0) === 0x0a786564; // "dex\n" LE
}

/** Extract every string from a DEX file's string table. */
export function extractDexStrings(buf: Buffer): string[] {
  if (!isDex(buf)) throw new DexError('Not a DEX file (bad magic).');
  if (buf.length < DEX_HEADER_SIZE) throw new DexError('Truncated DEX header.');

  const stringIdsSize = buf.readUInt32LE(0x38);
  const stringIdsOff = buf.readUInt32LE(0x3c);
  if (stringIdsSize > MAX_STRINGS) throw new DexError('Implausible string count.');
  if (stringIdsOff + stringIdsSize * 4 > buf.length) {
    throw new DexError('String id table extends past end of file.');
  }

  const out: string[] = new Array(stringIdsSize);
  for (let i = 0; i < stringIdsSize; i++) {
    const dataOff = buf.readUInt32LE(stringIdsOff + i * 4);
    if (dataOff >= buf.length) {
      out[i] = '';
      continue;
    }
    // uleb128 utf16 length (unused for sizing; data is NUL-terminated MUTF-8)
    let p = dataOff;
    while (p < buf.length && buf.readUInt8(p) & 0x80) p++;
    p++;
    const start = p;
    while (p < buf.length && buf.readUInt8(p) !== 0) p++;
    out[i] = buf.toString('utf8', start, p);
  }
  return out;
}
