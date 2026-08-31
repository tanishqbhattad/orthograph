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
  /* A straight stair is fully described by its two ends. A turning one is not:
     a and b describe the FIRST flight only, so with three grips half the object
     — the landing and the return flight — could not be touched at all. The
     turning form gets a grip on the landing, which is the middle of what you
     see, and one on the true top of the last flight. */
  grips(s) {
    const P = stairPath(s);
    if (!P || !P.landing) return [{ p: s.a.slice(), k: 'a' }, { p: mid(s.a, s.b), k: 'm' }, { p: s.b.slice(), k: 'b' }];
    const top = P.legs[P.legs.length - 1][1];
    return [
      { p: s.a.slice(), k: 'a' },                  /* foot of the first flight */
      { p: P.landCentre.slice(), k: 'm' },         /* the landing: moves the lot */
      { p: s.b.slice(), k: 'b' },                  /* head of the first flight */
      { p: top.slice(), k: 'e' },                  /* head of the last flight   */
    ];
  },
  grip(s, k, p) {
    if (k === 'a') { s.a = p; return; }
    if (k === 'b') { s.b = p; return; }
    if (k === 'e') {
      /* The top of the return flight is not a stored point — how far it runs is
         decided by how many risers are left after the landing. So this grip
         edits the riser count, and the geometry follows. */
      const P = stairPath(s); if (!P) return;
      const leg = P.legs[P.legs.length - 1];
      const dir = norm(sub(leg[1], leg[0]));
      if (!dir[0] && !dir[1]) return;
      const t = P.C.tread || 280;
      const len = Math.max(t, dot(sub(p, leg[0]), dir));
      const r2 = Math.max(1, Math.round(len / t) + 1);
      s.risers = P.C.r1 + r2;
      return;
    }
    /* 'm' drags the whole stair by whichever point the middle grip sits on */
    const P = stairPath(s);
    const ref = (P && P.landing) ? P.landCentre : mid(s.a, s.b);
    const d = sub(p, ref);
    s.a = add(s.a, d); s.b = add(s.b, d);
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
  /* A room whose walls have opened is drawn dashed and says so, instead of
     presenting a stale number in the same style as a measured one. The shape
     list already carries a linetype, so this needs nothing of the renderer. */
  const open = roomIsOpen(r);
  const out = [{ pts, closed: true, role: 'room', lt: open ? 'dashed' : undefined }];
  const c = roomCentroid(r);
  const h = r.h || DOC.textH * 1.4;
  const a = polyArea(pts);
  const lines = [];
  if (r.name) lines.push({ s: r.name, h });
  if (r.showArea !== false) lines.push({ s: roomAreaText(r, a), h: h * 0.75 });
  if (r.showArea !== false && roomAltText(r, a)) lines.push({ s: roomAltText(r, a), h: h * 0.62 });
  if (open) lines.push({ s: 'not enclosed', h: h * 0.62 });
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
  len: r => polyLen(roomBoundary(r) || r.pts || [], true),   /* its perimeter */
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
  /* Each segment carries the id of the object it came off. The walk knew this
     all along and threw it away, which is why nothing could say what bounded a
     room, and why every room had to be re-traced whenever anything at all
     changed. It costs one number per segment. */
  const push = (a, b, id) => { if (dist(a, b) > ROOM_WELD) segs.push([a, b, id]); };
  for (const w of allWalls()) {
    if ((w.lvl || 0) !== (lvl || 0)) continue;
    if (wallLen(w) < EPS) continue;
    const o = wallOutline(w);
    for (let i = 0; i < o.length; i++) push(o[i], o[(i + 1) % o.length], w.id);
  }
  for (const e of DOC.ents.values()) {
    if (e.t !== 'column' || (e.lvl || 0) !== (lvl || 0)) continue;
    const p = poly(e, 32);
    for (let i = 1; i < p.length; i++) push(p[i - 1], p[i], e.id);
    if (p.length > 2) push(p[p.length - 1], p[0], e.id);
  }
  return segs;
}
/** split every segment where another crosses it, so no two edges interleave */
function roomSplit(segs) {
  const n = segs.length;
  const boxes = segs.map(([a, b]) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]),
    Math.max(a[0], b[0]), Math.max(a[1], b[1])]);
  /* Every segment against every other is 920,000 pair tests on a sixty-room
     plan — 77ms, which is a room re-trace per drag frame. The same spatial
     hash the walls already use: a segment can only be cut by one whose box
     overlaps its own, and two boxes that overlap must share a cell, so
     gathering candidates from this loses nothing. The bbox reject below stays
     as the exact test. */
  const cellOf = (() => {
    const lens = boxes.map(b => Math.max(b[2] - b[0], b[3] - b[1]));
    lens.sort((x, y) => x - y);
    return Math.max(lens.length ? lens[Math.floor(lens.length * 0.6)] : 1000, 1);
  })();
  const grid = new Map();
  const cells = (bx, fn) => {
    const i0 = Math.floor((bx[0] - ROOM_WELD) / cellOf), i1 = Math.floor((bx[2] + ROOM_WELD) / cellOf);
    const j0 = Math.floor((bx[1] - ROOM_WELD) / cellOf), j1 = Math.floor((bx[3] + ROOM_WELD) / cellOf);
    if (!isFinite(i0) || !isFinite(j0) || (i1 - i0 + 1) * (j1 - j0 + 1) > 4096) return fn('*');
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) fn(i + ':' + j);
  };
  for (let i = 0; i < n; i++) cells(boxes[i], k => {
    let a = grid.get(k); if (!a) grid.set(k, a = []);
    a.push(i);
  });
  /* stamped instead of a Set per segment: one array, no allocation per pass */
  const seen = new Int32Array(n).fill(-1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const [a, b] = segs[i];
    const L = dist(a, b);
    if (L < ROOM_WELD) continue;
    const ts = [0, 1];
    const cand = [];
    cells(boxes[i], k => {
      const bucket = grid.get(k);
      if (!bucket) return;
      for (const j of bucket) { if (j !== i && seen[j] !== i) { seen[j] = i; cand.push(j); } }
    });
    for (const j of (grid.get('*') || [])) if (j !== i && seen[j] !== i) { seen[j] = i; cand.push(j); }
    for (const j of cand) {
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
      if (dist(p0, p1) > ROOM_WELD) out.push([p0, p1, segs[i][2]]);
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
  /* which object each edge belongs to, keyed by the pair of nodes it joins.
     A map rather than a parallel array, because adj is re-sorted by angle
     below and a parallel array would quietly stop lining up. */
  const src = new Map();
  for (const [a, b, id] of edges) {
    const ia = nodeAt(a), ib = nodeAt(b);
    if (ia === ib) continue;
    const sig = ia < ib ? ia + '-' + ib : ib + '-' + ia;
    if (seen.has(sig)) continue;
    seen.add(sig);
    if (id != null) src.set(sig, id);
    nodes[ia].adj.push(ib);
    nodes[ib].adj.push(ia);
  }
  for (const nd of nodes) {
    nd.adj.sort((x, y) => ang(nd.p, nodes[x].p) - ang(nd.p, nodes[y].p));
  }
  nodes.src = src;
  return nodes;
}
/* ============================================================
   What a room has to be re-traced for
   ------------------------------------------------------------
   A room was re-traced whenever DOCV moved, which is whenever ANYTHING
   changed: typing a note, nudging a dimension, changing a hatch. Tracing is
   the most expensive thing an edit can provoke, and none of those edits can
   change the shape of a room.

   Only walls and columns bound rooms, so only those are logged. Each entry
   remembers the extent of the thing that changed at the moment it changed —
   which is why a wall MOVED into a room still invalidates it, and why a wall
   that has been erased can still be recognised as having mattered.

   A room can then be left alone unless something it was actually built from
   changed, or something changed within reach of it. The log is bounded; when
   it overflows, every room re-traces, which is slow rather than wrong.
   ============================================================ */
let ROOMV = 0;
const ROOM_LOG = [];
const ROOM_LOG_MAX = 512;
/* Deliberately NOT bbox(). This runs inside mut(), before the entity has
   finished changing, and bbox() goes through shapes() — which would warm the
   shape cache with geometry that is about to be wrong and hand it back later.
   A wall and a column are both fully described by their own numbers, so the
   extent is worked out from those and nothing else is touched. */
function roomLogBox(e) {
  if (!e) return null;
  const pt = p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]);
  if (e.t === 'wall') {
    if (!pt(e.a) || !pt(e.b)) return null;
    const t = (typeof wallT === 'function' ? wallT(e) : 100) || 100;
    return [Math.min(e.a[0], e.b[0]) - t, Math.min(e.a[1], e.b[1]) - t,
            Math.max(e.a[0], e.b[0]) + t, Math.max(e.a[1], e.b[1]) + t];
  }
  if (e.t === 'column') {
    if (!pt(e.p)) return null;
    const r = Math.max(e.w || 400, e.d || e.w || 400);
    return [e.p[0] - r, e.p[1] - r, e.p[0] + r, e.p[1] + r];
  }
  return null;
}
/** Start again: a new document reuses entity ids from 1, so a cache left over
    from the last one can be handed out for a completely different room. */
