/* ============================================================
   ORTHOGRAPH — 04c architecture: columns, stairs, rooms, grids
   ============================================================ */
/* ---------------- column ---------------- */
function columnShapes(k) {
  const w = k.w || 400, d = k.d || k.w || 400, r = k.rot || 0;
  if (k.shape === 'round') return [{ c: k.p, r: w / 2 }];
  const hw = w / 2, hd = d / 2;
  const pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
    .map(q => [k.p[0] + q[0] * Math.cos(r) - q[1] * Math.sin(r), k.p[1] + q[0] * Math.sin(r) + q[1] * Math.cos(r)]);
  return [{ pts, closed: true, role: 'face' }];
}
GEOM.column = {
  shapes: columnShapes,
  grips: k => [{ p: k.p, k: 'c' }],
  grip(k, kk, p) { k.p = p; },
  xf(k, fn) {
    const p2 = fn(k.p), q = fn(add(k.p, [Math.cos(k.rot || 0), Math.sin(k.rot || 0)]));
    const s = dist(p2, q);
    k.rot = ang(p2, q); k.w = (k.w || 400) * s; k.d = (k.d || 400) * s; k.p = p2;
  },
  area: k => k.shape === 'round' ? Math.PI * (k.w / 2) ** 2 : (k.w || 400) * (k.d || k.w || 400),
};

/* ---------------- stair ---------------- */
function stairCalc(s) {
  const kind = s.kind || 'straight';
  const run = dist(s.a, s.b);                      /* the flight you actually dragged */
  const risers = Math.max(2, s.risers || Math.round(run / (s.tread || 280)) + 1);
  const rise = s.rise || (s.floorH ? s.floorH / risers : 175);
  if (kind === 'straight') {
    const treads = risers - 1;
    const tread = treads > 0 ? run / treads : run;
    return { kind, run, risers, treads, tread, rise, land: 0, r1: risers, r2: 0, run1: run, run2: 0 };
  }
  /* L and U: the drag sets the FIRST flight, so the point you pick is the point
     you get. The risers split to match it and the rest go after the landing. */
  const w = s.w || 1000;
  const land = s.landing || w;
  const tread = s.tread || 280;
  const run1 = Math.max(run, tread);
  let r1 = s.risers1 != null ? s.risers1 : Math.round(run1 / tread) + 1;
  r1 = clamp(Math.round(r1), 1, risers - 1);
  const r2 = risers - r1;
  const t1 = r1 > 1 ? run1 / (r1 - 1) : run1;
  const run2 = Math.max((r2 - 1) * t1, t1);
  const treads = risers - 1;
  return { kind, run, risers, treads, tread: t1, rise, land, r1, r2, run1, run2, w };
}
/** Flights, landing plate and walking line in one place, so the landing can
    never drift off-axis: it is built in the stair's own u/v frame. */
