'use strict';
/* ============================================================
   C5 — floors and roofs

   Columns, stairs and rooms existed; the horizontal parts of a
   building did not. A floor is the thing every storey stands on,
   and the thing that turns a section from a row of posts into a
   building.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-SECT', '#ff9f5c'); ensureLayer('A-FLOR', '#8fa3b8'); ensureLayer('A-ROOF', '#c99a6b');
  const RING = [[0,0],[10000,0],[10000,6000],[0,6000]];
  const cutLine = () => { begin();
    const s = addEnt({t:'section', a:[-1500,3000], b:[11500,3000], dir:1, label:'A', layer:'A-SECT'});
    commit('sec'); return s; };
  const slabsOf = (G) => G.parts.filter(p => p.kind === 'slab').map(p => {
    const xs = p.pts.map(q => q[0]), ys = p.pts.map(q => q[1]);
    return { lo: Math.round(Math.min(...ys)), hi: Math.round(Math.max(...ys)),
             from: Math.round(Math.min(...xs)), to: Math.round(Math.max(...xs)) };
  }).sort((a, b) => a.lo - b.lo);
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('a slab hangs below its storey');

  /* The top of a floor is the surface you stand on and the height everything
     else is measured from, so the slab hangs BELOW the level line rather than
     sitting on top of it. */
  t('a floor cut in section sits under its level', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'floor', pts:RING, th:200, lvl:0, top:0, layer:'A-FLOR'}); commit('f');
      const slabs = slabsOf(sectionGeometry(cutLine()));
      return { slabs };`);
    eq(r.slabs.length, 1, 'the section crosses it once');
    eq(r.slabs[0].lo + '..' + r.slabs[0].hi, '-200..0',
      'the top is at the level and the slab hangs below, got ' +
      r.slabs[0].lo + '..' + r.slabs[0].hi);
  });

  t('a slab takes its datum from its storey when it is not given one', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'floor', pts:RING, th:250, lvl:1, layer:'A-FLOR'});   /* no top given */
      commit('f');
      const slabs = slabsOf(sectionGeometry(cutLine()));
      return { slabs, levelElev: levelElev(1) };`);
    eq(r.levelElev, 3000);
    eq(r.slabs[0].lo + '..' + r.slabs[0].hi, '2750..3000',
      'it follows the storey it belongs to');
  });

  t('a section only spans the part of the slab it crosses', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'floor', pts:[[2000,0],[8000,0],[8000,6000],[2000,6000]],
              th:200, lvl:0, top:0, layer:'A-FLOR'});
      commit('f');
      const s = slabsOf(sectionGeometry(cutLine()))[0];
      return { from: s.from, to: s.to };`);
    /* the section line starts at -1500, so the slab's own edges decide */
    eq(r.from, 3500, 'it starts where the slab does, got ' + r.from);
    eq(r.to, 9500, 'and ends where it does');
  });

  group('roofs');

  t('a pitched roof rises along its fall', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'roof', pts:RING, th:250, lvl:1, top:6000,
              pitch: rad(18), dir: 0, eaves: [0,0], layer:'A-ROOF'});
      commit('r');
      const s = slabsOf(sectionGeometry(cutLine()))[0];
      const run = 10000;
      return { lo: s.lo, hi: s.hi, want: Math.round(6000 + run * Math.tan(rad(18))) };`);
    /* the low end is the eaves less the thickness, the high end is the ridge */
    close(r.lo, 5750, 1, 'the eaves end sits at the datum, got ' + r.lo);
    close(r.hi, r.want, 2,
      'and it rises run x tan(pitch), got ' + r.hi + ' want ' + r.want);
  });

  t('a flat roof is a slab like any other', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'roof', pts:RING, th:250, lvl:1, top:6000, pitch:0, layer:'A-ROOF'});
      commit('r');
      const s = slabsOf(sectionGeometry(cutLine()))[0];
      return { lo: s.lo, hi: s.hi };`);
    eq(r.lo + '..' + r.hi, '5750..6000', 'no pitch, no rise');
  });

  t('a roof shows which way it falls, and how steeply', () => {
    const r = R(`${SETUP}
      begin();
      const rf = addEnt({t:'roof', pts:RING, th:250, lvl:1, top:6000,
                         pitch: rad(30), dir: 0, eaves: [0,0], layer:'A-ROOF'});
      commit('r');
      const sh = shapes(rf, 32);
      return { hasArrow: sh.some(s => s.role === 'arrowhead'),
               label: (sh.find(s => s.text != null) || {}).text,
               outline: sh.filter(s => s.closed && s.role === 'face').length };`);
    eq(r.hasArrow, true, 'the fall arrow is drawn');
    eq(r.label, '30°', 'with the pitch beside it');
    eq(r.outline, 1, 'and the roof outline');
  });

  group('slabs behave like the rest of the drawing');

  t('a floor is picked inside its outline, moved and gripped', () => {
    const r = R(`${SETUP}
      begin();
      const f = addEnt({t:'floor', pts:RING, th:200, lvl:0, top:0, layer:'A-FLOR'});
      commit('f');
      const inside = pickAt([5000, 3000], 5);
      const outside = pickAt([-4000, 3000], 5);
      const grips = gripsOf(f).length;
      begin(); xf(f, T.move([1000, 500])); commit('mv');
      return { inside: !!inside && inside.id === f.id, outside: outside === null,
               grips, moved: f.pts[0].map(Math.round) };`);
    eq(r.inside, true, 'clicking inside the slab selects it');
    eq(r.outside, true, 'and outside it does not');
    eq(r.grips, 4, 'one grip per corner');
    eq(r.moved.join(','), '1000,500', 'and it moves');
  });

  /* A section is a cut through the whole building. Using visible() — which
     answers for the current STOREY — showed one storey and a floating roof. */
  t('every storey is cut, whichever one is current', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'floor', pts:RING, th:200, lvl:0, top:0, layer:'A-FLOR'});
      addEnt({t:'floor', pts:RING, th:250, lvl:1, top:3000, layer:'A-FLOR'});
      addEnt({t:'roof',  pts:RING, th:250, lvl:1, top:6000, pitch:0, layer:'A-ROOF'});
      commit('b');
      const onGround = slabsOf(sectionGeometry(cutLine())).map(s => s.lo + '..' + s.hi);
      gotoLevel(1);
      const onFirst = slabsOf(sectionGeometry(cutLine())).map(s => s.lo + '..' + s.hi);
      return { onGround, onFirst };`);
    eq(r.onGround.join(','), '-200..0,2750..3000,5750..6000',
      'all three from the ground floor, got ' + r.onGround.join(','));
    eq(r.onFirst.join(','), r.onGround.join(','),
      'and the same from upstairs — a section is not storey-specific');
  });
};
