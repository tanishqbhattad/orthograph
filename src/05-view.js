/* ============================================================
   ORTHOGRAPH — 05 viewport and renderer
   ============================================================ */
const cv = document.getElementById('cv');
/* An opaque context: the page never shows through the drawing area, and
   dropping the alpha channel measurably cheapens every fill and stroke. */
let ctx = cv.getContext('2d', { alpha: false }) || cv.getContext('2d');
/* rot rotates the *view*, not the model: world coordinates never change,
   so ortho, snapping and every stored entity stay in true world space. */
const V = { z: 1, px: 0, py: 0, w: 0, h: 0, dpr: 1, rot: 0, kx: 1, ky: 1 };

/* ---- view system variables ----
   AutoCAD keeps these as system variables and so do we, under the names it
   uses, so LWDISPLAY / LTSCALE / GRIDMAJOR / ZOOMFACTOR mean what a drafter
   expects when they type them. */
const VS = {
  ltScale: 1,             /* LTSCALE — multiplies every dash pattern           */
  gridMajor: 5,           /* GRIDMAJOR — minor lines between two major ones    */
  gridSub: true,          /* adaptive subdivision below the nominal spacing    */
  zoomFactor: 60,         /* ZOOMFACTOR — wheel step, per AutoCAD's 3..100     */
  ucsIcon: true,          /* UCSICON                                          */
  ucsOrigin: true,        /* UCSICON Origin: sit on 0,0 when it is on screen   */
  vtDuration: 260,        /* VTDURATION — animated view transitions, ms        */
  coords: 1,              /* COORDS — 0 off, 1 absolute, 2 relative            */
};
const CO = {
  /* AutoCAD's dark model space, RGB 33/40/48 — light enough that a 1px grey
     grid reads, dark enough that white geometry is not glare. */
  bg: '#212830',
  gridm: '#39434f', gridM: '#4d5a69',
  axisX: '#c0524f', axisY: '#5f9f6f',
  sel: '#ffd166', hot: '#ffe6a3', snap: '#4ee6a8', prev: '#6ba8ff',
  grip: '#3f7fff', gripHot: '#4ee6a8', tx: '#8d9aab',
  cross: '#ffffff', ucsX: '#e05263', ucsY: '#5fbf7f',
};
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

/* ============================================================
   device pixels
   ------------------------------------------------------------
   The renderer works in CSS pixels and the canvas is backed at the display's
   own resolution, so a "1px" line has to be asked for as one *device* pixel
   or it lands on one and a half and blurs. HAIR is that width, and snapS puts
   an axis-aligned stroke exactly on the device grid.
   ============================================================ */
let HAIR = 1;
function deviceMetrics() {
  const c = ctx && ctx.canvas;
  const kx = (c && c.width && V.w) ? c.width / V.w : (V.dpr || 1);
  const ky = (c && c.height && V.h) ? c.height / V.h : (V.dpr || 1);
  V.kx = isFinite(kx) && kx > 0 ? kx : 1;
  V.ky = isFinite(ky) && ky > 0 ? ky : 1;
  HAIR = 1 / V.kx;
}
/** put a stroke of device width wd on the device pixel grid */
function snapS(v, k, wd) {
  const h = (Math.round(wd) & 1) ? 0.5 : 0;
  return (Math.round(v * k - h) + h) / k;
}
const snapXd = (x, wd) => snapS(x, V.kx, wd || 1);
const snapYd = (y, wd) => snapS(y, V.ky, wd || 1);

const DPR_MAX = 3;                                /* past this the fill rate costs more than it shows */
function resize() {
  const r = cv.getBoundingClientRect();
  V.dpr = clamp(window.devicePixelRatio || 1, 0.5, DPR_MAX);
  V.w = r.width || V.w || 1200; V.h = r.height || V.h || 800;
  const bw = Math.max(1, Math.round(V.w * V.dpr)), bh = Math.max(1, Math.round(V.h * V.dpr));
  /* assigning width/height resets the whole context, so only do it on a real
     change — a ResizeObserver fires far more often than the size moves */
  if (cv.width !== bw) cv.width = bw;
  if (cv.height !== bh) cv.height = bh;
  deviceMetrics();
  draw();
}

/* ============================================================
   zoom and pan
   ============================================================ */
/* 1e-7 shows a 400km sheet on a laptop; 1e5 is roughly 26000:1 on a 96dpi
   screen. Both ends stay well inside the double precision the transform has. */
const ZMIN = 1e-7, ZMAX = 1e5;
const ZPREV = [];                                 /* ZOOM Previous — AutoCAD keeps ten */
const ZPREV_MAX = 10;
function viewState() { return { z: V.z, px: V.px, py: V.py, rot: V.rot }; }
function pushView(st) {
  const s = st || viewState();
  const t = ZPREV[ZPREV.length - 1];
  if (t && t.z === s.z && t.px === s.px && t.py === s.py && t.rot === s.rot) return;
  ZPREV.push(s);
  if (ZPREV.length > ZPREV_MAX) ZPREV.shift();
}
function zoomPrev() {
  const s = ZPREV.pop();
  if (!s) { if (typeof echo === 'function') echo('No previous view'); return false; }
  animView(s, true);
  return true;
}

/** Zoom about a screen point. The world point under (sx,sy) is pinned exactly:
    the correction is done in the rotated screen frame, so it is independent of
    the view angle and free of the round-trip error a world-space fix carries. */
