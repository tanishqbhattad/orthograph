/* ============================================================
   ORTHOGRAPH — 06 input state, the snap engine, AutoTrack
   ------------------------------------------------------------
   The snap engine is a *priority* model, not a scoring model.
   Every candidate inside the aperture is collected; the one with
   the highest priority wins and distance only breaks ties. That
   makes the behaviour predictable: an endpoint inside the box
   always beats a nearest-on-curve, however close the curve is.

   Everything the cursor could land on is kept in ST.snapCands so
   Tab can cycle through overlapping points, and acquired points
   (ST.trackPts) throw alignment paths that the cursor can snap
   to — AutoCAD's object snap tracking.

   Three layers of osnap state, in the order they win:
     1. a temporary override held on the keyboard (Shift+E …) or
        picked from the Shift+right-click menu — ST.osnapOne;
     2. the running set — ST.osnapOn, gated by F3 (ST.osnap);
     3. nothing, when F3 is off.
   ============================================================ */
const ST = {
  tool: 'select', cur: null, raw: null, snap: null, hot: null, hotGrip: null,
  band: null, preview: null, tracks: null, drawing: false,
  osnap: true, grid: true, snapgrid: false, ortho: false, polar: true, otrack: true, dyn: true,
  lwt: true,              /* LWDISPLAY — draw lineweights at their true plotted width */
  inView: true,           /* the pointer is over the drawing area, so draw the crosshair */
  polarInc: 45, lastPt: null, dragGrip: null, panning: false, shift: false,
  /* Running object snaps. AutoCAD ships OSMODE 4133 (endpoint, centre,
     intersection, extension); this set adds the four everyone turns on within
     a minute of installing it, and leaves off the three that make a running
     osnap noisy — nearest, tangent and apparent intersection. */
  osnapOn: {
    end: 1, mid: 1, cen: 1, gcen: 0, node: 1, quad: 1, int: 1, ext: 1,
    ins: 0, perp: 1, tan: 0, near: 0, appint: 0, par: 0,
    wcen: 1, wface: 1,
  },
  osnapOne: null,         /* temporary override: one kind, or 'none'      */
  osnapOneShot: false,    /* the override expires with the next point     */
  /* ---- polar tracking ---- */
  polarExtra: [],         /* additional angles, degrees                   */
  polarRel: false,        /* measure polar angles from the last segment   */
  trackPolar: true,       /* otrack follows every polar angle, not just 0/90 */
  /* ---- shared interaction contract (several modules read these) ---- */
  crossLen: 100,          /* crosshair arm length, % of viewport; 100 = full width */
  pickBox: 8,             /* pick aperture in screen px */
  aperture: 10,           /* osnap aperture radius in screen px — AutoCAD's APERTURE */
  apBox: false,           /* draw the aperture box at a point prompt — APBOX */
  markerSize: 6,          /* AutoSnap marker half-size in screen px */
  snapCands: null,        /* every snap candidate under the cursor, best first */
  snapCycle: 0,           /* Tab index into snapCands */
  snapScr: null,          /* screen point the cycle was anchored at */
  snapTip: null,          /* the AutoSnap tooltip string for this cursor position */
  lastCmd: null,          /* for Space = repeat */
  trackPts: [],           /* acquired points for snap tracking: {p,k} */
  extPts: [],             /* acquired ends for the extension snap: {id,i}  */
  parRefs: [],            /* acquired directions for the parallel snap: {u,a} */
  fromBase: null,         /* FROM: the base point an offset is measured from */
  ptMod: null,            /* a point modifier collecting its own points */
};
/** the pick box only shows when no command is running (AutoCAD behaviour) */
function showPickBox() { return !CMD || CMD.phase === 'sel'; }
const SNAP_R = 10;                                /* default aperture, screen px */
const SNAP_CYCLE_RESET = 4;                       /* px of travel that resets Tab cycling */
const TRACK_DWELL_MS = 260;                       /* hover time before a point is acquired */
const TRACK_MAX = 7;                              /* AutoCAD keeps seven acquired points */
const PAR_MAX = 3;                                /* acquired parallel references */
const POLAR_TOL = 3.2;                            /* degrees either side of a polar angle */
/** the aperture in world units */
function apertureR() { return px(clamp(+ST.aperture || SNAP_R, 1, 50)); }

/* Scan budgets. snapPoint runs on every mouse move, so the entity work is
   bounded — always by taking the entities *closest to the cursor* first. */
const SNAP_MAX_SCAN = 600;      /* entDist evaluations per move            */
const SNAP_MAX_POINT = 32;      /* entities contributing point snaps       */
const SNAP_MAX_X = 8;           /* entities entering the pairwise int scan */
const SNAP_MAX_NEAR = 10;       /* entities contributing nearest-on-curve  */
const SNAP_MAX_WALL = 6;        /* walls entering the face-corner int scan */

/* ---------------- priority ----------------
   endpoint/node/insertion > intersection > apparent intersection >
   midpoint > centre > geometric centre > quadrant > perpendicular/tangent >
   wall face > wall centreline > extension/parallel > grid > nearest. */
const SNAP_PRI = {
  end: 100, node: 100, ins: 100,
  int: 90,
  appint: 88,
  trackx: 86,             /* two alignment paths crossing                  */
  mid: 80,
  cen: 70,
  gcen: 68,
  quad: 60,
  track: 55,              /* on a single alignment path                    */
  perp: 50, tan: 50,
  cenEdge: 48,            /* a centre inferred from hovering its curve      */
  gcenEdge: 47,
  perpx: 46, tanx: 46,    /* deferred: the foot/point is past the geometry  */
  wface: 40,
  wcen: 30,
  par: 22,
  ext: 20,
  grid: 8,
  near: 5,
};
const SNAP_PRI_MAX = Math.max(...Object.values(SNAP_PRI));
/* How much of a head start the top priority buys itself, in screen px — the
   whole of the priority/distance trade lives in this one number.

   Chosen as the LARGEST value that still fixes the arbitration defect, because
   a larger bias preserves more of AutoCAD's real priority behaviour. The two
   cases that bound it, both measured:
     · an apparent intersection 0.29px out must beat an endpoint 5.7px out
       (pri gap 12 → head start 0.96px ≪ 5.41px gap) ✓
     · a perpendicular under the crosshair must beat an intersection ~5px out
       (pri gap 40 → 3.2px < 5px) ✓  — fails above ~12px
   and the case that sets the floor:
     · a node 4.24px out must still beat a line midpoint 3.16px out
       (pri gap 20 → 1.6px > 1.08px) ✓ — fails below ~5.4px
   8px sits in the middle of that window rather than on either edge. */
const SNAP_BIAS_PX = 8;
/* which snap kinds can be acquired for tracking */
const TRACK_KINDS = { end: 1, mid: 1, cen: 1, gcen: 1, quad: 1, int: 1, appint: 1, node: 1, ins: 1, perp: 1, tan: 1 };

/* ---------------- the mode table ----------------
   Listed in the order AutoCAD's Drafting Settings dialog lists them, so the
   settings dialog and the Shift+right-click menu read the same way. `bit` is
   the OSMODE bit where one exists; geometric centre arrived long after OSMODE
   was fixed, so Orthograph parks it — and its own wall snaps — above the
   classic range. */
