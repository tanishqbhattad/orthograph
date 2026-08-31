'use strict';
/* ============================================================
   B5 — tracing a boundary out of loose geometry
   ------------------------------------------------------------
   HATCH could only fill something that was already ONE closed
   object: a polyline, a circle, a room, a wall. Four lines drawn
   as four lines enclose a space perfectly well and could not be
   hatched at all, which is most of how a drawing actually gets
   made.

   This finds the face of the arrangement that contains a point.
   The geometry is cut at every crossing so that a shape made of
   overlapping lines is still a shape, and then the face is
   walked by always taking the sharpest available turn — the
   standard way to walk one face of a planar subdivision, and the
   reason the loop comes back tight around the pick rather than
   wandering off around the outside of everything.
   ============================================================ */

const BND_TOL = 1e-6;
/** weld coordinates that are the same point to within a tolerance */
function bndKey(p, tol) {
  return Math.round(p[0] / tol) + ',' + Math.round(p[1] / tol);
}
/** every entity near the pick, flattened to plain segments */
function boundarySegments(box, tol) {
  const segs = [];
  const push = (a, b) => {
    if (dist(a, b) > tol) segs.push([a.slice(), b.slice()]);
  };
  for (const e of DOC.ents.values()) {
    if (!visible(e) || e.t === 'hatch' || e.t === 'text' || e.t === 'mtext'
        || e.t === 'attdef' || e.t === 'dim' || e.t === 'table') continue;
    const b = bbox(e);
    if (b[2] < box[0] || b[0] > box[2] || b[3] < box[1] || b[1] > box[3]) continue;
    let sh = [];
    try { sh = shapes(e, 64) || []; } catch (err) { continue; }
    for (const s of sh) {
      if (s.text != null) continue;
      if (s.pts) {
        for (let i = 1; i < s.pts.length; i++) push(s.pts[i - 1], s.pts[i]);
        if (s.closed && s.pts.length > 2) push(s.pts[s.pts.length - 1], s.pts[0]);
      } else if (s.r != null) {
        const pts = s.a0 != null ? arcPts(s, 64) : poly({ t: 'circle', c: s.c, r: s.r }, 64);
        for (let i = 1; i < pts.length; i++) push(pts[i - 1], pts[i]);
        if (s.a0 == null) push(pts[pts.length - 1], pts[0]);
      }
    }
  }
  return segs;
}
/** Cut every segment at every crossing. Without this two lines that cross in
    the middle are two edges meeting nowhere, and the walk steps straight over
    the junction that was supposed to turn it. */
function splitSegments(segs, tol) {
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    const [a, b] = segs[i];
    const ts = [0, 1];
    const L = dist(a, b);
    if (L < tol) continue;
    for (let j = 0; j < segs.length; j++) {
      if (i === j) continue;
      const X = xSegSeg(a, b, segs[j][0], segs[j][1]);
      if (!X) continue;
      const t = ((X[0] - a[0]) * (b[0] - a[0]) + (X[1] - a[1]) * (b[1] - a[1])) / (L * L);
      if (t > tol / L && t < 1 - tol / L) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    for (let k = 1; k < ts.length; k++) {
      if (ts[k] - ts[k - 1] < tol / L) continue;
      const p0 = [a[0] + (b[0] - a[0]) * ts[k - 1], a[1] + (b[1] - a[1]) * ts[k - 1]];
      const p1 = [a[0] + (b[0] - a[0]) * ts[k], a[1] + (b[1] - a[1]) * ts[k]];
      out.push([p0, p1]);
    }
  }
  return out;
}
/** Walk the face containing `p`, taking the sharpest turn at every node.

    Starting edge: cast a ray straight up from the pick and take the first edge
    it crosses. That edge is on the boundary of the face the point is in, which
    is what makes the result the room you clicked in rather than the outside of
    the building. */
/* The tracer had four distinct ways to fail and one answer for all of them.
   "Nothing encloses that point" is true whether the walls have a gap in them,
   the pick is outside the building, or nothing is drawn at all — and each of
   those is a different thing to go and do about it. */
