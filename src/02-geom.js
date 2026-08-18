/* ============================================================
   ORTHOGRAPH — 02 entity geometry, hit testing, transforms
   ============================================================ */

/* Extension registry. Architectural types register here (module 04)
   so the core does not need to know about them. */
const GEOM = Object.create(null);
const isArch = t => !!GEOM[t];

/* arcs: a0 -> a1 always CCW (sweep = wrap(a1-a0)) */
function arcSweep(e) { const s = wrap(e.a1 - e.a0); return s < EPS ? TAU : s; }
function arcPt(e, t) { const a = e.a0 + arcSweep(e) * t; return [e.c[0] + e.r * Math.cos(a), e.c[1] + e.r * Math.sin(a)]; }
function angOnArc(e, a) { const s = arcSweep(e), d = wrap(a - e.a0); return d <= s + 1e-9 ? d / s : null; }
function ellPt(e, a) {
  const k = Math.cos(a) * e.rx, s = Math.sin(a) * e.ry, c = Math.cos(e.rot), n = Math.sin(e.rot);
  return [e.c[0] + k * c - s * n, e.c[1] + k * n + s * c];
}
/** tessellate an arc record into points */
function arcPts(a, tol) {
  const sw = wrap(a.a1 - a.a0) || TAU;
  const n = Math.max(4, Math.ceil((tol || 24) * sw / TAU * 3));
  const o = [];
  for (let i = 0; i <= n; i++) { const t = a.a0 + sw * i / n; o.push([a.c[0] + a.r * Math.cos(t), a.c[1] + a.r * Math.sin(t)]); }
  return o;
}

/* ---------------- shapes: the canonical "what to draw" form ----------------
   Each item is one of
     { pts:[...], closed:bool }      polyline
     { c:[x,y], r, a0, a1 }          arc
     { c:[x,y], r }                  circle
     { text:'..', p, h, rot, anchor} text
   plus optional lt (linetype), col (explicit colour), lw, hatch.
   Core primitives have a trivial single-item shape list; architectural
   entities expand into many.                                            */
function shapes(e, tol) {
  const g = GEOM[e.t];
  if (g && g.shapes) return g.shapes(e, tol) || [];
  switch (e.t) {
    case 'line': return [{ pts: [e.a, e.b] }];
    case 'pline': return [{ pts: e.pts, closed: !!e.closed }];
    case 'spline': return [{ pts: e.pts, closed: !!e.closed }];
    case 'circle': return [{ c: e.c, r: e.r }];
    case 'arc': return [{ c: e.c, r: e.r, a0: e.a0, a1: e.a1 }];
    case 'ellipse': return [{ pts: poly(e, tol || 48) }];
    case 'point': return [];
    case 'text': return [{ text: e.s, p: e.p, h: e.h, rot: e.rot || 0, anchor: e.anchor || 'l' }];
    default: return [];
  }
}

/** dense polyline approximation of any entity (world coords) */
function poly(e, tol) {
  tol = tol || 24;
  const g = GEOM[e.t];
  if (g) {
    if (g.poly) return g.poly(e, tol);
    const out = [];
    for (const s of shapes(e, tol)) {
      if (s.pts) { out.push(...s.pts); if (s.closed && s.pts.length) out.push(s.pts[0]); }
      else if (s.r != null) out.push(...(s.a0 != null ? arcPts(s, tol) : arcPts({ c: s.c, r: s.r, a0: 0, a1: TAU }, tol)));
      else if (s.p) out.push(s.p);
    }
    return out;
  }
  switch (e.t) {
    case 'line': return [e.a, e.b];
    case 'pline': return e.closed ? [...e.pts, e.pts[0]] : e.pts.slice();
    case 'circle': {
      const n = Math.max(24, tol * 3), o = [];
      for (let i = 0; i <= n; i++) { const a = i / n * TAU; o.push([e.c[0] + e.r * Math.cos(a), e.c[1] + e.r * Math.sin(a)]); }
      return o;
    }
    case 'arc': return arcPts(e, tol);
    case 'ellipse': {
      const a0 = e.a0 ?? 0, a1 = e.a1 ?? TAU, sw = (a1 - a0) || TAU;
      const n = Math.max(24, tol * 3), o = [];
      for (let i = 0; i <= n; i++) o.push(ellPt(e, a0 + sw * i / n));
      return o;
    }
    case 'spline': return e.closed ? [...e.pts, e.pts[0]] : e.pts.slice();
    case 'point': return [e.p];
    case 'text': return [e.p];
    case 'dim': return dimGeom(e).lines.flat();
    default: return [];
  }
}

