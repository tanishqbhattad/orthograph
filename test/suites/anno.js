'use strict';
/* ============================================================
   B3 — annotation that comes out the right size on paper

   Text and dimensions are sized in model units, so a 250mm tall
   note is 2.5mm on paper at 1:100 and 5mm at 1:50. Put the same
   plan in two viewports at two scales — which is the ordinary
   reason to have two viewports — and the annotation in one of
   them is the wrong size. The only fix was DIMSCALE, set by hand,
   for one scale at a time.

   Annotative objects are sized in PAPER units instead. What
   varies is the model height, derived from whatever scale is
   looking at them, so the same note is the same size on the sheet
   through every viewport.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; DOC.textH = 250;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
  const textH = (e) => { const s = shapes(e, 32).find(x => x.text != null); return s && s.h; };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('the scale in force');

  t('model space uses the drawing\'s annotation scale', () => {
    const r = R(`${SETUP}
      DOC.annoScale = 1 / 100;
      const at100 = { scale: annoScale(), k: annoK() };
      DOC.annoScale = 1 / 50;
      const at50 = { scale: annoScale(), k: annoK() };
      return { at100, at50 };`);
    close(r.at100.scale, 0.01, 1e-9, '1:100');
    close(r.at100.k, 100, 1e-6, 'and a paper millimetre is 100 model millimetres');
    close(r.at50.k, 50, 1e-6, 'at 1:50 it is 50');
  });

  t('a drawing that has never been told a scale still answers something usable', () => {
    const r = R(`${SETUP}
      delete DOC.annoScale;
      return { scale: annoScale(), k: annoK() };`);
    ok(r.scale > 0, 'a real scale, got ' + r.scale);
    ok(r.k > 0 && isFinite(r.k), 'and a usable multiplier, got ' + r.k);
  });

  group('annotative text');

  t('is sized in paper units, so its model height follows the scale', () => {
    const r = R(`${SETUP}
      begin();
      const tx = addEnt({t:'text', p:[0,0], s:'NOTE', h:2.5, rot:0, anchor:'l',
                         anno:true, layer:'0'});
      commit('t');
      DOC.annoScale = 1 / 100; const at100 = textH(tx);
      DOC.annoScale = 1 / 50;  const at50 = textH(tx);
      DOC.annoScale = 1 / 200; const at200 = textH(tx);
      return { at100, at50, at200 };`);
    close(r.at100, 250, 0.01, '2.5mm on paper is 250mm at 1:100');
    close(r.at50, 125, 0.01, '125mm at 1:50');
    close(r.at200, 500, 0.01, '500mm at 1:200');
  });

  t('plain text is left exactly as it was', () => {
    const r = R(`${SETUP}
      begin();
      const tx = addEnt({t:'text', p:[0,0], s:'NOTE', h:250, rot:0, anchor:'l', layer:'0'});
      commit('t');
      DOC.annoScale = 1 / 100; const a = textH(tx);
      DOC.annoScale = 1 / 50;  const b = textH(tx);
      return { a, b };`);
    close(r.a, 250, 0.01, 'a model-sized note is 250 whatever the scale');
    close(r.b, 250, 0.01, 'and stays 250');
  });

  group('annotative dimensions');

  t('a dimension marked annotative sizes its text and arrows from the scale', () => {
    const r = R(`${SETUP}
      begin();
      const d = addEnt({t:'dim', k:'horizontal', p1:[0,0], p2:[5000,0], off:-900,
                        anno:true, layer:'DIMENSIONS'});
      commit('d');
      DOC.dimScale = 1;
      DOC.annoScale = 1 / 100; const s100 = dimStyle(d);
      DOC.annoScale = 1 / 50;  const s50 = dimStyle(d);
      const plain = dimStyle({t:'dim'});
      return { t100: s100.txt, t50: s50.txt, a100: s100.arrow, a50: s50.arrow,
               plain: plain.txt };`);
    ok(r.t100 > r.t50, 'a smaller scale needs bigger model text: ' + r.t100 + ' vs ' + r.t50);
    close(r.t100 / r.t50, 2, 0.001, 'exactly twice, since 1:100 is half of 1:50');
    close(r.a100 / r.a50, 2, 0.001, 'and the arrows with it');
    ok(r.plain !== r.t100 || r.plain !== r.t50,
      'a plain dimension is not swept along with them');
  });

  /* DIMSCALE was the manual version of this. Applying both would square the
     scaling and make the text enormous. */
  t('DIMSCALE does not stack on top of it', () => {
    const r = R(`${SETUP}
      begin();
      const d = addEnt({t:'dim', k:'horizontal', p1:[0,0], p2:[5000,0], off:-900,
                        anno:true, layer:'DIMENSIONS'});
      const p = addEnt({t:'dim', k:'horizontal', p1:[0,3000], p2:[5000,3000], off:-900,
                        layer:'DIMENSIONS'});
      commit('d');
      DOC.annoScale = 1 / 100;
      DOC.dimScale = 1; const annoOne = dimStyle(d).txt, plainOne = dimStyle(p).txt;
      DOC.dimScale = 4; const annoFour = dimStyle(d).txt, plainFour = dimStyle(p).txt;
      DOC.dimScale = 1;
      return { annoOne, annoFour, plainOne, plainFour };`);
    close(r.annoFour, r.annoOne, 0.01,
      'the annotative one takes its size from the scale alone');
    close(r.plainFour / r.plainOne, 4, 0.001,
      'while DIMSCALE still does exactly what it always did to a plain one');
  });

  group('through a viewport');

  /* The whole point: one plan, two viewports at two scales, and the same note
     the same size on the paper in both. */
  t('the same note comes out the same size on the sheet at either scale', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'wall', a:[0,0], b:[8000,0], wt:'gen100', layer:'A-WALL'});
      const tx = addEnt({t:'text', p:[0,1000], s:'GENERAL NOTE', h:2.5, rot:0,
                         anchor:'l', anno:true, layer:'0'});
      commit('t');
      DOC.annoScale = 1 / 100;
      const inVp = (scale) => { annoPush(scale); const h = textH(tx); annoPop(); return h; };
      const h50 = inVp(1 / 50), h100 = inVp(1 / 100), h200 = inVp(1 / 200);
      /* what each lands as on the paper: model height times the scale */
      return { paper50: h50 / 50, paper100: h100 / 100, paper200: h200 / 200,
               model: { h50, h100, h200 }, outside: textH(tx) };`);
    close(r.paper50, 2.5, 0.001, 'through a 1:50 viewport it is 2.5mm on paper');
    close(r.paper100, 2.5, 0.001, 'through 1:100, still 2.5mm');
    close(r.paper200, 2.5, 0.001, 'through 1:200, still 2.5mm');
    ok(r.model.h50 !== r.model.h100, 'even though the model heights differ');
    close(r.outside, 250, 0.01, 'and outside any viewport it is back to the drawing scale');
  });

  t('leaving a viewport puts the scale back, even if drawing it threw', () => {
    const r = R(`${SETUP}
      DOC.annoScale = 1 / 100;
      const before = annoScale();
      annoPush(1 / 20);
      const inside = annoScale();
      annoPop();
      return { before, inside, after: annoScale() };`);
    close(r.inside, 0.05, 1e-9, 'inside it is the viewport scale');
    close(r.after, r.before, 1e-9, 'and afterwards the drawing scale is back');
  });

  /* The shape cache is keyed by entity id. An annotative object's shapes
     depend on the scale looking at it, and two viewports at two scales are
     painted one after the other in a single frame — so the second would be
     served the first one's geometry. */
  t('the cache does not serve one viewport the size meant for another', () => {
    const r = R(`${SETUP}
      begin();
      const tx = addEnt({t:'text', p:[0,0], s:'NOTE', h:2.5, rot:0, anchor:'l',
                         anno:true, layer:'0'});
      const plain = addEnt({t:'text', p:[0,900], s:'NOTE', h:250, rot:0, anchor:'l', layer:'0'});
      commit('t');
      shapeCacheClear();
      const h = (e) => { const s = entShapes(e).find(x => x.text != null); return s && s.h; };
      annoPush(1 / 50);  const a = h(tx), pa = h(plain); annoPop();
      annoPush(1 / 100); const b = h(tx), pb = h(plain); annoPop();
      annoPush(1 / 50);  const c = h(tx); annoPop();
      return { a, b, c, pa, pb };`);
    close(r.a, 125, 0.01, 'through 1:50 it is 125');
    close(r.b, 250, 0.01, 'and through 1:100 it is 250, not the 125 just cached');
    close(r.c, 125, 0.01, 'and back to 125 on the way round again');
    close(r.pa, 250, 0.01, 'a plain note is unaffected');
    close(r.pb, 250, 0.01, 'and still cached as it always was');
  });

  group('turning it on');

  /* Flagging a 250mm note annotative without converting its height would make
     it 250 PAPER millimetres — a quarter of a metre of text on the sheet, and
     twenty-five metres across the model. The size on screen must not change
     at the moment you change what the number means. */
  t('marking a note annotative keeps it the size it already was', () => {
    const r = R(`${SETUP}
      DOC.annoScale = 1 / 100;
      begin();
      const tx = addEnt({t:'text', p:[0,0], s:'NOTE', h:250, rot:0, anchor:'l', layer:'0'});
      commit('t');
      const drawnBefore = textH(tx);
      setAnno([tx], true);
      const after = { h: tx.h, anno: !!tx.anno, drawn: textH(tx) };
      setAnno([tx], false);
      const back = { h: tx.h, anno: !!tx.anno, drawn: textH(tx) };
      return { drawnBefore, after, back };`);
    close(r.drawnBefore, 250, 0.01, 'it was drawn 250 tall');
    close(r.after.h, 2.5, 0.001, 'and is stored as 2.5mm of paper');
    eq(r.after.anno, true, 'flagged annotative');
    close(r.after.drawn, 250, 0.01, 'but still drawn 250 tall, which is the point');
    close(r.back.h, 250, 0.01, 'turning it off converts back');
    eq(r.back.anno, false, 'and clears the flag');
    close(r.back.drawn, 250, 0.01, 'with the drawn size never having moved');
  });

  t('the properties panel offers it for a note and not for a wall', () => {
    const r = R(`${SETUP}
      begin();
      const tx = addEnt({t:'text', p:[0,0], s:'NOTE', h:250, rot:0, anchor:'l', layer:'0'});
      const wl = addEnt({t:'wall', a:[0,0], b:[5000,0], wt:'gen100', layer:'A-WALL'});
      commit('t');
      /* the stub does not compose innerHTML from appended children, so the
         rows are read individually — each one sets its own markup */
      const rowsFor = (e) => { SEL.clear(); SEL.add(e.id); buildProps();
        return [...document.querySelectorAll('#props .row')]
          .map(x => x.innerHTML || '').join(' '); };
      return { note: /annotative/i.test(rowsFor(tx)), wall: /annotative/i.test(rowsFor(wl)) };`);
    eq(r.note, true, 'a note can be annotative');
    eq(r.wall, false, 'a wall cannot: it is drawn at its real size, always');
  });

  group('setting it');

  t('CANNOSCALE is a system variable, and reports a scale a person recognises', () => {
    const r = R(`${SETUP}
      setvar('cannoscale', 1 / 50);
      const a = { scale: annoScale(), label: scaleLabel(annoScale()) };
      setvar('cannoscale', 1 / 100);
      const b = { scale: annoScale(), label: scaleLabel(annoScale()) };
      return { a, b, known: 'CANNOSCALE' in SYSVAR };`);
    eq(r.known, true, 'it is in the variable table');
    close(r.a.scale, 0.02, 1e-9);
    eq(r.a.label, '1:50', 'and says so the way a drawing does: ' + r.a.label);
    eq(r.b.label, '1:100');
  });

  t('an absurd scale is refused rather than dividing by zero', () => {
    const r = R(`${SETUP}
      DOC.annoScale = 1 / 100;
      setvar('cannoscale', 0);
      const afterZero = annoScale();
      setvar('cannoscale', -5);
      const afterNeg = annoScale();
      return { afterZero, afterNeg };`);
    ok(r.afterZero > 0, 'zero is not a scale, got ' + r.afterZero);
    ok(r.afterNeg > 0, 'nor is a negative one, got ' + r.afterNeg);
  });
};
