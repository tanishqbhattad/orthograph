/* ============================================================
   ORTHOGRAPH — 03 solvers: intersect, offset, trim/extend,
   fillet/chamfer, dimension geometry
   ============================================================ */

/* ---- exact intersections between primitive pairs ---- */
function xLineLine(a, b, c, d, inf) {
  const r = sub(b, a), s = sub(d, c), den = cross(r, s);
  if (Math.abs(den) < EPS) return [];
  const t = cross(sub(c, a), s) / den, u = cross(sub(c, a), r) / den;
  if (!inf && (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9)) return [];
  return [[a[0] + r[0] * t, a[1] + r[1] * t]];
}
function xLineCircle(a, b, c, r, inf) {
  const d = sub(b, a), f = sub(a, c);
  const A = dot(d, d), B = 2 * dot(f, d), C = dot(f, f) - r * r;
  let disc = B * B - 4 * A * C;
  if (disc < 0 || A < EPS) return [];
  disc = Math.sqrt(disc);
  const out = [];
  for (const t of [(-B - disc) / (2 * A), (-B + disc) / (2 * A)])
    if (inf || (t >= -1e-9 && t <= 1 + 1e-9)) out.push([a[0] + d[0] * t, a[1] + d[1] * t]);
  return out;
}
function xCircleCircle(c0, r0, c1, r1) {
  const d = dist(c0, c1);
  if (d < EPS || d > r0 + r1 + 1e-9 || d < Math.abs(r0 - r1) - 1e-9) return [];
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h2 = r0 * r0 - a * a; const h = h2 < 0 ? 0 : Math.sqrt(h2);
  const m = [c0[0] + a * (c1[0] - c0[0]) / d, c0[1] + a * (c1[1] - c0[1]) / d];
  const ux = (c1[1] - c0[1]) / d * h, uy = -(c1[0] - c0[0]) / d * h;
  return h < 1e-9 ? [m] : [[m[0] + ux, m[1] + uy], [m[0] - ux, m[1] - uy]];
}
/** decompose an entity into line/circle primitives for intersection work */
function prims(e) {
  if (e.t === 'line') return [{ k: 'l', a: e.a, b: e.b }];
  if (e.t === 'circle') return [{ k: 'c', c: e.c, r: e.r, full: true }];
  if (e.t === 'arc') return [{ k: 'c', c: e.c, r: e.r, e }];
  if (e.t === 'xline' || e.t === 'ray') { const q = xlineSeg(e); return [{ k: 'l', a: q[0], b: q[1] }]; }
  const p = poly(e, 64), o = [];
  for (let i = 1; i < p.length; i++) o.push({ k: 'l', a: p[i - 1], b: p[i] });
  return o;
}
/** all intersection points between two entities. `inf` extends lines/arcs infinitely */
function intersect(e1, e2, inf) {
  const out = [];
  for (const A of prims(e1)) for (const B of prims(e2)) {
    let ps = [];
    if (A.k === 'l' && B.k === 'l') ps = xLineLine(A.a, A.b, B.a, B.b, inf);
    else if (A.k === 'l' && B.k === 'c') ps = xLineCircle(A.a, A.b, B.c, B.r, inf);
    else if (A.k === 'c' && B.k === 'l') ps = xLineCircle(B.a, B.b, A.c, A.r, inf);
    else ps = xCircleCircle(A.c, A.r, B.c, B.r);
    for (const p of ps) {
      if (!inf) {
        if (A.e && angOnArc(A.e, ang(A.c, p)) === null) continue;
        if (B.e && angOnArc(B.e, ang(B.c, p)) === null) continue;
      }
      if (!out.some(q => dist2(q, p) < 1e-14)) out.push(p);
    }
  }
  return out;
}
/** construction line / ray expanded to a very long segment */
function xlineSeg(e) {
  const L = 1e7;
  const u = norm(e.d || sub(e.b, e.a));
  return e.t === 'ray' ? [e.a, add(e.a, mul(u, L))] : [add(e.a, mul(u, -L)), add(e.a, mul(u, L))];
}

/* ---- parameter along entity (0..1) ---- */
function paramOf(e, p) {
  switch (e.t) {
    case 'line': { const d = sub(e.b, e.a); return dot(sub(p, e.a), d) / dot(d, d); }
    case 'circle': return wrap(ang(e.c, p)) / TAU;
    case 'arc': { const t = angOnArc(e, ang(e.c, p)); return t === null ? wrap(ang(e.c, p) - e.a0) / arcSweep(e) : t; }
    case 'pline': case 'spline': {
      const P = poly(e); let best = 0, bd = Infinity;
      for (let i = 1; i < P.length; i++) {
        const c = segClosest(p, P[i - 1], P[i]);
        const d = dist(p, c.p); if (d < bd) { bd = d; best = (i - 1 + c.t) / (P.length - 1); }
      }
      return best;
    }
    default: return 0;
  }
}
function ptAt(e, t) {
  switch (e.t) {
    case 'line': return [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t];
    case 'circle': return [e.c[0] + e.r * Math.cos(t * TAU), e.c[1] + e.r * Math.sin(t * TAU)];
    case 'arc': return arcPt(e, t);
    case 'pline': case 'spline': {
      const P = poly(e), n = P.length - 1, u = clamp(t, 0, 1) * n;
      const i = Math.min(Math.floor(u), n - 1), f = u - i;
      return [P[i][0] + (P[i + 1][0] - P[i][0]) * f, P[i][1] + (P[i + 1][1] - P[i][1]) * f];
    }
    default: return e.c || e.p || [0, 0];
  }
}
/** unit tangent at parameter t */
function tanAt(e, t) {
  if (e.t === 'line') return norm(sub(e.b, e.a));
  if (e.t === 'circle') { const a = t * TAU; return [-Math.sin(a), Math.cos(a)]; }
  if (e.t === 'arc') { const a = e.a0 + arcSweep(e) * t; return [-Math.sin(a), Math.cos(a)]; }
  const d = 1e-4;
  return norm(sub(ptAt(e, Math.min(1, t + d)), ptAt(e, Math.max(0, t - d))));
}
function subEnt(e, t0, t1) {                     /* new entity covering param range */
  const n = clone(e); delete n.id;
  if (e.t === 'line') { n.a = ptAt(e, t0); n.b = ptAt(e, t1); return n; }
  if (e.t === 'arc') { const s = arcSweep(e); n.a0 = e.a0 + s * t0; n.a1 = e.a0 + s * t1; return n; }
  if (e.t === 'circle') { n.t = 'arc'; n.a0 = t0 * TAU; n.a1 = t1 * TAU; return n; }
  if (e.t === 'pline' || e.t === 'spline') {
    const P = poly(e), n2 = P.length - 1, pts = [ptAt(e, t0)];
    for (let i = Math.ceil(t0 * n2); i <= Math.floor(t1 * n2); i++) pts.push(P[i]);
    pts.push(ptAt(e, t1));
    n.t = 'pline';
    n.pts = pts.filter((p, i, a) => i === 0 || dist2(p, a[i - 1]) > 1e-16);
    n.closed = false; return n;
  }
  return n;
}

/* ============================================================
   CURVES — the one representation the editing commands share
   ------------------------------------------------------------
   TRIM, EXTEND, BREAK, LENGTHEN, OFFSET, FILLET and JOIN all ask
   the same few questions of an object: where does it cross that
   one, what is the piece between these two places, how far is it
   along. They used to ask them of a tessellation — the curve
   flattened to a chain of short lines — and got answers that were
   right to the eye and wrong in the file: a trimmed circle came
   back with its end a hair off the cutter, and a polyline with an
   arc in it came back as forty vertices carrying the ORIGINAL
   bulges, which drew as a different shape entirely.

   So every object is read here as what it really is: a chain of
   exact line and arc segments, with a parameter t that runs 0..n
   along it (segment i covers t = i..i+1). A pline's arcs are its
   bulges, a circle is one closed arc, a construction line is a
   segment long enough to reach past anything drawn. Two kinds are
   approximated and say so: an ellipse is sampled finely and every
   answer on it is polished back onto the true curve, and a spline
   is the dense polyline it already draws as, so what is cut is
   exactly what is on the screen.
   ============================================================ */
const MTOL = 1e-7;          /* two points nearer than this are one point            */
const SLIVER = 1e-6;        /* a piece shorter than this is not a piece — never kept */
const XLEN = 1e7;           /* how far a construction line reaches (as xlineSeg)     */

/** a line segment, with its ends stored so they come back bit-for-bit */
function sgL(a, b) { return { k: 'l', a, b, p0: a, p1: b }; }
/** an arc segment: centre, radius, start angle and SIGNED sweep (+ is CCW) */
function sgA(c, r, a0, sw, p0, p1) {
  return {
    k: 'a', c, r, a0, sw,
    p0: p0 || [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)],
    p1: p1 || [c[0] + r * Math.cos(a0 + sw), c[1] + r * Math.sin(a0 + sw)],
  };
}
function sgPt(s, u) {
  if (u === 0) return s.p0.slice();
  if (u === 1) return s.p1.slice();
  if (s.k === 'l') return [s.a[0] + (s.b[0] - s.a[0]) * u, s.a[1] + (s.b[1] - s.a[1]) * u];
  const t = s.a0 + s.sw * u;
  return [s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)];
}
/** unit tangent in the direction of travel */
function sgTan(s, u) {
  if (s.k === 'l') return norm(sub(s.b, s.a));
  const t = s.a0 + s.sw * u, k = s.sw < 0 ? -1 : 1;
  return [-Math.sin(t) * k, Math.cos(t) * k];
}
function sgLen(s) { return s.k === 'l' ? dist(s.a, s.b) : s.r * Math.abs(s.sw); }
/** Where a point on an arc's circle sits along it: 0 at the start, 1 at the
    end, and on up to TAU/|sw| round the rest of the circle. A point a hair
    BEFORE the start is the start, not most of the way round. */
function sgArcU(s, p) {
  const phi = Math.atan2(p[1] - s.c[1], p[0] - s.c[0]);
  const d = s.sw >= 0 ? wrap(phi - s.a0) : wrap(s.a0 - phi);
  const k = Math.abs(s.sw) || TAU;
  if ((TAU - d) * s.r < MTOL) return (d - TAU) / k;
  return d / k;
}
/** the unbounded parameter of p on the segment's carrier */
function sgU(s, p) {
  if (s.k === 'a') return sgArcU(s, p);
  const d = sub(s.b, s.a), L = dot(d, d);
  return L > 0 ? dot(sub(p, s.a), d) / L : 0;
}
/** p as a parameter of the segment itself, or null if it is off it */
function sgOn(s, p) {
  const u = sgU(s, p), tu = MTOL / Math.max(sgLen(s), 1e-300);
  return (u >= -tu && u <= 1 + tu) ? Math.min(1, Math.max(0, u)) : null;
}
function sgBox(s) {
  if (s.k === 'l') return [Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1])];
  return [s.c[0] - s.r, s.c[1] - s.r, s.c[0] + s.r, s.c[1] + s.r];
}
function boxMeet(a, b, t) {
  return !(a[2] < b[0] - t || b[2] < a[0] - t || a[3] < b[1] - t || b[3] < a[1] - t);
}
/** nearest point of the segment to p, and how far */
function sgNear(s, p) {
  if (s.k === 'l') {
    const d = sub(s.b, s.a), L = dot(d, d);
    const u = L > 0 ? clamp(dot(sub(p, s.a), d) / L, 0, 1) : 0;
    const q = sgPt(s, u);
    return { u, p: q, d: dist(p, q) };
  }
  const u = sgArcU(s, p);
  if (u >= 0 && u <= 1) {
    const v = norm(sub(p, s.c));
    const q = (v[0] || v[1]) ? [s.c[0] + v[0] * s.r, s.c[1] + v[1] * s.r] : s.p0.slice();
    return { u, p: q, d: dist(p, q) };
  }
  const d0 = dist(p, s.p0), d1 = dist(p, s.p1);
  return d0 <= d1 ? { u: 0, p: s.p0.slice(), d: d0 } : { u: 1, p: s.p1.slice(), d: d1 };
}

