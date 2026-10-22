// A minimal ZIP writer. Entries are "stored" (no compression) unless marked
// `deflate`, which are compressed with the browser's CompressionStream.
// PowerPoint parts need it: macOS Preview / Quick Look read an all-stored
// package wrongly (every slide showed one of the first two pictures), and
// deflating the XML parts fixes it. Pictures stay stored: PNG and JPEG don't
// compress further. Avoids a zip dependency.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  /** Compress this entry (method 8). Otherwise it's stored as is. */
  deflate?: boolean;
}

const utf8 = new TextEncoder();

async function streamBytes(
  data: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(data);
      c.close();
    },
  });
  const reader = source
    .pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
    .getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  return streamBytes(data, new CompressionStream("deflate-raw"));
}

export function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  return streamBytes(data, new DecompressionStream("deflate-raw"));
}

type Packed = { name: Uint8Array; body: Uint8Array; crc: number; size: number; method: 0 | 8 };

function writeZip(entries: Packed[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  // 1980-01-01 00:00, the earliest DOS date: a fixed stamp keeps output stable.
  const dosTime = 0;
  const dosDate = (0 << 9) | (1 << 5) | 1;

  for (const e of entries) {
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, e.method, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, e.crc, true);
    local.setUint32(18, e.body.length, true);
    local.setUint32(22, e.size, true);
    local.setUint16(26, e.name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), e.name, e.body);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true); // version made by
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, e.method, true);
    cen.setUint16(12, dosTime, true);
    cen.setUint16(14, dosDate, true);
    cen.setUint32(16, e.crc, true);
    cen.setUint32(20, e.body.length, true);
    cen.setUint32(24, e.size, true);
    cen.setUint16(28, e.name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), e.name);

    offset += 30 + e.name.length + e.body.length;
  }

  const cenSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);

  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Build a ZIP archive from entries, in order, every entry stored. */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  return writeZip(
    entries.map((e) => ({
      name: utf8.encode(e.name),
      body: e.data,
      crc: crc32(e.data),
      size: e.data.length,
      method: 0,
    })),
  );
}

/** Build a ZIP archive from entries, in order, compressing those marked
 *  `deflate`. */
export async function zip(entries: ZipEntry[]): Promise<Uint8Array> {
  const packed: Packed[] = [];
  for (const e of entries) {
    packed.push({
      name: utf8.encode(e.name),
      body: e.deflate ? await deflateRaw(e.data) : e.data,
      crc: crc32(e.data),
      size: e.data.length,
      method: e.deflate ? 8 : 0,
    });
  }
  return writeZip(packed);
}

/** Read back a ZIP written here (for tests and sanity checks), inflating
 *  compressed entries. */
export async function unzip(zipData: Uint8Array): Promise<(ZipEntry & { method: number })[]> {
  const view = new DataView(zipData.buffer, zipData.byteOffset, zipData.byteLength);
  const dec = new TextDecoder();
  const out: (ZipEntry & { method: number })[] = [];
  let at = 0;
  while (at + 4 <= zipData.length && view.getUint32(at, true) === 0x04034b50) {
    const method = view.getUint16(at + 8, true);
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const extra = view.getUint16(at + 28, true);
    const name = dec.decode(zipData.subarray(at + 30, at + 30 + nameLen));
    const start = at + 30 + nameLen + extra;
    const body = zipData.subarray(start, start + size);
    out.push({ name, method, data: method === 8 ? await inflateRaw(body) : body });
    at = start + size;
  }
  return out;
}

/** Read back a stored ZIP (for tests and sanity checks). */
export function unzipStore(zipData: Uint8Array): ZipEntry[] {
  const view = new DataView(zipData.buffer, zipData.byteOffset, zipData.byteLength);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  let at = 0;
  while (at + 4 <= zipData.length && view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const extra = view.getUint16(at + 28, true);
    const name = dec.decode(zipData.subarray(at + 30, at + 30 + nameLen));
    const start = at + 30 + nameLen + extra;
    out.push({ name, data: zipData.subarray(start, start + size) });
    at = start + size;
  }
  return out;
}
