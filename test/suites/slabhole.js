'use strict';
/* ============================================================
   Openings through slabs, and stairs in section

   A stairwell is a hole in a floor. Without one the slab runs
   straight across the void, the section shows a continuous
   floor where the stair comes through it, and the drawing says
   the building has no way up.

   The stair itself was drawn in plan and nowhere else. A section
   through a stairwell showed the walls, the floors and a gap.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL'); ensureLayer('A-FLOR');
  /* a 12m x 8m slab with a 3m x 2m stairwell in the middle of it */
  const slabWithHole = () => { begin();
    const f = addEnt({t:'floor', pts:[[0,0],[12000,0],[12000,8000],[0,8000]],
                      th:200, layer:'A-FLOR'});
    f.holes = [[[4000,3000],[7000,3000],[7000,5000],[4000,5000]]];
    commit('f'); return f; };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('a hole in a slab');

  t('is drawn, and the slab still is too', () => {
    const r = R(`${SETUP}
      const f = slabWithHole();
      const sh = shapes(f, 32);
      const rings = sh.filter(s => s.closed && s.pts);
      const poche = sh.find(s => s.role === 'poche');
      return { rings: rings.length, holeDrawn: rings.some(s => s.pts.length === 4 &&
                 s.pts.some(p => p[0] === 4000 && p[1] === 3000)),
               pocheHasHoles: !!(poche && poche.holes && poche.holes.length) };`);
    ok(r.rings >= 2, 'the outline and the hole are both drawn, got ' + r.rings);
    eq(r.holeDrawn, true, 'the hole ring is there');
    eq(r.pocheHasHoles, true, 'and the fill knows to leave it out');
  });

  t('is not part of the slab: you cannot pick the floor through the void', () => {
    const r = R(`${SETUP}
      const f = slabWithHole();
      return { onSlab: entDist([1000,1000], f), inHole: entDist([5500,4000], f),
               onEdgeOfHole: entDist([4000,3000], f) };`);
    eq(r.onSlab, 0, 'a point on the slab hits it');
    ok(r.inHole > 0, 'a point in the void does not, got ' + r.inHole);
    close(r.onEdgeOfHole, 0, 1, 'the rim of the hole is still the slab');
  });

  t('comes off the area', () => {
    const r = R(`${SETUP}
      const f = slabWithHole();
      const withHole = entArea(f);
      f.holes = [];
      return { withHole, solid: entArea(f) };`);
    close(r.solid, 96e6, 1e3, 'a 12x8 slab is 96 square metres');
    close(r.withHole, 96e6 - 6e6, 1e3, 'less the 3x2 stairwell, got ' + Math.round(r.withHole / 1e6));
  });

  t('survives being saved and reopened', () => {
    const r = R(`${SETUP}
      slabWithHole();
      loadNative(saveNative());
      const f = [...DOC.ents.values()].find(e => e.t === 'floor');
      return { holes: f && f.holes ? f.holes.length : 0,
               ring: f && f.holes && f.holes[0] ? f.holes[0].length : 0 };`);
    eq(r.holes, 1, 'the hole is in the project file');
    eq(r.ring, 4, 'with its four corners');
  });

  t('moves with the slab', () => {
    const r = R(`${SETUP}
      const f = slabWithHole();
      begin(); xf(f, p => [p[0] + 1000, p[1] + 500]); commit('m');
      return { hole0: f.holes[0][0], out0: f.pts[0] };`);
    eq(r.hole0.join(','), '5000,3500', 'the hole went with it');
    eq(r.out0.join(','), '1000,500', 'as did the outline');
  });

  group('a section through the void');

  t('shows a gap in the floor where the stairwell is', () => {
    const r = R(`${SETUP}
      const f = slabWithHole();
      begin();
      const sec = addEnt({t:'section', a:[-1000,4000], b:[13000,4000], look:1,
                          depth:20000, layer:'A-SECT'});
      commit('s');
      const F = sectionFrame(sec);
      const spans = slabCrossing(sec, F, f);
      f.holes = [];
      const solid = slabCrossing(sec, F, f);
      return { spans: spans ? spans.map(s => s.map(Math.round)) : null,
               solid: solid ? solid.length : 0 };`);
    eq(r.solid, 1, 'a solid slab is one continuous span');
    ok(r.spans && r.spans.length === 2,
      'the slab with the void is two, got ' + JSON.stringify(r.spans));
    ok(r.spans && r.spans[0][1] < r.spans[1][0], 'with the gap between them');
  });

  group('cutting one');

  t('SLABHOLE cuts the corners you pick', () => {
    const r = R(`${SETUP}
      begin();
      const f = addEnt({t:'floor', pts:[[0,0],[12000,0],[12000,8000],[0,8000]],
                        th:200, layer:'A-FLOR'});
      commit('f');
      cancelCmd(); startCmd('slabhole');
      cmdPoint([4000,3000]); cmdPoint([7000,3000]); cmdPoint([7000,5000]); cmdPoint([4000,5000]);
      cmdEnter();
      return { holes: (f.holes || []).length,
               area: Math.round(entArea(f) / 1e6),
               corners: f.holes && f.holes[0] ? f.holes[0].length : 0 };`);
    eq(r.holes, 1, 'one void');
    eq(r.corners, 4, 'with the four corners picked');
    eq(r.area, 90, 'and 6 of the 96 square metres gone');
  });

  /* A void outside the slab is not a void in it, and silently accepting one
     would leave a ring drawn in space that nothing can explain. */
  t('an opening outside the slab is refused, not accepted', () => {
    const r = R(`${SETUP}
      begin();
      const f = addEnt({t:'floor', pts:[[0,0],[4000,0],[4000,4000],[0,4000]],
                        th:200, layer:'A-FLOR'});
      commit('f');
      const okIn = cutSlabHole(f, [[1000,1000],[2000,1000],[2000,2000],[1000,2000]]);
      const okOut = cutSlabHole(f, [[9000,9000],[10000,9000],[10000,10000],[9000,10000]]);
      return { okIn, okOut, holes: (f.holes || []).length };`);
    eq(r.okIn, true, 'one inside is cut');
    eq(r.okOut, false, 'one outside is refused');
    eq(r.holes, 1, 'and only the good one is there');
  });

  t('undo puts the floor back', () => {
    const r = R(`${SETUP}
      const f = slabWithHole();
      begin(); mut(f); f.holes = (f.holes || []).concat([[[1000,1000],[2000,1000],[2000,2000]]]);
      commit('second');
      const two = f.holes.length;
      undo();
      const back = [...DOC.ents.values()].find(e => e.t === 'floor');
      return { two, after: (back.holes || []).length };`);
    eq(r.two, 2, 'two voids were cut');
    eq(r.after, 1, 'and undo leaves one');
  });

  group('stairs in section');

  t('a stair crossing the section is drawn, stepping up', () => {
    const r = R(`${SETUP}
      begin();
      const st = addEnt({t:'stair', a:[2000,4000], b:[6000,4000], w:1000,
                         kind:'straight', layer:'A-FLOR'});
      const sec = addEnt({t:'section', a:[0,3000], b:[12000,3000], look:1,
                          depth:20000, layer:'A-SECT'});
      commit('s');
      const G = sectionGeometry(sec);
      const steps = G.parts.filter(p => p.kind === 'stair');
      const C = stairCalc(st);
      const pts = steps.length ? steps[0].pts : [];
      const ys = [...new Set(pts.map(q => Math.round(q[1])))].sort((a, b) => a - b);
      /* every tread should sit one rise above the one before it */
      const gaps = ys.slice(1).map((y, i) => y - ys[i]);
      /* and the profile should march across as it climbs, not stack in place */
      const climb = pts.slice(1).every((q, i) => q[0] >= pts[i][0] - 1 || q[1] < pts[i][1]);
      return { n: steps.length, risers: C.risers, levels: ys.length,
               hi: ys[ys.length - 1], top: Math.round(C.risers * C.rise),
               evenRise: gaps.length ? Math.max(...gaps) - Math.min(...gaps) : -1,
               rise: Math.round(C.rise), climb,
               x0: Math.round(pts[0][0]), xEnd: Math.round(pts[pts.length - 1][0]) };`);
    ok(r.n > 0, 'the stair reaches the section at all');
    close(r.hi, r.top, 2, 'and climbs to the top of the flight, got ' + r.hi + ' want ' + r.top);
    eq(r.levels, r.risers + 1, 'one tread per riser plus the floor it leaves, got ' + r.levels);
    ok(r.evenRise <= 2, 'the risers are equal, worst difference ' + r.evenRise + 'mm');
    eq(r.climb, true, 'and it goes up as it goes along, rather than stacking in place');
    close(r.x0, 2000, 2, 'starting where the stair starts');
    close(r.xEnd, 6000, 2, 'and ending where it ends');
  });

  t('a placed section draws the stair as a profile, not as one line', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'stair', a:[2000,4000], b:[6000,4000], w:1000, kind:'straight', layer:'A-FLOR'});
      addEnt({t:'wall', a:[0,1000], b:[12000,1000], wt:'cav300', layer:'A-WALL'});
      const sec = addEnt({t:'section', a:[0,3000], b:[12000,3000], look:1,
                          depth:20000, layer:'A-SECT'});
      commit('s');
      const before = DOC.ents.size;
      placeSection(sec, [0, -30000]);
      const made = [...DOC.ents.values()].filter(e => e.t === 'pline' && e.closed);
      const big = made.filter(e => e.pts.length > 6);
      return { grew: DOC.ents.size > before, plines: made.length,
               profilePts: big.length ? Math.max(...big.map(e => e.pts.length)) : 0 };`);
    eq(r.grew, true, 'the section was placed');
    ok(r.profilePts > 6,
      'the stair went in as a stepped profile, longest closed pline has ' + r.profilePts + ' points');
  });

  t('a stair nowhere near the section is not in it', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'stair', a:[2000,60000], b:[6000,60000], w:1000, kind:'straight', layer:'A-FLOR'});
      const sec = addEnt({t:'section', a:[0,3000], b:[12000,3000], look:1,
                          depth:20000, layer:'A-SECT'});
      commit('s');
      return { n: sectionGeometry(sec).parts.filter(p => p.kind === 'stair').length };`);
    eq(r.n, 0, 'nothing beyond the view depth is drawn');
  });
};
