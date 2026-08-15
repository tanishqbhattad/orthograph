/* ============================================================
   ORTHOGRAPH — 10 DXF in and out
   Writer targets AC1015 (R2000) so ellipses, splines and real
   DIMENSION entities survive the round trip. Reader accepts
   R12 through R2018.
   ============================================================ */

/* ---------------- reader ---------------- */
function dxfScan(txt) {
  const raw = txt.split(/\r\n|\r|\n/);
  const out = [];
  for (let i = 0; i + 1 < raw.length; i++) {
    const code = parseInt(raw[i].trim(), 10);
    if (isNaN(code)) continue;
    out.push([code, raw[i + 1]]);
    i++;
  }
  return out;
}
/** collect one entity's group codes; points assembled per 10/11/12… family */
function readOne(g, i) {
  const type = g[i][1];
  const o = { type, g: Object.create(null), P: Object.create(null) };
  let j = i + 1;
  for (; j < g.length && g[j][0] !== 0; j++) {
    const c = g[j][0], v = g[j][1];
    if (c >= 10 && c <= 39) {
      const f = c % 10, ax = Math.floor(c / 10) - 1;
      const arr = o.P[f] || (o.P[f] = []);
      if (ax === 0) arr.push([parseFloat(v), 0, 0]);
      else if (arr.length) arr[arr.length - 1][ax] = parseFloat(v);
      continue;
    }
    (o.g[c] || (o.g[c] = [])).push(v);
  }
  return { o, next: j };
}
const G = (o, c, d) => (o.g[c] !== undefined ? o.g[c][0] : d);
const GN = (o, c, d) => (o.g[c] !== undefined ? parseFloat(o.g[c][0]) : d);
const GI = (o, c, d) => (o.g[c] !== undefined ? parseInt(o.g[c][0]) : d);
const GA = (o, c) => (o.g[c] || []).map(parseFloat);
const PT = (o, f, i) => (o.P[f] && o.P[f][i || 0]) ? o.P[f][i || 0].slice(0, 2) : null;

