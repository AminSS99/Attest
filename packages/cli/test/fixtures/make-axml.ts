/**
 * Synthetic binary-XML (AXML) writer for tests and demos.
 *
 * Emits a real RES_XML_TYPE document: UTF-8 string pool + start/end element
 * chunks with typed attributes. Round-trips through the production parser,
 * so tests exercise the same code path real APKs take.
 */

export interface AxmlSpecElement {
  name: string;
  attrs?: Record<string, string | number | boolean>;
  children?: AxmlSpecElement[];
}

const NO_INDEX = 0xffffffff;

export function buildAxml(root: AxmlSpecElement): Buffer {
  // 1. String pool: element names, attribute names, string attribute values.
  const pool = new Map<string, number>();
  const intern = (s: string): number => {
    let i = pool.get(s);
    if (i === undefined) {
      i = pool.size;
      pool.set(s, i);
    }
    return i;
  };
  const walk = (el: AxmlSpecElement, fn: (el: AxmlSpecElement) => void): void => {
    fn(el);
    for (const c of el.children ?? []) walk(c, fn);
  };
  walk(root, (el) => {
    intern(el.name);
    for (const [k, v] of Object.entries(el.attrs ?? {})) {
      intern(k);
      if (typeof v === 'string') intern(v);
    }
  });
  const strings = [...pool.keys()];

  // 2. Element chunks.
  const elementChunks: Buffer[] = [];
  walk(root, () => undefined); // (order preserved by explicit recursion below)
  const emit = (el: AxmlSpecElement): void => {
    const attrs = Object.entries(el.attrs ?? {});
    const attrStart = 20; // size of ResXMLTree_attrExt
    const attrSize = 20;
    const size = 16 + attrStart + attrs.length * attrSize;
    const chunk = Buffer.alloc(size);
    chunk.writeUInt16LE(0x0102, 0); // RES_XML_START_ELEMENT_TYPE
    chunk.writeUInt16LE(16, 2); // node header size
    chunk.writeUInt32LE(size, 4);
    chunk.writeUInt32LE(NO_INDEX, 16); // ns
    chunk.writeUInt32LE(intern(el.name), 20); // name
    chunk.writeUInt16LE(attrStart, 24);
    chunk.writeUInt16LE(attrSize, 26);
    chunk.writeUInt16LE(attrs.length, 28);
    attrs.forEach(([name, value], i) => {
      const a = 16 + attrStart + i * attrSize;
      chunk.writeUInt32LE(NO_INDEX, a); // ns
      chunk.writeUInt32LE(intern(name), a + 4);
      chunk.writeUInt16LE(8, a + 12); // typed value size
      if (typeof value === 'string') {
        chunk.writeUInt32LE(intern(value), a + 8); // rawValue
        chunk.writeUInt8(0x03, a + 15); // TYPE_STRING
        chunk.writeUInt32LE(intern(value), a + 16);
      } else if (typeof value === 'number') {
        chunk.writeUInt32LE(NO_INDEX, a + 8);
        chunk.writeUInt8(0x10, a + 15); // TYPE_INT_DEC
        chunk.writeUInt32LE(value >>> 0, a + 16);
      } else {
        chunk.writeUInt32LE(NO_INDEX, a + 8);
        chunk.writeUInt8(0x12, a + 15); // TYPE_INT_BOOLEAN
        chunk.writeUInt32LE(value ? 1 : 0, a + 16);
      }
    });
    elementChunks.push(chunk);
    for (const c of el.children ?? []) emit(c);

    const endSize = 24;
    const end = Buffer.alloc(endSize);
    end.writeUInt16LE(0x0103, 0); // RES_XML_END_ELEMENT_TYPE
    end.writeUInt16LE(16, 2);
    end.writeUInt32LE(endSize, 4);
    end.writeUInt32LE(NO_INDEX, 16);
    end.writeUInt32LE(intern(el.name), 20);
    elementChunks.push(end);
  };
  emit(root);

  // 3. String pool chunk.
  const stringData: Buffer[] = [];
  const offsets: number[] = [];
  let cursor = 0;
  for (const s of strings) {
    const bytes = Buffer.from(s, 'utf8');
    const header = Buffer.alloc(2);
    header.writeUInt8(s.length, 0); // u16 length (fixtures stay < 128 chars)
    header.writeUInt8(bytes.length, 1); // utf8 byte length
    offsets.push(cursor);
    stringData.push(header, bytes, Buffer.from([0]));
    cursor += 2 + bytes.length + 1;
  }
  while (cursor % 4 !== 0) {
    stringData.push(Buffer.from([0]));
    cursor++;
  }
  const headerSize = 28;
  const stringsStart = headerSize + strings.length * 4;
  const poolSize = stringsStart + cursor;
  const poolChunk = Buffer.alloc(poolSize);
  poolChunk.writeUInt16LE(0x0001, 0); // RES_STRING_POOL_TYPE
  poolChunk.writeUInt16LE(headerSize, 2);
  poolChunk.writeUInt32LE(poolSize, 4);
  poolChunk.writeUInt32LE(strings.length, 8);
  poolChunk.writeUInt32LE(0, 12); // styleCount
  poolChunk.writeUInt32LE(1 << 8, 16); // UTF8_FLAG
  poolChunk.writeUInt32LE(stringsStart, 20);
  offsets.forEach((o, i) => poolChunk.writeUInt32LE(o, headerSize + i * 4));
  Buffer.concat(stringData).copy(poolChunk, stringsStart);

  // 4. Document chunk.
  const body = Buffer.concat([poolChunk, ...elementChunks]);
  const doc = Buffer.alloc(8);
  doc.writeUInt16LE(0x0003, 0); // RES_XML_TYPE
  doc.writeUInt16LE(8, 2);
  doc.writeUInt32LE(8 + body.length, 4);
  return Buffer.concat([doc, body]);
}
