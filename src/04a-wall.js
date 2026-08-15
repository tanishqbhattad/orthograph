/* ============================================================
   ORTHOGRAPH — 04 architecture: walls, openings, components
   ------------------------------------------------------------
   A wall is a centreline plus a type. Everything you see — faces,
   mitred corners, T-junction cleanup, door and window openings —
   is derived at draw time, so moving a wall fixes up its corners
   and drags its openings along with it.
   ============================================================ */

const NTOL = 2;                                   /* node coincidence, mm */
const nk = v => Math.round(v / NTOL);
/* A mitre may not run further from its node than this many average wall
   thicknesses. Without it two walls meeting at half a degree fire a spike off
   into the next suburb; with it the corner still closes, because both walls of
   the pair clamp to the very same point. */
const MITRE_MAX = 10;
const WALL_MIN_T = 10;                            /* thinnest wall a face grip may make */

let WNODES = null, WNODESv = -1;
function wallNodes() {
  if (WNODES && WNODESv === DOCV) return WNODES;
  const m = new Map();
  for (const e of DOC.ents.values()) {
    if (e.t !== 'wall') continue;
    for (const end of [0, 1]) {
      const p = end ? e.b : e.a;
      const k = nk(p[0]) + ':' + nk(p[1]);
      let a = m.get(k); if (!a) m.set(k, a = []);
      a.push({ w: e, end, p });
    }
  }
  WNODES = m; WNODESv = DOCV; return m;
}
/** every wall end sitting on point p (searches the 3×3 key neighbourhood) */
function nodesAt(p) {
  const m = wallNodes(), out = [];
  const i = nk(p[0]), j = nk(p[1]);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const l = m.get((i + a) + ':' + (j + b));
    if (l) for (const x of l) if (dist(x.p, p) <= NTOL) out.push(x);
  }
  return out;
}
let WALLIST = null, WALLISTv = -1;
function allWalls() {
  if (WALLIST && WALLISTv === DOCV) return WALLIST;
  WALLIST = [...DOC.ents.values()].filter(e => e.t === 'wall');
  WALLISTv = DOCV; return WALLIST;
}
/* ------------------------------------------------------------
   A wall-only spatial hash.
   It cannot use the document index: a wall's bbox needs its joins,
   its joins need its neighbours, and asking the document index for
   neighbours would rebuild the index, which needs the bbox. That is
   a cycle. This is built from the RAW offset rectangle instead,
   which depends on nothing but the wall itself.
   ------------------------------------------------------------ */
let WIDX = null, WIDXv = -1;
function wallRawBox(w) {
  const o = wallRawOutline(w);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of o) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
}
function wallIndex() {
  if (WIDX && WIDXv === DOCV) return WIDX;
  const walls = allWalls();
  /* Cell size from the median wall, not the longest: one long wall must not
     collapse everything into a single bucket. Long walls are handled by the
     multi-cell insert below, and anything absurd falls into the '*' overflow. */
  let maxT = 0;
  const lens = [];
  for (const w of walls) { maxT = Math.max(maxT, wallT(w)); lens.push(wallLen(w) + wallT(w)); }
  lens.sort((a, b) => a - b);
  const cell = Math.max(lens.length ? lens[Math.floor(lens.length * 0.6)] : 1000, 1);
  const cells = new Map();
  for (const w of walls) {
    const b = wallRawBox(w);
    const i0 = Math.floor(b[0] / cell), i1 = Math.floor(b[2] / cell);
    const j0 = Math.floor(b[1] / cell), j1 = Math.floor(b[3] / cell);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 4096) { cells.set('*', (cells.get('*') || []).concat([w])); continue; }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i + ':' + j;
      let a = cells.get(k); if (!a) cells.set(k, a = []);
      a.push(w);
    }
  }
  WIDX = { cell, cells, walls, maxT }; WIDXv = DOCV;
  return WIDX;
}
function wallsInBox(b) {
  const ix = wallIndex();
  const { cell, cells } = ix;
  const i0 = Math.floor(b[0] / cell), i1 = Math.floor(b[2] / cell);
  const j0 = Math.floor(b[1] / cell), j1 = Math.floor(b[3] / cell);
  if (!isFinite(i0) || (i1 - i0 + 1) * (j1 - j0 + 1) > 10000) return ix.walls;
  const out = new Set(cells.get('*') || []);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const a = cells.get(i + ':' + j);
    if (a) for (const w of a) out.add(w);
  }
  return [...out];
}
function wallsNear(w) {
  const b = wallRawBox(w), pad = wallT(w) * 2 + NTOL * 4;
  return wallsInBox([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]);
}
function wallsNearPoint(p) {
  /* must reach at least half the thickest wall, or a T-junction stops forming */
  const r = wallIndex().maxT / 2 + NTOL * 4 + 1;
  return wallsInBox([p[0] - r, p[1] - r, p[0] + r, p[1] + r]);
}
let OPENIDX = null, OPENIDXv = -1;
function openingsByHost() {
  if (OPENIDX && OPENIDXv === DOCV) return OPENIDX;
  const m = new Map();
  for (const e of DOC.ents.values()) {
    if (e.t !== 'door' && e.t !== 'window') continue;
    let a = m.get(e.host); if (!a) m.set(e.host, a = []);
    a.push(e);
  }
  OPENIDX = m; OPENIDXv = DOCV; return m;
}

