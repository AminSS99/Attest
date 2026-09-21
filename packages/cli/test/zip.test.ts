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
});
