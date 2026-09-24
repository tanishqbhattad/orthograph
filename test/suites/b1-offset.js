'use strict';
/* ============================================================
   B1 — OFFSET as AutoCAD 2025 asks it
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; VS.offsetgaptype = 0;
  MODSET.offDist = -1; MODSET.offErase = false; MODSET.offLayerCur = false;
  V.w = 1200; V.h = 800; V.z = 0.2; V.px = 200; V.py = 600; V.rot = 0;
  ST.snap = null; ST.raw = null; ST.shift = false;
  cancelCmd(); SEL.clear();
`;
const ys = `[...DOC.ents.values()].filter(e => e.t === 'line').map(e => +e.a[1].toFixed(6)).sort((a,b)=>a-b)`;
module.exports = ({ group, t, ok, eq, close, R }) => {
  group('B1 OFFSET — the conversation');

  t('asks for a distance offering Through, then remembers the distance', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'}); commit('x');
      startCmd('offset');
      const first = PROMPT.text;
      dispatch('250');
      const sel = PROMPT.text;
      cmdPoint([2500, 0]);
      const side = PROMPT.text;
      endCmd(true);
      startCmd('offset');
      const again = PROMPT.text;
      endCmd(true);
      return { first, sel, side, again };`);
    eq(r.first, 'Specify offset distance or [Through/Erase/Layer] <Through>:');
    eq(r.sel, 'Select object to offset or [Exit/Undo] <Exit>:');
    eq(r.side, 'Specify point on side to offset or [Exit/Multiple/Undo] <Exit>:');
    ok(/<250(\.0+)?>:$/.test(r.again), 'the distance comes back as the default: ' + r.again);
  });

  t('the distance can be shown by two points', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'}); commit('x');
      startCmd('offset'); cmdPoint([0, 0]); cmdPoint([300, 400]);
      cmdPoint([2500, 0]); cmdPoint([2500, 100]);
      endCmd(true); return ${ys};`);
    eq(r.join(','), '0,500', 'a 3-4-5 is 500');
  });

  t('Through goes through the point clicked', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'}); commit('x');
      startCmd('offset'); dispatch('T');
      const p = PROMPT.text;
      cmdPoint([2500, 0]); cmdPoint([1200, 777]);
      endCmd(true); return { p, ys: ${ys} };`);
    eq(r.ys.join(','), '0,777');
  });

  t('Undo takes back one offset and stays in the command', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'}); commit('x');
      startCmd('offset'); dispatch('100');
      cmdPoint([2500, 0]); cmdPoint([2500, 50]);
      cmdPoint([2500, 0]); cmdPoint([2500, -50]);
      const two = ${ys};
      dispatch('U');
      const one = ${ys}, up = !!CMD;
      endCmd(true);
      return { two, one, up };`);
    eq(r.two.join(','), '-100,0,100');
    eq(r.one.join(','), '0,100', 'only the last came off');
    eq(r.up, true);
  });

  t('Multiple steps out from the last one; Enter goes to the next object', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'}); commit('x');
      startCmd('offset'); dispatch('100');
      cmdPoint([2500, 0]); dispatch('M');
      const p = PROMPT.text;
      cmdPoint([2500, 50]); cmdPoint([2500, 150]); cmdPoint([2500, 250]);
      cmdEnter();
      const next = PROMPT.text;
      endCmd(true);
      return { p, next, ys: ${ys} };`);
    eq(r.p, 'Specify point on side to offset or [Exit/Undo] <next object>:');
    eq(r.ys.join(','), '0,100,200,300');
    eq(r.next, 'Select object to offset or [Exit/Undo] <Exit>:');
  });

  group('B1 OFFSET — what it makes');

  t('a rounded polyline offsets with its arcs kept as arcs, on its layer and pen', () => {
    const r = R(`${SETUP}
      DOC.layers.push(newLayer('A-DETL'));
      begin();
      addEnt({t:'pline', pts:[[0,0],[2000,0],[3000,1000],[3000,3000]], bulges:[0, Math.tan(Math.PI/8), 0],
              layer:'A-DETL', color:'#00aa00', lt:'hidden', lw:0.35});
      commit('x');
      startCmd('offset'); dispatch('200'); cmdPoint([1000, 0]); cmdPoint([1000, 500]);
      endCmd(true);
      const o = [...DOC.ents.values()][1];
      return { t: o.t, n: o.pts.length, b: o.bulges && o.bulges[1], p: [o.layer, o.color, o.lt, o.lw] };`);
    eq(r.t, 'pline'); eq(r.n, 4);
    close(r.b, Math.tan(Math.PI / 8), 1e-9, 'the corner is still a quarter circle');
    eq(JSON.stringify(r.p), JSON.stringify(['A-DETL', '#00aa00', 'hidden', 0.35]));
  });

  t('inward past the collapse makes nothing, and says so', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'pline', pts:[[0,0],[1000,0],[1000,1000],[0,1000]], closed:true, layer:'0'}); commit('x');
      startCmd('offset'); dispatch('700'); cmdPoint([1000, 500]); cmdPoint([500, 500]);
      const n = DOC.ents.size, last = CLI.lines[CLI.lines.length - 1].t;
      endCmd(true);
      return { n, last };`);
    eq(r.n, 1, 'no garbage is added');
    ok(/cannot offset/i.test(r.last), 'and the command line says why: ' + r.last);
  });

  t('OFFSETGAPTYPE 1 rounds the outside corners with arcs of the offset distance', () => {
    const r = R(`${SETUP}
      VS.offsetgaptype = 1;
      begin(); addEnt({t:'pline', pts:[[0,0],[1000,0],[1000,1000],[0,1000]], closed:true, layer:'0'}); commit('x');
      startCmd('offset'); dispatch('100'); cmdPoint([1000, 500]); cmdPoint([1500, 500]);
      endCmd(true); VS.offsetgaptype = 0;
      const o = [...DOC.ents.values()][1];
      return { n: o.pts.length, b: (o.bulges || []).filter(x => Math.abs(x) > 1e-9).map(x => +x.toFixed(9)) };`);
    eq(r.n, 8, 'four sides and four corner arcs');
    eq(r.b.join(','), [1, 2, 3, 4].map(() => +Math.tan(Math.PI / 8).toFixed(9)).join(','), 'each a quarter circle');
  });

  t('an ellipse offsets to a spline, as AutoCAD makes it', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'ellipse', c:[0,0], rx:1000, ry:500, rot:0, layer:'0'}); commit('x');
      startCmd('offset'); dispatch('100'); cmdPoint([1000, 0]); cmdPoint([1300, 0]);
      endCmd(true);
      return [...DOC.ents.values()].map(e => e.t).join(',');`);
    eq(r, 'ellipse,spline');
  });
};
