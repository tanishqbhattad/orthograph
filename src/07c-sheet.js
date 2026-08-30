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

/* ============================================================
   Working inside a viewport
   ------------------------------------------------------------
   Double-click into a viewport and you are looking at the model
   through that window: panning and zooming move the MODEL behind
   the paper rather than moving the paper on the screen. Double-
   click outside, or press Escape, and you are back on the page.
   This is exactly AutoCAD's model/paper toggle, and it is the
   difference between a sheet you can compose and a sheet whose
   views are fixed wherever they happened to land.
   ============================================================ */
/** the viewport under a point given in PAPER millimetres, topmost first */
function vpAt(sh, px, py) {
  const list = (sh && sh.viewports) || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const v = list[i];
    if (px >= v.x && px <= v.x + v.w && py >= v.y && py <= v.y + v.h) return v;
  }
  return null;
}
/** screen -> paper millimetres (paper world is y up; a sheet counts y down).
    Always through the PAPER view, so it keeps answering correctly while we are
    standing inside a viewport and V describes the model. */
function s2paper(sh, sx, sy) {
  const w = paperS2W(sx, sy);
  return [w[0], sh.h - w[1]];
}
/** screen -> model millimetres, seen through a viewport */
function s2vpModel(sh, vp, sx, sy) {
  const p = s2paper(sh, sx, sy);
  return vpToModel(vp, p[0], p[1]);
}
function activeVp() {
  const sh = curSheet(); if (!sh) return null;
  return (sh.viewports || []).find(v => v.id === sh.activeVp) || null;
}
/** Write the live view back into the viewport it belongs to. Standing inside a
    window, V is the model view, so the viewport's scale and centre are simply
    read out of it — which is why an ordinary pan or zoom needs to know nothing
    about paper space to do the right thing. */
function syncVpFromView(sh) {
  const vp = activeVp();
  if (!vp || !insideVp()) return;
  const pv = PAPERV;
  vp.scale = V.z / pv.z;
  const ax = vp.x + vp.w / 2, ay = sh.h - (vp.y + vp.h / 2);
  const m = s2w(ax * pv.z + pv.px, -ay * pv.z + pv.py);
  vp.centre[0] = m[0]; vp.centre[1] = m[1];
}
/** Step into a viewport, or back out onto the page. Entering sets the paper
    view aside and makes V the model view seen through that window; leaving
    writes the view back into the viewport and restores the page. Everything
    else — snap, pick, dynamic input, every draw command — then works through
    the window without knowing one exists. */
function setActiveVp(sh, id) {
  if (!sh) return;
  const was = sh.activeVp || null;
  const next = id || null;
  if (was === next) return;
  if (was && insideVp()) {
    syncVpFromView(sh);
    Object.assign(V, PAPERV);
    PAPERV = null;
  }
  sh.activeVp = next;
  if (next) {
    const vp = (sh.viewports || []).find(v => v.id === next);
    if (vp) {
      PAPERV = { z: V.z, px: V.px, py: V.py, rot: V.rot };
      Object.assign(V, vpViewState(sh, vp, PAPERV));
      V.rot = 0;
      sh.selVp = null;
    } else { sh.activeVp = null; }
  }
  cliPrint(sh.activeVp ? 'In the viewport — you are drawing in the model. Esc to leave.'
                       : 'On the page.');
  if (typeof syncViewUI === 'function') syncViewUI();
  if (typeof syncCoord === 'function') syncCoord();
  draw();
}
/** Zoom the MODEL inside a viewport, holding still whatever is under the
    cursor — the same contract zoomAt keeps on the page. The scale stops being
    a standard one, which is honest: the title block will say so until it is
    set back to a scale off the ruler. */
function vpZoomAt(sh, vp, sx, sy, f) {
  const before = s2vpModel(sh, vp, sx, sy);
  const ns = clamp(vp.scale * f, 1 / 500000, 100);
  if (!(ns > 0) || ns === vp.scale) return;
  vp.scale = ns;
  const after = s2vpModel(sh, vp, sx, sy);
  vp.centre[0] += before[0] - after[0];
  vp.centre[1] += before[1] - after[1];
  draw();
  if (typeof syncViewUI === 'function') syncViewUI();
}
/** Pan the model inside a viewport by a screen delta. The paper does not move:
    a drag of n pixels slides the model by n pixels' worth of model, which is
    what "looking through a window" has to mean. */
