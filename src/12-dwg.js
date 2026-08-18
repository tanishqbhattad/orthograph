/* ============================================================
   ORTHOGRAPH — 12 DWG reader (R13 – R2000), experimental
   ------------------------------------------------------------
   DWG is a closed binary format. This is written from the Open
   Design Alliance's published specification. Objects are located
   independently through the object map, so a failure to decode
   one object cannot desynchronise the others — anything that
   does not decode cleanly is skipped and counted, never guessed.
   R2004 and later wrap the sections in a compressed container
   that this does not decode; those files are reported, not
   half-read.
   ============================================================ */

const DWG_SENTINEL_HDR = [0x95, 0xA0, 0x4E, 0x28, 0x99, 0x82, 0x1A, 0xE5, 0x5F, 0x1D, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];

class BitReader {
  constructor(buf, bitPos) { this.b = buf; this.p = bitPos || 0; }
  get bitLen() { return this.b.length * 8; }
  seek(bit) { this.p = bit; return this; }
  eof() { return this.p >= this.bitLen; }
  bit() {
    if (this.p >= this.bitLen) throw new RangeError('dwg: read past end');
    const v = (this.b[this.p >> 3] >> (7 - (this.p & 7))) & 1;
    this.p++; return v;
  }
  bits(n) { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | this.bit(); return v >>> 0; }
  B() { return this.bit(); }
  BB() { return this.bits(2); }
  RC() { return this.bits(8); }
  bytes(n) { const t = new Uint8Array(n); for (let i = 0; i < n; i++) t[i] = this.bits(8); return t; }
  RS() { const a = this.bits(8), b = this.bits(8); return a | (b << 8); }
  RSs() { const v = this.RS(); return v > 0x7fff ? v - 0x10000 : v; }
  RL() { const t = this.bytes(4); return (t[0] | (t[1] << 8) | (t[2] << 16) | (t[3] << 24)) >>> 0; }
  RLs() { const v = this.RL(); return v > 0x7fffffff ? v - 0x100000000 : v; }
  RD() { const t = this.bytes(8); return new DataView(t.buffer).getFloat64(0, true); }
  BS() { const c = this.BB(); if (c === 0) return this.RSs(); if (c === 1) return this.bits(8); if (c === 2) return 0; return 256; }
  BL() { const c = this.BB(); if (c === 0) return this.RLs(); if (c === 1) return this.bits(8); return 0; }
  BD() { const c = this.BB(); if (c === 0) return this.RD(); if (c === 1) return 1.0; return 0.0; }
  /** bit double with default — patches the low bytes of a known value */
  DD(def) {
    const c = this.BB();
    if (c === 0) return def;
    const t = new Uint8Array(8);
    new DataView(t.buffer).setFloat64(0, def, true);
    if (c === 1) { for (let i = 0; i < 4; i++) t[i] = this.bits(8); }
    else if (c === 2) { for (const i of [4, 5, 0, 1, 2, 3]) t[i] = this.bits(8); }
    else return this.RD();
    return new DataView(t.buffer).getFloat64(0, true);
  }
  BT() { return this.B() ? 0 : this.BD(); }                     /* bit thickness, R2000 */
  BE() { return this.B() ? [0, 0, 1] : [this.BD(), this.BD(), this.BD()]; }
  P2RD() { return [this.RD(), this.RD()]; }
  P2BD() { return [this.BD(), this.BD()]; }
  P3BD() { return [this.BD(), this.BD(), this.BD()]; }
  P2DD(d) { return [this.DD(d[0]), this.DD(d[1])]; }
  MC() {
    const bs = [];
    for (let i = 0; i < 5; i++) { const b = this.bits(8); bs.push(b); if (!(b & 0x80)) break; }
    let neg = false;
    const last = bs.length - 1;
    if (bs[last] & 0x40) { neg = true; bs[last] &= 0xBF; }
    let v = 0;
    for (let i = last; i >= 0; i--) v = v * 128 + (bs[i] & 0x7f);
    return neg ? -v : v;
  }
  MS() {
    let v = 0, sh = 1;
    for (let i = 0; i < 4; i++) {
      const w = this.RS();
      if (w & 0x8000) { v += (w & 0x7fff) * sh; sh *= 32768; }
      else { v += w * sh; break; }
    }
    return v;
  }
  H() {
    const b = this.bits(8), code = (b >> 4) & 0xf, cnt = b & 0xf;
    let v = 0;
    for (let i = 0; i < cnt; i++) v = v * 256 + this.bits(8);
    return { code, value: v };
  }
  TV() { const n = this.BS(); let s = ''; for (let i = 0; i < n; i++) { const c = this.bits(8); if (c) s += String.fromCharCode(c); } return s; }
  CMC() { const i = this.BS(); return i; }
  align() { this.p = (this.p + 7) & ~7; }
}

/* The checksum DWG uses across sections is CRC-16/ARC applied as
   dx = (dx >> 8) ^ table[(byte ^ dx) & 0xff], seeded per section. */