function stairPath(s) {
  const C = stairCalc(s);
  const u = norm(sub(s.b, s.a));
  if (!u[0] && !u[1]) return null;
  const n = perp(u);
  const turn = s.turn === -1 ? -1 : 1;             /* +1 turns left, -1 right */
  const v = mul(n, turn);
  const w = s.w || 1000;
  if (C.kind === 'straight') {
    return { C, u, n, v, turn, legs: [[s.a, s.b]], landing: null };
  }
  const p1 = add(s.a, mul(u, C.run1));             /* top of the first flight */
  const rect = (c, du, dv) => [
    add(add(c, mul(u, du)), mul(v, dv)), add(add(c, mul(u, -du)), mul(v, dv)),
    add(add(c, mul(u, -du)), mul(v, -dv)), add(add(c, mul(u, du)), mul(v, -dv)),
  ];
  if (C.kind === 'L') {
    /* a square landing sitting square on the top of flight one; flight two
       leaves from its centre, so the corner closes exactly */
    const c = add(p1, mul(u, w / 2));
    const p2 = add(c, mul(v, C.run2));
    return { C, u, n, v, turn, legs: [[s.a, p1], [c, p2]], landing: rect(c, w / 2, w / 2), landCentre: c };
  }
  /* U: the landing is one width deep and two wide, and flight two runs back
     alongside flight one, offset by the stair width */
  const c = add(add(p1, mul(u, w / 2)), mul(v, w / 2));
  const start2 = add(p1, mul(v, w));
  const p2 = sub(start2, mul(u, C.run2));
  return { C, u, n, v, turn, legs: [[s.a, p1], [start2, p2]], landing: rect(c, w / 2, w), landCentre: c };
}
function stairShapes(s) {
  const P = stairPath(s);
  if (!P) return [];
  const { C, u, n, v } = P;
  const w = s.w || 1000, hw = w / 2;
  const out = [];
  const flightEdges = (a, b) => {
    const uu = norm(sub(b, a)); if (!uu[0] && !uu[1]) return;
    const nn = perp(uu);
    out.push({ pts: [add(a, mul(nn, hw)), add(b, mul(nn, hw))], role: 'face' });
    out.push({ pts: [add(a, mul(nn, -hw)), add(b, mul(nn, -hw))], role: 'face' });
    out.push({ pts: [add(a, mul(nn, hw)), add(a, mul(nn, -hw))], role: 'face' });
    if (!P.landing) out.push({ pts: [add(b, mul(nn, hw)), add(b, mul(nn, -hw))], role: 'face' });
  };
  const treadsAlong = (a, b, count) => {
    const L = dist(a, b); if (L < EPS || count < 1) return;
    const uu = norm(sub(b, a)), nn = perp(uu);
    for (let i = 1; i <= count; i++) {
      const q = add(a, mul(uu, L * i / (count + 1)));
      out.push({ pts: [add(q, mul(nn, hw)), add(q, mul(nn, -hw))], role: 'tread' });
    }
  };
  if (C.kind === 'straight') {
    flightEdges(s.a, s.b);
    treadsAlong(s.a, s.b, Math.max(0, C.treads - 1));
  } else {
    flightEdges(P.legs[0][0], P.legs[0][1]);
    treadsAlong(P.legs[0][0], P.legs[0][1], Math.max(0, C.r1 - 1));
    out.push({ pts: P.landing, closed: true, role: 'face' });
    flightEdges(P.legs[1][0], P.legs[1][1]);
    treadsAlong(P.legs[1][0], P.legs[1][1], Math.max(0, C.r2 - 1));
    /* close the far end of the last flight */
    const last = P.legs[1];
    const nn = perp(norm(sub(last[1], last[0])));
    out.push({ pts: [add(last[1], mul(nn, hw)), add(last[1], mul(nn, -hw))], role: 'face' });
  }
  /* walking line, following the flights through the landing */
  const dir = s.dir === -1 ? -1 : 1;
  const walk = [];
  for (const [a, b] of P.legs) { if (!walk.length) walk.push(a); else walk.push(a); walk.push(b); }
  const line = dir > 0 ? walk : walk.slice().reverse();
  out.push({ pts: line, role: 'arrow' });
  const tip = line[line.length - 1], prev = line[line.length - 2];
  const ud = norm(sub(tip, prev));
  if (ud[0] || ud[1]) {
    const ah = Math.min(w * 0.18, C.tread * 0.9);
    const back = sub(tip, mul(ud, ah)), np = perp(ud);
    out.push({ pts: [tip, add(back, mul(np, ah * 0.4)), add(back, mul(np, -ah * 0.4))], closed: true, role: 'arrowhead' });
  }
  if (s.cut !== false && C.kind === 'straight') {
    const midD = C.run / 2;
    out.push({
      pts: [add(add(s.a, mul(u, midD - w * 0.25)), mul(n, hw)),
        add(add(s.a, mul(u, midD + w * 0.25)), mul(n, -hw))],
      role: 'cut', lt: 'dashed',
    });
  }
  return out;
}
GEOM.stair = {
  shapes: stairShapes,
  grips: s => [{ p: s.a, k: 'a' }, { p: mid(s.a, s.b), k: 'm' }, { p: s.b, k: 'b' }],
  grip(s, k, p) {
    if (k === 'a') s.a = p; else if (k === 'b') s.b = p;
    else { const d = sub(p, mid(s.a, s.b)); s.a = add(s.a, d); s.b = add(s.b, d); }
  },
  xf(s, fn) { s.a = fn(s.a); s.b = fn(s.b); },
  area(s) {
    const P = stairPath(s); if (!P) return 0;
    let L = 0;
    for (const [a, b] of P.legs) L += dist(a, b);
    const w = s.w || 1000;
    return L * w + (P.landing ? polyArea(P.landing) : 0);
  },
};

