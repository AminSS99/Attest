/**
 * Synthetic DEX writer for tests and demos: header + string_ids + string_data
 * only. Enough for the production string-table reader to walk real offsets.
 */

const HEADER_SIZE = 0x70;
const ENDIAN_TAG = 0x12345678;

function uleb128(value: number): Buffer {
  const out: number[] = [];
  let v = value >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    out.push(b);
  } while (v !== 0);
  return Buffer.from(out);
}

export function buildDex(strings: string[]): Buffer {
  const header = Buffer.alloc(HEADER_SIZE);
  header.write('dex\n035\0', 0, 'ascii');
  header.writeUInt32LE(HEADER_SIZE, 0x24); // header_size
  header.writeUInt32LE(ENDIAN_TAG, 0x28);

  const idsOff = HEADER_SIZE;
  header.writeUInt32LE(strings.length, 0x38); // string_ids_size
  header.writeUInt32LE(strings.length > 0 ? idsOff : 0, 0x3c); // string_ids_off

  let dataOff = idsOff + strings.length * 4;
  if (dataOff % 4 !== 0) dataOff += 4 - (dataOff % 4);

  const stringParts: Buffer[] = [];
  const offsets: number[] = [];
  let cursor = dataOff;
  for (const s of strings) {
    const bytes = Buffer.from(s, 'utf8');
    const entry = Buffer.concat([uleb128(s.length), bytes, Buffer.from([0])]);
    offsets.push(cursor);
    stringParts.push(entry);
    cursor += entry.length;
  }

  const ids = Buffer.alloc(strings.length * 4);
  offsets.forEach((o, i) => ids.writeUInt32LE(o, i * 4));
  const padding = Buffer.alloc(dataOff - (idsOff + ids.length));
  const data = Buffer.concat(stringParts);

  header.writeUInt32LE(dataOff + data.length, 0x20); // file_size
  header.writeUInt32LE(data.length, 0x68); // data_size
  header.writeUInt32LE(data.length > 0 ? dataOff : 0, 0x6c); // data_off

  return Buffer.concat([header, ids, padding, data]);
}
