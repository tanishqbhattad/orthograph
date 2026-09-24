'use strict';
/* ============================================================
   A2 — object snaps, measured against AutoCAD 2025
   ------------------------------------------------------------
   Every test states what AutoCAD does and drives the engine the
   way a pick does: snapPoint() at a screen position, then the
   command's cmdPoint() with the point that came back. Exact
   means exact: 1e-9, not "about right".
   ============================================================ */

/* A clean board: a 1:1 view with y up, running modes pinned per test. */
const SETUP = `
  if (typeof CMD !== 'undefined' && CMD) cancelCmd();
  resetDoc();
  DOC.gridStep = 100; DOC.snapStep = 100;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ST.osnap = true; ST.ortho = false; ST.polar = false; ST.snapgrid = false;
  ST.otrack = false; ST.trackPolar = true; ST.polarRel = false; ST.polarExtra.length = 0;
  ST.polarInc = 45; ST.snapCycle = 0; ST.snapScr = null; ST.snapCycled = false;
  ST.aperture = 10; ST.markerSize = 6; ST.apBox = false;
  ST.trackPts.length = 0; ST.parRefs.length = 0; ST.extPts.length = 0; ST.tracks = null;
  ST.snapCands = null; ST.snap = null;
  ST.osnapOne = null; ST.osnapOneShot = false; ST.ptMod = null; ST.fromBase = null;
  ST.defer = null; ST.xpick = null; ST.osPrompt = null;
  toggleSnap('none');
  const onlyModes = (...ks) => { toggleSnap('none'); for (const k of ks) ST.osnapOn[k] = 1; };
  const at = (x, y) => { const s = w2s([x, y]); return snapPoint(s[0], s[1], refPoint()); };
  const pick = (x, y) => { const p = at(x, y); cmdPoint(p); return p; };
  const last = () => CLI.lines[CLI.lines.length - 1].t;
  const lineEnts = () => [...DOC.ents.values()].filter(e => e.t === 'line');
`;