function bbox(e) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const acc = p => {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  };
  const g = GEOM[e.t];
  if (g && g.bbox) { const b = g.bbox(e); if (b) return b; }
  if (e.t === 'circle') { acc([e.c[0] - e.r, e.c[1] - e.r]); acc([e.c[0] + e.r, e.c[1] + e.r]); }
  else if (e.t === 'text') {
    const w = e.s.length * e.h * 0.62, h = e.h;
    const c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0);
    const ox = e.anchor === 'c' ? -w / 2 : e.anchor === 'r' ? -w : 0;
    [[ox, 0], [ox + w, 0], [ox + w, h], [ox, h]].forEach(q => acc([e.p[0] + q[0] * c - q[1] * s, e.p[1] + q[0] * s + q[1] * c]));
  } else poly(e, 40).forEach(acc);
  if (x0 === Infinity) { x0 = y0 = x1 = y1 = 0; }
  return [x0, y0, x1, y1];
}
function bboxAll(list) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const e of list) {
    const q = bbox(e);
    b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]);
    b[2] = Math.max(b[2], q[2]); b[3] = Math.max(b[3], q[3]);
  }
  return b[0] === Infinity ? null : b;
}

/* ---------------- distance / hit testing ---------------- */
function segDist(p, a, b) {
  const d = sub(b, a), L = dot(d, d);
  if (L < EPS) return dist(p, a);
  const t = clamp(dot(sub(p, a), d) / L, 0, 1);
  return dist(p, [a[0] + d[0] * t, a[1] + d[1] * t]);
}
function segClosest(p, a, b) {
  const d = sub(b, a), L = dot(d, d);
  if (L < EPS) return { p: a, t: 0 };
  const t = clamp(dot(sub(p, a), d) / L, 0, 1);
  return { p: [a[0] + d[0] * t, a[1] + d[1] * t], t };
}
function polyDist(p, pts, closed) {
  let d = Infinity;
  const n = pts.length;
  for (let i = 1; i < n; i++) d = Math.min(d, segDist(p, pts[i - 1], pts[i]));
  if (closed && n > 2) d = Math.min(d, segDist(p, pts[n - 1], pts[0]));
  return d;
}
function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) &&
      p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function entDist(p, e) {
  const g = GEOM[e.t];
  if (g && g.dist) return g.dist(p, e);
  if (g) {
    let d = Infinity;
    for (const s of shapes(e, 32)) {
      if (s.pts) d = Math.min(d, polyDist(p, s.pts, s.closed));
      else if (s.r != null && s.a0 != null) d = Math.min(d, polyDist(p, arcPts(s, 32), false));
      else if (s.r != null) d = Math.min(d, Math.abs(dist(p, s.c) - s.r));
      else if (s.p) d = Math.min(d, dist(p, s.p));
    }
    return d;
  }
  switch (e.t) {
    case 'line': return segDist(p, e.a, e.b);
    case 'circle': return Math.abs(dist(p, e.c) - e.r);
    case 'arc': {
      const a = wrap(ang(e.c, p));
      if (angOnArc(e, a) !== null) return Math.abs(dist(p, e.c) - e.r);
      return Math.min(dist(p, arcPt(e, 0)), dist(p, arcPt(e, 1)));
    }
    case 'point': return dist(p, e.p);
    case 'text': {
      const b = bbox(e);
      return (p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]) ? 0
        : hyp(Math.max(b[0] - p[0], 0, p[0] - b[2]), Math.max(b[1] - p[1], 0, p[1] - b[3]));
    }
    default: {
      const pts = poly(e, 48); let d = Infinity;
      for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(p, pts[i - 1], pts[i]));
      return d;
    }
  }
}
function bboxHit(b, x0, y0, x1, y1) { return !(b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1); }
function inWindow(e, x0, y0, x1, y1) {           /* fully enclosed */
  const b = bbox(e); return b[0] >= x0 && b[2] <= x1 && b[1] >= y0 && b[3] <= y1;
}
function crossWindow(e, x0, y0, x1, y1) {        /* touches */
  if (!bboxHit(bbox(e), x0, y0, x1, y1)) return false;
  if (inWindow(e, x0, y0, x1, y1)) return true;
  const pts = poly(e, 48);
  const R = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  for (let i = 1; i < pts.length; i++)
    for (let j = 1; j < R.length; j++)
      if (segInt(pts[i - 1], pts[i], R[j - 1], R[j])) return true;
  for (const p of pts) if (p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1) return true;
  return false;
}
function segInt(a, b, c, d) {
  const r = sub(b, a), s = sub(d, c), den = cross(r, s);
  if (Math.abs(den) < EPS) return null;
  const t = cross(sub(c, a), s) / den, u = cross(sub(c, a), r) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}