/* ---------------- wall basics ---------------- */
function wallT(w) { return w.th != null ? w.th : ((wallType(w.wt) || {}).t || 100); }
function wallU(w) { const u = norm(sub(w.b, w.a)); return (u[0] || u[1]) ? u : [1, 0]; }
function wallLen(w) { return dist(w.a, w.b); }
/** [leftOffset, rightOffset] along perp(u) for the wall's justification */
function wallOffsets(w) {
  const t = wallT(w), j = w.just || 'center';
  if (j === 'left') return [0, -t];
  if (j === 'right') return [t, 0];
  return [t / 2, -t / 2];
}
/** infinite carrier of one wall face. s = +1 left, -1 right (wall frame) */
function wallFace(w, s) {
  const u = wallU(w), n = perp(u), o = wallOffsets(w)[s > 0 ? 0 : 1];
  return { a: add(w.a, mul(n, o)), b: add(w.b, mul(n, o)) };
}
/** un-joined rectangle, used for containment tests (never recurses) */
function wallRawOutline(w) {
  const L = wallFace(w, 1), R = wallFace(w, -1);
  return [L.a, L.b, R.b, R.a];
}
function wallsShareEnd(w, v) {
  return dist(w.a, v.a) <= NTOL || dist(w.a, v.b) <= NTOL ||
    dist(w.b, v.a) <= NTOL || dist(w.b, v.b) <= NTOL;
}
/** a wall whose interior the point p lands on (used for T-junctions) */
function wallThrough(p, skip) {
  for (const v of wallsNearPoint(p)) {
    if (v.id === skip.id || (v.lvl || 0) !== (skip.lvl || 0)) continue;
    const L = wallLen(v); if (L < EPS) continue;
    const u = wallU(v), d = dot(sub(p, v.a), u);
    if (d < NTOL || d > L - NTOL) continue;        /* must be interior, not an end */
    if (segDist(p, v.a, v.b) <= wallT(v) / 2 + NTOL) return v;
  }
  return null;
}

/* ---------------- joins ----------------
   Every wall end sitting on a node is sorted by the direction it runs away in,
   and each angularly adjacent pair is mitred: the first end's face on the
   anticlockwise side of its run meets the second end's face on the clockwise
   side of its run. Two ends give the familiar L; two collinear ends give
   parallel faces and therefore a straight run; three or more give a real Y, T
   or cross instead of a square stub.                                        */

/** direction the wall runs away from its node at `end` */
function endDir(w, end) { const u = wallU(w); return end ? [-u[0], -u[1]] : u; }
/** carrier of the face on side g of that run (+1 = anticlockwise of it) */
function endFace(w, end, g) { return wallFace(w, end ? -g : g); }
/** the same face's untrimmed point, level with the node */
function endBase(w, end, g) {
  const n = perp(wallU(w)), off = wallOffsets(w), s = end ? -g : g;
  return add(end ? w.b : w.a, mul(n, off[s > 0 ? 0 : 1]));
}
/** how far a mitre may run from its node. Symmetric in the pair, so when the
    limit bites both walls still land on exactly the same point — the corner
    stays closed, it just stops growing. */