function vpPanBy(sh, vp, dxScr, dyScr) {
  const k = (vp.scale || 1) * (V.z || 1);
  if (!(k > 0)) return;
  vp.centre[0] -= dxScr / k;
  vp.centre[1] += dyScr / k;
}
/** set a viewport to an exact scale off the ruler, keeping its centre */
defc('vpscale', {
  key: 'vpscale', group: 'view',
  hint: 'Scale for this viewport — type 50 for 1:50, or a ratio',
  init(c) {
    const vp = activeVp() || ((curSheet() || {}).viewports || [])[0];
    if (!vp) { cliPrint('No viewport. Make one with MVIEW.', 'err'); c.done = true; endCmd(true); return; }
    c.data = { vp };
    cliPrint('This viewport is at ' + scaleLabel(vp.scale));
  },
  text(c, s) {
    const raw = String(s).trim();
    let r = null;
    const m = /^1\s*[:/]\s*([0-9.]+)$/.exec(raw);
    if (m) r = 1 / parseFloat(m[1]);
    else if (/^[0-9.]+$/.test(raw)) { const n = parseFloat(raw); r = n > 1 ? 1 / n : n; }
    else { const hit = SCALES.find(x => x.label === raw); if (hit) r = hit.r; }
    if (!(r > 0)) { cliPrint('Type a scale like 50, 1:50 or 0.02.', 'err'); return true; }
    begin(); c.data.vp.scale = r; commit('Viewport scale');
    cliPrint('Viewport set to ' + scaleLabel(r));
    draw();
    return true;
  },
});

/* ============================================================
   VPLAYER — freeze a layer in one viewport only
   ------------------------------------------------------------
   The piece that lets one model serve a general arrangement and
   a setting-out plan on the same sheet. Freeze the furniture in
   the second window and it is gone from that window and nowhere
   else: model space is untouched, and so is the other window.
   ============================================================ */
/** the viewport a paper-space command should act on */
function vpTarget() {
  const sh = curSheet(); if (!sh) return null;
  return activeVp() ||
         (sh.viewports || []).find(v => v.id === sh.selVp) ||
         (sh.viewports || [])[0] || null;
}
defc('vplayer', {
  key: 'vplayer', group: 'view',
  hint: '<em>F</em> freeze a layer here · <em>T</em> thaw · <em>R</em> reset this viewport',
  init(c) {
    const sh = needSheet(); if (!sh) { c.done = true; return endCmd(true); }
    const vp = vpTarget();
    if (!vp) { cliPrint('No viewport. Make one with MVIEW.', 'err'); c.done = true; return endCmd(true); }
    c.data = { vp, step: 'mode', on: true };
    const frz = (vp.frz || []);
    cliPrint(frz.length ? 'Frozen in this viewport: ' + frz.join(', ')
                        : 'Nothing is frozen in this viewport.');
  },
  text(c, s) {
    const raw = String(s).trim();
    if (c.data.step === 'mode') {
      const k = raw.slice(0, 1).toLowerCase();
      if (k === 'r') {
        const live = vpLive(c.data.vp) || c.data.vp;
        if (!(live.frz || []).length) { cliPrint('Nothing was frozen here.'); endCmd(true); return true; }
        begin(); touchSheets();
        (vpLive(c.data.vp) || c.data.vp).frz = [];
        commit('Thawed every layer in this viewport');
        shapeCacheClear(); draw(); endCmd(true); return true;
      }
      if (k !== 'f' && k !== 't') {
        cliPrint('Type F to freeze a layer here, T to thaw one, or R to reset.', 'err');
        return true;
      }
      c.data.on = k === 'f';
      c.data.step = 'layer';
      hint((c.data.on ? 'Layer to freeze' : 'Layer to thaw') + ' in this viewport');
      cliPrint((c.data.on ? 'Freeze' : 'Thaw') + ' which layer?');
      return true;
    }
    /* a layer name, or a comma-separated list of them, as AutoCAD takes */
    const names = raw.split(',').map(x => x.trim()).filter(Boolean);
    const done = [];
    for (const n of names) {
      const l = (DOC.layers || []).find(x => x.name.toLowerCase() === n.toLowerCase());
      if (!l) { cliPrint('There is no layer called ' + n + '.', 'err'); continue; }
      vpFreeze(c.data.vp, l.name, c.data.on);
      done.push(l.name);
    }
    if (done.length)
      cliPrint((c.data.on ? 'Frozen' : 'Thawed') + ' in this viewport: ' + done.join(', '));
    draw(); syncUI(); endCmd(true);
    return true;
  },
});