const SNAP_KINDS = [
  { k: 'end', label: 'Endpoint', bit: 1 },
  { k: 'mid', label: 'Midpoint', bit: 2 },
  { k: 'cen', label: 'Centre', bit: 4 },
  { k: 'gcen', label: 'Geometric centre', bit: 16384 },
  { k: 'node', label: 'Node', bit: 8 },
  { k: 'quad', label: 'Quadrant', bit: 16 },
  { k: 'int', label: 'Intersection', bit: 32 },
  { k: 'ext', label: 'Extension', bit: 4096 },
  { k: 'ins', label: 'Insertion', bit: 64 },
  { k: 'perp', label: 'Perpendicular', bit: 128 },
  { k: 'tan', label: 'Tangent', bit: 256 },
  { k: 'near', label: 'Nearest', bit: 512 },
  { k: 'appint', label: 'Apparent intersection', bit: 2048 },
  { k: 'par', label: 'Parallel', bit: 8192 },
  { k: 'wcen', label: 'Wall centreline', bit: 32768 },
  { k: 'wface', label: 'Wall face', bit: 65536 },
];
const SNAP_LABEL = {};
for (const s of SNAP_KINDS) SNAP_LABEL[s.k] = s.label;
SNAP_LABEL.perpx = 'Perpendicular (deferred)';
SNAP_LABEL.tanx = 'Tangent (deferred)';
SNAP_LABEL.track = 'Tracking';
SNAP_LABEL.trackx = 'Tracking intersection';
SNAP_LABEL.grid = 'Snap';
function snapKindLabel(k) { return SNAP_LABEL[k] || k; }
/** every alias a user might type at a point prompt, mapped to a mode */
const SNAP_ALIAS = {
  end: 'end', endp: 'end', endpoint: 'end',
  mid: 'mid', midp: 'mid', midpoint: 'mid',
  cen: 'cen', cent: 'cen', center: 'cen', centre: 'cen',
  gce: 'gcen', gcen: 'gcen', geo: 'gcen',
  nod: 'node', node: 'node',
  qua: 'quad', quad: 'quad', quadrant: 'quad',
  int: 'int', inte: 'int', intersection: 'int',
  ext: 'ext', exte: 'ext', extension: 'ext',
  ins: 'ins', inse: 'ins', insert: 'ins', insertion: 'ins',
  per: 'perp', perp: 'perp', perpendicular: 'perp',
  tan: 'tan', tang: 'tan', tangent: 'tan',
  nea: 'near', near: 'near', nearest: 'near',
  app: 'appint', appint: 'appint', apparent: 'appint',
  par: 'par', para: 'par', parallel: 'par',
  non: 'none', none: 'none', nod3: 'node',
  wcen: 'wcen', wface: 'wface',
};
/** the list a right-click menu or the settings dialog renders: [{kind,label,on}] */
function snapMenuItems() {
  return SNAP_KINDS.map(s => ({ kind: s.k, label: s.label, on: !!ST.osnapOn[s.k] }));
}
/** flip one snap kind; 'all' / 'none' set every kind at once. Returns the new state. */
function toggleSnap(kind) {
  if (kind === 'all' || kind === 'none') {
    const v = kind === 'all' ? 1 : 0;
    for (const s of SNAP_KINDS) ST.osnapOn[s.k] = v;
    return !!v;
  }
  if (!(kind in ST.osnapOn)) return false;
  ST.osnapOn[kind] = ST.osnapOn[kind] ? 0 : 1;
  return !!ST.osnapOn[kind];
}
/** the running set as an OSMODE-style bitmask */
function osmode() {
  let m = 0;
  for (const s of SNAP_KINDS) if (ST.osnapOn[s.k]) m |= s.bit;
  return m;
}
function setOsmode(m) {
  m = m | 0;
  for (const s of SNAP_KINDS) ST.osnapOn[s.k] = (m & s.bit) ? 1 : 0;
  return osmode();
}

/* ---------------- running vs one-shot ----------------
   A temporary override replaces the running set for as long as it is held
   (a keyboard override) or until the next point is picked (a menu pick or a
   typed MID/CEN/…). AutoCAD calls the second kind a "one-shot" osnap. */
const SNAP_NONE = Object.freeze({});
function setSnapOverride(kind, oneShot) {
  if (!kind) { ST.osnapOne = null; ST.osnapOneShot = false; return null; }
  ST.osnapOne = kind === 'none' ? 'none' : (SNAP_ALIAS[kind] || kind);
  ST.osnapOneShot = !!oneShot;
  return ST.osnapOne;
}
function clearSnapOverride(force) {
  if (ST.osnapOne && (force || ST.osnapOneShot)) { ST.osnapOne = null; ST.osnapOneShot = false; return true; }
  return false;
}
/** true when *something* wants object snapping this move */
function osnapActive() { return !!ST.osnapOne || !!ST.osnap; }
/** the mode table snapPoint should honour right now */
function activeModes() {
  const one = ST.osnapOne;
  if (one) {
    if (one === 'none') return SNAP_NONE;
    const m = {};
    m[one] = 1;
    /* an apparent-intersection override still wants the real ones offered */
    if (one === 'appint') m.int = 1;
    return m;
  }
  return ST.osnap ? ST.osnapOn : SNAP_NONE;
}

/* ---------------- Tab cycling ---------------- */
/** step through the overlapping candidates under the cursor; returns the chosen one */
function cycleSnap(dir) {
  const c = ST.snapCands;
  if (!c || !c.length) return null;
  const n = c.length;
  ST.snapCycle = (((ST.snapCycle + (dir || 1)) % n) + n) % n;
  ST.snap = c[ST.snapCycle];
  ST.snapTip = snapTipFor(ST.snap);
  return ST.snap;
}

/* ---------------- snap tracking ---------------- */
let _dwellPt = null, _dwellT0 = 0, _dwellUsed = false;
let _parEnt = null, _parT0 = 0, _parUsed = false;
/** remember a point so alignment paths radiate from it */
function acquireTrack(p, k) {
  if (!p || !isFinite(p[0]) || !isFinite(p[1])) return null;
  const tol = Math.max(px(1.5), 1e-9);
  for (const q of ST.trackPts) if (dist(q.p, p) <= tol) { if (k) q.k = k; return q; }
  const e = { p: [p[0], p[1]], k: k || 'end' };
  ST.trackPts.push(e);
  while (ST.trackPts.length > TRACK_MAX) ST.trackPts.shift();
  return e;
}
/** drop one acquired point (hovering an acquired point again un-acquires it) */
function releaseTrack(p) {
  const tol = Math.max(px(1.5), 1e-9);
  for (let i = 0; i < ST.trackPts.length; i++)
    if (dist(ST.trackPts[i].p, p) <= tol) { ST.trackPts.splice(i, 1); return true; }
  return false;
}
function clearTracks() {
  ST.trackPts.length = 0; ST.parRefs.length = 0; ST.extPts.length = 0; ST.tracks = null;
  _dwellPt = null; _dwellUsed = false; _parEnt = null; _parUsed = false;
}
/** hovering a snap point for TRACK_DWELL_MS acquires it; hovering an already
    acquired point for as long drops it again, exactly as AutoCAD does. */
function trackDwell(best, now) {
  now = now == null ? Date.now() : now;
  if (!ST.otrack || !best || !TRACK_KINDS[best.k]) { _dwellPt = null; _dwellUsed = false; return null; }
  if (!_dwellPt || dist(_dwellPt, best.p) > Math.max(px(0.5), 1e-9)) {
    _dwellPt = best.p.slice(); _dwellT0 = now; _dwellUsed = false; return null;
  }
  if (_dwellUsed) return null;                     /* one decision per visit */
  if (now - _dwellT0 < TRACK_DWELL_MS) return null;
  _dwellUsed = true;
  const tol = Math.max(px(1.5), 1e-9);
  if (ST.trackPts.some(q => dist(q.p, _dwellPt) <= tol)) { releaseTrack(_dwellPt); return null; }
  return acquireTrack(_dwellPt, best.k);
}
/** acquire the direction of a linear object for the parallel snap */
function acquirePar(u) {
  const a = wrap(Math.atan2(u[1], u[0])) % Math.PI;
  for (const q of ST.parRefs) if (Math.abs(wrapS(q.a - a)) < 1e-6) return q;
  const e = { u: [Math.cos(a), Math.sin(a)], a };
  ST.parRefs.push(e);
  while (ST.parRefs.length > PAR_MAX) ST.parRefs.shift();
  return e;
}
/** hovering a line while PAR is live acquires its direction */
function parDwell(raw, r, now, on) {
  if (!(on || activeModes()).par) { _parEnt = null; _parUsed = false; return null; }
  now = now == null ? Date.now() : now;
  const seg = nearestLinearDir(raw, r);
  if (!seg) { _parEnt = null; _parUsed = false; return null; }
  if (_parEnt !== seg.id) { _parEnt = seg.id; _parT0 = now; _parUsed = false; return null; }
  if (_parUsed || now - _parT0 < TRACK_DWELL_MS) return null;
  _parUsed = true;
  return acquirePar(seg.u);
}
/** the direction of the straight edge nearest the cursor, if one is in reach */
function nearestLinearDir(raw, r) {
  const box = query(raw[0] - r, raw[1] - r, raw[0] + r, raw[1] + r);
  let best = null, bd = r;
  for (const e of box) {
    if (!visible(e)) continue;
    let segs = null;
    if (e.t === 'line') segs = [[e.a, e.b]];
    else if (e.t === 'wall') segs = [[e.a, e.b]];
    else if (e.t === 'xline' || e.t === 'ray') { const q = xlineSeg(e); segs = [[q[0], q[1]]]; }
    else if (e.t === 'pline') {
      segs = [];
      const P = e.closed ? [...e.pts, e.pts[0]] : e.pts;
      for (let i = 1; i < P.length; i++) segs.push([P[i - 1], P[i]]);
    }
    if (!segs) continue;
    for (let i = 0; i < segs.length; i++) {
      const [a, b] = segs[i];
      const d = segDist(raw, a, b);
      if (d >= bd) continue;
      const u = norm(sub(b, a));
      if (!u[0] && !u[1]) continue;
      bd = d; best = { id: e.id + ':' + i, u };
    }
  }
  return best;
}

