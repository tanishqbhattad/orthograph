/* ============================================================
   ORTHOGRAPH — 00 core: math, colour, units
   ============================================================ */
'use strict';
const TAU = Math.PI * 2, EPS = 1e-9;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const dist = (a, b) => hyp(b[0] - a[0], b[1] - a[1]);
const dist2 = (a, b) => (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const norm = a => { const l = hyp(a[0], a[1]); return l < EPS ? [0, 0] : [a[0] / l, a[1] / l]; };
const perp = a => [-a[1], a[0]];
const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const rot = (p, c, t) => {
  const s = Math.sin(t), k = Math.cos(t), d = sub(p, c);
  return [c[0] + d[0] * k - d[1] * s, c[1] + d[0] * s + d[1] * k];
};
const wrap = t => { t %= TAU; return t < 0 ? t + TAU : t; };
/* signed wrap to (-PI, PI] */
const wrapS = t => { t = wrap(t); return t > Math.PI ? t - TAU : t; };
const deg = r => r * 180 / Math.PI, rad = d => d * Math.PI / 180;
const near = (a, b, e = 1e-7) => Math.abs(a - b) < e;
const clone = e => JSON.parse(JSON.stringify(e));

/* AutoCAD Color Index (256 entries, packed hex) */
const ACI_HEX = "000000ff0000ffff0000ff0000ffff0000ffff00ffffffff808080c0c0c0ff0000ff7f7fcc0000cc6666990000994c4c7f00007f3f3f4c00004c2626ff3f00ff9f7fcc3300cc7f66992600995f4c7f1f007f4f3f4c13004c2f26ff7f00ffbf7fcc6600cc9966994c0099724c7f3f007f5f3f4c26004c3926ffbf00ffdf7fcc9900ccb26699720099854c7f5f007f6f3f4c39004c4226ffff00ffff7fcccc00cccc6698980098984c7f7f007f7f3f4c4c004c4c26bfff00dfff7f99cc00b2cc6672980085984c5f7f006f7f3f394c00424c267fff00bfff7f66cc0099cc664c980072984c3f7f005f7f3f264c00394c263fff009fff7f33cc007fcc662698005f984c1f7f004f7f3f134c002f4c2600ff007fff7f00cc0066cc660098004c984c007f003f7f3f004c00264c2600ff3f7fff9f00cc3366cc7f0098264c985f007f1f3f7f4f004c13264c2f00ff7f7fffbf00cc6666cc9900984c4c9872007f3f3f7f5f004c26264c3900ffbf7fffdf00cc9966ccb20098724c9885007f5f3f7f6f004c39264c4200ffff7fffff00cccc66cccc0098984c9898007f7f3f7f7f004c4c264c4c00bfff7fdfff0099cc66b2cc0072984c8598005f7f3f6f7f00394c26424c007fff7fbfff0066cc6699cc004c984c7298003f7f3f5f7f00264c26394c003fff7f9fff0033cc667fcc0026984c5f98001f7f3f4f7f00134c262f4c0000ff7f7fff0000cc6666cc0000984c4c9800007f3f3f7f00004c26264c3f00ff9f7fff3300cc7f66cc2600985f4c981f007f4f3f7f13004c2f264c7f00ffbf7fff6600cc9966cc4c0098724c983f007f5f3f7f26004c39264cbf00ffdf7fff9900ccb266cc720098854c985f007f6f3f7f39004c42264cff00ffff7fffcc00cccc66cc980098984c987f007f7f3f7f4c004c4c264cff00bfff7fdfcc0099cc66b2980072984c857f005f7f3f6f4c00394c2642ff007fff7fbfcc0066cc669998004c984c727f003f7f3f5f4c00264c2639ff003fff7f9fcc0033cc667f980026984c5f7f001f7f3f4f4c00134c262f3333335b5b5b848484adadadd6d6d6ffffff";
function aci(i) {
  i = i | 0; if (i < 0 || i > 255) return '#ffffff';
  return '#' + ACI_HEX.substr(i * 6, 6);
}
const _aciCache = new Map();
function toAci(hex) {                      /* nearest ACI slot for export */
  if (!hex) return 7;
  const hit = _aciCache.get(hex); if (hit !== undefined) return hit;
  const r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
  let best = 7, bd = Infinity;
  for (let i = 1; i < 256; i++) {
    const h = ACI_HEX.substr(i * 6, 6);
    const dr = r - parseInt(h.substr(0, 2), 16), dg = g - parseInt(h.substr(2, 2), 16), db = b - parseInt(h.substr(4, 2), 16);
    const d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; best = i; }
  }
  _aciCache.set(hex, best);
  return best;
}
const hex2rgb = h => [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
const rgb2int = h => { const [r, g, b] = hex2rgb(h); return (r << 16) | (g << 8) | b; };
const int2hex = n => '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0');

/* ---------------- unit formatting ---------------- */
/* internal working unit is always the millimetre */
const U = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
/** The one length formatter. `dp` overrides the decimal places a *readout*
    wants, so an editable field can ask for more of them without inventing a
    second notation: the property panels used to print decimal feet beside a
    status bar printing 9'-10 1/8", which is two answers to the same question.
    Feet are architectural whatever `dp` says — that is what the unit means. */