/* ---------------- room / area ---------------- */
function roomShapes(r) {
  const pts = roomBoundary(r);
  if (!pts || pts.length < 3) return [];
  const out = [{ pts, closed: true, role: 'room' }];
  const c = roomCentroid(r);
  const h = r.h || DOC.textH * 1.4;
  const a = polyArea(pts);
  const lines = [];
  if (r.name) lines.push({ s: r.name, h });
  if (r.showArea !== false) lines.push({ s: roomAreaText(r, a), h: h * 0.75 });
  if (r.showArea !== false && roomAltText(r, a)) lines.push({ s: roomAltText(r, a), h: h * 0.62 });
  let y = c[1] + (lines.length - 1) * h * 0.42;
  for (const ln of lines) {
    out.push({ text: ln.s, p: [c[0], y], h: ln.h, rot: 0, anchor: 'c', role: 'label' });
    y -= ln.h * 1.35;
  }
  return out;
}
/** room tag area in the unit the tag asks for, falling back to the drawing */
const AREA_UNITS = {
  auto: null,
  m2: { d: 1e6, l: 'm²', p: 2 },
  sqmm: { d: 1, l: 'mm²', p: 0 },
  sqcm: { d: 100, l: 'cm²', p: 1 },
  ft2: { d: 304.8 * 304.8, l: 'ft²', p: 2 },
  in2: { d: 25.4 * 25.4, l: 'in²', p: 1 },
};
function areaIn(mm2, key) {
  const u = AREA_UNITS[key];
  if (!u) return fmtArea(mm2);
  return (mm2 / u.d).toFixed(u.p) + ' ' + u.l;
}
function roomAreaText(r, a) { return areaIn(a, r.areaUnits || DOC.areaUnits || 'auto'); }
function roomAltText(r, a) {
  const alt = r.altUnits || (r.alt === true || DOC.altArea ? defaultAlt(r) : null);
  if (!alt || alt === 'none') return null;
  return '(' + areaIn(a, alt) + ')';
}
function defaultAlt(r) {
  const primary = r.areaUnits || DOC.areaUnits || 'auto';
  const metric = primary === 'm2' || primary === 'sqmm' || primary === 'sqcm' ||
    (primary === 'auto' && DOC.units !== 'ft' && DOC.units !== 'in');
  return metric ? 'ft2' : 'm2';
}
function roomCentroid(r) {
  const p = roomBoundary(r) || r.pts; let a = 0, x = 0, y = 0;
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length, f = cross(p[i], p[j]);
    a += f; x += (p[i][0] + p[j][0]) * f; y += (p[i][1] + p[j][1]) * f;
  }
  if (Math.abs(a) < EPS) return p[0] ? p[0].slice() : [0, 0];
  return [x / (3 * a), y / (3 * a)];
}
GEOM.room = {
  shapes: roomShapes,
  dist(p, r) {
    const pts = roomBoundary(r) || r.pts;
    if (!pts || pts.length < 3) return Infinity;
    return pointInPoly(p, pts) ? 0 : polyDist(p, pts, true);
  },
  /* An automatic room is driven by its seed, so it gets one grip — move the
     seed and it re-traces into whatever encloses the new spot. A manually
     drawn room keeps a grip per corner. */
  grips(r) {
    if (r.auto && r.seed) return [{ p: r.seed.slice(), k: 'seed' }];
    return (r.pts || []).map((p, i) => ({ p, k: 'p' + i }));
  },
  grip(r, k, p) {
    if (k === 'seed') { r.seed = p.slice(); _roomCache.delete(r.id); return; }
    if (k[0] === 'p') { r.pts[+k.slice(1)] = p; r.auto = false; }
  },
  xf(r, fn) {
    if (r.seed) r.seed = fn(r.seed);
    r.pts = (r.pts || []).map(fn);
    _roomCache.delete(r.id);
  },
  area: r => polyArea(roomBoundary(r) || r.pts || []),
};

/* ---------------- structural grid ---------------- */
function gridShapes(g) {
  const u = norm(sub(g.b, g.a)); if (!u[0] && !u[1]) return [];
  const r = g.br || (DOC.textH * 2.2);
  const out = [{ pts: [g.a, g.b], role: 'grid', lt: 'dashdot' }];
  for (const [p, s] of [[g.a, -1], [g.b, 1]]) {
    if (s < 0 && g.bubbleA === false) continue;
    if (s > 0 && g.bubbleB === false) continue;
    const c = add(p, mul(u, s * r));
    out.push({ c, r, role: 'bubble' });
    out.push({ text: g.label || '?', p: [c[0], c[1] - r * 0.36], h: r * 0.95, rot: 0, anchor: 'c', role: 'bubble' });
  }
  return out;
}
GEOM.grid = {
  shapes: gridShapes,
  grips: g => [{ p: g.a, k: 'a' }, { p: g.b, k: 'b' }],
  grip(g, k, p) { if (k === 'a') g.a = p; else g.b = p; },
  xf(g, fn) { g.a = fn(g.a); g.b = fn(g.b); },
};

