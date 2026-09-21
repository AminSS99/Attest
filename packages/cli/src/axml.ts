/**
 * Binary AndroidManifest.xml (AXML) parser — dependency-free.
 *
 * Implements the Android RES_XML_TYPE container: string pool, resource map,
 * and start/end element events with typed attribute values. This is how
 * Attest reads a compiled manifest without apktool, Java, or network access —
 * the artifact never leaves the machine.
 */

const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_TYPE = 0x0003;
const RES_XML_RESOURCE_MAP_TYPE = 0x0180;
const RES_XML_START_ELEMENT_TYPE = 0x0102;
const RES_XML_END_ELEMENT_TYPE = 0x0103;

const UTF8_FLAG = 1 << 8;
const NO_INDEX = 0xffffffff;

export class AxmlError extends Error {}

export type TypedAttrValue =
  | { type: 'string'; value: string }
  | { type: 'int'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'reference'; value: number }
  | { type: 'raw'; value: number; dataType: number };

export interface AxmlAttribute {
  name: string;
  value: TypedAttrValue;
}

export interface AxmlElement {
  name: string;
  attributes: AxmlAttribute[];
  children: AxmlElement[];
  /** Convenience: formatted attribute lookup (e.g. el.get('android:exported')). */
  get(name: string): string | undefined;
}

/**
 * Well-known android: attribute resource ids, used when a compiled manifest
 * omits the attribute name string (aapt2 keeps them; some pipelines don't).
 */
const ANDROID_ATTR_NAMES: Readonly<Record<number, string>> = {
  0x01010003: 'android:name',
  0x01010006: 'android:permission',
  0x01010010: 'android:exported',
  0x01010018: 'android:authorities',
  0x01010024: 'android:value',
  0x01010025: 'android:resource',
  0x0101020c: 'android:minSdkVersion',
  0x0101021b: 'android:versionCode',
  0x0101021c: 'android:versionName',
  0x01010261: 'android:glEsVersion',
  0x01010270: 'android:targetSdkVersion',
  0x01010271: 'android:maxSdkVersion',
  0x0101028e: 'android:required',
};

export function parseAxml(buf: Buffer): AxmlElement {
  if (buf.length < 8 || buf.readUInt16LE(0) !== RES_XML_TYPE) {
    throw new AxmlError('Not a binary XML document (RES_XML_TYPE header missing).');
  }
  const fileSize = buf.readUInt32LE(4);
  const end = Math.min(fileSize, buf.length);

  let strings: string[] = [];
  let resourceMap: number[] = [];
  const stack: AxmlElement[] = [];
  let root: AxmlElement | undefined;

  let off = buf.readUInt16LE(2); // document chunk header size
  while (off + 8 <= end) {
    const type = buf.readUInt16LE(off);
    const headerSize = buf.readUInt16LE(off + 2);
    const size = buf.readUInt32LE(off + 4);
    if (size < 8 || off + size > end) throw new AxmlError(`Corrupt chunk at offset ${off}.`);

    switch (type) {
      case RES_STRING_POOL_TYPE:
        strings = readStringPool(buf, off, headerSize, size);
        break;
      case RES_XML_RESOURCE_MAP_TYPE: {
        resourceMap = [];
        for (let p = off + headerSize; p + 4 <= off + size; p += 4) {
          resourceMap.push(buf.readUInt32LE(p));
        }
        break;
      }
      case RES_XML_START_ELEMENT_TYPE: {
        const el = readStartElement(buf, off, strings, resourceMap);
        if (stack.length > 0) stack[stack.length - 1]!.children.push(el);
        else root = el;
        stack.push(el);
        break;
      }
      case RES_XML_END_ELEMENT_TYPE: {
        const top = stack.pop();
        if (!top) throw new AxmlError('Unbalanced end element.');
        break;
      }
      default:
        break; // namespaces, text, CDATA — not needed for manifest facts
    }
    off += size;
  }

  if (!root || stack.length !== 0) throw new AxmlError('Malformed document: unbalanced elements.');
  return root;
}

