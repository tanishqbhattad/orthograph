'use strict';
/* ============================================================
   8.6 — how a dimension reads

   Everything about a dimension except the number it prints was
   already adjustable. The number itself had one setting —
   decimal places — and no way to say any of the things a real
   drawing says: measure in feet and inches on this style, add a
   suffix, drop the leading zero, round to the nearest 5, report
   at half size because this view is at half size, or carry a
   tolerance.

   The tolerance matters most. A dimension with no tolerance on
   a fabrication drawing is not a dimension that is exact, it is
   a dimension nobody has thought about, and the four ways of
   writing one — symmetrical, deviation, limits, basic — are the
   four things a drawing can mean.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  DOC.dimStyles = null; DOC.curDim = null; DOC.dimStyle = null;
  const dimOf = (len, ovr) => { begin();
    const e = addEnt({t:'dim', k:'linear', p1:[0,0], p2:[len,0], off:500,
                      ovr: ovr || null, layer:'0'});
    commit('d'); return e; };
  const styleSet = (o) => { const s = curDimStyleRec(); Object.assign(s, o); return s; };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('primary units');

  t('decimals are the style, not a global', () => {
    const r = R(`${SETUP}
      const a = dimText(dimOf(1234.567, { prec: 0 }), 1234.567);
      const b = dimText(dimOf(1234.567, { prec: 3 }), 1234.567);
      return { a, b };`);
    eq(r.a, '1235', 'no decimals');
    eq(r.b, '1234.567', 'three of them');
  });

  t('a suffix and a prefix go where you would write them', () => {
    const r = R(`${SETUP}
      const e = dimOf(2500, { prec: 0, pre: 'W ', suf: ' mm' });
      return { s: dimText(e, 2500) };`);
    eq(r.s, 'W 2500 mm');
  });

  t('zero suppression, both ends', () => {
    const r = R(`${SETUP}
      const lead = dimText(dimOf(0.5, { prec: 2, zsupL: true }), 0.5);
      const keep = dimText(dimOf(0.5, { prec: 2 }), 0.5);
      const trail = dimText(dimOf(2500, { prec: 3, zsupT: true }), 2500);
      const both = dimText(dimOf(2500, { prec: 3 }), 2500);
      return { lead, keep, trail, both };`);
    eq(r.keep, '0.50', 'left alone by default');
    eq(r.lead, '.50', 'leading zero dropped when asked');
    eq(r.trail, '2500', 'trailing zeros dropped when asked');
    eq(r.both, '2500.000', 'and kept when not');
  });

  /* DIMLFAC: the drawing is at 1:2 but the dimension must report full size,
     or a detail is drawn at 10x and must not say so. */
  t('a measurement factor reports a different number without moving anything', () => {
    const r = R(`${SETUP}
      const e = dimOf(1000, { prec: 0, lfac: 0.5 });
      const g = dimGeom(e);
      return { s: dimText(e, 1000), val: Math.round(g.val), txt: g.txt };`);
    eq(r.s, '500', 'reported at half');
    eq(r.val, 1000, 'while the geometry is untouched');
    eq(r.txt, '500', 'and what is drawn is the reported number');
  });

  t('rounding to the nearest anything', () => {
    const r = R(`${SETUP}
      const a = dimText(dimOf(1237, { prec: 0, rnd: 5 }), 1237);
      const b = dimText(dimOf(1237, { prec: 0, rnd: 25 }), 1237);
      const c = dimText(dimOf(1237.4, { prec: 1, rnd: 0.5 }), 1237.4);
      return { a, b, c };`);
    eq(r.a, '1235', 'to the nearest 5');
    eq(r.b, '1225', 'to the nearest 25');
    eq(r.c, '1237.5', 'and to a half');
  });

  t('a style can dimension in feet and inches whatever the drawing is in', () => {
    const r = R(`${SETUP}
      DOC.units = 'mm';
      const e = dimOf(5000, { lunit: 'arch' });
      return { s: dimText(e, 5000), units: DOC.units };`);
    eq(r.units, 'mm', 'the drawing is still metric');
    ok(/'/.test(r.s) && /"/.test(r.s), 'and the dimension reads in feet: ' + r.s);
  });

  group('tolerances');

  t('symmetrical prints one number after a plus-minus', () => {
    const r = R(`${SETUP}
      const e = dimOf(2500, { prec: 0, tol: 'sym', tolUp: 2 });
      const p = dimParts(e, 2500);
      return { main: p.main, up: p.up, lo: p.lo, txt: dimGeom(e).txt };`);
    eq(r.main, '2500', 'the measurement');
    ok(/^±/.test(r.up), 'with a plus-minus tolerance: ' + r.up);
    ok(r.txt.indexOf('2500') >= 0, 'and the drawn text still carries the number');
  });

  t('deviation carries two, and they are not the same one', () => {
    const r = R(`${SETUP}
      const e = dimOf(2500, { prec: 0, tol: 'dev', tolUp: 2, tolLo: 1, tolPrec: 1 });
      const p = dimParts(e, 2500);
      return { main: p.main, up: p.up, lo: p.lo, hK: p.hK };`);
    eq(r.main, '2500');
    eq(r.up, '+2.0', 'the upper, signed');
    eq(r.lo, '-1.0', 'and the lower, signed');
    ok(r.hK < 1, 'and set smaller than the number it qualifies: ' + r.hK);
  });

  t('limits print the two sizes and not the nominal', () => {
    const r = R(`${SETUP}
      const e = dimOf(2500, { prec: 1, tol: 'lim', tolUp: 2, tolLo: 1 });
      const p = dimParts(e, 2500);
      return { main: p.main, up: p.up, lo: p.lo, stacked: !!p.stacked, hK: p.hK };`);
    eq(r.up, '2502.0', 'the largest it may be');
    eq(r.lo, '2499.0', 'and the smallest');
    eq(r.main, '', 'with no nominal, because limits replace it');
    eq(r.stacked, true, 'drawn as one over the other');
    eq(r.hK, 1, 'at full height, because they are the dimension and not a note on it');
  });

  t('a basic dimension is boxed, which is what basic means', () => {
    const r = R(`${SETUP}
      const e = dimOf(2500, { prec: 0, tol: 'basic' });
      const p = dimParts(e, 2500);
      const g = dimGeom(e);
      return { main: p.main, box: !!p.box, geoBox: !!(g.tol && g.tol.box) };`);
    eq(r.main, '2500', 'the number is untouched');
    eq(r.box, true, 'and asked to be boxed');
    eq(r.geoBox, true, 'which the drawing is told about');
  });

  t('the tolerance has its own precision', () => {
    const r = R(`${SETUP}
      const e = dimOf(2500, { prec: 0, tol: 'dev', tolUp: 0.25, tolLo: 0.25, tolPrec: 2 });
      const p = dimParts(e, 2500);
      return { main: p.main, up: p.up };`);
    eq(r.main, '2500', 'the number is whole');
    eq(r.up, '+0.25', 'and the tolerance is not');
  });

  group('where the settings live');

  t('they are style settings, so a style can be saved and restored', () => {
    const r = R(`${SETUP}
      styleSet({ prec: 0, suf: ' mm' });
      cancelCmd(); startCmd('dimstyle'); cmdText('s'); cmdText('Metric');
      /* saving makes the new style current, so go back to Standard before
         loosening it — otherwise the loosening lands on Metric itself */
      cancelCmd(); startCmd('dimstyle'); cmdText('r'); cmdText('Standard');
      styleSet({ prec: 3, suf: '' });
      const loose = dimText(dimOf(2500), 2500);
      cancelCmd(); startCmd('dimstyle'); cmdText('r'); cmdText('Metric');
      const tight = dimText(dimOf(2500), 2500);
      return { loose, tight, cur: DOC.curDim };`);
    eq(r.loose, '2500.000', 'the loosened style');
    eq(r.tight, '2500 mm', 'and the saved one, restored');
  });

  t('a dimension can override its style, as one always could', () => {
    const r = R(`${SETUP}
      styleSet({ prec: 0, suf: ' mm' });
      const plain = dimText(dimOf(2500), 2500);
      const over = dimText(dimOf(2500, { prec: 2, suf: ' MM' }), 2500);
      return { plain, over };`);
    eq(r.plain, '2500 mm');
    eq(r.over, '2500.00 MM', 'the override wins on both counts');
  });

  t('all of it survives the project file', () => {
    const r = R(`${SETUP}
      styleSet({ prec: 1, suf: ' mm', tol: 'sym', tolUp: 1.5, tolPrec: 1, rnd: 5, lfac: 2 });
      cancelCmd(); startCmd('dimstyle'); cmdText('s'); cmdText('Fab');
      dimOf(2500);
      loadNative(saveNative());
      const rec = dimStyleRec('Fab') || {};
      const e = [...DOC.ents.values()].find(x => x.t === 'dim');
      return { suf: rec.suf, tol: rec.tol, up: rec.tolUp, rnd: rec.rnd, lfac: rec.lfac,
               txt: e && dimGeom(e).txt };`);
    eq(r.suf, ' mm', 'the suffix');
    eq(r.tol, 'sym', 'the tolerance mode');
    eq(r.up, 1.5, 'its size');
    eq(r.rnd, 5, 'the rounding');
    eq(r.lfac, 2, 'and the measurement factor');
    ok(r.txt.indexOf('5000') >= 0, 'and the dimension still reads the same: ' + r.txt);
  });

  t('typed text still beats everything, because someone typed it', () => {
    const r = R(`${SETUP}
      styleSet({ prec: 0, suf: ' mm', tol: 'sym', tolUp: 2 });
      const e = dimOf(2500); begin(); mut(e); e.txt = 'CLEAR OPENING'; commit('t');
      const p = dimParts(e, 2500);
      return { txt: dimGeom(e).txt, up: p.up };`);
    eq(r.txt, 'CLEAR OPENING', 'what was typed is what is drawn');
    eq(r.up, '', 'and no tolerance is bolted onto it');
  });

  group('it reaches the paper');

  t('the tolerance is drawn, not merely computed', () => {
    const r = R(`${SETUP}
      const c = document.getElementById('cv').getContext('2d');
      const drawn = (ovr) => { resetDoc(); DOC.units='mm';
        dimOf(2500, ovr); fit();
        c.__trace.calls.length = 0; paint();
        return c.__trace.calls.filter(x => x[0] === 'fillText').map(x => String(x[1])); };
      return { plain: drawn({ prec: 0 }),
               tol: drawn({ prec: 0, tol: 'dev', tolUp: 2, tolLo: 1, tolPrec: 1 }) };`);
    ok(r.plain.join('|').indexOf('2500') >= 0, 'the plain one draws its number');
    ok(r.tol.length > r.plain.length,
      'and the tolerated one draws more: ' + r.tol.join(' '));
    ok(r.tol.join('|').indexOf('+2.0') >= 0, 'including the tolerance: ' + r.tol.join(' '));
  });

  t('and it plots', () => {
    const r = R(`${SETUP}
      dimOf(2500, { prec: 0, tol: 'sym', tolUp: 2, tolPrec: 0 });
      const sh = newSheet('A-101', 'A3', true);
      sh.viewports.push(newViewport(sh, [1250, 250], 1/50));
      DOC.sheets.push(sh); DOC.curSheet = sh.id;
      const svg = sheetSVG(sh);
      return { has2500: svg.indexOf('2500') >= 0, hasTol: /±2/.test(svg) };`);
    eq(r.has2500, true, 'the number is on the paper');
    eq(r.hasTol, true, 'and so is the tolerance');
  });

  /* Another program opening this file works the measurement out for itself,
     so a tolerance that lives only in our renderer is one that never leaves
     the building. */
  t('a tolerance reaches a DXF, where it would otherwise be lost', () => {
    const r = R(`${SETUP}
      dimOf(2500, { prec: 0, tol: 'sym', tolUp: 2, tolPrec: 0 });
      const dxf = exportDXF();
      resetDoc(); DOC.units = 'mm';
      dimOf(2500, { prec: 0 });
      const plain = exportDXF();
      const pm = '2500 ' + String.fromCharCode(177) + '2';
      return { tol: dxf.indexOf(pm) >= 0, plain: plain.indexOf(pm) >= 0 };`);
    eq(r.tol, true, 'the string we print is what the file carries');
    eq(r.plain, false, 'and an ordinary dimension is not force-texted');
  });

  t('the tolerance is part of the object, so it flattens and explodes with it', () => {
    const r = R(`${SETUP}
      const e = dimOf(2500, { prec: 0, tol: 'dev', tolUp: 2, tolLo: 1, tolPrec: 1 });
      const txt = shapes(e).filter(x => x.text).map(x => x.text);
      return { txt };`);
    ok(r.txt.indexOf('2500') >= 0, 'the number');
    ok(r.txt.indexOf('+2.0') >= 0, 'the upper tolerance: ' + r.txt.join(' '));
    ok(r.txt.indexOf('-1.0') >= 0, 'and the lower');
  });
  group('reaching it without a console');

  t('AutoCAD names, so anyone who knows them can type what they know', () => {
    const r = R(`${SETUP}
      setvar('DIMDEC', 0); setvar('DIMPOST', ' mm'); setvar('DIMLFAC', 2);
      setvar('DIMTOL', 'sym'); setvar('DIMTP', 1.5); setvar('DIMTDEC', 1);
      const e = dimOf(1000);
      const p = dimParts(e, 1000);
      return { main: p.main, up: p.up, back: getvar('DIMTOL'), dec: getvar('DIMDEC'),
               zin: (setvar('DIMZIN', 3), getvar('DIMZIN')) };`);
    eq(r.main, '2000 mm', 'DIMDEC, DIMPOST and DIMLFAC all land');
    eq(r.up, '±1.5', 'and so do the tolerance ones');
    eq(r.back, 'sym', 'they read back');
    eq(r.dec, 0);
    eq(r.zin, 3, 'and DIMZIN packs both suppressions the way AutoCAD does');
  });

  t('the dialog writes to the style, not to a forgotten corner of the document', () => {
    const r = R(`${SETUP}
      openDimStyle();
      document.getElementById('dsP').value = '2';
      document.getElementById('dsSuf').value = ' mm';
      document.getElementById('dsTol').value = 'sym';
      document.getElementById('dsTU').value = '3';
      document.getElementById('mo').onclick();
      const rec = curDimStyleRec();
      return { prec: rec.prec, suf: rec.suf, tol: rec.tol, up: rec.tolUp,
               reads: dimText(dimOf(2500), 2500) };`);
    eq(r.prec, 2, 'the style has the decimals');
    eq(r.suf, ' mm', 'and the suffix');
    eq(r.tol, 'sym');
    eq(r.reads, '2500.00 mm ±3.00', 'and a dimension reads that way: ' + r.reads);
  });
};
