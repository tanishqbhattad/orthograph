/* ============================================================
   ORTHOGRAPH — 05 viewport and renderer
   ============================================================ */
const cv = document.getElementById('cv');
let ctx = cv.getContext('2d');
/* rot rotates the *view*, not the model: world coordinates never change,
   so ortho, snapping and every stored entity stay in true world space. */
const V = { z: 1, px: 0, py: 0, w: 0, h: 0, dpr: 1, rot: 0 };
/* The canvas is painted from JS, not CSS, so the theme needs a palette here
   too. CO is mutated in place by setTheme() — every draw path reads through
   it, so nothing else has to know the theme changed. */
const THEMES = {
  dark: {
    bg: '#0e1116', gridm: '#181e26', gridM: '#222b36',
    axisX: '#e0526366', axisY: '#5fbf7f66',
    sel: '#ffd166', hot: '#ffe6a3', snap: '#4ee6a8', prev: '#6ba8ff',
    grip: '#6ba8ff', gripHot: '#ffd166', tx: '#8d9aab',
    cross: '#ffffff30', crossBox: '#ffffff70',
    bandIn: '#6ba8ff', bandCross: '#4ee6a8',
    ink: '#d7dee8',
  },
  light: {
    bg: '#f7f8fa', gridm: '#e6e9ee', gridM: '#d3d8e0',
    axisX: '#c0392b55', axisY: '#2e8b5755',
    sel: '#c07800', hot: '#e09b1f', snap: '#0f9d58', prev: '#1a73e8',
    grip: '#1a73e8', gripHot: '#c07800', tx: '#5c6878',
    cross: '#00000028', crossBox: '#00000070',
    bandIn: '#1a73e8', bandCross: '#0f9d58',
    ink: '#1c2430',
  },
};
let THEME = 'dark';
const CO = Object.assign({}, THEMES.dark);
/** swap the canvas palette, the CSS variables and the default ink together */
function setTheme(name) {
  THEME = THEMES[name] ? name : 'dark';
  Object.assign(CO, THEMES[THEME]);
  const b = document.body;
  if (b && b.classList) { b.classList.toggle('light', THEME === 'light'); b.classList.toggle('dark', THEME !== 'light'); }
  /* entities drawn ByLayer on a default-coloured layer need to flip too */
  const from = THEME === 'light' ? THEMES.dark.ink : THEMES.light.ink;
  for (const l of (DOC.layers || [])) if (l.color && l.color.toLowerCase() === from.toLowerCase()) l.color = CO.ink;
  try { localStorage.setItem('orthograph.theme', THEME); } catch (e) { /* file:// or private mode */ }
  if (typeof syncUI === 'function') syncUI();
  draw();
}
function initTheme() {
  let t = null;
  try { t = localStorage.getItem('orthograph.theme'); } catch (e) { t = null; }
  setTheme(t || 'dark');
}
function w2s(p) {
  if (!V.rot) return [p[0] * V.z + V.px, -p[1] * V.z + V.py];
  const c = Math.cos(V.rot), s = Math.sin(V.rot);
  const x = p[0] * c - p[1] * s, y = p[0] * s + p[1] * c;
  return [x * V.z + V.px, -y * V.z + V.py];
}
function s2w(sx, sy) {
  const x = (sx - V.px) / V.z, y = -(sy - V.py) / V.z;
  if (!V.rot) return [x, y];
  const c = Math.cos(-V.rot), s = Math.sin(-V.rot);
  return [x * c - y * s, x * s + y * c];
}
/* Allocation-free twin of w2s for the path hot loop: writes into _sx/_sy and
   reuses one cached cos/sin per view angle. Must stay bit-identical to w2s. */
