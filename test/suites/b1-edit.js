'use strict';
/* ============================================================
   B1 — BREAK, BREAKATPOINT, LENGTHEN, STRETCH and ALIGN
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; VS.trimmode = 1;
  MODSET.lenMode = 'de'; MODSET.lenDelta = 0; MODSET.lenPct = 100; MODSET.lenTotal = 1000; MODSET.lenAngle = false;
  V.w = 1200; V.h = 800; V.z = 0.2; V.px = 200; V.py = 600; V.rot = 0;
  ST.snap = null; ST.raw = null; ST.shift = false; ST.lastBand = null; ST.lastBandPoly = null;
  cancelCmd(); SEL.clear();
`;
const ents = `[...DOC.ents.values()]`;
const spans = `[...DOC.ents.values()].filter(e => e.t === 'line').map(e => [e.a[0], e.b[0]].map(v => +v.toFixed(6)).sort((a,b)=>a-b)).sort((a,b)=>a[0]-b[0])`;
module.exports = ({ group, t, ok, eq, close, R }) => {
  group('B1 BREAK');

  t('the pick is the first break point, as in AutoCAD', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[3000,0]}); commit('x');
      startCmd('break');
      const p1 = PROMPT.text;
      cmdPoint([1000, 0]);
      const p2 = PROMPT.text;
      cmdPoint([2000, 0]);
      return { p1, p2, spans: ${spans}, up: !!CMD };`);
    eq(r.p1, 'Select object:');
    eq(r.p2, 'Specify second break point or [First point]:');
    eq(JSON.stringify(r.spans), '[[0,1000],[2000,3000]]');
    eq(r.up, false);
  });

  t('First point lets the first point be given again; @ breaks at a point', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[3000,0]}); commit('x');
      startCmd('break'); cmdPoint([100, 0]); dispatch('F');
      const p = PROMPT.text;
      cmdPoint([500, 0]); cmdPoint([700, 0]);
      const a = ${spans};
      startCmd('break'); cmdPoint([2000, 0]); dispatch('@');
      return { p, a, b: ${spans} };`);
    eq(r.p, 'Specify first break point:');
    eq(JSON.stringify(r.a), '[[0,500],[700,3000]]');
    eq(JSON.stringify(r.b), '[[0,500],[700,2000],[2000,3000]]', '@ splits it where it was picked');
  });

  t('a circle loses the part counter-clockwise from the first point to the second', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'circle', c:[0,0], r:500}); commit('x');
      startCmd('break'); cmdPoint([500, 0]); cmdPoint([0, 500]);
      const a = ${ents}[0];
      return { t: a.t, s: arcPt(a, 0).map(v => +v.toFixed(6)), e: arcPt(a, 1).map(v => +v.toFixed(6)) };`);
    eq(r.t, 'arc');
    eq(JSON.stringify(r.s), '[0,500]', 'the arc starts at the second point');
    eq(JSON.stringify(r.e), '[500,0]', 'and runs on round to the first');
  });

  t('BREAKATPOINT splits a line, and refuses a circle as AutoCAD does', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[3000,0]}); addEnt({t:'circle', c:[0,2000], r:500}); commit('x');
      startCmd('breakatpoint'); cmdPoint([1200, 0]); cmdPoint([1200, 0]);
      const lines = ${spans};
      startCmd('breakatpoint'); cmdPoint([500, 2000]); cmdPoint([500, 2000]);
      return { lines, said: CLI.lines[CLI.lines.length - 1].t, circles: ${ents}.filter(e => e.t === 'circle').length };`);
    eq(JSON.stringify(r.lines), '[[0,1200],[1200,3000]]');
    ok(/360 degrees/.test(r.said), r.said);
    eq(r.circles, 1);
  });

  t('a closed polyline broken stays one object', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'pline', pts:[[0,0],[1000,0],[1000,1000],[0,1000]], closed:true}); commit('x');
      startCmd('break'); cmdPoint([400, 0]); cmdPoint([600, 0]);
      const p = ${ents};
      return p.map(e => [e.t, e.closed, e.pts.length, e.pts[0].map(v => +v.toFixed(9)), e.pts[e.pts.length - 1].map(v => +v.toFixed(9))]);`);
    eq(JSON.stringify(r), JSON.stringify([['pline', false, 6, [600, 0], [400, 0]]]));
  });

  group('B1 LENGTHEN');

  t('picking reports the length, and an arc its included angle', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[1200,0]}); addEnt({t:'arc', c:[0,3000], r:1000, a0:0, a1:Math.PI/2}); commit('x');
      startCmd('lengthen');
      const p = PROMPT.text;
      cmdPoint([600, 0]);
      const a = CLI.lines[CLI.lines.length - 1].t;
      cmdPoint([1000*Math.cos(0.7), 3000 + 1000*Math.sin(0.7)]);
      const b = CLI.lines[CLI.lines.length - 1].t;
      endCmd(true);
      return { p, a, b };`);
    eq(r.p, 'Select an object to measure or [DElta/Percent/Total/DYnamic] <DElta>:');
    eq(r.a, 'Current length: 1200');
    ok(/^Current length: 1570.?\d*, included angle: 90$/.test(r.b), r.b);
  });

  t('DElta, Percent and Total each change the end nearer the pick', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[1000,0]}); commit('x');
      startCmd('lengthen'); dispatch('DE'); dispatch('250');
      const p = PROMPT.text;
      cmdPoint([900, 0]);
      const de = ${spans};
      cmdPoint([100, 0]);
      const de2 = ${spans};
      cmdEnter();
      startCmd('lengthen'); dispatch('P'); dispatch('50'); cmdPoint([1200, 0]); cmdEnter();
      const pc = ${spans};
      startCmd('lengthen'); dispatch('T'); dispatch('2000'); cmdPoint([-200, 0]); cmdEnter();
      return { p, de, de2, pc, tt: ${spans} };`);
    eq(r.p, 'Select an object to change or [Undo]:');
    eq(JSON.stringify(r.de), '[[0,1250]]');
    eq(JSON.stringify(r.de2), '[[-250,1250]]', 'and again, at the other end');
    eq(JSON.stringify(r.pc), '[[-250,500]]', 'half of it, from the end picked');
    eq(JSON.stringify(r.tt), '[[-1500,500]]', 'two metres in all, grown from the start');
  });

  t('Undo takes one change back and stays in LENGTHEN', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[1000,0]}); commit('x');
      startCmd('lengthen'); dispatch('DE'); dispatch('100');
      cmdPoint([900, 0]); cmdPoint([1050, 0]);
      const two = ${spans};
      dispatch('U');
      const one = ${spans}, up = !!CMD;
      endCmd(true);
      return { two, one, up };`);
    eq(JSON.stringify(r.two), '[[0,1200]]'); eq(JSON.stringify(r.one), '[[0,1100]]'); eq(r.up, true);
  });

  t('an arc lengthens round its circle, by length or by angle', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'arc', c:[0,0], r:1000, a0:0, a1:Math.PI/2}); commit('x');
      startCmd('lengthen'); dispatch('DE'); dispatch('A'); dispatch('30');
      cmdPoint([1000*Math.cos(1.4), 1000*Math.sin(1.4)]);
      cmdEnter();
      const a = ${ents}[0];
      return { sw: deg(arcSweep(a)), a0: a.a0, r: a.r };`);
    close(r.sw, 120, 1e-9, 'ninety plus thirty');
    close(r.a0, 0, 1e-9, 'grown at the end picked');
    eq(r.r, 1000);
  });

  t('a polyline lengthens along its curved end segment', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'pline', pts:[[0,0],[1000,0],[2000,1000]], bulges:[0, Math.tan(Math.PI/8), 0]}); commit('x');
      startCmd('lengthen'); dispatch('DE'); dispatch('' + (1000 * Math.PI / 4)); cmdPoint([1950, 700]); cmdEnter();
      const p = ${ents}[0];
      return { n: p.pts.length, end: p.pts[2].map(v => +v.toFixed(6)), b: p.bulges[1] };`);
    eq(r.n, 3);
    eq(JSON.stringify(r.end), '[1707.106781,1707.106781]', 'a further 45 degrees round the same arc');
    close(r.b, Math.tan(3 * Math.PI / 16), 1e-9);
  });

  t('DYnamic drags the end along the line', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[1000,0]}); commit('x');
      startCmd('lengthen'); dispatch('DY'); cmdPoint([900, 0]);
      const p = PROMPT.text;
      cmdPoint([1700, 333]);
      endCmd(true);
      return { p, s: ${spans} };`);
    eq(r.p, 'Specify new end point:');
    eq(JSON.stringify(r.s), '[[0,1700]]', 'the end follows the cursor, projected onto the line');
  });

  group('B1 STRETCH');

  t('what the crossing window holds moves; what it does not, stays', () => {
    const r = R(`${SETUP}
      begin();
      const a = addEnt({t:'line', a:[0,0], b:[1000,0]});          /* one end inside */
      const b = addEnt({t:'line', a:[900,500], b:[1100,500]});    /* wholly inside  */
      const c = addEnt({t:'circle', c:[0,1000], r:100});          /* picked, not touched */
      commit('x');
      ST.lastBandPoly = [[800,-200],[1200,-200],[1200,700],[800,700]];
      SEL.add(a.id); SEL.add(b.id); SEL.add(c.id);
      startCmd('stretch');
      const p = PROMPT.text;
      cmdPoint([0, 0]); cmdPoint([300, 0]);
      return { p, a: [a.a, a.b], b: [b.a, b.b], c: c.c };`);
    eq(r.p, 'Specify base point or [Displacement] <Displacement>:');
    eq(JSON.stringify(r.a), '[[0,0],[1300,0]]', 'the end inside moved, the other stayed');
    eq(JSON.stringify(r.b), '[[1200,500],[1400,500]]', 'wholly inside: moved whole');
    eq(JSON.stringify(r.c), '[300,1000]', 'selected but not in the window: moved whole');
  });

  t('a stretched arc keeps the height of its bulge; a polyline keeps its arcs', () => {
    const r = R(`${SETUP}
      begin();
      const a = addEnt({t:'arc', c:[500,0], r:500, a0:0, a1:Math.PI});
      const p = addEnt({t:'pline', pts:[[0,-2000],[1000,-2000],[1000,-1000]], bulges:[0.5, 0, 0]});
      commit('x');
      ST.lastBandPoly = [[-100,-2100],[100,-2100],[100,100],[-100,100]];
      SEL.add(a.id); SEL.add(p.id);
      startCmd('stretch'); cmdPoint([0, 0]); cmdPoint([-1000, 0]);
      const S = arcPt(a, 0), E = arcPt(a, 1), M = arcPt(a, 0.5);
      const h = Math.abs(cross(norm(sub(E, S)), sub(M, S)));
      return { S, E, h, pts: p.pts, b: p.bulges };`);
    close(r.h, 500, 1e-9, 'the bulge height is still 500');
    eq(JSON.stringify(r.E.map(v => +v.toFixed(6))), '[-1000,0]', 'the end inside went with it');
    eq(JSON.stringify(r.S.map(v => +v.toFixed(6))), '[1000,0]', 'the end outside did not');
    eq(JSON.stringify(r.pts), JSON.stringify([[-1000,-2000],[1000,-2000],[1000,-1000]]));
    eq(r.b[0], 0.5, 'and the polyline arc keeps its bulge');
  });

  t('Displacement takes a vector; Enter after a point uses it as the vector', () => {
    const r = R(`${SETUP}
      begin(); const a = addEnt({t:'line', a:[0,0], b:[1000,0]}); commit('x');
      ST.lastBandPoly = [[900,-100],[1100,-100],[1100,100],[900,100]];
      SEL.add(a.id); startCmd('stretch'); dispatch('D'); dispatch('0,500');
      const one = a.b.slice();
      SEL.add(a.id); startCmd('stretch'); cmdPoint([100, 0]); cmdEnter();
      return { one, two: a.b };`);
    eq(JSON.stringify(r.one), '[1000,500]');
    eq(JSON.stringify(r.two), '[1100,500]', 'first point 100,0 taken as the displacement');
  });

  group('B1 ALIGN');

  t('two pairs, then AutoCAD\'s scale question', () => {
    const r = R(`${SETUP}
      begin(); const e = addEnt({t:'line', a:[0,0], b:[100,0]}); commit('x');
      SEL.add(e.id);
      startCmd('align');
      const asks = [PROMPT.text];
      cmdPoint([0,0]); asks.push(PROMPT.text);
      cmdPoint([500,500]); asks.push(PROMPT.text);
      cmdPoint([100,0]); asks.push(PROMPT.text);
      cmdPoint([500,700]); asks.push(PROMPT.text);
      cmdEnter(); asks.push(PROMPT.text);
      dispatch('Y');
      return { asks, a: e.a, b: e.b, up: !!CMD };`);
    eq(JSON.stringify(r.asks), JSON.stringify(['Specify first source point:', 'Specify first destination point:',
      'Specify second source point or <continue>:', 'Specify second destination point:',
      'Specify third source point or <continue>:', 'Scale objects based on alignment points? [Yes/No] <N>:']));
    eq(JSON.stringify(r.b.map(v => +v.toFixed(6))), '[500,700]', 'Yes scales it onto the destination');
    eq(r.up, false);
  });

  t('No keeps the size; one pair just moves; Esc before answering changes nothing', () => {
    const r = R(`${SETUP}
      begin(); const e = addEnt({t:'line', a:[0,0], b:[100,0]}); commit('x');
      SEL.add(e.id); startCmd('align');
      cmdPoint([0,0]); cmdPoint([500,500]); cmdPoint([100,0]); cmdPoint([500,700]); cmdEnter(); dispatch('N');
      const no = e.b.map(v => +v.toFixed(6));
      SEL.add(e.id); startCmd('align'); cmdPoint([500,500]); cmdPoint([0,0]); cmdEnter();
      const moved = e.a.map(v => +v.toFixed(6));
      SEL.add(e.id); startCmd('align'); cmdPoint([0,0]); cmdPoint([1000,0]); cmdPoint([0,100]); cmdPoint([1000,-100]);
      cancelCmd();
      /* undo puts a copy back in the drawing: read the drawing, not the old object */
      return { no, moved, esc: DOC.ents.get(e.id).a.map(v => +v.toFixed(6)) };`);
    eq(JSON.stringify(r.no), '[500,600]', 'turned upright, still 100 long');
    eq(JSON.stringify(r.moved), '[0,0]', 'one pair and Enter moves');
    eq(JSON.stringify(r.esc), '[0,0]', 'cancelled: nothing happened');
  });
};
