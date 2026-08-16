/* ============================================================
   ORTHOGRAPH — 06 input state and the snap engine
   ------------------------------------------------------------
   The snap engine is a *priority* model, not a scoring model.
   Every candidate inside the aperture is collected; the one with
   the highest priority wins and distance only breaks ties. That
   makes the behaviour predictable: an endpoint inside the box
   always beats a nearest-on-curve, however close the curve is.

   Everything the cursor could land on is kept in ST.snapCands so
   Tab can cycle through overlapping points, and acquired points
   (ST.trackPts) throw polar alignment lines that the cursor can
   snap to — AutoCAD's object-snap tracking.
   ============================================================ */
const ST = {
  tool: 'select', cur: null, raw: null, snap: null, hot: null, hotGrip: null,
  band: null, preview: null, tracks: null, drawing: false,
  osnap: true, grid: true, snapgrid: false, ortho: false, polar: true, dyn: true,
  polarInc: 45, lastPt: null, dragGrip: null, panning: false, shift: false,
  osnapOn: { end: 1, mid: 1, cen: 1, quad: 1, int: 1, perp: 1, tan: 1, node: 1, ext: 1, near: 1,
    wcen: 1, wface: 1 },
  /* ---- shared interaction contract (several modules read these) ---- */
  crossLen: 100,          /* crosshair arm length, % of viewport; 100 = full width */
  pickBox: 8,             /* pick aperture in screen px */
  snapCands: null,        /* every snap candidate under the cursor, best first */
  snapCycle: 0,           /* Tab index into snapCands */
  snapScr: null,          /* screen point the cycle was anchored at */
  lastCmd: null,          /* for Space = repeat */
  trackPts: [],           /* acquired points for snap tracking: {p,k} */

  /* ---- selection & grips: the AutoCAD system variables this app honours ----
     Names deliberately echo the real sysvars so the behaviour is checkable
     against AutoCAD one setting at a time. */
  gripSize: 5,            /* GRIPSIZE   — grip box, screen px                  */
  gripsOn: 1,             /* GRIPS      — 0 hides grips entirely               */
  gripObjLimit: 100,      /* GRIPOBJLIMIT — grips suppressed past this many    */
  selCycling: 2,          /* SELECTIONCYCLING — 0 off, 1 badge, 2 badge+list   */
  lassoOn: 1,             /* PICKAUTO bit 4 — press-drag makes a lasso         */
  pickAdd: 2,             /* PICKADD    — 2 = picks accumulate, Shift removes  */
  selAreaOpacity: 25,     /* SELECTIONAREAOPACITY, per cent                    */
  /* live interaction state */
  bandPreview: null,      /* Set of ids the in-flight window would take        */
  cycleList: null,        /* ids under the pickbox when they overlap           */
  cycleIdx: 0,
  gripHot: [],            /* the red grips: [{id,k,p}]                         */
  gripHover: null,        /* the grip under the cursor: {id,k,p}               */
  gripMenu: null,         /* multifunctional grip menu: {id,k,p,items,idx}     */
  selMode: 'add',         /* the A / R switch inside a Select objects prompt   */
};
/** the pick box only shows when no command is running (AutoCAD behaviour) */
function showPickBox() { return !CMD || CMD.phase === 'sel'; }
const SNAP_R = 14;                                /* aperture, screen px */
const SNAP_CYCLE_RESET = 4;                       /* px of travel that resets Tab cycling */
const TRACK_DWELL_MS = 260;                       /* hover time before a point is acquired */
const TRACK_MAX = 7;                              /* AutoCAD keeps seven acquired points */

/* Scan budgets. snapPoint runs on every mouse move, so the entity work is
   bounded — always by taking the entities *closest to the cursor* first. */
const SNAP_MAX_SCAN = 600;      /* entDist evaluations per move            */
const SNAP_MAX_POINT = 32;      /* entities contributing point snaps       */
const SNAP_MAX_X = 8;           /* entities entering the pairwise int scan */
const SNAP_MAX_NEAR = 10;       /* entities contributing nearest-on-curve  */
const SNAP_MAX_WALL = 6;        /* walls entering the face-corner int scan */

/* ---------------- priority ----------------
   endpoint/node > intersection > midpoint > centre > quadrant >
   perpendicular/tangent > wall face > wall centreline > extension > nearest. */
const SNAP_PRI = {
  end: 100, node: 100,
  int: 90,
  trackx: 86,             /* two alignment paths crossing                  */
  mid: 80,
  cen: 70,
  quad: 60,
  track: 55,              /* on a single alignment path                    */
  perp: 50, tan: 50,
  cenEdge: 48,            /* a centre inferred from hovering its curve      */
  perpx: 46, tanx: 46,    /* deferred: the foot/point is past the geometry  */
  wface: 40,
  wcen: 30,
  ext: 20,
  grid: 8,
  near: 5,
};
/* which snap kinds can be acquired for tracking */
const TRACK_KINDS = { end: 1, mid: 1, cen: 1, quad: 1, int: 1, node: 1, perp: 1, tan: 1 };