function zoomAt(sx, sy, f) {
  const nz = clamp(V.z * f, ZMIN, ZMAX);
  if (!(nz > 0) || nz === V.z) return;
  const k = nz / V.z;
  V.px = sx - (sx - V.px) * k;
  V.py = sy - (sy - V.py) * k;
  V.z = nz;
  cancelAnim();
  draw(); syncViewUI();
}
/** the wheel step AutoCAD's ZOOMFACTOR describes, over `notches` detents */
function wheelFactor(notches) {
  const zf = clamp(+VS.zoomFactor || 60, 3, 100);
  return Math.pow(1 + zf / 100, -notches);
}

/* ---- view transitions ----
   AutoCAD eases between two views rather than jumping (VTENABLE). Zoom is
   interpolated in log space and the view centre linearly, which is what keeps
   the drawing from swooping sideways on the way. */
const ANIM_OK = typeof ORTHO_HEADLESS === 'undefined';
let _anim = null;
function cancelAnim() { _anim = null; }
/** centre of the viewport in the rotated frame — rotation is invariant here */
function viewCentreR(s) { return [(V.w / 2 - s.px) / s.z, -(V.h / 2 - s.py) / s.z]; }
function applyCentreR(z, rx, ry) {
  V.z = z; V.px = V.w / 2 - rx * z; V.py = V.h / 2 + ry * z;
}
const easeIO = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
function setView(s) {
  V.z = clamp(s.z, ZMIN, ZMAX); V.px = s.px; V.py = s.py;
  if (s.rot != null) V.rot = s.rot;
  draw(); syncViewUI();
}
function animView(to, anim) {
  cancelAnim();
  if (!anim || !ANIM_OK || !VS.vtDuration) return setView(to);
  const from = viewState();
  if (from.rot !== (to.rot != null ? to.rot : from.rot)) return setView(to);
  const a = viewCentreR(from), b = viewCentreR(to);
  const lz0 = Math.log(from.z), lz1 = Math.log(clamp(to.z, ZMIN, ZMAX));
  /* nothing to look at */
  if (Math.abs(lz1 - lz0) < 1e-6 && Math.abs(a[0] - b[0]) * to.z < 1 && Math.abs(a[1] - b[1]) * to.z < 1)
    return setView(to);
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const job = _anim = { end: to };
  const step = () => {
    if (_anim !== job) return;
    const nowT = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const u = clamp((nowT - t0) / VS.vtDuration, 0, 1), e = easeIO(u);
    applyCentreR(Math.exp(lz0 + (lz1 - lz0) * e), a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e);
    syncViewUI();
    if (u < 1) { paint(); requestAnimationFrame(step); }
    else { _anim = null; setView(to); }
  };
  requestAnimationFrame(step);
}

/** the view that frames a world box with AutoCAD's small margin */
function viewForBox(b, fill) {
  const cr = Math.cos(V.rot), sr = Math.sin(V.rot);
  const corners = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]
    .map(p => [p[0] * cr - p[1] * sr, p[0] * sr + p[1] * cr]);
  const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
  const w = Math.max(Math.max(...xs) - Math.min(...xs), 1e-3);
  const h = Math.max(Math.max(...ys) - Math.min(...ys), 1e-3);
  const k = fill || 0.94;
  const z = clamp(Math.min(V.w * k / w, V.h * k / h), ZMIN, ZMAX);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { z, px: V.w / 2 - cx * z, py: V.h / 2 + cy * z, rot: V.rot };
}
/** ZOOM Extents. Synchronous by default — importers and tests rely on that. */
function fit(list, anim) {
  const b = bboxAll(list || [...DOC.ents.values()].filter(visible));
  const to = b ? viewForBox(b) : { z: 1, px: V.w / 2, py: V.h / 2, rot: V.rot };
  if (anim) pushView();
  animView(to, anim);
  return to;
}
/** ZOOM All: the drawing limits, or the extents when they are bigger */
function zoomAll(anim) {
  const b = bboxAll([...DOC.ents.values()].filter(visible));
  const L = DOC.limits;
  let box = b;
  if (L && L.length === 4) {
    box = b ? [Math.min(b[0], L[0]), Math.min(b[1], L[1]), Math.max(b[2], L[2]), Math.max(b[3], L[3])]
      : L.slice();
  }
  if (anim) pushView();
  animView(box ? viewForBox(box) : { z: 1, px: V.w / 2, py: V.h / 2, rot: V.rot }, anim);
}
/** ZOOM Window, from two world points */
function zoomWindow(a, b, anim) {
  const box = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  if (box[2] - box[0] < 1e-9 && box[3] - box[1] < 1e-9) return;
  if (anim) pushView();
  animView(viewForBox(box, 1), anim);
}
/** ZOOM Center: centre on a point, optional new height in drawing units */
function zoomCenter(p, height, anim) {
  const z = height > 0 ? clamp(V.h / height, ZMIN, ZMAX) : V.z;
  const cr = Math.cos(V.rot), sr = Math.sin(V.rot);
  const rx = p[0] * cr - p[1] * sr, ry = p[0] * sr + p[1] * cr;
  if (anim) pushView();
  animView({ z, px: V.w / 2 - rx * z, py: V.h / 2 + ry * z, rot: V.rot }, anim);
}
/** ZOOM Scale. `rel` multiplies the current view (2x); absolute scales the
    drawing itself (2 = twice the ZOOM All view, 2xp is paper-relative). */