/* ---- where two carriers meet ----
   Tangency is decided by distance, not by the sign of a discriminant: a
   fillet arc is tangent to its line to within 1e-12, and a discriminant that
   comes out at -1e-15 must not mean "they miss". */
function lineCircleX(a, b, c, r) {
  const d = sub(b, a), L2 = dot(d, d);
  if (!(L2 > 0)) return [];
  const t = dot(sub(c, a), d) / L2;
  const f = [a[0] + d[0] * t, a[1] + d[1] * t];
  const h = dist(f, c);
  if (h > r + MTOL) return [];
  if (Math.abs(h - r) <= MTOL) return [f];
  const k = Math.sqrt(Math.max(0, r * r - h * h)) / Math.sqrt(L2);
  return [[f[0] - d[0] * k, f[1] - d[1] * k], [f[0] + d[0] * k, f[1] + d[1] * k]];
}
function circleCircleX(c0, r0, c1, r1) {
  const d = dist(c0, c1);
  if (d < 1e-12) return [];
  if (d > r0 + r1 + MTOL || d < Math.abs(r0 - r1) - MTOL) return [];
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const ux = (c1[0] - c0[0]) / d, uy = (c1[1] - c0[1]) / d;
  const m = [c0[0] + a * ux, c0[1] + a * uy];
  if (Math.abs(d - (r0 + r1)) <= MTOL || Math.abs(d - Math.abs(r0 - r1)) <= MTOL) return [m];
  const h = Math.sqrt(Math.max(0, r0 * r0 - a * a));
  return [[m[0] - uy * h, m[1] + ux * h], [m[0] + uy * h, m[1] - ux * h]];
}
/** every point where the carriers of two segments meet (lines infinite,
    arcs as whole circles) */
function sgCross(s1, s2) {
  if (s1.k === 'l' && s2.k === 'l') {
    const r = sub(s1.b, s1.a), q = sub(s2.b, s2.a), den = cross(r, q);
    const L = hyp(r[0], r[1]) * hyp(q[0], q[1]);
    if (!(L > 0) || Math.abs(den) <= 1e-12 * L) return [];
    const t = cross(sub(s2.a, s1.a), q) / den;
    return [[s1.a[0] + r[0] * t, s1.a[1] + r[1] * t]];
  }
  if (s1.k === 'l') return lineCircleX(s1.a, s1.b, s2.c, s2.r);
  if (s2.k === 'l') return lineCircleX(s2.a, s2.b, s1.c, s1.r);
  return circleCircleX(s1.c, s1.r, s2.c, s2.r);
}

/** An entity as a curve, or null if it is not one. */
function curveOf(e) {
  if (!e) return null;
  let segs = [], closed = false, inf = null, ell = null;
  switch (e.t) {
    case 'line':
      if (!(dist(e.a, e.b) > 1e-12)) return null;
      segs = [sgL(e.a, e.b)]; break;
    case 'arc':
      if (!(e.r > 0)) return null;
      segs = [sgA(e.c, e.r, e.a0, arcSweep(e))]; break;
    case 'circle':
      if (!(e.r > 0)) return null;
      segs = [sgA(e.c, e.r, 0, TAU)]; closed = true; break;
    case 'pline': {
      const P = e.pts || [], m = P.length;
      if (m < 2) return null;
      closed = !!e.closed && (m > 2 || hasBulge(e));
      const spans = closed ? m : m - 1;
      for (let i = 0; i < spans; i++) {
        const p1 = P[i], p2 = P[(i + 1) % m];
        if (!(dist(p1, p2) > 1e-12)) continue;
        const b = bulgeAt(e, i), A = bulgeArc(p1, p2, b);
        const s = A ? sgA(A.c, A.r, Math.atan2(p1[1] - A.c[1], p1[0] - A.c[0]), 4 * Math.atan(b), p1, p2)
                    : sgL(p1, p2);
        s.vi = i;                                   /* the vertex span it came from */
        segs.push(s);
      }
      break;
    }
    case 'spline': {
      const P = e.pts || [], m = P.length;
      if (m < 2) return null;
      for (let i = 1; i < m; i++) if (dist(P[i - 1], P[i]) > 1e-12) segs.push(sgL(P[i - 1], P[i]));
      if (e.closed && m > 2) {
        closed = true;
        if (dist(P[m - 1], P[0]) > 1e-12) segs.push(sgL(P[m - 1], P[0]));
      }
      break;
    }
    case 'ellipse': {
      if (!(e.rx > 0) || !(e.ry > 0)) return null;
      const th0 = e.a0 ?? 0, th1 = e.a1 ?? TAU;
      const sw = (th1 - th0) || TAU;                /* read exactly as poly() draws it */
      closed = Math.abs(Math.abs(sw) - TAU) < 1e-9;
      const N = Math.max(48, Math.ceil(256 * Math.abs(sw) / TAU));
      let q = ellPt(e, th0);
      for (let i = 1; i <= N; i++) {
        const p = ellPt(e, th0 + sw * i / N);
        segs.push(sgL(q, p)); q = p;
      }
      ell = { th0, sw, N };
      break;
    }
    case 'xline': case 'ray': {
      const u = norm(e.d || [1, 0]);
      if (!(u[0] || u[1])) return null;
      if (e.t === 'xline') { segs = [sgL(add(e.a, mul(u, -XLEN)), add(e.a, mul(u, XLEN)))]; inf = [true, true]; }
      else { segs = [sgL(e.a.slice(), add(e.a, mul(u, XLEN)))]; inf = [false, true]; }
      break;
    }
    default: return null;
  }
  if (!segs.length) return null;
  return { e, segs, n: segs.length, closed, inf, ell };
}
function crvWrap(C, t) {
  if (!C.closed) return t;
  t %= C.n; return t < 0 ? t + C.n : t;
}
/** the segment a parameter falls on, and how far along it */
function crvAt(C, t) {
  t = crvWrap(C, t);
  let i = Math.floor(t);
  if (i > C.n - 1) i = C.n - 1;
  if (i < 0) i = 0;
  return [i, t - i];
}
/** the point at t — on an ellipse, the true point, not the sample's */
function crvPt(C, t) {
  if (C.ell) return ellPt(C.e, C.ell.th0 + C.ell.sw * crvWrap(C, t) / C.ell.N);
  const [i, u] = crvAt(C, t);
  return sgPt(C.segs[i], u);
}
function crvTan(C, t) {
  if (C.ell) {
    const e = C.e, th = C.ell.th0 + C.ell.sw * crvWrap(C, t) / C.ell.N;
    const cs = Math.cos(e.rot || 0), sn = Math.sin(e.rot || 0);
    const dx = -e.rx * Math.sin(th), dy = e.ry * Math.cos(th);
    const k = C.ell.sw < 0 ? -1 : 1;
    return norm([(dx * cs - dy * sn) * k, (dx * sn + dy * cs) * k]);
  }
  const [i, u] = crvAt(C, t);
  return sgTan(C.segs[i], u);
}
function crvLen(C) {
  if (C.len == null) { let L = 0; for (const s of C.segs) L += sgLen(s); C.len = L; }
  return C.len;
}
/** length from the start to t; past either end of an open curve the end
    segments carry on, which is what lets EXTEND and LENGTHEN measure */
function crvLenTo(C, t) {
  const n = C.n, L = crvLen(C);
  let base = 0;
  if (C.closed) { const k = Math.floor(t / n); base = k * L; t -= k * n; }
  let i = Math.floor(t);
  if (i < 0) i = 0;
  if (i > n - 1) i = n - 1;
  let l = base;
  for (let j = 0; j < i; j++) l += sgLen(C.segs[j]);
  return l + sgLen(C.segs[i]) * (t - i);
}
function crvLenBetween(C, t0, t1) { return crvLenTo(C, t1) - crvLenTo(C, t0); }
/** the parameter at a length along the curve (open curves may run past an end) */
function crvAtLen(C, l) {
  const n = C.n;
  if (l <= 0) return sgLen(C.segs[0]) > 0 ? l / sgLen(C.segs[0]) : 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const L = sgLen(C.segs[i]);
    if (acc + L >= l || i === n - 1) return i + (L > 0 ? (l - acc) / L : 0);
    acc += L;
  }
  return n;
}
/** the nearest place on the curve to p */
function crvNear(C, p) {
  let best = null;
  for (let i = 0; i < C.n; i++) {
    const q = sgNear(C.segs[i], p);
    if (!best || q.d < best.d) best = { t: i + q.u, p: q.p, d: q.d };
  }
  if (best && C.ell) {
    /* polish onto the real ellipse: Newton on d/dθ |E(θ) - p|² = 0 */
    const e = C.e, E = C.ell, cs = Math.cos(e.rot || 0), sn = Math.sin(e.rot || 0);
    let th = E.th0 + E.sw * best.t / E.N;
    for (let k = 0; k < 8; k++) {
      const c = Math.cos(th), s = Math.sin(th);
      const P = ellPt(e, th);
      const d1 = [(-e.rx * s) * cs - (e.ry * c) * sn, (-e.rx * s) * sn + (e.ry * c) * cs];
      const d2 = [e.c[0] - P[0], e.c[1] - P[1]];
      const w = sub(P, p);
      const g = dot(w, d1), gp = dot(d1, d1) + dot(w, d2);
      if (!(Math.abs(gp) > 1e-300)) break;
      const step = g / gp;
      th -= clamp(step, -0.05, 0.05);
      if (Math.abs(step) < 1e-14) break;
    }
    let t = (th - E.th0) / E.sw * E.N;
    if (!C.closed) t = clamp(t, 0, C.n);
    const q = crvPt(C, t);
    if (dist(q, p) <= best.d + 1e-9) best = { t: crvWrap(C, t), p: q, d: dist(q, p) };
  }
  return best;
}
/** p's parameter on segment i, allowing an open curve's end segments to run
    on past their ends when `x` asks for it ({f: forward, b: backward}) */
function sgFit(C, i, p, x) {
  const s = C.segs[i];
  const u = sgU(s, p), tu = MTOL / Math.max(sgLen(s), 1e-300);
  if (u >= -tu && u <= 1 + tu) return Math.min(1, Math.max(0, u));
  if (!x || C.closed) return null;
  const fwd = !!x.f && i === C.n - 1, back = !!x.b && i === 0;
  if (s.k === 'l') { if (fwd && u > 1) return u; if (back && u < 0) return u; return null; }
  if (fwd) return u;                                        /* past the end, round the circle  */
  if (back) return u - TAU / (Math.abs(s.sw) || TAU);      /* before the start                */
  return null;
}
/** polish an intersection that lies on an ellipse's sample back onto the
    ellipse: a secant search on the signed distance to the other carrier */