let _sx = 0, _sy = 0, _rotC = NaN, _rc = 1, _rs = 0;
function rotCS() { if (_rotC !== V.rot) { _rotC = V.rot; _rc = Math.cos(V.rot); _rs = Math.sin(V.rot); } }
function w2sI(p) {
  if (!V.rot) { _sx = p[0] * V.z + V.px; _sy = -p[1] * V.z + V.py; return; }
  const x = p[0] * _rc - p[1] * _rs, y = p[0] * _rs + p[1] * _rc;
  _sx = x * V.z + V.px; _sy = -y * V.z + V.py;
}
/** world-space axis-aligned box covering the visible screen rect */
function viewWorldBox(pad) {
  const m = pad || 0;
  const cs = [s2w(-m, -m), s2w(V.w + m, -m), s2w(V.w + m, V.h + m), s2w(-m, V.h + m)];
  const xs = cs.map(p => p[0]), ys = cs.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const px = n => n / V.z;                          /* screen px -> world units */

function resize() {
  const r = cv.getBoundingClientRect();
  V.dpr = Math.min(window.devicePixelRatio || 1, 2);
  V.w = r.width; V.h = r.height;
  cv.width = Math.round(r.width * V.dpr); cv.height = Math.round(r.height * V.dpr);
  draw();
}
function zoomAt(sx, sy, f) {
  const before = s2w(sx, sy);
  V.z = clamp(V.z * f, 1e-6, 20000);
  const after = s2w(sx, sy);
  V.px += (after[0] - before[0]) * V.z;
  V.py -= (after[1] - before[1]) * V.z;
  draw();
}
function fit(list) {
  const b = bboxAll(list || [...DOC.ents.values()].filter(visible));
  if (!b) { V.z = 1; V.px = V.w / 2; V.py = V.h / 2; return draw(); }
  /* measure the extents in the rotated frame so fit works at any view angle */
  const cr = Math.cos(V.rot), sr = Math.sin(V.rot);
  const corners = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]
    .map(p => [p[0] * cr - p[1] * sr, p[0] * sr + p[1] * cr]);
  const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
  const w = Math.max(Math.max(...xs) - Math.min(...xs), 1e-3);
  const h = Math.max(Math.max(...ys) - Math.min(...ys), 1e-3);
  V.z = Math.min(V.w * 0.84 / w, V.h * 0.84 / h);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  V.px = V.w / 2 - cx * V.z; V.py = V.h / 2 + cy * V.z;
  draw();
}

/* ---- line dash patterns (screen-scaled) ----
   Shared frozen arrays: setLineDash copies, so handing out the same array
   every frame is safe and keeps the hot loop allocation-free. */
const DASH = {
  solid: [], dashed: [12, 7], hidden: [7, 5], center: [22, 6, 6, 6], dashdot: [16, 5, 2, 5],
};
function dashFor(lt) { return DASH[lt] || DASH.solid; }

/* ---- per-frame layer resolution ----
   layer() is a linear find over DOC.layers and the renderer asks for colour,
   linetype, lineweight and visibility of every entity — four scans each.
   Rebuilding a name->layer map once per frame makes that O(1) and can never
   go stale, because it is thrown away at the end of the frame. */
const FALLBACK_LAYER = { name: '0', color: '#d7dee8', on: true, lock: false, lw: 0.25, lt: 'solid' };
const LAYM = new Map();
function frameLayers() {
  LAYM.clear();
  const L = DOC.layers || [];
  for (let i = L.length - 1; i >= 0; i--) LAYM.set(L[i].name, L[i]);   /* index 0 wins, as find() does */
  LAYM.set(undefined, L[0] || FALLBACK_LAYER);
}
function flay(n) {
  if (!LAYM.size) frameLayers();
  return LAYM.get(n) || (DOC.layers && DOC.layers[0]) || FALLBACK_LAYER;
}
const fvis = e => flay(e.layer).on;
const fcol = e => e.color || flay(e.layer).color;
const flt = e => e.lt || flay(e.layer).lt || 'solid';
const flw = e => (e.lw != null ? e.lw : flay(e.layer).lw);

/* ---- shape cache ----
   wallShapes() resolves mitres, T-junctions and face breaks against every
   other wall — by far the most expensive thing the renderer touches, and it
   was being redone on every pan, zoom and cursor move. Cache it on DOCV,
   the same version stamp allWalls()/wallNodes() already trust, plus the
   poche flag (which is not journalled). Entities that are not owned by the
   document (previews, ghosts) bypass the cache entirely. */
const SHAPE_TOL = 48;
const SHPC = new Map();                            /* id -> {shapes, box} */
let SHPCh = null;
/** A wall's drawn shape depends on the walls it touches, so a change has to
    invalidate its neighbourhood — but only its neighbourhood. Clearing the
    whole cache on every mutation put a 600-wall plan at four frames a second
    while dragging. */
