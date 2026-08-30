'use strict';
/* ============================================================
   8.4 — per-viewport layer freeze (VPLAYER)

   Two viewports onto the same model at two scales is the
   ordinary reason a sheet has two viewports. The moment you have
   them you want one to show the furniture and the other not,
   without the drawing existing twice.

   AutoCAD's answer is a freeze that belongs to the viewport
   rather than to the layer, and it is the piece that makes one
   model serve a general arrangement and a setting-out plan on
   the same sheet. Everything else about sheets is already here;
   this was the gap.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  const twoVp = () => {
    ensureLayer('A-FURN'); ensureLayer('A-WALL');
    begin();
    addEnt({t:'line', a:[0,0], b:[4000,0], layer:'A-WALL'});
    addEnt({t:'circle', c:[2000,1000], r:400, layer:'A-FURN'});
    commit('m');
    const sh = newSheet('A-101', 'A3', true);
    const a = newViewport(sh, [2000,500], 1/50); a.x = 10; a.y = 10; a.w = 180; a.h = 120;
    const b = newViewport(sh, [2000,500], 1/100); b.x = 210; b.y = 10; b.w = 180; b.h = 120;
    sh.viewports.length = 0; sh.viewports.push(a, b);
    DOC.sheets.push(sh); DOC.curSheet = sh.id;
    return { sh, a, b };
  };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('freezing a layer in one viewport only');

  t('a viewport carries its own list of frozen layers', () => {
    const r = R(`${SETUP}
      const { sh, a, b } = twoVp();
      vpFreeze(a, 'A-FURN', true);
      return { inA: vpFrozen(a, 'A-FURN'), inB: vpFrozen(b, 'A-FURN'),
               wallA: vpFrozen(a, 'A-WALL'),
               globallyFrozen: layer('A-FURN').frozen };`);
    eq(r.inA, true, 'frozen in the viewport it was frozen in');
    eq(r.inB, false, 'and not in the other one — that is the whole point');
    eq(r.wallA, false, 'other layers are untouched');
    eq(r.globallyFrozen, false, 'and the layer itself is not frozen: model space is unaffected');
  });

  t('what is drawn through the window actually changes', () => {
    const r = R(`${SETUP}
      const c = document.getElementById('cv').getContext('2d');
      const { sh, a, b } = twoVp();
      fitSheet();
      c.__trace.counts.arc = 0; paint();
      const both = c.__trace.counts.arc || 0;
      vpFreeze(a, 'A-FURN', true);
      shapeCacheClear();
      c.__trace.counts.arc = 0; paint();
      const one = c.__trace.counts.arc || 0;
      return { both, one };`);
    ok(r.both > 0, 'the circle is drawn in both windows to begin with: ' + r.both);
    ok(r.one < r.both,
      'and once frozen in one window it is drawn less: ' + r.one + ' vs ' + r.both);
  });

  t('model space does not care what a sheet froze', () => {
    const r = R(`${SETUP}
      const { sh, a } = twoVp();
      vpFreeze(a, 'A-FURN', true);
      DOC.curSheet = null;
      const circ = [...DOC.ents.values()].find(e => e.t === 'circle');
      return { vis: visible(circ), pick: pickable(circ) };`);
    eq(r.vis, true, 'the object is still there in the model');
    eq(r.pick, true, 'and still selectable');
  });

  t('standing inside the viewport, a frozen layer is neither drawn nor picked', () => {
    const r = R(`${SETUP}
      const { sh, a } = twoVp();
      vpFreeze(a, 'A-FURN', true);
      setActiveVp(sh, a.id);
      const circ = [...DOC.ents.values()].find(e => e.t === 'circle');
      const wall = [...DOC.ents.values()].find(e => e.t === 'line');
      const out = { circ: visible(circ), pick: pickable(circ), wall: visible(wall) };
      setActiveVp(sh, null);
      return out;`);
    eq(r.circ, false, 'hidden while you are working in that window');
    eq(r.pick, false, 'and not selectable there either');
    eq(r.wall, true, 'the layers that are not frozen are unaffected');
  });

  group('reaching it');

  t('VPLAYER freezes and thaws by name', () => {
    const r = R(`${SETUP}
      const { sh, a } = twoVp();
      setActiveVp(sh, a.id);
      cancelCmd(); startCmd('vplayer'); cmdText('f'); cmdText('A-FURN');
      const froze = vpFrozen(a, 'A-FURN');
      cancelCmd(); startCmd('vplayer'); cmdText('t'); cmdText('A-FURN');
      const thawed = vpFrozen(a, 'A-FURN');
      setActiveVp(sh, null);
      return { froze, thawed };`);
    eq(r.froze, true, 'F freezes in the current viewport');
    eq(r.thawed, false, 'T thaws it again');
  });

  t('a freeze is undoable like everything else', () => {
    const r = R(`${SETUP}
      const { sh, a } = twoVp();
      vpFreeze(a, 'A-FURN', true);
      undo();
      const back = (curSheet().viewports || []).find(v => v.x === 10);
      return { after: vpFrozen(back, 'A-FURN') };`);
    eq(r.after, false, 'undo puts the layer back in the viewport');
  });

  t('it survives the project file', () => {
    const r = R(`${SETUP}
      const { sh, a } = twoVp();
      vpFreeze(a, 'A-FURN', true);
      loadNative(saveNative());
      const s = (DOC.sheets || [])[0];
      const va = (s.viewports || []).find(v => v.x === 10);
      const vb = (s.viewports || []).find(v => v.x === 210);
      return { a: vpFrozen(va, 'A-FURN'), b: vpFrozen(vb, 'A-FURN') };`);
    eq(r.a, true, 'the freeze is saved');
    eq(r.b, false, 'and belongs to the viewport that owns it');
  });

  t('a layer that no longer exists does not break the viewport', () => {
    const r = R(`${SETUP}
      const { sh, a } = twoVp();
      vpFreeze(a, 'A-FURN', true);
      let threw = null;
      try { fitSheet(); paint(); } catch (e) { threw = e.message; }
      DOC.layers = DOC.layers.filter(l => l.name !== 'A-FURN');
      try { shapeCacheClear(); paint(); } catch (e) { threw = e.message; }
      return { threw };`);
    eq(r.threw, null, 'a stale name in the list is ignored, not fatal');
  });
  t('the layer panel grows a per-viewport control on a sheet, and only there', () => {
    const r = R(`${SETUP}
      const { sh, a } = twoVp();
      const cls = () => { buildLayers();
        return (document.getElementById('layers').children || [])
          .map(row => (row.children || []).map(k => k.className).join('|')); };
      DOC.curSheet = null;
      const model = cls();
      DOC.curSheet = sh.id;
      const sheet = cls();
      return { model: model.filter(c => /vpfz/.test(c)).length,
               sheet: sheet.filter(c => /vpfz/.test(c)).length,
               rows: sheet.length };`);
    eq(r.model, 0, 'nothing in model space, where it would mean nothing');
    eq(r.sheet, r.rows, 'and one per layer on a sheet');
  });

  t('the control freezes only the layer it belongs to', () => {
    const r = R(`${SETUP}
      const { sh, a } = twoVp();
      buildLayers();
      const rows = document.getElementById('layers').children || [];
      const row = rows.find(x => (x.children || []).some(k => /lname/.test(k.className || '')));
      const furn = rows.find(x => (x.children || [])
        .some(k => /lname/.test(k.className || '') && k.textContent === 'A-FURN'));
      const btn = furn && (furn.children || []).find(k => /vpfz/.test(k.className || ''));
      btn.onclick({ stopPropagation() {} });
      const live = (curSheet().viewports || []).find(v => v.x === 10);
      return { furn: vpFrozen(live, 'A-FURN'), wall: vpFrozen(live, 'A-WALL') };`);
    eq(r.furn, true, 'the row you clicked');
    eq(r.wall, false, 'and no other');
  });
  /* The failure this whole file exists to prevent is the one that looks
     perfectly fine on screen and only shows up at the plotter. */
  t('the plot honours it, or the sheet is a lie', () => {
    const r = R(`${SETUP}
      const { sh, a } = twoVp();
      const before = (sheetSVG(sh).match(/<circle/g) || []).length;
      vpFreeze(a, 'A-FURN', true);
      const after = (sheetSVG(sh).match(/<circle/g) || []).length;
      return { before, after };`);
    ok(r.before >= 2, 'the circle plots in both windows to begin with: ' + r.before);
    eq(r.after, r.before - 1, 'and in one only once it is frozen there: ' + r.after);
  });
};