const CRC_TAB = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? ((c >> 1) ^ 0xA001) : (c >> 1);
    t[i] = c;
  }
  return t;
})();
function dwgCrc(buf, from, len, seed) {
  let dx = seed === undefined ? 0 : seed;
  for (let i = from; i < from + len; i++) dx = ((dx >> 8) ^ CRC_TAB[(buf[i] ^ dx) & 0xff]) & 0xffff;
  return dx;
}

/* ---- bit writer, the mirror of BitReader ---- */
class BitWriter {
  constructor() { this.buf = []; this.acc = 0; this.n = 0; }
  bit(v) {
    this.acc = (this.acc << 1) | (v & 1); this.n++;
    if (this.n === 8) { this.buf.push(this.acc & 0xff); this.acc = 0; this.n = 0; }
  }
  bits(n, v) { for (let i = n - 1; i >= 0; i--) this.bit((v >> i) & 1); }
  get bitLen() { return this.buf.length * 8 + this.n; }
  flush() { while (this.n) this.bit(0); return Uint8Array.from(this.buf); }
  B(v) { this.bit(v ? 1 : 0); }
  BB(v) { this.bits(2, v); }
  RC(v) { this.bits(8, v & 0xff); }
  byteArr(a) { for (const b of a) this.bits(8, b); }
  RS(v) { this.bits(8, v & 0xff); this.bits(8, (v >> 8) & 0xff); }
  RL(v) { for (let i = 0; i < 4; i++) this.bits(8, (v >>> (i * 8)) & 0xff); }
  RD(v) { const t = new Uint8Array(8); new DataView(t.buffer).setFloat64(0, v, true); this.byteArr(t); }
  BS(v) {
    if (v === 0) return this.BB(2);
    if (v === 256) return this.BB(3);
    if (v >= 0 && v < 256) { this.BB(1); return this.bits(8, v); }
    this.BB(0); this.RS(v < 0 ? v + 0x10000 : v);
  }
  BL(v) {
    if (v === 0) return this.BB(2);
    if (v > 0 && v < 256) { this.BB(1); return this.bits(8, v); }
    this.BB(0); this.RL(v >>> 0);
  }
  BD(v) {
    if (v === 0) return this.BB(2);
    if (v === 1) return this.BB(1);
    this.BB(0); this.RD(v);
  }
  DD(v) { this.BB(3); this.RD(v); }               /* always the explicit form */
  BT(v) { if (!v) this.B(1); else { this.B(0); this.BD(v); } }
  BE(v) { if (!v || (v[0] === 0 && v[1] === 0 && v[2] === 1)) this.B(1); else { this.B(0); this.BD(v[0]); this.BD(v[1]); this.BD(v[2]); } }
  P3BD(p) { this.BD(p[0]); this.BD(p[1]); this.BD(p[2] || 0); }
  P2RD(p) { this.RD(p[0]); this.RD(p[1]); }
  CMC(v) { this.BS(v); }
  TV(s) { s = String(s == null ? '' : s); this.BS(s.length); for (let i = 0; i < s.length; i++) this.bits(8, s.charCodeAt(i) & 0xff); }
  H(code, value) {
    const bytes = [];
    let v = value;
    while (v > 0) { bytes.unshift(v & 0xff); v = Math.floor(v / 256); }
    this.bits(8, ((code & 0xf) << 4) | (bytes.length & 0xf));
    this.byteArr(bytes);
  }
  MC(v) {
    const neg = v < 0;
    let x = Math.abs(v);
    const out = [];
    do { out.push(x & 0x7f); x = Math.floor(x / 128); } while (x > 0);
    /* bit 6 of the final byte is the sign, so the last group only carries six
       value bits — if it wants the seventh, it needs a byte of its own. */
    if (out[out.length - 1] & 0x40) out.push(0);
    if (neg) out[out.length - 1] |= 0x40;
    for (let i = 0; i < out.length; i++) this.bits(8, out[i] | (i < out.length - 1 ? 0x80 : 0));
  }
  MS(v) {
    const words = [];
    let x = v;
    do { words.push(x & 0x7fff); x = Math.floor(x / 32768); } while (x > 0);
    for (let i = 0; i < words.length; i++) this.RS(words[i] | (i < words.length - 1 ? 0x8000 : 0));
  }
}

const DWG_VERSIONS = {
  AC1012: 'R13', AC1014: 'R14', AC1015: 'R2000',
  AC1018: 'R2004', AC1021: 'R2007', AC1024: 'R2010',
  AC1027: 'R2013', AC1032: 'R2018',
};
/* object type numbers we can turn into geometry */
const DWG_T = {
  TEXT: 1, ATTRIB: 2, ATTDEF: 3, BLOCK: 4, ENDBLK: 5, SEQEND: 6, INSERT: 7, MINSERT: 8,
  VERTEX_2D: 10, VERTEX_3D: 11, VERTEX_MESH: 12, VERTEX_PFACE: 13, VERTEX_PFACE_FACE: 14,
  POLYLINE_2D: 15, POLYLINE_3D: 16, ARC: 17, CIRCLE: 18, LINE: 19,
  DIMENSION_ORDINATE: 20, DIMENSION_LINEAR: 21, DIMENSION_ALIGNED: 22,
  DIMENSION_ANG3PT: 23, DIMENSION_ANG2LN: 24, DIMENSION_RADIUS: 25, DIMENSION_DIAMETER: 26,
  POINT: 27, FACE3D: 28, POLYLINE_PFACE: 29, POLYLINE_MESH: 30,
  SOLID: 31, TRACE: 32, SHAPE: 33, VIEWPORT: 34, ELLIPSE: 35, SPLINE: 36,
  REGION: 37, SOLID3D: 38, BODY: 39, RAY: 40, XLINE: 41,
  MTEXT: 44, LEADER: 45, TOLERANCE: 46, MLINE: 47,
  LAYER: 51, LWPOLYLINE: 77, HATCH: 78,
};
/* Entity type numbers are not a contiguous range — LWPOLYLINE is 77 and
   HATCH is 78, well past the table objects — so membership has to be
   explicit rather than a threshold. */