/* ---------------- small geometry helpers ---------------- */
/** perpendicular foot from `ref` onto segment a→b; off the segment is "deferred" */
function perpFoot(a, b, ref) {
  const d = sub(b, a), L = dot(d, d);
  if (L < EPS) return null;
  const t = dot(sub(ref, a), d) / L;
  return { p: [a[0] + d[0] * t, a[1] + d[1] * t], t, on: t >= -1e-9 && t <= 1 + 1e-9 };
}
/** intersections between two decomposed primitives (see prims() in 03-solve) */
function xPrim(A, B) {
  let ps;
  if (A.k === 'l' && B.k === 'l') ps = xLineLine(A.a, A.b, B.a, B.b, false);
  else if (A.k === 'l') ps = xLineCircle(A.a, A.b, B.c, B.r, false);
  else if (B.k === 'l') ps = xLineCircle(B.a, B.b, A.c, A.r, false);
  else ps = xCircleCircle(A.c, A.r, B.c, B.r);
  const out = [];
  for (const p of ps) {
    if (A.e && angOnArc(A.e, ang(A.c, p)) === null) continue;
    if (B.e && angOnArc(B.e, ang(B.c, p)) === null) continue;
    out.push(p);
  }
  return out;
}
/** where two primitives would cross if both ran on for ever — AutoCAD's
    apparent intersection. Arc sweeps and segment ends are deliberately
    ignored: that is the whole point of the mode. */
function xPrimInf(A, B) {
  if (A.k === 'l' && B.k === 'l') return xLineLine(A.a, A.b, B.a, B.b, true);
  if (A.k === 'l') return xLineCircle(A.a, A.b, B.c, B.r, true);
  if (B.k === 'l') return xLineCircle(B.a, B.b, A.c, A.r, true);
  return xCircleCircle(A.c, A.r, B.c, B.r);
}
/* entity kinds that take part in the pairwise intersection scan */
const X_TYPES = { line: 1, pline: 1, spline: 1, circle: 1, arc: 1, ellipse: 1, xline: 1, ray: 1 };
/* entity kinds that carry an insertion point */
const INS_TYPES = { insert: 1, text: 1, mtext: 1, block: 1 };
function insertionPoint(e) {
  if (!INS_TYPES[e.t]) return null;
  const p = e.p || e.pt;
  return p && isFinite(p[0]) && isFinite(p[1]) ? p : null;
}

/* ============================================================
   the engine
   ============================================================ */
/**
 * Resolve a screen position to a world point.
 * @param sx,sy screen px
 * @param ref   the rubber-band reference point (perp/tan/polar key off it)
 * @param now   optional clock override, for tests
 */
function snapPoint(sx, sy, ref, now) {
  const raw = s2w(sx, sy);
  ST.raw = raw;
  const r = apertureR();
  const on = activeModes();
  const osOn = osnapActive();
  const tracks = [];
  ST.snapLimited = false;
  /* FROM measures its offset from the base point, and MID-BETWEEN-2 rubber
     bands from its first pick — both outrank whatever the command handed us */
  const modRef = ptModRef();
  if (modRef) ref = modRef;

  /* Tab cycling survives a jittery hand but not a real move */
  if (!ST.snapScr || hyp(sx - ST.snapScr[0], sy - ST.snapScr[1]) > SNAP_CYCLE_RESET) {
    ST.snapCycle = 0; ST.snapScr = [sx, sy];
  }

  /* ---- candidate collection, deduplicated on a coarse screen-pixel grid ---- */
  const cands = [];
  const cell = new Map();
  const gtol = Math.max(px(0.5), 1e-12);
  const merge2 = gtol * gtol * 4;
  /* `d` ranks the candidate; the aperture is ALWAYS judged on the true
     distance from the cursor to the point itself. Letting a caller pass the
     distance-to-entity as `d` used to admit points far outside the box — a
     tangent 126mm away would beat the perpendicular 3mm away. `allowFar` is
     the one deliberate exception: picking a big circle's centre by hovering
     its rim. */
  function push(p, k, d, priOverride, allowFar, meta) {
    if (!p) return;
    const x = p[0], y = p[1];
    if (!isFinite(x) || !isFinite(y)) return;
    const dp = hyp(x - raw[0], y - raw[1]);
    if (d == null) d = dp;
    if (!allowFar && !(dp <= r)) return;
    if (!(d <= r)) return;
    const pri = priOverride == null ? (SNAP_PRI[k] || 1) : priOverride;
    const i0 = Math.round(x / gtol), j0 = Math.round(y / gtol);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const c = cell.get((i0 + a) + ',' + (j0 + b));
      if (c && dist2(c.p, [x, y]) < merge2) {
        if (pri > c.pri || (pri === c.pri && d < c.d)) {
          c.k = k; c.d = d; c.pri = pri; c.p = [x, y]; c.meta = meta || null;
        }
        return;
      }
    }
    const c = { p: [x, y], k, d, pri, meta: meta || null };
    cell.set(i0 + ',' + j0, c);
    cands.push(c);
  }

  if (osOn) {
    const hits = nearEnts(raw, r);
    const pool = hits.slice(0, SNAP_MAX_POINT);
    for (const h of pool) entSnaps(h.e, h.d, raw, ref, r, push, on);
    if (on.int || on.appint) pairIntersections(pool, raw, r, push, on);
    if (on.wface && on.int) wallFaceIntersections(pool, raw, r, push);
    if (on.ins) insertionSnaps(raw, r, push);
    if (on.ext) extensionSnaps(hits, raw, r, push, tracks);
    if (on.near) nearestSnaps(hits, raw, r, push);
  }

  /* ---- deferred perpendicular ----
     The foot of a perpendicular can sit far from the geometry that carries it:
     dropping a perpendicular onto a quarter arc lands at 180 degrees, nowhere
     near the arc itself. Those entities never reach the pool above, so scan
     the carriers separately. */
  if (osOn && on.perp && ref) deferredPerp(raw, ref, r, push);

  /* ---- parallel: a direction lifted off another object, offered as a ray
     out of the rubber-band reference point ---- */
  if (osOn && ref) {
    parDwell(raw, r, now, on);
    if (on.par) parallelSnaps(raw, ref, r, push, tracks);
  }

  /* ---- alignment paths from acquired points ---- */
  trackSnaps(raw, r, push, tracks);

  /* ---- grid snap: above nearest, below every real object snap ---- */
  if (ST.snapgrid) {
    const step = DOC.snapStep;
    if (step > 0) push([Math.round(raw[0] / step) * step, Math.round(raw[1] / step) * step], 'grid');
  }

  /* ---- pick the winner: distance decides, priority only buys a head start ----
     Sorting by priority first (which this did originally) let any high-priority
     candidate anywhere in the aperture beat a low-priority one sitting directly
     under the crosshair — an apparent intersection 0.29px from the cursor lost
     to an endpoint 5.7px away, and a perpendicular at d=0 lost to an
     intersection 138mm off. That makes perp, tan, nearest, extension, parallel
     and quadrant effectively unreachable in a dense drawing without hammering
     Tab, which is the pick you make five hundred times a day.

     Score = true distance − (priority × bias). One numeric key, so the order
     stays total and stable; a "within N px, compare priority instead"
     comparator is non-transitive and sorts inconsistently. */
  const bias = px(SNAP_BIAS_PX) / SNAP_PRI_MAX;
  for (const c of cands) c.score = c.d - c.pri * bias;
  cands.sort((a, b) => a.score - b.score || b.pri - a.pri);
  ST.snapCands = cands;
  if (ST.snapCycle >= cands.length) ST.snapCycle = 0;
  let best = cands.length ? cands[ST.snapCycle] : null;
  ST.snap = best;
  if (osOn) trackDwell(best, now);

  let out = best ? best.p.slice() : raw;
  ST.snapTip = best ? snapTipFor(best) : null;

  /* ---- ortho / polar constrain relative to ref ---- */
  if (ref && !best) {
    const v = sub(out, ref);
    if (ST.ortho) {
      out = Math.abs(v[0]) >= Math.abs(v[1]) ? [ref[0] + v[0], ref[1]] : [ref[0], ref[1] + v[1]];
      const t = [ref, out]; t.k = 'ortho'; tracks.push(t);
      ST.snapTip = 'Ortho: ' + fmt(dist(ref, out)) + ' < ' + fmtAng(ang(ref, out)) + '°';
    } else if (ST.polar) {
      const lock = polarLock(ref, out);
      if (lock) {
        out = lock.p;
        const t = polarPath(ref, lock.u, lock.L); t.k = 'polar'; tracks.push(t);
        ST.snapTip = 'Polar: ' + fmt(lock.L) + ' < ' + fmtAng(lock.a) + '°';
      }
    }
  }
  ST.tracks = tracks.length ? tracks : null;
  return out;
}