function ellPolish(C, t, other) {
  const e = C.e, E = C.ell;
  const g = th => {
    const P = ellPt(e, th);
    if (other.k === 'l') { const u = norm(sub(other.b, other.a)); return cross(u, sub(P, other.a)); }
    return dist(P, other.c) - other.r;
  };
  let a = E.th0 + E.sw * t / E.N, b = a + E.sw / E.N * 0.25;
  let ga = g(a), gb = g(b);
  for (let k = 0; k < 30 && Math.abs(gb) > 1e-12; k++) {
    if (gb === ga) break;
    const c = b - gb * (b - a) / (gb - ga);
    a = b; ga = gb; b = c; gb = g(b);
  }
  if (!isFinite(b)) return null;
  const r = (b - E.th0) / E.sw * E.N;
  /* a secant that ran off to the other crossing has found the wrong one */
  return Math.abs(r - t) <= 2 ? r : null;
}
/** Every crossing of two curves: {t1, t2, p}. `x1`/`x2` let an open curve's
    end segments run on (EXTEND, and edge mode's extended cutting edges). */
function crvHits(C1, C2, x1, x2) {
  const out = [];
  if (!C1.boxes) C1.boxes = C1.segs.map(sgBox);
  if (!C2.boxes) C2.boxes = C2.segs.map(sgBox);
  const open1 = x1 && !C1.closed, open2 = x2 && !C2.closed;
  for (let i = 0; i < C1.n; i++) {
    const e1 = open1 && ((x1.f && i === C1.n - 1) || (x1.b && i === 0));
    for (let j = 0; j < C2.n; j++) {
      const e2 = open2 && ((x2.f && j === C2.n - 1) || (x2.b && j === 0));
      if (!e1 && !e2 && !boxMeet(C1.boxes[i], C2.boxes[j], MTOL)) continue;
      for (const p0 of sgCross(C1.segs[i], C2.segs[j])) {
        let p = p0;
        let u1 = sgFit(C1, i, p, x1); if (u1 === null) continue;
        let u2 = sgFit(C2, j, p, x2); if (u2 === null) continue;
        let t1 = i + u1, t2 = j + u2;
        if (C1.ell && !C2.ell) {
          const t = ellPolish(C1, t1, C2.segs[j]);
          if (t != null) { t1 = t; p = crvPt(C1, t); const v = sgFit(C2, j, p, x2); if (v !== null) t2 = j + v; }
        } else if (C2.ell && !C1.ell) {
          const t = ellPolish(C2, t2, C1.segs[i]);
          if (t != null) { t2 = t; p = crvPt(C2, t); const v = sgFit(C1, i, p, x1); if (v !== null) t1 = i + v; }
        }
        if (out.some(h => dist(h.p, p) < MTOL * 10)) continue;
        out.push({ t1, t2, p });
      }
    }
  }
  return out;
}
/** The piece of a curve between two parameters, as a new object of the right
    kind with every property of the original: a circle's piece is an arc, a
    construction line's is a ray or a line, a closed polyline's is ONE open
    polyline. Open curves may be asked for a range past their ends. Returns
    null for a piece too short to be one. */
function crvSub(C, t0, t1) {
  const e = C.e;
  if (!(t1 > t0)) return null;
  if (crvLenBetween(C, t0, t1) < SLIVER) return null;
  const n = clone(e); delete n.id;
  switch (e.t) {
    case 'line': n.a = crvPt(C, t0); n.b = crvPt(C, t1); return n;
    case 'arc': case 'circle': {
      const s = C.segs[0];
      const sw = s.sw * (t1 - t0);
      if (sw >= TAU - 1e-9) return e.t === 'circle' ? n : null;
      n.t = 'arc';
      n.a0 = wrap(s.a0 + s.sw * t0);
      n.a1 = wrap(n.a0 + sw);
      return n;
    }
    case 'ellipse': {
      const E = C.ell;
      let a = E.th0 + E.sw * t0 / E.N, b = E.th0 + E.sw * t1 / E.N;
      if (b < a) { const k = a; a = b; b = k; }
      if (b - a >= TAU - 1e-9) { n.a0 = 0; n.a1 = TAU; return n; }
      n.a0 = wrap(a); n.a1 = n.a0 + (b - a);
      return n;
    }
    case 'xline': case 'ray': {
      const u = norm(e.d || [1, 0]);
      const fromInf = C.inf[0] && t0 <= 1e-12, toInf = C.inf[1] && t1 >= 1 - 1e-12;
      const P0 = crvPt(C, t0), P1 = crvPt(C, t1);
      if (fromInf && toInf) return n;
      delete n.d; delete n.b;
      if (toInf) { n.t = 'ray'; n.a = P0; n.d = u; return n; }
      if (fromInf) { n.t = 'ray'; n.a = P1; n.d = [-u[0], -u[1]]; return n; }
      n.t = 'line'; n.a = P0; n.b = P1; return n;
    }
    case 'pline': case 'spline': {
      const V = [], B = [];
      let last = null;
      crvWalk(C, t0, t1, (s, uS, uE) => {
        if ((uE - uS) * sgLen(s) <= 1e-9) return;
        V.push(sgPt(s, uS));
        B.push(s.k === 'a' ? Math.tan(s.sw * (uE - uS) / 4) : 0);
        last = sgPt(s, uE);
      });
      if (!last || !V.length) return null;
      V.push(last);
      n.pts = V; n.closed = false;
      if (e.t === 'pline') {
        B.push(0);
        if (B.some(b => Math.abs(b) >= BULGE_MIN)) n.bulges = B; else delete n.bulges;
      } else if (Array.isArray(e.fit) && e.fit.length) {
        /* the fit points that fall inside the piece, with its new ends */
        const F = [];
        for (const f of e.fit) {
          const q = crvNear(C, f); if (!q) continue;
          let tf = q.t;
          if (C.closed) while (tf < t0) tf += C.n;
          if (tf > t0 + 1e-9 && tf < t1 - 1e-9) F.push([tf, f.slice()]);
        }
        F.sort((a, b) => a[0] - b[0]);
        n.fit = [V[0].slice(), ...F.map(x => x[1]), last.slice()];
      }
      return n;
    }
  }
  return null;
}
/** Visit the segments a parameter range covers, in order: fn(seg, uS, uE).
    A closed curve wraps; an open one lets its end segments run on. */
function crvWalk(C, t0, t1, fn) {
  const m = C.n;
  let t = t0, guard = 0;
  while (t1 - t > 1e-12 && guard++ < 4 * m + 4) {
    let i = Math.floor(t + 1e-12), idx, tEnd;
    if (C.closed) { idx = ((i % m) + m) % m; tEnd = Math.min(t1, i + 1); }
    else {
      if (i < 0) i = 0;
      if (i > m - 1) i = m - 1;
      idx = i;
      tEnd = i === m - 1 ? t1 : Math.min(t1, i + 1);
    }
    fn(C.segs[idx], t - i, tEnd - i, idx);
    t = tEnd;
  }
}
/** A run of segments as a polyline entity built on `base`'s properties. */
function segsToPline(base, run, closed) {
  const n = clone(base); delete n.id;
  n.t = 'pline';
  for (const k of ['a', 'b', 'c', 'r', 'a0', 'a1', 'rx', 'ry', 'rot', 'd', 'fit', 'deg']) delete n[k];
  const V = [], B = [];
  for (const s of run) { V.push(s.p0.slice()); B.push(s.k === 'a' ? Math.tan(s.sw / 4) : 0); }
  if (!closed) { V.push(run[run.length - 1].p1.slice()); B.push(0); }
  n.pts = V; n.closed = !!closed;
  if (B.some(b => Math.abs(b) >= BULGE_MIN)) n.bulges = B; else delete n.bulges;
  return n;
}
/** the length of a segment piece */
function sgPieceLen(s, uS, uE) { return sgLen(s) * Math.abs(uE - uS); }

/* ============================================================
   TRIM and EXTEND
   ------------------------------------------------------------
   A trim is a question about pieces. Cut the object at every place
   a cutting edge crosses it; the pieces between those places are
   what can be taken away — the one under the pick, the ones a
   fence runs through, the ones a crossing window touches. Picking,
   fencing and windowing are three ways of choosing pieces, so they
   share everything else, and so do their answers: a piece shorter
   than SLIVER is never left behind, and a closed object that loses
   one piece comes back as ONE open object rather than several.
   ============================================================ */
/** the curves an object contributes as a cutting edge or boundary */
function edgeCurves(e) {
  const C = curveOf(e);
  if (C) return [C];
  /* A wall's faces are edges: on a plan, "trim to the wall" is the ordinary
     case, and without it Quick mode erased a line that crossed only walls. */
  if (e.t === 'wall' && typeof wallOutline === 'function') {
    const K = curveOf({ t: 'pline', pts: wallOutline(e), closed: true });
    return K ? [K] : [];
  }
  if (e.t === 'insert' && typeof insertEnts === 'function') {
    const out = [];
    for (const q of insertEnts(e)) for (const K of edgeCurves(q)) out.push(K);
    return out;
  }
  return [];
}
/** every parameter where the curve is cut by the edges, sorted, one per place */
function cutParams(C, edges, edge) {
  const ts = [];
  for (const K of edges) {
    if (K.e && C.e && K.e.id != null && K.e.id === C.e.id) continue;
    for (const h of crvHits(C, K, null, edge ? { f: 1, b: 1 } : null)) ts.push(h.t1);
  }
  return cleanCuts(C, ts);
}
function cleanCuts(C, ts) {
  const L = crvLen(C);
  let v = ts.map(t => crvWrap(C, t));
  if (!C.closed) v = v.filter(t => { const l = crvLenTo(C, t); return l > SLIVER && l < L - SLIVER; });
  v.sort((a, b) => a - b);
  const out = [];
  for (const t of v) if (!out.length || crvLenBetween(C, out[out.length - 1], t) > SLIVER) out.push(t);
  if (C.closed && out.length > 1 && crvLenBetween(C, out[out.length - 1], out[0] + C.n) <= SLIVER) out.pop();
  return out;
}
/** the pieces the cuts divide the curve into, as [t0, t1] ranges in order */
function cutPieces(C, ts) {
  if (!C.closed) {
    const b = [0, ...ts, C.n], out = [];
    for (let i = 1; i < b.length; i++) out.push([b[i - 1], b[i]]);
    return out;
  }
  if (!ts.length) return [[0, C.n]];
  const out = [];
  for (let i = 0; i < ts.length; i++) out.push([ts[i], i + 1 < ts.length ? ts[i + 1] : ts[0] + C.n]);
  return out;
}
/** which piece a parameter falls in */
function pieceOf(C, pieces, t) {
  t = crvWrap(C, t);
  for (let i = 0; i < pieces.length; i++) {
    const [a, b] = pieces[i];
    if (t >= a - 1e-12 && t <= b + 1e-12) return i;
    if (C.closed && t + C.n >= a - 1e-12 && t + C.n <= b + 1e-12) return i;
  }
  return pieces.length - 1;
}
/** What is left once the marked pieces go: a list of entities (empty when
    everything goes), or null when nothing was marked. Neighbouring kept
    pieces are one object again — on a closed curve, across the seam too. */
