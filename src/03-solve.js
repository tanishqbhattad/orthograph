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

/* ---- TRIM: remove the piece of `e` containing `click` between cutters ---- */
function trimAt(e, click, cutters) {
  const ps = [];
  /* Edge mode: with it on, a boundary that stops short of the object is
     treated as if it carried on, which is the difference between being able to
     trim to a line that nearly reaches and having to draw a longer one. */
  const inf = !!(typeof VS !== 'undefined' && VS.edgemode);
  for (const c of cutters) {
    if (c.id === e.id) continue;
    for (const p of intersect(e, c, inf)) ps.push(paramOf(e, p));
  }
  if (!ps.length) return null;
  const tc = paramOf(e, click);
  const closed = e.t === 'circle' || ((e.t === 'pline' || e.t === 'spline') && e.closed);
  let ts = ps.map(t => closed ? wrap(t * TAU) / TAU : t)
    .filter(t => closed || (t > 1e-6 && t < 1 - 1e-6))
    .sort((a, b) => a - b);
  ts = ts.filter((t, i) => i === 0 || Math.abs(t - ts[i - 1]) > 1e-6);
  if (!ts.length) return null;
  if (closed) {
    if (ts.length === 1) return null;
    let i = ts.findIndex(t => t > tc); if (i < 0) i = 0;
    const t1 = ts[i], t0 = ts[(i - 1 + ts.length) % ts.length];
    return [subEnt(e, t1, t0 + (t0 < t1 ? 1 : 0))];
  }
  const bounds = [0, ...ts, 1];
  let i = 0; while (i < bounds.length - 2 && tc > bounds[i + 1]) i++;
  const a = bounds[i], b = bounds[i + 1];
  const out = [];
  if (a > 1e-6) out.push(subEnt(e, 0, a));
  if (b < 1 - 1e-6) out.push(subEnt(e, b, 1));
  return out;
}
/* ---- EXTEND: lengthen `e` from the nearest end to first boundary hit ---- */
function extendTo(e, click, bounds) {
  const tc = paramOf(e, click), fromEnd = tc > 0.5;
  const cand = [];
  for (const b of bounds) {
    if (b.id === e.id) continue;
    for (const p of intersect(e, b, true)) {
      const t = paramOf(e, p);
      if (fromEnd ? t > 1 + 1e-6 : t < -1e-6) cand.push(t);
    }
  }
  if (!cand.length) return null;
  const t = fromEnd ? Math.min(...cand) : Math.max(...cand);
  const n = clone(e);
  if (e.t === 'line') { if (fromEnd) n.b = ptAt(e, t); else n.a = ptAt(e, t); return n; }
  if (e.t === 'arc') { const s = arcSweep(e); if (fromEnd) n.a1 = e.a0 + s * t; else n.a0 = e.a0 + s * t; return n; }
  if (e.t === 'pline' || e.t === 'spline') {
    const p = ptAt(e, t);
    if (fromEnd) n.pts = [...e.pts, p]; else n.pts = [p, ...e.pts];
    return n;
  }
  return null;
}
/* ---- LENGTHEN: change total length by delta (or set absolute) ---- */
function lengthenTo(e, click, opts) {
  const n = clone(e);
  const L = entLength(e);
  let target = opts.total != null ? opts.total
    : opts.delta != null ? L + opts.delta
      : opts.pct != null ? L * opts.pct / 100 : L;
  if (target <= 1e-9) return null;
  const fromEnd = paramOf(e, click) > 0.5;
  if (e.t === 'line') {
    const u = norm(sub(e.b, e.a));
    if (fromEnd) n.b = add(e.a, mul(u, target)); else n.a = add(e.b, mul(u, -target));
    return n;
  }
  if (e.t === 'arc') {
    const sw = target / e.r;
    if (sw >= TAU) return null;
    if (fromEnd) n.a1 = e.a0 + sw; else n.a0 = e.a1 - sw;
    return n;
  }
  return null;
}

/* ---- OFFSET ---- */
/* How far a mitre may run before it is cut off, as a multiple of the offset
   distance. Two nearly-parallel segments meeting at a shallow angle produce a
   mitre of arbitrary length — the wall code learned this separately and caps
   its own with MITRE_MAX, but ordinary offset threw the spike. AutoCAD's
   MITERLIMIT default is 2; this matches it. */
