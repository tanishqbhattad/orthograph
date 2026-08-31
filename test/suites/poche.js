'use strict';
/* ============================================================
   Poche that says what the wall is made of

   A cavity wall is a brick leaf, a cavity, a block leaf and a
   skim. The type has carried those layers since compound walls
   landed, and the plan drew the lines between them — but the
   fill behind the lines was one flat tone for the whole wall,
   so a 300mm cavity wall and 300mm of solid concrete were the
   same grey. The layer lines said there was a difference and the
   drawing did not show one.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
  const quadArea = (q) => Math.abs(polyArea(q));
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('a compound wall is poched by layer');

  t('one band per layer, each knowing its material', () => {
    const r = R(`${SETUP}
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'cav300', layer:'A-WALL'});
      commit('w');
      const bands = shapes(w, 32).filter(s => s.role === 'poche');
      const stack = wallLayerStack(w);
      return { bands: bands.length, layers: stack.length,
               mats: bands.map(b => b.mat || '(none)'),
               want: stack.map(l => l.fill) };`);
    eq(r.bands, r.layers, 'one band per layer, got ' + r.bands + ' for ' + r.layers);
    eq(r.mats.join(','), r.want.join(','),
      'in order, each named for what it is: ' + r.mats.join(', '));
  });

  /* Bands that do not tile leave hairlines of background through the wall, or
     paint over each other and make the tones wrong. */
  t('the bands tile the wall exactly — no gaps, no overlaps', () => {
    const r = R(`${SETUP}
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'cav300', layer:'A-WALL'});
      commit('w');
      const bands = shapes(w, 32).filter(s => s.role === 'poche');
      const total = bands.reduce((a, b) => a + quadArea(b.pts), 0);
      const whole = quadArea(wallOutline(w));
      const stack = wallLayerStack(w);
      /* each band should be as thick as its layer */
      const thick = bands.map(b => quadArea(b.pts) / 6000);
      return { total, whole, thick: thick.map(x => Math.round(x * 10) / 10),
               want: stack.map(l => Math.round(l.t * 10) / 10) };`);
    close(r.total, r.whole, 10,
      'the bands add up to the wall: ' + Math.round(r.total) + ' vs ' + Math.round(r.whole));
    eq(r.thick.join(','), r.want.join(','),
      'and each is its own layer thickness: ' + r.thick.join(', '));
  });

  t('a plain wall is still one plain fill', () => {
    const r = R(`${SETUP}
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'gen100', layer:'A-WALL'});
      commit('w');
      const bands = shapes(w, 32).filter(s => s.role === 'poche');
      return { bands: bands.length, area: Math.round(quadArea(bands[0].pts)),
               whole: Math.round(quadArea(wallOutline(w))),
               mat: bands[0].mat || null };`);
    eq(r.bands, 1, 'a wall with no layers has nothing to split');
    eq(r.mat, null, 'and no material to claim');
    close(r.area, r.whole, 10, 'covering the whole wall');
  });

  t('the bands are mitred with the wall, not left square at a corner', () => {
    const r = R(`${SETUP}
      begin();
      const a = addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'cav300', layer:'A-WALL'});
      addEnt({t:'wall', a:[6000,0], b:[6000,5000], wt:'cav300', layer:'A-WALL'});
      commit('w');
      const bands = shapes(a, 32).filter(s => s.role === 'poche');
      const total = bands.reduce((x, b) => x + quadArea(b.pts), 0);
      return { total, whole: quadArea(wallOutline(a)) };`);
    close(r.total, r.whole, 50,
      'the mitred wall is still exactly covered: ' + Math.round(r.total) + ' vs ' + Math.round(r.whole));
  });

  group('the tones differ');

  t('each material gets its own weight of fill', () => {
    const r = R(`${SETUP}
      const mats = ['brick', 'block', 'insulation', 'finish'];
      const tones = mats.map(m => pocheTone(m));
      return { tones, plain: pocheTone(null), unknown: pocheTone('nonsense') };`);
    ok(r.tones.every(x => typeof x === 'number' && x > 0), 'every material has a tone');
    eq(new Set(r.tones).size, r.tones.length,
      'and they are actually different: ' + r.tones.join(', '));
    ok(r.tones[0] > r.tones[2], 'brick reads heavier than insulation');
    eq(r.plain, 1, 'a wall with no layers is left exactly as it was');
    eq(r.unknown, 1, 'and a material nobody has defined is not invented');
  });

  t('the fill really is painted differently per band', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'cav300', layer:'A-WALL'});
      commit('w');
      fit();
      const c = document.getElementById('cv').getContext('2d');
      c.__trace.calls.length = 0;
      paint();
      /* the style standing at each fill, which is what the wall was painted in */
      const fills = c.__trace.calls.filter(x => x[0] === 'fill').map(x => String(x[1]));
      /* The weight of a band is its SHADE now, not its transparency: the fill
         is solid, so brick and insulation differ by colour. */
      return { fills: fills.length, tones: [...new Set(fills)].length,
               sample: [...new Set(fills)].join(','),
               washed: fills.filter(x => x.length > 7).length };`);
    ok(r.fills >= 4, 'four bands are four fills, got ' + r.fills);
    ok(r.tones >= 3,
      'and painted at different weights, got ' + r.tones + ' distinct: ' + r.sample);
    eq(r.washed, 0, 'none of them see-through: ' + r.sample);
  });
};
