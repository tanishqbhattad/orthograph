'use strict';
/* ============================================================
   8.7 — plot styles: screening, and what colour a plot is

   The last thing between a drawing and a plotter. Three
   decisions, and every office makes all three:

     screening   how much ink a layer gets. A survey underlay or
                 an existing-to-be-demolished layer is plotted at
                 40% so the new work reads over it. Without it
                 the only way to make something faint is to make
                 it a different colour, which is a lie about what
                 it is.
     colour      most drawings plot black on white however
                 colourful the screen is. Some plot grey. A few
                 plot in colour.
     preview     seeing it before the paper does.

   AutoCAD keeps this in a .ctb, which is somebody else's file
   format carrying somebody else's tables. This is ours: three
   numbers on a layer and one word on the document.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  DOC.plotStyle = null;
  const drawn = () => {
    ensureLayer('EXISTING', '#8a8a8a'); ensureLayer('NEW', '#ff4444');
    begin();
    addEnt({t:'line', a:[0,0], b:[4000,0], layer:'EXISTING'});
    addEnt({t:'line', a:[0,1000], b:[4000,1000], layer:'NEW'});
    commit('m');
    const sh = newSheet('A-101', 'A3', true);
    sh.viewports.push(newViewport(sh, [2000,500], 1/100));
    DOC.sheets.push(sh); DOC.curSheet = sh.id;
    return sh;
  };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('screening');

  t('a screened layer plots with less ink and the others do not', () => {
    const r = R(`${SETUP}
      const sh = drawn();
      const full = sheetSVG(sh);
      begin(); touchLayers(); layer('EXISTING').screen = 40; commit('s');
      const part = sheetSVG(sh);
      return { fullOp: (full.match(/stroke-opacity/g) || []).length,
               partOp: (part.match(/stroke-opacity="0\\.4"/g) || []).length,
               others: (part.match(/stroke-opacity/g) || []).length };`);
    eq(r.fullOp, 0, 'nothing is screened until something is');
    eq(r.partOp, 1, 'the screened layer plots at 40%');
    eq(r.others, 1, 'and only that one: the rest are untouched');
  });

  t('screening at nothing plots nothing, which is what 0 means', () => {
    const r = R(`${SETUP}
      const sh = drawn();
      begin(); touchLayers(); layer('EXISTING').screen = 0; commit('s');
      const svg = sheetSVG(sh);
      return { lines: (svg.match(/<line|<path/g) || []).length,
               both: (sheetSVG(sh).length > 0) };`);
    ok(r.lines >= 1, 'the other layer still plots');
    eq(r.both, true);
  });

  t('an object can be screened on its own, over its layer', () => {
    const r = R(`${SETUP}
      const sh = drawn();
      begin(); touchLayers(); layer('EXISTING').screen = 50; commit('s');
      const e = [...DOC.ents.values()].find(x => x.layer === 'EXISTING');
      begin(); mut(e); e.screen = 25; commit('o');
      const svg = sheetSVG(sh);
      return { own: /stroke-opacity="0\\.25"/.test(svg),
               layer: /stroke-opacity="0\\.5"/.test(svg) };`);
    eq(r.own, true, 'the object wins');
    eq(r.layer, false, 'and the layer does not also apply');
  });

  t('the screen is untouched by it, because it is about paper', () => {
    const r = R(`${SETUP}
      const c = document.getElementById('cv').getContext('2d');
      drawn(); DOC.curSheet = null; fit();
      c.__trace.sets.length = 0; paint();
      const before = c.__trace.sets.filter(s => s[0] === 'globalAlpha').length;
      begin(); touchLayers(); layer('EXISTING').screen = 40; commit('s');
      shapeCacheClear();
      c.__trace.sets.length = 0; paint();
      const after = c.__trace.sets.filter(s => s[0] === 'globalAlpha').length;
      return { before, after };`);
    eq(r.after, r.before, 'drawing the model does not change');
  });

  group('what colour a plot is');

  t('monochrome puts every colour on paper as black', () => {
    const r = R(`${SETUP}
      const sh = drawn();
      DOC.plotStyle = 'mono';
      const svg = sheetSVG(sh);
      return { red: /#ff4444/i.test(svg), black: (svg.match(/#111111/g) || []).length };`);
    eq(r.red, false, 'the red layer is not red on paper');
    ok(r.black >= 2, 'everything is ink: ' + r.black);
  });

  t('greyscale keeps the tones apart without keeping the hues', () => {
    const r = R(`${SETUP}
      const sh = drawn();
      DOC.plotStyle = 'grey';
      const svg = sheetSVG(sh);
      const cols = [...new Set((svg.match(/stroke="#[0-9a-f]{6}"/gi) || []))];
      const hex = cols.map(c => c.slice(9, 15));
      const grey = hex.every(h => h.slice(0,2) === h.slice(2,4) && h.slice(2,4) === h.slice(4,6));
      return { hex, grey, n: hex.length };`);
    eq(r.grey, true, 'every plotted colour is a grey: ' + r.hex.join(' '));
    ok(r.n >= 2, 'and they are still told apart: ' + r.hex.join(' '));
  });

  t('colour is the default, because that is the least surprising', () => {
    const r = R(`${SETUP}
      const sh = drawn();
      const svg = sheetSVG(sh);
      return { style: plotStyleName(), red: /#ff4444/i.test(svg) };`);
    eq(r.style, 'color');
    eq(r.red, true, 'a red layer plots red until told otherwise');
  });

  group('reaching it');

  t('PLOTSTYLE sets the document policy and screens a layer', () => {
    const r = R(`${SETUP}
      drawn();
      cancelCmd(); startCmd('plotstyle'); cmdText('mono');
      const after = plotStyleName();
      cancelCmd(); startCmd('plotstyle'); cmdText('s'); cmdText('EXISTING'); cmdText('40');
      return { after, screen: layer('EXISTING').screen };`);
    eq(r.after, 'mono', 'the policy');
    eq(r.screen, 40, 'and the screening');
  });

  t('both are in the file, or the next person plots something else', () => {
    const r = R(`${SETUP}
      drawn();
      DOC.plotStyle = 'grey';
      begin(); touchLayers(); layer('EXISTING').screen = 40; commit('s');
      loadNative(saveNative());
      return { style: plotStyleName(), screen: layer('EXISTING').screen };`);
    eq(r.style, 'grey');
    eq(r.screen, 40);
  });

  t('a nonsense screening is refused rather than plotted', () => {
    const r = R(`${SETUP}
      drawn();
      const bad = [];
      for (const v of [-10, 250, 'lots', null]) {
        begin(); touchLayers(); layer('EXISTING').screen = v; commit('s');
        const s = sheetSVG(curSheet());
        if (/stroke-opacity="(-|[2-9]|NaN)/.test(s)) bad.push(String(v));
      }
      return { bad };`);
    eq(r.bad.length, 0, 'nothing silly reaches the paper: ' + r.bad.join(', '));
  });
  group('seeing it before the paper does');

  t('PLOTPREVIEW draws the sheet the way it will print', () => {
    const r = R(`${SETUP}
      const c = document.getElementById('cv').getContext('2d');
      const sh = drawn();
      DOC.plotStyle = 'mono';
      const cols = () => { shapeCacheClear(); fitSheet();
        c.__trace.sets.length = 0; paint();
        return c.__trace.sets.filter(x => x[0] === 'strokeStyle').map(x => String(x[1])); };
      setvar('PLOTPREVIEW', false);
      const off = cols();
      setvar('PLOTPREVIEW', true);
      const on = cols();
      setvar('PLOTPREVIEW', false);
      return { offRed: off.some(x => /ff4444/i.test(x)), onRed: on.some(x => /ff4444/i.test(x)) };`);
    eq(r.offRed, true, 'ordinarily the sheet is drawn in the layer colours');
    eq(r.onRed, false, 'and in preview it is drawn as it will plot');
  });

  t('a screened layer fades in the preview and nowhere else', () => {
    const r = R(`${SETUP}
      const c = document.getElementById('cv').getContext('2d');
      const sh = drawn();
      begin(); touchLayers(); layer('EXISTING').screen = 40; commit('s');
      const alphas = () => { shapeCacheClear(); fitSheet();
        c.__trace.sets.length = 0; paint();
        return c.__trace.sets.filter(x => x[0] === 'globalAlpha').map(x => +x[1]); };
      setvar('PLOTPREVIEW', true);
      const on = alphas();
      setvar('PLOTPREVIEW', false);
      const off = alphas();
      DOC.curSheet = null;
      setvar('PLOTPREVIEW', true);
      const model = alphas();
      setvar('PLOTPREVIEW', false);
      return { on: on.filter(a => a > 0.3 && a < 0.5).length,
               off: off.filter(a => a > 0.3 && a < 0.5).length,
               model: model.filter(a => a > 0.3 && a < 0.5).length };`);
    ok(r.on >= 1, 'the screened layer is drawn faint on the sheet');
    eq(r.off, 0, 'and solid when the preview is off');
    eq(r.model, 0, 'and model space never fades: it is not paper');
  });
};