const OFFSET_MITER_MAX = 2;
/** the vertices a join contributes between two offset segments */
function offsetJoin(prev, next, corner, d, join) {
  const x = xLineLine(prev[0], prev[1], next[0], next[1], true);
  const a = prev[1], b = next[0];
  /* parallel or collinear: nothing to join */
  if (!x.length) return [b];
  const m = x[0];
  const miter = dist(m, corner);
  const round = join === 'round', bevel = join === 'bevel';
  /* a mitre that has run away is cut square, whatever was asked for */
  const tooLong = miter > Math.abs(d) * OFFSET_MITER_MAX + EPS;
  if (!round && !bevel && !tooLong) return [m];
  if (round && !tooLong) {
    /* an arc of radius |d| about the original corner, from one offset end to
       the other — which is what a round join IS */
    const a0 = Math.atan2(a[1] - corner[1], a[0] - corner[0]);
    const a1 = Math.atan2(b[1] - corner[1], b[0] - corner[0]);
    let sweep = wrap(a1 - a0);
    if (sweep > Math.PI) sweep -= TAU;
    const n = Math.max(2, Math.ceil(Math.abs(sweep) / 0.35));
    const out = [];
    for (let i = 1; i < n; i++) {
      const t = a0 + sweep * (i / n);
      out.push([corner[0] + Math.abs(d) * Math.cos(t), corner[1] + Math.abs(d) * Math.sin(t)]);
    }
    out.push(b);
    return out;
  }
  /* A bevel is both ends, joined square across the corner — two points where
     a mitre has one. Also where a runaway mitre lands: cutting it off is the
     whole purpose of the limit. */
  return [a, b];
}
function offsetEnt(e, d, side, opts) {
  const join = (opts && opts.join) || 'miter';
  const n = clone(e); delete n.id;
  if (e.t === 'line') {
    const u = perp(norm(sub(e.b, e.a))), o = mul(u, d * side);
    n.a = add(e.a, o); n.b = add(e.b, o); return n;
  }
  if (e.t === 'circle' || e.t === 'arc') { const r = e.r + d * side; if (r <= EPS) return null; n.r = r; return n; }
  if (e.t === 'ellipse') {
    n.rx = e.rx + d * side; n.ry = e.ry + d * side;
    if (n.rx <= EPS || n.ry <= EPS) return null; return n;
  }
  if (e.t === 'pline' || e.t === 'spline') {
    const P = e.closed ? [...e.pts, e.pts[0]] : e.pts;
    const segs = [];
    for (let i = 1; i < P.length; i++) {
      if (dist2(P[i], P[i - 1]) < 1e-18) continue;
      const u = perp(norm(sub(P[i], P[i - 1]))), o = mul(u, d * side);
      segs.push([add(P[i - 1], o), add(P[i], o)]);
    }
    if (!segs.length) return null;
    /* the original corner each join belongs to, so a round join can be an arc
       about it and a mitre can be measured against it */
    const corners = [];
    for (let i = 1; i < P.length; i++) if (dist2(P[i], P[i - 1]) >= 1e-18) corners.push(P[i - 1]);
    const pts = [segs[0][0]];
    for (let i = 1; i < segs.length; i++)
      for (const q of offsetJoin(segs[i - 1], segs[i], corners[i] || segs[i][0], d, join)) pts.push(q);
    pts.push(segs[segs.length - 1][1]);
    if (e.closed) {
      const x = xLineLine(segs[segs.length - 1][0], segs[segs.length - 1][1], segs[0][0], segs[0][1], true);
      if (x.length) { pts[0] = x[0]; pts.pop(); } else pts.pop();
    }
    n.t = 'pline'; n.pts = pts; return n;
  }
  return null;
}
function offsetSide(e, through) {
  if (e.t === 'circle' || e.t === 'arc') return dist(through, e.c) > e.r ? 1 : -1;
  const P = poly(e, 48); let bd = Infinity, bi = 1;
  for (let i = 1; i < P.length; i++) { const d = segDist(through, P[i - 1], P[i]); if (d < bd) { bd = d; bi = i; } }
  const u = perp(norm(sub(P[bi], P[bi - 1])));
  return dot(sub(through, P[bi - 1]), u) >= 0 ? 1 : -1;
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
  };
}
function dimText(e, val) {
  if (e.txt) return e.txt;
  const s = dimStyle(e);
  if (s.prec != null && DOC.units !== 'ft') return (val / U[DOC.units]).toFixed(s.prec);
  return fmt(val);
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
    return { lines, arrows, tp: mid(a, p), tr: 0, txt: (e.k === 'diameter' ? 'Ø' : 'R') + dimText(e, val), val, S };
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
    return { lines, arrows: [], tp, tr: 0, txt: dimText(e, val), val, S,
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
      txt: e.txt || '\u2312' + dimText(e, val), val, S, arcR: R, arcC: c, a0, a1,
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
  return { lines, arrows, tp, tr, txt: dimText(e, val), val, S, q1, q2 };
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
