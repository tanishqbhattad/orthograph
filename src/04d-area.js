/* ============================================================
   ORTHOGRAPH — 04d area measurement
   ------------------------------------------------------------
   "Area" is not one number. Carpet area is measured to the inside
   face of the walls, built-up area to their centrelines, and gross
   floor area to their outside face — the same room gives three
   different answers and a tool that only knows one of them is not
   much use on a real drawing.

   So an area is a region plus a BASIS. The region is traced from
   the wall arrangement exactly the way a room is, then re-based:
   every edge of the traced ring knows which wall face carries it,
   so it can be moved onto that wall's centreline or its far face
   and the corners re-solved. That stays exact with mixed wall
   thicknesses and at any angle.

   On top of that sit the things a schedule actually needs:
   deductions (columns, shafts, voids), a category, and a factor
   so a balcony can count at 50% or a common area can carry a
   loading factor.
   ============================================================ */

const AREA_BASES = [
  ['net', 'Carpet / net — to the inside face'],
  ['bua', 'Built-up — to the wall centreline'],
  ['gross', 'Gross — to the outside face'],
  ['manual', 'Drawn by hand'],
];
const AREA_CATS = [
  ['carpet', 'Carpet'],
  ['builtup', 'Built-up'],
  ['gfa', 'Gross floor area'],
  ['balcony', 'Balcony'],
  ['terrace', 'Terrace'],
  ['service', 'Service / shaft'],
  ['common', 'Common'],
  ['parking', 'Parking'],
  ['other', 'Other'],
];
/* categories that a gross floor area total should count */
const GFA_CATS = { gfa: 1, builtup: 1 };
const areaBasisLabel = b => (AREA_BASES.find(x => x[0] === b) || [, b])[1];
const areaCatLabel = c => (AREA_CATS.find(x => x[0] === c) || [, c])[1];

/** which wall face, if any, carries this edge of a traced ring */
function faceCarrier(p, q, lvl) {
  const u = norm(sub(q, p));
  if (!u[0] && !u[1]) return null;
  const m = mid(p, q);
  for (const w of allWalls()) {
    if ((w.lvl || 0) !== (lvl || 0)) continue;
    if (wallLen(w) < EPS) continue;
    for (const s of [1, -1]) {
      const f = wallFace(w, s);
      const cu = norm(sub(f.b, f.a));
      if (Math.abs(cross(u, cu)) > 1e-6) continue;            /* not parallel */
      if (Math.abs(cross(sub(m, f.a), cu)) > 1e-4) continue;  /* not on that line */
      return { w, s };
    }
  }
  return null;
}
/** rebuild a ring with each edge moved onto another line of its own wall */
function rebaseRing(ring, lvl, pick) {
  if (!ring || ring.length < 3) return ring;
  const n = ring.length;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    const c = faceCarrier(a, b, lvl);
    lines.push(c ? pick(c.w, c.s) : { a, b });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const L1 = lines[i], L2 = lines[(i + 1) % n];
    const X = xLineLine(L1.a, L1.b, L2.a, L2.b, true);
    const p = X.length ? X[0] : ring[(i + 1) % n];
    if (!out.length || dist(out[out.length - 1], p) > 1e-7) out.push(p);
  }
  while (out.length > 3 && dist(out[0], out[out.length - 1]) < 1e-7) out.pop();
  return out.length >= 3 ? out : ring;
}
/** the ring for a given basis, traced from the walls around `seed` */
function areaTrace(seed, lvl, basis) {
  const net = roomTrace(seed, lvl);
  if (!net) return null;
  if (basis === 'net' || !basis) return net;
  if (basis === 'bua') return rebaseRing(net, lvl, w => ({ a: w.a, b: w.b }));
  if (basis === 'gross') return rebaseRing(net, lvl, (w, s) => wallFace(w, -s));
  return net;
}

/* ---------------- the entity ---------------- */
function areaRing(a) {
  if (a.basis === 'manual' || !a.seed) return a.pts || [];
  const hit = _areaCache.get(a.id);
  if (hit && hit.v === DOCV && hit.basis === a.basis) return hit.ring;
  let ring = null;
  try { ring = areaTrace(a.seed, a.lvl || 0, a.basis); } catch (e) { ring = null; }
  if (!ring) ring = a.pts || [];
  else a.pts = ring;                               /* keep it for save and export */
  _areaCache.set(a.id, { v: DOCV, basis: a.basis, ring });
  return ring;
}
const _areaCache = new Map();
/** is this region still traceable, or have the walls opened up? */
function areaEnclosed(a) {
  if (a.basis === 'manual' || !a.seed) return true;
  try { return !!areaTrace(a.seed, a.lvl || 0, a.basis); } catch (e) { return false; }
}
/* Whether columns come off depends on what is being measured. Carpet area is
   what you can actually stand on, so a column is deducted; gross floor area is
   gross by definition and a column is part of it. An explicit setting on the
   area always wins over this default. */