function keepPieces(C, pieces, gone) {
  if (!gone.some(Boolean)) return null;
  if (gone.every(Boolean)) return [];
  const out = [], m = pieces.length;
  const emit = (a, b) => { const q = crvSub(C, a, b); if (q) out.push(q); };
  if (!C.closed) {
    let s = null, e = null;
    for (let k = 0; k < m; k++) {
      if (!gone[k]) { if (s === null) s = pieces[k][0]; e = pieces[k][1]; }
      else if (s !== null) { emit(s, e); s = null; }
    }
    if (s !== null) emit(s, e);
    return out;
  }
  /* start just after a piece that goes, so no kept run straddles the start;
     once the walk wraps past the last piece the parameters carry on past n */
  const k0 = gone.findIndex(Boolean);
  let s = null, e = null;
  for (let q = 1; q <= m; q++) {
    const k = (k0 + q) % m, lift = k0 + q >= m ? C.n : 0;
    if (!gone[k]) {
      const a = pieces[k][0] + lift, b = pieces[k][1] + lift;
      if (s === null) s = a;
      e = b;
    } else if (s !== null) { emit(s, e); s = null; }
  }
  if (s !== null) emit(s, e);
  return out;
}
/** Everything TRIM needs to know about one object against a set of edges. */
function trimSplit(e, edges, edge) {
  const C = curveOf(e);
  if (!C) return null;
  const ts = cutParams(C, edges, edge);
  return { C, ts, pieces: cutPieces(C, ts) };
}
/** The trim of the piece nearest `pick`. Returns
      { keep: [entities], gone: entity }   a piece was cut away
      { erase: true, gone: e }             nothing cuts it (Quick mode erases it)
      { stuck: reason }                    it cannot be trimmed there              */
function trimPick(e, pick, edges, edge) {
  const S = trimSplit(e, edges, edge);
  if (!S) return { stuck: 'That object cannot be trimmed' };
  if (!S.ts.length) return { erase: true, gone: e };
  if (S.C.closed && S.ts.length < 2) return { stuck: 'A closed object needs two cutting edges to trim' };
  const t = crvNear(S.C, pick).t;
  const k = pieceOf(S.C, S.pieces, t);
  const gone = S.pieces.map((_, i) => i === k);
  return { keep: keepPieces(S.C, S.pieces, gone), gone: crvSub(S.C, S.pieces[k][0], S.pieces[k][1]) };
}
/** The trim of every piece a fence passes through. */
function trimFence(e, fence, edges, edge) {
  const S = trimSplit(e, edges, edge);
  if (!S) return null;
  const hits = crvHits(S.C, fence, null, null);
  if (!hits.length) return null;
  if (!S.ts.length) return { erase: true };
  if (S.C.closed && S.ts.length < 2) return null;
  const gone = S.pieces.map(() => false);
  for (const h of hits) gone[pieceOf(S.C, S.pieces, h.t1)] = true;
  return { keep: keepPieces(S.C, S.pieces, gone), gone: gonePieces(S, gone) };
}
/** the pieces a trim takes, as objects — what a preview shows going */
function gonePieces(S, gone) {
  const out = [];
  S.pieces.forEach(([a, b], i) => { if (gone[i]) { const q = crvSub(S.C, a, b); if (q) out.push(q); } });
  return out;
}
/** The trim of every piece inside or crossing a window (a closed ring). */
function trimWindow(e, ring, edges, edge) {
  const S = trimSplit(e, edges, edge);
  if (!S) return null;
  const R = curveOf({ t: 'pline', pts: ring, closed: true });
  const hits = crvHits(S.C, R, null, null);
  const inside = (t) => pointInPoly(crvPt(S.C, t), ring);
  const gone = S.pieces.map(([a, b]) => inside((a + b) / 2) ||
    hits.some(h => { const q = crvWrap(S.C, h.t1); return (q > a && q < b) || (S.C.closed && q + S.C.n > a && q + S.C.n < b); }));
  if (!gone.some(Boolean)) return null;
  if (!S.ts.length) return { erase: true };
  if (S.C.closed && S.ts.length < 2) return null;
  return { keep: keepPieces(S.C, S.pieces, gone), gone: gonePieces(S, gone) };
}
/** EXTEND: the object with the end nearer `pick` run on to the first
    boundary it meets, or null. An arc goes on round its circle, an
    elliptical arc round its ellipse, a polyline along its end segment —
    straight or curved — and nothing ever doubles back over itself. */
function extendPick(e, pick, edges, edge) {
  const C = curveOf(e);
  if (!C || C.closed || e.t === 'xline') return null;
  const t = crvNear(C, pick).t;
  let atEnd = crvLenTo(C, t) >= crvLen(C) / 2;
  if (e.t === 'ray') atEnd = false;              /* a ray has only its start */
  if (e.t === 'ellipse') return extendEllipse(e, C, atEnd, edges, edge);
  let best = null;
  for (const K of edges) {
    if (K.e && K.e.id != null && K.e.id === e.id) continue;
    for (const h of crvHits(C, K, atEnd ? { f: 1 } : { b: 1 }, edge ? { f: 1, b: 1 } : null)) {
      const over = atEnd ? h.t1 - C.n : -h.t1;
      if (!(over > 0)) continue;
      const s = C.segs[atEnd ? C.n - 1 : 0];
      const len = over * sgLen(s);
      if (len <= SLIVER) continue;
      if (s.k === 'a' && Math.abs(s.sw) * (1 + over) >= TAU - 1e-9) continue;
      if (!best || len < best.len) best = { t: h.t1, len };
    }
  }
  if (!best) return null;
  return atEnd ? crvSub(C, 0, best.t) : crvSub(C, best.t, C.n);
}
/* The older single-call forms, answering in the old shape: the pieces that
   remain (null when nothing crosses), and the extended object. */
function edgeModeOn() { return !!(typeof VS !== 'undefined' && VS.edgemode); }
function trimAt(e, click, cutters) {
  const r = trimPick(e, click, cutters.flatMap(edgeCurves), edgeModeOn());
  return r && r.keep ? r.keep : null;
}
function extendTo(e, click, bounds) {
  return extendPick(e, click, bounds.flatMap(edgeCurves), edgeModeOn());
}
function extendEllipse(e, C, atEnd, edges, edge) {
  const E = C.ell, rest = TAU - Math.abs(E.sw);
  if (rest < 1e-9) return null;
  const dir = E.sw < 0 ? -1 : 1;
  const from = atEnd ? E.th0 + E.sw : E.th0;
  const go = atEnd ? dir : -dir;
  const G = curveOf(Object.assign({}, e, { id: undefined, a0: from, a1: from + go * rest }));
  let best = null;
  for (const K of edges) {
    if (K.e && K.e.id != null && K.e.id === e.id) continue;
    for (const h of crvHits(G, K, null, edge ? { f: 1, b: 1 } : null)) {
      const len = crvLenTo(G, h.t1);
      if (len <= SLIVER) continue;
      if (!best || len < best.len) best = { th: from + go * rest * h.t1 / G.ell.N, len };
    }
  }
  if (!best) return null;
  const n = clone(e); delete n.id;
  let a = atEnd ? E.th0 : best.th, b = atEnd ? best.th : E.th0 + E.sw;
  if (b < a) { const k = a; a = b; b = k; }
  n.a0 = wrap(a); n.a1 = n.a0 + (b - a);
  return n;
}

/* ============================================================
   OFFSET
   ------------------------------------------------------------
   AutoCAD's rules, which are also the only ones that give a drawing
   you can build from:

     · a line, arc or circle offsets to the same kind of object
     · a polyline offsets segment by segment — a straight one stays
       straight, an arc stays an arc about the same centre — and the
       corners are closed the OFFSETGAPTYPE way: 0 runs the two
       segments on until they meet, 1 rounds the gap with an arc of
       the offset distance, 2 chamfers it
     · an arc that would shrink past nothing is dropped, and its
       neighbours meet across where it was
     · an ellipse or spline offsets to a SPLINE, since the offset of
       an ellipse is not an ellipse
     · whatever part of the result has swung closer to the original
       than the offset distance is not an offset at all — it is the
       loop a tight corner throws when offset inward — and is cut
       away. Offset a closed shape inward past the point where it
       vanishes and there is nothing left, which is the answer:
       not a small inside-out copy.
   ============================================================ */
/** end a segment at p instead (arcs keep their centre and radius) */
function sgSetEnd(s, p) {
  if (s.k === 'l') { s.b = p; s.p1 = p; return; }
  const d = wrapS(Math.atan2(p[1] - s.c[1], p[0] - s.c[0]) - (s.a0 + s.sw));
  s.sw += d; s.p1 = p;
}
function sgSetStart(s, p) {
  if (s.k === 'l') { s.a = p; s.p0 = p; return; }
  const d = wrapS(Math.atan2(p[1] - s.c[1], p[0] - s.c[0]) - s.a0);
  s.a0 += d; s.sw -= d; s.p0 = p;
}
function sgCopy(s) {
  return s.k === 'l' ? sgL(s.a.slice(), s.b.slice())
                     : sgA(s.c.slice(), s.r, s.a0, s.sw, s.p0.slice(), s.p1.slice());
}
/** an arc about v through a and b, the short way round */
function sgRound(v, a, b) {
  const a0 = Math.atan2(a[1] - v[1], a[0] - v[0]);
  const sw = wrapS(Math.atan2(b[1] - v[1], b[0] - v[0]) - a0);
  return sgA(v.slice(), dist(v, a), a0, sw, a.slice(), b.slice());
}
/** the segments one corner of an offset needs, after pulling A's end and
    B's start to wherever they meet. `v` is the original corner. */
function offsetJoin2(A, B, srcA, srcB, v, dl, gap) {
  if (dist(A.p1, B.p0) <= MTOL) { sgSetEnd(A, B.p0.slice()); return []; }
  const turn = cross(sgTan(srcA, 1), sgTan(srcB, 0));
  const outer = turn * dl < 0;
  if (outer && gap === 1) return [sgRound(v, A.p1.slice(), B.p0.slice())];
  if (outer && gap === 2) {
    const R = sgRound(v, A.p1.slice(), B.p0.slice());
    const m = sgPt(R, 0.5), w = perp(norm(sub(m, v)));
    const chord = sgL(m, add(m, w));
    const pick = (S, ref) => {
      const xs = sgCross(S, chord);
      xs.sort((p, q) => dist(p, ref) - dist(q, ref));
      return xs[0] || null;
    };
    const xa = pick(A, A.p1), xb = pick(B, B.p0);
    if (xa && xb) { sgSetEnd(A, xa); sgSetStart(B, xb); return [sgL(xa.slice(), xb.slice())]; }
    return [R];
  }
  const xs = sgCross(A, B).sort((p, q) => dist(p, v) - dist(q, v));
  if (xs.length) { const x = xs[0]; sgSetEnd(A, x.slice()); sgSetStart(B, x.slice()); return []; }
  return outer ? [sgRound(v, A.p1.slice(), B.p0.slice())] : [sgL(A.p1.slice(), B.p0.slice())];
}
/** Offset a chain of segments by dl (+ is to the left of travel). Returns the
    chains that survive: [{segs, closed}]. `distFn` measures how far a point
    is from the original, for cutting away what swung back inside. */