function fmt(v, u, dp) {
  u = u || DOC.units;
  if (u === 'ft') {
    const neg = v < 0;
    const inch = Math.abs(v) / 25.4; let ft = Math.floor(inch / 12);
    let rem = inch - ft * 12;
    const six = Math.round(rem * 16) / 16;
    if (six >= 12) { ft++; rem = 0; } else rem = six;
    const frac = rem - Math.floor(rem);
    let fs = '';
    if (frac > 1e-6) {
      let n = Math.round(frac * 16), d = 16;
      while (n % 2 === 0 && d > 1) { n /= 2; d /= 2; } fs = ' ' + n + '/' + d;
    }
    return (neg ? '-' : '') + ft + "'-" + Math.floor(rem) + fs + '"';
  }
  const k = v / U[u];
  if (dp == null) dp = u === 'mm' ? 1 : u === 'cm' ? 2 : 3;
  return (+k.toFixed(dp)).toString() + (u === 'in' ? '"' : '');
}
function parseLen(s) {
  s = String(s).trim().replace(/,/g, '.'); if (!s) return NaN;
  /* 4'-6 1/2"  |  4' 6"  |  4' */
  let m = s.match(/^(-?[\d.]+)\s*'\s*-?\s*([\d.]+)?(?:\s+(\d+)\/(\d+))?"?$/);
  if (m) return ((+m[1]) * 12 + (+(m[2] || 0)) + (m[3] ? +m[3] / +m[4] : 0)) * 25.4;
  /* 6 1/2" */
  m = s.match(/^(-?\d+)\s+(\d+)\/(\d+)\s*"?$/);
  if (m) return ((+m[1]) + (+m[2]) / (+m[3])) * 25.4;
  m = s.match(/^(-?[\d.]+)\s*(mm|cm|m|in|ft|"|')$/i);
  if (m) { const u = { '"': 'in', "'": 'ft' }[m[2]] || m[2].toLowerCase(); return +m[1] * U[u]; }
  const v = parseFloat(s);
  return isNaN(v) ? NaN : v * U[DOC.units];
}
/** Area, shown in the unit an architect actually wants: square metres for
    metric drawings and square feet for imperial, dropping to the small unit
    only when the area is genuinely small. */
function fmtArea(mm2) {
  const u = DOC.units;
  if (u === 'ft' || u === 'in') {
    const ft2 = mm2 / (304.8 * 304.8);
    if (ft2 >= 0.5 || mm2 === 0) return ft2.toFixed(2) + ' ft²';
    return (mm2 / (25.4 * 25.4)).toFixed(1) + ' in²';
  }
  const m2 = mm2 / 1e6;
  if (m2 >= 0.01 || mm2 === 0) return m2.toFixed(2) + ' m²';
  const k = U[u] * U[u];
  return (+(mm2 / k).toFixed(2)) + ' ' + u + '²';
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- lineweights ----------------
   A lineweight is a *plot* width in millimetres, not a model dimension: it is
   the same thickness on screen however far you zoom, which is what makes a
   0.5mm pen look like a 0.5mm pen. The ladder is the set of widths a plotter
   can actually produce, so the property panels never offer anything else.
   These live in core rather than with the renderer because the document model
   needs LW_DEFAULT for its fallback layer. */
const LW_LADDER = [0, 0.05, 0.09, 0.13, 0.15, 0.18, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50,
  0.53, 0.60, 0.70, 0.80, 0.90, 1.00, 1.06, 1.20, 1.40, 1.58, 2.00, 2.11];
const LW_DEFAULT = 0.25;                           /* LWDEFAULT */
const PX_PER_MM = 96 / 25.4;                       /* the CSS reference pixel: 1in = 96px */
/** nearest standard pen width, so the property panels only ever offer real ones */
function lwSnap(mm) {
  let best = LW_DEFAULT, bd = Infinity;
  for (const v of LW_LADDER) { const d = Math.abs(v - mm); if (d < bd) { bd = d; best = v; } }
  return best;
}

/* ---------------- paper ----------------
   Sheet sizes in millimetres, portrait (width, height). A sheet is the only
   place in this program where a millimetre means a millimetre on a physical
   object rather than a millimetre of building, so these are the numbers that
   decide whether a plot comes out at the scale it claims. */
const PAPER = {
  A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297],
  ANSI_E: [864, 1118], ANSI_D: [559, 864], ANSI_C: [432, 559], ANSI_B: [279, 432], ANSI_A: [216, 279],
  ARCH_E: [914, 1219], ARCH_D: [610, 914], ARCH_C: [457, 610], ARCH_B: [305, 457],
};
/** paper extent in mm for a size name and orientation */
function paperSize(name, landscape) {
  const p = PAPER[name] || PAPER.A3;
  return landscape ? [p[1], p[0]] : [p[0], p[1]];
}
/* The drawing scales an architect actually uses. Stored as a ratio — paper mm
   per model mm — because that is what every transform needs; the label is what
   goes in the title block. */
const SCALES = [
  { label: '1:1', r: 1 }, { label: '1:2', r: 1 / 2 }, { label: '1:5', r: 1 / 5 },
  { label: '1:10', r: 1 / 10 }, { label: '1:20', r: 1 / 20 }, { label: '1:25', r: 1 / 25 },
  { label: '1:50', r: 1 / 50 }, { label: '1:100', r: 1 / 100 }, { label: '1:200', r: 1 / 200 },
  { label: '1:500', r: 1 / 500 }, { label: '1:1000', r: 1 / 1000 },
];
/** the label for a ratio, falling back to a computed 1:n so a custom scale
    still prints something honest rather than nothing */
function scaleLabel(r) {
  const hit = SCALES.find(s => Math.abs(s.r - r) < 1e-12);
  if (hit) return hit.label;
  if (!(r > 0)) return '—';
  return r >= 1 ? (+r.toFixed(4)) + ':1' : '1:' + (+(1 / r).toFixed(4));
}