/* ============================================================
   Viewport grips
   ------------------------------------------------------------
   MVIEW places a window; without grips nothing ever moves it
   again, which makes composing a sheet a matter of getting the
   rectangle right first time. Click a frame to select it, then
   drag a corner to resize or the body to move. Resizing reveals
   or crops model — it never rescales the drawing, because the
   scale is the one thing on a sheet that must not change by
   accident.
   ============================================================ */
const VPGRIP_R = 7;                       /* pick radius, screen pixels */
const VPMIN = 5;                          /* smallest useful viewport, mm  */
/** the eight grip points of a viewport, in screen coordinates */
function vpGripPts(sh, vp) {
  const r = vpScreenRect(sh, vp);
  const [x, y, w, h] = r;
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h],
          [x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
}
function vpGripAt(sh, sx, sy) {
  const vp = (sh.viewports || []).find(v => v.id === sh.selVp);
  if (!vp) return null;
  const pts = vpGripPts(sh, vp);
  for (let i = 0; i < pts.length; i++)
    if (Math.hypot(sx - pts[i][0], sy - pts[i][1]) <= VPGRIP_R) return { vp, grip: i };
  return null;
}
/** Apply a grip drag, in paper millimetres. Edges move independently so a
    corner drags two and an edge grip drags one; the rectangle is normalised at
    the end so dragging an edge past its opposite number cannot invert it. */
function vpApplyGrip(sh, vp, grip, px, py) {
  let x0 = vp.x, y0 = vp.y, x1 = vp.x + vp.w, y1 = vp.y + vp.h;
  const L = () => { x0 = px; }, R = () => { x1 = px; };
  const T = () => { y0 = py; }, B = () => { y1 = py; };
  ({ 0: () => { L(); T(); }, 1: () => { R(); T(); }, 2: () => { R(); B(); },
     3: () => { L(); B(); }, 4: T, 5: R, 6: B, 7: L }[grip] || (() => {}))();
  const nx = Math.min(x0, x1), ny = Math.min(y0, y1);
  const nw = Math.abs(x1 - x0), nh = Math.abs(y1 - y0);
  if (nw < VPMIN || nh < VPMIN) return;   /* refuse, rather than snap to a sliver */
  /* the model under the window must not slide while the window is resized: the
     centre is anchored to the paper, so growing the frame reveals more */
  const oldC = vpToModel(vp, vp.x + vp.w / 2, vp.y + vp.h / 2);
  vp.x = clamp(nx, 0, sh.w); vp.y = clamp(ny, 0, sh.h);
  vp.w = nw; vp.h = nh;
  vp.centre[0] = oldC[0]; vp.centre[1] = oldC[1];
}
function drawVpGrips(sh, vp) {
  const pts = vpGripPts(sh, vp);
  ctx.save();
  ctx.setLineDash(DASH_SOLID);
  for (const p of pts) {
    ctx.fillStyle = CO.grip; ctx.strokeStyle = CO.bg; ctx.lineWidth = 1;
    ctx.fillRect(p[0] - 3.5, p[1] - 3.5, 7, 7);
    ctx.strokeRect(p[0] - 3.5, p[1] - 3.5, 7, 7);
  }
  ctx.restore();
}
/** the viewport whose frame or body is under a screen point */
function vpPickAt(sh, sx, sy) {
  const p = s2paper(sh, sx, sy);
  return vpAt(sh, p[0], p[1]);
}

