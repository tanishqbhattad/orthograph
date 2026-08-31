'use strict';
/* ============================================================
   8.8 — linetypes that fit the line they are on

   Every linetype in every CAD program is an "A"-type: the A
   stands for aligned, and it means the pattern is stretched a
   little so that the line BEGINS and ENDS with a dash. It is
   not decoration. A centre line whose ends are gaps does not
   read as a centre line, a hidden line that stops mid-gap looks
   like two hidden lines, and a segment shorter than one period
   of the pattern lands in a gap and draws nothing at all — a
   line you have drawn, saved, and cannot see.

   AutoCAD has one more decision on top: PLINEGEN. Off, every
   segment of a polyline starts and ends with a dash. On, the
   pattern runs continuously round the whole thing and only the
   two open ends are dashes.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 400; V.rot = 0;
  DOC.ltScale = 1; VS.plinegen = false;
  const ctx2 = document.getElementById('cv').getContext('2d');
  const dashes = () => { shapeCacheClear(); ctx2.__trace.dashes.length = 0; paint();
    return ctx2.__trace.dashes.filter(a => a && a.length); };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('a pattern is fitted to the line it is on');

  /* The failure that matters: a line you have drawn, saved and cannot see. */
  t('a segment shorter than the pattern is drawn solid, not blank', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'line', a:[0,0], b:[3,0], lt:'dashed', layer:'0'});
      commit('l');
      V.z = 1;
      const c = ctx2;
      c.__trace.counts.stroke = 0; c.__trace.dashes.length = 0;
      paint();
      const strokes = c.__trace.counts.stroke || 0;
      const dashed = c.__trace.dashes.filter(a => a && a.length).length;
      return { strokes, dashed };`);
    ok(r.strokes > 0, 'the line is drawn at all');
    eq(r.dashed, 0, 'and drawn solid, because a dash pattern would leave nothing');
  });

  t('a fitted pattern is a whole number of periods plus the closing dash', () => {
    const r = R(`${SETUP}
      /* 1000 units at zoom 1 is 1000px; the dashed pattern is 12.7 on, 6.35 off */
      const fit = dashFitFor('dashed', 1000);
      const period = fit[0] + fit[1];
      const n = (1000 - fit[0]) / period;
      return { fit, period, n: +n.toFixed(6), whole: Math.abs(n - Math.round(n)) < 1e-6 };`);
    eq(r.whole, true, 'the pattern lands exactly: ' + r.n + ' periods of ' + r.period);
    ok(r.fit[0] > 0 && r.fit[1] > 0, 'and both parts of it are real: ' + r.fit.join(','));
  });

  t('the stretch is small — a fitted dash is still recognisably that dash', () => {
    const r = R(`${SETUP}
      const worst = [];
      for (let L = 60; L < 4000; L += 7) {
        const base = dashFor('dashed'), fit = dashFitFor('dashed', L);
        worst.push(fit[0] / base[0]);
      }
      return { min: Math.min(...worst), max: Math.max(...worst) };`);
    ok(r.min > 0.7, 'never squashed past recognition: ' + r.min.toFixed(3));
    ok(r.max < 1.4, 'and never stretched past it: ' + r.max.toFixed(3));
  });

  t('a closed shape closes on the pattern, with no stub at the join', () => {
    const r = R(`${SETUP}
      const L = 2000;
      const fit = dashFitClosed('dashed', L);
      const period = fit.reduce((a, b) => a + b, 0);
      const n = L / period;
      return { n: +n.toFixed(6), whole: Math.abs(n - Math.round(n)) < 1e-6 };`);
    eq(r.whole, true, 'a whole number of periods goes round: ' + r.n);
  });

  group('polylines');

  t('by default every segment starts and ends with a dash', () => {
    const r = R(`${SETUP}
      VS.plinegen = false;
      begin();
      addEnt({t:'pline', pts:[[0,0],[900,0],[900,300]], closed:false, lt:'dashed', layer:'0'});
      commit('p');
      const d = dashes();
      return { n: d.length, arrays: d.map(a => +a[0].toFixed(3)) };`);
    ok(r.n >= 2, 'the two segments are stroked separately: ' + r.n);
    ok(r.arrays[0] !== r.arrays[1],
      'each fitted to its own length: ' + r.arrays.join(' vs '));
  });

  t('PLINEGEN runs one pattern round the whole thing instead', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'pline', pts:[[0,0],[900,0],[900,300]], closed:false, lt:'dashed', layer:'0'});
      commit('p');
      VS.plinegen = false; const off = dashes();
      VS.plinegen = true;  const on = dashes();
      VS.plinegen = false;
      return { off: off.length, on: on.length,
               same: on.length ? on.every(a => Math.abs(a[0] - on[0][0]) < 1e-9) : false };`);
    ok(r.on < r.off, 'fewer patterns, because there is one: ' + r.on + ' vs ' + r.off);
    eq(r.same, true, 'and it is the same pattern the whole way round');
  });

  t('PLINEGEN is a system variable, off, as AutoCAD ships it', () => {
    const r = R(`${SETUP}
      const was = getvar('PLINEGEN');
      setvar('PLINEGEN', 1);
      const on = getvar('PLINEGEN');
      setvar('PLINEGEN', 0);
      return { was, on, off: getvar('PLINEGEN') };`);
    eq(r.was, false, 'off to begin with');
    eq(r.on, true, 'and it takes 1');
  });

  group('the paper agrees with the screen');

  t('a plotted dashed line is fitted the same way', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'line', a:[0,0], b:[4000,0], lt:'dashed', layer:'0'});
      commit('l');
      const sh = newSheet('A-101', 'A3', true);
      sh.viewports.push(newViewport(sh, [2000,0], 1/100));
      DOC.sheets.push(sh); DOC.curSheet = sh.id;
      const svg = sheetSVG(sh);
      const m = /stroke-dasharray="([\\d.]+),([\\d.]+)"/.exec(svg);
      if (!m) return { found: false };
      const on = +m[1], off = +m[2];
      const n = (4000 - on) / (on + off);
      /* the plot rounds its numbers to a tenth of a micron, so the fit is
         exact to there and no further */
      return { found: true, on, off, n: +n.toFixed(6),
               whole: Math.abs(n - Math.round(n)) < 1e-3 };`);
    eq(r.found, true, 'the plot carries a dash pattern');
    eq(r.whole, true, 'fitted to the line, exactly as on screen: ' + r.n);
  });

  t('a plotted short segment is solid there too, or it vanishes on paper', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'line', a:[0,0], b:[3,0], lt:'dashed', layer:'0'});
      commit('l');
      const sh = newSheet('A-101', 'A3', true);
      sh.viewports.push(newViewport(sh, [0,0], 1/100));
      DOC.sheets.push(sh); DOC.curSheet = sh.id;
      return { dashed: /stroke-dasharray/.test(sheetSVG(sh)) };`);
    eq(r.dashed, false, 'no pattern on something too short to carry one');
  });

  group('nothing else changes');

  t('a solid line is still one stroke with no pattern at all', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'pline', pts:[[0,0],[900,0],[900,300]], closed:false, layer:'0'});
      commit('p');
      const d = dashes();
      return { patterns: d.length };`);
    eq(r.patterns, 0, 'nothing dashed is asked for');
  });

  t('LTSCALE still scales the pattern', () => {
    const r = R(`${SETUP}
      const a = dashFitFor('dashed', 1000);
      DOC.ltScale = 4;
      const b = dashFitFor('dashed', 1000);
      DOC.ltScale = 1;
      return { a: a[0], b: b[0] };`);
    ok(r.b > r.a * 2, 'four times the scale is a much longer dash: ' + r.a + ' -> ' + r.b);
  });
};