function shapeCacheSync() {
  if (SHPCh !== DOC.wallHatch) { SHPC.clear(); SHPCh = DOC.wallHatch; DIRTY.clear(); return; }
  if (!DIRTY.size) return;
  if (DIRTY.size > 400 || SHPC.size > 40000) { SHPC.clear(); DIRTY.clear(); return; }
  const ids = [...DIRTY];
  DIRTY.clear();
  const boxes = [];
  for (const id of ids) {
    const prev = SHPC.get(id);
    if (prev && prev.box) boxes.push(prev.box);
    SHPC.delete(id);
    const e = DOC.ents.get(id);
    if (!e) continue;
    /* an opening is drawn by its host wall, so dirty the host too */
    if ((e.t === 'door' || e.t === 'window') && e.host != null) {
      SHPC.delete(e.host);
      const host = DOC.ents.get(e.host);
      if (host && host.t === 'wall' && typeof wallRawBox === 'function') boxes.push(wallRawBox(host));
    }
    if (e.t === 'wall' && typeof wallRawBox === 'function') boxes.push(wallRawBox(e));
  }
  if (!boxes.length || typeof wallsInBox !== 'function') return;
  for (const b of boxes) {
    const pad = 600;
    for (const v of wallsInBox([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad])) SHPC.delete(v.id);
  }
}
function entShapes(e) {
  if (e.id == null || DOC.ents.get(e.id) !== e) return shapes(e, SHAPE_TOL) || [];
  const hit = SHPC.get(e.id);
  if (hit !== undefined) return hit.shapes;
  const sh = shapes(e, SHAPE_TOL) || [];
  const box = (e.t === 'wall' && typeof wallRawBox === 'function') ? wallRawBox(e) : null;
  SHPC.set(e.id, { shapes: sh, box });
  return sh;
}

/* ---- adaptive grid ---- */
function gridStep() {
  const target = 68 / V.z;
  const base = DOC.units === 'ft' || DOC.units === 'in' ? 25.4 : 1;
  const m = [1, 2, 5];
  let s = base * Math.pow(10, Math.floor(Math.log10(target / base))), i = 0, g = 0;
  while (s * m[i] < target) { i++; if (i === 3) { i = 0; s *= 10; } if (++g > 60) break; }
  return s * m[i];
}
function drawGrid() {
  if (!ST.grid) return;
  const s = gridStep();
  const wb = viewWorldBox(4);
  const x0 = Math.floor(wb[0] / s) * s, x1 = Math.ceil(wb[2] / s) * s;
  const y0 = Math.floor(wb[1] / s) * s, y1 = Math.ceil(wb[3] / s) * s;
  if ((x1 - x0) / s > 1400 || (y1 - y0) / s > 1400) return;
  rotCS();
  ctx.lineWidth = 1; ctx.setLineDash(DASH.solid);
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath(); ctx.strokeStyle = pass ? CO.gridM : CO.gridm;
    for (let x = x0; x <= x1 + EPS; x += s) {
      const major = Math.abs(Math.round(x / (s * 5)) * s * 5 - x) < s * 1e-6;
      if (major !== !!pass) continue;
      w2sI([x, y0]); ctx.moveTo(_sx, _sy);
      w2sI([x, y1]); ctx.lineTo(_sx, _sy);
    }
    for (let y = y0; y <= y1 + EPS; y += s) {
      const major = Math.abs(Math.round(y / (s * 5)) * s * 5 - y) < s * 1e-6;
      if (major !== !!pass) continue;
      w2sI([x0, y]); ctx.moveTo(_sx, _sy);
      w2sI([x1, y]); ctx.lineTo(_sx, _sy);
    }
    ctx.stroke();
  }
  ctx.lineWidth = 1.2;
  const ax = [w2s([x0, 0]), w2s([x1, 0])], ay = [w2s([0, y0]), w2s([0, y1])];
  ctx.strokeStyle = CO.axisX; ctx.beginPath(); ctx.moveTo(ax[0][0], ax[0][1]); ctx.lineTo(ax[1][0], ax[1][1]); ctx.stroke();
  ctx.strokeStyle = CO.axisY; ctx.beginPath(); ctx.moveTo(ay[0][0], ay[0][1]); ctx.lineTo(ay[1][0], ay[1][1]); ctx.stroke();
}