function zoomScale(f, rel, anim) {
  if (!(f > 0)) return;
  if (rel) {
    const nz = clamp(V.z * f, ZMIN, ZMAX);
    if (anim) pushView();
    const c = viewCentreR(viewState());
    animView({ z: nz, px: V.w / 2 - c[0] * nz, py: V.h / 2 + c[1] * nz, rot: V.rot }, anim);
    return;
  }
  const b = bboxAll([...DOC.ents.values()].filter(visible));
  const base = b ? viewForBox(b).z : 1;
  const nz = clamp(base * f, ZMIN, ZMAX);
  if (anim) pushView();
  const c = viewCentreR(viewState());
  animView({ z: nz, px: V.w / 2 - c[0] * nz, py: V.h / 2 + c[1] * nz, rot: V.rot }, anim);
}
/** hook the shell overwrites — the renderer must not depend on the UI existing */
function syncViewUI() {
  if (typeof onViewChanged === 'function') onViewChanged();
}

/* ============================================================
   linetypes
   ------------------------------------------------------------
   Dash patterns are drawing-unit lengths straight out of acadiso.lin, scaled
   by LTSCALE and the zoom — so a dashed line keeps its pattern in the model,
   grows smoothly instead of shimmering, and (exactly as in AutoCAD) reads as
   solid once the whole pattern is smaller than a few pixels.
   ============================================================ */
const LTDEF = {
  dashed: [12.7, 6.35],
  hidden: [6.35, 3.175],
  center: [31.75, 6.35, 6.35, 6.35],
  dashdot: [12.7, 6.35, 0, 6.35],
  phantom: [31.75, 6.35, 6.35, 6.35, 6.35, 6.35],
  dot: [0, 6.35],
  border: [12.7, 6.35, 12.7, 6.35, 0, 6.35],
  divide: [12.7, 6.35, 0, 6.35, 0, 6.35],
};
const DASH_SOLID = [];
const DASH = { solid: DASH_SOLID };                /* legacy handle */
const LT_MIN_PX = 3.5;                             /* below this a pattern is only shimmer */
const LT_MAX_PX = 40000;                           /* above this it is one dash anyway */
const _dashC = new Map();
let _dashK = 0;                                    /* world mm -> screen px, incl. LTSCALE */
function ltScale() { const s = DOC.ltScale != null ? DOC.ltScale : VS.ltScale; return s > 0 ? s : 1; }
function dashSync() { _dashK = V.z * ltScale(); }
function dashFor(lt) {
  if (!lt || lt === 'solid') return DASH_SOLID;
  const def = LTDEF[lt];
  if (!def) return DASH_SOLID;
  let c = _dashC.get(lt);
  if (!c) _dashC.set(lt, c = { k: NaN, dot: NaN, arr: new Array(def.length), solid: false });
  const dot = Math.max(HAIR, 0.75);
  if (c.k !== _dashK || c.dot !== dot) {
    c.k = _dashK; c.dot = dot;
    let per = 0;
    for (let i = 0; i < def.length; i++) {
      const v = def[i] === 0 ? dot : def[i] * _dashK;   /* a zero-length dash is a dot */
      c.arr[i] = v; per += v;
    }
    c.solid = !(per > LT_MIN_PX && per < LT_MAX_PX);
  }
  return c.solid ? DASH_SOLID : c.arr;
}

/* ============================================================
   lineweights
   ------------------------------------------------------------
   A lineweight is a *plot* width in millimetres, not a model dimension: it is
   the same thickness on screen however far you zoom, which is what makes a
   0.5mm pen look like a 0.5mm pen. LWDISPLAY (the status bar's LWT) turns
   that on; with it off, everything draws as AutoCAD's one-pixel hairline.
   ============================================================ */
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
let LW_ON = true;
function lwPx(mm) {
  if (!LW_ON) return HAIR;
  const w = (mm > 0 ? mm : 0) * PX_PER_MM;
  return w > HAIR ? w : HAIR;
}

/* ---- per-frame layer resolution ----
   layer() is a linear find over DOC.layers and the renderer asks for colour,
   linetype, lineweight and visibility of every entity — four scans each.
   Rebuilding a name->layer map once per frame makes that O(1) and can never
   go stale, because it is thrown away at the end of the frame. */
const FALLBACK_LAYER = { name: '0', color: '#d7dee8', on: true, lock: false, lw: LW_DEFAULT, lt: 'solid' };
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

/* ============================================================
   grid
   ------------------------------------------------------------
   AutoCAD's modern grid: lines rather than dots, every GRIDMAJOR-th one
   emphasised, the spacing stepping up and down a 1-2-5 ladder anchored on
   GRIDUNIT so the lines you see are always real multiples of the snap. The
   minor lines fade out as they crowd instead of collapsing into moiré.
   ============================================================ */