let TRACE_WHY = null;
function traceWhy() { return TRACE_WHY; }
function traceFail(why) { TRACE_WHY = why; return null; }
function traceBoundary(p, opts) {
  TRACE_WHY = null;
  const o = opts || {};
  const tol = o.tol || Math.max(px(2), BND_TOL);
  const reach = o.reach || 1e7;
  const box = [p[0] - reach, p[1] - reach, p[0] + reach, p[1] + reach];
  const segs = splitSegments(boundarySegments(box, tol), tol);
  if (!segs.length) return traceFail('Nothing is drawn near there to enclose anything.');

  /* directed edges, both ways round, indexed by the node they leave */
  const outAt = new Map();
  const addDir = (a, b) => {
    const k = bndKey(a, tol);
    if (!outAt.has(k)) outAt.set(k, []);
    outAt.get(k).push({ a, b, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) });
  };
  for (const [a, b] of segs) { addDir(a, b); addDir(b, a); }

  /* the first edge above the pick */
  let best = null, bestY = Infinity;
  for (const [a, b] of segs) {
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
    if (p[0] < x0 - tol || p[0] > x1 + tol) continue;
    if (Math.abs(b[0] - a[0]) < tol) continue;          /* vertical: no crossing */
    const t = (p[0] - a[0]) / (b[0] - a[0]);
    const y = a[1] + (b[1] - a[1]) * t;
    if (y <= p[1] + tol) continue;                      /* below the pick */
    if (y < bestY) { bestY = y; best = [a, b]; }
  }
  if (!best) return traceFail('That point is outside everything — there is nothing above it to walk round.');

  /* walk leftwards along that edge so the face stays on our right */
  let cur = best[0][0] < best[1][0] ? { a: best[1], b: best[0] } : { a: best[0], b: best[1] };
  const start = cur;
  const ring = [cur.a.slice()];
  const guard = Math.min(20000, segs.length * 4 + 16);
  for (let step = 0; step < guard; step++) {
    ring.push(cur.b.slice());
    const here = outAt.get(bndKey(cur.b, tol)) || [];
    if (!here.length) return traceFail('The boundary runs off an open end — there is a gap in it.');
    const back = Math.atan2(cur.a[1] - cur.b[1], cur.a[0] - cur.b[0]);
    /* the sharpest right turn from the way we came in: the next edge
       clockwise, which is what keeps the walk hugging this one face */
    let pick = null, bestTurn = Infinity;
    for (const d of here) {
      if (dist(d.b, cur.a) < tol && here.length > 1) continue;   /* not straight back */
      let turn = back - d.ang;
      while (turn <= 0) turn += Math.PI * 2;
      while (turn > Math.PI * 2) turn -= Math.PI * 2;
      if (turn < bestTurn) { bestTurn = turn; pick = d; }
    }
    if (!pick) return traceFail('The boundary runs off an open end — there is a gap in it.');
    cur = pick;
    if (dist(cur.a, start.a) < tol && ring.length > 2) {
      /* closed. It only counts if it actually encloses the pick — a walk that
         escaped round the outside comes back closed too. */
      const ring2 = ring.slice(0, -1);
      if (ring2.length < 3) return traceFail('What closes round there is too small to be a region.');
      if (!pointInPoly(p, ring2))
        /* Two causes, and from here they look identical: the pick really is
           outside, or the boundary has a gap the walk escaped through and
           came back round the outside of. Say both rather than pick one. */
        return traceFail('That did not close round the point — the boundary is open somewhere, or the point is outside it.');
      return ring2;
    }
  }
  return traceFail('That boundary is too complicated to follow — it never came back to where it started.');
}

/** BOUNDARY — AutoCAD's, and the reason it exists: make the traced loop into a
    real polyline you can then offset, dimension or hatch, rather than only
    being able to fill it. */
defc('boundary', {
  key: 'boundary', group: 'draw',
  hint: 'Click inside an enclosed area · <em>Enter</em> to stop',
  point(c, p) {
    /* an already-closed object wins: tracing a polyline that is already a
       polyline would replace it with a worse copy of itself */
    const b = (typeof findBoundary === 'function') ? findBoundary(p) : null;
    const ring = b ? b.outer : traceBoundary(p);
    if (!ring) return whyFail(traceWhy() || 'Nothing encloses that point.');
    begin();
    const n = addEnt({ t: 'pline', pts: ring.map(q => q.slice()), closed: true,
                       layer: DOC.cur });
    commit('Boundary');
    SEL.clear(); SEL.add(n.id);
    cliPrint('Boundary traced — ' + ring.length + ' points, ' +
             fmt(Math.abs(polyArea(ring))) + ' square');
    syncUI(); draw();
  },
});