/** the AutoSnap tooltip AutoCAD would show for this candidate */
function snapTipFor(s) {
  if (!s) return null;
  if (s.k === 'track' && s.meta) {
    const d = dist(s.meta.o, s.p);
    return snapKindLabel(s.meta.k) + ': ' + fmt(d) + ' < ' + fmtAng(s.meta.a) + '°';
  }
  if (s.k === 'par' && s.meta) return 'Parallel: ' + fmt(s.meta.L) + ' < ' + fmtAng(s.meta.a) + '°';
  return snapKindLabel(s.k);
}
function fmtAng(a) {
  let d = deg(a) % 360; if (d < 0) d += 360;
  return (Math.abs(d - Math.round(d)) < 5e-4 ? Math.round(d) : +d.toFixed(2)).toString();
}

/* ---------------- polar tracking ----------------
   The tracked angle set is the increment plus any additional angles, measured
   either from zero or (POLARANG relative) from the previous segment. */
function polarAngles() {
  const inc = clamp(Math.abs(+ST.polarInc) || 90, 0.1, 180);
  const out = [];
  for (let a = 0; a < 360 - 1e-9; a += inc) out.push(rad(a));
  for (const x of (ST.polarExtra || [])) {
    const v = +x;
    if (isFinite(v)) out.push(rad(((v % 360) + 360) % 360));
  }
  return out;
}
/** the direction polar angles are measured from */
function polarBase() {
  if (!ST.polarRel) return 0;
  const c = (typeof CMD !== 'undefined') && CMD;
  if (c && c.pts && c.pts.length >= 2) return ang(c.pts[c.pts.length - 2], c.pts[c.pts.length - 1]);
  return 0;
}
/** if the cursor is within tolerance of a polar angle, the point locked onto it */
function polarLock(ref, p) {
  const v = sub(p, ref);
  const L0 = hyp(v[0], v[1]);
  if (!(L0 > px(6))) return null;
  const a0 = Math.atan2(v[1], v[0]);
  const base = polarBase();
  const tol = rad(POLAR_TOL);
  let bestA = null, bestErr = tol;
  for (const a of polarAngles()) {
    const t = base + a;
    const err = Math.abs(wrapS(a0 - t));
    if (err < bestErr) { bestErr = err; bestA = t; }
  }
  if (bestA == null) return null;
  const u = [Math.cos(bestA), Math.sin(bestA)];
  const L = dot(v, u);                     /* project, do not stretch */
  if (!(L > 0)) return null;
  return { p: [ref[0] + u[0] * L, ref[1] + u[1] * L], u, L, a: bestA };
}
/** the rubber-band alignment vector: from the base, out past the cursor to the
    edge of the viewport, the way AutoCAD runs it off the screen */
function polarPath(o, u, L) {
  const reach = Math.max(L * 1.2, px(hyp(V.w, V.h)));
  return [o, [o[0] + u[0] * reach, o[1] + u[1] * reach]];
}

/* ---------------- entity shortlist ---------------- */
/** entities whose geometry comes within reach of the cursor, closest first */
function nearEnts(raw, r) {
  const w = r * 3;
  let pool = query(raw[0] - w, raw[1] - w, raw[0] + w, raw[1] + w);
  if (pool.length > SNAP_MAX_SCAN) {
    /* the spatial index gave up (or the doc is tiny and returned everything):
       fall back to a cheap bbox pass so we never entDist thousands of objects */
    const f = [];
    for (const e of pool) {
      let b; try { b = bbox(e); } catch (err) { continue; }
      if (bboxHit(b, raw[0] - w, raw[1] - w, raw[0] + w, raw[1] + w)) f.push(e);
      if (f.length >= SNAP_MAX_SCAN) break;
    }
    pool = f;
  }
  const reach = r * 2.4, hits = [];
  for (const e of pool) {
    if (!e || e.t === 'text' || !visible(e)) continue;
    let d; try { d = entDist(raw, e); } catch (err) { continue; }
    if (!(d < reach)) continue;
    hits.push({ e, d });
  }
  hits.sort((a, b) => a.d - b.d);
  return hits;
}