function offsetChain(segs, closed, dl, gap, distFn) {
  const raw = segs.map(s => {
    if (s.k === 'l') {
      const u = norm(sub(s.b, s.a)), o = [-u[1] * dl, u[0] * dl];
      return sgL(add(s.a, o), add(s.b, o));
    }
    const r2 = s.sw > 0 ? s.r - dl : s.r + dl;
    return r2 > MTOL ? sgA(s.c.slice(), r2, s.a0, s.sw) : null;
  });
  const live = [];
  for (let i = 0; i < segs.length; i++) if (raw[i]) live.push(i);
  if (!live.length) return [];
  /* the corner between two surviving segments: the original vertex, or the
     centre of the arc that collapsed between them */
  const corner = (i, j) => {
    for (let k = (i + 1) % segs.length; k !== j; k = (k + 1) % segs.length) if (!raw[k] && segs[k].k === 'a') return segs[k].c;
    return segs[i].p1;
  };
  const S = [];
  const nJoin = closed ? live.length : live.length - 1;
  const parts = live.map(i => sgCopy(raw[i]));
  const extra = [];
  for (let q = 0; q < nJoin; q++) {
    const i = live[q], j = live[(q + 1) % live.length];
    extra[q] = offsetJoin2(parts[q], parts[(q + 1) % live.length], segs[i], segs[j], corner(i, j), dl, gap);
  }
  for (let q = 0; q < live.length; q++) { S.push(parts[q]); if (extra[q]) for (const x of extra[q]) S.push(x); }
  return offsetPrune(S.filter(s => sgLen(s) > 1e-12), closed, Math.abs(dl), distFn);
}
/** cut the raw offset at its own crossings and keep what is truly |d| off */
function offsetPrune(S, closed, d, distFn) {
  const m = S.length;
  if (!m) return [];
  const boxes = S.map(sgBox);
  /* Crossings inside a segment cut it there; a crossing AT a vertex cuts the
     run between the two segments that meet there. Both matter: an offset of
     a waisted shape passes through the same point twice, once mid-segment and
     once at a corner, and missing the second welds the two lobes together. */
  const cuts = S.map(() => []);
  const vcut = S.map(() => false);                 /* cut after segment i */
  const at = (i, u) => {
    const L = sgLen(S[i]);
    if (u * L <= MTOL * 10) { if (i > 0) vcut[i - 1] = true; else if (closed) vcut[m - 1] = true; }
    else if ((1 - u) * L <= MTOL * 10) { if (i < m - 1 || closed) vcut[i] = true; }
    else cuts[i].push(u);
  };
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
    if (!boxMeet(boxes[i], boxes[j], MTOL)) continue;
    const nextTo = j === i + 1, wrapTo = closed && i === 0 && j === m - 1;
    const A = S[i], B = S[j];
    if (A.k === 'l' && B.k === 'l') {
      /* collinear and overlapping: each end lying inside the other is a cut */
      const u = norm(sub(A.b, A.a));
      const off = q => Math.abs(cross(u, sub(q, A.a)));
      if (off(B.a) <= MTOL && off(B.b) <= MTOL) {
        for (const q of [B.a, B.b]) { const v = sgOn(A, q); if (v !== null) at(i, v); }
        for (const q of [A.a, A.b]) { const v = sgOn(B, q); if (v !== null) at(j, v); }
        continue;
      }
    }
    for (const p of sgCross(A, B)) {
      const ui = sgOn(A, p), uj = sgOn(B, p);
      if (ui === null || uj === null) continue;
      if (nextTo && dist(p, A.p1) < MTOL * 10) continue;     /* their shared corner */
      if (wrapTo && dist(p, A.p0) < MTOL * 10) continue;
      at(i, ui); at(j, uj);
    }
  }
  /* slices: runs of segment pieces between cuts */
  const slices = [];
  let cur = [];
  for (let i = 0; i < m; i++) {
    const us = [0, ...cuts[i].sort((a, b) => a - b), 1];
    for (let k = 1; k < us.length; k++) {
      if (us[k] - us[k - 1] <= 1e-12) continue;
      cur.push({ s: S[i], i, u0: us[k - 1], u1: us[k] });
      if (k < us.length - 1) { slices.push(cur); cur = []; }
    }
    if (vcut[i] && cur.length) { slices.push(cur); cur = []; }
  }
  if (cur.length) slices.push(cur);
  const anyCut = cuts.some(c => c.length) || vcut.some(Boolean);
  if (closed && slices.length > 1 && anyCut && !vcut[m - 1]) {
    /* the seam at t = 0 is not a cut, so the last run carries on into the first */
    const first = slices.shift();
    slices[slices.length - 1] = slices[slices.length - 1].concat(first);
  }
  const tol = d * 1e-6 + 1e-7;
  const valid = slices.map(sl => {
    for (const q of sl) {
      const L = sgPieceLen(q.s, q.u0, q.u1);
      const k = L > d * 0.5 ? 3 : 1;
      for (let j = 1; j <= k; j++) {
        const p = sgPt(q.s, q.u0 + (q.u1 - q.u0) * j / (k + 1));
        if (distFn(p) < d - tol) return false;
      }
    }
    return true;
  });
  const start = sl => sgPt(sl[0].s, sl[0].u0), end = sl => { const q = sl[sl.length - 1]; return sgPt(q.s, q.u1); };
  const used = slices.map(() => false);
  const out = [];
  const near = (p, q) => dist(p, q) < Math.max(MTOL * 100, d * 1e-7);
  for (let a = 0; a < slices.length; a++) {
    if (used[a] || !valid[a]) continue;
    used[a] = true;
    let run = slices[a].slice();
    const head = start(slices[a]);
    let isLoop = closed && !anyCut && slices.length === 1;
    for (let guard = 0; !isLoop && guard <= slices.length; guard++) {
      const tail = end(run);
      if (closed && near(tail, head)) { isLoop = true; break; }
      let nx = -1;
      for (let q = 1; q <= slices.length; q++) {
        const b = (a + q) % slices.length;
        if (!used[b] && valid[b] && near(start(slices[b]), tail)) { nx = b; break; }
      }
      if (nx < 0) break;
      used[nx] = true; run = run.concat(slices[nx]);
    }
    /* a closed original only offsets to closed loops */
    if (closed && !isLoop) continue;
    const segsOut = [];
    for (const q of run) {
      const prev = segsOut[segsOut.length - 1];
      if (prev && prev.src === q.s && Math.abs(prev.u1 - q.u0) < 1e-12) { prev.u1 = q.u1; continue; }
      segsOut.push({ src: q.s, u0: q.u0, u1: q.u1 });
    }
    const built = mergeStraight(segsOut.map(q => sgPiece(q.src, q.u0, q.u1)).filter(s => sgLen(s) > 1e-9), isLoop);
    if (built.length) out.push({ segs: built, closed: isLoop });
  }
  return out;
}
/** two straight segments running on in the same direction are one */
function mergeStraight(segs, loop) {
  const same = (a, b) => a.k === 'l' && b.k === 'l' &&
    Math.abs(cross(norm(sub(a.b, a.a)), norm(sub(b.b, b.a)))) < 1e-12 && dot(sub(a.b, a.a), sub(b.b, b.a)) > 0;
  const out = [];
  for (const s of segs) {
    const p = out[out.length - 1];
    if (p && same(p, s)) out[out.length - 1] = sgL(p.a, s.b); else out.push(s);
  }
  if (loop && out.length > 2 && same(out[out.length - 1], out[0])) {
    const l = out.pop();
    out[0] = sgL(l.a, out[0].b);
  }
  return out;
}
/** a new segment covering part of another */
function sgPiece(s, u0, u1) {
  const a = sgPt(s, u0), b = sgPt(s, u1);
  if (s.k === 'l') return sgL(a, b);
  return sgA(s.c.slice(), s.r, s.a0 + s.sw * u0, s.sw * (u1 - u0), a, b);
}
/** distance from p to the nearest point of a set of segments */
function segsDist(segs) {
  const boxes = segs.map(sgBox);
  return p => {
    let d = Infinity;
    for (let i = 0; i < segs.length; i++) {
      const b = boxes[i];
      const dx = Math.max(b[0] - p[0], 0, p[0] - b[2]), dy = Math.max(b[1] - p[1], 0, p[1] - b[3]);
      if (dx * dx + dy * dy >= d * d) continue;
      const q = sgNear(segs[i], p).d;
      if (q < d) d = q;
    }
    return d;
  };
}
/** which side of an object a point is on: +1 left of its direction, -1 right */
function offsetSide(e, through) {
  const C = curveOf(e);
  if (!C) return 1;
  const q = crvNear(C, through);
  const u = crvTan(C, q.t);
  let s = cross(u, sub(through, q.p));
  if (Math.abs(s) < 1e-12 && (e.t === 'circle' || e.t === 'arc')) s = dist(through, e.c) < e.r ? 1 : -1;
  return s >= 0 ? 1 : -1;
}
/** OFFSETGAPTYPE as a number, from an explicit join or the system variable */
function offsetGap(opts) {
  if (opts && opts.join) return opts.join === 'round' ? 1 : opts.join === 'bevel' ? 2 : 0;
  const v = typeof VS !== 'undefined' ? VS.offsetgaptype : 0;
  return v === 1 || v === 2 ? v : 0;
}
/** Every object the offset of `e` by d on `side` makes — often one, none
    when it collapses, several when a waisted shape offset inward pinches
    in two. Each carries the source's properties. */
function offsetEnts(e, d, side, opts) {
  const C = curveOf(e);
  if (!C || !(d > 0)) return [];
  const dl = d * (side < 0 ? -1 : 1);
  const n = clone(e); delete n.id;
  switch (e.t) {
    case 'line': {
      const u = norm(sub(e.b, e.a)), o = [-u[1] * dl, u[0] * dl];
      n.a = add(e.a, o); n.b = add(e.b, o); return [n];
    }
    case 'xline': case 'ray': {
      const u = norm(e.d || [1, 0]), o = [-u[1] * dl, u[0] * dl];
      n.a = add(e.a, o); return [n];
    }
    case 'arc': case 'circle': {
      const r = e.r - dl;                           /* both run CCW: left is in */
      if (r <= SLIVER) return [];
      n.r = r; return [n];
    }
    case 'pline': {
      const gap = offsetGap(opts);
      return offsetChain(C.segs, C.closed, dl, gap, segsDist(C.segs))
        .map(ch => segsToPline(e, ch.segs, ch.closed));
    }
    case 'spline': {
      /* the spline IS the polyline it draws as, so its offset is that
         polyline's, handed back as a spline */
      return offsetChain(C.segs, C.closed, dl, 0, segsDist(C.segs)).map(ch => asSpline(e, ch));
    }
    case 'ellipse': {
      /* sampled finely, each sample moved square off the TRUE curve, so the
         result is exact at every sample and nowhere a chord's width out */
      const E = C.ell, N = E.N, pts = [];
      const at = t => { const p = crvPt(C, t), g = crvTan(C, t); return [p[0] - g[1] * dl, p[1] + g[0] * dl]; };
      for (let i = 0; i <= N; i++) { if (C.closed && i === N) break; pts.push(at(i)); }
      const segs = [];
      for (let i = 1; i < pts.length; i++) if (dist(pts[i - 1], pts[i]) > 1e-12) segs.push(sgL(pts[i - 1], pts[i]));
      if (C.closed && pts.length > 2) segs.push(sgL(pts[pts.length - 1], pts[0]));
      /* between samples a chord sits inside the true offset by its sag; the
         check that cuts away what swung back must allow exactly that much */
      let sag = 0;
      for (let i = 0; i < N; i++) sag = Math.max(sag, dist(mid(at(i), at(i + 1)), at(i + 0.5)));
      return offsetPrune(segs, C.closed, Math.abs(dl), p => crvNear(C, p).d + sag * 1.5)
        .map(ch => asSpline(e, ch));
    }
  }
  return [];
}
/** an offset chain as a spline carrying the source's properties */
function asSpline(e, ch) {
  const s = clone(e); delete s.id;
  for (const k of ['c', 'rx', 'ry', 'rot', 'a0', 'a1', 'fit', 'bulges']) delete s[k];
  s.t = 'spline';
  const P = ch.segs.map(q => q.p0.slice());
  if (!ch.closed) P.push(ch.segs[ch.segs.length - 1].p1.slice());
  s.pts = P; s.closed = !!ch.closed; s.deg = 3;
  return s;
}
/** the first object an offset makes, or null — the older single answer */
function offsetEnt(e, d, side, opts) {
  const r = offsetEnts(e, d, side, opts);
  return r.length ? r[0] : null;
}

