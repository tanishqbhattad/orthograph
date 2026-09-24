'use strict';
/* ============================================================
   B1 — FILLET, CHAMFER and JOIN as AutoCAD 2025 runs them
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; VS.trimmode = 1; DOC.filletR = 0; DOC.chamD = 0;
  MODSET.chamD2 = null; MODSET.chamL = 0; MODSET.chamAng = 0; MODSET.chamAngle = false;
  V.w = 1200; V.h = 800; V.z = 0.2; V.px = 200; V.py = 600; V.rot = 0;
  ST.snap = null; ST.raw = null; ST.shift = false;
  cancelCmd(); SEL.clear(); DOC.cur = '0';
`;
const ents = `[...DOC.ents.values()]`;
module.exports = ({ group, t, ok, eq, close, R }) => {
  group('B1 FILLET');

  t('says its settings and asks AutoCAD\'s questions', () => {
    const r = R(`${SETUP}
      DOC.filletR = 250;
      begin(); addEnt({t:'line', a:[0,0], b:[1000,0]}); addEnt({t:'line', a:[2000,500], b:[2000,2000]}); commit('x');
      startCmd('fillet');
      const set = CLI.lines[CLI.lines.length - 1].t, p1 = PROMPT.text;
      cmdPoint([500, 0]);
      const p2 = PROMPT.text;
      endCmd(true);
      return { set, p1, p2 };`);
    eq(r.set, 'Current settings: Mode = TRIM, Radius = 250');
    eq(r.p1, 'Select first object or [Undo/Polyline/Radius/Trim/Multiple]:');
    eq(r.p2, 'Select second object or shift-select to apply corner or [Radius]:');
  });

  t('two crossing lines fillet in the quadrant both picks are in', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[-2000,0], b:[2000,0]}); addEnt({t:'line', a:[0,-2000], b:[0,2000]}); commit('x');
      startCmd('fillet'); dispatch('R'); dispatch('500');
      cmdPoint([-1500, 0]); cmdPoint([0, 1500]);
      const arc = ${ents}.find(e => e.t === 'arc');
      const L = ${ents}.filter(e => e.t === 'line').map(e => [e.a, e.b]);
      return { c: arc && arc.c, r: arc && arc.r, L };`);
    eq(JSON.stringify(r.c.map(Math.round)), '[-500,500]', 'the arc sits in the upper-left corner');
    close(r.r, 500, 1e-9);
    const spans = r.L.map(s => JSON.stringify(s.map(p => p.map(Math.round))));
    ok(spans.includes('[[-2000,0],[-500,0]]'), 'the horizontal keeps its left arm: ' + spans);
    ok(spans.includes('[[0,500],[0,2000]]'), 'the vertical keeps its upper arm: ' + spans);
  });

  t('radius 0 runs two lines on to a sharp corner; so does a Shift-pick', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[1500,0]}); addEnt({t:'line', a:[2000,500], b:[2000,2000]}); commit('x');
      DOC.filletR = 300;
      startCmd('fillet'); cmdPoint([700, 0]); ST.shift = true; cmdPoint([2000, 1200]); ST.shift = false;
      const arcs = ${ents}.filter(e => e.t === 'arc').length;
      const ends = ${ents}.map(e => Math.min(dist(e.a, [2000,0]), dist(e.b, [2000,0])));
      return { arcs, ends, rad: DOC.filletR };`);
    eq(r.arcs, 0, 'a corner, not an arc');
    ok(r.ends.every(d => d < 1e-9), 'both reach 2000,0: ' + r.ends);
    eq(r.rad, 300, 'and the radius setting is left alone');
  });

  t('two parallel lines get the half circle joining them', () => {
    const r = R(`${SETUP}
      DOC.filletR = 50;
      begin(); addEnt({t:'line', a:[0,0], b:[3000,0]}); addEnt({t:'line', a:[0,1000], b:[2000,1000]}); commit('x');
      startCmd('fillet'); cmdPoint([2800, 0]); cmdPoint([1500, 1000]);
      const arc = ${ents}.find(e => e.t === 'arc');
      const top = ${ents}.find(e => e.t === 'line' && e.a[1] === 1000);
      return { c: arc && arc.c, r: arc && arc.r, mid: arc && arcPt(arc, 0.5), topEnd: top && Math.max(top.a[0], top.b[0]), rad: DOC.filletR };`);
    eq(JSON.stringify(r.c), '[3000,500]', 'at the end of the first line nearer its pick');
    close(r.r, 500, 1e-9, 'half the spacing');
    close(r.mid[0], 3500, 1e-9, 'bulging out past the ends');
    close(r.topEnd, 3000, 1e-9, 'and the second line runs on to meet it');
    eq(r.rad, 50, 'FILLETRAD is not changed by it');
  });

  t('a line to an arc is tangent to both, and the arc keeps the part picked', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'line', a:[-3000,0], b:[3000,0]});
      addEnt({t:'arc', c:[0,1500], r:1000, a0:Math.PI, a1:2*Math.PI});   /* the lower half */
      commit('x');
      /* the arc bottoms out 500 above the line: a 300 fillet bridges it */
      startCmd('fillet'); dispatch('R'); dispatch('300');
      cmdPoint([-2500, 0]); cmdPoint([-1000 * Math.cos(0.3), 1500 - 1000 * Math.sin(0.3)]);
      const arcs = ${ents}.filter(e => e.t === 'arc');
      const f = arcs.find(a => Math.abs(a.r - 300) < 1e-9), big = arcs.find(a => Math.abs(a.r - 1000) < 1e-9);
      return { toLine: f && Math.abs(f.c[1]), toArc: f && dist(f.c, [0,1500]),
               bigEnd: big && arcPt(big, 1), bigStart: big && arcPt(big, 0) };`);
    close(r.toLine, 300, 1e-9, 'r off the line');
    close(r.toArc, 1300, 1e-9, 'and r off the arc');
    /* the picked (left) part stays: from its untouched left end to the tangent point */
    close(r.bigStart[0], -1000, 1e-9, 'the left end is where it was');
    close(r.bigEnd[0], -5000 / 13, 1e-6, 'and it now ends at the tangent point');
    close(r.bigEnd[1], 1500 - 12000 / 13, 1e-6);
  });

  /* Found driving the real program: two arcs a gap apart, picked on their
     upper halves, came back as two nearly-whole CIRCLES. A tangent point just
     outside an arc was reached the long way round. */
  t('two arcs a gap apart fillet across the gap, and neither grows round its circle', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'arc', c:[0,0], r:1000, a0:-0.5, a1:1.2});
      addEnt({t:'arc', c:[2200,0], r:1000, a0:1.9, a1:3.6});
      commit('x');
      startCmd('fillet'); dispatch('R'); dispatch('300');
      cmdPoint([1000*Math.cos(0.4), 1000*Math.sin(0.4)]);
      cmdPoint([2200 + 1000*Math.cos(2.7), 1000*Math.sin(2.7)]);
      const arcs = ${ents}.filter(e => e.t === 'arc');
      const f = arcs.find(a => Math.abs(a.r - 300) < 1e-9);
      const big = arcs.filter(a => Math.abs(a.r - 1000) < 1e-9).map(a => deg(arcSweep(a)));
      const t1 = f && arcPt(f, 0), t2 = f && arcPt(f, 1);
      return { c: f && f.c, big, onA: f && Math.abs(dist(t1, [0,0]) - 1000) + Math.abs(dist(t2, [2200,0]) - 1000) };`);
    eq(JSON.stringify(r.c.map(v => Math.round(v))), '[1100,693]', 'the fillet nearer the picks, over the gap');
    ok(r.big.every(s => s < 97.5), 'each arc is cut back, not wrapped round: sweeps ' + r.big.map(s => s.toFixed(1)));
    close(r.onA, 0, 1e-6, 'and the fillet ends on both');
  });

  t('a circle is never trimmed', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[-3000,0], b:[3000,0]}); addEnt({t:'circle', c:[0,1500], r:1000}); commit('x');
      startCmd('fillet'); dispatch('R'); dispatch('300');
      cmdPoint([-2000, 0]); cmdPoint([-800, 900]);
      return ${ents}.map(e => e.t).sort().join(',');`);
    eq(r, 'arc,circle,line');
  });

  t('Polyline fillets every corner, and filleting again replaces the old arcs', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'pline', pts:[[0,0],[2000,0],[2000,1000],[0,1000]], closed:true}); commit('x');
      startCmd('fillet'); dispatch('R'); dispatch('100'); dispatch('P'); cmdPoint([1000, 0]);
      const said = CLI.lines[CLI.lines.length - 1].t;
      const p = ${ents}[0];
      const one = { n: p.pts.length, b: p.bulges.filter(Boolean).length };
      startCmd('fillet'); dispatch('R'); dispatch('300'); dispatch('P'); cmdPoint([1000, 0]);
      const q = ${ents}[0];
      const two = { n: q.pts.length, first: q.pts[0], r: bulgeArc(q.pts[0], q.pts[1], q.bulges[0]) };
      startCmd('fillet'); dispatch('R'); dispatch('0'); dispatch('P'); cmdPoint([1000, 0]);
      const z = ${ents}[0];
      return { said, one, two, back: z.pts.map(q => q.map(v => +v.toFixed(9))), bz: !!z.bulges };`);
    eq(r.said, '4 lines were filleted');
    eq(JSON.stringify(r.one), JSON.stringify({ n: 8, b: 4 }), 'four arcs in, each corner two vertices');
    eq(r.two.n, 8, 'at a new radius the old arcs are replaced, not filleted again');
    ok(r.two.r && Math.abs(r.two.r.r - 300) < 1e-9, 'and they are the new radius');
    eq(JSON.stringify(r.back), JSON.stringify([[0,0],[2000,0],[2000,1000],[0,1000]]), 'radius 0 takes them out again');
    eq(r.bz, false);
  });

  t('a line filleted to the end of a polyline becomes part of it', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'pline', pts:[[0,0],[1000,0],[2000,0]]}); addEnt({t:'line', a:[2500,500], b:[2500,2000]}); commit('x');
      startCmd('fillet'); dispatch('R'); dispatch('200'); cmdPoint([1500, 0]); cmdPoint([2500, 1500]);
      const all = ${ents};
      const p = all[0];
      return { n: all.length, t: p.t, pts: p.pts.map(q => q.map(v => Math.round(v))), arcs: (p.bulges || []).filter(Boolean).length };`);
    eq(r.n, 1, 'one object');
    eq(r.t, 'pline');
    eq(JSON.stringify(r.pts), JSON.stringify([[0,0],[1000,0],[2300,0],[2500,200],[2500,2000]]));
    eq(r.arcs, 1, 'with the fillet as its arc segment');
  });

  t('Multiple keeps going, Undo takes one back, and the command is one step', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'line', a:[0,0], b:[1000,0]}); addEnt({t:'line', a:[1000,0], b:[1000,1000]});
      addEnt({t:'line', a:[3000,0], b:[4000,0]}); addEnt({t:'line', a:[4000,0], b:[4000,1000]});
      commit('x');
      startCmd('fillet'); dispatch('R'); dispatch('100'); dispatch('M');
      cmdPoint([500, 0]); cmdPoint([1000, 500]);
      cmdPoint([3500, 0]); cmdPoint([4000, 500]);
      const two = ${ents}.filter(e => e.t === 'arc').length;
      dispatch('U');
      const one = ${ents}.filter(e => e.t === 'arc').length, up = !!CMD;
      cmdEnter();
      undo();
      const none = ${ents}.filter(e => e.t === 'arc').length;
      return { two, one, up, none };`);
    eq(r.two, 2); eq(r.one, 1, 'U took back only the second'); eq(r.up, true);
    eq(r.none, 0, 'and one U afterwards takes back the whole command');
  });

  t('the arc goes on the shared layer and pen, or the current layer if they differ', () => {
    const r = R(`${SETUP}
      DOC.layers.push(newLayer('A-DETL')); DOC.layers.push(newLayer('A-ANNO'));
      begin();
      addEnt({t:'line', a:[0,0], b:[1000,0], layer:'A-DETL', color:'#ff0000'});
      addEnt({t:'line', a:[1000,0], b:[1000,1000], layer:'A-DETL', color:'#ff0000'});
      addEnt({t:'line', a:[3000,0], b:[4000,0], layer:'A-DETL'});
      addEnt({t:'line', a:[4000,0], b:[4000,1000], layer:'A-ANNO'});
      commit('x');
      DOC.cur = '0';
      startCmd('fillet'); dispatch('R'); dispatch('100'); dispatch('M');
      cmdPoint([500, 0]); cmdPoint([1000, 500]); cmdPoint([3500, 0]); cmdPoint([4000, 500]);
      endCmd(true);
      return ${ents}.filter(e => e.t === 'arc').map(a => [a.layer, a.color]).sort();`);
    eq(JSON.stringify(r), JSON.stringify([['0', null], ['A-DETL', '#ff0000']]));
  });

  t('a radius too large for the lines changes nothing and says so', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[500,0]}); addEnt({t:'line', a:[500,0], b:[500,500]}); commit('x');
      startCmd('fillet'); dispatch('R'); dispatch('2000'); cmdPoint([250, 0]); cmdPoint([500, 250]);
      const said = CLI.lines[CLI.lines.length - 1].t;
      endCmd(true);
      return { n: DOC.ents.size, said };`);
    eq(r.n, 2);
    ok(/too large/i.test(r.said), r.said);
  });

  group('B1 CHAMFER');

  t('Distance takes two, the first on the first line picked', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[2000,0]}); addEnt({t:'line', a:[2000,0], b:[2000,2000]}); commit('x');
      startCmd('chamfer'); dispatch('D'); dispatch('300'); dispatch('500');
      cmdPoint([1000, 0]); cmdPoint([2000, 1000]);
      const d = ${ents}.find(e => e.t === 'line' && Math.abs(e.a[0]-e.b[0]) > 1 && Math.abs(e.a[1]-e.b[1]) > 1);
      return d && [d.a, d.b].map(p => p.map(Math.round)).sort();`);
    eq(JSON.stringify(r), JSON.stringify([[1700, 0], [2000, 500]]));
  });

  t('Angle works at a corner that is not square', () => {
    const r = R(`${SETUP}
      /* 60 degrees between the arms */
      begin(); addEnt({t:'line', a:[0,0], b:[2000,0]}); addEnt({t:'line', a:[0,0], b:[1000, 1000*Math.sqrt(3)]}); commit('x');
      startCmd('chamfer'); dispatch('A'); dispatch('400'); dispatch('60');
      cmdPoint([1500, 0]); cmdPoint([500, 500*Math.sqrt(3)]);
      const d = ${ents}.find(e => e.t === 'line' && e !== ${ents}[0] && e !== ${ents}[1]);
      const lines = ${ents}.filter(e => e.t === 'line');
      const ch = lines[2];
      return ch && { a: ch.a, b: ch.b };`);
    /* an equilateral corner: a 60 degree chamfer 400 along the first arm meets the second 400 along */
    const pts = [r.a, r.b].sort((p, q) => p[1] - q[1]);
    close(pts[0][0], 400, 1e-9); close(pts[0][1], 0, 1e-9);
    close(Math.hypot(pts[1][0], pts[1][1]), 400, 1e-9);
  });

  t('Polyline chamfers every corner', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'pline', pts:[[0,0],[2000,0],[2000,1000],[0,1000]], closed:true}); commit('x');
      startCmd('chamfer'); dispatch('D'); dispatch('100'); dispatch('100'); dispatch('P'); cmdPoint([1000, 0]);
      return { said: CLI.lines[CLI.lines.length - 1].t, n: ${ents}[0].pts.length };`);
    eq(r.said, '4 lines were chamfered'); eq(r.n, 8);
  });

  group('B1 JOIN');

  t('lines and arcs that meet end to end become one polyline, arcs kept', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'line', a:[0,0], b:[1000,0]});
      addEnt({t:'arc', c:[1000,500], r:500, a0:-Math.PI/2, a1:Math.PI/2});
      addEnt({t:'line', a:[1000,1000], b:[0,1000]});
      commit('x');
      for (const e of DOC.ents.values()) SEL.add(e.id);
      startCmd('join');
      const all = ${ents};
      return { n: all.length, t: all[0].t, pts: all[0].pts, b: all[0].bulges, said: CLI.lines[CLI.lines.length - 1].t };`);
    eq(r.n, 1); eq(r.t, 'pline');
    eq(JSON.stringify(r.pts), JSON.stringify([[0,0],[1000,0],[1000,1000],[0,1000]]));
    close(r.b[1], 1, 1e-9, 'the half circle is a bulge of 1');
    ok(/3 objects converted into 1 polyline/.test(r.said), r.said);
  });

  t('collinear lines join across a gap when they are all that is selected', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[1000,0]}); addEnt({t:'line', a:[1500,0], b:[3000,0]}); commit('x');
      for (const e of DOC.ents.values()) SEL.add(e.id);
      startCmd('join');
      const all = ${ents};
      return { n: all.length, t: all[0].t, x: [all[0].a[0], all[0].b[0]] };`);
    eq(r.n, 1); eq(r.t, 'line'); eq(JSON.stringify(r.x), '[0,3000]');
  });

  t('arcs on one circle join across a gap; a lone arc closes with cLose', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'arc', c:[0,0], r:500, a0:0, a1:1});
      addEnt({t:'arc', c:[0,0], r:500, a0:1.5, a1:2.5});
      commit('x');
      for (const e of DOC.ents.values()) SEL.add(e.id);
      startCmd('join');
      const one = ${ents}.map(e => [e.t, +e.a0.toFixed(6), +e.a1.toFixed(6)]);
      SEL.clear(); SEL.add(${ents}[0].id);
      startCmd('join');
      const p = PROMPT.text;
      dispatch('L');
      return { one, p, t: ${ents}[0].t };`);
    eq(JSON.stringify(r.one), JSON.stringify([['arc', 0, 2.5]]), 'one arc, 0 to 2.5, over the gap');
    eq(r.p, 'Select arcs to join to source or [cLose]:');
    eq(r.t, 'circle');
  });

  t('a closed run comes back closed, and what cannot join is reported', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'line', a:[0,0], b:[1000,0]}); addEnt({t:'line', a:[1000,0], b:[1000,1000]});
      addEnt({t:'line', a:[1000,1000], b:[0,0]}); addEnt({t:'circle', c:[5000,0], r:100});
      commit('x');
      for (const e of DOC.ents.values()) SEL.add(e.id);
      startCmd('join');
      const p = ${ents}.find(e => e.t === 'pline');
      return { closed: p && p.closed, n: p && p.pts.length, said: CLI.lines[CLI.lines.length - 1].t };`);
    eq(r.closed, true); eq(r.n, 3);
    ok(/1 object discarded/.test(r.said), r.said);
  });
};