const DWG_ENT_TYPES = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  37, 38, 39, 40, 41, 44, 45, 46, 47, 77, 78,
]);

function dwgParse(arrayBuf) {
  const buf = new Uint8Array(arrayBuf);
  const R = { ok: false, version: null, entities: [], layers: {}, skipped: 0, notes: [] };
  if (buf.length < 128) { R.error = 'File is too small to be a DWG.'; return R; }
  const ver = String.fromCharCode(...buf.subarray(0, 6));
  R.version = ver; R.release = DWG_VERSIONS[ver] || null;
  if (!/^AC10\d\d$/.test(ver)) { R.error = 'Not a DWG file (no AC10xx signature).'; return R; }
  if (!['AC1012', 'AC1014', 'AC1015'].includes(ver)) {
    R.error = `${R.release || ver} files use the compressed section container, which this reader does not decode. ` +
      `Save as DXF, or convert with the free ODA File Converter.`;
    return R;
  }
  const dv = new DataView(arrayBuf);
  const nRec = dv.getUint32(0x15, true);
  if (nRec < 1 || nRec > 32) { R.error = 'Section locator table looks corrupt.'; return R; }
  const secs = {};
  let at = 0x19;
  for (let i = 0; i < nRec; i++) {
    const id = buf[at], addr = dv.getUint32(at + 1, true), size = dv.getUint32(at + 5, true);
    at += 9;
    if (addr + size > buf.length) { R.error = 'Section ' + id + ' points past the end of the file.'; return R; }
    secs[id] = { addr, size };
  }
  /* validate the end-of-header sentinel — cheap proof we read the layout right */
  const sentAt = at + 2;
  let sentinelOk = true;
  for (let i = 0; i < 16; i++) if (buf[sentAt + i] !== DWG_SENTINEL_HDR[i]) { sentinelOk = false; break; }
  if (!sentinelOk) R.notes.push('Header sentinel did not match; continuing cautiously.');

  const map = secs[2];
  if (!map) { R.error = 'No object map in this file.'; return R; }
  const objs = dwgObjectMap(buf, map.addr, map.size, R);
  if (!objs.length) { R.error = 'The object map decoded to nothing usable.'; return R; }
  R.objectCount = objs.length;

  for (const { handle, loc } of objs) {
    try {
      const o = dwgReadObject(buf, loc, ver);
      if (!o) { R.skipped++; continue; }
      o.handle = handle;
      if (o.kind === 'layer') R.layers[o.name] = o;
      else if (o.ent) R.entities.push(o.ent);
      else R.skipped++;
    } catch (e) { R.skipped++; }
  }
  R.ok = R.entities.length > 0;
  if (!R.ok) R.error = `Decoded ${objs.length} objects but found no drawable geometry (${R.skipped} skipped).`;
  return R;
}
/** object map: pages of (handle-delta, location-delta) pairs, big-endian page size */
function dwgObjectMap(buf, addr, size, R) {
  const out = [];
  let at = addr;
  const end = addr + size;
  let guard = 0;
  while (at < end && guard++ < 4096) {
    if (at + 2 > end) break;
    const pageSize = (buf[at] << 8) | buf[at + 1];         /* big-endian */
    if (pageSize <= 2) break;
    if (at + pageSize > end) { R.notes.push('Object map page runs past the section.'); break; }
    const want = (buf[at + pageSize - 2] << 8) | buf[at + pageSize - 1];
    const got = dwgCrc(buf, at, pageSize - 2, pageSize & 0xffff);
    if (want !== got) R.notes.push(`Object map page CRC mismatch at ${at} (want ${want.toString(16)}, got ${got.toString(16)}).`);
    const br = new BitReader(buf, (at + 2) * 8);
    const stop = (at + pageSize - 2) * 8;
    let h = 0, l = 0;
    while (br.p < stop) {
      const dh = br.MC(), dl = br.MC();
      h += dh; l += dl;
      if (l < 0 || l >= buf.length) { R.notes.push('Object location out of range.'); break; }
      out.push({ handle: h, loc: l });
    }
    at += pageSize;
  }
  return out;
}
/** read one object at a byte offset; returns {kind, ent} or null */
function dwgReadObject(buf, loc, ver) {
  const br = new BitReader(buf, loc * 8);
  const objSize = br.MS();
  if (objSize < 2 || loc + objSize > buf.length) return null;
  const objStartBit = br.p;
  const objEndBit = objStartBit + objSize * 8;     /* size excludes the size field itself */
  const type = br.BS();
  const R2000 = ver === 'AC1015';
  let bitsize = null;
  if (R2000) bitsize = br.RL();
  const handle = br.H();
  /* extended entity data */
  let guard = 0;
  while (guard++ < 64) {
    const n = br.BS();
    if (!n) break;
    if (n < 0 || br.p + n * 8 > objEndBit) return null;
    br.H(); br.bytes(n);
  }
  const isEntity = DWG_ENT_TYPES.has(type);
  const ctx = { br, type, objStartBit, objEndBit, bitsize, R2000, handle };
  if (type === DWG_T.LAYER) return dwgReadLayer(ctx);
  if (!isEntity) return null;

  /* common entity header */
  if (br.B()) { const n = br.RL(); if (br.p + n * 8 > objEndBit) return null; br.bytes(n); }
  const entmode = br.BB();
  const nReactors = br.BL();
  if (nReactors < 0 || nReactors > 4096) return null;
  if (R2000) br.B();                                    /* no-links */
  const color = br.CMC();
  br.BD();                                              /* linetype scale */
  let ltFlags = 0, psFlags = 0;
  if (R2000) { ltFlags = br.BB(); psFlags = br.BB(); }
  const invis = br.BS();
  if (R2000) br.RC();                                   /* lineweight */

  const ent = dwgEntity(ctx, type);
  if (!ent) return null;
  if (invis === 1) return null;                          /* invisible */
  ent.color = (color > 0 && color < 256) ? aci(color) : null;
  ent._layerRef = dwgLayerHandle(ctx, entmode, nReactors);
  return { kind: 'entity', ent };
}
/** best-effort: jump to the handle stream and take the layer reference */
function dwgLayerHandle(ctx, entmode, nReactors) {
  const { br, objStartBit, objEndBit, bitsize, R2000 } = ctx;
  if (!R2000 || bitsize == null) return null;
  const hpos = objStartBit + bitsize;
  if (hpos <= objStartBit || hpos >= objEndBit) return null;
  const save = br.p;
  try {
    br.seek(hpos);
    if (entmode === 0) br.H();                          /* owner */
    for (let i = 0; i < nReactors; i++) br.H();
    br.H();                                             /* xdicobj */
    const prev = br.H(), next = br.H();                 /* prev/next entity links */
    const layer = br.H();
    br.seek(save);
    return layer && layer.value ? layer.value : null;
  } catch (e) { br.seek(save); return null; }
}
function dwgReadLayer(ctx) {
  const { br } = ctx;
  try {
    const nReactors = br.BL();
    if (nReactors < 0 || nReactors > 4096) return null;
    const name = br.TV();
    if (!name) return null;
    br.B();                                             /* 64 flag */
    br.BS();                                            /* xrefindex */
    br.B();                                             /* xdep */
    const flags = br.BS();
    const color = br.CMC();
    return {
      kind: 'layer', name,
      on: color >= 0, frozen: !!(flags & 1), locked: !!(flags & 4),
      color: aci(Math.abs(color) || 7),
    };
  } catch (e) { return null; }
}
function dwgEntity(ctx, type) {
  const { br, R2000 } = ctx;
  switch (type) {
    case DWG_T.LINE: {
      if (!R2000) { const a = br.P3BD(), b = br.P3BD(); return { t: 'line', a: a.slice(0, 2), b: b.slice(0, 2) }; }
      const zflag = br.B();
      const ax = br.RD(), bx = br.DD(ax);
      const ay = br.RD(), by = br.DD(ay);
      if (!zflag) { const az = br.RD(); br.DD(az); }
      return { t: 'line', a: [ax, ay], b: [bx, by] };
    }
    case DWG_T.CIRCLE: {
      const c = br.P3BD(), r = br.BD();
      return { t: 'circle', c: c.slice(0, 2), r };
    }
    case DWG_T.ARC: {
      const c = br.P3BD(), r = br.BD();
      br.BT(); br.BE();
      const a0 = br.BD(), a1 = br.BD();
      return { t: 'arc', c: c.slice(0, 2), r, a0, a1 };
    }
    case DWG_T.POINT: {
      const p = br.P3BD();
      return { t: 'point', p: p.slice(0, 2) };
    }
    case DWG_T.ELLIPSE: {
      const c = br.P3BD(), maj = br.P3BD();
      br.P3BD();
      const ratio = br.BD(), a0 = br.BD(), a1 = br.BD();
      const rx = hyp(maj[0], maj[1]);
      if (!(rx > 0)) return null;
      return { t: 'ellipse', c: c.slice(0, 2), rx, ry: rx * ratio, rot: Math.atan2(maj[1], maj[0]), a0, a1 };
    }
    case DWG_T.LWPOLYLINE: {
      const flags = br.BS();
      if (flags & 4) br.BD();
      if (flags & 8) br.BD();
      if (flags & 2) br.BD();
      if (flags & 1) br.P3BD();
      const n = br.BL();
      if (n < 2 || n > 200000) return null;
      const nb = (flags & 16) ? br.BL() : 0;
      const nw = (flags & 32) ? br.BL() : 0;
      const pts = [br.P2RD()];
      for (let i = 1; i < n; i++) pts.push(br.P2DD(pts[i - 1]));
      return { t: 'pline', pts, closed: !!(flags & 512) };
    }
    case DWG_T.TEXT: {
      const df = R2000 ? br.RC() : 0;
      if (R2000) {
        if (!(df & 1)) br.RD();
        const ip = br.P2RD();
        let ap = ip;
        if (!(df & 2)) ap = br.P2DD(ip);
        br.BE(); br.BT();
        if (!(df & 4)) br.BD();
        const rotA = (df & 8) ? 0 : br.BD();
        const h = br.BD();
        if (!(df & 0x10)) br.BD();
        const s = br.TV();
        if (!s) return null;
        const ha = (df & 0x40) ? 0 : ((df & 0x20) ? 0 : (br.BS(), br.BS()));
        return { t: 'text', p: ha ? ap : ip, s, h: h || 2.5, rot: rotA, anchor: ha === 1 ? 'c' : ha === 2 ? 'r' : 'l' };
      }
      br.BD();
      const ip = br.P2RD();
      br.P2RD(); br.BE(); br.BT();
      br.BD(); const rotA = br.BD(); const h = br.BD(); br.BD();
      const s = br.TV();
      return s ? { t: 'text', p: ip, s, h: h || 2.5, rot: rotA, anchor: 'l' } : null;
    }
    case DWG_T.MTEXT: {
      const ip = br.P3BD();
      br.P3BD(); br.P3BD();
      const w = br.BD();
      const h = br.BD();
      br.BS(); br.BS(); br.BD(); br.BD();
      const s = br.TV();
      if (!s) return null;
      return { t: 'text', p: ip.slice(0, 2), s: mtextPlain(s).split('\n')[0], h: h || 2.5, rot: 0, anchor: 'l' };
    }
    case DWG_T.SOLID: case DWG_T.TRACE: case DWG_T.FACE3D: {
      br.BT();
      const z = br.BD();
      const p = [br.P2RD(), br.P2RD(), br.P2RD(), br.P2RD()];
      return { t: 'pline', pts: [p[0], p[1], p[3], p[2]], closed: true };
    }
    case DWG_T.SPLINE: {
      const scenario = br.BL();
      const degree = br.BL();
      if (scenario === 2) {
        br.BD(); br.P3BD(); br.P3BD(); br.P3BD(); br.BD(); br.BD(); br.BD();
        const nfit = br.BL();
        if (nfit < 2 || nfit > 100000) return null;
        const fits = [];
        for (let i = 0; i < nfit; i++) fits.push(br.P3BD().slice(0, 2));
        return { t: 'spline', pts: fitSpline(fits, false), fit: fits, deg: degree };
      }
      if (scenario === 1) {
        const rational = br.B(), closed = br.B(); br.B();
        br.BD(); br.BD();
        const nk = br.BL(), nc = br.BL();
        const weighted = br.B();
        if (nc < 2 || nc > 100000 || nk < 0 || nk > 200000) return null;
        const knots = [];
        for (let i = 0; i < nk; i++) knots.push(br.BD());
        const cps = [], ws = [];
        for (let i = 0; i < nc; i++) { cps.push(br.P3BD().slice(0, 2)); if (weighted) ws.push(br.BD()); }
        return { t: 'spline', pts: nurbs(cps, degree, knots, weighted ? ws : null, !!closed), deg: degree };
      }
      return null;
    }
    default: return null;
  }
}