/* ---- primitive drawing ---- */
function pathPts(pts, closed) {
  if (!pts || !pts.length) return;
  rotCS();
  w2sI(pts[0]); ctx.moveTo(_sx, _sy);
  for (let i = 1; i < pts.length; i++) { w2sI(pts[i]); ctx.lineTo(_sx, _sy); }
  if (closed) ctx.closePath();
}
function pathArc(s) {
  const c = w2s(s.c), r = Math.abs(s.r * V.z);
  if (s.a0 == null) ctx.arc(c[0], c[1], r, 0, TAU);
  else ctx.arc(c[0], c[1], r, -(s.a1 + V.rot), -(s.a0 + V.rot));   /* canvas y is flipped */
}
/** world extent of a point list, in screen pixels — used to skip sub-pixel work */
function spanPx(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return Math.max(x1 - x0, y1 - y0) * V.z;
}
const SUBPIX = 0.4;                               /* below this a stroke cannot show */
function pathEnt(e) {
  ctx.beginPath();
  switch (e.t) {
    case 'line': pathPts([e.a, e.b]); break;
    case 'pline': case 'spline': pathPts(e.pts, e.closed); break;
    case 'circle': { const c = w2s(e.c); ctx.arc(c[0], c[1], Math.abs(e.r * V.z), 0, TAU); break; }
    case 'arc': { const c = w2s(e.c); ctx.arc(c[0], c[1], Math.abs(e.r * V.z), -(e.a1 + V.rot), -(e.a0 + V.rot)); break; }
    case 'ellipse': {
      const c = w2s(e.c);
      ctx.ellipse(c[0], c[1], Math.abs(e.rx * V.z), Math.abs(e.ry * V.z),
        -((e.rot || 0) + V.rot), -(e.a1 ?? TAU), -(e.a0 ?? 0));
      break;
    }
    case 'xline': case 'ray': { const q = xlineSeg(e); pathPts(q); break; }
    case 'point': {
      const p = w2s(e.p), r = 3.5;
      ctx.moveTo(p[0] - r, p[1]); ctx.lineTo(p[0] + r, p[1]);
      ctx.moveTo(p[0], p[1] - r); ctx.lineTo(p[0], p[1] + r); break;
    }
  }
}
function drawTextAt(str, p, h, rotAng, anchor, col) {
  if (HALO) return;                               /* text is never haloed — it smears */
  const s = w2s(p), hp = h * V.z;
  if (hp < 3) {
    if (hp < 0.6) return;                         /* smaller than a pixel: nothing to say */
    ctx.fillStyle = col + '80';
    ctx.fillRect(s[0], s[1] - 1, Math.max(4, String(str).length * hp * .6), 1.2);
    return;
  }
  ctx.save();
  ctx.translate(s[0], s[1]); ctx.rotate(-((rotAng || 0) + V.rot));
  ctx.fillStyle = col;
  ctx.font = '500 ' + hp.toFixed(1) + "px 'Inter',system-ui,sans-serif";
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = anchor === 'c' ? 'center' : anchor === 'r' ? 'right' : 'left';
  ctx.fillText(String(str), 0, 0);
  ctx.restore();
}
/* how heavy each architectural sub-line draws */
const ROLE_W = { face: 1.55, jamb: 1.0, leaf: 1.0, swing: 0.75, glaz: 0.85, tread: 0.85,
  cut: 0.8, arrow: 0.9, arrowhead: 0.9, room: 0.9, grid: 0.85, bubble: 1.0, cap: 1.55 };

/* ============================================================
   highlighting
   ------------------------------------------------------------
   Selection is a doubled stroke: a wide translucent halo underneath and a
   crisp, slightly heavier core on top, both in the selection amber. It reads
   instantly over a busy plan without hiding the geometry, and because the
   halo is always solid a dashed selected line still glows continuously.
   Hover is deliberately a different animal — pale cream core with a white
   halo, thinner — so pre-highlight can never be mistaken for a selection.
   ============================================================ */
