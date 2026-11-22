import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ZipArchive, ZipError } from '../src/zip.js';
import { buildZip } from './fixtures/make-zip.js';

describe('ZipArchive', () => {
  it('round-trips deflated and stored entries', () => {
    const payload = Buffer.from('hello attest '.repeat(500), 'utf8');
    const zip = new ZipArchive(
      buildZip([
        { name: 'classes.dex', data: payload },
        { name: 'resources.pb', data: Buffer.from([1, 2, 3]), compress: false },
      ]),
    );
    assert.deepEqual(zip.names().sort(), ['classes.dex', 'resources.pb']);
    assert.deepEqual(zip.readByName('classes.dex')!, payload);
    assert.deepEqual(zip.readByName('resources.pb')!, Buffer.from([1, 2, 3]));
  });

  it('rejects non-zip bytes with a clear error', () => {
    assert.throws(() => new ZipArchive(Buffer.from('not a zip')), ZipError);
  });

  it('returns undefined for missing entries', () => {
    const zip = new ZipArchive(buildZip([{ name: 'a.txt', data: Buffer.from('a') }]));
    assert.equal(zip.readByName('missing.txt'), undefined);
  });

  it('rejects entries exceeding MAX_ENTRY_BYTES (zip bomb guard)', () => {
    const raw = buildZip([{ name: 'bomb.dex', data: Buffer.from('x') }]);
    // Patch central directory uncompressedSize at EOCD offset -> CEN + 24 to 256 MiB.
    const eocd = raw.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const cenOff = raw.readUInt32LE(eocd + 16);
    raw.writeUInt32LE(256 * 1024 * 1024, cenOff + 24);
    const zip = new ZipArchive(raw);
    const entry = zip.entries.get('bomb.dex')!;
    assert.throws(() => zip.read(entry), ZipError);
  });

  it('rejects corrupt central directory counts with ZipError', () => {
    const raw = buildZip([{ name: 'a.txt', data: Buffer.from('a') }]);
    const eocd = raw.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    raw.writeUInt16LE(99, eocd + 10);
    assert.throws(() => new ZipArchive(raw), ZipError);
  });
});