/* ---------------- the right-click model (the menu itself lives in 13-ui) ---------------- */
const SNAP_KINDS = [
  { k: 'end', label: 'Endpoint' },
  { k: 'mid', label: 'Midpoint' },
  { k: 'cen', label: 'Centre' },
  { k: 'node', label: 'Node' },
  { k: 'quad', label: 'Quadrant' },
  { k: 'int', label: 'Intersection' },
  { k: 'ext', label: 'Extension' },
  { k: 'perp', label: 'Perpendicular' },
  { k: 'tan', label: 'Tangent' },
  { k: 'near', label: 'Nearest' },
  { k: 'wcen', label: 'Wall centreline' },
  { k: 'wface', label: 'Wall face' },
];
const SNAP_LABEL = {};
for (const s of SNAP_KINDS) SNAP_LABEL[s.k] = s.label;
SNAP_LABEL.perpx = 'Perpendicular (deferred)';
SNAP_LABEL.tanx = 'Tangent (deferred)';
SNAP_LABEL.track = 'Tracking';
SNAP_LABEL.trackx = 'Tracking intersection';
SNAP_LABEL.grid = 'Grid';
function snapKindLabel(k) { return SNAP_LABEL[k] || k; }
/** the list a right-click menu renders: [{kind,label,on}] */
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

/* ---------------- Tab cycling ---------------- */
/** step through the overlapping candidates under the cursor; returns the chosen one */
function cycleSnap(dir) {
  const c = ST.snapCands;
  if (!c || !c.length) return null;
  const n = c.length;
  ST.snapCycle = (((ST.snapCycle + (dir || 1)) % n) + n) % n;
  ST.snap = c[ST.snapCycle];
  return ST.snap;
}