/* ---------------- per-entity snap points ---------------- */
function entSnaps(e, dEnt, raw, ref, r, push, on) {
  on = on || activeModes();
  switch (e.t) {
    case 'line': {
      if (on.end) { push(e.a, 'end'); push(e.b, 'end'); }
      if (on.mid) push(mid(e.a, e.b), 'mid');
      if (ref && on.perp) perpOnSeg(e.a, e.b, ref, raw, push);
      break;
    }
    case 'xline': case 'ray': {
      const q = xlineSeg(e);
      if (on.end && e.t === 'ray') push(e.a, 'end');
      if (ref && on.perp) perpOnSeg(q[0], q[1], ref, raw, push);
      break;
    }
    case 'pline': case 'spline': {
      const P = e.t === 'spline' ? poly(e, 48) : e.pts;
      if (on.end) for (const p of (e.t === 'spline' ? [e.pts[0], e.pts[e.pts.length - 1]] : P)) push(p, 'end');
      if (on.end && e.t === 'spline' && e.fit) for (const p of e.fit) push(p, 'end');
      const Q = e.closed ? [...P, P[0]] : P;
      for (let i = 1; i < Q.length; i++) {
        if (on.mid && e.t !== 'spline') push(mid(Q[i - 1], Q[i]), 'mid');
        if (ref && on.perp) perpOnSeg(Q[i - 1], Q[i], ref, raw, push);
      }
      if (on.gcen && e.closed) geomCentreSnap(e, raw, dEnt, r, push);
      break;
    }
    case 'arc': {
      if (on.end) { push(arcPt(e, 0), 'end'); push(arcPt(e, 1), 'end'); }
      if (on.mid) push(arcPt(e, .5), 'mid');
      if (on.cen) centreSnap(e, e.c, raw, dEnt, r, push);
      if (on.quad) for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        if (angOnArc(e, a) === null) continue;
        push([e.c[0] + e.r * Math.cos(a), e.c[1] + e.r * Math.sin(a)], 'quad');
      }
      if (ref) roundPerpTan(e, ref, raw, dEnt, push, on);
      break;
    }
    case 'circle': {
      if (on.cen) centreSnap(e, e.c, raw, dEnt, r, push);
      if (on.gcen) push(e.c, 'gcen', dist(raw, e.c));
      if (on.quad) for (let i = 0; i < 4; i++)
        push([e.c[0] + e.r * Math.cos(i * Math.PI / 2), e.c[1] + e.r * Math.sin(i * Math.PI / 2)], 'quad');
      if (ref) roundPerpTan(e, ref, raw, dEnt, push, on);
      break;
    }
    case 'ellipse': {
      if (on.cen) push(e.c, 'cen');
      if (on.gcen) push(e.c, 'gcen', dist(raw, e.c));
      if (on.quad) for (let i = 0; i < 4; i++) push(ellPt(e, i * Math.PI / 2), 'quad');
      break;
    }
    case 'point': {
      if (on.node) push(e.p, 'node');
      break;
    }
    case 'dim': {
      if (on.end) { push(e.p1, 'end'); push(e.p2, 'end'); if (e.p3) push(e.p3, 'end'); }
      break;
    }
    case 'hatch': {
      if (on.end) for (const L of (e.loops || [])) for (const p of L) push(p, 'end');
      if (on.gcen) geomCentreSnap(e, raw, dEnt, r, push);
      break;
    }
    case 'wall': {
      wallSnaps(e, raw, ref, push, on);
      break;
    }
    default: {
      if (!GEOM[e.t]) break;
      for (const s of shapes(e, 24)) {
        if (s.pts) {
          if (on.end) for (const p of s.pts) push(p, 'end');
          if (on.mid && s.pts.length === 2) push(mid(s.pts[0], s.pts[1]), 'mid');
          if (ref && on.perp) for (let i = 1; i < s.pts.length; i++) perpOnSeg(s.pts[i - 1], s.pts[i], ref, raw, push);
        } else if (s.c && s.r != null) {
          if (on.cen) centreSnap({ t: 'circle', c: s.c, r: s.r }, s.c, raw, dEnt, r, push);
          if (on.quad) for (let i = 0; i < 4; i++)
            push([s.c[0] + s.r * Math.cos(i * Math.PI / 2), s.c[1] + s.r * Math.sin(i * Math.PI / 2)], 'quad');
        }
      }
      if (on.gcen) geomCentreSnap(e, raw, dEnt, r, push);
    }
  }
}

/** perpendicular from ref onto one segment. Hovering the segment is enough —
    when the foot falls past the end it is a *deferred* perpendicular (perpx). */
function perpOnSeg(a, b, ref, raw, push, kOn, kOff) {
  const f = perpFoot(a, b, ref);
  if (!f) return;
  push(f.p, f.on ? (kOn || 'perp') : (kOff || 'perpx'), dist(raw, f.p));
}
/** A centre is a full-strength snap when the cursor is on it. Hovering the
    curve instead still offers it — that is how you pick the centre of a big
    circle — but at a lower rank, and never while a point that actually lies
    on the curve (quadrant, end, midpoint) is already inside the aperture. */
function centreSnap(e, c, raw, dEnt, r, push) {
  const dc = dist(raw, c);
  if (dc <= r) { push(c, 'cen', dc); return; }
  if (dEnt > r || curvePtInReach(e, raw, r)) return;
  push(c, 'cen', dEnt, SNAP_PRI.cenEdge, true);
}
/** The centre of area of a closed shape — AutoCAD's Geometric Center. Like
    CEN it is offered both by pointing at the centroid and by hovering the
    boundary, because on a big room the centroid has nothing to point at. */
function geomCentreSnap(e, raw, dEnt, r, push) {
  const c = geomCentre(e);
  if (!c) return;
  const dc = dist(raw, c);
  if (dc <= r) { push(c, 'gcen', dc); return; }
  if (dEnt > r) return;
  push(c, 'gcen', dEnt, SNAP_PRI.gcenEdge, true);
}
/** area centroid of a closed outline; falls back to the vertex mean for a
    degenerate (zero-area) ring so the snap never returns NaN */
function geomCentre(e) {
  let pts = null;
  if (e.t === 'hatch') pts = (e.loops || [])[0];
  else if (e.t === 'circle' || e.t === 'ellipse') return e.c;
  else {
    if (!e.closed && e.t !== 'room' && e.t !== 'column' && e.t !== 'polygon') return null;
    try { pts = poly(e, 24); } catch (err) { return null; }
  }
  if (!pts || pts.length < 3) return null;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const f = p[0] * q[1] - q[0] * p[1];
    a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-12) {
    let sx = 0, sy = 0;
    for (const p of pts) { sx += p[0]; sy += p[1]; }
    return [sx / pts.length, sy / pts.length];
  }
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}
/** is a point lying on this circle/arc already within the aperture? */
function curvePtInReach(e, raw, r) {
  if (e.t === 'arc' &&
    (dist(raw, arcPt(e, 0)) <= r || dist(raw, arcPt(e, 1)) <= r || dist(raw, arcPt(e, .5)) <= r)) return true;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    if (e.t === 'arc' && angOnArc(e, a) === null) continue;
    if (hyp(e.c[0] + e.r * Math.cos(a) - raw[0], e.c[1] + e.r * Math.sin(a) - raw[1]) <= r) return true;
  }
  return false;
}
/** perpendicular and tangent onto a circle or an arc */
function roundPerpTan(e, ref, raw, dEnt, push, on) {
  on = on || activeModes();
  const D = dist(ref, e.c);
  if (on.tan && D > e.r + 1e-9) {
    const a0 = ang(e.c, ref), da = Math.acos(clamp(e.r / D, -1, 1));
    for (const s of [1, -1]) {
      const p = [e.c[0] + e.r * Math.cos(a0 + s * da), e.c[1] + e.r * Math.sin(a0 + s * da)];
      const onArc = e.t !== 'arc' || angOnArc(e, ang(e.c, p)) !== null;
      push(p, onArc ? 'tan' : 'tanx', dist(raw, p));
    }
  }
  if (on.perp && D > 1e-9) {
    const u = norm(sub(ref, e.c));
    for (const s of [1, -1]) {
      const p = [e.c[0] + u[0] * e.r * s, e.c[1] + u[1] * e.r * s];
      const onArc = e.t !== 'arc' || angOnArc(e, ang(e.c, p)) !== null;
      push(p, onArc ? 'perp' : 'perpx', dist(raw, p));
    }
  }
}

/** Perpendicular feet onto carriers whose own geometry is out of reach.
    Cheap because it only looks at entities whose infinite carrier passes
    through the aperture. */
function deferredPerp(raw, ref, r, push) {
  const box = query(raw[0] - r * 2, raw[1] - r * 2, raw[0] + r * 2, raw[1] + r * 2);
  let n = 0;
  for (const e of box) {
    if (n > SNAP_MAX_POINT) break;
    if (!visible(e)) continue;
    if (e.t === 'line') {
      const f = perpFoot(e.a, e.b, ref);
      if (f && !f.on && dist(raw, f.p) <= r) { push(f.p, 'perpx', dist(raw, f.p)); n++; }
    } else if (e.t === 'arc') {
      const D = dist(ref, e.c);
      if (D < 1e-9) continue;
      const u = norm(sub(ref, e.c));
      for (const sg of [1, -1]) {
        const p = [e.c[0] + u[0] * e.r * sg, e.c[1] + u[1] * e.r * sg];
        if (dist(raw, p) > r) continue;
        if (angOnArc(e, ang(e.c, p)) !== null) continue;   /* on the sweep: handled already */
        push(p, 'perpx', dist(raw, p)); n++;
      }
    }
  }
}

