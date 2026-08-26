'use strict';
/* ============================================================
   Sheets, paper space and plotting — 01-doc / 11-io

   One assertion in here matters more than the rest of the file:
   a wall of a known length, seen through a viewport at a known
   scale, must measure exactly the right number of millimetres
   on the paper. A drawing that is nearly to scale is a drawing
   that cannot be issued, and it is the failure that looks
   perfectly fine on a screen and only shows up at the plotter.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; DOC.gridStep = 100; DOC.snapStep = 100;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('sheets: paper is measured in millimetres');

  t('paper sizes are the real ISO numbers, and orientation swaps them', () => {
    const r = R(`${SETUP}
      return { a3p: paperSize('A3', false), a3l: paperSize('A3', true),
               a1l: paperSize('A1', true), a4p: paperSize('A4', false),
               unknown: paperSize('NOPE', true) };`);
    eq(r.a3p.join('x'), '297x420', 'A3 portrait');
    eq(r.a3l.join('x'), '420x297', 'A3 landscape is the same paper turned round');
    eq(r.a1l.join('x'), '841x594', 'A1 landscape');
    eq(r.a4p.join('x'), '210x297', 'A4 portrait');
    eq(r.unknown.join('x'), '420x297', 'an unknown size falls back rather than throwing');
  });

  /* THE acceptance test for this whole feature. */
  t('a 5000mm wall at 1:50 measures exactly 100mm on the paper', () => {
    const r = R(`${SETUP}
      addEnt({t:'wall', a:[0,0], b:[5000,0], wt:'gen100', layer:'A-WALL'});
      const sh = newSheet('A-101', 'A3', true);
      const vp = newViewport(sh, [2500, 0], 1/50);
      sh.viewports.push(vp); DOC.sheets.push(sh); DOC.curSheet = sh.id;
      const p0 = vpToPaper(vp, 0, 0);
      const p1 = vpToPaper(vp, 5000, 0);
      /* and 3000mm the other way, to catch an axis that is scaled differently */
      const p2 = vpToPaper(vp, 0, 3000);
      return { onPaper: Math.hypot(p1[0]-p0[0], p1[1]-p0[1]),
               vertical: Math.hypot(p2[0]-p0[0], p2[1]-p0[1]),
               label: scaleLabel(vp.scale) };`);
    close(r.onPaper, 100, 1e-9, 'got ' + r.onPaper + 'mm — a plot that is not to scale cannot be issued');
    close(r.vertical, 60, 1e-9, '3000mm at 1:50 is 60mm, and both axes must agree');
    eq(r.label, '1:50', 'and the title block must be able to name it');
  });

  t('every standard scale lands exactly, not nearly', () => {
    const r = R(`${SETUP}
      const sh = newSheet('S', 'A1', true);
      const out = {};
      for (const s of SCALES) {
        const vp = newViewport(sh, [0,0], s.r);
        const a = vpToPaper(vp, 0, 0), b = vpToPaper(vp, 1000, 0);
        out[s.label] = +(Math.hypot(b[0]-a[0], b[1]-a[1])).toFixed(9);
      }
      return out;`);
    eq(r['1:1'], 1000, '1m at 1:1 is 1000mm of paper');
    eq(r['1:20'], 50); eq(r['1:50'], 20); eq(r['1:100'], 10);
    eq(r['1:200'], 5);  eq(r['1:1000'], 1, '1m at 1:1000 is 1mm');
  });

  t('paper and model coordinates round-trip exactly', () => {
    const r = R(`${SETUP}
      const sh = newSheet('S', 'A2', true);
      const vp = newViewport(sh, [12345.6, -7890.1], 1/75);
      let worst = 0;
      for (const p of [[0,0],[12345.6,-7890.1],[99999,-42],[-5000,5000]]) {
        const pap = vpToPaper(vp, p[0], p[1]);
        const back = vpToModel(vp, pap[0], pap[1]);
        worst = Math.max(worst, Math.hypot(back[0]-p[0], back[1]-p[1]));
      }
      return worst;`);
    ok(r < 1e-6, 'worst round-trip error ' + r + 'mm');
  });

  group('sheets: the plotted file');

  t('the SVG declares millimetres, so the plot is physically right', () => {
    const r = R(`${SETUP}
      addEnt({t:'wall', a:[0,0], b:[5000,0], wt:'gen100', layer:'A-WALL'});
      const sh = newSheet('A-101', 'A3', true);
      sh.viewports.push(newViewport(sh, [2500,0], 1/50));
      const svg = sheetSVG(sh);
      const head = svg.slice(0, svg.indexOf('>') + 1);
      return { head, hasClip: svg.includes('clipPath'),
               scaleXf: (/scale\(([-0-9.]+)\)/.exec(svg) || [])[1],
               len: svg.length };`);
    ok(/width="420mm"/.test(r.head), 'width in mm: ' + r.head);
    ok(/height="297mm"/.test(r.head), 'height in mm');
    ok(/viewBox="0 0 420 297"/.test(r.head), 'and a viewBox in the same units');
    ok(r.hasClip, 'a viewport must clip, or the model spills over the paper');
  });

  group('sheets: the commands');

  t('LAYOUT makes a sheet and opens it at a sensible scale', () => {
    const r = R(`${SETUP}
      /* an 8m x 5m building on A3 */
      const c = [[0,0],[8000,0],[8000,5000],[0,5000]];
      for (let i = 0; i < 4; i++)
        addEnt({t:'wall', a:c[i], b:c[(i+1)%4], wt:'gen100', layer:'A-WALL'});
      cancelCmd();
      dispatch('LAYOUT'); dispatch('N'); dispatch('A-101');
      const sh = DOC.sheets[0], vp = sh && sh.viewports[0];
      const b = bboxAll([...DOC.ents.values()].filter(visible));
      return { n: DOC.sheets.length, name: sh && sh.name, size: sh && sh.size,
               paper: sh && [sh.w, sh.h], vps: sh && sh.viewports.length,
               scale: vp && scaleLabel(vp.scale), current: DOC.curSheet === (sh && sh.id),
               fits: vp ? ((b[2]-b[0]) * vp.scale <= vp.w && (b[3]-b[1]) * vp.scale <= vp.h) : false };`);
    eq(r.n, 1); eq(r.name, 'A-101'); eq(r.size, 'A3');
    eq(r.paper.join('x'), '420x297', 'landscape by default');
    eq(r.vps, 1, 'and it opens with a viewport, not an empty page');
    eq(r.current, true, 'the new layout becomes current');
    eq(r.fits, true, 'the model must actually fit inside the viewport');
    /* the rule is the LARGEST standard scale that still fits, so the sheet is
       filled rather than a small drawing marooned in the middle of the paper.
       8m x 5m inside a 400 x 237 viewport comes out 1:25 (320 x 200mm); 1:50
       would use under a quarter of the page. */
    eq(r.scale, '1:25', 'expected the largest scale that fits, got ' + r.scale);
  });

  /* the chosen scale must be a real one off the ruler, never a computed
     fraction — "1:63.4" is not a drawing scale anyone will accept */
  t('the fitted scale is always a standard one', () => {
    const r = R(`${SETUP}
      const out = [];
      for (const size of [1000, 8000, 40000, 250000]) {
        resetDoc();
        addEnt({t:'line', a:[0,0], b:[size, size*0.6], layer:'0'});
        cancelCmd();
        dispatch('LAYOUT'); dispatch('N'); dispatch('S' + size);
        const vp = DOC.sheets[DOC.sheets.length-1].viewports[0];
        out.push({ size, label: scaleLabel(vp.scale),
                   standard: SCALES.some(s => Math.abs(s.r - vp.scale) < 1e-12) });
      }
      return out;`);
    for (const row of r)
      eq(row.standard, true, row.size + 'mm chose ' + row.label + ', which is not on the ruler');
  });

  t('MSPACE and PSPACE move between model and paper', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'});
      cancelCmd();
      dispatch('LAYOUT'); dispatch('N'); dispatch('P1');
      const onSheet = DOC.curSheet;
      dispatch('MSPACE'); const model = DOC.curSheet;
      dispatch('PSPACE'); const back = DOC.curSheet;
      return { onSheet: onSheet != null, model, back: back === onSheet };`);
    eq(r.onSheet, true); eq(r.model, null, 'MSPACE is model space');
    eq(r.back, true, 'PSPACE returns to the layout you were on');
  });

  t('MVIEW refuses a viewport too small to see', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'});
      cancelCmd();
      dispatch('LAYOUT'); dispatch('N'); dispatch('P1');
      const sh = DOC.sheets[0];
      const before = sh.viewports.length;
      startCmd('mview'); cmdPoint([20,20]); cmdPoint([22,22]);
      const afterTiny = sh.viewports.length;
      cmdPoint([20,20]); cmdPoint([200,150]);
      const afterReal = sh.viewports.length;
      endCmd(true);
      return { before, afterTiny, afterReal,
               rect: sh.viewports[1] && [sh.viewports[1].w, sh.viewports[1].h] };`);
    eq(r.afterTiny, r.before, 'a 2mm viewport must be refused');
    eq(r.afterReal, r.before + 1, 'a real one is accepted');
    eq(r.rect.join('x'), '180x130', 'and it is the rectangle that was picked');
  });

  t('sheets survive a save and load', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'});
      cancelCmd();
      dispatch('LAYOUT'); dispatch('N'); dispatch('A-101');
      const sh = DOC.sheets[0];
      sh.title.project = 'Riverside'; sh.title.number = 'A-101';
      const vp0 = { ...sh.viewports[0] };
      const txt = saveNative();
      resetDoc();
      const none = (DOC.sheets || []).length;
      loadNative(txt);
      const back = DOC.sheets[0];
      return { none, n: DOC.sheets.length, name: back && back.name,
               project: back && back.title.project,
               scaleSame: back && Math.abs(back.viewports[0].scale - vp0.scale) < 1e-12,
               centreSame: back && dist(back.viewports[0].centre, vp0.centre) < 1e-9,
               current: DOC.curSheet === back.id };`);
    eq(r.none, 0, 'resetDoc clears paper space');
    eq(r.n, 1); eq(r.name, 'A-101'); eq(r.project, 'Riverside');
    eq(r.scaleSame, true, 'the scale must survive exactly — it is the drawing');
    eq(r.centreSame, true); eq(r.current, true);
  });

  t('a file written before sheets existed still loads', () => {
    const r = R(`${SETUP}
      const old = JSON.stringify({ app:'orthograph', v:2, units:'mm',
        layers:[newLayer('0')], cur:'0',
        ents:[{id:1, t:'line', a:[0,0], b:[1000,0], layer:'0'}] });
      loadNative(old);
      return { sheets: (DOC.sheets||[]).length, cur: DOC.curSheet, ents: DOC.ents.size };`);
    eq(r.sheets, 0, 'no paper space is not a broken document');
    eq(r.cur, null); eq(r.ents, 1, 'and the drawing still loads');
  });

  group('sheets: the layout tabs');

  /* Paper space is not discoverable from a command line alone. Without a tab
     strip nobody finds out a drawing can have sheets, which is most of why the
     feature would go unused however well it worked. */
  t('the tab strip lists model space and every sheet', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'});
      cancelCmd();
      const bar = document.getElementById('tabs');
      buildSheetTabs();
      const start = (bar.children || []).map(b => b.textContent);
      dispatch('LAYOUT'); dispatch('N'); dispatch('A-101');
      dispatch('LAYOUT'); dispatch('N'); dispatch('A-102');
      syncUI();
      const after = (bar.children || []).map(b => b.textContent);
      const on = (bar.children || []).filter(b => (b.className || '').includes('on'))
                                     .map(b => b.textContent);
      return { start, after, on, cur: DOC.curSheet };`);
    eq(r.start.join('|'), 'Model|+', 'with no sheets it is Model and a new-layout button');
    eq(r.after.join('|'), 'Model|A-101|A-102|+', 'got ' + r.after.join('|'));
    eq(r.on.join(','), 'A-102', 'exactly one tab is current, and it is the newest');
  });

  t('clicking a tab moves between model and paper', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'});
      cancelCmd();
      dispatch('LAYOUT'); dispatch('N'); dispatch('A-101');
      const sh = DOC.sheets[0];
      const bar = document.getElementById('tabs');
      syncUI();
      const hit = name => (bar.children || []).find(b => b.textContent === name);
      hit('Model').onclick();
      const model = DOC.curSheet;
      hit('A-101').onclick();
      const back = DOC.curSheet;
      const onNow = (bar.children || []).filter(b => (b.className || '').includes('on'))
                                        .map(b => b.textContent);
      return { model, back: back === sh.id, onNow };`);
    eq(r.model, null, 'the Model tab is model space');
    eq(r.back, true, 'and the sheet tab returns to the sheet');
    eq(r.onNow.join(','), 'A-101', 'the strip follows what is current');
  });

  t('the + tab makes a new layout', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'});
      cancelCmd();
      const bar = document.getElementById('tabs');
      buildSheetTabs();
      (bar.children || []).find(b => b.textContent === '+').onclick();
      const sh = DOC.sheets[0];
      return { n: DOC.sheets.length, name: sh && sh.name,
               vps: sh && sh.viewports.length, current: DOC.curSheet === (sh && sh.id) };`);
    eq(r.n, 1, 'one layout appears');
    eq(r.name, 'Sheet 1', 'named for you rather than demanding one up front');
    eq(r.vps, 1, 'and it opens showing the model, not an empty page');
    eq(r.current, true);
  });

  /* ZOOM Extents on a sheet is the sheet. Zooming to the model's extents there
     treats building millimetres as paper millimetres, which shrank an A3 page
     to sixteen pixels — green tests throughout, obvious the moment it was
     driven and looked at. */
  t('zoom extents on a sheet fits the paper, not the model', () => {
    const r = R(`${SETUP}
      /* an 11m building: three orders of magnitude bigger than the paper */
      addEnt({t:'wall', a:[0,0], b:[11000,0], wt:'gen100', layer:'A-WALL'});
      addEnt({t:'wall', a:[0,0], b:[0,8000], wt:'gen100', layer:'A-WALL'});
      cancelCmd();
      dispatch('LAYOUT'); dispatch('N'); dispatch('A-101');
      const sh = DOC.sheets[0];
      fit();
      const tl = w2s(sheetWorld(sh, 0, 0)), br = w2s(sheetWorld(sh, sh.w, sh.h));
      const onScreen = [Math.abs(br[0] - tl[0]), Math.abs(br[1] - tl[1])];
      /* and in model space it must still fit the model */
      gotoSheet(null); fit();
      const b = bboxAll([...DOC.ents.values()].filter(visible));
      const m0 = w2s([b[0], b[1]]), m1 = w2s([b[2], b[3]]);
      return { paperOnScreen: onScreen, canvas: [V.w, V.h],
               modelOnScreen: [Math.abs(m1[0] - m0[0]), Math.abs(m1[1] - m0[1])] };`);
    ok(r.paperOnScreen[0] > r.canvas[0] * 0.6,
      'the sheet must fill the view, got ' + Math.round(r.paperOnScreen[0]) +
      'px of ' + Math.round(r.canvas[0]));
    ok(r.paperOnScreen[0] <= r.canvas[0], 'and not overflow it');
    ok(r.modelOnScreen[0] > r.canvas[0] * 0.5,
      'model space still fits the model, got ' + Math.round(r.modelOnScreen[0]));
  });

  group('sheets: working inside a viewport');

  t('a viewport is a window: the model moves, the paper does not', () => {
    const r = R(`${SETUP}
      addEnt({t:'wall', a:[0,0], b:[8000,0], wt:'gen100', layer:'A-WALL'});
      cancelCmd();
      dispatch('LAYOUT'); dispatch('N'); dispatch('A-101');
      const sh = DOC.sheets[0], vp = sh.viewports[0];
      fitSheet();
      const mid = w2s(sheetWorld(sh, vp.x + vp.w/2, vp.y + vp.h/2));
      setActiveVp(sh, vp.id);
      const paperBefore = w2s(sheetWorld(sh, 0, 0));
      const viewBefore = { z: V.z, px: V.px, py: V.py };
      /* zoom with the cursor off-centre: the model under it must not shift */
      const sx = mid[0] + 70, sy = mid[1] - 40;
      const under0 = s2vpModel(sh, vp, sx, sy);
      const scale0 = vp.scale;
      vpZoomAt(sh, vp, sx, sy, 1.35);
      const under1 = s2vpModel(sh, vp, sx, sy);
      const paperAfter = w2s(sheetWorld(sh, 0, 0));
      return {
        held: Math.hypot(under1[0]-under0[0], under1[1]-under0[1]),
        scaleChanged: Math.abs(vp.scale - scale0) > 1e-9,
        paperMoved: Math.hypot(paperAfter[0]-paperBefore[0], paperAfter[1]-paperBefore[1]),
        viewUntouched: V.z === viewBefore.z && V.px === viewBefore.px && V.py === viewBefore.py };`);
    ok(r.held < 1e-6, 'zoom must hold what is under the cursor, drifted ' + r.held + 'mm');
    eq(r.scaleChanged, true, 'and it must actually zoom');
    ok(r.paperMoved < 1e-9, 'the PAGE must not move when the model does');
    eq(r.viewUntouched, true, 'the paper view transform is untouched');
  });

  t('panning inside a viewport moves the model one for one', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[8000,0], layer:'0'});
      cancelCmd();
      dispatch('LAYOUT'); dispatch('N'); dispatch('A-101');
      const sh = DOC.sheets[0], vp = sh.viewports[0];
      fitSheet(); setActiveVp(sh, vp.id);
      const k = vp.scale * V.z;
      const c0 = vp.centre.slice();
      vpPanBy(sh, vp, 100, 0);
      const dx = c0[0] - vp.centre[0];
      vpPanBy(sh, vp, -100, 0);
      return { dx, want: 100 / k, backToStart: Math.hypot(vp.centre[0]-c0[0], vp.centre[1]-c0[1]) };`);
    close(r.dx, r.want, 1e-9, '100px of drag must move 100px worth of model');
    ok(r.backToStart < 1e-9, 'and dragging back must land exactly where it started');
  });

  t('double click enters a viewport and leaves it', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[8000,0], layer:'0'});
      cancelCmd();
      dispatch('LAYOUT'); dispatch('N'); dispatch('A-101');
      const sh = DOC.sheets[0], vp = sh.viewports[0];
      fitSheet();
      const inside = s2paper(sh, ...w2s(sheetWorld(sh, vp.x + vp.w/2, vp.y + vp.h/2)));
      const hitIn = vpAt(sh, inside[0], inside[1]);
      const hitOut = vpAt(sh, 2, 2);
      setActiveVp(sh, hitIn ? hitIn.id : null);
      const entered = !!activeVp();
      setActiveVp(sh, null);
      return { hitIn: !!hitIn, hitOut, entered, left: activeVp() === null };`);
    eq(r.hitIn, true, 'the middle of a viewport is inside it');
    eq(r.hitOut, null, 'and the corner of the page is not');
    eq(r.entered, true); eq(r.left, true, 'Escape must put you back on the page');
  });

  t('VPSCALE sets an exact scale off the ruler', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[8000,0], layer:'0'});
      cancelCmd();
      dispatch('LAYOUT'); dispatch('N'); dispatch('A-101');
      const sh = DOC.sheets[0], vp = sh.viewports[0];
      setActiveVp(sh, vp.id);
      const out = {};
      for (const typed of ['50', '1:200', '1:20', '0.01']) {
        dispatch('VPSCALE'); dispatch(typed);
        out[typed] = scaleLabel(vp.scale);
      }
      /* nonsense must be refused, and must not silently change the drawing */
      const before = vp.scale;
      dispatch('VPSCALE'); dispatch('banana');
      out.kept = vp.scale === before;
      endCmd(true);
      return out;`);
    eq(r['50'], '1:50', 'typing 50 means 1:50');
    eq(r['1:200'], '1:200'); eq(r['1:20'], '1:20');
    eq(r['0.01'], '1:100', 'a ratio works too');
    eq(r.kept, true, 'nonsense must not change the scale of a drawing');
  });
};