/* ============================================================
   FILLET and CHAMFER — the corner between two carriers
   ------------------------------------------------------------
   Each object is reduced to the carrier of the segment that was
   picked: an infinite line, or the whole circle of an arc. The
   fillet centre sits r off both, so it is a crossing of the two
   carriers each offset by r; that gives up to eight candidates,
   and the pick points choose between them the way AutoCAD's do.
   Two lines have four, one per quadrant, and the quadrant is the
   one both picks lie in — measured from where the lines cross, so
   a pick right up against the corner still means its own arm.
   Anything with a curve in it takes the candidate whose tangent
   points sit nearest the picks.

   Every answer says, for each object, the point it now ends at
   (T) and which way from T it carries on (k), so the command can
   trim or extend any kind of object to it without knowing what
   the corner looked like.
   ============================================================ */
function carrierOff(K, r) {
  if (K.k === 'l') {
    const u = perp(norm(sub(K.b, K.a)));
    return [1, -1].map(s => sgL(add(K.a, mul(u, r * s)), add(K.b, mul(u, r * s))));
  }
  return [K.r + r, K.r - r].filter(x => x > MTOL).map(R => sgA(K.c, R, 0, TAU));
}
/** foot of p on a carrier */
function carrierFoot(K, p) {
  if (K.k === 'l') {
    const d = sub(K.b, K.a), L = dot(d, d), t = dot(sub(p, K.a), d) / L;
    return [K.a[0] + d[0] * t, K.a[1] + d[1] * t];
  }
  const v = norm(sub(p, K.c));
  return [K.c[0] + v[0] * K.r, K.c[1] + v[1] * K.r];
}
/** the tangent of a carrier at a point on it (lines: their direction, arcs: CCW) */
function carrierTan(K, p) {
  if (K.k === 'l') return norm(sub(K.b, K.a));
  const v = norm(sub(p, K.c));
  return [-v[1], v[0]];
}
/** which way along a carrier from x the pick p lies */
function armDir(K, x, p) {
  const t = carrierTan(K, x);
  const s = dot(t, sub(p, x));
  if (K.k === 'l' || Math.abs(s) > 1e-9) return s >= 0 ? t : [-t[0], -t[1]];
  /* on a circle the pick can be past the far side of x: go by angle */
  const a = wrapS(ang(K.c, p) - ang(K.c, x));
  return a >= 0 ? t : [-t[0], -t[1]];
}
/** Fillet arc of radius r between carriers A (picked at p1) and B (at p2).
    Returns { C, T1, T2, k1, k2, arc } or null when none fits. */
function filletFit(A, p1, B, p2, r) {
  const all = filletCands(A, p1, B, p2, r);
  return all.length ? all[0] : null;
}
/** every fillet that fits, best first by the rules above */
function filletCands(A, p1, B, p2, r) {
  const cands = [];
  for (const oa of carrierOff(A, r)) for (const ob of carrierOff(B, r)) for (const C of sgCross(oa, ob)) {
    const T1 = carrierFoot(A, C), T2 = carrierFoot(B, C);
    if (dist(T1, T2) < MTOL) continue;
    if (Math.abs(dist(C, T1) - r) > 1e-6 * Math.max(1, r) || Math.abs(dist(C, T2) - r) > 1e-6 * Math.max(1, r)) continue;
    const a1 = ang(C, T1), a2 = ang(C, T2), sw = wrapS(a2 - a1);
    const s = sw >= 0 ? 1 : -1;
    /* the arc leaves T1 heading toward T2; the first object carries on the
       other way, and the second carries on the way the arc arrives */
    const d1 = [-Math.sin(a1) * s, Math.cos(a1) * s], d2 = [-Math.sin(a2) * s, Math.cos(a2) * s];
    cands.push({
      C, T1, T2, k1: [-d1[0], -d1[1]], k2: d2,
      arc: sw >= 0 ? { c: C, r, a0: a1, a1: a2 } : { c: C, r, a0: a2, a1: a1 },
      score: dist(T1, p1) + dist(T2, p2),
    });
  }
  cands.sort((a, b) => a.score - b.score);
  if (cands.length && A.k === 'l' && B.k === 'l') {
    const X = sgCross(A, B)[0];
    if (X) {
      /* the quadrant both picks are in comes first */
      const u1 = armDir(A, X, p1), u2 = armDir(B, X, p2);
      const inq = c => dot(c.k1, u1) > 0 && dot(c.k2, u2) > 0;
      return cands.filter(inq).concat(cands.filter(c => !inq(c)));
    }
  }
  return cands;
}
/** The sharp corner (radius 0) between two carriers, nearest the picks. */
function cornerFit(A, p1, B, p2) {
  const xs = sgCross(A, B);
  if (!xs.length) return null;
  xs.sort((a, b) => (dist(a, p1) + dist(a, p2)) - (dist(b, p1) + dist(b, p2)));
  const X = xs[0];
  return { C: X, T1: X, T2: X, k1: armDir(A, X, p1), k2: armDir(B, X, p2), arc: null };
}
/** Chamfer between two lines: d1 along the first from the corner, d2 along
    the second, on the arms the picks are on. */
function chamferFit(A, p1, B, p2, d1, d2) {
  const X = sgCross(A, B)[0];
  if (!X) return null;
  const u1 = armDir(A, X, p1), u2 = armDir(B, X, p2);
  return { X, T1: add(X, mul(u1, d1)), T2: add(X, mul(u2, d2)), k1: u1, k2: u2 };
}

/* ---- FILLET (lines, arcs, circles) ----
   The fillet centre lies at distance r from both curves, so it is an
   intersection of the two curves each offset by r. Enumerate every
   offset combination, then keep the solution whose tangent points sit
   closest to where the user actually clicked.                          */