function mitreLimit(A, B) {
  return Math.min(MITRE_MAX * (wallT(A) + wallT(B)) / 2, wallLen(A), wallLen(B));
}
/** solve the corner between two ends that are neighbours around the node */
function mitreAt(P, A, B) {
  const FA = endFace(A.w, A.end, 1), FB = endFace(B.w, B.end, -1);
  const X = xLineLine(FA.a, FA.b, FB.a, FB.b, true);
  if (!X.length) return null;                      /* parallel: a straight run */
  const d = dist(X[0], P), lim = mitreLimit(A.w, B.w);
  if (d <= lim || d < EPS) return X[0];
  return add(P, mul(norm(sub(X[0], P)), lim));
}
/** every wall end on the node at p, in anticlockwise order of its run */
function nodeRing(p, lvl) {
  return nodesAt(p)
    .filter(x => (x.w.lvl || 0) === lvl && wallLen(x.w) > EPS)
    .map(x => { const d = endDir(x.w, x.end); return { w: x.w, end: x.end, a: Math.atan2(d[1], d[0]) }; })
    .sort((m, n) => m.a - n.a);
}

function wallEndPoints(w, end) {
  const u = wallU(w);
  const P = end ? w.b : w.a;
  const out = { plus: endBase(w, end, 1), minus: endBase(w, end, -1), capped: true };
  const lvl = w.lvl || 0;
  const ring = nodeRing(P, lvl);
  const me = ring.findIndex(x => x.w.id === w.id && x.end === end);
  if (me >= 0 && ring.length > 1) {
    const N = ring.length;
    const Xp = mitreAt(P, ring[me], ring[(me + 1) % N]);        /* anticlockwise side */
    const Xm = mitreAt(P, ring[(me + N - 1) % N], ring[me]);    /* clockwise side */
    if (Xp) out.plus = Xp;
    if (Xm) out.minus = Xm;
    out.capped = false;                            /* the wall carries on either way */
    return out;
  }
  if (ring.length <= 1) {
    const host = wallThrough(P, w);
    if (host) {
      const away = end ? mul(u, -1) : u;
      const nh = perp(wallU(host));
      const sgn = dot(away, nh) >= 0 ? 1 : -1;
      const H = wallFace(host, sgn);
      let ok = true; const got = {};
      for (const sAway of [1, -1]) {
        const A = endFace(w, end, sAway);
        const X = xLineLine(A.a, A.b, H.a, H.b, true);
        if (!X.length) { ok = false; break; }
        got[sAway > 0 ? 'plus' : 'minus'] = X[0];
      }
      if (ok) { out.plus = got.plus; out.minus = got.minus; out.capped = false; return out; }
    }
  }
  return out;
}
/** distance along w (from a) where another wall's body crosses face `s` */
function wallBreaks(w, s) {
  const face = wallFace(w, s), u = wallU(w), L = wallLen(w);
  const out = [];
  for (const v of wallsNear(w)) {
    if (v.id === w.id || (v.lvl || 0) !== (w.lvl || 0)) continue;
    if (wallsShareEnd(w, v)) continue;             /* mitred corners need no break */
    const ds = [];
    for (const sv of [1, -1]) {
      const F = wallFace(v, sv);
      const X = xLineLine(face.a, face.b, F.a, F.b, true);
      if (X.length) ds.push(dot(sub(X[0], w.a), u));
    }
    if (ds.length !== 2) continue;
    let [d0, d1] = ds.sort((x, y) => x - y);
    if (d1 - d0 < 1e-6) continue;
    const midD = (d0 + d1) / 2;
    if (midD < -NTOL || midD > L + NTOL) continue;
    const midP = add(face.a, mul(u, midD - dot(sub(face.a, w.a), u)));
    if (!pointInPoly(midP, wallRawOutline(v))) continue;
    out.push([d0, d1]);
  }
  return out;
}
/* opening intervals along the centreline, as [start, end] distances from a */
function wallOpenings(w) {
  const list = (openingsByHost().get(w.id) || []).slice();
  return list.map(o => {
    const wd = openW(o);
    return { o, s: o.pos - wd / 2, e: o.pos + wd / 2 };
  }).sort((x, y) => x.s - y.s);
}
function openW(o) {
  if (o.w != null) return o.w;
  const T = o.t === 'door' ? doorType(o.dt) : winType(o.wtp);
  return (T && T.w) || 900;
}
function openH(o) {
  if (o.h != null) return o.h;
  const T = o.t === 'door' ? doorType(o.dt) : winType(o.wtp);
  return (T && T.h) || 2100;
}
/** subtract a list of [s,e] intervals from [0,L] */
function cutRuns(L, cuts) {
  const runs = [];
  let at = 0;
  const cs = cuts.filter(c => c[1] > 0 && c[0] < L).map(c => [Math.max(c[0], 0), Math.min(c[1], L)])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const c of cs) {
    const last = merged[merged.length - 1];
    if (last && c[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], c[1]);
    else merged.push([c[0], c[1]]);
  }
  for (const [s, e] of merged) { if (s - at > 1e-6) runs.push([at, s]); at = Math.max(at, e); }
  if (L - at > 1e-6) runs.push([at, L]);
  return runs;
}
/** point on a face carrier at centreline distance d */
function faceAtD(face, w, u, n, d) {
  const c = add(w.a, mul(u, d));
  const X = xLineLine(face.a, face.b, c, add(c, n), true);
  return X.length ? X[0] : c;
}