/* ---------------- parallel ----------------
   PAR is a two-step snap: hover a straight edge to lift its direction, then
   swing the rubber band until it lines up with that direction. The alignment
   path only appears once the band is within tolerance, exactly like polar. */
function parallelSnaps(raw, ref, r, push, tracks) {
  if (!ST.parRefs.length) return;
  const v = sub(raw, ref);
  const L0 = hyp(v[0], v[1]);
  if (!(L0 > px(6))) return;
  const a0 = Math.atan2(v[1], v[0]);
  for (const q of ST.parRefs) {
    for (const s of [1, -1]) {
      const a = q.a + (s < 0 ? Math.PI : 0);
      if (Math.abs(wrapS(a0 - a)) > rad(POLAR_TOL)) continue;
      const u = [Math.cos(a), Math.sin(a)];
      const L = dot(v, u);
      if (!(L > 0)) continue;
      const foot = [ref[0] + u[0] * L, ref[1] + u[1] * L];
      if (dist(raw, foot) > r) continue;
      push(foot, 'par', dist(raw, foot), null, false, { a, L });
      const t = polarPath(ref, u, L); t.k = 'par'; tracks.push(t);
    }
  }
}

/* ---------------- insertion ----------------
   Text is deliberately excluded from the entity shortlist (you do not want to
   snap to letterforms), so the insertion points are gathered separately. */
function insertionSnaps(raw, r, push) {
  const box = query(raw[0] - r, raw[1] - r, raw[0] + r, raw[1] + r);
  let n = 0;
  for (const e of box) {
    if (n > SNAP_MAX_POINT) break;
    if (!visible(e)) continue;
    const p = insertionPoint(e);
    if (p) { push(p, 'ins'); n++; }
  }
}

/* ---------------- walls ----------------
   wcen: the centreline — its ends, its midpoint, nearest along it.
   wface: the two mitred face lines — their ends, midpoints, nearest,
          and the corner points where faces of different walls cross. */
function wallSnaps(w, raw, ref, push, on) {
  on = on || activeModes();
  if (wallLen(w) < EPS) return;
  if (on.wcen) {
    if (on.end) { push(w.a, 'end'); push(w.b, 'end'); }
    if (on.mid) push(mid(w.a, w.b), 'mid');
    const c = segClosest(raw, w.a, w.b);
    push(c.p, 'wcen', dist(raw, c.p));
    if (ref && on.perp) perpOnSeg(w.a, w.b, ref, raw, push);
  }
  if (!on.wface) return;
  /* the mitred face carriers are cheap; the full shape list (jambs at
     openings, breaks at T-junctions) costs a scan of every wall, so only take
     it on drawings small enough to afford it. A mitred end has no cap — the
     diagonal between the two face points is not a line anyone can see. */
  const E0 = wallEndPoints(w, 0), E1 = wallEndPoints(w, 1);
  const segs = [[E0.plus, E1.minus], [E0.minus, E1.plus]];
  if (E0.capped) segs.push([E0.plus, E0.minus]);
  if (E1.capped) segs.push([E1.plus, E1.minus]);
  for (const [a, b] of segs) {
    if (on.end) { push(a, 'end'); push(b, 'end'); }
    if (on.mid) push(mid(a, b), 'mid');
    const c = segClosest(raw, a, b);
    push(c.p, 'wface', dist(raw, c.p));
    if (ref && on.perp) perpOnSeg(a, b, ref, raw, push);
  }
  if (allWalls().length > 240) { ST.snapLimited = true; return; }
  for (const s of wallShapes(w)) {
    if (!s.pts || s.pts.length < 2) continue;
    const a = s.pts[0], b = s.pts[s.pts.length - 1];
    if (on.end) { push(a, 'end'); push(b, 'end'); }
    if (on.mid) push(mid(a, b), 'mid');
    const c = segClosest(raw, a, b);
    push(c.p, 'wface', dist(raw, c.p));
  }
}
/** walls whose *body* comes near the cursor, closest first.
    A face corner sits a full thickness away from the centreline, so this
    reaches wider than the point-snap shortlist does. */
function nearWalls(raw, r, pool) {
  const all = allWalls();
  const src = all.length <= 400 ? all
    : pool.map(h => h.e).filter(e => e.t === 'wall');
  const out = [];
  for (const w of src) {
    if (wallLen(w) < EPS || !visible(w)) continue;
    const d = segDist(raw, w.a, w.b) - wallT(w) / 2;
    if (d > r * 3) continue;
    out.push({ w, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, SNAP_MAX_WALL).map(x => x.w);
}
/** the two mitred face lines of a wall, as finite segments */
function wallFaceSegs(w) {
  const E0 = wallEndPoints(w, 0), E1 = wallEndPoints(w, 1);
  return [[E0.plus, E1.minus], [E0.minus, E1.plus]];
}
/** where the faces of two nearby walls cross — the corner points of a junction.
    Deliberately segment-to-segment, not carrier-to-carrier: at a T the stem's
    faces stop at the head, and an intersection out on the far face would be a
    point nothing is actually drawn at. */
function wallFaceIntersections(pool, raw, r, push) {
  const ws = nearWalls(raw, r, pool);
  const F = ws.map(wallFaceSegs);
  for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
    if ((ws[i].lvl || 0) !== (ws[j].lvl || 0)) continue;
    for (const A of F[i]) for (const B of F[j]) {
      const X = xLineLine(A[0], A[1], B[0], B[1], false);
      if (X.length) push(X[0], 'int');
    }
  }
}

/* ---------------- pairwise intersections ----------------
   Bounded two ways: only the SNAP_MAX_X entities nearest the cursor take
   part, and each is reduced to the primitives that actually reach into the
   aperture, so a 5000-vertex polyline contributes one or two segments. */
function pairIntersections(pool, raw, r, push, on) {
  on = on || activeModes();
  const P = [];
  for (const h of pool) {
    const e = h.e;
    if (!X_TYPES[e.t]) continue;
    let pr; try { pr = prims(e); } catch (err) { continue; }
    const reach = r * 2.5;
    const keep = [];
    for (const q of pr) {
      if (q.k === 'c') { if (Math.abs(dist(raw, q.c) - q.r) < reach) keep.push(q); }
      else if (segDist(raw, q.a, q.b) < reach) keep.push(q);
    }
    if (keep.length) P.push(keep);
    if (P.length >= SNAP_MAX_X) break;
  }
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++)
    for (const A of P[i]) for (const B of P[j]) {
      if (on.int) for (const p of xPrim(A, B)) push(p, 'int');
      if (on.appint) for (const p of xPrimInf(A, B)) push(p, 'appint');
    }
}

/* ---------------- extension ----------------
   Project past the end of a line, a wall or an arc, and draw the dotted path
   back to the end it came from.

   The entity shortlist cannot find these on its own: stand 3 metres past the
   end of a wall and the wall is 3 metres away, far outside the aperture. So
   the ends are *acquired* by hovering them, exactly as AutoCAD does, and the
   extension stays live from then until the command ends. Entities that happen
   to be near the cursor anyway are still offered without acquisition, because
   short extensions should not need a ceremony. */
