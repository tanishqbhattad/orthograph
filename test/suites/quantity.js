'use strict';
/* ============================================================
   Quantities — what the properties panel says you have

   "Length" fell through to the perimeter of whatever the object
   flattens to. For a line that is the length. For a wall it is
   the way round the outside of the wall — and for a compound
   wall, the way round every one of its layer lines as well, so a
   5m cavity wall reported sixty-six metres.

   That number is read off the panel and ordered from, so it has
   to be the run of the wall. It was also the single most
   expensive thing in the program: summing it over a selection
   flattened every wall in that selection, twice, on every edit.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('length is the length of the thing');

  t('a wall is as long as it runs, whatever it is made of', () => {
    const r = R(`${SETUP}
      begin();
      const plain = addEnt({t:'wall', a:[0,0], b:[5000,0], wt:'gen100', layer:'A-WALL'});
      const comp  = addEnt({t:'wall', a:[0,20000], b:[5000,20000], wt:'cav300', layer:'A-WALL'});
      const diag  = addEnt({t:'wall', a:[0,40000], b:[3000,44000], wt:'cav300', layer:'A-WALL'});
      commit('w');
      return { plain: entLength(plain), comp: entLength(comp), diag: entLength(diag) };`);
    close(r.plain, 5000, 1, 'a plain 5m wall is 5m, got ' + Math.round(r.plain));
    close(r.comp, 5000, 1, 'and so is a cavity wall, got ' + Math.round(r.comp));
    close(r.diag, 5000, 1, 'a 3-4-5 diagonal is 5m, got ' + Math.round(r.diag));
  });

  /* Joining two walls does not lengthen either of them. */
  t('a wall keeps its length when something joins it', () => {
    const r = R(`${SETUP}
      begin();
      const a = addEnt({t:'wall', a:[0,0], b:[5000,0], wt:'cav300', layer:'A-WALL'});
      commit('a');
      const alone = entLength(a);
      begin(); addEnt({t:'wall', a:[5000,0], b:[5000,4000], wt:'cav300', layer:'A-WALL'}); commit('b');
      return { alone, joined: entLength(a) };`);
    close(r.alone, 5000, 1);
    close(r.joined, 5000, 1, 'still 5m once a wall meets its end, got ' + Math.round(r.joined));
  });

  t('a door and a window are as wide as the opening', () => {
    const r = R(`${SETUP}
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[10000,0], wt:'cav300', layer:'A-WALL'});
      const d = addEnt({t:'door', host:w.id, pos:3000, dt:'sgl900', layer:'A-DOOR'});
      const g = addEnt({t:'window', host:w.id, pos:6000, w:1200, h:1200, sill:900, layer:'A-GLAZ'});
      commit('o');
      return { d: entLength(d), g: entLength(g) };`);
    close(r.d, 900, 1, 'the door is its leaf width, got ' + Math.round(r.d));
    close(r.g, 1200, 1, 'the window its opening, got ' + Math.round(r.g));
  });

  t('a closed area reports its perimeter', () => {
    const r = R(`${SETUP}
      begin();
      const rm = addEnt({t:'room', pts:[[0,0],[4000,0],[4000,3000],[0,3000]], layer:'A-AREA'});
      const fl = addEnt({t:'floor', pts:[[0,10000],[5000,10000],[5000,14000],[0,14000]], layer:'A-FLOR'});
      commit('r');
      return { rm: entLength(rm), fl: entLength(fl), area: entArea(rm) };`);
    close(r.rm, 14000, 1, 'a 4x3 room is 14m round, got ' + Math.round(r.rm));
    close(r.fl, 18000, 1, 'a 5x4 slab is 18m round, got ' + Math.round(r.fl));
    close(r.area, 12e6, 1e3, 'and still 12 square metres');
  });

  t('the plain types are untouched', () => {
    const r = R(`${SETUP}
      begin();
      const ln = addEnt({t:'line', a:[0,0], b:[3000,4000], layer:'0'});
      const ci = addEnt({t:'circle', c:[0,0], r:1000, layer:'0'});
      const ar = addEnt({t:'arc', c:[0,0], r:1000, a0:0, a1:Math.PI/2, layer:'0'});
      const pl = addEnt({t:'pline', pts:[[0,0],[1000,0],[1000,1000]], closed:false, layer:'0'});
      commit('p');
      return { ln: entLength(ln), ci: entLength(ci), ar: entLength(ar), pl: entLength(pl) };`);
    close(r.ln, 5000, 1, 'line');
    close(r.ci, 2 * Math.PI * 1000, 1, 'circle');
    close(r.ar, Math.PI / 2 * 1000, 1, 'arc');
    close(r.pl, 2000, 1, 'polyline');
  });

  group('the cost of saying so');

  /* Every commit rebuilds the properties panel, and the panel used to sum the
     selection twice over — once for Totals and once for the quick-properties
     card. Selecting a plan and nudging it paid for both. */
  t('a selection is measured once per edit, not twice', () => {
    const r = R(`${SETUP}
      begin();
      for (let i = 0; i < 40; i++)
        addEnt({t:'wall', a:[i*6000,0], b:[i*6000+5000,0], wt:'cav300', layer:'A-WALL'});
      commit('w');
      SEL.clear(); for (const e of DOC.ents.values()) SEL.add(e.id);
      let n = 0;
      const real = entLength;
      globalThis.entLength = (e) => { n++; return real(e); };
      buildProps();
      globalThis.entLength = real;
      return { n, sel: SEL.size };`);
    eq(r.sel, 40, 'forty walls are selected');
    ok(r.n <= r.sel, 'each is measured at most once, got ' + r.n + ' measurements for ' + r.sel);
  });

  t('measuring a big selection is not a flattening of every wall in it', () => {
    const r = R(`${SETUP}
      begin();
      for (let i = 0; i < 400; i++)
        addEnt({t:'wall', a:[i*6000,0], b:[i*6000+5000,0], wt:'cav300', layer:'A-WALL'});
      commit('w');
      const all = [...DOC.ents.values()];
      let flat = 0;
      const realPoly = poly;
      globalThis.poly = (e, n) => { if (e && e.t === 'wall') flat++; return realPoly(e, n); };
      for (const e of all) entLength(e);
      globalThis.poly = realPoly;
      return { flat, n: all.length };`);
    eq(r.flat, 0, 'no wall is flattened to be measured, got ' + r.flat + ' of ' + r.n);
  });
};