/** is the poche (solid/hatched cut fill) on for this wall?
    w.hatch: true forces it on, false off, null/undefined = document default. */
function wallHatchOn(w) {
  if (!w) return false;
  if (w.hatch === true || w.hatch === false) return w.hatch;
  return DOC.wallHatch !== false;
}

function wallShapes(w) {
  const L = wallLen(w);
  if (L < EPS) return [];
  const u = wallU(w), n = perp(u);
  const E0 = wallEndPoints(w, 0), E1 = wallEndPoints(w, 1);
  /* left face runs E0.plus → E1.minus, right face E0.minus → E1.plus */
  const faces = [
    { s: 1, carrier: { a: E0.plus, b: E1.minus } },
    { s: -1, carrier: { a: E0.minus, b: E1.plus } },
  ];
  const ops = wallOpenings(w);
  /* A door is a hole: the wall stops at the reveal. A window is not — you can
     see the wall under the sill — so a window keeps its wall run and its poche,
     drawn back at partial opacity instead of being cut away. */
  const doorCuts = ops.filter(o => o.o.t !== 'window').map(o => [o.s, o.e]);
  const winCuts = ops.filter(o => o.o.t === 'window').map(o => [o.s, o.e]);

  /* the joined outline comes first so a renderer can lay the poche down before
     anything is drawn over it */
  const outline = [E0.plus, E1.minus, E1.plus, E0.minus];
  const out = [{ pts: outline, closed: true, role: 'poche', hatch: wallHatchOn(w) }];

  /* the wall body across each window, ghosted */
  const Lc0 = { a: E0.plus, b: E1.minus }, Rc0 = { a: E0.minus, b: E1.plus };
  for (const o of winCuts) {
    const s = clamp(o[0], 0, L), e = clamp(o[1], 0, L);
    if (e - s <= 1e-9) continue;
    out.push({
      pts: [faceAtD(Lc0, w, u, n, s), faceAtD(Lc0, w, u, n, e),
        faceAtD(Rc0, w, u, n, e), faceAtD(Rc0, w, u, n, s)],
      closed: true, role: 'pocheGhost', hatch: wallHatchOn(w),
    });
  }

  for (const f of faces) {
    const start = dot(sub(f.carrier.a, w.a), u), end = dot(sub(f.carrier.b, w.a), u);
    const span = end - start;
    if (span <= 1e-9) continue;                    /* a mitre ate the whole face */
    const rebase = c => [c[0] - start, c[1] - start];
    const breaks = wallBreaks(w, f.s);
    /* solid runs: everything except doors, windows and face breaks */
    const solid = cutRuns(span, [...doorCuts, ...winCuts, ...breaks].map(rebase));
    for (const [s, e] of solid) {
      out.push({
        pts: [faceAtD(f.carrier, w, u, n, start + s), faceAtD(f.carrier, w, u, n, start + e)],
        role: 'face',
      });
    }
    /* ghosted runs: the parts of the face a window spans, minus doors/breaks */
    for (const wc of winCuts) {
      const seg = [Math.max(wc[0], start), Math.min(wc[1], end)];
      if (seg[1] - seg[0] <= 1e-9) continue;
      const local = cutRuns(seg[1] - seg[0],
        [...doorCuts, ...breaks].map(c => [c[0] - seg[0], c[1] - seg[0]]));
      for (const [s, e] of local) {
        out.push({
          pts: [faceAtD(f.carrier, w, u, n, seg[0] + s), faceAtD(f.carrier, w, u, n, seg[0] + e)],
          role: 'faceGhost',
        });
      }
    }
  }
  /* jambs at every opening edge, and caps at unjoined ends */
  const Lc = { a: E0.plus, b: E1.minus }, Rc = { a: E0.minus, b: E1.plus };
  for (const o of ops) {
    for (const d of [o.s, o.e]) {
      if (d < -NTOL || d > L + NTOL) continue;
      out.push({ pts: [faceAtD(Lc, w, u, n, d), faceAtD(Rc, w, u, n, d)], role: 'jamb' });
    }
  }
  if (E0.capped) out.push({ pts: [E0.plus, E0.minus], role: 'cap' });
  if (E1.capped) out.push({ pts: [E1.plus, E1.minus], role: 'cap' });
  return out;
}
function wallOutline(w) {
  const E0 = wallEndPoints(w, 0), E1 = wallEndPoints(w, 1);
  return [E0.plus, E1.minus, E1.plus, E0.minus];
}
GEOM.wall = {
  shapes: wallShapes,
  bbox(w) {
    const p = wallOutline(w);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    return [x0, y0, x1, y1];
  },
  dist(p, w) {
    if (pointInPoly(p, wallOutline(w))) return 0;
    return Math.min(polyDist(p, wallOutline(w), true), segDist(p, w.a, w.b));
  },
  grips(w) {
    const n = perp(wallU(w)), off = wallOffsets(w), m = mid(w.a, w.b);
    return [
      { p: w.a, k: 'a' }, { p: m, k: 'm' }, { p: w.b, k: 'b' },
      { p: add(m, mul(n, off[0])), k: 'fL' },      /* drag a face to set thickness */
      { p: add(m, mul(n, off[1])), k: 'fR' },
    ];
  },
  grip(w, k, p) {
    /* F8 has to mean the same thing however the wall is being edited: dragging
       an end grip with ortho on may not produce an angled wall either. */
    if (k === 'a' || k === 'b') {
      const anchor = k === 'a' ? w.b : w.a;
      if (typeof wallConstrain === 'function') p = wallConstrain(anchor, p);
    }
    if (k === 'fL' || k === 'fR') { wallDragFace(w, k === 'fL' ? 1 : -1, p); return; }
    if (k === 'a') {
      const L0 = wallLen(w);
      w.a = wallCleanPoint(p, wallT(w), w, w.b);
      /* `pos` is measured from a, so stretching that end has to give every
         opening the same shift or they slide along the wall */
      wallShiftOpenings(w, wallLen(w) - L0);
    }
    else if (k === 'b') w.b = wallCleanPoint(p, wallT(w), w, w.a);
    else { const d = sub(p, mid(w.a, w.b)); w.a = add(w.a, d); w.b = add(w.b, d); }
    wallReclampOpenings(w);
  },
  xf(w, fn) { w.a = fn(w.a); w.b = fn(w.b); wallReclampOpenings(w); },
  area: w => polyArea(wallOutline(w)),
};
/** drag one face across to set the thickness. The opposite face does not
    budge: the reference line slides by exactly the offset it loses. */
