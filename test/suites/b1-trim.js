'use strict';
/* ============================================================
   B1 — TRIM and EXTEND as AutoCAD 2025 runs them

   Quick mode is the default: everything is a cutting edge, a
   click takes the piece under it, two clicks in empty space fence
   everything between, an object nothing crosses is erased, Shift
   swaps the sense, and U inside the command takes back ONE cut.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; VS.edgemode = 0; VS.trimextendmode = 1;
  V.w = 1200; V.h = 800; V.z = 0.2; V.px = 200; V.py = 600; V.rot = 0;
  ST.snap = null; ST.raw = null; ST.shift = false;
  cancelCmd(); SEL.clear();
`;
const verticalTops = `[...DOC.ents.values()].filter(e => e.t === 'line' && Math.abs(e.a[0]-e.b[0]) < 1e-9)
  .map(e => Math.max(e.a[1], e.b[1])).sort((a,b)=>a-b)`;
module.exports = ({ group, t, ok, eq, close, R }) => {
  group('B1 TRIM — Quick mode');

  t('the prompt is AutoCAD\'s, with its keywords', () => {
    const r = R(`${SETUP}
      startCmd('trim');
      const p = PROMPT.text, keys = PROMPT.keys.map(k => k.key).join(',');
      endCmd(true);
      return { p, keys };`);
    eq(r.p, 'Select object to trim or shift-select to extend or [cuTting edges/Crossing/mOde/Project/eRase/Undo]:');
    eq(r.keys, 'T,C,O,P,R,U');
  });

  t('an object that nothing crosses is erased, as Quick mode does', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      addEnt({t:'line', a:[0,2000], b:[1000,2000], layer:'0'}); commit('x');
      startCmd('trim'); cmdPoint([500, 0]);
      const n = DOC.ents.size; endCmd(true);
      return n;`);
    eq(r, 1, 'the stray line goes, the other stays');
  });

  t('two clicks in empty space fence everything between them', () => {
    const r = R(`${SETUP}
      begin();
      for (let i = 0; i < 4; i++) addEnt({t:'line', a:[i*1000, -500], b:[i*1000, 2500], layer:'0'});
      addEnt({t:'line', a:[-500, 2000], b:[3500, 2000], layer:'0'});
      commit('x');
      startCmd('trim');
      cmdPoint([-300, 2300]);           /* nothing here: the fence starts */
      const mid = PROMPT.text;
      cmdPoint([3300, 2300]);           /* and ends */
      const tops = ${verticalTops};
      const back = PROMPT.text;
      endCmd(true);
      return { tops, mid, back };`);
    eq(r.tops.join(','), '2000,2000,2000,2000', 'every stub above the edge is gone');
    ok(/fence/i.test(r.mid), 'the prompt says a fence is being drawn: ' + r.mid);
    ok(/^Select object to trim/.test(r.back), 'and then it is back to picking');
  });

  t('Shift-select extends instead, and in EXTEND it trims', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'line', a:[0,0], b:[0,1000], layer:'0'});
      addEnt({t:'line', a:[-500,2000], b:[500,2000], layer:'0'});
      commit('x');
      startCmd('trim'); ST.shift = true; cmdPoint([0, 900]); ST.shift = false;
      const ext = ${verticalTops};
      endCmd(true);
      begin(); addEnt({t:'line', a:[-500,1500], b:[500,1500], layer:'0'}); commit('y');
      startCmd('extend'); ST.shift = true; cmdPoint([0, 1800]); ST.shift = false;
      const cut = ${verticalTops};
      endCmd(true);
      return { ext, cut };`);
    eq(r.ext.join(','), '2000', 'TRIM with Shift runs the line up to the edge');
    eq(r.cut.join(','), '1500', 'EXTEND with Shift trims it back');
  });

  t('U inside TRIM takes back only the last cut, and the command stays up', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'line', a:[0,-500], b:[0,2500], layer:'0'});
      addEnt({t:'line', a:[1000,-500], b:[1000,2500], layer:'0'});
      addEnt({t:'line', a:[-500,2000], b:[1500,2000], layer:'0'});
      commit('x');
      startCmd('trim');
      cmdPoint([0, 2300]); cmdPoint([1000, 2300]);
      const both = ${verticalTops};
      dispatch('U');
      const one = ${verticalTops};
      const running = !!CMD;
      endCmd(true);
      return { both, one, running };`);
    eq(r.both.join(','), '2000,2000');
    eq(r.one.join(','), '2000,2500', 'only the second cut came back');
    eq(r.running, true);
  });

  t('the whole command is one step for U afterwards', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'line', a:[0,-500], b:[0,2500], layer:'0'});
      addEnt({t:'line', a:[1000,-500], b:[1000,2500], layer:'0'});
      addEnt({t:'line', a:[-500,2000], b:[1500,2000], layer:'0'});
      commit('x');
      startCmd('trim'); cmdPoint([0, 2300]); cmdPoint([1000, 2300]); cmdEnter();
      undo();
      return ${verticalTops};`);
    eq(r.join(','), '2500,2500', 'one U brings both back');
  });

  t('a trimmed piece keeps layer, colour, linetype and lineweight', () => {
    const r = R(`${SETUP}
      DOC.layers.push(newLayer('A-DETL'));
      begin();
      addEnt({t:'pline', pts:[[0,0],[1000,0],[1000,1000],[0,1000]], closed:true,
              layer:'A-DETL', color:'#ff0000', lt:'dashed', lw:0.5});
      addEnt({t:'line', a:[500,-500], b:[500,1500], layer:'0'});
      commit('x');
      startCmd('trim'); cmdPoint([1000, 500]);
      const pl = [...DOC.ents.values()].filter(e => e.t === 'pline');
      endCmd(true);
      return pl.map(e => [e.layer, e.color, e.lt, e.lw, e.closed, e.pts.length]);`);
    eq(r.length, 1, 'one object, not pieces');
    eq(JSON.stringify(r[0]), JSON.stringify(['A-DETL', '#ff0000', 'dashed', 0.5, false, 4]));
  });

  t('eRase removes objects without leaving TRIM', () => {
    const r = R(`${SETUP}
      begin(); const a = addEnt({t:'circle', c:[0,0], r:100, layer:'0'});
      addEnt({t:'line', a:[5000,0], b:[6000,0], layer:'0'}); commit('x');
      startCmd('trim'); dispatch('R');
      SEL.add(a.id); cmdEnter();
      const n = DOC.ents.size, running = !!CMD, p = PROMPT.text;
      endCmd(true);
      return { n, running, p };`);
    eq(r.n, 1); eq(r.running, true);
    ok(/^Select object to trim/.test(r.p), 'back at the trim prompt');
  });

  t('a construction line is picked and trimmed to a ray', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'xline', a:[0,0], d:[1,0], layer:'0'});
      addEnt({t:'line', a:[500,-500], b:[500,500], layer:'0'}); commit('x');
      startCmd('trim'); cmdPoint([2000, 0]);
      const k = [...DOC.ents.values()].map(e => e.t).sort().join(',');
      endCmd(true); return k;`);
    eq(r, 'line,ray');
  });

  group('B1 TRIM — Standard mode');

  t('Standard asks for edges first, and Enter takes them all', () => {
    const r = R(`${SETUP}
      VS.trimextendmode = 0;
      begin();
      addEnt({t:'line', a:[0,-500], b:[0,2500], layer:'0'});
      addEnt({t:'line', a:[-500,2000], b:[500,2000], layer:'0'});
      addEnt({t:'line', a:[3000,0], b:[4000,0], layer:'0'});
      commit('x');
      startCmd('trim');
      const ask = PROMPT.text, phase = CMD.phase;
      cmdEnter();
      const p = PROMPT.text;
      cmdPoint([0, 2300]);
      cmdPoint([3500, 0]);              /* nothing crosses it: Standard leaves it */
      const n = DOC.ents.size, tops = ${verticalTops};
      endCmd(true); VS.trimextendmode = 1;
      return { ask, phase, p, n, tops };`);
    eq(r.phase, 'sel', 'it opens a selection');
    ok(/select all/i.test(r.ask), 'offering all of them: ' + r.ask);
    ok(/\[Fence\/Crossing\/mOde\/Project\/Edge\/eRase\/Undo\]/.test(r.p), 'the Standard keywords: ' + r.p);
    eq(r.tops.join(','), '2000');
    eq(r.n, 3, 'and an object no edge crosses is not erased');
  });

  t('only the chosen edges cut', () => {
    const r = R(`${SETUP}
      VS.trimextendmode = 0;
      begin();
      const v = addEnt({t:'line', a:[0,-500], b:[0,2500], layer:'0'});
      const e1 = addEnt({t:'line', a:[-500,1000], b:[500,1000], layer:'0'});
      addEnt({t:'line', a:[-500,2000], b:[500,2000], layer:'0'});
      commit('x');
      startCmd('trim'); SEL.add(e1.id); cmdEnter();
      cmdPoint([0, 2300]);
      const tops = ${verticalTops};
      endCmd(true); VS.trimextendmode = 1;
      return tops;`);
    eq(r.join(','), '1000', 'cut at the chosen edge, straight through the other one');
  });

  group('B1 EXTEND');

  t('extends a polyline along its curved end segment', () => {
    const r = R(`${SETUP}
      begin();
      /* straight, then a quarter arc about 1000,1000 ending at 2000,1000 */
      addEnt({t:'pline', pts:[[0,0],[1000,0],[2000,1000]], bulges:[0, Math.tan(Math.PI/8), 0], layer:'0'});
      addEnt({t:'line', a:[-500,1800], b:[3000,1800], layer:'0'});
      commit('x');
      startCmd('extend'); cmdPoint([1950, 700]);
      const p = [...DOC.ents.values()].find(e => e.t === 'pline');
      endCmd(true);
      const end = p.pts[p.pts.length - 1];
      return { n: p.pts.length, end, r: Math.hypot(end[0]-1000, end[1]-1000) };`);
    eq(r.n, 3, 'the end segment grows, no vertex is added');
    close(r.end[1], 1800, 1e-9, 'it reaches the boundary');
    close(r.r, 1000, 1e-9, 'round the same arc');
  });

  t('a fence extends every object it crosses', () => {
    const r = R(`${SETUP}
      begin();
      for (let i = 0; i < 3; i++) addEnt({t:'line', a:[i*1000, 0], b:[i*1000, 1200], layer:'0'});
      addEnt({t:'line', a:[-500,2000], b:[2500,2000], layer:'0'});
      commit('x');
      startCmd('extend'); cmdPoint([-300, 1100]); cmdPoint([2300, 1100]);
      const tops = ${verticalTops};
      endCmd(true); return tops;`);
    eq(r.join(','), '2000,2000,2000');
  });
};
