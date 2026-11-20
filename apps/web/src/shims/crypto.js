// Browser stand-in for node:crypto: just the sha256 createHash the core uses.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export function createHash(algorithm) {
  if (algorithm !== 'sha256') throw new Error(`Unsupported hash: ${algorithm}`);
  const chunks = [];
  const api = {
    update(data) {
      chunks.push(typeof data === 'string' ? new TextEncoder().encode(data) : data);
      return api;
    },
    digest(encoding) {
      if (encoding !== 'hex') throw new Error('Only hex digests are supported in the browser.');
      const size = chunks.reduce((n, c) => n + c.length, 0);
      const all = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        all.set(c, offset);
        offset += c.length;
      }
      return bytesToHex(sha256(all));
    },
  };
  return api;
}