/* ---------------- transforms ---------------- */
function xf(e, fn) {
  const E = e;
  if (DOC.ents.get(E.id) === E) mut(E);          /* live entity: journal + reindex */
  const g = GEOM[E.t];
  if (g && g.xf) { g.xf(E, fn); return E; }
  switch (E.t) {
    case 'line': E.a = fn(E.a); E.b = fn(E.b); break;
    case 'pline': case 'spline': E.pts = E.pts.map(fn); break;
    case 'point': E.p = fn(E.p); break;
    case 'text': {
      const p2 = fn(E.p), q = fn(add(E.p, [Math.cos(E.rot || 0), Math.sin(E.rot || 0)]));
      E.rot = ang(p2, q); E.h *= dist(p2, q); E.p = p2; break;
    }
    case 'circle': { const c2 = fn(E.c), q = fn(add(E.c, [E.r, 0])); E.c = c2; E.r = dist(c2, q); break; }
    case 'arc': {
      const c2 = fn(E.c), p0 = fn(arcPt(E, 0)), p1 = fn(arcPt(E, 1)), pm = fn(arcPt(E, .5));
      const r = (dist(c2, p0) + dist(c2, p1)) / 2;
      const a0 = ang(c2, p0), a1 = ang(c2, p1), am = ang(c2, pm);
      E.c = c2; E.r = r;
      if (wrap(am - a0) <= wrap(a1 - a0)) { E.a0 = a0; E.a1 = a1; } else { E.a0 = a1; E.a1 = a0; }
      break;
    }
    case 'ellipse': {
      const c2 = fn(E.c);
      const ax = fn(add(E.c, mul([Math.cos(E.rot), Math.sin(E.rot)], E.rx)));
      const ay = fn(add(E.c, mul([-Math.sin(E.rot), Math.cos(E.rot)], E.ry)));
      E.c = c2; E.rx = dist(c2, ax); E.ry = dist(c2, ay); E.rot = ang(c2, ax); break;
    }
    case 'dim': E.p1 = fn(E.p1); E.p2 = fn(E.p2); if (E.p3) E.p3 = fn(E.p3); break;
  }
  return E;
}
const T = {
  move: d => p => [p[0] + d[0], p[1] + d[1]],
  rot: (c, t) => p => rot(p, c, t),
  scale: (c, s) => p => [c[0] + (p[0] - c[0]) * s, c[1] + (p[1] - c[1]) * s],
  scale2: (c, sx, sy) => p => [c[0] + (p[0] - c[0]) * sx, c[1] + (p[1] - c[1]) * sy],
  mirror: (a, b) => p => {
    const d = norm(sub(b, a)), v = sub(p, a), pr = dot(v, d);
    const f = [a[0] + d[0] * pr, a[1] + d[1] * pr];
    return [2 * f[0] - p[0], 2 * f[1] - p[1]];
  },
};

