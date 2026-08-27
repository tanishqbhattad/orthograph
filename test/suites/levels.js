'use strict';
/* ============================================================
   C3 — levels

   A plan is a drawing of one storey. The model has always had
   levels, and walls have always mitred only against walls on
   their own — but every level drew at once and there was no way
   to change which one you were drawing on, so the second storey
   was unreachable.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  VS.underlay = 0;
  const W = (a, b, o) => addEnt(Object.assign({ t:'wall', a, b, wt:'gen100', layer:'A-WALL' }, o || {}));
  const all = () => [...DOC.ents.values()];
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('a drawing belongs to a storey');

  t('everything drawn is stamped with the level it was drawn on', () => {
    const r = R(`${SETUP}
      begin(); W([0,0],[5000,0]); commit('g');
      const ground = all().map(e => e.lvl);
      gotoLevel(1);
      begin(); W([0,2000],[5000,2000]); commit('f');
      return { ground, all: all().map(e => e.lvl), cur: DOC.curLevel };`);
    eq(r.ground.join(','), '0', 'the ground floor is level 0');
    eq(r.all.join(','), '0,1', 'and what came after is on the level in force');
    eq(r.cur, 1);
  });

  t('only the current storey is drawn', () => {
    const r = R(`${SETUP}
      begin(); W([0,0],[5000,0]); W([0,1000],[5000,1000]); commit('g');
      gotoLevel(1);
      begin(); W([0,2000],[5000,2000]); commit('f');
      const onFirst = all().filter(visible).length;
      gotoLevel(0);
      const onGround = all().filter(visible).length;
      return { onFirst, onGround, total: DOC.ents.size };`);
    eq(r.total, 3);
    eq(r.onFirst, 1, 'the first floor shows its own wall only');
    eq(r.onGround, 2, 'and the ground floor shows its two');
  });

  /* An underlay is there to be traced over. Making it selectable would mean
     grabbing the storey below every time you clicked near it. */
  t('the underlay is visible but not selectable', () => {
    const r = R(`${SETUP}
      begin(); W([0,0],[5000,0]); commit('g');
      gotoLevel(1);
      begin(); W([0,2000],[5000,2000]); commit('f');
      const off = { vis: all().filter(visible).length, pick: all().filter(pickable).length };
      VS.underlay = 1;
      const on = { vis: all().filter(visible).length, pick: all().filter(pickable).length };
      const ghosted = all().filter(isUnderlay).length;
      VS.underlay = 0;
      return { off, on, ghosted };`);
    eq(r.off.vis, 1, 'with the underlay off only this storey shows');
    eq(r.on.vis, 2, 'with it on the storey below shows too');
    eq(r.on.pick, 1, 'but only this storey can be picked');
    eq(r.ghosted, 1, 'and exactly one entity is being underlaid');
  });

  t('the underlay is the storey below, not any other', () => {
    const r = R(`${SETUP}
      begin(); W([0,0],[5000,0]); commit('g');       /* level 0 */
      gotoLevel(1);
      begin(); W([0,1000],[5000,1000]); commit('1');
      const two = addLevel('Level 2');
      gotoLevel(two.id);
      begin(); W([0,2000],[5000,2000]); commit('2');
      VS.underlay = 1;
      const under = all().filter(isUnderlay).map(e => e.lvl);
      const vis = all().filter(visible).map(e => e.lvl).sort();
      VS.underlay = 0;
      return { under, vis, below: levelBelow().id };`);
    eq(r.below, 1, 'from level 2 the storey below is level 1');
    eq(r.under.join(','), '1', 'so only level 1 is underlaid');
    eq(r.vis.join(','), '1,2', 'and the ground floor stays out of it');
  });

  group('moving between storeys');

  t('LEVELUP and LEVELDOWN walk the storeys in elevation order', () => {
    const r = R(`${SETUP}
      addLevel('Level 2');
      const seq = [];
      gotoLevel(0); seq.push(DOC.curLevel);
      META.levelup.fn(); seq.push(DOC.curLevel);
      META.levelup.fn(); seq.push(DOC.curLevel);
      META.levelup.fn(); seq.push(DOC.curLevel);   /* already at the top */
      META.leveldown.fn(); seq.push(DOC.curLevel);
      META.leveldown.fn(); seq.push(DOC.curLevel);
      META.leveldown.fn(); seq.push(DOC.curLevel); /* already at the bottom */
      return { seq };`);
    eq(r.seq.join(','), '0,1,2,2,1,0,0',
      'it stops at the ends rather than wrapping, got ' + r.seq.join(','));
  });

  t('a new level goes above the top one, spaced by its own height', () => {
    const r = R(`${SETUP}
      const ls0 = DOC.levels.length;
      const rec = addLevel();
      return { added: DOC.levels.length - ls0, elev: rec.elev, id: rec.id,
               top: levelsSorted()[DOC.levels.length - 1].id };`);
    eq(r.added, 1);
    eq(r.elev, 6000, 'stacked on the 3000 storey below it, got ' + r.elev);
    eq(r.top, r.id, 'and it is the new top');
  });

  /* Entities remember their level by id. Reusing an id would silently move
     everything that referenced the old one. */
  t('level ids are never reused', () => {
    const r = R(`${SETUP}
      const a = addLevel('A');
      DOC.levels = DOC.levels.filter(l => l.id !== a.id);   /* delete it */
      const b = addLevel('B');
      return { a: a.id, b: b.id };`);
    ok(r.b > r.a, 'a new level takes a fresh id, got ' + r.b + ' after ' + r.a);
  });

  /* B6 taught this the hard way: the draw path keeps its own fast copy of the
     visibility rule, and when it fell behind, frozen layers went on drawing. */
  t('the draw path agrees with visible() about levels too', () => {
    const r = R(`${SETUP}
      begin(); W([0,0],[5000,0]); commit('g');
      gotoLevel(1);
      begin(); W([0,2000],[5000,2000]); commit('f');
      frameLayers();
      const bad = [];
      for (const under of [0, 1]) {
        VS.underlay = under;
        for (const lvl of [0, 1]) {
          DOC.curLevel = lvl;
          for (const e of all())
            if (visible(e) !== fvis(e)) bad.push('lvl' + lvl + ' under' + under + ' ent' + e.id);
        }
      }
      VS.underlay = 0;
      return { bad };`);
    eq(r.bad.length, 0, 'they disagreed on: ' + r.bad.slice(0, 4).join('; '));
  });
};
