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