/* ---------------- snap tracking ---------------- */
let _dwellPt = null, _dwellT0 = 0;
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
function clearTracks() { ST.trackPts.length = 0; ST.tracks = null; _dwellPt = null; }
/** hovering a snap point for TRACK_DWELL_MS acquires it */
function trackDwell(best, now) {
  now = now == null ? Date.now() : now;
  if (!best || !TRACK_KINDS[best.k]) { _dwellPt = null; return null; }
  if (!_dwellPt || dist(_dwellPt, best.p) > Math.max(px(0.5), 1e-9)) {
    _dwellPt = best.p.slice(); _dwellT0 = now; return null;
  }
  if (now - _dwellT0 < TRACK_DWELL_MS) return null;
  return acquireTrack(_dwellPt, best.k);
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
/* entity kinds that take part in the pairwise intersection scan */
const X_TYPES = { line: 1, pline: 1, spline: 1, circle: 1, arc: 1, ellipse: 1, xline: 1, ray: 1 };

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
  const r = px(SNAP_R);
  const on = ST.osnapOn;
  const tracks = [];

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
  function push(p, k, d, priOverride, allowFar) {
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
        if (pri > c.pri || (pri === c.pri && d < c.d)) { c.k = k; c.d = d; c.pri = pri; c.p = [x, y]; }
        return;
      }
    }
    const c = { p: [x, y], k, d, pri };
    cell.set(i0 + ',' + j0, c);
    cands.push(c);
  }

  if (ST.osnap) {
    const hits = nearEnts(raw, r);
    const pool = hits.slice(0, SNAP_MAX_POINT);
    for (const h of pool) entSnaps(h.e, h.d, raw, ref, r, push);
    if (on.int) pairIntersections(pool, raw, r, push);
    if (on.wface && on.int) wallFaceIntersections(pool, raw, r, push);
    if (on.ext) extensionSnaps(hits, raw, r, push, tracks);
    if (on.near) nearestSnaps(hits, raw, r, push);
  }

  /* ---- deferred perpendicular ----
     The foot of a perpendicular can sit far from the geometry that carries it:
     dropping a perpendicular onto a quarter arc lands at 180 degrees, nowhere
     near the arc itself. Those entities never reach the pool above, so scan
     the carriers separately. */
  if (ST.osnap && on.perp && ref) deferredPerp(raw, ref, r, push);

  /* ---- alignment paths from acquired points ---- */
  trackSnaps(raw, r, push, tracks);

  /* ---- grid snap: above nearest, below every real object snap ---- */
  if (ST.snapgrid) {
    const step = DOC.snapStep;
    if (step > 0) push([Math.round(raw[0] / step) * step, Math.round(raw[1] / step) * step], 'grid');
  }

  /* ---- pick the winner: priority first, distance only as a tie-break ---- */
  cands.sort((a, b) => b.pri - a.pri || a.d - b.d);
  ST.snapCands = cands;
  if (ST.snapCycle >= cands.length) ST.snapCycle = 0;
  let best = cands.length ? cands[ST.snapCycle] : null;
  ST.snap = best;
  if (ST.osnap) trackDwell(best, now);

  let out = best ? best.p.slice() : raw;

  /* ---- ortho / polar constrain relative to ref ---- */
  if (ref && !best) {
    if (ST.ortho) {
      const d = sub(out, ref);
      out = Math.abs(d[0]) >= Math.abs(d[1]) ? [ref[0] + d[0], ref[1]] : [ref[0], ref[1] + d[1]];
      tracks.push([ref, out]);
    } else if (ST.polar) {
      const a = ang(ref, out), L = dist(ref, out);
      const inc = rad(ST.polarInc);
      const k = Math.round(a / inc) * inc;
      if (Math.abs(wrapS(a - k)) < rad(3.2) && L > px(6)) {
        out = [ref[0] + Math.cos(k) * L, ref[1] + Math.sin(k) * L];
        tracks.push([ref, [ref[0] + Math.cos(k) * L * 3.5, ref[1] + Math.sin(k) * L * 3.5]]);
      }
    }
  }
  ST.tracks = tracks.length ? tracks : null;
  return out;
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
function entSnaps(e, dEnt, raw, ref, r, push) {
  const on = ST.osnapOn;
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
      if (ref) roundPerpTan(e, ref, raw, dEnt, push);
      break;
    }
    case 'circle': {
      if (on.cen) centreSnap(e, e.c, raw, dEnt, r, push);
      if (on.quad) for (let i = 0; i < 4; i++)
        push([e.c[0] + e.r * Math.cos(i * Math.PI / 2), e.c[1] + e.r * Math.sin(i * Math.PI / 2)], 'quad');
      if (ref) roundPerpTan(e, ref, raw, dEnt, push);
      break;
    }
    case 'ellipse': {
      if (on.cen) push(e.c, 'cen');
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
      break;
    }
    case 'wall': {
      wallSnaps(e, raw, ref, push);
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
function roundPerpTan(e, ref, raw, dEnt, push) {
  const on = ST.osnapOn;
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

/* ---------------- walls ----------------
   wcen: the centreline — its ends, its midpoint, nearest along it.
   wface: the two mitred face lines — their ends, midpoints, nearest,
          and the corner points where faces of different walls cross. */
function wallSnaps(w, raw, ref, push) {
  const on = ST.osnapOn;
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
  if (allWalls().length > 240) return;
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
function pairIntersections(pool, raw, r, push) {
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
    for (const A of P[i]) for (const B of P[j])
      for (const p of xPrim(A, B)) push(p, 'int');
}

/* ---------------- extension ----------------
   Project past the end of a line or wall the cursor is lined up with. */
function extensionSnaps(hits, raw, r, push, tracks) {
  let n = 0;
  for (const h of hits) {
    const e = h.e;
    if (e.t !== 'line' && e.t !== 'wall') continue;
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
      if (d < r) { push(proj, 'ext', d); tracks.push([P, proj]); }
    }
  }
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

/* ---------------- snap tracking ----------------
   Every acquired point radiates alignment paths at the polar increment.
   The cursor snaps onto a path, and onto the crossing of two paths. */
function trackSnaps(raw, r, push, tracks) {
  const pts = ST.trackPts;
  if (!pts || !pts.length) return;
  const inc = rad(ST.polarInc || 90) || Math.PI / 2;
  const lines = [];
  for (const tp of pts) {
    for (let a = 0; a < Math.PI - 1e-9; a += inc) {
      const u = [Math.cos(a), Math.sin(a)];
      const v = sub(raw, tp.p);
      const off = cross(u, v);                        /* signed distance to the path */
      if (Math.abs(off) > r) continue;
      const along = dot(v, u);
      const foot = [tp.p[0] + u[0] * along, tp.p[1] + u[1] * along];
      lines.push({ o: tp.p, u, foot, along });
    }
  }
  if (!lines.length) return;
  for (const L of lines) {
    push(L.foot, 'track', dist(raw, L.foot));
    const ext = Math.max(Math.abs(L.along) * 1.15, r * 6);
    tracks.push([L.o, [L.o[0] + L.u[0] * ext * Math.sign(L.along || 1), L.o[1] + L.u[1] * ext * Math.sign(L.along || 1)]]);
  }
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = lines[i], B = lines[j];
    if (Math.abs(cross(A.u, B.u)) < 1e-9) continue;
    const X = xLineLine(A.o, add(A.o, A.u), B.o, add(B.o, B.u), true);
    if (X.length) push(X[0], 'trackx');
  }
}

/* ---------------- picking ---------------- */
/** every pickable entity under the pick box, nearest first.
    Ties go to the newest object, which is the one drawn on top. */
function pickCandidates(p, radius, filter) {
  /* The drawn pick box has to be the aperture that actually picks, otherwise
     the setting is decoration. Explicit radii still matter (a wall wants more
     reach than a line), so they scale with the box rather than ignoring it. */
  const r = px((radius || 8) * ((+ST.pickBox || 8) / 8));
  const out = [];
  for (const e of query(p[0] - r, p[1] - r, p[0] + r, p[1] + r)) {
    if (!pickable(e)) continue;
    if (filter && !filter(e)) continue;
    let d; try { d = entDist(p, e); } catch (err) { continue; }
    if (d <= r) out.push({ e, d });
  }
  out.sort((a, b) => a.d - b.d || b.e.id - a.e.id);
  return out.map(x => x.e);
}
/* pick topmost entity near a world point */
function pickAt(p, radius, filter) {
  return pickCandidates(p, radius, filter)[0] || null;
}
/** the grip under the cursor. The aperture follows GRIPSIZE, so a bigger grip
    really is easier to grab rather than just looking bigger. */
function gripAt(p) {
  if (!ST.gripsOn) return null;
  const r = px(Math.max(3, (+ST.gripSize || 5)) * 1.4);
  let best = null, bd = r;
  for (const id of SEL) {
    const e = DOC.ents.get(id); if (!e) continue;
    let gs; try { gs = gripsOf(e); } catch (err) { continue; }
    for (const g of gs) {
      const d = dist(p, g.p);
      if (d < bd) { bd = d; best = { id, k: g.k, p: g.p.slice() }; }
    }
  }
  return best;
}
function pickGrip(p) { return gripAt(p); }

/* ============================================================
   SELECTION
   ------------------------------------------------------------
   One grammar covers every way AutoCAD lets you build a selection set:
   a region (rectangle, lasso or typed polygon) judged either as a window
   (everything fully enclosed) or as a crossing (everything touched), a
   fence polyline, and the keyword options typed at "Select objects:".

   Two rules are load-bearing and easy to get wrong:

   * the window/crossing sense is a SCREEN gesture. Judging it in world
     coordinates makes left-to-right mean the wrong thing the moment the
     view is rotated.
   * picks ACCUMULATE (PICKADD 2). Clicking a second object adds it;
     Shift+click removes; a click on empty space clears. Replacing the set
     on every click is the single most common way a CAD clone feels wrong.
   ============================================================ */

/** the point list a region test should use. Text is judged by its box —
    its poly() is one insertion point, which would enclose a whole
    paragraph the moment its corner crept inside the window. */
function selPts(e) {
  if (e.t === 'text') {
    let b; try { b = bbox(e); } catch (err) { return []; }
    return [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
  }
  try { return poly(e, 40) || []; } catch (err) { return []; }
}
/** every point of the entity lies inside the (possibly rotated) region */
function entInPoly(e, P) {
  const pts = selPts(e);
  if (!pts.length) return false;
  for (const p of pts) if (!pointInPoly(p, P)) return false;
  return true;
}
/** the entity touches the region at all */
function entCrossPoly(e, P) {
  const pts = selPts(e);
  if (!pts.length) return false;
  for (const p of pts) if (pointInPoly(p, P)) return true;
  const n = P.length;
  for (let i = 1; i < pts.length; i++)
    for (let j = 0; j < n; j++)
      if (segInt(pts[i - 1], pts[i], P[j], P[(j + 1) % n])) return true;
  /* a region drawn wholly inside a closed object still catches it */
  return pts.length > 2 && pointInPoly(P[0], pts);
}
/** the entity crosses an OPEN fence polyline */
function entFenceHit(e, F) {
  const pts = selPts(e);
  if (pts.length < 2 || F.length < 2) return false;
  for (let i = 1; i < pts.length; i++)
    for (let j = 1; j < F.length; j++)
      if (segInt(pts[i - 1], pts[i], F[j - 1], F[j])) return true;
  return false;
}
/* the old names, kept because they read well at the call site */
function inQuad(e, quad) { return entInPoly(e, quad); }
function crossQuad(e, quad) { return entCrossPoly(e, quad); }

function ptsBox(P) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of P) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
}
/** ids inside (or touched by) a world-space region */
function selectRegion(P, crossing, filter) {
  if (!P || P.length < 3) return [];
  const b = ptsBox(P);
  const out = [];
  for (const e of query(b[0], b[1], b[2], b[3])) {
    if (!pickable(e)) continue;
    if (filter && !filter(e)) continue;
    if (crossing ? entCrossPoly(e, P) : entInPoly(e, P)) out.push(e.id);
  }
  return out;
}
/** ids crossed by a world-space fence polyline */
function selectFence(F, filter) {
  if (!F || F.length < 2) return [];
  const b = ptsBox(F);
  const out = [];
  for (const e of query(b[0], b[1], b[2], b[3])) {
    if (!pickable(e)) continue;
    if (filter && !filter(e)) continue;
    if (entFenceHit(e, F)) out.push(e.id);
  }
  return out;
}

/* ---------------- the selection set ---------------- */
const SELHIST = [];              /* one entry per pick step — the U option    */
let SELPREV = [];                /* the P option: the set a command last used */

/** add or remove ids, recording the step so U can take it back */
function selApply(ids, remove) {
  const ch = [];
  for (const id of ids) {
    if (remove) { if (SEL.delete(id)) ch.push(id); }
    else if (!SEL.has(id) && DOC.ents.has(id)) { SEL.add(id); ch.push(id); }
  }
  if (ch.length) SELHIST.push({ ids: ch, removed: !!remove });
  return ch.length;
}
/** U at the Select objects prompt: undo the most recent pick step */
function selUndoPick() {
  const step = SELHIST.pop();
  if (!step) return false;
  for (const id of step.ids) { if (step.removed) SEL.add(id); else SEL.delete(id); }
  return true;
}
/** remember the set a modify command is about to consume, for P */
function selRemember() { if (SEL.size) SELPREV = [...SEL]; }
function selClearAll() { selRemember(); SEL.clear(); SELHIST.length = 0; gripClearHot(); }
/** L: the newest object still in the drawing */
function selLastEnt() {
  let best = null;
  for (const e of DOC.ents.values()) if (pickable(e) && (!best || e.id > best.id)) best = e;
  return best;
}
function selAllIds() {
  const out = [];
  for (const e of DOC.ents.values()) if (pickable(e)) out.push(e.id);
  return out;
}

/* ---------------- the in-flight region gesture ----------------
   ST.band carries the whole gesture in SCREEN coordinates:
     kind   'rect' | 'lasso' | 'wpoly' | 'cpoly' | 'fence'
     sense  'window' | 'crossing'          (fence has neither)
     live   true while the button is held (a drag, so a lasso)
     path   lasso trail / polygon vertices, screen px
     a,cur  rectangle corners, screen px                                  */
function bandBegin(scr, kind, sense) {
  ST.band = {
    kind: kind || 'rect', sense: sense || 'window',
    locked: !!sense, live: false,
    a: [scr[0], scr[1]], cur: [scr[0], scr[1]], path: [[scr[0], scr[1]]],
  };
  ST.bandPreview = null;
  return ST.band;
}
/** the polygon the gesture currently describes, in world coordinates */
function bandPoly(b) {
  b = b || ST.band; if (!b) return null;
  if (b.kind === 'rect') {
    const x0 = Math.min(b.a[0], b.cur[0]), x1 = Math.max(b.a[0], b.cur[0]);
    const y0 = Math.min(b.a[1], b.cur[1]), y1 = Math.max(b.a[1], b.cur[1]);
    return [s2w(x0, y0), s2w(x1, y0), s2w(x1, y1), s2w(x0, y1)];
  }
  const P = b.path.map(q => s2w(q[0], q[1]));
  if (b.kind !== 'fence' && b.cur && (b.live || b.path.length)) P.push(s2w(b.cur[0], b.cur[1]));
  else if (b.kind === 'fence' && b.cur) P.push(s2w(b.cur[0], b.cur[1]));
  return P;
}
/** true when the gesture selects by touching rather than by enclosing */
function bandCrossing(b) {
  b = b || ST.band; if (!b) return false;
  if (b.kind === 'cpoly') return true;
  if (b.kind === 'wpoly') return false;
  return b.sense === 'crossing';
}
const BAND_LASSO_MIN = 3;        /* px between recorded lasso points */
function bandMove(scr) {
  const b = ST.band; if (!b) return;
  b.cur = [scr[0], scr[1]];
  /* the sense of a rubber-band rectangle flips live as the cursor crosses the
     anchor; a lasso keeps whichever way the hand set off, so the fill does not
     strobe while the loop wanders back and forth */
  if (!b.locked) {
    if (b.kind === 'rect') b.sense = scr[0] < b.a[0] ? 'crossing' : 'window';
    else if (b.kind === 'lasso' && hyp(scr[0] - b.a[0], scr[1] - b.a[1]) > 4) {
      b.sense = scr[0] < b.a[0] ? 'crossing' : 'window'; b.locked = true;
    }
  }
  if (b.kind === 'lasso' && b.live) {
    const last = b.path[b.path.length - 1];
    if (hyp(scr[0] - last[0], scr[1] - last[1]) >= BAND_LASSO_MIN) b.path.push([scr[0], scr[1]]);
  }
  bandRefreshPreview();
}
/** a click adds a vertex to a polygon or fence gesture */
function bandPush(scr) {
  const b = ST.band; if (!b) return;
  b.path.push([scr[0], scr[1]]);
  b.cur = [scr[0], scr[1]];
  bandRefreshPreview();
}
/** objects the gesture WOULD take, refreshed live so the box teaches itself */
function bandRefreshPreview() {
  const b = ST.band;
  if (!b) { ST.bandPreview = null; return null; }
  let ids;
  if (b.kind === 'fence') ids = selectFence(bandPoly(b));
  else {
    const P = bandPoly(b);
    ids = P && P.length >= 3 ? selectRegion(P, bandCrossing(b)) : [];
  }
  ST.bandPreview = new Set(ids);
  return ST.bandPreview;
}
/** apply the gesture to the selection set and put the band away */
function bandCommit(remove) {
  const b = ST.band; if (!b) return 0;
  let ids;
  if (b.kind === 'fence') ids = selectFence(bandPoly(b));
  else {
    const P = bandPoly(b);
    ids = P && P.length >= 3 ? selectRegion(P, bandCrossing(b)) : [];
    if (P && P.length >= 3) {
      const q = ptsBox(P);
      ST.lastBand = q;                        /* STRETCH reuses the last box */
    }
  }
  const n = selApply(ids, remove == null ? ST.selMode === 'remove' : remove);
  ST.band = null; ST.bandPreview = null;
  return n;
}
function bandCancel() { ST.band = null; ST.bandPreview = null; }

/* ---------------- keyword options at "Select objects:" ----------------
   W C WP CP F ALL P L R A U — the set AutoCAD answers at every selection
   prompt. Anything that needs points arms a gesture and waits for clicks. */
const SEL_OPTION = {
  w: 'window', win: 'window', window: 'window',
  c: 'crossing', cr: 'crossing', crossing: 'crossing',
  wp: 'wpoly', wpolygon: 'wpoly',
  cp: 'cpoly', cpolygon: 'cpoly',
  f: 'fence', fence: 'fence',
  l: 'last', last: 'last',
  p: 'previous', prev: 'previous', previous: 'previous',
  all: 'all',
  r: 'remove', remove: 'remove',
  a: 'add', add: 'add',
  u: 'undo', undo: 'undo',
  box: 'box', au: 'auto', auto: 'auto', si: 'single', single: 'single',
};
function selOptionName(s) {
  return SEL_OPTION[String(s || '').trim().toLowerCase()] || null;
}
const SEL_PROMPT = {
  window: 'Specify first corner',
  crossing: 'Specify first corner',
  wpoly: 'First polygon point · <em>Enter</em> to close',
  cpoly: 'First polygon point · <em>Enter</em> to close',
  fence: 'First fence point · <em>Enter</em> to finish',
};
/** run one typed selection keyword. Returns true when it was understood. */
function selOption(s) {
  const k = selOptionName(s);
  if (!k) return false;
  const say = t => { if (typeof echo === 'function') echo(t); };
  const tell = h => { if (typeof hint === 'function') hint(h); };
  switch (k) {
    case 'window': case 'crossing':
      ST.band = null;
      ST.pendOption = { kind: 'rect', sense: k };
      tell(SEL_PROMPT[k]); say(k === 'window' ? 'Window' : 'Crossing');
      return true;
    case 'wpoly': case 'cpoly': case 'fence':
      ST.band = null;
      ST.pendOption = { kind: k };
      tell(SEL_PROMPT[k]); say(k.toUpperCase());
      return true;
    case 'box': case 'auto':
      ST.pendOption = null; say(k.toUpperCase());
      return true;
    case 'all': {
      const n = selApply(selAllIds(), ST.selMode === 'remove');
      say(n + ' found');
      return true;
    }
    case 'previous': {
      const live = SELPREV.filter(id => DOC.ents.has(id) && pickable(DOC.ents.get(id)));
      if (!live.length) { say('No previous selection set'); return true; }
      say(selApply(live, ST.selMode === 'remove') + ' found');
      return true;
    }
    case 'last': {
      const e = selLastEnt();
      if (!e) { say('Nothing to select'); return true; }
      say(selApply([e.id], ST.selMode === 'remove') + ' found');
      return true;
    }
    case 'remove': ST.selMode = 'remove'; tell('Remove objects'); say('Remove'); return true;
    case 'add': ST.selMode = 'add'; tell('Select objects'); say('Add'); return true;
    case 'undo':
      say(selUndoPick() ? 'Pick undone — ' + SEL.size + ' selected' : 'Nothing to undo');
      return true;
    case 'single': ST.selSingle = true; say('Single'); return true;
  }
  return false;
}
/** reset the per-prompt switches when a selection prompt opens or closes */
function selPromptReset() {
  ST.selMode = 'add'; ST.selSingle = false; ST.pendOption = null;
  SELHIST.length = 0;
  bandCancel();
}

/* ---------------- rollover highlight and selection cycling ----------------
   Hovering pre-highlights what a click would take. When several objects share
   the pick box AutoCAD shows a cycling badge; the list, or Shift+Space, then
   reaches any of them. */
function sameIds(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function pickHover(p, radius) {
  const list = pickCandidates(p, radius || 8);
  const ids = list.map(e => e.id);
  if (!sameIds(ids, ST.cycleList)) ST.cycleIdx = 0;      /* a new stack starts at the top */
  ST.cycleList = ids.length > 1 ? ids : null;
  if (ST.cycleIdx >= ids.length) ST.cycleIdx = 0;
  ST.hot = ids.length ? ids[ST.cycleIdx] : null;
  return list;
}
/** Shift+Space: step the rollover through the objects sharing the pick box */
function cyclePick(dir) {
  const ids = ST.cycleList;
  if (!ids || ids.length < 2) return null;
  const n = ids.length;
  ST.cycleIdx = (((ST.cycleIdx + (dir || 1)) % n) + n) % n;
  ST.hot = ids[ST.cycleIdx];
  return ST.hot;
}

/* ---------------- grips ----------------
   Unselected grips are blue, the one under the cursor takes the hover colour,
   and a grip you click is HOT and red — GRIPCOLOR / GRIPHOVER / GRIPHOT. */
function gripKey(g) { return g.id + '/' + g.k; }
function gripIsHot(id, k) {
  for (const g of ST.gripHot) if (g.id === id && g.k === k) return true;
  return false;
}
function gripClearHot() { ST.gripHot.length = 0; ST.gripMenu = null; }
/** make a grip hot. Shift keeps the ones already hot, so several vertices
    stretch together — the classic way to drag a whole wall junction. */
function gripSetHot(g, additive) {
  if (!g) return null;
  if (!additive) {
    if (!gripIsHot(g.id, g.k)) ST.gripHot = [{ id: g.id, k: g.k, p: g.p.slice() }];
  } else if (gripIsHot(g.id, g.k)) {
    ST.gripHot = ST.gripHot.filter(x => !(x.id === g.id && x.k === g.k));
    return null;
  } else ST.gripHot.push({ id: g.id, k: g.k, p: g.p.slice() });
  return g;
}
/** refresh the stored positions — a grip moves when the object does */
function gripSyncHot() {
  const out = [];
  for (const g of ST.gripHot) {
    const e = DOC.ents.get(g.id); if (!e) continue;
    let gs; try { gs = gripsOf(e); } catch (err) { continue; }
    const m = gs.find(x => x.k === g.k);
    if (m) out.push({ id: g.id, k: g.k, p: m.p.slice() });
  }
  ST.gripHot = out;
  return out;
}

/* ---------------- multifunctional grips ----------------
   Modern AutoCAD gives a grip more than one job: hover it and a small menu
   offers the alternatives, and Ctrl cycles them without the menu. A polyline
   vertex can add or remove itself; an arc grip can drive radius or length. */
function gripMenuItems(e, k) {
  if (!e) return null;
  if (e.t === 'pline' || e.t === 'spline') {
    if (k[0] === 'p') {
      const items = [{ id: 'stretch', label: 'Stretch Vertex' }, { id: 'addv', label: 'Add Vertex' }];
      if (e.pts.length > 2) items.push({ id: 'delv', label: 'Remove Vertex' });
      return items;
    }
    if (k[0] === 's') return [{ id: 'stretch', label: 'Stretch' }, { id: 'addv', label: 'Add Vertex' }];
    return null;
  }
  if (e.t === 'line') {
    if (k === 'a' || k === 'b') return [{ id: 'stretch', label: 'Stretch' }, { id: 'lengthen', label: 'Lengthen' }];
    return null;
  }
  if (e.t === 'arc') {
    if (k === 's' || k === 'e') return [{ id: 'stretch', label: 'Stretch' }, { id: 'lengthen', label: 'Lengthen' }];
    if (k === 'r') return [{ id: 'stretch', label: 'Stretch' }, { id: 'radius', label: 'Radius' }];
    return null;
  }
  if (e.t === 'wall' && (k === 'a' || k === 'b'))
    return [{ id: 'stretch', label: 'Stretch' }, { id: 'lengthen', label: 'Lengthen' }];
  return null;
}
/** open the hover menu for a grip; returns it, or null when it has one job */
function gripMenuOpen(g) {
  if (!g) { ST.gripMenu = null; return null; }
  const e = DOC.ents.get(g.id);
  const items = gripMenuItems(e, g.k);
  if (!items || items.length < 2) { ST.gripMenu = null; return null; }
  if (ST.gripMenu && ST.gripMenu.id === g.id && ST.gripMenu.k === g.k) return ST.gripMenu;
  ST.gripMenu = { id: g.id, k: g.k, p: g.p.slice(), items, idx: 0 };
  return ST.gripMenu;
}
/** Ctrl steps the menu even when it is not on screen */
function gripMenuCycle(dir) {
  const m = ST.gripMenu || gripMenuOpen(ST.gripHover);
  if (!m) return null;
  const n = m.items.length;
  m.idx = (((m.idx + (dir || 1)) % n) + n) % n;
  return m.items[m.idx];
}
function gripMenuClose() { ST.gripMenu = null; }

/** structural menu actions happen once, on a LIVE entity inside a journal.
    Returns the grip key the drag should carry on with, or null when the
    action finished on its own (Remove Vertex has nothing left to drag). */
function gripDo(e, k, action) {
  if (!e || !action || action === 'stretch') return k;
  if ((e.t === 'pline' || e.t === 'spline') && (action === 'addv' || action === 'delv')) {
    const n = e.pts.length;
    const i = +k.slice(1);
    if (!(i >= 0 && i < n)) return k;
    mut(e);
    if (action === 'delv') {
      if (k[0] !== 'p' || n <= 2) return k;
      e.pts.splice(i, 1);
      return null;
    }
    /* on the last vertex of an open polyline there is no "next" to halve, so
       carry the run of the previous segment past the end instead */
    let q;
    if (k[0] === 'p' && !e.closed && i === n - 1) {
      const d = sub(e.pts[i], e.pts[i - 1] || e.pts[i]);
      q = [e.pts[i][0] + d[0] * .5, e.pts[i][1] + d[1] * .5];
    } else q = mid(e.pts[i], e.pts[(i + 1) % n]);
    e.pts.splice(i + 1, 0, q);
    return 'p' + (i + 1);
  }
  return k;
}
/** modal menu actions change how the drag is read, not the object */
function gripEditKey(e, k, action) {
  if (e && e.t === 'arc') {
    if (action === 'lengthen') return k === 's' ? 'sL' : k === 'e' ? 'eL' : k;
    if (action === 'radius') return 'r0';
  }
  return k;
}
/** Lengthen slides the end along its own direction instead of anywhere */
function gripConstrain(e, k, action, p, orig) {
  if (action !== 'lengthen' || !e) return p;
  const O = orig && orig.t === e.t ? orig : e;
  if (e.t === 'line' || e.t === 'wall') {
    const anchor = k === 'a' ? O.b : O.a, moving = k === 'a' ? O.a : O.b;
    const u = norm(sub(moving, anchor));
    if (!u[0] && !u[1]) return p;
    const t = dot(sub(p, anchor), u);
    return [anchor[0] + u[0] * t, anchor[1] + u[1] * t];
  }
  return p;
}

/* the grip hover dwell — the menu must not flash under a travelling cursor */
const GRIP_MENU_DWELL = 380;
let _gripDwellKey = null, _gripDwellT0 = 0;
function gripHoverUpdate(g, now) {
  now = now == null ? Date.now() : now;
  ST.gripHover = g;
  if (!g) { _gripDwellKey = null; if (ST.gripMenu && !ST.gripMenuPinned) ST.gripMenu = null; return null; }
  const key = gripKey(g);
  if (key !== _gripDwellKey) { _gripDwellKey = key; _gripDwellT0 = now; ST.gripMenu = null; return null; }
  if (now - _gripDwellT0 < GRIP_MENU_DWELL) return null;
  return gripMenuOpen(g);
}

/* ---------------- lifecycle hooks ----------------
   Acquired points are transient: Escape and the end of a command drop them,
   exactly as AutoCAD does. endCmd lives in 07-cmd, so wrap it rather than
   reaching across module boundaries. */
if (typeof endCmd === 'function' && !endCmd.__snapTracked) {
  const _endCmd = endCmd;
  const wrapped = function () { clearTracks(); return _endCmd.apply(this, arguments); };
  wrapped.__snapTracked = true;
  try { endCmd = wrapped; } catch (err) { /* frozen binding: tracking simply persists */ }
}
if (typeof window !== 'undefined' && window.addEventListener)
  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') clearTracks();
    else if (ev.key === 'Tab' && ST.snapCands && ST.snapCands.length > 1) {
      ev.preventDefault();
      cycleSnap(ev.shiftKey ? -1 : 1);
      if (ST.snap) { ST.cur = ST.snap.p.slice(); if (typeof draw === 'function') draw(); }
    }
  });