const EXT_MAX = 4;
const EXT_TYPES = { line: 1, wall: 1, arc: 1 };
/** the two ends of an extendable entity */
function extEnds(e) {
  if (e.t === 'arc') return [arcPt(e, 0), arcPt(e, 1)];
  return [e.a, e.b];
}
/** hovering an end remembers it, so the extension survives moving away */
function acquireExt(hits, raw, r) {
  /* hits are distance-sorted, so only the handful nearest the cursor can
     possibly have an end inside the aperture — scanning the rest is pure cost
     on a drawing with hundreds of walls under the pointer */
  for (let i = 0; i < hits.length && i < 6; i++) {
    const e = hits[i].e;
    if (!EXT_TYPES[e.t] || e.id == null) continue;
    const ends = extEnds(e);
    for (let i = 0; i < 2; i++) {
      if (!ends[i] || dist(raw, ends[i]) > r) continue;
      const j = ST.extPts.findIndex(q => q.id === e.id && q.i === i);
      if (j >= 0) ST.extPts.splice(j, 1);
      ST.extPts.push({ id: e.id, i });
      while (ST.extPts.length > EXT_MAX) ST.extPts.shift();
    }
  }
}
function extensionSnaps(hits, raw, r, push, tracks) {
  acquireExt(hits, raw, r);
  const seen = new Set();
  const list = [];
  for (const q of ST.extPts) {
    const e = DOC.ents.get(q.id);
    if (e && EXT_TYPES[e.t] && visible(e) && !seen.has(e.id)) { seen.add(e.id); list.push(e); }
  }
  for (const h of hits) {
    const e = h.e;
    if (!EXT_TYPES[e.t] || seen.has(e.id)) continue;
    seen.add(e.id); list.push(e);
    if (list.length >= SNAP_MAX_X + EXT_MAX) break;
  }
  let n = 0;
  for (const e of list) {
    if (e.t === 'arc') { if (++n > SNAP_MAX_X) break; arcExtension(e, raw, r, push, tracks); continue; }
    if (++n > SNAP_MAX_X) break;
    const A = e.a, B = e.b;
    const u = norm(sub(B, A));
    if (!u[0] && !u[1]) continue;
    for (const P of [A, B]) {
      const away = dot(sub(raw, P), u) * (P === A ? -1 : 1);
      if (away < px(4)) continue;
      const t = dot(sub(raw, P), u);
      const proj = add(P, mul(u, t));
      const d = dist(raw, proj);
      if (d < r) { push(proj, 'ext', d); const tr = [P, proj]; tr.k = 'ext'; tracks.push(tr); }
    }
  }
}
/** an arc's extension runs on around its own circle, not off on a tangent */
function arcExtension(e, raw, r, push, tracks) {
  const sweep = arcSweep(e);
  if (!(e.r > 0) || sweep >= TAU - 1e-9) return;
  if (Math.abs(dist(raw, e.c) - e.r) > r) return;
  const a = ang(e.c, raw);
  if (angOnArc(e, a) !== null) return;             /* still on the sweep */
  const aEnd = e.a0 + sweep;
  const past = wrap(a - aEnd);                     /* how far beyond the far end */
  const before = wrap(e.a0 - a);                   /* how far before the near end */
  const fwd = past <= before;
  const span = fwd ? past : before;
  if (span > Math.PI / 2) return;                  /* half the circle away is not an extension */
  const p = [e.c[0] + e.r * Math.cos(a), e.c[1] + e.r * Math.sin(a)];
  const d = dist(raw, p);
  if (d > r) return;
  push(p, 'ext', d);
  const from = fwd ? aEnd : e.a0, dir = fwd ? 1 : -1;
  const steps = Math.max(2, Math.ceil(span / rad(4)));
  const path = [];
  for (let i = 0; i <= steps; i++) {
    const t = from + dir * span * (i / steps);
    path.push([e.c[0] + e.r * Math.cos(t), e.c[1] + e.r * Math.sin(t)]);
  }
  path.k = 'ext';
  tracks.push(path);
}

/* ---------------- nearest on curve — genuinely last resort ---------------- */
function nearestSnaps(hits, raw, r, push) {
  let n = 0;
  for (const h of hits) {
    const e = h.e;
    if (e.t === 'wall' || e.t === 'point') continue;   /* walls have their own face/centreline snaps */
    if (++n > SNAP_MAX_NEAR) break;
    let P;
    try { P = poly(e, 32); } catch (err) { continue; }
    if (!P || P.length < 2) continue;
    let bp = null, bd = Infinity;
    for (let i = 1; i < P.length; i++) {
      const c = segClosest(raw, P[i - 1], P[i]);
      const d = dist(raw, c.p);
      if (d < bd) { bd = d; bp = c.p; }
    }
    if (bp) push(bp, 'near', bd);
  }
}

/* ---------------- object snap tracking ----------------
   Every acquired point radiates alignment paths. AutoCAD offers a choice:
   orthogonal only, or every polar angle. The cursor snaps onto a path, and
   onto the crossing of two paths — the feature that lets you place a point
   "above that corner and to the right of that one" without drawing a thing. */
function trackAngles() {
  if (!ST.trackPolar) return [0, Math.PI / 2];
  const set = [], seen = new Set();
  for (const a of polarAngles()) {
    const h = wrap(a) % Math.PI;                   /* a path is a line: fold to a half turn */
    const key = Math.round(h * 1e7);
    if (seen.has(key)) continue;
    seen.add(key); set.push(h);
  }
  return set.length ? set : [0, Math.PI / 2];
}
function trackSnaps(raw, r, push, tracks) {
  const pts = ST.trackPts;
  if (!ST.otrack || !pts || !pts.length) return;
  const angs = trackAngles();
  const lines = [];
  for (const tp of pts) {
    for (const a of angs) {
      const u = [Math.cos(a), Math.sin(a)];
      const v = sub(raw, tp.p);
      const off = cross(u, v);                        /* signed distance to the path */
      if (Math.abs(off) > r) continue;
      const along = dot(v, u);
      const foot = [tp.p[0] + u[0] * along, tp.p[1] + u[1] * along];
      lines.push({ o: tp.p, u, foot, along, k: tp.k, a });
    }
  }
  if (!lines.length) return;
  for (const L of lines) {
    const dir = Math.sign(L.along || 1);
    push(L.foot, 'track', dist(raw, L.foot), null, false,
      { o: L.o, k: L.k, a: Math.atan2(L.u[1] * dir, L.u[0] * dir) });
    const t = polarPath(L.o, [L.u[0] * dir, L.u[1] * dir], Math.abs(L.along));
    t.k = 'track';
    tracks.push(t);
  }
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = lines[i], B = lines[j];
    if (Math.abs(cross(A.u, B.u)) < 1e-9) continue;
    const X = xLineLine(A.o, add(A.o, A.u), B.o, add(B.o, B.u), true);
    if (X.length) push(X[0], 'trackx');
  }
}

/* ---------------- picking ---------------- */
/* pick topmost entity near a world point */
function pickAt(p, radius, filter) {
  /* The drawn pick box has to be the aperture that actually picks, otherwise
     the setting is decoration. Explicit radii still matter (a wall wants more
     reach than a line), so they scale with the box rather than ignoring it. */
  const r = px((radius || 8) * ((+ST.pickBox || 8) / 8));
  const cands = query(p[0] - r, p[1] - r, p[0] + r, p[1] + r).filter(pickable);
  let best = null, bd = r;
  for (const e of cands) {
    if (filter && !filter(e)) continue;
    const d = entDist(p, e);
    if (d <= bd) { bd = d; best = e; }
  }
  return best;
}
function pickGrip(p) {
  const r = px(7 * ((+ST.pickBox || 8) / 8));
  for (const id of SEL) {
    const e = DOC.ents.get(id); if (!e) continue;
    for (const g of gripsOf(e)) if (dist(p, g.p) < r) return { id, k: g.k, p: g.p.slice() };
  }
  return null;
}

/* ============================================================
   point modifiers — FROM, mid-between-2-points, temporary track point
   ------------------------------------------------------------
   These sit *between* the pointing device and the running command: they eat
   one or two points of their own and then hand the command a single derived
   point. Everything a command sees is still an ordinary point.
   ============================================================ */
const PT_MODS = {
  from: { n: 1, hint: 'Base point', label: 'FROM' },
  fro: { n: 1, hint: 'Base point', label: 'FROM' },
  m2p: { n: 2, hint: 'First point of mid', label: 'MID BETWEEN 2 POINTS' },
  mtp: { n: 2, hint: 'First point of mid', label: 'MID BETWEEN 2 POINTS' },
  tt: { n: 1, hint: 'Temporary track point', label: 'TEMPORARY TRACK POINT' },
  tk: { n: 1, hint: 'Temporary track point', label: 'TEMPORARY TRACK POINT' },
};
/** start a point modifier; returns true when one was recognised */
function startPtMod(name) {
  const m = PT_MODS[name];
  if (!m) return false;
  ST.ptMod = { mode: name === 'fro' ? 'from' : (name === 'mtp' ? 'm2p' : (name === 'tk' ? 'tt' : name)), pts: [], def: m };
  ST.fromBase = null;
  if (typeof hint === 'function') hint(m.hint);
  if (typeof echo === 'function') echo(m.label);
  return true;
}
/** feed a point to the pending modifier. Returns the point the *command*
    should receive, or null when the modifier swallowed it. */
