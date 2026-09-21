/**
 * Minimal, dependency-free ZIP reader.
 *
 * Reads the End Of Central Directory, walks the central directory, and
 * extracts entries stored with method 0 (store) or 8 (deflate). That covers
 * AAB/APK containers. ZIP64 archives and encrypted entries are rejected with
 * a clear error rather than silently mis-read.
 */

import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;
const MAX_COMMENT = 65536;

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  /** Modification time as DOS date/time, raw. */
  modTime: number;
  modDate: number;
}

export class ZipError extends Error {}

export class ZipArchive {
  readonly entries: ReadonlyMap<string, ZipEntry>;

  constructor(private readonly buffer: Buffer) {
    this.entries = new Map(readCentralDirectory(buffer).map((e) => [e.name, e]));
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  names(): string[] {
    return [...this.entries.keys()];
  }

  /** Entries whose name matches a predicate, in central-directory order. */
  match(predicate: (name: string) => boolean): ZipEntry[] {
    return [...this.entries.values()].filter((e) => predicate(e.name));
  }

  read(entry: ZipEntry): Buffer {
    const buf = this.buffer;
    const off = entry.localHeaderOffset;
    if (off + 30 > buf.length || buf.readUInt32LE(off) !== LOC_SIG) {
      throw new ZipError(`Bad local header for "${entry.name}".`);
    }
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const dataStart = off + 30 + nameLen + extraLen;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > buf.length) throw new ZipError(`Truncated data for "${entry.name}".`);
    const raw = buf.subarray(dataStart, dataEnd);
    switch (entry.method) {
      case 0:
        return Buffer.from(raw);
      case 8:
        try {
          return inflateRawSync(raw, { finishFlush: 4 /* Z_SYNC_FLUSH-safe */ });
        } catch (err) {
          throw new ZipError(`Failed to inflate "${entry.name}": ${(err as Error).message}`);
        }
      default:
        throw new ZipError(
          `Unsupported compression method ${entry.method} for "${entry.name}".`,
        );
    }
  }

  readByName(name: string): Buffer | undefined {
    const entry = this.entries.get(name);
    return entry ? this.read(entry) : undefined;
  }
}

function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 22 - MAX_COMMENT);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new ZipError('Not a ZIP archive: end of central directory not found.');
}

function readCentralDirectory(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);
  const total = buf.readUInt16LE(eocd + 10);
  if (total === 0xffff) {
    throw new ZipError('ZIP64 archives are not supported yet.');
  }
  let off = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < total; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== CEN_SIG) {
      throw new ZipError('Corrupt central directory.');
    }
    const flags = buf.readUInt16LE(off + 8);
    if (flags & 0x1) throw new ZipError('Encrypted ZIP entries are not supported.');
    const method = buf.readUInt16LE(off + 10);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const utf8 = (flags & 0x800) !== 0;
    const nameRaw = buf.subarray(off + 46, off + 46 + nameLen);
    const name = utf8 ? nameRaw.toString('utf8') : nameRaw.toString('latin1');
    entries.push({
      name,
      method,
      compressedSize: buf.readUInt32LE(off + 20),
      uncompressedSize: buf.readUInt32LE(off + 24),
      localHeaderOffset: buf.readUInt32LE(off + 42),
      modTime: buf.readUInt16LE(off + 12),
      modDate: buf.readUInt16LE(off + 14),
    });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