function wallDragFace(w, s, p) {
  const u = wallU(w); if (!u[0] && !u[1]) return;
  const n = perp(u), off = wallOffsets(w);
  const d = dot(sub(p, w.a), n);                   /* where the cursor puts this face */
  const opp = s > 0 ? off[1] : off[0];             /* the face that must stay put */
  w.th = Math.max(s > 0 ? d - opp : opp - d, WALL_MIN_T);
  const off2 = wallOffsets(w);
  const shift = opp - (s > 0 ? off2[1] : off2[0]);
  if (shift) { w.a = add(w.a, mul(n, shift)); w.b = add(w.b, mul(n, shift)); }
}
/** the wall grew or shrank at its `a` end: openings keep their distance from b */
function wallShiftOpenings(w, dL) {
  if (!dL) return;
  for (const o of (openingsByHost().get(w.id) || [])) { mut(o); o.pos += dL; }
}
/** keep hosted openings inside the wall after it is resized */
function wallReclampOpenings(w) {
  const L = wallLen(w);
  for (const o of (openingsByHost().get(w.id) || [])) {
    /* A wall shorter than its opening used to leave the opening hanging off
       the end, which erased every face run and made the wall vanish. Shrink
       the opening to fit; if there is no room at all, take it out. */
    const want = openW(o);
    const room = L - 2;
    if (room < 100) { delEnt(o.id); continue; }
    const wd = Math.min(want, room);
    if (wd !== want) { mut(o); o.w = wd; }
    const p = clamp(o.pos, wd / 2 + 1, Math.max(wd / 2 + 1, L - wd / 2 - 1));
    if (p !== o.pos) { mut(o); o.pos = p; }
  }
}