const GRID_MIN_PX = 9, GRID_FADE_PX = 20, GRID_MAX_PX = 96, GRID_MAX_LINES = 1600;
/** step up (dir 1) or down (dir -1) the 1-2-5 ladder from a value */
function ladder(s, dir) {
  const e = Math.round(Math.log10(Math.abs(s) || 1) * 1e6) / 1e6;
  const dec = Math.pow(10, Math.floor(e));
  const m = s / dec;                               /* ~1, 2 or 5 */
  if (dir > 0) return m < 1.5 ? dec * 2 : m < 3.5 ? dec * 5 : dec * 10;
  return m > 3.5 ? dec * 2 : m > 1.5 ? dec : dec / 2;
}
function gridStep() {
  const base = DOC.gridStep > 0 ? DOC.gridStep : 1;
  let s = base, g = 0;
  while (s * V.z < GRID_MIN_PX && g++ < 90) s = ladder(s, 1);
  if (VS.gridSub) while (s * V.z > GRID_MAX_PX && g++ < 180) s = ladder(s, -1);
  return s > 0 && isFinite(s) ? s : base;
}
const smooth = (v, a, b) => { const u = clamp((v - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
function drawGrid() {
  if (!ST.grid) return;
  const s = gridStep();
  const maj = Math.max(2, Math.round(VS.gridMajor) || 5);
  const minorPx = s * V.z, majorPx = minorPx * maj;
  if (!(minorPx > 0) || !isFinite(minorPx)) return;
  const wb = viewWorldBox(4);
  const step = minorPx < GRID_MIN_PX ? s * maj : s;   /* too dense: only the major lines survive */
  const x0 = Math.floor(wb[0] / step) * step, x1 = Math.ceil(wb[2] / step) * step;
  const y0 = Math.floor(wb[1] / step) * step, y1 = Math.ceil(wb[3] / step) * step;
  if ((x1 - x0) / step > GRID_MAX_LINES || (y1 - y0) / step > GRID_MAX_LINES) return;
  /* fade rather than crowd — a grid that thins out never turns into moiré */
  const aMin = smooth(minorPx, GRID_MIN_PX, GRID_FADE_PX);
  const aMaj = smooth(majorPx, GRID_MIN_PX, GRID_FADE_PX * 1.6);
  if (aMaj <= 0.02) return;
  rotCS();
  ctx.lineWidth = HAIR; ctx.setLineDash(DASH_SOLID); ctx.lineDashOffset = 0;
  const flat = !V.rot;                             /* only an unrotated grid can sit on the pixel grid */
  const majStep = s * maj, tol = step * 1e-6;
  for (let pass = 0; pass < 2; pass++) {
    const a = pass ? aMaj : aMin;
    if (a <= 0.02) continue;
    if (!pass && minorPx < GRID_MIN_PX) continue;
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.strokeStyle = pass ? CO.gridM : CO.gridm;
    for (let x = x0; x <= x1 + tol; x += step) {
      const major = Math.abs(Math.round(x / majStep) * majStep - x) < tol;
      if (major !== !!pass) continue;
      if (flat) {
        const sx = snapXd(x * V.z + V.px, 1);
        ctx.moveTo(sx, -1); ctx.lineTo(sx, V.h + 1);
      } else { w2sI([x, y0]); ctx.moveTo(_sx, _sy); w2sI([x, y1]); ctx.lineTo(_sx, _sy); }
    }
    for (let y = y0; y <= y1 + tol; y += step) {
      const major = Math.abs(Math.round(y / majStep) * majStep - y) < tol;
      if (major !== !!pass) continue;
      if (flat) {
        const sy = snapYd(-y * V.z + V.py, 1);
        ctx.moveTo(-1, sy); ctx.lineTo(V.w + 1, sy);
      } else { w2sI([x0, y]); ctx.moveTo(_sx, _sy); w2sI([x1, y]); ctx.lineTo(_sx, _sy); }
    }
    ctx.stroke();
  }
  /* the grid's own axes, exactly as AutoCAD tints them */
  ctx.globalAlpha = clamp(aMaj, 0, 1) * 0.85;
  ctx.lineWidth = Math.max(HAIR, 1);
  const ax = [w2s([x0, 0]), w2s([x1, 0])], ay = [w2s([0, y0]), w2s([0, y1])];
  ctx.strokeStyle = CO.axisX; ctx.beginPath(); ctx.moveTo(ax[0][0], ax[0][1]); ctx.lineTo(ax[1][0], ax[1][1]); ctx.stroke();
  ctx.strokeStyle = CO.axisY; ctx.beginPath(); ctx.moveTo(ay[0][0], ay[0][1]); ctx.lineTo(ay[1][0], ay[1][1]); ctx.stroke();
  ctx.globalAlpha = 1;
}

/* ============================================================
   path building
   ------------------------------------------------------------
   Canvas keeps path points in 32-bit floats and simply drops geometry once
   the numbers get large: at 1000:1 a long line disappears entirely. Every
   path is therefore clipped in screen space first, which keeps the numbers
   small and extreme zoom exact. CLIPW is the world box that corresponds to
   the padded screen rect, so the common case costs one compare per point.
   ============================================================ */
const CLIP_PAD = 2400;
let CLIPW = [-Infinity, -Infinity, Infinity, Infinity];
let CX0 = 0, CY0 = 0, CX1 = 0, CY1 = 0;
function clipSync() {
  CX0 = -CLIP_PAD; CY0 = -CLIP_PAD; CX1 = V.w + CLIP_PAD; CY1 = V.h + CLIP_PAD;
  CLIPW = viewWorldBox(CLIP_PAD);
}
function inClipW(p) { return p[0] >= CLIPW[0] && p[0] <= CLIPW[2] && p[1] >= CLIPW[1] && p[1] <= CLIPW[3]; }

/* Liang–Barsky, one subpath per visible run */
function clipOpen(pts) {
  let ax = 0, ay = 0, bx = 0, by = 0, open = false, lx = NaN, ly = NaN;
  w2sI(pts[0]); ax = _sx; ay = _sy;
  for (let i = 1; i < pts.length; i++) {
    w2sI(pts[i]); bx = _sx; by = _sy;
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    let keep = true;
    for (let e = 0; e < 4 && keep; e++) {
      const p = e === 0 ? -dx : e === 1 ? dx : e === 2 ? -dy : dy;
      const q = e === 0 ? ax - CX0 : e === 1 ? CX1 - ax : e === 2 ? ay - CY0 : CY1 - ay;
      if (p === 0) { if (q < 0) keep = false; }
      else { const r = q / p; if (p < 0) { if (r > t1) keep = false; else if (r > t0) t0 = r; } else { if (r < t0) keep = false; else if (r < t1) t1 = r; } }
    }
    if (keep) {
      const sx0 = ax + dx * t0, sy0 = ay + dy * t0, sx1 = ax + dx * t1, sy1 = ay + dy * t1;
      if (!open || Math.abs(sx0 - lx) > 1e-6 || Math.abs(sy0 - ly) > 1e-6) { ctx.moveTo(sx0, sy0); open = true; }
      ctx.lineTo(sx1, sy1); lx = sx1; ly = sy1;
      if (t1 < 1) open = false;
    } else open = false;
    ax = bx; ay = by;
  }
}
/* Sutherland–Hodgman, so a clipped ring still fills correctly */
let _shA = [], _shB = [];
function clipClosed(pts) {
  _shA.length = 0;
  for (let i = 0; i < pts.length; i++) { w2sI(pts[i]); _shA.push(_sx, _sy); }
  let src = _shA, dst = _shB;
  for (let e = 0; e < 4; e++) {
    dst.length = 0;
    const n = src.length / 2;
    if (!n) break;
    const inside = (x, y) => e === 0 ? x >= CX0 : e === 1 ? x <= CX1 : e === 2 ? y >= CY0 : y <= CY1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x0 = src[i * 2], y0 = src[i * 2 + 1], x1 = src[j * 2], y1 = src[j * 2 + 1];
      const i0 = inside(x0, y0), i1 = inside(x1, y1);
      if (i0) dst.push(x0, y0);
      if (i0 !== i1) {
        const bound = e === 0 ? CX0 : e === 1 ? CX1 : e === 2 ? CY0 : CY1;
        const t = e < 2 ? (bound - x0) / (x1 - x0) : (bound - y0) / (y1 - y0);
        if (isFinite(t)) dst.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      }
    }
    const tmp = src; src = dst; dst = tmp;
  }
  _shA = src === _shA ? _shA : src; _shB = dst;
  const n = src.length / 2;
  if (n < 2) return;
  ctx.moveTo(src[0], src[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(src[i * 2], src[i * 2 + 1]);
  ctx.closePath();
}
function pathPts(pts, closed) {
  const n = pts && pts.length;
  if (!n) return;
  rotCS();
  let far = false;
  for (let i = 0; i < n; i++) if (!inClipW(pts[i])) { far = true; break; }
  if (far) { if (closed) clipClosed(pts); else clipOpen(pts); return; }
  w2sI(pts[0]); ctx.moveTo(_sx, _sy);
  for (let i = 1; i < n; i++) { w2sI(pts[i]); ctx.lineTo(_sx, _sy); }
  if (closed) ctx.closePath();
}

/* An arc whose screen radius runs to millions has the same float problem, and
   canvas cannot clip it for us. Past that size only the sliver crossing the
   viewport matters, and a huge radius needs very few chords to stay under a
   quarter-pixel of sag — so tessellating that sliver is both exact and cheap. */
const BIG_R = 30000;
function pathBigArc(cx, cy, r, a0, a1) {
  const bx = (CX0 + CX1) / 2, by = (CY0 + CY1) / 2;
  const R = hyp(CX1 - CX0, CY1 - CY0) / 2;
  const d = hyp(bx - cx, by - cy);
  if (d - r > R || r - d > R) return;               /* the circle misses the viewport disc */
  const base = Math.atan2(by - cy, bx - cx);
  let half = Math.PI;
  if (d > 1e-9) {
    const c = (d * d + r * r - R * R) / (2 * d * r);
    if (c > 1) return;
    if (c > -1) half = Math.acos(c);
  }
  let s = a0, e = a1;
  while (e < s) e += TAU;
  /* intersect [s,e] with the visible window around `base` */
  let ws = base - half, we = base + half;
  while (ws < s - TAU) { ws += TAU; we += TAU; }
  while (ws > s) { ws -= TAU; we -= TAU; }
  const runs = [];
  for (let k = 0; k < 3; k++) {
    const a = Math.max(s, ws + k * TAU), b = Math.min(e, we + k * TAU);
    if (b > a) runs.push([a, b]);
  }
  const stepA = Math.min(Math.PI / 8, 2 * Math.asin(clamp(Math.sqrt(2 * 0.25 / r), 0, 1)) || Math.PI / 8);
  for (const [a, b] of runs) {
    const n = clamp(Math.ceil((b - a) / stepA), 1, 4096);
    for (let i = 0; i <= n; i++) {
      const t = a + (b - a) * i / n, x = cx + Math.cos(t) * r, y = cy + Math.sin(t) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
}
function arcPath(cx, cy, r, a0, a1) {
  if (r > BIG_R || !isFinite(r)) { pathBigArc(cx, cy, r, a0, a1); return; }
  ctx.arc(cx, cy, r, a0, a1);
}
function pathArc(s) {
  const c = w2s(s.c), r = Math.abs(s.r * V.z);
  if (s.a0 == null) arcPath(c[0], c[1], r, 0, TAU);
  else arcPath(c[0], c[1], r, -(s.a1 + V.rot), -(s.a0 + V.rot));   /* canvas y is flipped */
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
    case 'circle': { const c = w2s(e.c); arcPath(c[0], c[1], Math.abs(e.r * V.z), 0, TAU); break; }
    case 'arc': { const c = w2s(e.c); arcPath(c[0], c[1], Math.abs(e.r * V.z), -(e.a1 + V.rot), -(e.a0 + V.rot)); break; }
    case 'ellipse': {
      const c = w2s(e.c), rx = Math.abs(e.rx * V.z), ry = Math.abs(e.ry * V.z);
      if (Math.max(rx, ry) > BIG_R) break;         /* off the numeric cliff; the caller culls it */
      ctx.ellipse(c[0], c[1], rx, ry,
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
  if (s[0] < -4000 || s[0] > V.w + 4000 || s[1] < -4000 || s[1] > V.h + 4000) return;
  ctx.save();
  ctx.translate(s[0], s[1]); ctx.rotate(-((rotAng || 0) + V.rot));
  ctx.fillStyle = col;
  ctx.font = '500 ' + hp.toFixed(1) + "px 'Inter',system-ui,sans-serif";
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = anchor === 'c' ? 'center' : anchor === 'r' ? 'right' : 'left';
  ctx.fillText(String(str), 0, 0);
  ctx.restore();
}
/* how heavy each architectural sub-line draws, as a multiple of the pen */
const ROLE_W = { face: 1.55, jamb: 1.0, leaf: 1.0, swing: 0.75, glaz: 0.85, tread: 0.85,
  cut: 0.8, arrow: 0.9, arrowhead: 0.9, room: 0.9, grid: 0.85, bubble: 1.0, cap: 1.55 };

/* ============================================================
   highlighting
   ------------------------------------------------------------
   Selection is a doubled stroke: a wide translucent halo underneath in the
   selection amber, and the object's *own* colour, brightened, on top. That is
   how AutoCAD's selection glow behaves and it is the point of it — a selected
   red wall is still visibly red, so you can read the drawing while you edit.
   Hover is deliberately a different animal — a white halo, thinner — so
   pre-highlight can never be mistaken for a selection.
   ============================================================ */
const HL = {
  sel: { col: null, hcol: CO.sel, halo: 5, a: '4a', core: 1.1, lift: 0.38, fillA: 'aa', pocheA: '5c' },
  hot: { col: null, hcol: '#ffffff', halo: 3, a: '30', core: 0.7, lift: 0.22, fillA: '77', pocheA: '46' },
  prev: { col: CO.prev, hcol: CO.prev, halo: 0, a: '00', core: 0.4, lift: 0, fillA: '55', pocheA: '2e' },
};
const HALO_MAX = 400;                             /* past this, glow would turn dense plans to mush */
let HALO = null;                                  /* the HL entry being drawn as an underlay */

/** mix a hex colour towards white — the selected object keeps its identity */
const _liftC = new Map();
function lift(hex, k) {
  if (!k || !hex || hex[0] !== '#' || hex.length < 7) return hex;
  const key = hex + k;
  let v = _liftC.get(key);
  if (v) return v;
  const r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
  const m = c => Math.round(c + (255 - c) * k).toString(16).padStart(2, '0');
  v = '#' + m(r) + m(g) + m(b);
  _liftC.set(key, v);
  return v;
}

/** set style and stroke in one go, honouring the halo underlay pass */
function strokeAs(col, lw, dash) {
  if (HALO) { ctx.strokeStyle = (HALO.hcol || col) + HALO.a; ctx.lineWidth = lw + HALO.halo; ctx.setLineDash(DASH_SOLID); }
  else { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash || DASH_SOLID); }
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
  const baseLw = lwPx(flw(e));
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
  ctx.setLineDash(DASH_SOLID);
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
  const lw = lwPx(flw(e)) + (S ? S.core : 0);
  ctx.beginPath();
  rotCS();
  for (const [a, b] of g.lines) { w2sI(a); ctx.moveTo(_sx, _sy); w2sI(b); ctx.lineTo(_sx, _sy); }
  strokeAs(col, lw, DASH_SOLID);
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
  const col = S ? (S.col || lift(fcol(e), S.lift)) : fcol(e);
  if (e.t === 'dim') return drawDim(e, col, mode);
  if (e.t === 'text') return drawTextAt(e.s, e.p, e.h, e.rot, e.anchor, col);
  if (GEOM[e.t]) return drawShapes(e, col, mode);
  if (e.t === 'hatch') return drawHatch(e, col, mode);
  const lw = lwPx(flw(e)) + (S ? S.core : 0);
  pathEnt(e);
  if (e.fill && !HALO) { ctx.fillStyle = col + (S ? S.fillA : '22'); ctx.fill(); }
  strokeAs(col, lw, dashFor(flt(e)));
  ctx.setLineDash(DASH_SOLID);
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
      /* the pattern only has to cover what is on screen */
      x0 = Math.max(x0, CX0); y0 = Math.max(y0, CY0);
      x1 = Math.min(x1, CX1); y1 = Math.min(y1, CY1);
      const diag = hyp(x1 - x0, y1 - y0) + sp * 2;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (isFinite(diag) && diag > 0 && diag / sp < 6000) {
        ctx.translate(cx, cy);
        ctx.rotate(-(a + V.rot));                 /* hatch angle is a world angle */
        ctx.strokeStyle = col + (S ? 'ff' : 'aa');
        ctx.lineWidth = HAIR; ctx.setLineDash(DASH_SOLID);
        ctx.beginPath();
        for (let y = -diag / 2; y <= diag / 2; y += sp) { ctx.moveTo(-diag / 2, y); ctx.lineTo(diag / 2, y); }
        if (e.pattern === 'cross') for (let x = -diag / 2; x <= diag / 2; x += sp) { ctx.moveTo(x, -diag / 2); ctx.lineTo(x, diag / 2); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.beginPath(); for (const L of loops) pathPts(L, true);
  strokeAs(col, lwPx(flw(e)) + (S ? S.core : 0), DASH_SOLID);
}

/* ---- grips ---- */
const GRIP = 4;                                   /* GRIPSIZE, half-width in px */
function drawGrips() {
  if (SEL.size > 80) return;
  ctx.setLineDash(DASH_SOLID);
  ctx.lineWidth = HAIR;
  for (const id of SEL) {
    const e = DOC.ents.get(id); if (!e) continue;
    for (const g of gripsOf(e)) {
      const s = w2s(g.p);
      if (s[0] < -20 || s[0] > V.w + 20 || s[1] < -20 || s[1] > V.h + 20) continue;
      const hot = ST.hotGrip && ST.hotGrip.id === id && dist2(ST.hotGrip.p, g.p) < 1e-12;
      const x = snapXd(s[0], 0), y = snapYd(s[1], 0);
      ctx.fillStyle = hot ? CO.gripHot : CO.grip;
      ctx.fillRect(x - GRIP, y - GRIP, GRIP * 2, GRIP * 2);
      ctx.strokeStyle = CO.bg;
      ctx.strokeRect(snapXd(x - GRIP, 1), snapYd(y - GRIP, 1), GRIP * 2, GRIP * 2);
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
  ctx.strokeStyle = CO.snap; ctx.lineWidth = Math.max(1.4, HAIR * 1.6); ctx.setLineDash(DASH_SOLID);
  (SNAP_GLYPH[s.k] || SNAP_GLYPH.near)(p[0], p[1], 6);
  ctx.fillStyle = CO.snap; ctx.font = "500 9.5px 'JetBrains Mono',monospace";
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(s.k.toUpperCase(), p[0] + 10, p[1] + 8);
}
function drawTracks() {
  if (!ST.tracks || !ST.tracks.length) return;
  ctx.save(); ctx.strokeStyle = CO.snap + '55'; ctx.lineWidth = HAIR; ctx.setLineDash([4, 4]);
  ctx.beginPath();
  rotCS();
  for (const t of ST.tracks) { w2sI(t[0]); ctx.moveTo(_sx, _sy); w2sI(t[1]); ctx.lineTo(_sx, _sy); }
  ctx.stroke(); ctx.restore();
}
/* ---- crosshair ----
   ST.crossLen is a percentage of the viewport, like AutoCAD's CURSORSIZE:
   100 gives the classic full-screen crosshair, anything less gives short arms
   around the cursor. The pick box only joins in when no command is running,
   and both sit on the device pixel grid so they stay a single crisp line. */
function drawCursor() {
  if (!ST.cur || ST.inView === false) return;
  const p = w2s(ST.cur);
  if (!isFinite(p[0]) || !isFinite(p[1])) return;
  const x = snapXd(p[0], 1), y = snapYd(p[1], 1);
  let pct = ST.crossLen == null ? 100 : +ST.crossLen;
  if (!isFinite(pct)) pct = 100;
  pct = clamp(pct, 1, 100);
  ctx.strokeStyle = CO.cross; ctx.globalAlpha = 0.82;
  ctx.lineWidth = HAIR; ctx.setLineDash(DASH_SOLID); ctx.lineDashOffset = 0;
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
  if (typeof showPickBox === 'function' && !showPickBox()) { ctx.globalAlpha = 1; return; }
  const b = Math.max(2, +ST.pickBox || 8);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = CO.cross;
  const bx = snapXd(p[0] - b / 2, 1), by = snapYd(p[1] - b / 2, 1);
  ctx.strokeRect(bx, by, b, b);
}
function drawBand() {
  const b = ST.band; if (!b) return;
  const a = w2s(b.a), c = w2s(b.b);
  const x = snapXd(Math.min(a[0], c[0]), 1), y = snapYd(Math.min(a[1], c[1]), 1);
  const w = Math.abs(c[0] - a[0]), h = Math.abs(c[1] - a[1]);
  /* the gesture is a screen gesture, so the direction is judged on screen */
  const a0 = b.aScr || a, b0 = b.bScr || c;
  const crossing = b0[0] < a0[0];
  ctx.setLineDash(crossing ? [5, 4] : DASH_SOLID);
  ctx.strokeStyle = crossing ? '#4ee6a8' : '#6ba8ff';
  ctx.fillStyle = (crossing ? '#4ee6a8' : '#6ba8ff') + '18';
  ctx.lineWidth = Math.max(1, HAIR); ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
  ctx.setLineDash(DASH_SOLID);
}

/* ---- UCS icon ----
   AutoCAD's 2D icon: two arrows at the origin with a square at the elbow that
   says the UCS is the world one. When the origin is off screen — or too close
   to an edge for the icon to fit — it falls back to the lower-left corner,
   which is exactly what UCSICON does. */
const UCS_ARM = 34, UCS_PAD = 26;
function drawUcsIcon() {
  if (!VS.ucsIcon) return;
  const cr = Math.cos(-V.rot), sr = Math.sin(-V.rot);
  /* screen direction of world +X and +Y (canvas y points down) */
  const xd = [cr, -sr], yd = [sr, cr];
  let o = null;
  if (VS.ucsOrigin) {
    const s = w2s([0, 0]);
    const m = UCS_ARM + UCS_PAD;
    if (isFinite(s[0]) && s[0] > m && s[0] < V.w - m && s[1] > m && s[1] < V.h - m) o = s;
  }
  if (!o) o = [UCS_PAD + 12, V.h - UCS_PAD - 12];
  ctx.save();
  ctx.setLineDash(DASH_SOLID);
  ctx.lineWidth = Math.max(1.3, HAIR * 1.5);
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  const head = (d, col, label) => {
    const ex = o[0] + d[0] * UCS_ARM, ey = o[1] + d[1] * UCS_ARM;
    ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(ex, ey); ctx.stroke();
    const n = [-d[1], d[0]];
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ex + d[0] * 8, ey + d[1] * 8);
    ctx.lineTo(ex - d[0] * 1 + n[0] * 3.2, ey - d[1] * 1 + n[1] * 3.2);
    ctx.lineTo(ex - d[0] * 1 - n[0] * 3.2, ey - d[1] * 1 - n[1] * 3.2);
    ctx.closePath(); ctx.fill();
    ctx.font = "600 10px 'JetBrains Mono',monospace";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, ex + d[0] * 18, ey + d[1] * 18);
  };
  head(xd, CO.ucsX, 'X');
  head(yd, CO.ucsY, 'Y');
  /* the square at the elbow: the UCS is the world coordinate system */
  const q = 11;
  ctx.strokeStyle = CO.tx; ctx.lineWidth = HAIR;
  ctx.beginPath();
  ctx.moveTo(o[0] + xd[0] * q, o[1] + xd[1] * q);
  ctx.lineTo(o[0] + xd[0] * q + yd[0] * q, o[1] + xd[1] * q + yd[1] * q);
  ctx.lineTo(o[0] + yd[0] * q, o[1] + yd[1] * q);
  ctx.stroke();
  ctx.restore();
}

/* ---- draw order ----
   DRAWORDER writes e.ord; the renderer sorts on it so the result is stable
   between frames instead of following whatever order the spatial index
   happened to hand back. Fills sit under geometry, annotation on top. */
const ZBAND = { hatch: 0, room: 0, text: 2, mtext: 2, dim: 2, leader: 2, grid: 2 };
const ordOf = e => (e.ord || 0);
const byOrder = (a, b) => (ordOf(a) - ordOf(b)) || (a.id - b.id);
function ordRange() {
  let lo = 0, hi = 0;
  for (const e of DOC.ents.values()) { const o = ordOf(e); if (o < lo) lo = o; if (o > hi) hi = o; }
  return [lo, hi];
}
/** mode: 'front' | 'back' | 'above' | 'under'; ref is the entity to sit by */
function drawOrder(list, mode, ref) {
  if (!list || !list.length) return 0;
  const [lo, hi] = ordRange();
  let n = 0;
  const set = (e, v) => { mut(e); e.ord = v; n++; };
  if (mode === 'front') { let k = hi; for (const e of list) set(e, ++k); }
  else if (mode === 'back') { let k = lo; for (const e of list.slice().reverse()) set(e, --k); }
  else if (ref) {
    const base = ordOf(ref);
    /* shuffle everything past the reference out of the way, then slot in */
    for (const e of DOC.ents.values()) {
      if (list.indexOf(e) >= 0 || e === ref) continue;
      const o = ordOf(e);
      if (mode === 'above' ? o > base : o < base) { mut(e); e.ord = o + (mode === 'above' ? list.length : -list.length); }
    }
    let k = base;
    for (const e of (mode === 'above' ? list : list.slice().reverse())) set(e, mode === 'above' ? ++k : --k);
  }
  return n;
}

/* ---- main ---- */
let _raf = 0;
const BACK = [], MAIN = [], TOP = [];
function draw() { if (!_raf) _raf = requestAnimationFrame(paint); }
function paint() {
  _raf = 0;
  shapeCacheSync();
  HALO = null;
  deviceMetrics();
  LW_ON = ST.lwt !== false;
  dashSync();
  clipSync();
  ctx.setTransform(V.kx, 0, 0, V.ky, 0, 0);
  ctx.globalAlpha = 1; ctx.lineDashOffset = 0;
  ctx.fillStyle = CO.bg; ctx.fillRect(0, 0, V.w, V.h);
  frameLayers();
  rotCS();
  drawGrid();
  const wb = viewWorldBox(40);
  const list = query(wb[0], wb[1], wb[2], wb[3]);
  /* butt caps are what a plotter does: dashes end square and a face line
     stops exactly where the opening starts. Joins stay round for mitres. */
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round'; ctx.miterLimit = 4;
  BACK.length = 0; MAIN.length = 0; TOP.length = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!fvis(e) || SEL.has(e.id)) continue;
    const b = ZBAND[e.t];
    (b === 0 ? BACK : b === 2 ? TOP : MAIN).push(e);
  }
  BACK.sort(byOrder); MAIN.sort(byOrder); TOP.sort(byOrder);
  for (let i = 0; i < BACK.length; i++) drawEnt(BACK[i]);
  for (let i = 0; i < MAIN.length; i++) drawEnt(MAIN[i]);
  for (let i = 0; i < TOP.length; i++) drawEnt(TOP[i]);
  if (ST.hot && !SEL.has(ST.hot)) { const e = DOC.ents.get(ST.hot); if (e && fvis(e)) drawEntHL(e, 'hot'); }
  if (SEL.size) for (const id of SEL) { const e = DOC.ents.get(id); if (e && fvis(e)) drawEntHL(e, 'sel'); }
  if (ST.preview) for (const e of ST.preview) drawEnt(e, 'prev');
  drawGrips();
  drawTracks();
  drawBand();
  drawUcsIcon();
  drawSnap();
  drawCursor();
  ctx.setLineDash(DASH_SOLID); ctx.globalAlpha = 1;
  BACK.length = 0; MAIN.length = 0; TOP.length = 0;
}