function offsetCurves(e, r) {
  const out = [];
  if (e.t === 'line') {
    const u = perp(norm(sub(e.b, e.a)));
    for (const s of [1, -1]) out.push({ k: 'l', a: add(e.a, mul(u, r * s)), b: add(e.b, mul(u, r * s)) });
  } else if (e.t === 'circle' || e.t === 'arc') {
    out.push({ k: 'c', c: e.c, r: e.r + r });
    if (e.r - r > EPS) out.push({ k: 'c', c: e.c, r: e.r - r });
  }
  return out;
}
function closestOn(e, p) {                       /* closest point on the unbounded carrier */
  if (e.t === 'line') {
    const d = sub(e.b, e.a), L = dot(d, d);
    if (L < EPS) return e.a.slice();
    const t = dot(sub(p, e.a), d) / L;
    return [e.a[0] + d[0] * t, e.a[1] + d[1] * t];
  }
  if (e.t === 'circle' || e.t === 'arc') {
    const u = norm(sub(p, e.c));
    if (!u[0] && !u[1]) return [e.c[0] + e.r, e.c[1]];
    return [e.c[0] + u[0] * e.r, e.c[1] + u[1] * e.r];
  }
  return p.slice();
}
function filletCurves(e1, p1, e2, p2, r) {
  if (r < 0) return null;
  const fillable = e => e.t === 'line' || e.t === 'arc' || e.t === 'circle';
  if (!fillable(e1) || !fillable(e2)) return null;
  if (r < EPS) {                                  /* r = 0 → just corner them */
    const X = intersect(e1, e2, true);
    if (!X.length) return null;
    const P = X.sort((a, b) => (dist(a, p1) + dist(a, p2)) - (dist(b, p1) + dist(b, p2)))[0];
    return { arc: null, t1: P, t2: P, P };
  }
  const cands = [];
  for (const A of offsetCurves(e1, r)) for (const B of offsetCurves(e2, r)) {
    let ps = [];
    if (A.k === 'l' && B.k === 'l') ps = xLineLine(A.a, A.b, B.a, B.b, true);
    else if (A.k === 'l' && B.k === 'c') ps = xLineCircle(A.a, A.b, B.c, B.r, true);
    else if (A.k === 'c' && B.k === 'l') ps = xLineCircle(B.a, B.b, A.c, A.r, true);
    else ps = xCircleCircle(A.c, A.r, B.c, B.r);
    for (const C of ps) {
      const t1 = closestOn(e1, C), t2 = closestOn(e2, C);
      if (Math.abs(dist(C, t1) - r) > 1e-6 || Math.abs(dist(C, t2) - r) > 1e-6) continue;
      if (dist2(t1, t2) < 1e-12) continue;
      cands.push({ C, t1, t2, score: dist(t1, p1) + dist(t2, p2) });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.score - b.score);
  const { C, t1, t2 } = cands[0];
  let a0 = ang(C, t1), a1 = ang(C, t2);
  if (wrap(a1 - a0) > Math.PI) { const s = a0; a0 = a1; a1 = s; }
  return { arc: { t: 'arc', c: C, r, a0, a1 }, t1, t2, P: C };
}
/** move whichever end of the curve sits nearer `keep` out to point `to` */
function pullEnd(e, keep, to) {
  mut(e);
  if (e.t === 'line') { if (dist2(keep, e.a) <= dist2(keep, e.b)) e.a = to; else e.b = to; return; }
  if (e.t === 'arc') {
    const aNew = ang(e.c, to);
    const d0 = Math.abs(wrapS(aNew - e.a0)), d1 = Math.abs(wrapS(aNew - e.a1));
    if (d0 <= d1) e.a0 = aNew; else e.a1 = aNew;
    return;
  }
  if (e.t === 'circle') {                          /* circle becomes an arc when filleted */
    e.t = 'arc'; e.a0 = ang(e.c, to); e.a1 = e.a0 + TAU - 1e-6;
  }
}
/** which way from the corner P did the user click on line L */
function dirFrom(P, L, click) {
  const d = sub(L.b, L.a), LL = dot(d, d);
  const t = LL < EPS ? 0 : dot(sub(click, L.a), d) / LL;
  const q = [L.a[0] + d[0] * t, L.a[1] + d[1] * t];
  let u = norm(sub(q, P));
  if (hyp(u[0], u[1]) < .5) u = norm(sub(dist2(P, L.a) > dist2(P, L.b) ? L.a : L.b, P));
  return u;
}

/* ---- dimension geometry ----
   All sizes are model-space, driven by DOC.dimStyle, so a dimension
   plots at a real size and can round-trip through DXF unchanged.     */
/* ---------------- named dimension styles ----------------
   One global set of dimension settings is fine until a drawing needs plan
   dimensions at one size and detail dimensions at another on the same sheet,
   which is to say almost immediately. A style is a named set; a dimension may
   name one, and may carry its own overrides on top of it — that three-step
   resolution is AutoCAD's, and it is what makes a style worth having rather
   than a global you keep changing back. */
/* ---------------- named text styles ----------------
   There was one text height on the document and nothing else: no font, no
   width factor, no oblique, and no way to say "all the room names look like
   this". A style is a named set and a piece of text may name one, resolved the
   same three ways a dimension style is — the text's own overrides, then the
   style it names, then the current one. */
function stdTextStyles() {
  return [{ name: 'Standard', font: 'Inter', wf: 1, oblique: 0 }];
}
function textStyles() {
  if (!Array.isArray(DOC.textStyles) || !DOC.textStyles.length)
    DOC.textStyles = stdTextStyles();
  return DOC.textStyles;
}
function textStyleRec(name) {
  const n = String(name || '').trim().toLowerCase();
  return textStyles().find(x => String(x.name).toLowerCase() === n) || null;
}
function curTextStyleRec() {
  return textStyleRec(DOC.curTextStyle) || textStyles()[0];
}
/** the settings that apply to one piece of text */
function textStyle(e) {
  const base = (e && e.style && textStyleRec(e.style)) || curTextStyleRec() || {};
  const d = (e && e.ovr) ? Object.assign({}, base, e.ovr) : base;
  return {
    font: d.font || 'Inter',
    wf: d.wf > 0 ? d.wf : 1,                      /* width factor */
    oblique: d.oblique || 0,                      /* degrees, leaning right */
    h: d.h || null,                               /* a style may fix the height */
  };
}
function stdDimStyles() {
  return [{ name: 'Standard' }];
}
function dimStyles() {
  if (!Array.isArray(DOC.dimStyles) || !DOC.dimStyles.length) {
    DOC.dimStyles = stdDimStyles();
    /* a document written before styles existed carries its settings in
       DOC.dimStyle; that becomes Standard rather than being thrown away */
    if (DOC.dimStyle && typeof DOC.dimStyle === 'object')
      Object.assign(DOC.dimStyles[0], DOC.dimStyle);
  }
  return DOC.dimStyles;
}
function dimStyleRec(name) {
  const n = String(name || '').trim().toLowerCase();
  return dimStyles().find(x => String(x.name).toLowerCase() === n) || null;
}
function curDimStyleRec() {
  return dimStyleRec(DOC.curDim) || dimStyles()[0];
}
/** The settings that apply to one dimension: its own overrides over its named
    style over the current one. Called with nothing, it answers for the current
    style, which is what every caller wanted before styles existed. */
function dimStyle(e) {
  const h = DOC.textH || 2.5;
  const base = (e && e.style && dimStyleRec(e.style)) || curDimStyleRec() || {};
  const d = (e && e.ovr) ? Object.assign({}, base, e.ovr) : base;
  /* DIMSCALE multiplies every size on a dimension and nothing else, exactly as
     it does in AutoCAD — the measurement itself is untouched. An annotative
     dimension takes its size from the scale looking at it INSTEAD: applying
     both would square the scaling, which is how annotation ends up enormous. */
  const k = (e && e.anno) ? annoK() : (DOC.dimScale == null ? 1 : DOC.dimScale);
  return {
    txt: (d.txt || h) * k,
    arrow: (d.arrow || h * 0.8) * k,
    extOff: (d.extOff != null ? d.extOff : h * 0.25) * k,  /* gap from the measured point */
    extBey: (d.extBey != null ? d.extBey : h * 0.7) * k,   /* run past the dimension line */
    gap: (d.gap != null ? d.gap : h * 0.25) * k,
    prec: d.prec != null ? d.prec : null,
    /* how the number is written. None of this is scaled by DIMSCALE: it is
       about what the dimension SAYS, not how big it is drawn. */
    pre: d.pre || '', suf: d.suf || '',
    zsupL: !!d.zsupL, zsupT: !!d.zsupT,
    lunit: d.lunit || 'dec',
    lfac: (typeof d.lfac === 'number' && isFinite(d.lfac) && d.lfac !== 0) ? d.lfac : 1,
    rnd: (typeof d.rnd === 'number' && d.rnd > 0) ? d.rnd : 0,
    tol: d.tol || 'none',
    tolUp: (typeof d.tolUp === 'number' && isFinite(d.tolUp)) ? d.tolUp : 0,
    tolLo: (typeof d.tolLo === 'number' && isFinite(d.tolLo)) ? d.tolLo
         : ((typeof d.tolUp === 'number' && isFinite(d.tolUp)) ? d.tolUp : 0),
    tolPrec: d.tolPrec != null ? d.tolPrec : null,
    tolH: (typeof d.tolH === 'number' && d.tolH > 0) ? d.tolH : 0.62,
  };
}
/* ============================================================
   How a dimension reads
   ------------------------------------------------------------
   Everything about a dimension except the number it printed was already
   adjustable. The number had one setting — decimal places — which is not
   enough to say any of the things a drawing says: feet and inches on this
   style, a suffix, no leading zero, round to the nearest 5, report at half
   size because the view is at half size, or carry a tolerance.

   The tolerance is the one that matters. A dimension with none on a
   fabrication drawing is not a dimension that is exact; it is one nobody has
   thought about. The four ways of writing one are four different things to
   mean, and AutoCAD's names for them are the ones a fabricator reads:

     sym    2500 ±2        it may be 2 either way
     dev    2500 +2 / -1   more one way than the other
     lim    2502 / 2499    the two sizes, and no nominal at all
     basic  [2500]         exact by definition; the tolerance is elsewhere
   ============================================================ */
/** one length, written the way this style writes numbers */
function dimNum(S, v, prec) {
  if (S.rnd > 0) v = Math.round(v / S.rnd) * S.rnd;
  /* a metric drawing can carry an imperial dimension and the other way round:
     the drawing's units are what it is modelled in, not what it must read in */
  if (S.lunit === 'arch' || S.lunit === 'frac' || DOC.units === 'ft') return fmt(v, 'ft');
  const u = DOC.units;
  const dp = prec != null ? prec : S.prec;
  let s;
  if (dp == null) s = fmt(v, u);                   /* what it has always done */
  else s = (v / U[u]).toFixed(clamp(dp, 0, 8)) + (u === 'in' ? '"' : '');
  if (S.zsupT && s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (S.zsupL) s = s.replace(/^(-?)0\./, '$1.');
  return s;
}
/** The pieces of what a dimension prints: the number, and whatever tolerance
    rides beside it. Typed text beats all of it, because somebody typed it. */
function dimParts(e, val) {
  const S = dimStyle(e);
  const none = { main: '', up: '', lo: '', stacked: false, box: false, hK: S.tolH, S };
  if (e && e.txt) return Object.assign({}, none, { main: String(e.txt) });
  const v = val * S.lfac;
  const wrap = (n) => S.pre + n + S.suf;
  const tp = S.tolPrec;
  if (S.tol === 'lim')
    /* limits ARE the dimension — there is no nominal for them to annotate —
       so they are set at full height rather than shrunk like a note */
    return Object.assign({}, none, { main: '', stacked: true, hK: 1,
      up: wrap(dimNum(S, v + S.tolUp)), lo: wrap(dimNum(S, v - S.tolLo)) });
  const main = wrap(dimNum(S, v));
  if (S.tol === 'sym')
    return Object.assign({}, none, { main, up: '\u00b1' + dimNum(S, Math.abs(S.tolUp), tp) });
  if (S.tol === 'dev')
    return Object.assign({}, none, { main, stacked: true,
      up: '+' + dimNum(S, Math.abs(S.tolUp), tp),
      lo: '-' + dimNum(S, Math.abs(S.tolLo), tp) });
  if (S.tol === 'basic') return Object.assign({}, none, { main, box: true });
  return Object.assign({}, none, { main });
}
/** What a DXF has to carry as a forced text (group code 1). An empty string
    means "use the measurement", which is the faithful thing to write for an
    ordinary dimension — the receiving program computes it and can restyle it.
    The moment the number is not simply the measurement, though, what we print
    is the only truth there is, so it goes in the file verbatim. */
function dimOverrideText(e, val) {
  if (e && e.txt) return String(e.txt);
  const S = dimStyle(e);
  const plain = S.tol === 'none' && !S.pre && !S.suf && S.lfac === 1 && !S.rnd &&
                S.lunit === 'dec' && !S.zsupL && !S.zsupT;
  return plain ? '' : dimText(e, val);
}
/** What a DXF has to carry as a forced text (group code 1). An empty string
    means "use the measurement", which is the faithful thing to write for an
    ordinary dimension — the receiving program computes it and can restyle it.
    The moment the number is not simply the measurement, though, what we print
    is the only truth there is, so it goes in the file verbatim. */
function dimOverrideText(e, val) {
  if (e && e.txt) return String(e.txt);
  const S = dimStyle(e);
  const plain = S.tol === 'none' && !S.pre && !S.suf && S.lfac === 1 && !S.rnd &&
                S.lunit === 'dec' && !S.zsupL && !S.zsupT;
  return plain ? '' : dimText(e, val);
}
/** the whole thing on one line, for anything that wants a string */
function dimText(e, val) {
  const p = dimParts(e, val);
  if (!p.up && !p.lo) return p.main;
  const tol = p.lo ? p.up + ' / ' + p.lo : p.up;
  return p.main ? p.main + ' ' + tol : tol;
}
/* ---------------- associative dimensions ----------------
   A dimension that keeps a copy of two coordinates starts lying the moment the
   wall it measures is moved, and a drawing full of confidently wrong numbers is
   worse than one with none. An associative dimension stores a reference to the
   geometry instead, and is resolved every time it is drawn, exported or
   measured — so it cannot go stale between an edit and a redraw. */
/** the point a reference names, or null if it no longer exists */
function refPointOf(host, at, ref) {
  if (!host) return null;
  let base = null;
  if (at === 'a') base = host.a;
  else if (at === 'b') base = host.b;
  else if (at === 'c') base = host.c;
  else if (at === 'p') base = host.p;
  else if (at === 'mid' && host.a && host.b) base = mid(host.a, host.b);
  else if (typeof at === 'number' && host.pts) base = host.pts[at];
  if (!base) return null;
  /* An offset recorded in the entity's own frame is rebuilt from the frame it
     has NOW, so the point follows the wall through a stretch or a rotation
     rather than staying where the world used to be. */
  if (ref && (ref.du || ref.dv) && host.a && host.b) {
    const L = dist(host.a, host.b);
    if (L < 1e-9) return base;
    const ux = (host.b[0] - host.a[0]) / L, uy = (host.b[1] - host.a[1]) / L;
    return [base[0] + ux * (ref.du || 0) - uy * (ref.dv || 0),
            base[1] + uy * (ref.du || 0) + ux * (ref.dv || 0)];
  }
  return base;
}
/** One end of a dimension: the live geometry if it is attached and still
    there, otherwise the last coordinate it saw. Losing the host does not
    invalidate the dimension — AutoCAD keeps it and simply stops updating it,
    which is also the only answer that does not silently delete work. */
function dimEnd(e, which) {
  const ref = which === 1 ? e.r1 : e.r2;
  const fallback = which === 1 ? e.p1 : e.p2;
  if (!ref) return fallback;
  const p = refPointOf(DOC.ents.get(ref.id), ref.at, ref);
  return p || fallback;
}
/** true when a dimension is attached to geometry that still exists */
function dimAssoc(e) {
  for (const ref of [e.r1, e.r2]) {
    if (!ref) continue;
    if (refPointOf(DOC.ents.get(ref.id), ref.at, ref)) return true;
  }
  return false;
}
/** A driving dimension is marked the way every parametric modeller marks one:
    the drawing has to say which numbers it is obeying and which it is merely
    reporting, or the two look identical and one of them is a trap. Only the
    drawn text is marked — an export carries the measurement itself, because
    the program opening it has no constraints to obey. */
function drvTxt(e, s) { return (e && e.drive) ? 'fx ' + s : s; }
function dimGeom(e0) {
  /* Resolve any association once, then work from the live points. The body
     below is unchanged and still reads p1/p2: an associative dimension simply
     hands it a view of itself in which those are current. Doing it here means
     drawing, exporting, plotting and measuring all get the same answer, and
     none of them can see a stale one. */
  const P1 = dimEnd(e0, 1), P2 = dimEnd(e0, 2);
  const e = (P1 === e0.p1 && P2 === e0.p2)
    ? e0
    : Object.assign({}, e0, { p1: P1, p2: P2 });
  const S = dimStyle(e0);
  const lines = [], arrows = [];
  if (e.k === 'radius' || e.k === 'diameter') {
    const c = e.p1, p = e.p2, u = norm(sub(p, c));
    const a = e.k === 'diameter' ? [c[0] - u[0] * dist(c, p), c[1] - u[1] * dist(c, p)] : c;
    lines.push([a, p]); arrows.push({ p, a: ang(a, p) });
    if (e.k === 'diameter') arrows.push({ p: a, a: ang(p, a) });
    const val = (e.k === 'diameter' ? 2 : 1) * dist(c, p);
    return { lines, arrows, tp: mid(a, p), tr: 0, txt: drvTxt(e0, (e.k === 'diameter' ? 'Ø' : 'R') + dimParts(e, val).main), tol: dimParts(e, val), val, S };
  }
  /* ORDINATE — how a setting-out drawing is dimensioned. Not a chain of sizes
     between features, where one error walks down the whole run, but each
     feature's distance from a single datum. It spans nothing, so it has no
     arrowheads: it is a jogged leader from the feature out to its number. */
  if (e.k === 'ordinate') {
    const d0 = e.datum || [0, 0];
    const f = e.p1, tp0 = e.p2 || e.p1;
    const dx = tp0[0] - f[0], dy = tp0[1] - f[1];
    /* the axis is the one the leader is NOT pulled along: a leader taken up
       the page is calling out an X, which is how it reads on a drawing */
    const axis = e.axis === 'x' || e.axis === 'y' ? e.axis
               : (Math.abs(dy) >= Math.abs(dx) ? 'x' : 'y');
    const val = axis === 'x' ? f[0] - d0[0] : f[1] - d0[1];
    /* the jog: out along the leader, then square to the text */
    const jog = axis === 'x'
      ? [f[0], f[1] + dy * 0.65]
      : [f[0] + dx * 0.65, f[1]];
    lines.push([f, jog], [jog, tp0]);
    const along = axis === 'x' ? (dy >= 0 ? 1 : -1) : (dx >= 0 ? 1 : -1);
    const tp = axis === 'x'
      ? [tp0[0], tp0[1] + along * S.gap]
      : [tp0[0] + along * S.gap, tp0[1]];
    return { lines, arrows: [], tp, tr: 0, txt: drvTxt(e0, dimParts(e, val).main), tol: dimParts(e, val), val, S,
             anchor: axis === 'x' ? 'c' : (along > 0 ? 'l' : 'r') };
  }
  /* ARC LENGTH — measured ALONG the curve. An aligned dimension across the
     ends of an arc measures the chord, which for anything but a shallow arc
     is a different number, and the one somebody would cut to. */
  if (e.k === 'arclen') {
    const c = e.p3 || e.p1;
    const r = dist(c, e.p1) || 1;
    const a0 = ang(c, e.p1), a1 = ang(c, e.p2);
    const sweep = Math.abs(wrap(a1 - a0));
    const R = r + (e.off || 0);
    const n = 32, pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + wrap(a1 - a0) * i / n;
      pts.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]);
    }
    for (let i = 1; i < pts.length; i++) lines.push([pts[i - 1], pts[i]]);
    /* extension lines run from the arc itself out to the dimension line */
    lines.push([[c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)],
                [c[0] + (R + S.extBey) * Math.cos(a0), c[1] + (R + S.extBey) * Math.sin(a0)]]);
    lines.push([[c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)],
                [c[0] + (R + S.extBey) * Math.cos(a1), c[1] + (R + S.extBey) * Math.sin(a1)]]);
    const am = a0 + wrap(a1 - a0) / 2;
    /* the measurement is the ARC's length, not the length of the line drawn
       to represent it: moving the dimension line out must not change it */
    const val = r * sweep;
    return {
      lines, arrows: [{ p: pts[0], a: a0 - Math.PI / 2 }, { p: pts[n], a: a1 + Math.PI / 2 }],
      tp: [c[0] + R * Math.cos(am), c[1] + R * Math.sin(am)], tr: 0,
      txt: e.txt || '\u2312' + dimParts(e, val).main, tol: dimParts(e, val), val, S, arcR: R, arcC: c, a0, a1,
    };
  }
  if (e.k === 'angular') {
    const c = e.p3 || e.p1, r = dist(c, e.p1) || 1;
    const a0 = ang(c, e.p1), a1 = ang(c, e.p2);
    const R = r + (e.off || 0);
    const n = 32, pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + wrap(a1 - a0) * i / n; pts.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]); }
    for (let i = 1; i < pts.length; i++) lines.push([pts[i - 1], pts[i]]);
    lines.push([c, [c[0] + (R + S.extBey) * Math.cos(a0), c[1] + (R + S.extBey) * Math.sin(a0)]]);
    lines.push([c, [c[0] + (R + S.extBey) * Math.cos(a1), c[1] + (R + S.extBey) * Math.sin(a1)]]);
    const am = a0 + wrap(a1 - a0) / 2;
    const val = deg(wrap(a1 - a0));
    return {
      lines, arrows: [{ p: pts[0], a: a0 - Math.PI / 2 }, { p: pts[n], a: a1 + Math.PI / 2 }],
      tp: [c[0] + R * Math.cos(am), c[1] + R * Math.sin(am)], tr: 0,
      txt: e.txt || val.toFixed(1) + '°', val, S, arcR: R, arcC: c, a0, a1,
    };
  }
  /* linear / aligned / ordinate */
  let u;
  if (e.k === 'horizontal') u = [1, 0];
  else if (e.k === 'vertical') u = [0, 1];
  else u = norm(sub(e.p2, e.p1));
  if (!u[0] && !u[1]) u = [1, 0];
  const v = perp(u), off = e.off || 0;
  const proj = p => { const t = dot(sub(p, e.p1), u); return [e.p1[0] + u[0] * t, e.p1[1] + u[1] * t]; };
  const q1 = add(proj(e.p1), mul(v, off)), q2 = add(proj(e.p2), mul(v, off));
  lines.push([q1, q2]);
  /* extension lines: start slightly off the measured point, run a little past */
  const sgn = off >= 0 ? 1 : -1;
  const e1a = add(e.p1, mul(v, sgn * S.extOff)), e1b = add(q1, mul(v, sgn * S.extBey));
  const e2a = add(e.p2, mul(v, sgn * S.extOff)), e2b = add(q2, mul(v, sgn * S.extBey));
  if (dist(e.p1, q1) > S.extOff) lines.push([e1a, e1b]);
  if (dist(e.p2, q2) > S.extOff) lines.push([e2a, e2b]);
  arrows.push({ p: q1, a: ang(q2, q1) }, { p: q2, a: ang(q1, q2) });
  const val = dist(q1, q2);
  let tr = Math.atan2(q2[1] - q1[1], q2[0] - q1[0]);
  if (tr > Math.PI / 2 + 1e-9 || tr < -Math.PI / 2 - 1e-9) tr += Math.PI;
  const tp = add(mid(q1, q2), mul(perp([Math.cos(tr), Math.sin(tr)]), S.gap + S.txt * 0.5));
  return { lines, arrows, tp, tr, txt: drvTxt(e0, dimParts(e, val).main), tol: dimParts(e, val), val, S, q1, q2 };
}
/** arrowhead outline as a closed polygon, in model space */
function arrowPoly(p, a, sz) {
  const u = [Math.cos(a), Math.sin(a)], n = perp(u);
  return [p,
    [p[0] + u[0] * sz + n[0] * sz * 0.17, p[1] + u[1] * sz + n[1] * sz * 0.17],
    [p[0] + u[0] * sz - n[0] * sz * 0.17, p[1] + u[1] * sz - n[1] * sz * 0.17]];
}