module.exports = ({ group, t, ok, eq, close, R }) => {

  /* ============================================================ */
  group('A2 one-shot overrides answer the way AutoCAD does');

  t('typing END makes the prompt "of", and the history line reads "…: end of"', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[200,0]});
      startCmd('line'); runInput('end');
      return { hist: last(), base: PROMPT.base, one: ST.osnapOne };`);
    eq(r.hist, 'Specify first point: end of');
    eq(r.base, 'of');
    eq(r.one, 'end');
  });

  t('PER, TAN, NEA and PAR point AT something, so they prompt "to"', () => {
    const r = R(`${SETUP}
      const out = [];
      for (const w of ['per', 'tan', 'nea', 'par']) {
        startCmd('line'); runInput(w); out.push(PROMPT.base); cancelCmd();
      }
      return out;`);
    eq(r.join(','), 'to,to,to,to');
  });

  t('a one-shot that finds nothing is refused, not quietly given the raw cursor', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[200,0]});
      startCmd('line'); runInput('end');
      pick(100, 300);
      return { pts: CMD.pts.length, msg: last(), one: ST.osnapOne, base: PROMPT.base.replace(/:\s*$/, '') };`);
    eq(r.pts, 0, 'the command must not have been given a point');
    eq(r.msg, 'No Endpoint found for specified point.');
    eq(r.one, null, 'the override is used up');
    eq(r.base, 'Specify first point', 'and the command asks again');
  });

  t('END, then a click on the line near the end you want, takes that end', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[200,0]});
      startCmd('line'); runInput('end');
      pick(150, 3);
      return CMD.pts[0];`);
    eq(JSON.stringify(r), '[200,0]');
  });

  t('MID, then a click anywhere on the line, takes its midpoint', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[200,0]});
      startCmd('line'); runInput('mid');
      pick(30, 2);
      return { p: CMD.pts[0], hist: CLI.lines.slice(-2).map(l => l.t) };`);
    eq(JSON.stringify(r.p), '[100,0]');
  });

  t('QUA, then a click on the rim, takes the nearest quadrant', () => {
    const r = R(`${SETUP}
      addEnt({t:'circle', c:[500,400], r:150});
      startCmd('line'); runInput('qua');
      const a = 1.2; pick(500 + 150 * Math.cos(a), 400 + 150 * Math.sin(a));
      return CMD.pts[0];`);
    eq(JSON.stringify(r), '[500,550]');
  });

  /* ============================================================ */
  group('A2 the aperture finds the object, the mode finds the point');

  t('with END and MID running, crossing a line shows the nearer of its end and middle', () => {
    const r = R(`${SETUP}
      onlyModes('end', 'mid');
      addEnt({t:'line', a:[0,0], b:[400,0]});
      at(90, 2); const k1 = ST.snap && ST.snap.k, p1 = ST.snap && ST.snap.p;
      at(160, 2); const k2 = ST.snap && ST.snap.k, p2 = ST.snap && ST.snap.p;
      at(160, 40); const none = ST.snap;
      return { k1, p1, k2, p2, none };`);
    eq(r.k1, 'end'); eq(JSON.stringify(r.p1), '[0,0]');
    eq(r.k2, 'mid'); eq(JSON.stringify(r.p2), '[200,0]');
    eq(r.none, null, 'off the line, nothing is under the aperture');
  });

  t('a point inside the aperture always beats a far one', () => {
    const r = R(`${SETUP}
      onlyModes('end', 'mid', 'int');
      addEnt({t:'line', a:[0,0], b:[400,0]});
      addEnt({t:'line', a:[120,-100], b:[120,100]});
      at(124, 3);
      return { k: ST.snap.k, p: ST.snap.p };`);
    eq(r.k, 'int'); eq(JSON.stringify(r.p), '[120,0]');
  });

  /* ============================================================ */
  group('A2 deferred perpendicular and tangent');

  t('LINE, TAN, TAN: the line is the common tangent of the two circles, exactly', () => {
    const r = R(`${SETUP}
      addEnt({t:'circle', c:[0,300], r:100});
      addEnt({t:'circle', c:[700,300], r:200});
      startCmd('line');
      runInput('tan'); at(0, 400); const k1 = ST.snap && ST.snap.k, tip = ST.snapTip; cmdPoint(ST.snap.p);
      runInput('tan'); pick(700, 500);
      const L = lineEnts()[0];
      return { k1, tip, a: L && L.a, b: L && L.b };`);
    eq(r.k1, 'tand', 'the first pick has nothing to be tangent from yet');
    eq(r.tip, 'Deferred Tangent');
    ok(r.a && r.b, 'a line was drawn');
    const d = (p, a, b) => Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    close(d([0, 300], r.a, r.b), 100, 1e-9, 'tangent to the first circle');
    close(d([700, 300], r.a, r.b), 200, 1e-9, 'tangent to the second');
    close(Math.hypot(r.a[0], r.a[1] - 300), 100, 1e-9, 'starts on the first circle');
    close(Math.hypot(r.b[0] - 700, r.b[1] - 300), 200, 1e-9, 'ends on the second');
    ok(r.a[1] > 300 && r.b[1] > 300, 'on the side that was picked');
  });

  t('LINE, PER on a line, then a point: the line drops square onto it', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[1000,100]});
      startCmd('line');
      runInput('per'); at(300, 31); const k1 = ST.snap && ST.snap.k; cmdPoint(ST.snap.p);
      ST.osnap = false; pick(600, 700);
      const L = lineEnts().find(e => e.b[0] === 600);
      return { k1, a: L && L.a, b: L && L.b };`);
    eq(r.k1, 'perpd');
    ok(r.a, 'a line was drawn');
    const u = [1000, 100], v = [r.b[0] - r.a[0], r.b[1] - r.a[1]];
    close((u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v), 0, 1e-12, 'square to the line');
    close(r.a[1], r.a[0] / 10, 1e-9, 'and its foot is on the line');
  });

  /* ============================================================ */
  group('A2 exact answers');

  t('nearest on a circle is ON the circle, not on a 32-gon inside it', () => {
    const r = R(`${SETUP}
      onlyModes('near');
      addEnt({t:'circle', c:[523.4, 367.8], r:221.9});
      const a = 0.7 + Math.PI / 32;
      at(523.4 + 224 * Math.cos(a), 367.8 + 224 * Math.sin(a));
      return ST.snap && ST.snap.p;`);
    close(Math.hypot(r[0] - 523.4, r[1] - 367.8), 221.9, 1e-9);
  });

  t('an arc and a line meet at a point on both, to 1e-9', () => {
    const r = R(`${SETUP}
      onlyModes('int');
      addEnt({t:'arc', c:[400,300], r:250, a0:0, a1:Math.PI});
      addEnt({t:'line', a:[100,380], b:[900,430.7]});
      /* the analytic crossing, found independently */
      const c = [400,300], R0 = 250, A = [100,380], B = [900,430.7];
      const d = [B[0]-A[0], B[1]-A[1]], f = [A[0]-c[0], A[1]-c[1]];
      const qa = d[0]*d[0]+d[1]*d[1], qb = 2*(f[0]*d[0]+f[1]*d[1]), qc = f[0]*f[0]+f[1]*f[1]-R0*R0;
      const tt = (-qb + Math.sqrt(qb*qb-4*qa*qc)) / (2*qa);
      const X = [A[0]+d[0]*tt, A[1]+d[1]*tt];
      at(X[0] + 2, X[1] + 1);
      return { k: ST.snap && ST.snap.k, p: ST.snap && ST.snap.p, X };`);
    eq(r.k, 'int');
    close(Math.hypot(r.p[0] - 400, r.p[1] - 300), 250, 1e-9, 'on the arc');
    const A = [100, 380], B = [900, 430.7];
    const off = ((B[0] - A[0]) * (A[1] - r.p[1]) - (A[0] - r.p[0]) * (B[1] - A[1])) / Math.hypot(B[0] - A[0], B[1] - A[1]);
    close(off, 0, 1e-9, 'on the line');
  });

  t('a line and an ellipse meet on the ellipse itself', () => {
    const r = R(`${SETUP}
      onlyModes('int');
      addEnt({t:'ellipse', c:[500,400], rx:300, ry:120, rot:0.4});
      addEnt({t:'line', a:[500,0], b:[520,800]});
      const hits = [];
      for (let y = 200; y <= 600; y += 4) { at(500 + (y / 800) * 20, y); if (ST.snap && ST.snap.k === 'int') hits.push(ST.snap.p); }
      return hits;`);
    ok(r.length > 0, 'the crossing was found');
    for (const p of r) {
      const dx = p[0] - 500, dy = p[1] - 400, c = Math.cos(0.4), s = Math.sin(0.4);
      const x = dx * c + dy * s, y = -dx * s + dy * c;
      close((x / 300) ** 2 + (y / 120) ** 2, 1, 1e-12, 'on the ellipse');
      close(p[0], 500 + p[1] / 40, 1e-9, 'on the line');
    }
  });

  t('a polyline arc span: its midpoint, its centre and a crossing, all exact', () => {
    const r = R(`${SETUP}
      addEnt({t:'pline', pts:[[0,400],[400,400]], bulges:[1]});
      addEnt({t:'line', a:[300,0], b:[300,800]});
      onlyModes('mid'); at(210, 205); const mid = ST.snap && ST.snap.p, mk = ST.snap && ST.snap.k;
      onlyModes('cen'); at(200, 202); const cen = ST.snap && ST.snap.p, ck = ST.snap && ST.snap.k;
      onlyModes('int'); at(302, 400 - Math.sqrt(30000) + 3); const x = ST.snap && ST.snap.p;
      return { mid, mk, cen, ck, x };`);
    eq(r.mk, 'mid');
    close(r.mid[0], 200, 1e-9); close(r.mid[1], 200, 1e-9, 'the middle of the ARC, not of its chord');
    eq(r.ck, 'cen');
    close(r.cen[0], 200, 1e-9); close(r.cen[1], 400, 1e-9);
    ok(r.x, 'the crossing was found');
    close(r.x[0], 300, 1e-9); close(r.x[1], 400 - Math.sqrt(30000), 1e-9);
  });

  t('the geometric centre of a polyline with an arc span is its true centre of area', () => {
    const r = R(`${SETUP}
      onlyModes('gcen');
      addEnt({t:'pline', pts:[[0,100],[400,100],[400,300],[0,300]], bulges:[0,1,0,0], closed:true});
      at(200, 102);
      return { k: ST.snap && ST.snap.k, p: ST.snap && ST.snap.p };`);
    eq(r.k, 'gcen');
    /* a 400x200 rectangle plus a half disc of radius 100 on its east side */
    const Ar = 400 * 200, As = Math.PI * 100 * 100 / 2;
    const cx = (Ar * 200 + As * (400 + 4 * 100 / (3 * Math.PI))) / (Ar + As);
    close(r.p[0], cx, 1e-9); close(r.p[1], 200, 1e-9);
  });

  /* ============================================================ */
  group('A2 every kind of object snaps');

  t('an elliptical arc offers its two ends, and quadrants only on its sweep', () => {
    const r = R(`${SETUP}
      addEnt({t:'ellipse', c:[500,400], rx:300, ry:150, rot:0, a0:0, a1:Math.PI/2});
      onlyModes('end'); at(790, 440); const e1 = ST.snap && ST.snap.p;
      onlyModes('quad'); at(502, 548); const q1 = ST.snap && ST.snap.p;
      startCmd('line'); runInput('qua'); at(200 + 2, 400); const q2 = ST.snap;
      return { e1, q1, q2 };`);
    ok(r.e1, 'an end'); close(r.e1[0], 800, 1e-9); close(r.e1[1], 400, 1e-9);
    ok(r.q1, 'the top quadrant'); close(r.q1[0], 500, 1e-9); close(r.q1[1], 550, 1e-9);
    eq(r.q2, null, 'the west quadrant is not on this arc');
  });

  t('an arc inside a block is an arc: its centre and its real ends', () => {
    const r = R(`${SETUP}
      DOC.blocks.ARCB = { base:[0,0], ents:[{t:'arc', c:[0,0], r:100, a0:0, a1:Math.PI}] };
      addEnt({t:'insert', name:'ARCB', p:[600,400], rot:Math.PI/2, sx:2, sy:2});
      onlyModes('cen'); at(402, 400); const c = ST.snap && ST.snap.p;
      onlyModes('end'); at(405, 430); const e = ST.snap && ST.snap.p;
      onlyModes('ins'); at(402, 400); const i = ST.snap && ST.snap.p;
      return { c, e, i };`);
    ok(r.c, 'centre'); close(r.c[0], 600, 1e-9); close(r.c[1], 400, 1e-9);
    ok(r.e, 'end'); close(r.e[0], 600, 1e-9); close(r.e[1], 600, 1e-9);
    ok(r.i, 'insertion'); eq(JSON.stringify(r.i), '[600,400]');
  });

  t("a dimension's definition points are NODES", () => {
    const r = R(`${SETUP}
      onlyModes('node');
      addEnt({t:'dim', k:'aligned', p1:[100,100], p2:[700,100], off:200});
      at(103, 102);
      return { k: ST.snap && ST.snap.k, p: ST.snap && ST.snap.p };`);
    eq(r.k, 'node'); eq(JSON.stringify(r.p), '[100,100]');
  });

  t('two grid lines cross at an intersection', () => {
    const r = R(`${SETUP}
      onlyModes('int');
      addEnt({t:'grid', a:[500,0], b:[500,800], label:'1'});
      addEnt({t:'grid', a:[0,400], b:[1000,400], label:'A'});
      at(503, 402);
      return { k: ST.snap && ST.snap.k, p: ST.snap && ST.snap.p };`);
    eq(r.k, 'int'); eq(JSON.stringify(r.p), '[500,400]');
  });

  t('a column is placed by its insertion point, whichever face you point at', () => {
    const r = R(`${SETUP}
      onlyModes('ins');
      addEnt({t:'column', p:[500,400], w:400, d:400});
      at(700, 450);
      return { k: ST.snap && ST.snap.k, p: ST.snap && ST.snap.p };`);
    eq(r.k, 'ins'); eq(JSON.stringify(r.p), '[500,400]');
  });

  t('an xline: nearest along it, and its midpoint is the point it was drawn through', () => {
    const r = R(`${SETUP}
      addEnt({t:'xline', a:[100,300], d:[1,0]});
      onlyModes('near'); at(900, 303); const n = ST.snap && ST.snap.p;
      startCmd('line'); runInput('mid'); pick(900, 302);
      return { n, m: CMD.pts[0] };`);
    ok(r.n, 'nearest'); close(r.n[0], 900, 1e-9); close(r.n[1], 300, 1e-12);
    eq(JSON.stringify(r.m), '[100,300]');
  });

  t('a hatch boundary edge has a midpoint', () => {
    const r = R(`${SETUP}
      addEnt({t:'hatch', loops:[[[0,0],[400,0],[400,300],[0,300]]], pattern:'solid', solid:true});
      startCmd('line'); runInput('mid'); pick(100, 2);
      return CMD.pts[0];`);
    eq(JSON.stringify(r), '[200,0]');
  });

  /* ============================================================ */
  group('A2 extended intersection');

  t('INT on one line, then another: where they would meet if both ran on', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,100], b:[200,100]});
      addEnt({t:'line', a:[700,300], b:[700,700]});
      startCmd('line'); runInput('int');
      at(80, 101); const k1 = ST.snap && ST.snap.k; cmdPoint(ST.snap.p);
      const hist = last(), base = PROMPT.base, n1 = CMD.pts.length;
      pick(701, 500);
      return { k1, hist, base, n1, p: CMD.pts[0] };`);
    eq(r.k1, 'xint1');
    eq(r.n1, 0, 'the first object is not a point');
    ok(/int of and$/.test(r.hist), 'the history reads "int of and": ' + r.hist);
    eq(r.base, 'and');
    eq(JSON.stringify(r.p), '[700,100]');
  });

  /* ============================================================ */
  group('A2 system variables and the keyboard');

  t('OSMODE: 1024 is Geometric Center and 16384 suppresses running snaps', () => {
    const r = R(`${SETUP}
      setOsmode(1024 | 1);
      const a = { gcen: ST.osnapOn.gcen, end: ST.osnapOn.end, quad: ST.osnapOn.quad, os: ST.osnap };
      setOsmode(16384 | 1);
      const b = { os: ST.osnap, back: osmode() };
      setOsmode(1 | 2 | 4); ST.osnap = true;
      return { a, b };`);
    eq(r.a.gcen, 1); eq(r.a.end, 1); eq(r.a.quad, 0); eq(r.a.os, true);
    eq(r.b.os, false); eq(r.b.back, 16385);
  });

  t('APERTURE is the aperture the snap actually uses', () => {
    const r = R(`${SETUP}
      onlyModes('node');
      addEnt({t:'point', p:[500,400]});
      runInput('aperture 5'); at(507, 400); const small = ST.snap;
      runInput('aperture 10'); at(507, 400); const big = ST.snap && ST.snap.p;
      return { small, big, ap: ST.aperture };`);
    eq(r.small, null, '7px out is outside a 5px aperture');
    eq(JSON.stringify(r.big), '[500,400]', 'and inside a 10px one');
    eq(r.ap, 10, 'the dialog and the variable are one number');
  });

  t('the keyboard crosshair has a snap to ask — snapAt', () => {
    const r = R(`${SETUP}
      onlyModes('end');
      addEnt({t:'line', a:[0,0], b:[200,0]});
      const s = w2s([3, 2]);
      const c = snapAt(s[0], s[1], null);
      return { fn: typeof snapAt, k: c && c.k, p: c && c.p };`);
    eq(r.fn, 'function'); eq(r.k, 'end'); eq(JSON.stringify(r.p), '[0,0]');
  });

  t('Tab after an undo never offers a point on geometry that has gone', () => {
    const r = R(`${SETUP}
      onlyModes('end', 'mid');
      begin(); const L = addEnt({t:'line', a:[0,0], b:[200,0]}); commit('l');
      at(3, 2);
      const before = ST.snapCands.length;
      undo();
      const c = cycleSnap(1);
      return { before, after: (ST.snapCands || []).length, c };`);
    ok(r.before > 0, 'there was something to cycle');
    eq(r.after, 0, 'after the undo there is nothing');
    eq(r.c, null);
  });

  /* ============================================================ */
  group('A2 speed');

  t('finding the snap in a 40,000-object drawing stays well under a frame', () => {
    const r = R(`${SETUP}
      toggleSnap('all');
      let n = 0;
      for (let i = 0; i < 200; i++) for (let j = 0; j < 50; j++) {
        const x = i * 600, y = j * 600;
        addEnt({t:'line', a:[x, y], b:[x + 500, y + 40]});
        addEnt({t:'arc', c:[x + 250, y + 300], r:180, a0:0.2, a1:2.8});
        addEnt({t:'circle', c:[x + 450, y + 450], r:60});
        addEnt({t:'pline', pts:[[x, y + 520], [x + 300, y + 520], [x + 300, y + 580]], bulges:[0, 0.4]});
        n += 4;
      }
      const clk = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const times = [];
      /* at a working zoom, where a drafter actually snaps */
      V.z = 0.5; V.px = -20000; V.py = 3000;
      for (let k = 0; k < 400; k++) {
        const sx = (k * 97) % 1200, sy = (k * 61) % 800;
        const t0 = clk(); snapPoint(sx, sy, s2w(600, 400)); times.push(clk() - t0);
      }
      /* zoomed right out, where the aperture covers dozens of objects */
      fit();
      const far = [];
      for (let k = 0; k < 200; k++) {
        const sx = (k * 53) % 1200, sy = (k * 37) % 800;
        const t0 = clk(); snapPoint(sx, sy, null); far.push(clk() - t0);
      }
      times.sort((a, b) => a - b); far.sort((a, b) => a - b);
      const q = (a, f) => a[Math.min(a.length - 1, Math.floor(a.length * f))];
      return { n, p50: q(times, .5), p95: q(times, .95), max: times[times.length - 1],
               fp50: q(far, .5), fp95: q(far, .95), fmax: far[far.length - 1] };`);
    eq(r.n, 40000);
    ok(r.p95 < 8, 'working zoom, 95th percentile ' + r.p95.toFixed(2) + 'ms (p50 ' + r.p50.toFixed(2) + ')');
    ok(r.fp95 < 12, 'zoomed out, 95th percentile ' + r.fp95.toFixed(2) + 'ms (p50 ' + r.fp50.toFixed(2) + ')');
  });
};