const DEDUCT_COLUMNS_BY_DEFAULT = { carpet: 1, service: 1 };
function areaDeductsColumns(a) {
  if (a.deductColumns === true || a.deductColumns === false) return a.deductColumns;
  return !!DEDUCT_COLUMNS_BY_DEFAULT[a.cat || 'carpet'];
}
/** deductions: whatever the user added, plus columns where the basis wants them */
function areaHoles(a) {
  const holes = (a.holes || []).slice();
  if (!areaDeductsColumns(a)) return holes;
  const ring = areaRing(a);
  if (!ring || ring.length < 3) return holes;
  for (const e of DOC.ents.values()) {
    if (e.t !== 'column' || (e.lvl || 0) !== (a.lvl || 0)) continue;
    const p = poly(e, 24);
    if (p.length > 2 && p.every(q => pointInPoly(q, ring))) holes.push(p);
  }
  return holes;
}
/** gross ring area less deductions, before any factor */
function areaGross(a) {
  const ring = areaRing(a);
  if (!ring || ring.length < 3) return 0;
  let v = polyArea(ring);
  for (const h of areaHoles(a)) v -= polyArea(h);
  return Math.max(v, 0);
}
/** what the schedule counts: deducted area times the factor */
function areaNet(a) { return areaGross(a) * (a.factor == null ? 1 : a.factor); }

function areaShapes(a) {
  const ring = areaRing(a);
  if (!ring || ring.length < 3) return [];
  const open = areaEnclosed(a);
  const out = [{ pts: ring, closed: true, role: 'area', lt: open ? 'dashed' : 'dashdot' }];
  for (const h of areaHoles(a)) out.push({ pts: h, closed: true, role: 'areaHole', lt: 'dashed' });
  const c = polyCentroid(ring);
  const h = a.h || DOC.textH * 1.3;
  const lines = [];
  if (a.name) lines.push({ s: a.name, h });
  if (a.showLabel !== false) {
    lines.push({ s: areaText(a), h: h * 0.8 });
    const sub = [areaCatLabel(a.cat || 'carpet')];
    if (a.factor != null && a.factor !== 1) sub.push('×' + a.factor);
    if (!open) sub.push('NOT ENCLOSED');
    lines.push({ s: sub.join('  ·  '), h: h * 0.6 });
  }
  let y = c[1] + (lines.length - 1) * h * 0.4;
  for (const ln of lines) {
    out.push({ text: ln.s, p: [c[0], y], h: ln.h, rot: 0, anchor: 'c', role: 'label' });
    y -= ln.h * 1.35;
  }
  return out;
}
function areaText(a) {
  const v = areaNet(a);
  return typeof areaIn === 'function' ? areaIn(v, a.units || DOC.areaUnits || 'auto') : fmtArea(v);
}
function polyCentroid(p) {
  let a2 = 0, x = 0, y = 0;
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length, f = cross(p[i], p[j]);
    a2 += f; x += (p[i][0] + p[j][0]) * f; y += (p[i][1] + p[j][1]) * f;
  }
  if (Math.abs(a2) < EPS) return p[0] ? p[0].slice() : [0, 0];
  return [x / (3 * a2), y / (3 * a2)];
}
GEOM.area = {
  shapes: areaShapes,
  dist(p, a) {
    const ring = areaRing(a);
    if (!ring || ring.length < 3) return Infinity;
    if (!pointInPoly(p, ring)) return polyDist(p, ring, true);
    for (const h of areaHoles(a)) if (pointInPoly(p, h)) return polyDist(p, h, true);
    return 0;
  },
  grips(a) {
    if (a.basis !== 'manual' && a.seed) return [{ p: a.seed.slice(), k: 'seed' }];
    return (a.pts || []).map((p, i) => ({ p, k: 'p' + i }));
  },
  grip(a, k, p) {
    if (k === 'seed') { a.seed = p.slice(); _areaCache.delete(a.id); return; }
    if (k[0] === 'p') { a.pts[+k.slice(1)] = p; a.basis = 'manual'; _areaCache.delete(a.id); }
  },
  xf(a, fn) {
    if (a.seed) a.seed = fn(a.seed);
    a.pts = (a.pts || []).map(fn);
    a.holes = (a.holes || []).map(h => h.map(fn));
    _areaCache.delete(a.id);
  },
  area: a => areaGross(a),
};

/* ---------------- the schedule ---------------- */
/** every area on the drawing, grouped, with totals and FAR */
function areaSchedule(lvl) {
  const rows = [];
  for (const e of DOC.ents.values()) {
    if (e.t !== 'area') continue;
    if (lvl != null && (e.lvl || 0) !== lvl) continue;
    rows.push({
      id: e.id, name: e.name || '(unnamed)', cat: e.cat || 'carpet',
      basis: e.basis || 'net', lvl: e.lvl || 0,
      gross: areaGross(e), factor: e.factor == null ? 1 : e.factor,
      net: areaNet(e), enclosed: areaEnclosed(e),
    });
  }
  rows.sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  const byCat = {};
  let total = 0, gfa = 0;
  for (const r of rows) {
    (byCat[r.cat] = byCat[r.cat] || { n: 0, net: 0 });
    byCat[r.cat].n++; byCat[r.cat].net += r.net;
    total += r.net;
    if (GFA_CATS[r.cat]) gfa += r.net;
  }
  const plot = DOC.plotArea || 0;
  return { rows, byCat, total, gfa, plot, far: plot > 0 ? gfa / plot : null };
}