const HL = {
  sel: { col: CO.sel, hcol: CO.sel, halo: 5.5, a: '3a', core: 1.4, fillA: 'aa', pocheA: '5c' },
  hot: { col: CO.hot, hcol: '#ffffff', halo: 3.2, a: '2e', core: 0.8, fillA: '77', pocheA: '46' },
  prev: { col: CO.prev, hcol: CO.prev, halo: 0, a: '00', core: 0.4, fillA: '55', pocheA: '2e' },
};
const HALO_MAX = 400;                             /* past this, glow would turn dense plans to mush */
let HALO = null;                                  /* the HL entry being drawn as an underlay */

/** set style and stroke in one go, honouring the halo underlay pass */
function strokeAs(col, lw, dash) {
  if (HALO) { ctx.strokeStyle = (HALO.hcol || col) + HALO.a; ctx.lineWidth = lw + HALO.halo; ctx.setLineDash(DASH.solid); }
  else { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash || DASH.solid); }
  ctx.stroke();
}

/* ---- wall poche ----
   The wall module owns the flag; the renderer only has to be defensive about
   the helper not existing yet. */
function pocheOn(e) {
  if (typeof wallHatchOn === 'function') { try { return !!wallHatchOn(e); } catch (_) { /* fall through */ } }
  if (e && e.hatch != null) return e.hatch !== false;
  return DOC.wallHatch !== false;
}
const GHOST_FACE_A = '66';                        /* a window leaves the wall ~60% transparent */
const GHOST_POCHE_MUL = 0.42;

/* ---- style batching ----
   Shapes of one entity that share lineweight and linetype become one path
   and one stroke. Buckets and their arrays are reused between frames.
   Only worth it once an entity has a real crowd of sub-lines — a door or a
   dimension is cheaper drawn straight through than sorted into buckets. */
const BATCH_MIN = 6;
const BUCK = new Map();
const BUCKUSED = [];
function bucketFor(key) {
  let a = BUCK.get(key);
  if (!a) { BUCK.set(key, a = { lw: 0, lt: null, col: null, items: [] }); }
  if (!a.items.length) BUCKUSED.push(a);
  return a;
}
function flushBuckets() {
  for (let i = 0; i < BUCKUSED.length; i++) {
    const b = BUCKUSED[i];
    if (!b.items.length) continue;
    ctx.beginPath();
    for (let k = 0; k < b.items.length; k++) {
      const s = b.items[k];
      if (s.pts) pathPts(s.pts, s.closed);
      else pathArc(s);
    }
    strokeAs(b.col, b.lw, dashFor(b.lt));
    b.items.length = 0;
  }
  BUCKUSED.length = 0;
}

