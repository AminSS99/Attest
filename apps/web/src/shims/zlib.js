// Browser stand-in for node:zlib, used only by the website bundle.
import { inflateSync } from 'fflate';
import { Buffer } from 'buffer';

export function inflateRawSync(data) {
  return Buffer.from(inflateSync(data));
}
