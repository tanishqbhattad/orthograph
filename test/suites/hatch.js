'use strict';
/* ============================================================
   B5 — hatch boundaries and island detection

   A room with a column in it is one boundary and one hole.
   Hatching over the column is the difference between a drawing
   and a picture of one.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  const rect = (x0, y0, x1, y1) => addEnt({ t: 'pline', closed: true, layer: '0',
    pts: [[x0,y0],[x1,y0],[x1,y1],[x0,y1]] });
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('island detection');

  t('a shape inside the boundary becomes a hole, not a fill', () => {
    const r = R(`${SETUP}
      begin();
      rect(0, 0, 10000, 8000);              /* the room */
      rect(4000, 3000, 5000, 4000);         /* a column standing in it */
      commit('setup');
      const b = findBoundary([500, 500]);   /* pick in the room, clear of the column */
      return { found: !!b,
               outerArea: b && Math.round(Math.abs(polyArea(b.outer))),
               holes: b ? b.holes.length : 0,
               holeArea: b && b.holes[0] ? Math.round(Math.abs(polyArea(b.holes[0]))) : 0 };`);
    eq(r.found, true, 'the pick finds a boundary');
    eq(r.outerArea, 80000000, 'and it is the room, not the column');
    eq(r.holes, 1, 'the column is picked up as a hole');
    eq(r.holeArea, 1000000, 'of the right size');
  });

  t('picking inside the island hatches the island itself', () => {
    const r = R(`${SETUP}
      begin();
      rect(0, 0, 10000, 8000);
      rect(4000, 3000, 5000, 4000);
      commit('setup');
      const b = findBoundary([4500, 3500]);  /* inside the column */
      return { area: b && Math.round(Math.abs(polyArea(b.outer))), holes: b ? b.holes.length : 0 };`);
    eq(r.area, 1000000, 'the smallest ring containing the pick wins');
    eq(r.holes, 0, 'and it has nothing inside it');
  });

  /* Normal island detection alternates: a duct inside a riser inside a room
     leaves the riser as a hole and the duct filled again. */
  t('nesting alternates rather than punching every ring through', () => {
    const r = R(`${SETUP}
      begin();
      rect(0, 0, 10000, 8000);              /* room  */
      rect(2000, 2000, 6000, 6000);         /* riser */
      rect(3000, 3000, 4000, 4000);         /* duct inside the riser */
      commit('setup');
      const b = findBoundary([500, 500]);
      return { holes: b ? b.holes.length : 0,
               holeArea: b && b.holes[0] ? Math.round(Math.abs(polyArea(b.holes[0]))) : 0 };`);
    eq(r.holes, 1, 'only the first level down is a hole, got ' + r.holes);
    eq(r.holeArea, 16000000, 'and it is the riser, not the duct');
  });

  t('two separate shapes inside are both holes', () => {
    const r = R(`${SETUP}
      begin();
      rect(0, 0, 10000, 8000);
      rect(1000, 1000, 2000, 2000);
      rect(7000, 5000, 8000, 6000);
      commit('setup');
      const b = findBoundary([5000, 4000]);
      return { holes: b ? b.holes.length : 0 };`);
    eq(r.holes, 2, 'both count');
  });

  t('a shape that only overlaps the boundary is not a hole', () => {
    const r = R(`${SETUP}
      begin();
      rect(0, 0, 10000, 8000);
      rect(9000, 7000, 12000, 9000);        /* hangs outside the corner */
      commit('setup');
      const b = findBoundary([5000, 4000]);
      return { holes: b ? b.holes.length : 0 };`);
    eq(r.holes, 0, 'a hole has to be wholly inside');
  });

  group('what is drawn and what is plotted agree');

  /* The canvas has always clipped evenodd. The export drew each loop as its
     own filled path, which paints the hole straight back in — so the screen
     and the paper disagreed about the one thing the hole was there for. */
  t('the exported hatch subtracts its holes', () => {
    const r = R(`${SETUP}
      begin();
      rect(0, 0, 10000, 8000);
      rect(4000, 3000, 5000, 4000);
      commit('setup');
      const b = findBoundary([500, 500]);
      addEnt({ t: 'hatch', loops: [b.outer, ...b.holes], solid: true,
               pattern: 'solid', layer: '0' });
      const svg = exportSVG();
      const paths = (svg.match(/<path[^>]*>/g) || []).filter(p => /fill-rule/.test(p));
      const filled = (svg.match(/<path[^>]*>/g) || []).filter(p => /fill="#[0-9a-f]{6}55"/i.test(p));
      return { hasRule: paths.length, subpaths: (paths[0] || '').split('M').length - 1,
               filledPaths: filled.length };`);
    eq(r.hasRule, 1, 'the hatch is one path carrying an even-odd rule');
    eq(r.subpaths, 2, 'with a subpath per loop, so the hole is subtracted');
    eq(r.filledPaths, 1, 'and the hole is not painted back in as a second fill');
  });

  t('a hatch with no holes still exports as before', () => {
    const r = R(`${SETUP}
      begin(); rect(0, 0, 5000, 4000); commit('setup');
      const b = findBoundary([100, 100]);
      addEnt({ t: 'hatch', loops: [b.outer], solid: true, pattern: 'solid', layer: '0' });
      const svg = exportSVG();
      const p = (svg.match(/<path[^>]*fill-rule[^>]*>/g) || [])[0] || '';
      return { subpaths: p.split('M').length - 1, has: !!p };`);
    eq(r.has, true); eq(r.subpaths, 1, 'one loop, one subpath');
  });

  group('the hatch renderer is actually reached');

  /* hatch is registered in GEOM, and drawEnt tested GEOM FIRST, so every hatch
     fell through to the generic shape path: it drew its loops as outlines and
     never filled or patterned anything. drawHatch was dead code. The DXF
     writer already carried an explicit `&& e.t !== 'hatch'` guard against the
     same collision, which is the shape of a bug worked around twice and fixed
     neither time. Nothing failed, because nothing tested what was on screen. */
  t('drawing a hatch calls the hatch renderer, not the generic one', () => {
    const r = R(`${SETUP}
      begin();
      rect(0, 0, 8000, 6000);
      rect(3000, 2000, 4000, 3000);
      const b0 = findBoundary([200, 200]);
      addEnt({ t: 'hatch', loops: [b0.outer, ...b0.holes], solid: false,
               pattern: 'line', sp: 300, hatchAng: 45, layer: '0' });
      commit('setup');
      fit();
      const realHatch = drawHatch, realShapes = drawShapes;
      let hatchCalls = 0, shapeCalls = 0;
      drawHatch = function (...a) { hatchCalls++; return realHatch.apply(null, a); };
      drawShapes = function (e, ...a) {
        if (e && e.t === 'hatch') shapeCalls++;
        return realShapes.apply(null, [e, ...a]);
      };
      try { paint(); } finally { drawHatch = realHatch; drawShapes = realShapes; }
      return { hatchCalls, shapeCalls, isGeom: !!GEOM['hatch'] };`);
    eq(r.isGeom, true, 'hatch really is a GEOM type, which is what makes the order matter');
    ok(r.hatchCalls > 0, 'the hatch renderer must be reached, got ' + r.hatchCalls + ' calls');
    eq(r.shapeCalls, 0, 'and the generic shape path must not claim it');
  });
};