function drawShapes(e, col, mode) {
  const list = entShapes(e);
  const n = list.length;
  if (!n) return;
  const S = mode ? HL[mode] : null;
  const baseLw = Math.max(1, Math.min(flw(e) * V.z, 6));
  const boost = S ? S.core : 0;
  const eLt = flt(e);
  const wall = e.t === 'wall';
  const poche = wall ? pocheOn(e) : true;
  const batch = n >= BATCH_MIN;
  let texts = null;
  for (let i = 0; i < n; i++) {
    const s = list[i];
    if (s.text != null) {
      if (!HALO) { (texts || (texts = [])).push(s); }
      continue;
    }
    const role = s.role;
    /* --- poche: a muted solid fill of the wall body, never stroked --- */
    if (role === 'poche' || role === 'pocheGhost') {
      if (HALO || !poche || !s.pts || s.pts.length < 3) continue;
      if (spanPx(s.pts) < 1) continue;            /* thinner than a pixel: the face lines say it all */
      let a = S ? S.pocheA : '2e';
      if (role === 'pocheGhost') a = alphaMul(a, GHOST_POCHE_MUL);
      ctx.beginPath(); pathPts(s.pts, true);
      ctx.fillStyle = col + a; ctx.fill();
      continue;
    }
    if (s.pts) {
      if (s.pts.length < 2) continue;
      if (spanPx(s.pts) < SUBPIX) continue;
    } else if (s.r != null) {
      if (Math.abs(s.r * V.z) < SUBPIX * 0.75) continue;
    } else continue;
    const lw = baseLw * (ROLE_W[role] || 1) + boost;
    const lt = s.lt || eLt;
    /* a window keeps the wall visible: same line, much softer */
    const scol = role === 'faceGhost' ? col + GHOST_FACE_A : col;
    /* filled shapes cannot be batched — they need their own path */
    if (!batch || s.fill || (s.closed && role === 'arrowhead')) {
      ctx.beginPath();
      if (s.pts) pathPts(s.pts, s.closed); else pathArc(s);
      if (!HALO && (s.fill || (s.closed && role === 'arrowhead'))) { ctx.fillStyle = scol; ctx.fill(); }
      strokeAs(scol, lw, dashFor(lt === 'solid' ? '' : lt));
      continue;
    }
    const b = bucketFor(scol + '|' + lw.toFixed(2) + '|' + lt);
    b.col = scol; b.lw = lw; b.lt = lt === 'solid' ? '' : lt;
    b.items.push(s);
  }
  flushBuckets();
  if (texts) for (let i = 0; i < texts.length; i++) {
    const s = texts[i];
    drawTextAt(s.text, s.p, s.h, s.rot, s.anchor, col);
  }
  ctx.setLineDash(DASH.solid);
}
/** scale a 2-digit hex alpha */
function alphaMul(a, k) {
  const v = Math.round(clamp(parseInt(a, 16) * k, 0, 255));
  return v.toString(16).padStart(2, '0');
}
function drawDim(e, col, mode) {
  const g = dimGeom(e), S = mode ? HL[mode] : null;
  const SY = g.S;
  ctx.fillStyle = col;
  const lw = Math.max(1, Math.min(flw(e) * V.z, 4)) + (S ? S.core : 0);
  ctx.beginPath();
  rotCS();
  for (const [a, b] of g.lines) { w2sI(a); ctx.moveTo(_sx, _sy); w2sI(b); ctx.lineTo(_sx, _sy); }
  strokeAs(col, lw, DASH.solid);
  if (!HALO) {
    for (const ar of g.arrows) {
      ctx.beginPath(); pathPts(arrowPoly(ar.p, ar.a, SY.arrow), true); ctx.fill();
    }
  }
  const hp = SY.txt * V.z;
  if (hp >= 3 && !HALO) {
    const tp = w2s(g.tp);
    ctx.save(); ctx.translate(tp[0], tp[1]); ctx.rotate(-(g.tr + V.rot));
    ctx.font = '500 ' + hp.toFixed(1) + "px 'JetBrains Mono',monospace";
    const wpx = ctx.measureText(g.txt).width;
    ctx.fillStyle = CO.bg; ctx.fillRect(-wpx / 2 - hp * .18, -hp * .82, wpx + hp * .36, hp * 1.05);
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(g.txt, 0, 0);
    ctx.restore();
  }
}
function drawEnt(e, mode) {
  const S = mode ? HL[mode] : null;
  const col = S ? S.col : fcol(e);
  if (e.t === 'dim') return drawDim(e, col, mode);
  if (e.t === 'text') return drawTextAt(e.s, e.p, e.h, e.rot, e.anchor, col);
  if (GEOM[e.t]) return drawShapes(e, col, mode);
  if (e.t === 'hatch') return drawHatch(e, col, mode);
  const lw = Math.max(1, Math.min(flw(e) * V.z, 6)) + (S ? S.core : 0);
  pathEnt(e);
  if (e.fill && !HALO) { ctx.fillStyle = col + (S ? S.fillA : '22'); ctx.fill(); }
  strokeAs(col, lw, dashFor(flt(e)));
  ctx.setLineDash(DASH.solid);
}
/** highlight pass: translucent halo underneath, crisp core on top */
function drawEntHL(e, mode) {
  const S = HL[mode];
  if (S && S.halo && SEL.size <= HALO_MAX) { HALO = S; try { drawEnt(e, mode); } finally { HALO = null; } }
  drawEnt(e, mode);
}
/* ---- hatch ---- */
function drawHatch(e, col, mode) {
  const loops = e.loops || [];
  if (!loops.length) return;
  const S = mode ? HL[mode] : null;
  if (!HALO) {
    ctx.save();
    ctx.beginPath();
    for (const L of loops) pathPts(L, true);
    ctx.clip('evenodd');
    if (e.solid) {
      ctx.fillStyle = col + (S ? S.fillA : '55');
      /* the clip already bounds this; a viewport fill is correct at any view angle */
      ctx.fillRect(0, 0, V.w, V.h);
    } else {
      const sp = Math.max((e.sp || 100) * V.z, 3);
      const a = rad(e.hatchAng ?? 45);
      const b = bbox(e);
      /* screen AABB of the world box — all four corners, so it still covers
         the loops when the view is rotated */
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      rotCS();
      for (const q of [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]) {
        w2sI(q);
        if (_sx < x0) x0 = _sx; if (_sx > x1) x1 = _sx;
        if (_sy < y0) y0 = _sy; if (_sy > y1) y1 = _sy;
      }
      const diag = hyp(x1 - x0, y1 - y0) + sp * 2;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (isFinite(diag) && diag / sp < 6000) {
        ctx.translate(cx, cy);
        ctx.rotate(-(a + V.rot));                 /* hatch angle is a world angle */
        ctx.strokeStyle = col + (S ? 'ff' : 'aa');
        ctx.lineWidth = 1; ctx.setLineDash(DASH.solid);
        ctx.beginPath();
        for (let y = -diag / 2; y <= diag / 2; y += sp) { ctx.moveTo(-diag / 2, y); ctx.lineTo(diag / 2, y); }
        if (e.pattern === 'cross') for (let x = -diag / 2; x <= diag / 2; x += sp) { ctx.moveTo(x, -diag / 2); ctx.lineTo(x, diag / 2); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.beginPath(); for (const L of loops) pathPts(L, true);
  strokeAs(col, S ? 1 + S.core : 1, DASH.solid);
}

/* ---- grips ---- */
function drawGrips() {
  if (SEL.size > 80) return;
  ctx.setLineDash(DASH.solid);
  for (const id of SEL) {
    const e = DOC.ents.get(id); if (!e) continue;
    for (const g of gripsOf(e)) {
      const s = w2s(g.p);
      const hot = ST.hotGrip && ST.hotGrip.id === id && dist2(ST.hotGrip.p, g.p) < 1e-12;
      ctx.fillStyle = hot ? CO.gripHot : CO.grip;
      ctx.fillRect(s[0] - 3.5, s[1] - 3.5, 7, 7);
      ctx.strokeStyle = CO.bg; ctx.lineWidth = 1; ctx.strokeRect(s[0] - 3.5, s[1] - 3.5, 7, 7);
    }
  }
}
/* ---- snap marker ---- */
const SNAP_GLYPH = {
  end: (x, y, r) => ctx.strokeRect(x - r, y - r, r * 2, r * 2),
  mid: (x, y, r) => { ctx.beginPath(); ctx.moveTo(x - r, y + r); ctx.lineTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.closePath(); ctx.stroke(); },
  cen: (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); },
  quad: (x, y, r) => { ctx.beginPath(); ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r * 1.3, y); ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r * 1.3, y); ctx.closePath(); ctx.stroke(); },
  int: (x, y, r) => { ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke(); },
  perp: (x, y, r) => { ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x - r, y + r); ctx.lineTo(x + r, y + r); ctx.moveTo(x - r, y); ctx.lineTo(x, y); ctx.lineTo(x, y + r); ctx.stroke(); },
  tan: (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.moveTo(x - r * 1.4, y - r); ctx.lineTo(x + r * 1.4, y - r); ctx.stroke(); },
  near: (x, y, r) => { ctx.beginPath(); ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y - r); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.stroke(); },
  grid: (x, y, r) => { ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke(); },
  ext: (x, y, r) => { ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke(); },
  node: (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r * .8, 0, TAU); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.stroke(); },
  wall: (x, y, r) => { ctx.strokeRect(x - r, y - r * .6, r * 2, r * 1.2); },
};
/* snap glyphs are screen-aligned, exactly as AutoCAD draws them: the marker
   stays square no matter how the view is rotated */