function ptModPoint(p) {
  const m = ST.ptMod;
  if (!m) return p;
  m.pts.push(p.slice());
  if (m.mode === 'from') {
    ST.ptMod = null; ST.fromBase = p.slice();
    if (typeof hint === 'function') hint('Offset from the base point — <em>@dx,dy</em> or pick');
    return null;
  }
  if (m.mode === 'tt') {
    ST.ptMod = null;
    acquireTrack(p, 'end');
    if (typeof hint === 'function') hint('Track from the temporary point');
    return null;
  }
  if (m.mode === 'm2p') {
    if (m.pts.length < 2) { if (typeof hint === 'function') hint('Second point of mid'); return null; }
    ST.ptMod = null;
    return mid(m.pts[0], m.pts[1]);
  }
  ST.ptMod = null;
  return p;
}
/** the rubber-band reference a modifier imposes (FROM measures from its base) */
function ptModRef() {
  if (ST.ptMod && ST.ptMod.mode === 'm2p' && ST.ptMod.pts.length) return ST.ptMod.pts[0];
  return ST.fromBase || null;
}
function cancelPtMods() { ST.ptMod = null; ST.fromBase = null; }

/** Text typed at a point prompt that belongs to the snap layer rather than to
    the command: FROM, M2P, TT and every osnap override name. */
function snapInputText(s) {
  const k = String(s || '').trim().toLowerCase().replace(/^[._']+/, '');
  if (!k) return false;
  if (startPtMod(k)) { if (typeof draw === 'function') draw(); return true; }
  const kind = SNAP_ALIAS[k];
  if (!kind) return false;
  setSnapOverride(kind, true);
  if (typeof echo === 'function') echo(kind === 'none' ? 'No snap for the next point' : snapKindLabel(kind).toUpperCase());
  if (typeof draw === 'function') draw();
  return true;
}

/* ---------------- lifecycle hooks ----------------
   Acquired points are transient: Escape and the end of a command drop them,
   exactly as AutoCAD does. endCmd/cmdPoint/cmdText live in 07-cmd, so wrap
   them rather than reaching across module boundaries. Function declarations
   from every module are hoisted into the one bundle scope, so they are
   already visible here. */
if (typeof endCmd === 'function' && !endCmd.__snapTracked) {
  const _endCmd = endCmd;
  const wrapped = function () {
    clearTracks(); cancelPtMods(); clearSnapOverride(true);
    return _endCmd.apply(this, arguments);
  };
  wrapped.__snapTracked = true;
  try { endCmd = wrapped; } catch (err) { /* frozen binding: tracking simply persists */ }
}
if (typeof cmdPoint === 'function' && !cmdPoint.__snapTracked) {
  const _cmdPoint = cmdPoint;
  const wrapped = function (p) {
    const eff = ptModPoint(p);
    if (eff == null) { if (typeof draw === 'function') draw(); return; }
    ST.fromBase = null;
    clearSnapOverride();
    return _cmdPoint.call(this, eff);
  };
  wrapped.__snapTracked = true;
  try { cmdPoint = wrapped; } catch (err) { /* modifiers unavailable */ }
}
if (typeof cmdText === 'function' && !cmdText.__snapTracked) {
  const _cmdText = cmdText;
  const wrapped = function (s) {
    const c = (typeof CMD !== 'undefined') && CMD;
    const live = c && c.phase !== 'sel';
    /* a FROM offset is measured from the base point, not from the last point
       the command took, so it has to be resolved before anything else */
    if (live) {
      const base = ptModRef();
      if (base && /^@/.test(String(s).trim())) {
        const p = parseCoord(String(s).trim(), base, ST.cur);
        if (p) { cmdPoint(p); return true; }
      }
    }
    /* the running command's own options win: "C to close" must close */
    if (_cmdText.apply(this, arguments)) return true;
    return live ? snapInputText(s) : false;
  };
  wrapped.__snapTracked = true;
  try { cmdText = wrapped; } catch (err) { /* typed overrides unavailable */ }
}

/* ---------------- keyboard ----------------
   AutoCAD's temporary override keys. They are momentary: the override lives
   only while the key is held, and the running set comes straight back on
   key-up. Shift on its own toggles ortho, but only while a command is asking
   for a point — outside that, Shift belongs to the selection. */
const SNAP_OVERRIDE_KEYS = {
  e: 'end', p: 'end',                              /* endpoint            */
  v: 'mid', m: 'mid',                              /* midpoint            */
  c: 'cen', ',': 'cen',                            /* centre              */
  d: 'none', l: 'none',                            /* disable all snapping */
};
let _shiftOrtho = false, _heldOverride = null;
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { clearTracks(); cancelPtMods(); clearSnapOverride(true); return; }
    if (ev.key === 'Tab' && ST.snapCands && ST.snapCands.length > 1) {
      ev.preventDefault();
      cycleSnap(ev.shiftKey ? -1 : 1);
      if (ST.snap) { ST.cur = ST.snap.p.slice(); if (typeof draw === 'function') draw(); }
      return;
    }
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    /* Shift on its own is AutoCAD's momentary ortho override: it inverts
       ORTHO while held and puts it straight back on release. Only while a
       command is asking for a point — elsewhere Shift belongs to selection. */
    if (ev.key === 'Shift' && !_shiftOrtho && typeof CMD !== 'undefined' && CMD && CMD.phase === 'run') {
      _shiftOrtho = true; ST.ortho = !ST.ortho;
      if (typeof syncToggles === 'function') syncToggles();
      if (typeof draw === 'function') draw();
      return;
    }
    if (!ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = String(ev.key).toLowerCase();
    if (k === 'x' || k === '.') {
      ev.preventDefault(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      draftToggle('polar'); return;
    }
    if (k === 'q' || k === ']') {
      ev.preventDefault(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      draftToggle('otrack'); return;
    }
    if (k === 's' || k === "'") {
      ev.preventDefault(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      draftToggle('osnap'); return;
    }
    const kind = SNAP_OVERRIDE_KEYS[k];
    if (!kind) return;
    ev.preventDefault();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    if (_heldOverride === kind) return;
    _heldOverride = kind;
    setSnapOverride(kind, false);
    if (typeof echo === 'function') echo(kind === 'none' ? 'Snap off (held)' : snapKindLabel(kind) + ' (held)');
    if (typeof draw === 'function') draw();
  });
  window.addEventListener('keyup', ev => {
    if (ev.key === 'Shift') {
      if (_shiftOrtho) {
        _shiftOrtho = false; ST.ortho = !ST.ortho;
        if (typeof syncToggles === 'function') syncToggles();
      }
      if (_heldOverride) { _heldOverride = null; clearSnapOverride(true); }
      if (typeof draw === 'function') draw();
      return;
    }
    const k = String(ev.key).toLowerCase();
    if (_heldOverride && SNAP_OVERRIDE_KEYS[k] === _heldOverride) {
      _heldOverride = null; clearSnapOverride(true);
      if (typeof draw === 'function') draw();
    }
  });
}

/** ORTHO and POLAR are mutually exclusive in AutoCAD: turning one on turns
    the other off. Everything that flips a drafting toggle comes through here. */
function draftToggle(k, val) {
  const v = val == null ? !ST[k] : !!val;
  ST[k] = v;
  if (v && k === 'ortho') ST.polar = false;
  if (v && k === 'polar') ST.ortho = false;
  if (!v && k === 'osnap') { ST.snapCands = null; ST.snap = null; }
  if (typeof syncToggles === 'function') syncToggles();
  if (typeof draw === 'function') draw();
  return v;
}
