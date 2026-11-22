// Browser stand-in for node:zlib, used only by the website bundle.
import { inflateSync } from 'fflate';
import { Buffer } from 'buffer';

const DEFAULT_MAX_OUTPUT_BYTES = 128 * 1024 * 1024;

export function inflateRawSync(data, options) {
  const maxOutputLength = options?.maxOutputLength ?? DEFAULT_MAX_OUTPUT_BYTES;
  const out = inflateSync(data);
  if (out.byteLength > maxOutputLength) {
    throw new Error(`Inflated entry exceeds maximum supported size (${maxOutputLength} bytes).`);
  }
  return Buffer.from(out);
}
