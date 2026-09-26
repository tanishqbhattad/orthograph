'use strict';
/* ============================================================
   A clockwise polyline arc is drawn on its own side

   A bulge is signed: positive runs anticlockwise from one vertex
   to the next, negative clockwise. The sampler that turns an arc
   into points for drawing and for picking always swept
   anticlockwise from start angle to end angle — so a clockwise
   quarter-circle came out as the other three quarters of the
   circle. The stored geometry and its length were right; what
   was drawn and what a click could find was the complement. A
   polyline filleted after being drawn clockwise showed inward
   three-quarter loops, and its real curve could not be clicked.
   ============================================================ */
module.exports = ({ group, t, ok, eq, close, R }) => {
  group('clockwise polyline arcs');

  /* (0,0)->(100,0) with bulge -tan(22.5°): a 90° clockwise arc, centre at
     (50,-50), radius 70.7107, bowing ABOVE the chord to (50, 20.7107). Its
     complement would pass through (50, -120.7107). */
  t('a clockwise arc span is sampled on its own side, not as its complement', () => {
    const r = R(`
      const e = { t:'pline', pts:[[0,0],[100,0]], bulges:[-Math.tan(Math.PI/8)] };
      const P = plinePts(e, 48);
      const ys = P.map(p => p[1]);
      return { minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys),
               first: P[0], last: P[P.length - 1] };`);
    close(r.maxY, 20.7107, 1e-3, 'it bows up to the true sagitta');
    ok(r.minY > -1e-9, 'and nothing of it swings below the chord: ' + r.minY);
    close(r.first[0], 0, 1e-9, 'it starts at the first vertex'); close(r.last[0], 100, 1e-9, 'and ends at the second');
  });

  t('and a click finds the true curve, not the phantom loop', () => {
    const r = R(`
      const e = { t:'pline', pts:[[0,0],[100,0]], bulges:[-Math.tan(Math.PI/8)] };
      return { onArc: entDist([50, 20.7107], e), onPhantom: entDist([50, -120.7107], e) };`);
    ok(r.onArc < 0.01, 'the real arc is under the cursor: ' + r.onArc);
    ok(r.onPhantom > 50, 'where the complement would be, there is nothing: ' + r.onPhantom);
  });

  t('an anticlockwise arc is unchanged', () => {
    const r = R(`
      const e = { t:'pline', pts:[[0,0],[100,0]], bulges:[Math.tan(Math.PI/8)] };
      const ys = plinePts(e, 48).map(p => p[1]);
      return { minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys) };`);
    close(r.minY, -20.7107, 1e-3, 'a positive bulge bows below the chord');
    ok(r.maxY < 1e-9, 'and not above it: ' + r.maxY);
  });
};
