'use strict';
/* ============================================================
   Paper space commands — LAYOUT, MSPACE / PSPACE, MVIEW, PLOT

   AutoCAD's names, because a draughtsman who has typed MVIEW for
   twenty years should not have to learn a new word to do the
   same thing. The model lives in 01-doc; the plot lives in
   11-io; this is only the way in.
   ============================================================ */

/** the sheet a command should act on, creating nothing implicitly */
function needSheet() {
  const sh = curSheet();
  if (!sh) { cliPrint('No layout is current. Use LAYOUT to make one.', 'err'); return null; }
  return sh;
}
/** switch to a sheet by name or index, or to model space with null */
function gotoSheet(idOrNull) {
  DOC.curSheet = idOrNull;
  if (typeof endCmd === 'function') endCmd(true);
  if (typeof syncUI === 'function') syncUI();
  if (typeof buildSheetTabs === 'function') buildSheetTabs();
  if (typeof fitSheet === 'function') fitSheet();
  if (typeof draw === 'function') draw();
}
function sheetByName(n) {
  const k = String(n || '').trim().toLowerCase();
  return (DOC.sheets || []).find(s => String(s.name).toLowerCase() === k) || null;
}

defc('layout', {
  key: 'layout', group: 'view',
  hint: '<em>N</em>ew · <em>S</em>et current · <em>R</em>ename · <em>D</em>elete · <em>?</em> list',
  init(c) { c.data = {}; },
  text(c, s) {
    const raw = String(s).trim(), k = raw.toLowerCase();
    const d = c.data;
    if (d.await === 'name') {
      /* a new layout defaults to A3 landscape, which is what most drawings
         start life on, and lands one viewport showing the whole model */
      const sh = newSheet(raw || ('Sheet ' + ((DOC.sheets || []).length + 1)), 'A3', true);
      begin();
      const b = bboxAll([...DOC.ents.values()].filter(visible));
      const c0 = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0];
      const vp = newViewport(sh, c0, fitScaleFor(sh, b));
      sh.viewports.push(vp);
      DOC.sheets.push(sh);
      commit('New layout');
      gotoSheet(sh.id);
      cliPrint('Layout "' + sh.name + '" created at ' + scaleLabel(vp.scale));
      return true;
    }
    if (d.await === 'set') {
      const sh = sheetByName(raw);
      if (!sh) { cliPrint('No layout called "' + raw + '".', 'err'); return true; }
      gotoSheet(sh.id); return true;
    }
    if (d.await === 'rename') {
      const sh = needSheet(); if (!sh) return true;
      begin(); sh.name = raw || sh.name; commit('Rename layout');
      if (typeof buildSheetTabs === 'function') buildSheetTabs();
      return true;
    }
    if (k === 'n' || k === 'new') { d.await = 'name'; hint('Name for the new layout:'); return true; }
    if (k === 's' || k === 'set') { d.await = 'set'; hint('Layout to make current:'); return true; }
    if (k === 'r' || k === 'rename') { d.await = 'rename'; hint('New name for this layout:'); return true; }
    if (k === 'd' || k === 'delete') {
      const sh = needSheet(); if (!sh) return true;
      begin();
      DOC.sheets = DOC.sheets.filter(x => x.id !== sh.id);
      commit('Delete layout');
      gotoSheet(DOC.sheets.length ? DOC.sheets[0].id : null);
      return true;
    }
    if (k === '?' || k === 'list') {
      const l = DOC.sheets || [];
      cliPrint(l.length ? l.map(s => s.name + '  ' + s.size + (s.landscape ? ' landscape' : ' portrait')).join('\n')
                        : 'No layouts yet.');
      return true;
    }
    return false;
  },
});
/** the largest standard scale that still fits the model on the sheet — what
    you want a brand new layout to open at, rather than an arbitrary 1:100 */
function fitScaleFor(sh, b) {
  if (!b) return 1 / 100;
  const m = sh.margin, tb = sh.title && sh.title.show ? sh.title.h : 0;
  const aw = Math.max(1, sh.w - m * 2), ah = Math.max(1, sh.h - m * 2 - tb);
  const mw = Math.max(1, b[2] - b[0]), mh = Math.max(1, b[3] - b[1]);
  const need = Math.min(aw / mw, ah / mh) * 0.92;      /* a little air round it */
  const fits = SCALES.filter(s => s.r <= need);
  return fits.length ? fits[0].r : SCALES[SCALES.length - 1].r;
}

defm('PSPACE', () => {
  if (!(DOC.sheets || []).length) { cliPrint('No layouts. Use LAYOUT to make one.', 'err'); return; }
  gotoSheet(DOC.curSheet != null ? DOC.curSheet : DOC.sheets[0].id);
}, { group: 'view' });
defm('MSPACE', () => gotoSheet(null), { group: 'view' });
defm('MODEL', () => gotoSheet(null), { group: 'view' });
defm('PLOT', () => {
  const sh = needSheet(); if (!sh) return;
  plotSheet(sh);
  cliPrint('Plotting ' + sh.name + ' at ' + sh.size + (sh.landscape ? ' landscape' : ' portrait'));
}, { group: 'view' });
defm('PRINT', () => META.plot.fn(), { group: 'view' });

defc('mview', {
  key: 'mview', group: 'view',
  hint: 'Pick the first corner of the viewport, on the paper',
  init(c) {
    if (!curSheet()) { cliPrint('MVIEW works on a layout. Use LAYOUT first.', 'err'); c.done = true; endCmd(true); }
    c.data = {};
  },
  point(c, p) {
    const sh = curSheet(); if (!sh) return;
    if (!c.data.a) { c.data.a = p.slice(); hint('Pick the opposite corner'); return; }
    const a = c.data.a, x = Math.min(a[0], p[0]), y = Math.min(a[1], p[1]);
    const w = Math.abs(p[0] - a[0]), h = Math.abs(p[1] - a[1]);
    if (w < 5 || h < 5) { cliPrint('That viewport would be too small to see.', 'err'); c.data.a = null; return; }
    const b = bboxAll([...DOC.ents.values()].filter(visible));
    const centre = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0];
    begin();
    const vp = newViewport(sh, centre, 1 / 100);
    vp.x = x; vp.y = y; vp.w = w; vp.h = h;
    vp.scale = fitScaleFor({ ...sh, margin: 0, title: { show: false } }, b) || 1 / 100;
    sh.viewports.push(vp);
    commit('New viewport');
    cliPrint('Viewport at ' + scaleLabel(vp.scale));
    draw();
  },
});