/* ---- misc constructors ---- */
function circum(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return null;
  const A = dot(a, a), B = dot(b, b), C = dot(c, c);
  const ux = (A * (b[1] - c[1]) + B * (c[1] - a[1]) + C * (a[1] - b[1])) / d;
  const uy = (A * (c[0] - b[0]) + B * (a[0] - c[0]) + C * (b[0] - a[0])) / d;
  return { c: [ux, uy], r: dist([ux, uy], a) };
}
function arc3(a, b, c) {
  const cc = circum(a, b, c); if (!cc) return null;
  const a0 = ang(cc.c, a), am = ang(cc.c, b), a1 = ang(cc.c, c);
  if (wrap(am - a0) <= wrap(a1 - a0)) return { t: 'arc', c: cc.c, r: cc.r, a0, a1 };
  return { t: 'arc', c: cc.c, r: cc.r, a0: a1, a1: a0 };
}
function polyGon(c, r, n, a0, inscribed) {
  const R = inscribed === false ? r / Math.cos(Math.PI / n) : r;
  const pts = [];
  for (let i = 0; i < n; i++) { const a = a0 + i * TAU / n; pts.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]); }
  return { t: 'pline', pts, closed: true };
}
/** uniform b-spline sampling (Cox–de Boor), clamped or periodic */
function bspline(cp, degIn, closed) {
  if (cp.length <= 2) return cp.slice();
  const deg = clamp(degIn || 3, 1, Math.min(3, cp.length - 1));
  const P = closed ? [...cp, ...cp.slice(0, deg)] : cp;
  const n = P.length - 1, k = deg;
  const knots = [];
  for (let i = 0; i <= n + k + 1; i++) knots.push(closed ? i : clamp(i - k, 0, n - k + 1));
  const N = (i, p, u) => {
    if (p === 0) return (u >= knots[i] && u < knots[i + 1]) ? 1 : 0;
    let a = 0, b = 0;
    const d1 = knots[i + p] - knots[i], d2 = knots[i + p + 1] - knots[i + 1];
    if (d1 > 0) a = (u - knots[i]) / d1 * N(i, p - 1, u);
    if (d2 > 0) b = (knots[i + p + 1] - u) / d2 * N(i + 1, p - 1, u);
    return a + b;
  };
  const u0 = knots[k], u1 = knots[n + 1];
  const steps = Math.min(400, Math.max(40, cp.length * 12));
  const out = [];
  for (let s = 0; s <= steps; s++) {
    const u = u0 + (u1 - u0) * s / steps - (s === steps ? 1e-9 : 0);
    let x = 0, y = 0, w = 0;
    for (let i = 0; i <= n; i++) { const b = N(i, k, u); if (b) { x += P[i][0] * b; y += P[i][1] * b; w += b; } }
    if (w > 1e-9) out.push([x / w, y / w]);
  }
  return out.length > 1 ? out : cp.slice();
}
/** Catmull-Rom through the given points — used when drawing a spline by hand */
function fitSpline(pts, closed) {
  if (pts.length < 3) return pts.slice();
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  const seg = 16;
  for (let i = 1; i + 2 < P.length; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    for (let s = 0; s < seg; s++) {
      const t = s / seg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(pts[pts.length - 1]);
  return out;
}