function roomCacheForget() {
  _roomCache.clear();
  ROOM_LOG.length = 0;
  ROOMV++;
}
/** record that something which can bound a room has changed */
function roomTouch(e) {
  if (!e || (e.t !== 'wall' && e.t !== 'column')) return;
  ROOMV++;
  ROOM_LOG.push({ v: ROOMV, id: e.id, box: roomLogBox(e) });
  if (ROOM_LOG.length > ROOM_LOG_MAX) ROOM_LOG.splice(0, ROOM_LOG.length - ROOM_LOG_MAX);
}
/** is this stamp still within reach of the log? */
function roomLogHas(v) { return !ROOM_LOG.length || ROOM_LOG[0].v <= v + 1; }
/** the extent of a ring of points */
function bboxPts(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return isFinite(x0) ? [x0, y0, x1, y1] : null;
}
/** Can this cached room be trusted after everything that has happened since it
    was traced? Only if nothing it was built from moved, and nothing that moved
    came within reach of it. */
function roomCacheGood(hit) {
  if (!hit || hit.rv == null) return false;
  if (hit.rv === ROOMV) return true;                 /* nothing has happened */
  if (!roomLogHas(hit.rv)) return false;             /* too long ago to know */
  /* the room's own extent, worked out once and kept: this is asked on every
     room on every edit, so it must not rebuild anything */
  let rb = hit.box;
  if (!rb) {
    const pts = hit.pts || hit.good;
    rb = pts && pts.length > 2 ? bboxPts(pts) : null;
    if (!rb) return false;
    hit.box = rb;
  }
  const src = hit.src || [];
  /* Both the old and the new position of anything that moved are already in
     the log — mut() records where it was, commit() where it went — so there
     is nothing to look up on the live document here. */
  for (let i = ROOM_LOG.length - 1; i >= 0; i--) {
    const c = ROOM_LOG[i];
    if (c.v <= hit.rv) break;
    const b = c.box;
    if (!b) return false;                            /* unknown extent */
    if (!(b[2] < rb[0] || b[0] > rb[2] || b[3] < rb[1] || b[1] > rb[3])) return false;
    if (src.indexOf(c.id) >= 0) return false;        /* it is one of ours */
  }
  return true;
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
/** the id of the object the edge between two nodes came off, if it is known */
function roomEdgeSrc(nodes, i, j) {
  const m = nodes.src;
  if (!m) return null;
  const v = m.get(i < j ? i + '-' + j : j + '-' + i);
  return v == null ? null : v;
}
/** walk the bounded face lying to the left of the given half-edge.
    `out.src` collects what the walk followed, in the order it followed it. */
function roomWalkFace(nodes, start) {
  const out = [];
  const src = [];
  out.src = src;
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
    const from = roomEdgeSrc(nodes, v, next);
    if (from != null && src.indexOf(from) < 0) src.push(from);
    u = v; v = next;
    if (u === start[0] && v === start[1]) {
      const pts = out.map(k => nodes[k].p.slice());
      if (!(pts.length >= 3)) return null;
      pts.src = src;
      return pts;
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
/* How many faces have actually been walked. A room re-trace is the most
   expensive thing an edit can provoke, and the only way to know whether the
   work is being avoided is to be able to count it. */
let ROOM_TRACES = 0;
/* The room tracer has its own walk, and had one silence for all of its ways
   of failing. Each one is a different thing to go and do about it. */
let ROOM_WHY = null;
function roomTraceWhy() { return ROOM_WHY; }
function roomFail(why) { ROOM_WHY = why; return null; }
function roomTrace(seed, lvl) {
  ROOM_WHY = null;
  const nodes = roomArrangement(lvl);
  if (!nodes || !nodes.length)
    return roomFail('There are no walls on this storey to enclose a room.');
  const start = roomStartEdge(seed, nodes);
  if (!start) return roomFail('That point is outside the walls — there is nothing beside it to walk round.');
  const raw = roomWalkFace(nodes, start);
  if (!raw) return roomFail('The walls do not close around that point — there is a gap in them.');
  const pts = roomDropCollinear(raw);
  if (!pts) return null;
  pts.src = raw.src || [];
  /* a negative signed area means we walked the outside, not a room */
  let a2 = 0;
  for (let i = 0; i < pts.length; i++) a2 += cross(pts[i], pts[(i + 1) % pts.length]);
  if (a2 <= 0) return roomFail('The walls do not close around that point — the walk went round the outside.');
  if (!pointInPoly(seed, pts)) return roomFail('The walls do not close around that point.');
  ROOM_TRACES++;
  return pts;
}
/** True when an automatic room's walls no longer enclose its seed, so the
    outline being shown is the last good one rather than a description of what
    is there now. An area that is silently stale is the dangerous case: it
    reaches schedules and drawings looking exactly like a real one. */
function roomIsOpen(r) {
  if (!r || r.t !== 'room' || !r.auto || !r.seed) return false;
  roomBoundary(r);                                 /* ensures the cache is warm */
  const hit = _roomCache.get(r.id);
  return !!(hit && hit.open);
}
/* cached per document version so dragging a wall stays cheap */
const _roomCache = new Map();
function roomBoundary(r) {
  if (!r.auto || !r.seed) return r.pts;
  const hit = _roomCache.get(r.id);
  if (hit && (hit.v === DOCV || roomCacheGood(hit))) {
    hit.v = DOCV; hit.rv = ROOMV;                    /* still true; stop asking */
    return hit.pts;
  }
  let pts = null;
  try { pts = roomTrace(r.seed, r.lvl || 0); } catch (e) { pts = null; }
  /* A failed trace means the walls no longer close around the seed. The last
     good shape is still the best thing to draw — a room that vanishes while
     you drag a wall is worse than one that lingers — but it is no longer a
     measurement of anything, and the drawing has to say so. */
  const open = !pts;
  /* The last good outline is kept in the cache beside the entity, never on it.
     It used to be written through to r.pts, which is what corrupted undo; when
     that write was removed the fallback went with it, and an automatic room
     that had never been detached had nothing to fall back to at all. */
  const good = open ? (hit && hit.good) || r.pts : pts;
  if (!pts) pts = good;
  /* Deliberately does NOT write pts back onto the entity. It used to, "for
     save/export", which made a read mutate the document outside the journal
     and without mut(): straight after an undo, r.pts still held the traced
     polygon for the *pre-undo* wall positions until something re-read it, and
     a file saved in that window persisted a state undo had never produced.
     The cache below is keyed on DOCV and lives outside the entity, which is
     all the rendering path ever needed. The one consumer that genuinely needs
     a materialised polygon is the .ocad writer, and it materialises its own
     copy at write time — see roomForSave() in 11-io.js. */
  const src = (pts && pts.src) || (hit && hit.src) || [];
  /* what the tracer said about the failure, kept beside the room so the panel
     can pass it on rather than inventing a reason of its own */
  const why = open ? (typeof roomTraceWhy === 'function' ? roomTraceWhy() : null) : null;
  _roomCache.set(r.id, { v: DOCV, rv: ROOMV, pts, open, good, src, why });
  return pts;
}
/** What the walk followed to get this room's shape: the ids of the walls and
    columns that bound it, in the order it met them. Empty for a room drawn as
    a polygon, which was not traced from anything and must not claim to have
    been. Derived, never stored on the entity, so an undo cannot leave it
    disagreeing with the drawing. */
function roomSources(r) {
  if (!r || !r.auto || !r.seed) return [];
  roomBoundary(r);
  const hit = _roomCache.get(r.id);
  const src = (hit && hit.src) || [];
  /* an id that has since been erased bounds nothing */
  return src.filter(id => DOC.ents.has(id));
}
/** Why this room is not the shape it should be, in the tracer's own words.
    An automatic room that cannot close keeps its last good outline so it does
    not vanish while a wall is being dragged — which means the drawing has to
    say out loud that the number beside it is no longer a measurement. */
function roomWhy(r) {
  if (!r || !r.auto) return null;
  const hit = _roomCache.get(r.id);
  if (hit && !hit.open) return null;
  return (hit && hit.why) || 'The walls no longer close around this room.';
}
/** the same, in words, for the properties panel and LIST */
function roomSourceText(r) {
  const src = roomSources(r);
  if (!src.length) return r && r.auto ? 'Not enclosed by anything' : 'Drawn, not traced';
  const by = {};
  for (const id of src) { const e = DOC.ents.get(id); if (e) by[e.t] = (by[e.t] || 0) + 1; }
  const bits = Object.keys(by).map(t => by[t] + ' ' + t + (by[t] === 1 ? '' : 's'));
  return 'Bounded by ' + bits.join(' and ');
}
/** Does a change to this object change this room? Its own boundary objects, of
    course — and anything whose extent reaches inside it, because a NEW wall
    through the middle bounds a room that has never heard of it. */
function roomAffectedBy(r, e) {
  if (!r || !e || !r.auto) return false;
  if (roomSources(r).indexOf(e.id) >= 0) return true;
  const hit = _roomCache.get(r.id);
  const pts = (hit && (hit.pts || hit.good)) || r.pts;
  const rb = pts && pts.length > 2 ? bboxPts(pts) : null;
  if (!rb) return true;                             /* nothing known: assume so */
  const b = roomLogBox(e);
  if (!b) return true;
  return !(b[2] < rb[0] || b[0] > rb[2] || b[3] < rb[1] || b[1] > rb[3]);
}
