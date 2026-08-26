'use strict';
/* ============================================================
   B6 — layers: off, frozen and non-plotting are three different
   things, and the tools that make a busy drawing workable.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL'); ensureLayer('A-GRID'); ensureLayer('X-NOTE');
  DOC.cur = '0';
  addEnt({t:'line', a:[0,0], b:[1000,0], layer:'A-WALL'});
  addEnt({t:'line', a:[0,500], b:[9000,500], layer:'A-GRID'});
  addEnt({t:'line', a:[0,1000], b:[500,1000], layer:'X-NOTE'});
  const L = n => DOC.layers.find(l => l.name === n);
  const all = () => [...DOC.ents.values()];
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('off, frozen and non-plotting are three different things');

  /* The practical difference between off and frozen is the extents, and it is
     the reason both exist: an off layer is hidden but still part of how big the
     drawing is, a frozen one is not there at all. */
  t('an off layer still counts towards the extents; a frozen one does not', () => {
    const r = R(`${SETUP}
      L('A-GRID').on = false;
      const off = { vis: all().filter(visible).length,
                    ext: all().filter(inExtents).length,
                    w: Math.round(bboxAll(all().filter(inExtents))[2]) };
      L('A-GRID').on = true; L('A-GRID').frozen = true;
      const froz = { vis: all().filter(visible).length,
                     ext: all().filter(inExtents).length,
                     w: Math.round(bboxAll(all().filter(inExtents))[2]) };
      return { off, froz };`);
    eq(r.off.vis, 2, 'an off layer is not drawn');
    eq(r.off.ext, 3, 'but it is still counted');
    eq(r.off.w, 9000, 'so the extents still reach the 9m grid line');
    eq(r.froz.vis, 2, 'a frozen layer is not drawn either');
    eq(r.froz.ext, 2, 'and is left out of the count');
    eq(r.froz.w, 1000, 'so the extents shrink to the wall, got ' + r.froz.w);
  });

  t('a non-plotting layer is on screen and absent from the paper', () => {
    const r = R(`${SETUP}
      L('X-NOTE').plot = false;
      const counts = { vis: all().filter(visible).length,
                       plot: all().filter(plottable).length };
      /* and the plot itself must not carry it */
      const note = all().find(e => e.layer === 'X-NOTE');
      const svgOff = exportSVG();
      L('X-NOTE').plot = true;
      const svgOn = exportSVG();
      return { counts,
               strokesOff: (svgOff.match(/<path|<line/g) || []).length,
               strokesOn: (svgOn.match(/<path|<line/g) || []).length };`);
    eq(r.counts.vis, 3, 'it is still drawn on screen');
    eq(r.counts.plot, 2, 'and left out of the plot');
    ok(r.strokesOn > r.strokesOff,
      'the exported drawing must actually lose it: ' + r.strokesOn + ' vs ' + r.strokesOff);
  });

  t('a frozen layer cannot be drawn on or picked', () => {
    const r = R(`${SETUP}
      L('A-WALL').frozen = true;
      const wall = all().find(e => e.layer === 'A-WALL');
      const picked = pickAt(wall.a, 20);
      const canPick = !!picked && picked.layer === 'A-WALL';
      L('A-WALL').lock = true; L('A-WALL').frozen = false;
      const lockedPick = pickAt(wall.a, 20);
      return { canPick, pickableWhenFrozen: pickable(wall),
               pickableWhenLocked: (L('A-WALL').frozen = false, pickable(wall)) };`);
    eq(r.canPick, false, 'a frozen layer must not be pickable');
    eq(r.pickableWhenFrozen, false);
    eq(r.pickableWhenLocked, false, 'and a locked one is visible but not pickable');
  });

  group('the layer tools a busy drawing needs');

  /* Putting it back is the whole trick. Unisolating must restore what was on
     and off before, not turn everything on and destroy the setup you had. */
  t('LAYISO hides the rest, LAYUNISO restores exactly what was there', () => {
    const r = R(`${SETUP}
      L('X-NOTE').on = false;              /* already off before isolating */
      cancelCmd();
      startCmd('layiso');
      cmdPoint([500, 0]);                   /* pick the wall */
      cmdEnter();
      const iso = DOC.layers.filter(l => l.on).map(l => l.name);
      const curDuring = DOC.cur;
      META.layuniso.fn();
      const backOn = DOC.layers.filter(l => l.on).map(l => l.name).sort();
      const noteAfter = L('X-NOTE').on;
      return { iso, curDuring, backOn, noteAfter, total: DOC.layers.length };`);
    eq(r.iso.join(','), 'A-WALL', 'only the picked layer stays on');
    eq(r.curDuring, 'A-WALL', 'and the current layer moves to one you can see');
    eq(r.noteAfter, false,
      'a layer that was off before isolating must still be off afterwards');
    eq(r.backOn.length, r.total - 1, 'everything else comes back');
  });

  t('LAYOFF and LAYFRZ refuse to touch the current layer', () => {
    const r = R(`${SETUP}
      DOC.cur = 'A-WALL';
      cancelCmd();
      startCmd('layoff'); cmdPoint([500, 0]); endCmd(true);
      const stillOn = L('A-WALL').on;
      startCmd('layfrz'); cmdPoint([500, 0]); endCmd(true);
      const stillThawed = !L('A-WALL').frozen;
      /* but another layer goes off happily */
      startCmd('layoff'); cmdPoint([500, 500]); endCmd(true);
      return { stillOn, stillThawed, gridOff: !L('A-GRID').on };`);
    eq(r.stillOn, true, 'you cannot hide the layer you are drawing on');
    eq(r.stillThawed, true, 'nor freeze it');
    eq(r.gridOff, true, 'but another layer goes off');
  });

  t('LAYMCUR makes the picked layer current, unless it is frozen', () => {
    const r = R(`${SETUP}
      cancelCmd();
      startCmd('laymcur'); cmdPoint([500, 500]); endCmd(true);
      const afterPick = DOC.cur;
      L('X-NOTE').frozen = true;
      startCmd('laymcur'); cmdPoint([250, 1000]); endCmd(true);
      return { afterPick, afterFrozen: DOC.cur };`);
    eq(r.afterPick, 'A-GRID', 'pointing at the grid makes it current');
    eq(r.afterFrozen, 'A-GRID', 'and a frozen layer is refused rather than made current');
  });

  group('named layer states');

  /* A drawing has moods: everything on for coordination, structure only for a
     frame plan. Saving those by name beats rebuilding them by hand. */
  t('a layer state saves and restores on, frozen, lock and colour', () => {
    const r = R(`${SETUP}
      L('A-WALL').on = false;
      L('A-GRID').frozen = true;
      L('X-NOTE').lock = true;
      L('X-NOTE').color = '#ff0000';
      saveLayerState('Structure only');
      /* put everything back the other way */
      L('A-WALL').on = true; L('A-GRID').frozen = false;
      L('X-NOTE').lock = false; L('X-NOTE').color = '#00ff00';
      const before = { wall: L('A-WALL').on, grid: L('A-GRID').frozen,
                       lock: L('X-NOTE').lock, col: L('X-NOTE').color };
      const ok1 = restoreLayerState('structure ONLY');   /* case insensitive */
      const after = { wall: L('A-WALL').on, grid: L('A-GRID').frozen,
                      lock: L('X-NOTE').lock, col: L('X-NOTE').color };
      const ok2 = restoreLayerState('no such state');
      return { ok1, ok2, before, after, names: layerStates().map(s => s.name) };`);
    eq(r.ok1, true); eq(r.ok2, false, 'an unknown state is refused, not guessed at');
    eq(r.before.wall, true, 'the setup really was changed before restoring');
    eq(r.after.wall, false, 'and comes back off');
    eq(r.after.grid, true, 'frozen comes back');
    eq(r.after.lock, true, 'lock comes back');
    eq(r.after.col, '#ff0000', 'and so does the colour');
    eq(r.names.join(','), 'Structure only');
  });

  /* A state records what it saw. Layers made afterwards are not mentioned in
     it and must be left alone rather than guessed at. */
  t('a layer added after the state was saved is left alone', () => {
    const r = R(`${SETUP}
      saveLayerState('Before');
      ensureLayer('NEW-ONE');
      DOC.layers.find(l => l.name === 'NEW-ONE').on = false;
      restoreLayerState('Before');
      return { newOne: DOC.layers.find(l => l.name === 'NEW-ONE').on,
               exists: !!DOC.layers.find(l => l.name === 'NEW-ONE') };`);
    eq(r.exists, true, 'the new layer survives the restore');
    eq(r.newOne, false, 'and its own setting is not overwritten');
  });

  t('layer states travel with the drawing', () => {
    const r = R(`${SETUP}
      L('A-WALL').on = false;
      saveLayerState('Structure only');
      const txt = saveNative();
      resetDoc();
      const none = (DOC.layerStates || []).length;
      loadNative(txt);
      const names = (DOC.layerStates || []).map(s => s.name);
      DOC.layers.find(l => l.name === 'A-WALL').on = true;
      const ok1 = restoreLayerState('Structure only');
      return { none, names, ok1,
               wall: DOC.layers.find(l => l.name === 'A-WALL').on };`);
    eq(r.none, 0, 'a fresh document has none');
    eq(r.names.join(','), 'Structure only', 'they come back with the file');
    eq(r.ok1, true); eq(r.wall, false, 'and still restore correctly');
  });

  /* The draw path keeps its own fast copy of the visibility rule. When freeze
     was added only the slow one learned about it, so frozen layers carried on
     being drawn while every other part of the program agreed they were hidden
     — green tests throughout, because they all called visible(). The two must
     answer identically for every entity. */
  t('the draw path and visible() never disagree', () => {
    const r = R(`${SETUP}
      ensureLayer('B-ONE'); ensureLayer('B-TWO');
      addEnt({t:'line', a:[0,0], b:[10,0], layer:'B-ONE'});
      addEnt({t:'line', a:[0,10], b:[10,10], layer:'B-TWO'});
      /* the draw path resolves layers through a per-frame map that paint()
         rebuilds; refresh it explicitly since nothing is being painted here */
      const combos = [];
      for (const on of [true, false])
        for (const frozen of [true, false])
          for (const lock of [true, false]) {
            for (const l of DOC.layers) { l.on = on; l.frozen = frozen; l.lock = lock; }
            frameLayers();
            for (const e of DOC.ents.values())
              combos.push({ on, frozen, lock, slow: visible(e), fast: fvis(e) });
          }
      return { total: combos.length,
               disagreements: combos.filter(c => c.slow !== c.fast)
                                    .map(c => 'on=' + c.on + ' frozen=' + c.frozen) };`);
    eq(r.disagreements.length, 0,
      'the two visibility rules disagreed on: ' + r.disagreements.slice(0,4).join('; '));
    ok(r.total > 0);
  });
};