function readStringPool(buf: Buffer, chunkOff: number, headerSize: number, size: number): string[] {
  const stringCount = buf.readUInt32LE(chunkOff + 8);
  const flags = buf.readUInt32LE(chunkOff + 16);
  const stringsStart = buf.readUInt32LE(chunkOff + 20);
  const utf8 = (flags & UTF8_FLAG) !== 0;

  const offsetsBase = chunkOff + headerSize;
  const dataBase = chunkOff + stringsStart;
  const chunkEnd = chunkOff + size;
  const out: string[] = [];

  for (let i = 0; i < stringCount; i++) {
    const rel = buf.readUInt32LE(offsetsBase + i * 4);
    let p = dataBase + rel;
    if (p >= chunkEnd) {
      out.push('');
      continue;
    }
    if (utf8) {
      // u16 length (1–2 bytes), then utf8 byte length (1–2 bytes), then bytes.
      let u16len = buf.readUInt8(p)!;
      p += 1;
      if (u16len & 0x80) {
        u16len = ((u16len & 0x7f) << 8) | buf.readUInt8(p)!;
        p += 1;
      }
      let byteLen = buf.readUInt8(p)!;
      p += 1;
      if (byteLen & 0x80) {
        byteLen = ((byteLen & 0x7f) << 8) | buf.readUInt8(p)!;
        p += 1;
      }
      out.push(buf.toString('utf8', p, Math.min(p + byteLen, chunkEnd)));
    } else {
      let len = buf.readUInt16LE(p);
      p += 2;
      if (len & 0x8000) {
        len = ((len & 0x7fff) << 16) | buf.readUInt16LE(p);
        p += 2;
      }
      out.push(buf.toString('utf16le', p, Math.min(p + len * 2, chunkEnd)));
    }
  }
  return out;
}

function readStartElement(
  buf: Buffer,
  off: number,
  strings: string[],
  resourceMap: number[],
): AxmlElement {
  const nameIdx = buf.readUInt32LE(off + 20);
  const name = nameIdx === NO_INDEX ? '' : strings[nameIdx] ?? '';
  const attrStart = buf.readUInt16LE(off + 24);
  const attrSize = buf.readUInt16LE(off + 26) || 20;
  const attrCount = buf.readUInt16LE(off + 28);

  const attributes: AxmlAttribute[] = [];
  for (let i = 0; i < attrCount; i++) {
    // attributeStart is relative to ResXMLTree_attrExt, which begins at off + 16
    // (after the 8-byte chunk header + lineNumber + comment).
    const a = off + 16 + attrStart + i * attrSize;
    const attrNameIdx = buf.readUInt32LE(a + 4);
    const rawValueIdx = buf.readUInt32LE(a + 8);
    const dataType = buf.readUInt8(a + 15);
    const data = buf.readUInt32LE(a + 16);

    let attrName = attrNameIdx === NO_INDEX ? '' : strings[attrNameIdx] ?? '';
    if (attrName === '') {
      const resId = attrNameIdx !== NO_INDEX ? resourceMap[attrNameIdx] : undefined;
      if (resId !== undefined && resId !== 0) {
        attrName = ANDROID_ATTR_NAMES[resId] ?? `android:0x${resId.toString(16).padStart(8, '0')}`;
      } else {
        attrName = `attr#${i}`;
      }
    }

    attributes.push({ name: attrName, value: typedValue(strings, rawValueIdx, dataType, data) });
  }

  return {
    name,
    attributes,
    children: [],
    get(attr: string): string | undefined {
      const found = attributes.find((x) => x.name === attr || x.name === `android:${attr}`);
      return found ? formatValue(found.value) : undefined;
    },
  };
}

function typedValue(
  strings: string[],
  rawValueIdx: number,
  dataType: number,
  data: number,
): TypedAttrValue {
  switch (dataType) {
    case 0x03: // TYPE_STRING
      return { type: 'string', value: strings[data] ?? '' };
    case 0x10: // TYPE_INT_DEC
    case 0x11: // TYPE_INT_HEX
      return { type: 'int', value: data | 0 };
    case 0x12: // TYPE_INT_BOOLEAN
      return { type: 'boolean', value: data !== 0 };
    case 0x01: // TYPE_REFERENCE
    case 0x02: // TYPE_ATTRIBUTE
      return { type: 'reference', value: data };
    default:
      if (rawValueIdx !== NO_INDEX && strings[rawValueIdx] !== undefined) {
        return { type: 'string', value: strings[rawValueIdx]! };
      }
      return { type: 'raw', value: data, dataType };
  }
}

export function formatValue(v: TypedAttrValue): string {
  switch (v.type) {
    case 'string':
      return v.value;
    case 'int':
      return String(v.value);
    case 'boolean':
      return v.value ? 'true' : 'false';
    case 'reference':
      return `@0x${v.value.toString(16).padStart(8, '0')}`;
    case 'raw':
      return `0x${v.value.toString(16).padStart(8, '0')}`;
  }
}