/* ---------------- grips ---------------- */
function gripsOf(e) {
  const g = GEOM[e.t];
  if (g && g.grips) return g.grips(e) || [];
  switch (e.t) {
    case 'line': return [{ p: e.a, k: 'a' }, { p: mid(e.a, e.b), k: 'm' }, { p: e.b, k: 'b' }];
    case 'pline': case 'spline': return e.pts.map((p, i) => ({ p, k: 'p' + i }));
    case 'circle': return [{ p: e.c, k: 'c' }, { p: [e.c[0] + e.r, e.c[1]], k: 'r' },
      { p: [e.c[0], e.c[1] + e.r], k: 'r' }, { p: [e.c[0] - e.r, e.c[1]], k: 'r' }, { p: [e.c[0], e.c[1] - e.r], k: 'r' }];
    case 'arc': return [{ p: e.c, k: 'c' }, { p: arcPt(e, 0), k: 's' }, { p: arcPt(e, 1), k: 'e' }, { p: arcPt(e, .5), k: 'r' }];
    case 'ellipse': return [{ p: e.c, k: 'c' },
      { p: ellPt(e, 0), k: 'x' }, { p: ellPt(e, Math.PI / 2), k: 'y' }];
    case 'point': return [{ p: e.p, k: 'p' }];
    case 'text': return [{ p: e.p, k: 'p' }];
    case 'dim': return [{ p: e.p1, k: 'p1' }, { p: e.p2, k: 'p2' }, { p: dimGeom(e).tp, k: 'o' }];
    default: return [];
  }
}
function applyGrip(e, k, p) {
  mut(e);
  const g = GEOM[e.t];
  if (g && g.grip) { g.grip(e, k, p); return; }
  if (e.t === 'line') {
    if (k === 'a') e.a = p; else if (k === 'b') e.b = p;
    else if (k === 'm') { const d = sub(p, mid(e.a, e.b)); e.a = add(e.a, d); e.b = add(e.b, d); }
  }
  else if ((e.t === 'pline' || e.t === 'spline') && k[0] === 'p') e.pts[+k.slice(1)] = p;
  else if (e.t === 'circle') { if (k === 'c') e.c = p; else e.r = Math.max(dist(e.c, p), 1e-6); }
  else if (e.t === 'arc') {
    if (k === 'c') e.c = p;
    else if (k === 's') e.a0 = ang(e.c, p);
    else if (k === 'e') e.a1 = ang(e.c, p);
    else e.r = Math.max(dist(e.c, p), 1e-6);
  }
  else if (e.t === 'ellipse') {
    if (k === 'c') e.c = p;
    else if (k === 'x') { e.rx = Math.max(dist(e.c, p), 1e-6); e.rot = ang(e.c, p); }
    else if (k === 'y') e.ry = Math.max(segDist(p, e.c, add(e.c, [Math.cos(e.rot), Math.sin(e.rot)])), 1e-6);
  }
  else if (e.t === 'point' || e.t === 'text') e.p = p;
  else if (e.t === 'dim') {
    if (k === 'p1') e.p1 = p; else if (k === 'p2') e.p2 = p;
    else {
      const u = e.k === 'horizontal' ? [1, 0] : e.k === 'vertical' ? [0, 1] : norm(sub(e.p2, e.p1));
      e.off = dot(sub(p, e.p1), perp(u));
    }
  }
}
function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += cross(pts[i], pts[j]); }
  return Math.abs(a) / 2;
}
function polyLen(pts, closed) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) L += dist(pts[pts.length - 1], pts[0]);
  return L;
}
function entLength(e) {
  if (e.t === 'circle') return TAU * e.r;
  if (e.t === 'arc') return e.r * arcSweep(e);
  if (e.t === 'line') return dist(e.a, e.b);
  if (e.t === 'pline' || e.t === 'spline') return polyLen(e.pts, e.closed);
  return polyLen(poly(e, 64), false);
}
function entArea(e) {
  if (e.t === 'circle') return Math.PI * e.r * e.r;
  if (e.t === 'ellipse') return Math.PI * e.rx * e.ry;
  if ((e.t === 'pline' || e.t === 'spline') && e.closed) return polyArea(e.pts);
  if (GEOM[e.t] && GEOM[e.t].area) return GEOM[e.t].area(e);
  return 0;
}