/* ---------------- automatic cleanup ----------------
   A wall end dropped a whisker away from another wall is almost always meant
   to join it, so pull it exactly onto that node or centreline. Nothing else
   in the join code has to guess afterwards.                              */
/** how close is "near enough", for a wall of thickness th */
function wallCleanTol(th) { return Math.max((th || 100) * 0.75, 25); }
/** p, moved onto a nearby wall node or centreline. `skip` is the wall being
    edited; `other` is its far end, which we must not collapse onto. */
function wallCleanPoint(p, th, skip, other) {
  const tol = wallCleanTol(th);
  const lvl = skip ? (skip.lvl || 0) : DOC.curLevel;
  const usable = q => !other || dist(q, other) > tol;
  let best = null, bd = tol;
  for (const v of allWalls()) {                    /* a real node always wins */
    if ((skip && v.id === skip.id) || (v.lvl || 0) !== lvl || !pickable(v)) continue;
    for (const q of [v.a, v.b]) {
      const d = dist(p, q);
      if (d < bd && usable(q)) { bd = d; best = q; }
    }
  }
  if (best) return best.slice();
  bd = tol;
  for (const v of allWalls()) {                    /* otherwise land on a centreline */
    if ((skip && v.id === skip.id) || (v.lvl || 0) !== lvl || !pickable(v)) continue;
    if (wallLen(v) < EPS) continue;
    const c = segClosest(p, v.a, v.b);
    const d = dist(p, c.p);
    if (d < bd && usable(c.p)) { bd = d; best = c.p; }
  }
  return best ? best.slice() : p.slice();
}

/* ---------------- helpers used by the commands ---------------- */
/** nearest wall to p, plus the distance along it — for placing openings */
function pickWallAt(p, r) {
  let best = null, bd = r != null ? r : Infinity;
  for (const w of allWalls()) {
    if (!pickable(w)) continue;
    const d = GEOM.wall.dist(p, w);
    if (d <= bd) { bd = d; best = w; }
  }
  if (!best) return null;
  const u = wallU(best);
  return { w: best, d: clamp(dot(sub(p, best.a), u), 0, wallLen(best)) };
}
/** deleting a wall takes its openings with it */
function delWallCascade(id) {
  const w = DOC.ents.get(id);
  if (w && w.t === 'wall') for (const o of (openingsByHost().get(id) || [])) delEnt(o.id);
  delEnt(id);
}
function isArchEnt(e) { return !!GEOM[e.t]; }