/* ============================================================
   Room boundary tracing — exact planar face walk
   ------------------------------------------------------------
   A room is a seed point, not a frozen polygon, so the boundary
   is re-derived whenever the drawing changes and moving a wall
   resizes the room.

   The earlier version rasterised the walls and marched the
   contour. That was wrong twice over: the raster phase made the
   traced edge miss its wall face on about a quarter of ordinary
   rectangles, and an axis-aligned raster edge can never match an
   angled wall, so any non-orthogonal plan degenerated into a
   300-point staircase. This builds the arrangement of the wall
   faces instead and walks the face containing the seed, which is
   exact at any angle and needs no tolerances at all beyond node
   welding.
   ============================================================ */
const ROOM_WELD = 1e-6;                            /* node coincidence, mm */

function roomBlockers(lvl) {
  const segs = [];
  const push = (a, b) => { if (dist(a, b) > ROOM_WELD) segs.push([a, b]); };
  for (const w of allWalls()) {
    if ((w.lvl || 0) !== (lvl || 0)) continue;
    if (wallLen(w) < EPS) continue;
    const o = wallOutline(w);
    for (let i = 0; i < o.length; i++) push(o[i], o[(i + 1) % o.length]);
  }
  for (const e of DOC.ents.values()) {
    if (e.t !== 'column' || (e.lvl || 0) !== (lvl || 0)) continue;
    const p = poly(e, 32);
    for (let i = 1; i < p.length; i++) push(p[i - 1], p[i]);
    if (p.length > 2) push(p[p.length - 1], p[0]);
  }
  return segs;
}
/** split every segment where another crosses it, so no two edges interleave */
function roomSplit(segs) {
  const n = segs.length;
  const boxes = segs.map(([a, b]) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]),
    Math.max(a[0], b[0]), Math.max(a[1], b[1])]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const [a, b] = segs[i];
    const L = dist(a, b);
    if (L < ROOM_WELD) continue;
    const ts = [0, 1];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const B = boxes[j], A = boxes[i];
      if (B[0] > A[2] + ROOM_WELD || B[2] < A[0] - ROOM_WELD ||
        B[1] > A[3] + ROOM_WELD || B[3] < A[1] - ROOM_WELD) continue;
      const X = segInt(a, b, segs[j][0], segs[j][1]);
      if (!X) continue;
      const t = dot(sub(X, a), sub(b, a)) / (L * L);
      if (t > 1e-9 && t < 1 - 1e-9) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    for (let k = 1; k < ts.length; k++) {
      if (ts[k] - ts[k - 1] < 1e-9) continue;
      const p0 = [a[0] + (b[0] - a[0]) * ts[k - 1], a[1] + (b[1] - a[1]) * ts[k - 1]];
      const p1 = [a[0] + (b[0] - a[0]) * ts[k], a[1] + (b[1] - a[1]) * ts[k]];
      if (dist(p0, p1) > ROOM_WELD) out.push([p0, p1]);
    }
  }
  return out;
}
/** weld endpoints into nodes and record, per node, its neighbours by angle */
function roomGraph(edges) {
  const nodes = [];
  const grid = new Map();
  const q = 1e-3;                                  /* welding bucket, mm */
  const key = p => Math.round(p[0] / q) + ':' + Math.round(p[1] / q);
  function nodeAt(p) {
    const i0 = Math.round(p[0] / q), j0 = Math.round(p[1] / q);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = grid.get((i0 + a) + ':' + (j0 + b));
      if (l) for (const idx of l) if (dist(nodes[idx].p, p) <= q) return idx;
    }
    const idx = nodes.length;
    nodes.push({ p: p.slice(), adj: [] });
    const k = key(p);
    let l = grid.get(k); if (!l) grid.set(k, l = []);
    l.push(idx);
    return idx;
  }
  const seen = new Set();
  for (const [a, b] of edges) {
    const ia = nodeAt(a), ib = nodeAt(b);
    if (ia === ib) continue;
    const sig = ia < ib ? ia + '-' + ib : ib + '-' + ia;
    if (seen.has(sig)) continue;
    seen.add(sig);
    nodes[ia].adj.push(ib);
    nodes[ib].adj.push(ia);
  }
  for (const nd of nodes) {
    nd.adj.sort((x, y) => ang(nd.p, nodes[x].p) - ang(nd.p, nodes[y].p));
  }
  return nodes;
}
/* the arrangement is expensive, so build it once per document version */
const _arrCache = { v: -1, lvl: null, nodes: null };
function roomArrangement(lvl) {
  if (_arrCache.nodes && _arrCache.v === DOCV && _arrCache.lvl === (lvl || 0)) return _arrCache.nodes;
  const segs = roomBlockers(lvl);
  if (segs.length < 3) { _arrCache.nodes = null; _arrCache.v = DOCV; _arrCache.lvl = (lvl || 0); return null; }
  const nodes = roomGraph(roomSplit(segs));
  _arrCache.nodes = nodes; _arrCache.v = DOCV; _arrCache.lvl = (lvl || 0);
  return nodes;
}
/** the first edge a ray from `seed` along +x meets, oriented so the seed is
    on its left — that is the half-edge whose face contains the seed */