async function importDWG(file) {
  const buf = await file.arrayBuffer();
  let res;
  try { res = dwgParse(buf); }
  catch (e) { console.error(e); return dwgFail('That DWG could not be decoded: ' + e.message); }
  if (!res.ok) return dwgFail(res.error || 'Nothing readable in that DWG.', res);
  begin();
  DOC.ents.clear(); SEL.clear(); UID = 1; DOC.blocks = {};
  DOC.layers = [newLayer('0', '#d7dee8')];
  DOC.cur = '0';
  const byHandle = {};
  for (const nm in res.layers) {
    const L = res.layers[nm];
    if (hasLayer(nm)) continue;
    const l = newLayer(nm, L.color);
    l.on = L.on && !L.frozen; l.lock = L.locked;
    DOC.layers.push(l);
    byHandle[L.handle] = nm;
  }
  for (const e of res.entities) {
    const nm = e._layerRef && byHandle[e._layerRef];
    delete e._layerRef;
    e.layer = nm && hasLayer(nm) ? nm : '0';
    addEnt(e);
  }
  commit('Imported ' + res.entities.length + ' entities from DWG');
  idxInvalidate(); fit(); syncUI();
  const warn = res.skipped ? ` · ${res.skipped} objects skipped` : '';
  toast(`DWG (${res.release}) — ${res.entities.length} entities${warn}`);
  if (res.skipped > res.entities.length) {
    modal(`<h3>DWG opened with gaps</h3>
      <p>${res.entities.length} entities came through but ${res.skipped} objects could not be decoded.
      DWG support here is experimental and written from the published format notes rather than tested against
      AutoCAD. If the drawing looks wrong, open the original and export a DXF instead — that path is
      properly verified.</p>`, null);
    $('#mo').style.display = 'none'; $('#mc').textContent = 'Understood';
  }
}
function dwgFail(msg, res) {
  modal(`<h3>Could not open that DWG</h3><p>${esc(msg)}</p>
    <p>DWG is a closed binary format. The dependable route is to open the file in whatever produced it and
    export DXF, which Orthograph reads and writes properly. The free
    <b>ODA File Converter</b> will also batch-convert DWG to DXF.</p>`, null);
  $('#mo').style.display = 'none'; $('#mc').textContent = 'Close';
  if (res && res.notes && res.notes.length) console.warn('DWG notes:', res.notes);
}