function drawSnap() {
  const s = ST.snap; if (!s) return;
  const p = w2s(s.p);
  if (!isFinite(p[0]) || !isFinite(p[1])) return;
  ctx.strokeStyle = CO.snap; ctx.lineWidth = 1.6; ctx.setLineDash(DASH.solid);
  (SNAP_GLYPH[s.k] || SNAP_GLYPH.near)(p[0], p[1], 6);
  ctx.fillStyle = CO.snap; ctx.font = "500 9.5px 'JetBrains Mono',monospace";
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(s.k.toUpperCase(), p[0] + 10, p[1] + 8);
}
function drawTracks() {
  if (!ST.tracks || !ST.tracks.length) return;
  ctx.save(); ctx.strokeStyle = CO.snap + '55'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath();
  rotCS();
  for (const t of ST.tracks) { w2sI(t[0]); ctx.moveTo(_sx, _sy); w2sI(t[1]); ctx.lineTo(_sx, _sy); }
  ctx.stroke(); ctx.restore();
}
/* ---- crosshair ----
   ST.crossLen is a percentage of the viewport, like AutoCAD's CURSORSIZE:
   100 gives the classic full-screen crosshair, anything less gives short arms
   around the cursor. The pick box only joins in when no command is running. */
function drawCursor() {
  if (!ST.cur) return;
  const p = w2s(ST.cur);
  if (!isFinite(p[0]) || !isFinite(p[1])) return;
  const x = Math.round(p[0]) + .5, y = Math.round(p[1]) + .5;
  let pct = ST.crossLen == null ? 100 : +ST.crossLen;
  if (!isFinite(pct)) pct = 100;
  pct = clamp(pct, 1, 100);
  ctx.strokeStyle = CO.cross; ctx.lineWidth = 1; ctx.setLineDash(DASH.solid);
  ctx.beginPath();
  if (pct >= 100) {
    ctx.moveTo(0, y); ctx.lineTo(V.w, y);
    ctx.moveTo(x, 0); ctx.lineTo(x, V.h);
  } else {
    const arm = Math.max(6, pct / 100 * Math.min(V.w, V.h) / 2);
    ctx.moveTo(x - arm, y); ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm); ctx.lineTo(x, y + arm);
  }
  ctx.stroke();
  if (typeof showPickBox === 'function' && !showPickBox()) return;
  const b = Math.max(2, +ST.pickBox || 8);
  ctx.strokeStyle = CO.crossBox;
  ctx.strokeRect(x - b / 2, y - b / 2, b, b);
}
function drawBand() {
  const b = ST.band; if (!b) return;
  const a = w2s(b.a), c = w2s(b.b);
  const x = Math.min(a[0], c[0]), y = Math.min(a[1], c[1]);
  const w = Math.abs(c[0] - a[0]), h = Math.abs(c[1] - a[1]);
  const crossing = b.b[0] < b.a[0];
  ctx.setLineDash(crossing ? [5, 4] : DASH.solid);
  ctx.strokeStyle = crossing ? CO.bandCross : CO.bandIn;
  ctx.fillStyle = (crossing ? CO.bandCross : CO.bandIn) + '1e';
  ctx.lineWidth = 1; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
  ctx.setLineDash(DASH.solid);
}