/* ============================================================
   PAGESETUP — the sheet and its title block
   ------------------------------------------------------------
   The title-block fields have existed since the plot did, and
   until now were settable only from code, which meant every
   drawing this program could produce carried an empty title
   block. On an issued drawing that is not a cosmetic gap: the
   block is how anyone knows which project, which revision and
   which sheet they are holding.
   ============================================================ */
defm('PAGESETUP', () => {
  const sh = needSheet(); if (!sh) return;
  const T = sh.title || (sh.title = {});
  const opt = (v, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>';
  const sizes = Object.keys(PAPER).map(k => opt(k, sh.size)).join('');
  modal(
    '<h3>Sheet setup</h3>' +
    '<div class="row"><label>Size</label><select class="f" id="psSize">' + sizes + '</select></div>' +
    '<div class="row"><label>Orientation</label><select class="f" id="psOrient">' +
      '<option value="l"' + (sh.landscape ? ' selected' : '') + '>Landscape</option>' +
      '<option value="p"' + (!sh.landscape ? ' selected' : '') + '>Portrait</option></select></div>' +
    '<div class="row"><label>Project</label><input class="f" id="psProj" value="' + esc(T.project || '') + '"></div>' +
    '<div class="row"><label>Drawing</label><input class="f" id="psDwg" value="' + esc(T.drawing || '') + '"></div>' +
    '<div class="row"><label>Sheet no.</label><input class="f" id="psNum" value="' + esc(T.number || '') + '"></div>' +
    '<div class="row"><label>Revision</label><input class="f" id="psRev" value="' + esc(T.rev || '') + '"></div>' +
    '<div class="row"><label>Date</label><input class="f" id="psDate" value="' + esc(T.date || '') + '"></div>' +
    '<div class="row"><label>Drawn by</label><input class="f" id="psBy" value="' + esc(T.by || '') + '"></div>' +
    '<div class="row"><label>Title block</label><select class="f" id="psShow">' +
      '<option value="1"' + (T.show !== false ? ' selected' : '') + '>Show</option>' +
      '<option value="0"' + (T.show === false ? ' selected' : '') + '>Hide</option></select></div>',
    () => applyPageSetup(sh, {
      size: $('#psSize').value,
      landscape: $('#psOrient').value === 'l',
      project: $('#psProj').value, drawing: $('#psDwg').value,
      number: $('#psNum').value, rev: $('#psRev').value,
      date: $('#psDate').value, by: $('#psBy').value,
      show: $('#psShow').value === '1',
    }));
}, { group: 'view' });
defm('PAGE', () => META.pagesetup.fn(), { group: 'view' });

/** The work PAGESETUP does, with the dialog taken off it. Keeping this out of
    the DOM handler is what makes it testable at all — and a sheet's paper size
    is not something to leave resting on whether a modal rendered. */
function applyPageSetup(sh, o) {
  if (!sh || !o) return;
  begin();
  const size = o.size || sh.size;
  const land = o.landscape !== false;
  const [w, h] = paperSize(size, land);
  const changed = w !== sh.w || h !== sh.h;
  if (changed) {
    /* Keep every viewport on the paper when the paper changes under it.
       Scaling the frames with the sheet keeps a composed layout composed, and
       the SCALE is deliberately left alone: a drawing does not change scale
       because it moved from A3 to A1. */
    const kx = w / sh.w, ky = h / sh.h;
    for (const vp of (sh.viewports || [])) {
      vp.x *= kx; vp.y *= ky; vp.w *= kx; vp.h *= ky;
    }
  }
  sh.size = size; sh.landscape = land; sh.w = w; sh.h = h;
  const T = sh.title || (sh.title = {});
  for (const k of ['project', 'drawing', 'number', 'rev', 'date', 'by'])
    if (o[k] != null) T[k] = o[k];
  if (o.show != null) T.show = !!o.show;
  commit('Sheet setup');
  if (typeof buildSheetTabs === 'function') buildSheetTabs();
  if (!insideVp()) fitSheet();
  draw();
  cliPrint('Sheet ' + sh.name + ' — ' + sh.size + (sh.landscape ? ' landscape' : ' portrait'));
}