function roomStartEdge(seed, nodes) {
  let bestT = Infinity, best = null;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i].p;
    for (const j of nodes[i].adj) {
      if (j < i) continue;                         /* each edge once */
      const b = nodes[j].p;
      if ((a[1] > seed[1]) === (b[1] > seed[1])) continue;   /* does not straddle */
      const t = (seed[1] - a[1]) / (b[1] - a[1]);
      const x = a[0] + (b[0] - a[0]) * t;
      if (x <= seed[0] + 1e-9) continue;           /* behind the ray */
      if (x - seed[0] < bestT) { bestT = x - seed[0]; best = [i, j]; }
    }
  }
  if (!best) return null;
  const [i, j] = best;
  /* orient so the seed sits to the left of i -> j */
  const u = sub(nodes[j].p, nodes[i].p);
  return cross(u, sub(seed, nodes[i].p)) > 0 ? [i, j] : [j, i];
}
/** walk the bounded face lying to the left of the given half-edge */
function roomWalkFace(nodes, start) {
  const out = [];
  let [u, v] = start;
  const guard = nodes.length * 4 + 64;
  for (let step = 0; step < guard; step++) {
    out.push(v);
    const nd = nodes[v];
    if (!nd.adj.length) return null;               /* dangling: not enclosed */
    const back = nd.adj.indexOf(u);
    if (back < 0) return null;
    /* the next edge clockwise from the one we came in on keeps the face on the left */
    const next = nd.adj[(back - 1 + nd.adj.length) % nd.adj.length];
    u = v; v = next;
    if (u === start[0] && v === start[1]) {
      const pts = out.map(k => nodes[k].p.slice());
      return pts.length >= 3 ? pts : null;
    }
  }
  return null;
}
/** drop vertices that sit on a straight run between their neighbours */
function roomDropCollinear(pts) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const u1 = sub(b, a), u2 = sub(c, b);
    const l1 = hyp(u1[0], u1[1]), l2 = hyp(u2[0], u2[1]);
    if (l1 < ROOM_WELD || l2 < ROOM_WELD) continue;
    if (Math.abs(cross(u1, u2)) / (l1 * l2) > 1e-9) out.push(b);
  }
  return out.length >= 3 ? out : null;
}
/** trace the enclosure containing `seed`; null if the space is not closed */
function roomTrace(seed, lvl) {
  const nodes = roomArrangement(lvl);
  if (!nodes || !nodes.length) return null;
  const start = roomStartEdge(seed, nodes);
  if (!start) return null;
  const raw = roomWalkFace(nodes, start);
  if (!raw) return null;
  const pts = roomDropCollinear(raw);
  if (!pts) return null;
  /* a negative signed area means we walked the outside, not a room */
  let a2 = 0;
  for (let i = 0; i < pts.length; i++) a2 += cross(pts[i], pts[(i + 1) % pts.length]);
  if (a2 <= 0) return null;
  if (!pointInPoly(seed, pts)) return null;
  return pts;
}
/* cached per document version so dragging a wall stays cheap */
const _roomCache = new Map();
function roomBoundary(r) {
  if (!r.auto || !r.seed) return r.pts;
  const hit = _roomCache.get(r.id);
  if (hit && hit.v === DOCV) return hit.pts;
  let pts = null;
  try { pts = roomTrace(r.seed, r.lvl || 0); } catch (e) { pts = null; }
  if (!pts) pts = r.pts;                           /* keep the last good shape */
  else if (r.pts !== pts) r.pts = pts;             /* cache onto the entity for save/export */
  _roomCache.set(r.id, { v: DOCV, pts });
  return pts;
}