/* ---- main ---- */
let _raf = 0;
const BACK = [], FRONT = [];
function draw() { if (!_raf) _raf = requestAnimationFrame(paint); }
function paint() {
  _raf = 0;
  shapeCacheSync();
  HALO = null;
  ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  ctx.clearRect(0, 0, V.w, V.h);
  ctx.fillStyle = CO.bg; ctx.fillRect(0, 0, V.w, V.h);
  frameLayers();
  rotCS();
  drawGrid();
  const wb = viewWorldBox(40);
  const list = query(wb[0], wb[1], wb[2], wb[3]);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  /* hatches and rooms sit under everything else */
  BACK.length = 0; FRONT.length = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!fvis(e) || SEL.has(e.id)) continue;
    (e.t === 'hatch' || e.t === 'room' ? BACK : FRONT).push(e);
  }
  for (let i = 0; i < BACK.length; i++) drawEnt(BACK[i]);
  for (let i = 0; i < FRONT.length; i++) drawEnt(FRONT[i]);
  if (ST.hot && !SEL.has(ST.hot)) { const e = DOC.ents.get(ST.hot); if (e && fvis(e)) drawEntHL(e, 'hot'); }
  if (SEL.size) for (const id of SEL) { const e = DOC.ents.get(id); if (e && fvis(e)) drawEntHL(e, 'sel'); }
  if (ST.preview) for (const e of ST.preview) drawEnt(e, 'prev');
  drawGrips();
  drawTracks();
  drawBand();
  drawSnap();
  drawCursor();
  ctx.setLineDash(DASH.solid);
  BACK.length = 0; FRONT.length = 0;
}