/* ============================================================
   DWG writer — R2000 (AC1015). EXPERIMENTAL.
   ------------------------------------------------------------
   The bit-level encoding, object map, section locator and CRCs
   here are round-trip verified against the reader above, which
   proves the encoding layer is self-consistent. It has NOT been
   verified against AutoCAD, because no DWG tooling or sample
   file was available to check against. DXF is the export path
   that is actually proven; this exists so the format work has a
   foundation, and the UI says so before it writes anything.
   ============================================================ */
const SENT = {
  hdrEnd: [0x95, 0xA0, 0x4E, 0x28, 0x99, 0x82, 0x1A, 0xE5, 0x5F, 0x1D, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
  varsA: [0xCF, 0x7B, 0x1F, 0x23, 0xFD, 0xDE, 0x38, 0xA9, 0x5F, 0x7C, 0x68, 0xB8, 0x4E, 0x6D, 0x33, 0x5A],
  varsB: [0x30, 0x84, 0xE0, 0xDC, 0x02, 0x21, 0xC7, 0x56, 0xA0, 0x83, 0x97, 0x47, 0xB1, 0x92, 0xCC, 0xA0],
  clsA: [0x8D, 0xA1, 0xC4, 0xB8, 0xC4, 0xA9, 0xF8, 0xC5, 0xC0, 0xDC, 0xF4, 0x5F, 0xE7, 0xCF, 0xB6, 0x8A],
  clsB: [0x72, 0x5E, 0x3B, 0x47, 0x3B, 0x56, 0x07, 0x3A, 0x3F, 0x23, 0x0B, 0xA0, 0x83, 0x30, 0x49, 0x75],
  hdr2: [0xD4, 0x7B, 0x21, 0xCE, 0x28, 0x93, 0x9F, 0xBF, 0x53, 0x24, 0x40, 0x09, 0x12, 0x3C, 0xAA, 0x01],
};
/** entity type numbers we emit */
const DWG_OUT = { TEXT: 1, ARC: 17, CIRCLE: 18, LINE: 19, POINT: 27, ELLIPSE: 35, LWPOLYLINE: 77, LAYER: 51 };

function dwgEntityBits(e, handle, layerHandle) {
  const w = new BitWriter();
  const type = ({ line: DWG_OUT.LINE, circle: DWG_OUT.CIRCLE, arc: DWG_OUT.ARC, point: DWG_OUT.POINT,
    ellipse: DWG_OUT.ELLIPSE, pline: DWG_OUT.LWPOLYLINE, text: DWG_OUT.TEXT })[e.t];
  if (!type) return null;
  /* body first so we know its bit length for the size field */
  const body = new BitWriter();
  body.B(0);                                       /* no graphic image */
  body.BB(2);                                      /* entmode: no owner handle follows */
  body.BL(0);                                      /* reactors */
  body.B(1);                                       /* no-links */
  body.CMC(e.color ? toAci(e.color) : 256);
  body.BD(1);                                      /* linetype scale */
  body.BB(e.lt && e.lt !== 'solid' ? 3 : 0);
  body.BB(3);                                      /* plotstyle: bylayer */
  body.BS(0);                                      /* invisibility */
  body.RC(0);                                      /* lineweight: bylayer */
  switch (e.t) {
    case 'line':
      body.B(1);                                   /* z values are zero */
      body.RD(e.a[0]); body.DD(e.b[0]);
      body.RD(e.a[1]); body.DD(e.b[1]);
      body.BT(0); body.BE(null);
      break;
    case 'circle':
      body.P3BD([e.c[0], e.c[1], 0]); body.BD(e.r); body.BT(0); body.BE(null);
      break;
    case 'arc':
      body.P3BD([e.c[0], e.c[1], 0]); body.BD(e.r); body.BT(0); body.BE(null);
      body.BD(e.a0); body.BD(e.a1);
      break;
    case 'point':
      body.P3BD([e.p[0], e.p[1], 0]); body.BT(0); body.BE(null); body.BD(0);
      break;
    case 'ellipse':
      body.P3BD([e.c[0], e.c[1], 0]);
      body.P3BD([Math.cos(e.rot || 0) * e.rx, Math.sin(e.rot || 0) * e.rx, 0]);
      body.P3BD([0, 0, 1]);
      body.BD(e.ry / e.rx); body.BD(e.a0 ?? 0); body.BD(e.a1 ?? TAU);
      break;
    case 'pline': {
      const flags = (e.closed ? 512 : 0);
      body.BS(flags);
      body.BL(e.pts.length);
      body.P2RD(e.pts[0]);
      for (let i = 1; i < e.pts.length; i++) { body.DD(e.pts[i][0]); body.DD(e.pts[i][1]); }
      break;
    }
    case 'text': {
      body.RC(0x02 | 0x04 | 0x10 | 0x20);          /* skip oblique, width, generation */
      body.RD(0);                                  /* elevation */
      body.P2RD(e.p);
      body.BE(null); body.BT(0);
      body.BD(e.rot || 0);
      body.BD(e.h);
      body.TV(e.s);
      body.BS(e.anchor === 'c' ? 1 : e.anchor === 'r' ? 2 : 0);
      body.BS(0);
      break;
    }
  }
  const bodyBits = body.bitLen;
  const bodyBytes = body.flush();
  /* header: type, bitsize, handle, empty EED */
  w.BS(type);
  const sizePos = w.bitLen;
  w.RL(0);                                         /* patched below */
  w.H(0, handle);
  w.BS(0);                                         /* no extended data */
  const headBits = w.bitLen;
  /* splice the body in bit-exactly */
  const br = new BitReader(bodyBytes, 0);
  for (let i = 0; i < bodyBits; i++) w.bit(br.bit());
  const dataBits = w.bitLen;
  /* handle stream: layer reference */
  w.H(5, layerHandle || 0);
  const all = w.flush();
  /* patch the bitsize field (counted from the start of the object) */
  patchBits(all, sizePos + 2, dataBits);
  return { bytes: all, type };
}
/** rewrite a 32-bit little-endian value that starts at an arbitrary bit offset */
function patchBits(buf, bitPos, value) {
  const t = new Uint8Array(4);
  new DataView(t.buffer).setUint32(0, value >>> 0, true);
  for (let i = 0; i < 32; i++) {
    const bit = (t[i >> 3] >> (7 - (i & 7))) & 1;
    const p = bitPos + i;
    const mask = 1 << (7 - (p & 7));
    if (bit) buf[p >> 3] |= mask; else buf[p >> 3] &= ~mask;
  }
}
function dwgLayerBits(l, handle) {
  const w = new BitWriter();
  const body = new BitWriter();
  body.BL(0);                                      /* reactors */
  body.TV(l.name);
  body.B(0);
  body.BS(0);
  body.B(0);
  body.BS((l.lock ? 4 : 0));
  body.CMC(l.on ? toAci(l.color) : -toAci(l.color));
  const bodyBits = body.bitLen, bodyBytes = body.flush();
  w.BS(DWG_OUT.LAYER);
  const sizePos = w.bitLen;
  w.RL(0);
  w.H(0, handle);
  w.BS(0);
  const br = new BitReader(bodyBytes, 0);
  for (let i = 0; i < bodyBits; i++) w.bit(br.bit());
  const dataBits = w.bitLen;
  const all = w.flush();
  patchBits(all, sizePos + 2, dataBits);
  return { bytes: all };
}
function u8concat(list) {
  let n = 0; for (const a of list) n += a.length;
  const out = new Uint8Array(n);
  let at = 0; for (const a of list) { out.set(a, at); at += a.length; }
  return out;
}
function exportDWG() {
  const objects = [];                              /* {handle, bytes} */
  let handle = 0x30;
  const layerHandles = {};
  for (const l of DOC.layers) {
    const h = handle++;
    layerHandles[l.name] = h;
    objects.push({ handle: h, body: dwgLayerBits(l, h).bytes });
  }
  const flat = [];
  for (const e of DOC.ents.values()) {
    if (GEOM[e.t] || e.t === 'dim') flat.push(...flattenToPrimitives(e));
    else flat.push(e);
  }
  for (const e of flat) {
    const h = handle++;
    const enc = dwgEntityBits(e, h, layerHandles[e.layer] || layerHandles['0']);
    if (enc) objects.push({ handle: h, body: enc.bytes });
  }
  if (!objects.length) throw new Error('nothing to write');

  /* ---- lay the objects out, each prefixed with its MS size and followed by a CRC ---- */
  const HEADER_LEN = 0x100;
  const chunks = [];
  const placed = [];
  let at = HEADER_LEN;
  for (const o of objects) {
    const ms = new BitWriter(); ms.MS(o.body.length + 2);
    const sizeBytes = ms.flush();
    const rec = u8concat([sizeBytes, o.body]);
    const crc = dwgCrc(rec, 0, rec.length, 0xc0c1);
    const full = u8concat([rec, Uint8Array.from([crc & 0xff, (crc >> 8) & 0xff])]);
    placed.push({ handle: o.handle, loc: at });
    chunks.push(full);
    at += full.length;
  }
  const objBlob = u8concat(chunks);
  const objStart = HEADER_LEN;
  const objEnd = objStart + objBlob.length;

  /* ---- object map: pages of MC handle/location deltas ---- */
  const pages = [];
  let lastH = 0, lastL = 0, i = 0;
  while (i < placed.length) {
    const bw = new BitWriter();
    let count = 0;
    while (i < placed.length) {
      const probe = new BitWriter();
      probe.MC(placed[i].handle - lastH); probe.MC(placed[i].loc - lastL);
      if (bw.buf.length + probe.flush().length + 2 > 2030) break;
      bw.MC(placed[i].handle - lastH); bw.MC(placed[i].loc - lastL);
      lastH = placed[i].handle; lastL = placed[i].loc;
      i++; count++;
    }
    if (!count) break;
    const payload = bw.flush();
    const size = payload.length + 4;               /* 2 size + payload + 2 crc */
    const page = new Uint8Array(size);
    page[0] = (size >> 8) & 0xff; page[1] = size & 0xff;
    page.set(payload, 2);
    const crc = dwgCrc(page, 0, size - 2, size & 0xffff);
    page[size - 2] = (crc >> 8) & 0xff; page[size - 1] = crc & 0xff;
    pages.push(page);
  }
  pages.push(Uint8Array.from([0x00, 0x02]));       /* terminator page */
  const mapBlob = u8concat(pages);
  const mapStart = objEnd;

  /* ---- header variables and classes sections ---- */
  const vars = new BitWriter();
  vars.BD(0); vars.BD(0); vars.BD(0); vars.BD(0);  /* unknown doubles */
  vars.TV(''); vars.TV(''); vars.TV(''); vars.TV('');
  vars.BL(0); vars.BL(0);
  vars.BS(0);
  vars.BD(1);                                       /* $LTSCALE */
  vars.BD(DOC.textH || 2.5);                        /* $TEXTSIZE */
  vars.BS({ mm: 4, cm: 5, m: 6, in: 1, ft: 2 }[DOC.units] || 4);   /* $INSUNITS */
  const varsBody = vars.flush();
  const varsSec = wrapSentinel(SENT.varsA, varsBody, SENT.varsB);
  const varsStart = mapStart + mapBlob.length;

  const clsBody = new Uint8Array(0);
  const clsSec = wrapSentinel(SENT.clsA, clsBody, SENT.clsB);
  const clsStart = varsStart + varsSec.length;

  const hdr2 = u8concat([Uint8Array.from(SENT.hdr2), new Uint8Array(16)]);
  const hdr2Start = clsStart + clsSec.length;
  const measStart = hdr2Start + hdr2.length;
  const meas = Uint8Array.from([0x00, 0x00, 0x00, 0x00]);

  /* ---- file header ---- */
  const head = new Uint8Array(HEADER_LEN);
  const dv = new DataView(head.buffer);
  for (let k = 0; k < 6; k++) head[k] = 'AC1015'.charCodeAt(k);
  head[0x0B] = 0; head[0x0C] = 0x00;
  dv.setUint32(0x0D, 0, true);                     /* no preview */
  head[0x11] = 0x1B; head[0x12] = 0;
  dv.setUint16(0x13, 30, true);                    /* codepage ANSI_1252 */
  const recs = [
    [0, varsStart, varsSec.length],
    [1, clsStart, clsSec.length],
    [2, mapStart, mapBlob.length],
    [3, hdr2Start, hdr2.length],
    [4, measStart, meas.length],
  ];
  dv.setUint32(0x15, recs.length, true);
  let p = 0x19;
  for (const [id, addr, size] of recs) {
    head[p] = id; dv.setUint32(p + 1, addr, true); dv.setUint32(p + 5, size, true); p += 9;
  }
  const hcrc = dwgCrc(head, 0, p, 0xc0c1);
  dv.setUint16(p, hcrc, true); p += 2;
  head.set(SENT.hdrEnd, p);

  return u8concat([head, objBlob, mapBlob, varsSec, clsSec, hdr2, meas]).buffer;
}
function wrapSentinel(a, body, b) {
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, body.length, true);
  const crcBuf = u8concat([size, body]);
  const crc = dwgCrc(crcBuf, 0, crcBuf.length, 0xc0c1);
  return u8concat([Uint8Array.from(a), size, body, Uint8Array.from([crc & 0xff, (crc >> 8) & 0xff]), Uint8Array.from(b)]);
}
function doSaveDWG() {
  modal(`<h3>Export DWG — experimental</h3>
    <p>DWG is a closed binary format. This writer follows the published specification and round-trips
    cleanly through Orthograph's own reader, but it has <b>not</b> been verified against AutoCAD, so the
    file may be rejected there.</p>
    <p>For anything that matters, use <b>DXF R2000</b> — that path is checked against a reference
    implementation and imports cleanly.</p>`, () => {
    try {
      const buf = exportDWG();
      download('drawing.dwg', new Blob([buf], { type: 'application/acad' }));
      toast('Wrote drawing.dwg — experimental, check it opens before relying on it');
    } catch (e) { console.error(e); toast('DWG export failed: ' + e.message); }
  });
  $('#mo').textContent = 'Write it anyway';
}