function dxfParse(txt) {
  const g = dxfScan(txt);
  const res = { layers: {}, ents: [], blocks: {}, header: {}, styles: {} };
  let i = 0;
  while (i < g.length) {
    const [c, v] = g[i];
    if (c === 0 && v === 'SECTION') {
      const name = g[i + 1] && g[i + 1][0] === 2 ? g[i + 1][1] : '';
      let j = i + 2, depth = 0;
      while (j < g.length && !(g[j][0] === 0 && g[j][1] === 'ENDSEC')) j++;
      const body = g.slice(i + 2, j);
      if (name === 'TABLES') readTables(body, res);
      else if (name === 'ENTITIES') res.ents = readEnts(body);
      else if (name === 'BLOCKS') readBlocks(body, res);
      else if (name === 'HEADER') readHeader(body, res);
      i = j + 1;
    } else i++;
  }
  return res;
}
function readHeader(b, res) {
  for (let i = 0; i < b.length; i++) if (b[i][0] === 9 && b[i + 1]) res.header[b[i][1]] = b[i + 1][1];
}
function readTables(b, res) {
  let i = 0;
  while (i < b.length) {
    if (b[i][0] === 0 && (b[i][1] === 'LAYER' || b[i][1] === 'STYLE')) {
      const { o, next } = readOne(b, i);
      if (o.type === 'LAYER') {
        res.layers[G(o, 2, '0')] = {
          name: G(o, 2, '0'), color: GI(o, 62, 7), lt: G(o, 6, 'CONTINUOUS'),
          flags: GI(o, 70, 0), lw: GI(o, 370, -1),
        };
      } else res.styles[G(o, 2, 'STANDARD')] = { h: GN(o, 40, 0) };
      i = next;
    } else i++;
  }
}
function readEnts(b) {
  const out = [];
  let i = 0;
  while (i < b.length) {
    if (b[i][0] !== 0) { i++; continue; }
    const { o, next } = readOne(b, i);
    out.push(o); i = next;
  }
  return out;
}
function readBlocks(b, res) {
  let i = 0;
  while (i < b.length) {
    if (b[i][0] === 0 && b[i][1] === 'BLOCK') {
      const { o, next } = readOne(b, i);
      const name = G(o, 2, '');
      const base = PT(o, 0) || [0, 0];
      let k = next;
      while (k < b.length && !(b[k][0] === 0 && b[k][1] === 'ENDBLK')) k++;
      res.blocks[name] = { base, body: readEnts(b.slice(next, k)) };
      i = k + 1;
    } else i++;
  }
}
function ltName(s) {
  if (!s) return null;
  s = String(s).toUpperCase();
  if (s.includes('DASHDOT')) return 'dashdot';
  if (s.includes('CENTER')) return 'center';
  if (s.includes('HIDDEN')) return 'hidden';
  if (s.includes('DASH') || s.includes('DOT')) return 'dashed';
  return null;
}
function mtextPlain(s) {
  return String(s || '')
    .replace(/\\P/g, '\n').replace(/\\~/g, ' ')
    .replace(/\\[LlOoKkXx]/g, '')
    .replace(/\\[FfHhWwQqAaCcTtp][^;\\]*;/g, '')
    .replace(/\\S([^;]*);/g, (m, a) => a.replace(/[\^#]/g, '/'))
    .replace(/[{}]/g, '')
    .replace(/\\\\/g, '\\')
    .trim();
}
function dxfToEnts(res, body, layerOverride, depth) {
  depth = depth || 0;
  const list = [];
  let pending = null;                              /* open POLYLINE collecting VERTEX */
  for (const o of body) {
    const lay = layerOverride && (G(o, 8, '0') === '0') ? layerOverride : G(o, 8, '0');
    const col = GI(o, 62, 256);
    const trueCol = o.g[420] ? int2hex(parseInt(o.g[420][0])) : null;
    const meta = {
      layer: lay,
      color: trueCol || ((col > 0 && col < 256) ? aci(col) : null),
      lt: ltName(G(o, 6, null)),
      lw: o.g[370] ? Math.max(GI(o, 370, 25), 0) / 100 : null,
    };
    let e = null;
    switch (o.type) {
      case 'LINE': { const a = PT(o, 0), b = PT(o, 1); if (a && b) e = { t: 'line', a, b }; break; }
      case 'LWPOLYLINE': {
        const pts = (o.P[0] || []).map(p => p.slice(0, 2));
        if (pts.length > 1) e = { t: 'pline', pts, closed: !!(GI(o, 70, 0) & 1) };
        break;
      }
      case 'POLYLINE':
        pending = { t: 'pline', pts: [], closed: !!(GI(o, 70, 0) & 1), ...meta };
        continue;
      case 'VERTEX': { const p = PT(o, 0); if (pending && p) pending.pts.push(p); continue; }
      case 'SEQEND':
        if (pending) { if (pending.pts.length > 1) list.push(pending); pending = null; }
        continue;
      case 'CIRCLE': { const c = PT(o, 0); if (c) e = { t: 'circle', c, r: GN(o, 40, 1) }; break; }
      case 'ARC': { const c = PT(o, 0); if (c) e = { t: 'arc', c, r: GN(o, 40, 1), a0: rad(GN(o, 50, 0)), a1: rad(GN(o, 51, 0)) }; break; }
      case 'POINT': { const p = PT(o, 0); if (p) e = { t: 'point', p }; break; }
      case 'ELLIPSE': {
        const c = PT(o, 0), maj = PT(o, 1);
        if (!c || !maj) break;
        const rx = hyp(maj[0], maj[1]);
        e = {
          t: 'ellipse', c, rx, ry: rx * GN(o, 40, 1), rot: Math.atan2(maj[1], maj[0]),
          a0: GN(o, 41, 0), a1: GN(o, 42, TAU),
        };
        break;
      }
      case 'SPLINE': {
        const cps = (o.P[0] || []).map(p => p.slice(0, 2));
        const fits = (o.P[1] || []).map(p => p.slice(0, 2));
        const knots = GA(o, 40);
        const degree = GI(o, 71, 3);
        const closed = !!(GI(o, 70, 0) & 1);
        const src = cps.length > 1 ? cps : fits;
        if (src.length > 1) e = { t: 'spline', pts: nurbs(src, degree, knots, GA(o, 41), closed), fit: fits.length ? fits : null, deg: degree, closed };
        break;
      }
      case 'TEXT': case 'MTEXT': {
        const p0 = PT(o, 0); if (!p0) break;
        const s = mtextPlain(G(o, 1, '') + (o.g[3] ? o.g[3].join('') : ''));
        if (!s) break;
        const h = GN(o, 40, 2.5);
        const lines = s.split('\n');
        const anchor = o.type === 'TEXT'
          ? (GI(o, 72, 0) === 1 ? 'c' : GI(o, 72, 0) === 2 ? 'r' : 'l')
          : ([1, 4, 7].includes(GI(o, 71, 1)) ? 'l' : [2, 5, 8].includes(GI(o, 71, 1)) ? 'c' : 'r');
        const p = (o.type === 'TEXT' && PT(o, 1) && GI(o, 72, 0)) ? PT(o, 1) : p0;
        const rotAng = o.type === 'MTEXT' && PT(o, 1)
          ? Math.atan2(PT(o, 1)[1], PT(o, 1)[0]) : rad(GN(o, 50, 0));
        for (let li = 0; li < lines.length; li++) {
          if (!lines[li].trim()) continue;
          list.push(Object.assign({
            t: 'text', p: [p[0] - Math.sin(rotAng) * (-li * h * 1.55), p[1] - Math.cos(rotAng) * (li * h * 1.55)],
            s: lines[li], h, rot: rotAng, anchor,
          }, meta));
        }
        continue;
      }
      case 'SOLID': case '3DFACE': {
        const p = [PT(o, 0), PT(o, 1), PT(o, 3), PT(o, 2)].filter(Boolean);
        if (p.length >= 3) e = { t: 'pline', pts: p, closed: true };
        break;
      }
      case 'HATCH': {
        const loops = hatchLoops(o);
        if (loops.length) e = { t: 'hatch', loops, solid: GI(o, 70, 0) === 1, pattern: 'line', sp: GN(o, 41, 1) * 100 || 100, hatchAng: GN(o, 52, 45) };
        break;
      }
      case 'INSERT': {
        const blk = res.blocks[G(o, 2, '')]; const pos = PT(o, 0);
        if (!blk || !pos || depth > 8) break;
        const sx = GN(o, 41, 1), sy = GN(o, 42, 1), a = rad(GN(o, 50, 0));
        const cols = GI(o, 70, 1) || 1, rows = GI(o, 71, 1) || 1;
        const cs = GN(o, 44, 0), rs = GN(o, 45, 0);
        const inner = dxfToEnts(res, blk.body, lay, depth + 1);
        for (let ci = 0; ci < cols; ci++) for (let ri = 0; ri < rows; ri++) {
          for (const ie of inner) {
            const n = clone(ie);
            xf(n, p => {
              const q0 = [(p[0] - blk.base[0]) * sx, (p[1] - blk.base[1]) * sy];
              const q = [q0[0] * Math.cos(a) - q0[1] * Math.sin(a), q0[0] * Math.sin(a) + q0[1] * Math.cos(a)];
              return [q[0] + pos[0] + ci * cs, q[1] + pos[1] + ri * rs];
            });
            list.push(n);
          }
        }
        continue;
      }
      case 'DIMENSION': {
        const rebuilt = dimFromDxf(o, meta);
        if (rebuilt) { list.push(rebuilt); continue; }
        const blk = res.blocks[G(o, 2, '')];
        if (!blk || depth > 8) break;
        for (const ie of dxfToEnts(res, blk.body, lay, depth + 1)) {
          if (blk.base[0] || blk.base[1]) xf(ie, p => [p[0] - blk.base[0], p[1] - blk.base[1]]);
          list.push(ie);
        }
        continue;
      }
      default: break;
    }
    if (e) list.push(Object.assign(e, meta));
  }
  if (pending && pending.pts.length > 1) list.push(pending);
  return list;
}
/** rebuild a live dimension entity from DXF definition points where we can */
function dimFromDxf(o, meta) {
  const type = GI(o, 70, 0) & 7;
  const dp = PT(o, 0), tp = PT(o, 1), p13 = PT(o, 3), p14 = PT(o, 4), p15 = PT(o, 5), p10 = PT(o, 0);
  const txt = G(o, 1, '');
  const over = (txt && txt !== '<>' && txt !== ' ') ? mtextPlain(txt) : null;
  if ((type === 0 || type === 1) && p13 && p14 && dp) {      /* rotated / aligned */
    const rotA = rad(GN(o, 50, 0));
    const k = type === 0 ? (Math.abs(Math.sin(rotA)) < 1e-6 ? 'horizontal' : Math.abs(Math.cos(rotA)) < 1e-6 ? 'vertical' : 'aligned') : 'aligned';
    const u = k === 'horizontal' ? [1, 0] : k === 'vertical' ? [0, 1] : norm(sub(p14, p13));
    const off = dot(sub(dp, p13), perp(u));
    return Object.assign({ t: 'dim', k, p1: p13, p2: p14, off, txt: over }, meta);
  }
  if ((type === 2 || type === 5) && p13 && p14 && p15) {      /* angular */
    return Object.assign({ t: 'dim', k: 'angular', p3: p15, p1: p13, p2: p14, off: 0, txt: over }, meta);
  }
  if (type === 3 && p15 && p10) return Object.assign({ t: 'dim', k: 'diameter', p1: mid(p15, p10), p2: p10, txt: over }, meta);
  if (type === 4 && p15 && p10) return Object.assign({ t: 'dim', k: 'radius', p1: p10, p2: p15, txt: over }, meta);
  return null;
}
function hatchLoops(o) {
  /* Only polyline boundary loops are reconstructed; edge loops fall back to
     their vertex list, which is enough to shade the region. */
  const pts = (o.P[0] || []).map(p => p.slice(0, 2));
  if (pts.length < 3) return [];
  const counts = (o.g[93] || []).map(Number);
  const loops = [];
  let at = 0;
  if (counts.length) {
    for (const n of counts) {
      if (n >= 3 && at + n <= pts.length) loops.push(pts.slice(at, at + n));
      at += n;
    }
  }
  return loops.length ? loops : [pts];
}
/** proper NURBS evaluation honouring the file's own knot vector */
function nurbs(cp, degree, knots, weights, closed) {
  const n = cp.length - 1;
  const p = clamp(degree || 3, 1, Math.max(1, n));
  if (!knots || knots.length !== n + p + 2) return bspline(cp, p, closed);
  const w = (weights && weights.length === cp.length) ? weights : cp.map(() => 1);
  const span = (u) => {
    if (u >= knots[n + 1]) return n;
    if (u <= knots[p]) return p;
    let lo = p, hi = n + 1, m = (lo + hi) >> 1;
    while (u < knots[m] || u >= knots[m + 1]) { if (u < knots[m]) hi = m; else lo = m; m = (lo + hi) >> 1; }
    return m;
  };
  const basis = (i, u) => {
    const N = [1];
    const left = [], right = [];
    for (let j = 1; j <= p; j++) {
      left[j] = u - knots[i + 1 - j]; right[j] = knots[i + j] - u;
      let saved = 0;
      for (let r = 0; r < j; r++) {
        const den = right[r + 1] + left[j - r];
        const tmp = Math.abs(den) < 1e-12 ? 0 : N[r] / den;
        N[r] = saved + right[r + 1] * tmp;
        saved = left[j - r] * tmp;
      }
      N[j] = saved;
    }
    return N;
  };
  const u0 = knots[p], u1 = knots[n + 1];
  const steps = clamp(cp.length * 14, 48, 600);
  const out = [];
  for (let s = 0; s <= steps; s++) {
    const u = u0 + (u1 - u0) * s / steps;
    const i = span(Math.min(u, u1 - 1e-12));
    const N = basis(i, Math.min(u, u1 - 1e-12));
    let x = 0, y = 0, ws = 0;
    for (let k = 0; k <= p; k++) {
      const idx = i - p + k;
      if (idx < 0 || idx > n) continue;
      const b = N[k] * w[idx];
      x += cp[idx][0] * b; y += cp[idx][1] * b; ws += b;
    }
    if (ws > 1e-12) out.push([x / ws, y / ws]);
  }
  return out.length > 1 ? out : cp.slice();
}

function importDXF(txt) {
  const res = dxfParse(txt);
  const ents = dxfToEnts(res, res.ents, null, 0);
  if (!ents.length) { toast('No drawable entities found in that DXF'); return; }
  begin();
  DOC.ents.clear(); SEL.clear(); UID = 1; DOC.blocks = {};
  DOC.layers = [newLayer('0', '#d7dee8')];
  DOC.cur = '0';
  const have = new Set(DOC.layers.map(l => l.name));
  for (const nm in res.layers) {
    if (have.has(nm)) continue;
    const L = res.layers[nm];
    const l = newLayer(nm, aci(Math.abs(L.color) || 7));
    l.on = L.color >= 0; l.lock = !!(L.flags & 4); l.lt = ltName(L.lt) || 'solid';
    if (L.lw > 0) l.lw = L.lw / 100;
    DOC.layers.push(l); have.add(nm);
  }
  for (const e of ents) {
    if (!have.has(e.layer)) { DOC.layers.push(newLayer(e.layer)); have.add(e.layer); }
    addEnt(e);
  }
  const ins = res.header['$INSUNITS'];
  const map = { '1': 'in', '2': 'ft', '4': 'mm', '5': 'cm', '6': 'm' };
  if (map[ins]) { DOC.units = map[ins]; const u = $('#unit'); if (u) u.value = DOC.units; }
  const th = parseFloat(res.header['$TEXTSIZE']);
  if (th > 0) DOC.textH = th;
  commit('Imported ' + ents.length + ' entities');
  idxInvalidate(); fit(); syncUI();
  toast('Opened — ' + ents.length + ' entities, ' + Object.keys(res.layers).length + ' layers');
}

/* ============================================================
   writer — AC1015 (R2000)
   ============================================================ */
function P(o, c, v) { o.push(String(c), String(v)); }
function pt(o, base, p, z) { P(o, base, num(p[0])); P(o, base + 10, num(p[1])); P(o, base + 20, num(z || 0)); }
function num(v) { return (Math.round(v * 1e9) / 1e9).toString(); }

function exportDXF() {
  const W = new DxfWriter();
  return W.build();
}
class DxfWriter {
  constructor() {
    this.h = 0x100;
    this.o = [];
    this.dimBlocks = [];
  }
  H() { return (this.h++).toString(16).toUpperCase(); }
  build() {
    const o = this.o;
    /* reserve well-known handles up front so references resolve */
    const K = this.K = {
      rootDict: this.H(), groupDict: this.H(), layoutDict: this.H(), mlineDict: this.H(),
      plotStyleDict: this.H(), plotStyleHolder: this.H(), appIdDict: this.H(),
      tVport: this.H(), tLtype: this.H(), tLayer: this.H(), tStyle: this.H(),
      tView: this.H(), tUcs: this.H(), tAppid: this.H(), tDimstyle: this.H(), tBlockRec: this.H(),
      msBlockRec: this.H(), psBlockRec: this.H(),
      msLayout: this.H(), psLayout: this.H(),
      msBlock: this.H(), msEndblk: this.H(), psBlock: this.H(), psEndblk: this.H(),
      styleStd: this.H(), dimStd: this.H(), appAcad: this.H(),
    };
    /* entity handles must be allocated before the header writes $HANDSEED,
       so build the body sections first and stitch the file at the end */
    const entities = this.entitiesSection();
    const blocks = this.blocksSection();
    const tables = this.tablesSection();
    const objects = this.objectsSection();

    const b = bboxAll([...DOC.ents.values()]) || [0, 0, 100, 100];
    P(o, 0, 'SECTION'); P(o, 2, 'HEADER');
    P(o, 9, '$ACADVER'); P(o, 1, 'AC1015');
    P(o, 9, '$HANDSEED'); P(o, 5, (this.h + 16).toString(16).toUpperCase());
    P(o, 9, '$INSUNITS'); P(o, 70, { mm: 4, cm: 5, m: 6, in: 1, ft: 2 }[DOC.units] || 4);
    P(o, 9, '$MEASUREMENT'); P(o, 70, DOC.units === 'in' || DOC.units === 'ft' ? 0 : 1);
    P(o, 9, '$EXTMIN'); pt(o, 10, [b[0], b[1]]);
    P(o, 9, '$EXTMAX'); pt(o, 10, [b[2], b[3]]);
    P(o, 9, '$LIMMIN'); P(o, 10, num(b[0])); P(o, 20, num(b[1]));
    P(o, 9, '$LIMMAX'); P(o, 10, num(b[2])); P(o, 20, num(b[3]));
    P(o, 9, '$CLAYER'); P(o, 8, DOC.cur);
    P(o, 9, '$TEXTSIZE'); P(o, 40, num(DOC.textH));
    P(o, 9, '$TEXTSTYLE'); P(o, 7, 'STANDARD');
    P(o, 9, '$DIMSTYLE'); P(o, 2, 'ORTHO');
    P(o, 9, '$DIMTXT'); P(o, 40, num(dimStyle().txt));
    P(o, 9, '$DIMASZ'); P(o, 40, num(dimStyle().arrow));
    P(o, 9, '$LTSCALE'); P(o, 40, 1);
    P(o, 9, '$CELTYPE'); P(o, 6, 'ByLayer');
    P(o, 9, '$CECOLOR'); P(o, 62, 256);
    P(o, 9, '$PDMODE'); P(o, 70, 34);
    P(o, 9, '$PDSIZE'); P(o, 40, num(DOC.textH * 0.5));
    P(o, 0, 'ENDSEC');

    P(o, 0, 'SECTION'); P(o, 2, 'CLASSES'); P(o, 0, 'ENDSEC');
    o.push(...tables);
    o.push(...blocks);
    o.push(...entities);
    o.push(...objects);
    P(o, 0, 'EOF');
    return o.join('\r\n') + '\r\n';
  }
  /* ---- tables ---- */
  tablesSection() {
    const o = [], K = this.K;
    P(o, 0, 'SECTION'); P(o, 2, 'TABLES');
    const tbl = (name, handle, count, body) => {
      P(o, 0, 'TABLE'); P(o, 2, name); P(o, 5, handle); P(o, 330, 0);
      P(o, 100, 'AcDbSymbolTable'); P(o, 70, count);
      body(); P(o, 0, 'ENDTAB');
    };
    const rec = (type, handle, owner, sub) => {
      P(o, 0, type); P(o, 5, handle); P(o, 330, owner);
      P(o, 100, 'AcDbSymbolTableRecord'); P(o, 100, sub);
    };
    tbl('VPORT', K.tVport, 1, () => {
      rec('VPORT', this.H(), K.tVport, 'AcDbViewportTableRecord');
      P(o, 2, '*Active'); P(o, 70, 0);
      P(o, 10, 0); P(o, 20, 0); P(o, 11, 1); P(o, 21, 1);
      P(o, 12, 0); P(o, 22, 0); P(o, 13, 0); P(o, 23, 0);
      P(o, 14, 10); P(o, 24, 10); P(o, 15, 10); P(o, 25, 10);
      P(o, 16, 0); P(o, 26, 0); P(o, 36, 1);
      P(o, 17, 0); P(o, 27, 0); P(o, 37, 0);
      P(o, 40, 297); P(o, 41, 1.9); P(o, 42, 50); P(o, 43, 0); P(o, 44, 0);
      P(o, 50, 0); P(o, 51, 0); P(o, 71, 0); P(o, 72, 100); P(o, 73, 1);
      P(o, 74, 3); P(o, 75, 0); P(o, 76, 0); P(o, 77, 0); P(o, 78, 0);
    });
    const lts = [
      ['ByBlock', '', []], ['ByLayer', '', []],
      ['CONTINUOUS', 'Solid line', []],
      ['DASHED', '__ __ __ __', [12.7, -6.35]],
      ['HIDDEN', '_ _ _ _ _', [6.35, -3.18]],
      ['CENTER', '____ _ ____ _', [31.75, -6.35, 6.35, -6.35]],
      ['DASHDOT', '__ . __ . __', [12.7, -6.35, 0, -6.35]],
    ];
    this.ltHandles = {};
    tbl('LTYPE', K.tLtype, lts.length, () => {
      for (const [n, d, pat] of lts) {
        const hh = this.H(); this.ltHandles[n.toUpperCase()] = hh;
        rec('LTYPE', hh, K.tLtype, 'AcDbLinetypeTableRecord');
        P(o, 2, n); P(o, 70, 0); P(o, 3, d); P(o, 72, 65);
        P(o, 73, pat.length); P(o, 40, num(pat.reduce((a, c) => a + Math.abs(c), 0)));
        for (const v of pat) { P(o, 49, num(v)); P(o, 74, 0); }
      }
    });
    this.layerHandles = {};
    tbl('LAYER', K.tLayer, DOC.layers.length, () => {
      for (const l of DOC.layers) {
        const hh = this.H(); this.layerHandles[l.name] = hh;
        rec('LAYER', hh, K.tLayer, 'AcDbLayerTableRecord');
        P(o, 2, l.name); P(o, 70, l.lock ? 4 : 0);
        P(o, 62, (l.on ? 1 : -1) * toAci(l.color));
        P(o, 420, rgb2int(l.color));
        P(o, 6, ltForName(l.lt));
        P(o, 370, Math.round(Math.max(l.lw, 0) * 100));
        P(o, 390, K.plotStyleHolder);
      }
    });
    tbl('STYLE', K.tStyle, 1, () => {
      rec('STYLE', K.styleStd, K.tStyle, 'AcDbTextStyleTableRecord');
      P(o, 2, 'STANDARD'); P(o, 70, 0); P(o, 40, 0); P(o, 41, 1); P(o, 50, 0);
      P(o, 71, 0); P(o, 42, num(DOC.textH)); P(o, 3, 'txt'); P(o, 4, '');
    });
    tbl('VIEW', K.tView, 0, () => { });
    tbl('UCS', K.tUcs, 0, () => { });
    tbl('APPID', K.tAppid, 1, () => {
      rec('APPID', K.appAcad, K.tAppid, 'AcDbRegAppTableRecord');
      P(o, 2, 'ACAD'); P(o, 70, 0);
    });
    const S = dimStyle();
    tbl('DIMSTYLE', K.tDimstyle, 1, () => {
      P(o, 0, 'DIMSTYLE'); P(o, 105, K.dimStd); P(o, 330, K.tDimstyle);
      P(o, 100, 'AcDbSymbolTableRecord'); P(o, 100, 'AcDbDimStyleTableRecord');
      P(o, 2, 'ORTHO'); P(o, 70, 0);
      P(o, 40, 1);                                  /* DIMSCALE */
      P(o, 41, num(S.arrow));                       /* DIMASZ */
      P(o, 42, num(S.extOff));                      /* DIMEXO */
      P(o, 44, num(S.extBey));                      /* DIMEXE */
      P(o, 140, num(S.txt));                        /* DIMTXT */
      P(o, 147, num(S.gap));                        /* DIMGAP */
      P(o, 73, 0); P(o, 74, 0); P(o, 77, 1); P(o, 78, 8);
      P(o, 271, 2); P(o, 271, 2);
      P(o, 340, K.styleStd);
    });
    tbl('BLOCK_RECORD', K.tBlockRec, 2 + Object.keys(DOC.blocks || {}).length + this.dimBlocks.length, () => {
      rec('BLOCK_RECORD', K.msBlockRec, K.tBlockRec, 'AcDbBlockTableRecord');
      P(o, 2, '*Model_Space'); P(o, 340, K.msLayout);
      rec('BLOCK_RECORD', K.psBlockRec, K.tBlockRec, 'AcDbBlockTableRecord');
      P(o, 2, '*Paper_Space'); P(o, 340, K.psLayout);
      for (const name in (DOC.blocks || {})) {
        rec('BLOCK_RECORD', this.blockRecHandles[name], K.tBlockRec, 'AcDbBlockTableRecord');
        P(o, 2, name);
      }
      for (const d of this.dimBlocks) {
        rec('BLOCK_RECORD', d.recH, K.tBlockRec, 'AcDbBlockTableRecord');
        P(o, 2, d.name);
      }
    });
    P(o, 0, 'ENDSEC');
    return o;
  }
  /* ---- blocks ---- */
  blocksSection() {
    const o = [], K = this.K;
    P(o, 0, 'SECTION'); P(o, 2, 'BLOCKS');
    const blk = (h, endH, rec, name, base, ents) => {
      P(o, 0, 'BLOCK'); P(o, 5, h); P(o, 330, rec);
      P(o, 100, 'AcDbEntity'); P(o, 8, '0'); P(o, 100, 'AcDbBlockBegin');
      P(o, 2, name); P(o, 70, name[0] === '*' ? 1 : 0);
      pt(o, 10, base || [0, 0]);
      P(o, 3, name); P(o, 1, '');
      if (ents) for (const e of ents) this.writeEnt(o, e, rec);
      P(o, 0, 'ENDBLK'); P(o, 5, endH); P(o, 330, rec);
      P(o, 100, 'AcDbEntity'); P(o, 8, '0'); P(o, 100, 'AcDbBlockEnd');
    };
    blk(K.msBlock, K.msEndblk, K.msBlockRec, '*Model_Space', [0, 0], null);
    blk(K.psBlock, K.psEndblk, K.psBlockRec, '*Paper_Space', [0, 0], null);
    for (const name in (DOC.blocks || {})) {
      const d = DOC.blocks[name];
      blk(this.H(), this.H(), this.blockRecHandles[name], name, d.base, d.ents);
    }
    for (const d of this.dimBlocks) {
      blk(this.H(), this.H(), d.recH, d.name, [0, 0], d.ents);
    }
    P(o, 0, 'ENDSEC');
    return o;
  }
  /* ---- entities ---- */
  entitiesSection() {
    const o = [], K = this.K;
    /* pre-allocate block record handles so tables can reference them */
    this.blockRecHandles = {};
    for (const name in (DOC.blocks || {})) this.blockRecHandles[name] = this.H();
    P(o, 0, 'SECTION'); P(o, 2, 'ENTITIES');
    for (const e of DOC.ents.values()) {
      if (GEOM[e.t] && e.t !== 'insert' && e.t !== 'hatch') {
        for (const q of flattenToPrimitives(e)) this.writeEnt(o, q, K.msBlockRec);
      } else this.writeEnt(o, e, K.msBlockRec);
    }
    P(o, 0, 'ENDSEC');
    return o;
  }
  head(o, e, type, owner, sub) {
    P(o, 0, type); P(o, 5, this.H()); P(o, 330, owner);
    P(o, 100, 'AcDbEntity'); P(o, 8, e.layer || '0');
    if (e.color) { P(o, 62, toAci(e.color)); P(o, 420, rgb2int(e.color)); }
    if (e.lt && e.lt !== 'solid') P(o, 6, ltForName(e.lt));
    if (e.lw != null) P(o, 370, Math.round(Math.max(e.lw, 0) * 100));
    if (sub) P(o, 100, sub);
  }
  writeEnt(o, e, owner) {
    switch (e.t) {
      case 'line':
        this.head(o, e, 'LINE', owner, 'AcDbLine');
        pt(o, 10, e.a); pt(o, 11, e.b); break;
      case 'circle':
        this.head(o, e, 'CIRCLE', owner, 'AcDbCircle');
        pt(o, 10, e.c); P(o, 40, num(e.r)); break;
      case 'arc':
        this.head(o, e, 'ARC', owner, 'AcDbCircle');
        pt(o, 10, e.c); P(o, 40, num(e.r));
        P(o, 100, 'AcDbArc'); P(o, 50, num(deg(e.a0))); P(o, 51, num(deg(e.a1))); break;
      case 'point':
        this.head(o, e, 'POINT', owner, 'AcDbPoint');
        pt(o, 10, e.p); break;
      case 'pline': {
        this.head(o, e, 'LWPOLYLINE', owner, 'AcDbPolyline');
        P(o, 90, e.pts.length); P(o, 70, e.closed ? 1 : 0); P(o, 43, 0);
        for (const p of e.pts) { P(o, 10, num(p[0])); P(o, 20, num(p[1])); }
        break;
      }
      case 'spline': {
        const cps = e.fit && e.fit.length > 2 ? e.fit : e.pts;
        const deg = Math.min(3, Math.max(1, cps.length - 1));
        const n = cps.length - 1;
        const knots = [];
        for (let i = 0; i <= deg; i++) knots.push(0);
        for (let i = 1; i <= n - deg; i++) knots.push(i);
        for (let i = 0; i <= deg; i++) knots.push(n - deg + 1);
        this.head(o, e, 'SPLINE', owner, 'AcDbSpline');
        P(o, 210, 0); P(o, 220, 0); P(o, 230, 1);
        P(o, 70, (e.closed ? 1 : 0) | 8);
        P(o, 71, deg); P(o, 72, knots.length); P(o, 73, cps.length); P(o, 74, 0);
        P(o, 42, 1e-10); P(o, 43, 1e-10);
        for (const k of knots) P(o, 40, num(k));
        for (const p of cps) pt(o, 10, p);
        break;
      }
      case 'ellipse': {
        this.head(o, e, 'ELLIPSE', owner, 'AcDbEllipse');
        pt(o, 10, e.c);
        pt(o, 11, [Math.cos(e.rot || 0) * e.rx, Math.sin(e.rot || 0) * e.rx]);
        P(o, 210, 0); P(o, 220, 0); P(o, 230, 1);
        P(o, 40, num(Math.max(e.ry / e.rx, 1e-9)));
        P(o, 41, num(e.a0 ?? 0)); P(o, 42, num(e.a1 ?? TAU));
        break;
      }
      case 'text': {
        this.head(o, e, 'TEXT', owner, 'AcDbText');
        pt(o, 10, e.p); P(o, 40, num(e.h)); P(o, 1, e.s);
        P(o, 50, num(deg(e.rot || 0))); P(o, 7, 'STANDARD');
        const ha = e.anchor === 'c' ? 1 : e.anchor === 'r' ? 2 : 0;
        if (ha) { P(o, 72, ha); pt(o, 11, e.p); }
        P(o, 100, 'AcDbText');
        break;
      }
      case 'xline': case 'ray': {
        this.head(o, e, e.t === 'ray' ? 'RAY' : 'XLINE', owner, e.t === 'ray' ? 'AcDbRay' : 'AcDbXline');
        pt(o, 10, e.a);
        const u = norm(e.d || sub(e.b, e.a));
        pt(o, 11, u);
        break;
      }
      case 'insert': {
        this.head(o, e, 'INSERT', owner, 'AcDbBlockReference');
        P(o, 2, e.name); pt(o, 10, e.p);
        P(o, 41, num(e.sx == null ? 1 : e.sx)); P(o, 42, num(e.sy == null ? 1 : e.sy)); P(o, 43, 1);
        P(o, 50, num(deg(e.rot || 0)));
        break;
      }
      case 'hatch': this.writeHatch(o, e, owner); break;
      case 'dim': this.writeDim(o, e, owner); break;
      default: break;
    }
  }
  writeHatch(o, e, owner) {
    const loops = e.loops || [];
    if (!loops.length) return;
    this.head(o, e, 'HATCH', owner, 'AcDbHatch');
    P(o, 10, 0); P(o, 20, 0); P(o, 30, 0);
    P(o, 210, 0); P(o, 220, 0); P(o, 230, 1);
    P(o, 2, e.solid ? 'SOLID' : (e.pattern === 'cross' ? 'ANSI37' : 'ANSI31'));
    P(o, 70, e.solid ? 1 : 0);
    P(o, 71, 0);
    P(o, 91, loops.length);
    for (const L of loops) {
      P(o, 92, 2);                                  /* polyline boundary */
      P(o, 72, 0);                                  /* no bulges */
      P(o, 73, 1);                                  /* closed */
      P(o, 93, L.length);
      for (const p of L) { P(o, 10, num(p[0])); P(o, 20, num(p[1])); }
      P(o, 97, 0);
    }
    P(o, 75, 1); P(o, 76, 1);
    if (!e.solid) {
      P(o, 52, num(e.hatchAng || 0));
      P(o, 41, num((e.sp || 100) / 100));
      P(o, 77, 0);
      P(o, 78, 1);
      P(o, 53, 0); P(o, 43, 0); P(o, 44, 0);
      P(o, 45, 0); P(o, 46, num(e.sp || 100)); P(o, 79, 0);
    }
    P(o, 47, num((e.sp || 100) / 20));
    P(o, 98, 1); P(o, 10, num(bbox(e)[0])); P(o, 20, num(bbox(e)[1]));
  }
  writeDim(o, e, owner) {
    const g = dimGeom(e);
    const name = '*D' + (this.dimBlocks.length + 1);
    const ents = flattenToPrimitives(e);
    const recH = this.H();
    this.dimBlocks.push({ name, recH, ents });
    this.head(o, e, 'DIMENSION', owner, 'AcDbDimension');
    P(o, 2, name);
    const k = e.k;
    let type = 0;
    if (k === 'aligned') type = 1;
    else if (k === 'angular') type = 5;            /* 5 = three-point angular, 2 = two-line */
    else if (k === 'diameter') type = 3;
    else if (k === 'radius') type = 4;
    if (k === 'radius' || k === 'diameter') {
      pt(o, 10, k === 'radius' ? e.p1 : e.p2);
      pt(o, 11, g.tp);
      P(o, 70, type + 32); P(o, 71, 5); P(o, 42, num(g.val));
      P(o, 1, e.txt || ''); P(o, 3, 'ORTHO');
      P(o, 100, k === 'radius' ? 'AcDbRadialDimension' : 'AcDbDiametricDimension');
      /* radius: 10 is the centre and 15 the point on the circle.
         diameter: both are opposite points on the circle. */
      pt(o, 15, k === 'radius' ? e.p2 : [2 * e.p1[0] - e.p2[0], 2 * e.p1[1] - e.p2[1]]);
      P(o, 40, 0);
      return;
    }
    if (k === 'angular') {
      pt(o, 10, g.tp);                             /* a point on the dimension arc */
      pt(o, 11, g.tp);
      P(o, 70, type + 32); P(o, 71, 5); P(o, 42, num(g.val));
      P(o, 1, e.txt || ''); P(o, 3, 'ORTHO');
      P(o, 100, 'AcDb3PointAngularDimension');
      pt(o, 13, e.p1); pt(o, 14, e.p2);
      pt(o, 15, e.p3 || e.p1);                     /* vertex */
      pt(o, 16, g.tp);
      return;
    }
    /* linear family */
    pt(o, 10, g.q2);
    pt(o, 11, g.tp);
    P(o, 70, type + 32); P(o, 71, 5); P(o, 42, num(g.val));
    P(o, 1, e.txt || ''); P(o, 3, 'ORTHO');
    P(o, 100, 'AcDbAlignedDimension');
    pt(o, 13, e.p1); pt(o, 14, e.p2);
    const rotA = k === 'horizontal' ? 0 : k === 'vertical' ? 90 : deg(ang(e.p1, e.p2));
    P(o, 50, num(rotA));
    if (k !== 'aligned') P(o, 100, 'AcDbRotatedDimension');
  }
  /* ---- objects ---- */
  objectsSection() {
    const o = [], K = this.K;
    P(o, 0, 'SECTION'); P(o, 2, 'OBJECTS');
    P(o, 0, 'DICTIONARY'); P(o, 5, K.rootDict); P(o, 330, 0);
    P(o, 100, 'AcDbDictionary'); P(o, 281, 1);
    P(o, 3, 'ACAD_GROUP'); P(o, 350, K.groupDict);
    P(o, 3, 'ACAD_LAYOUT'); P(o, 350, K.layoutDict);
    P(o, 3, 'ACAD_MLINESTYLE'); P(o, 350, K.mlineDict);
    P(o, 3, 'ACAD_PLOTSTYLENAME'); P(o, 350, K.plotStyleDict);
    const dict = (h, owner) => {
      P(o, 0, 'DICTIONARY'); P(o, 5, h); P(o, 330, owner);
      P(o, 100, 'AcDbDictionary'); P(o, 281, 1);
    };
    dict(K.groupDict, K.rootDict);
    dict(K.layoutDict, K.rootDict);
    P(o, 3, 'Model'); P(o, 350, K.msLayout);
    P(o, 3, 'Layout1'); P(o, 350, K.psLayout);
    dict(K.mlineDict, K.rootDict);
    P(o, 0, 'ACDBDICTIONARYWDFLT'); P(o, 5, K.plotStyleDict); P(o, 330, K.rootDict);
    P(o, 100, 'AcDbDictionary'); P(o, 281, 1);
    P(o, 3, 'Normal'); P(o, 350, K.plotStyleHolder);
    P(o, 100, 'AcDbDictionaryWithDefault'); P(o, 340, K.plotStyleHolder);
    P(o, 0, 'ACDBPLACEHOLDER'); P(o, 5, K.plotStyleHolder); P(o, 330, K.plotStyleDict);
    const layout = (h, name, brec, tab) => {
      P(o, 0, 'LAYOUT'); P(o, 5, h); P(o, 330, K.layoutDict);
      P(o, 100, 'AcDbPlotSettings');
      P(o, 1, ''); P(o, 2, 'none_device'); P(o, 4, 'A4'); P(o, 6, '');
      P(o, 40, 7.5); P(o, 41, 20); P(o, 42, 7.5); P(o, 43, 20);
      P(o, 44, 210); P(o, 45, 297); P(o, 46, 0); P(o, 47, 0);
      P(o, 48, 0); P(o, 49, 0); P(o, 140, 0); P(o, 141, 0);
      P(o, 142, 1); P(o, 143, 1); P(o, 70, 688); P(o, 72, 0); P(o, 73, 1);
      P(o, 74, 5); P(o, 7, ''); P(o, 75, 16); P(o, 147, 1);
      P(o, 148, 0); P(o, 149, 0);
      P(o, 100, 'AcDbLayout');
      P(o, 1, name); P(o, 70, 1); P(o, 71, tab);
      P(o, 10, 0); P(o, 20, 0); P(o, 11, 420); P(o, 21, 297);
      P(o, 12, 0); P(o, 22, 0); P(o, 32, 0);
      P(o, 14, 0); P(o, 24, 0); P(o, 34, 0);
      P(o, 15, 0); P(o, 25, 0); P(o, 35, 0);
      P(o, 146, 0);
      P(o, 13, 0); P(o, 23, 0); P(o, 33, 0);
      P(o, 16, 1); P(o, 26, 0); P(o, 36, 0);
      P(o, 17, 0); P(o, 27, 1); P(o, 37, 0);
      P(o, 76, 0); P(o, 330, brec);
    };
    layout(K.msLayout, 'Model', K.msBlockRec, 0);
    layout(K.psLayout, 'Layout1', K.psBlockRec, 1);
    P(o, 0, 'ENDSEC');
    return o;
  }
}
function ltForName(lt) {
  const m = { solid: 'Continuous', dashed: 'DASHED', hidden: 'HIDDEN', center: 'CENTER', dashdot: 'DASHDOT' };
  return m[lt || 'solid'] || 'Continuous';
}
