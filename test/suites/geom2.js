'use strict';
/* ============================================================
   8.2 HULL and 8.3 offset joins

   Two small pieces of plane geometry with real architectural use
   and no dependencies.

   A convex hull is the site boundary round a set of survey
   points, the extent of a furniture layout, the catchment of an
   escape route, the swept envelope of a door and its approach.

   And offset had one defect the wall code already learned the
   hard way: it mitred every corner with no limit, so a
   near-reflex vertex threw a spike of arbitrary length. Walls cap
   theirs with MITRE_MAX; ordinary offset did not.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('HULL');

  t('wraps a scatter of points in the smallest convex ring', () => {
    const r = R(`${SETUP}
      begin();
      /* a square of four corners plus a point inside it, which must not appear */
      for (const p of [[0,0],[4000,0],[4000,4000],[0,4000],[2000,2000]])
        addEnt({t:'point', p, layer:'0'});
      commit('p');
      SEL.clear(); for (const e of DOC.ents.values()) SEL.add(e.id);
      cancelCmd(); startCmd('hull'); endCmd(true);
      const h = [...DOC.ents.values()].find(e => e.t === 'pline' && e.closed);
      return { made: !!h, n: h && h.pts.length, area: h && Math.round(Math.abs(polyArea(h.pts))) };`);
    eq(r.made, true, 'it made a closed polyline');
    eq(r.n, 4, 'of the four corners only, got ' + r.n);
    eq(r.area, 16000000, 'covering the whole square');
  });

  t('a hull of curves follows the curves, not their control points', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'circle', c:[0,0], r:1000, layer:'0'});
      addEnt({t:'circle', c:[4000,0], r:1000, layer:'0'});
      commit('c');
      SEL.clear(); for (const e of DOC.ents.values()) SEL.add(e.id);
      cancelCmd(); startCmd('hull'); endCmd(true);
      const h = [...DOC.ents.values()].find(e => e.t === 'pline' && e.closed);
      return { n: h && h.pts.length, area: h && Math.abs(polyArea(h.pts)) };`);
    ok(r.n > 8, 'the hull follows the arcs, got ' + r.n + ' vertices');
    /* two 1000 circles 4000 apart: a 4000x2000 slab plus the two half discs */
    close(r.area, 4000 * 2000 + Math.PI * 1000 * 1000, 120000,
      'and encloses the right area, got ' + Math.round(r.area));
  });

  t('collinear points do not produce a degenerate ring', () => {
    const r = R(`${SETUP}
      begin();
      for (const p of [[0,0],[1000,0],[2000,0],[3000,0]]) addEnt({t:'point', p, layer:'0'});
      commit('p');
      SEL.clear(); for (const e of DOC.ents.values()) SEL.add(e.id);
      let threw = null;
      try { cancelCmd(); startCmd('hull'); endCmd(true); } catch (e) { threw = e.message; }
      const h = [...DOC.ents.values()].find(e => e.t === 'pline');
      return { threw, made: !!h, n: h && h.pts.length };`);
    eq(r.threw, null, 'no throw on a line of points');
    ok(!r.made || r.n <= 2, 'and no pretend polygon: ' + r.n);
  });

  t('one object on its own is refused rather than hulled to itself', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'point', p:[0,0], layer:'0'}); commit('p');
      SEL.clear(); SEL.add([...DOC.ents.values()][0].id);
      cancelCmd(); startCmd('hull'); endCmd(true);
      return { plines: [...DOC.ents.values()].filter(e => e.t === 'pline').length };`);
    eq(r.plines, 0, 'nothing is drawn from a single point');
  });

  group('offset joins');

  /* The wall code capped its mitres at MITRE_MAX for exactly this reason and
     ordinary offset never learned it. Two nearly-parallel segments meeting at
     a shallow angle throw a spike as long as you like. */
  t('a shallow corner does not throw an unbounded spike', () => {
    const r = R(`${SETUP}
      begin();
      const e = addEnt({t:'pline', pts:[[0,0],[5000,0],[10000,50]], closed:false, layer:'0'});
      commit('p');
      const off = offsetEnt(e, 500, offsetSide(e, [0, -1000]));
      const far = off && Math.max(...off.pts.map(p => Math.hypot(p[0] - 5000, p[1])));
      return { made: !!off, far: Math.round(far) };`);
    eq(r.made, true, 'it offsets');
    ok(r.far < 20000,
      'and the corner stays near the corner: furthest point ' + r.far + ' from it');
  });

  t('a round join puts an arc on the outside of the corner', () => {
    const r = R(`${SETUP}
      begin();
      const e = addEnt({t:'pline', pts:[[0,0],[3000,0],[3000,3000]], closed:false, layer:'0'});
      commit('p');
      const miter = offsetEnt(e, 500, offsetSide(e, [4000, -1000]), { join: 'miter' });
      const round = offsetEnt(e, 500, offsetSide(e, [4000, -1000]), { join: 'round' });
      const bevel = offsetEnt(e, 500, offsetSide(e, [4000, -1000]), { join: 'bevel' });
      return { miter: miter && miter.pts.length, round: round && round.pts.length,
               bevel: bevel && bevel.pts.length };`);
    ok(r.round > r.miter, 'a round join adds vertices for the arc: ' + r.round + ' vs ' + r.miter);
    eq(r.bevel, r.miter + 1, 'a bevel adds exactly one');
  });

  /* OpenSCAD's API decision, and it is the right one: the join style falls out
     of how you asked rather than being a fourth prompt nobody reads. */
  t('the default join is still a mitre, so nothing already drawn changes', () => {
    const r = R(`${SETUP}
      begin();
      const e = addEnt({t:'pline', pts:[[0,0],[3000,0],[3000,3000]], closed:false, layer:'0'});
      commit('p');
      const plain = offsetEnt(e, 500, offsetSide(e, [4000, -1000]));
      const miter = offsetEnt(e, 500, offsetSide(e, [4000, -1000]), { join: 'miter' });
      return { same: JSON.stringify(plain.pts) === JSON.stringify(miter.pts) };`);
    eq(r.same, true, 'an offset with no join asked for is the mitre it always was');
  });

  t('a straight run is untouched by any of it', () => {
    const r = R(`${SETUP}
      begin();
      const e = addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'});
      commit('l');
      const off = offsetEnt(e, 300, offsetSide(e, [2500, 1000]));
      return { a: off.a.map(Math.round), b: off.b.map(Math.round) };`);
    eq(r.a.join(','), '0,300', 'a line offsets to a line');
    eq(r.b.join(','), '5000,300');
  });
};
