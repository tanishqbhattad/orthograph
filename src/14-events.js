/* ============================================================
   ORTHOGRAPH — 14 events, command line, files, boot
   ============================================================ */
function echo(s) { const n = $('#echo'); if (n) n.textContent = s || ''; }
/** Every command states its prompt through hint(). The engine parses that one
    string, and the HUD, the keyword list and the command line all render from
    the parsed form — so a command never has to say the same thing twice. */
function hint(h) { promptSet(h); }
/** a keyword with its typed letters marked, the way AutoCAD capitalises them */
function kwHtml(k) {
  const w = k.word, i = w.toLowerCase().indexOf(k.key.toLowerCase());
  if (i < 0) return '<em>' + esc(w) + '</em>';
  return esc(w.slice(0, i)) + '<em>' + esc(w.slice(i, i + k.key.length)) + '</em>' + esc(w.slice(i + k.key.length));
}
function renderPrompt() {
  const n = $('#hint'); if (!n) return;
  const p = PROMPT;
  let h = '';
  if (p.base || p.keys.length) {
    h = esc(p.base.replace(/:\s*$/, ''));
    if (p.keys.length) h += (p.base ? ' or ' : '') + '[' + p.keys.map(kwHtml).join('/') + ']';
    if (!/[.?!:]$/.test(h)) h += ':';
    if (p.extra) h += ' · ' + esc(p.extra);
  }
  n.innerHTML = h;
  n.style.display = h ? '' : 'none';
}
let _tt;
function toast(s) {
  const t = $('#toast'); if (!t) return;
  t.textContent = s; t.classList.add('show');
  clearTimeout(_tt); _tt = setTimeout(() => t.classList.remove('show'), 2800);
}
/** How far one arrow press moves the crosshair.

    With snap on it is one snap step, because that is the grid the drawing is
    already being made on and anything else would land between the points a
    mouse can reach. With snap off there is no such grid, so it is ten screen
    pixels converted to model units — a step you can see at any zoom, rather
    than a fixed distance that is a crawl zoomed out and a leap zoomed in. */
function crosshairStepSize(coarse, fine) {
  let d = (VS.snapgrid && DOC.snapStep > 0) ? DOC.snapStep : 10 / (V.z || 1);
  if (coarse) d *= 10;
  if (fine) d /= 10;
  return d;
}
function crosshairStep(key, coarse, fine) {
  const d = crosshairStepSize(coarse, fine);
  const p = (ST.cur || [0, 0]).slice();
  if (key === 'ArrowRight') p[0] += d;
  else if (key === 'ArrowLeft') p[0] -= d;
  else if (key === 'ArrowUp') p[1] += d;
  else if (key === 'ArrowDown') p[1] -= d;
  ST.cur = p;
  /* everything a mouse move does, so snapping, tracking and the preview all
     behave as they would under the cursor rather than only the marker moving */
  const scr = w2s(p);
  ST.px = scr[0]; ST.py = scr[1];
  ST.snap = (typeof snapAt === 'function') ? snapAt(scr[0], scr[1], refPoint()) : ST.snap;
  if (typeof hoverAt === 'function') hoverAt(p);
  if (typeof cmdMove === 'function' && CMD) cmdMove(p);
  if (typeof showCoords === 'function') showCoords(p);
  draw();
  return p;
}
/** The click. A running command gets the point; otherwise it selects what is
    under the crosshair, which is the half of picking that typing a coordinate
    could never do. */
function crosshairPick() {
  const p = (ST.cur || [0, 0]).slice();
  const snapped = (ST.snap && ST.snap.p) ? ST.snap.p.slice() : p;
  if (CMD) { cmdPoint(snapped); draw(); return true; }
  const hit = (typeof pickAt === 'function') ? pickAt(p, 10) : null;
  if (!hit) { selClearAll(); syncUI(); draw(); return false; }
  if (!ST.shift) SEL.clear();
  SEL.add(hit.id);
  syncUI(); draw();
  return true;
}

function syncUI() {
  if (typeof buildSheetTabs === 'function') buildSheetTabs();
  buildLayers(); buildLevels(); buildProps(); syncTools();
  const u = $('#mUndo'), r = $('#mRedo');
  if (u) u.disabled = !HIST.past.length;
  if (r) r.disabled = !HIST.future.length;
}

/* The alias table, the META registry and the dispatcher all live in 07-cmd.js
   now — one source of truth, so ALIAS agrees with what AutoComplete offers. */
function openDimStyle() {
  const S = dimStyle();
  modal(`<h3>Dimension style</h3>
    <div class="row"><label>Text height</label><input class="f" id="dsT" value="${+(S.txt / U[DOC.units]).toFixed(4)}"></div>
    <div class="row"><label>Arrow size</label><input class="f" id="dsA" value="${+(S.arrow / U[DOC.units]).toFixed(4)}"></div>
    <div class="row"><label>Ext offset</label><input class="f" id="dsO" value="${+(S.extOff / U[DOC.units]).toFixed(4)}"></div>
    <div class="row"><label>Ext beyond</label><input class="f" id="dsB" value="${+(S.extBey / U[DOC.units]).toFixed(4)}"></div>
    <div class="row"><label>Decimals</label><input class="f" id="dsP" value="${S.prec == null ? '' : S.prec}" placeholder="auto"></div>
    <h4>How the number reads</h4>
    <div class="row"><label>Units</label><select class="f" id="dsU">
      <option value="dec"${S.lunit !== 'arch' ? ' selected' : ''}>Decimal</option>
      <option value="arch"${S.lunit === 'arch' ? ' selected' : ''}>Feet and inches</option>
    </select></div>
    <div class="row"><label>Prefix</label><input class="f" id="dsPre" value="${esc(S.pre)}" placeholder="none"></div>
    <div class="row"><label>Suffix</label><input class="f" id="dsSuf" value="${esc(S.suf)}" placeholder="e.g. mm"></div>
    <div class="row"><label>Drop zeros</label><select class="f" id="dsZ">
      <option value="0">Keep them</option>
      <option value="1"${S.zsupL && !S.zsupT ? ' selected' : ''}>Leading</option>
      <option value="2"${S.zsupT && !S.zsupL ? ' selected' : ''}>Trailing</option>
      <option value="3"${S.zsupL && S.zsupT ? ' selected' : ''}>Both</option>
    </select></div>
    <div class="row"><label>Measure &times;</label><input class="f" id="dsLF" value="${S.lfac}"></div>
    <div class="row"><label>Round to</label><input class="f" id="dsR" value="${S.rnd || ''}" placeholder="not at all"></div>
    <h4>Tolerance</h4>
    <div class="row"><label>Kind</label><select class="f" id="dsTol">
      <option value="none"${S.tol === 'none' ? ' selected' : ''}>None</option>
      <option value="sym"${S.tol === 'sym' ? ' selected' : ''}>Symmetrical &plusmn;</option>
      <option value="dev"${S.tol === 'dev' ? ' selected' : ''}>Deviation + / &minus;</option>
      <option value="lim"${S.tol === 'lim' ? ' selected' : ''}>Limits</option>
      <option value="basic"${S.tol === 'basic' ? ' selected' : ''}>Basic (boxed)</option>
    </select></div>
    <div class="row"><label>Upper</label><input class="f" id="dsTU" value="${S.tolUp || ''}" placeholder="0"></div>
    <div class="row"><label>Lower</label><input class="f" id="dsTL" value="${S.tolLo || ''}" placeholder="same as upper"></div>
    <div class="row"><label>Tol decimals</label><input class="f" id="dsTD" value="${S.tolPrec == null ? '' : S.tolPrec}" placeholder="as above"></div>`, () => {
    /* the settings belong to the current dimension style, which is what
       DIMSTYLE saves and restores; DOC.dimStyle is the pre-styles document
       and is kept in step so an old file still opens the way it was left */
    const rec = curDimStyleRec();
    DOC.dimStyle = DOC.dimStyle || {};
    begin();
    const put = (k, v) => { rec[k] = v; DOC.dimStyle[k] = v; };
    put('txt', parseLen($('#dsT').value) || S.txt);
    put('arrow', parseLen($('#dsA').value) || S.arrow);
    put('extOff', parseLen($('#dsO').value));
    put('extBey', parseLen($('#dsB').value));
    const p = $('#dsP').value.trim();
    put('prec', p === '' ? null : clamp(parseInt(p) || 0, 0, 6));
    put('lunit', $('#dsU').value === 'arch' ? 'arch' : 'dec');
    put('pre', $('#dsPre').value);
    put('suf', $('#dsSuf').value);
    const z = parseInt($('#dsZ').value) || 0;
    put('zsupL', !!(z & 1)); put('zsupT', !!(z & 2));
    const lf = parseFloat($('#dsLF').value);
    put('lfac', isFinite(lf) && lf !== 0 ? lf : 1);
    put('rnd', Math.max(0, parseLen($('#dsR').value) || 0));
    put('tol', $('#dsTol').value);
    put('tolUp', parseLen($('#dsTU').value) || 0);
    const tl = $('#dsTL').value.trim();
    put('tolLo', tl === '' ? (parseLen($('#dsTU').value) || 0) : (parseLen(tl) || 0));
    const td = $('#dsTD').value.trim();
    put('tolPrec', td === '' ? null : clamp(parseInt(td) || 0, 0, 8));
    commit('Dimension style');
    draw(); syncUI();
  });
}
function runAudit() {
  const problems = [];
  const ids = new Set(DOC.ents.keys());
  for (const e of DOC.ents.values()) {
    if (!hasLayer(e.layer)) problems.push(`#${e.id} ${e.t} is on missing layer "${e.layer}"`);
    if ((e.t === 'door' || e.t === 'window') && !ids.has(e.host)) problems.push(`#${e.id} ${e.t} has no host wall`);
    if (e.t === 'wall' && dist(e.a, e.b) < 1) problems.push(`#${e.id} wall has almost no length`);
    if (e.t === 'insert' && !(DOC.blocks || {})[e.name]) problems.push(`#${e.id} references missing block "${e.name}"`);
    const b = bbox(e);
    if (!b.every(v => isFinite(v))) problems.push(`#${e.id} ${e.t} has a non-finite extent`);
  }
  if (!problems.length) { toast('Audit clean — ' + DOC.ents.size + ' objects'); return; }
  modal(`<h3>Audit found ${problems.length} issue${problems.length > 1 ? 's' : ''}</h3>
    <div style="font-family:var(--mono);font-size:11px;max-height:46vh;overflow:auto">${problems.slice(0, 200).map(esc).join('<br>')}</div>
    <p style="margin-top:12px">Apply to delete the orphans and put stray objects back on layer 0.</p>`, () => {
    begin();
    for (const e of [...DOC.ents.values()]) {
      if (!hasLayer(e.layer)) { mut(e); e.layer = '0'; }
      if ((e.t === 'door' || e.t === 'window') && !DOC.ents.has(e.host)) delEnt(e.id);
      if (e.t === 'insert' && !(DOC.blocks || {})[e.name]) delEnt(e.id);
    }
    commit('Audit repair'); draw(); syncUI();
  });
}
const cmdIn = $('#cmd');
let hi = -1;                                       /* index into CLI.history */
function focusCmd() { if (cmdIn) cmdIn.focus(); }
if (cmdIn && cmdIn.addEventListener) cmdIn.addEventListener('keydown', ev => {
  const H = CLI.history;
  if (ev.key === 'ArrowUp') { if (hi < H.length - 1) { hi++; cmdIn.value = H[H.length - 1 - hi]; } ev.preventDefault(); }
  else if (ev.key === 'ArrowDown') { if (hi > 0) { hi--; cmdIn.value = H[H.length - 1 - hi]; } else { hi = -1; cmdIn.value = ''; } ev.preventDefault(); }
  else if (ev.key === 'Escape') { cmdIn.value = ''; cancelCmd(); if (cv.focus) cv.focus(); }
  else if (ev.key === 'Enter' || (ev.key === ' ' && !cmdTakesSpace())) {
    const s = cmdIn.value.trim(); cmdIn.value = '';
    if (s) { H.push(s); hi = -1; if (H.length > 200) H.shift(); }
    runInput(s); ev.preventDefault();
  }
});
/** TEXT and friends read a literal line, so Space must not act as Enter there */
function cmdTakesSpace() {
  return !!(CMD && CMD.phase === 'run' && (CMD.def.key === 'text' || CMD.def.key === 'mtext' || CMD.def.key === 'leader'));
}
/* draftToggle (06-snap) owns the ORTHO/POLAR exclusion rule and the redraw */
function tgl(k) { const v = draftToggle(k); echo(k.toUpperCase() + ' ' + (v ? 'on' : 'off')); return v; }
function syncToggles() {
  document.querySelectorAll('.tg').forEach(b => {
    b.classList.toggle('on', !!ST[b.dataset.tg]);
    if (!b.title) {
      const k = b.dataset.key;
      b.title = b.textContent.trim() + (k ? '  ' + k : '') +
        (b.dataset.set ? '  ·  right-click for settings' : '');
    }
    if (b.dataset.set && !b._wired) {
      b._wired = 1;
      b.addEventListener('contextmenu', ev => {
        ev.preventDefault();
        openOsnapSettings(b.dataset.set === 'polar' || b.dataset.set === 'otrack' ? 1 : b.dataset.set === 'snap' ? 0 : 2);
      });
    }
  });
}

function syncCoord() {
  const n = $('#coord'); if (!n) return;
  if (!VS.coords) { n.innerHTML = '<b>COORDS off</b>'; return; }
  const p = ST.cur || [0, 0];
  /* relative display, like AutoCAD's second COORDS mode, once there is a
     rubber band to measure from */
  const rel = VS.coords === 2 && ST.lastPt && ST.drawing;
  let s = rel
    ? `<b>Δ</b> ${fmt(dist(ST.lastPt, p))} <b>&lt;</b> ${deg(ang(ST.lastPt, p)).toFixed(1)}°`
    : `<b>X</b> ${fmt(p[0])}  <b>Y</b> ${fmt(p[1])}`;
  if (!rel && ST.lastPt && ST.drawing) s += `  <b>Δ</b> ${fmt(dist(ST.lastPt, p))} ∠${deg(ang(ST.lastPt, p)).toFixed(1)}°`;
  n.innerHTML = s;
}
/** the view scale, in the 1:n form a drafter reads off a title block */
function syncScale() {
  const n = $('#vscale'); if (!n) return;
  n.textContent = viewScaleText();
  n.title = 'View scale on screen · click to zoom to extents';
}

/* ---------- pointer + keyboard ---------- */
const stage = $('#stage');
let ptrs = new Map(), pinch = null, downPt = null, downScr = null, moved = false;
/* what the button went down on, resolved on release: a press that turns into
   a drag becomes a lasso, a press that does not becomes a pick */
let pend = null;

/** Lift the settings off an existing object onto the tool in hand. Returns
    true when the click was consumed. */
function takeStyleFrom(p) {
  const t = ST.styleTarget;
  if (!t) return false;
  const e = pickAt(p, 12, x => x.t === t.kind);
  if (!e) { ST.styleTarget = null; echo('Nothing of that kind there'); buildProps(); return true; }
  const c = t.c && CMD === t.c ? t.c : null;
  if (t.kind === 'wall') {
    ARCH.wt = e.wt || ARCH.wt;
    if (e.th != null) ARCH.wallTh = e.th;
    if (e.h) ARCH.wallH = e.h;
    if (c) { c.wt = ARCH.wt; c.th = e.th != null ? e.th : null; }
  } else if (t.kind === 'door') {
    ARCH.dt = e.dt || ARCH.dt;
    if (c) { c.type = ARCH.dt; c.flip = !!e.flip; c.hand = e.hand === -1 ? -1 : 1; }
  } else if (t.kind === 'window') {
    ARCH.wtp = e.wtp || ARCH.wtp;
    if (c) { c.type = ARCH.wtp; c.flip = !!e.flip; }
  }
  ST.styleTarget = null;
  toast('Settings copied from ' + t.kind + ' #' + e.id);
  buildProps(); draw();
  return true;
}
function localXY(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
function refPoint() {
  /* FROM's base point and MID-BETWEEN's first pick outrank the command's own
     last point: that is what makes the rubber band, ortho and the dynamic
     input read from the right place while a modifier is pending */
  const m = typeof ptModRef === 'function' && ptModRef();
  if (m) return m;
  if (CMD && CMD.phase === 'run' && CMD.pts && CMD.pts.length) return CMD.pts[CMD.pts.length - 1];
  /* a grip edit measures from its base point, so ortho, polar and the dynamic
     length/angle box all bind the drag exactly as they do while drawing */
  if (CMD && CMD.def.key === 'gripedit' && CMD.base) return CMD.base;
  if (ST.dragGrip) return ST.dragGrip.p;
  return null;
}
/** true when a click on the canvas is a selection click rather than input
    for a running command */
function selPhase() { return !CMD || CMD.phase === 'sel'; }
/** report a pick the way the selection prompt does */
function afterPick(n) {
  syncUI(); draw();
  if (CMD && CMD.phase === 'sel') echo((n || 0) + ' found, ' + SEL.size + ' total');
}
/** open a region gesture. Starting one on empty ground clears the set first,
    which is what "click empty space to deselect" actually means. */
function startBandGesture(scr, kind, sense, keep) {
  if (!keep && ST.selMode !== 'remove') selClearAll();
  bandBegin(scr, kind, sense);
  return ST.band;
}
stage.addEventListener('pointerdown', ev => {
  if (ev.target.closest('.dyn')) return;
  /* a pointer that has already been released throws here, and losing the
     capture must never cost us the whole press */
  try { stage.setPointerCapture(ev.pointerId); } catch (_) { }
  ptrs.set(ev.pointerId, localXY(ev));
  if (cmdIn) cmdIn.blur();
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: dist(a, b), c: mid(a, b), z: V.z }; bandCancel(); ST.panning = false; return;
  }
  const scr = localXY(ev);
  downScr = scr; moved = false; pend = null;
  /* Pan on the middle button, on a held spacebar, and for the whole of the
     PAN command. The right button is AutoCAD's shortcut menu, not a pan. */
  /* On the page — not inside a window — the left button selects and drags
     viewports. Inside one, the pointer belongs to the model and this is
     skipped entirely. */
  const _psh = (typeof curSheet === 'function') ? curSheet() : null;
  if (_psh && !insideVp() && ev.button === 0 && !ev.altKey && !ST.panReady && !ST.panCmd && !CMD) {
    const g = vpGripAt(_psh, scr[0], scr[1]);
    if (g) {
      ST.vpDrag = { vp: g.vp, grip: g.grip };
      stage.setPointerCapture && stage.setPointerCapture(ev.pointerId);
      begin();
      return;
    }
    const hit = vpPickAt(_psh, scr[0], scr[1]);
    if (hit) {
      if (_psh.selVp !== hit.id) { _psh.selVp = hit.id; draw(); }
      const pp = s2paper(_psh, scr[0], scr[1]);
      ST.vpDrag = { vp: hit, grip: -1, ox: pp[0] - hit.x, oy: pp[1] - hit.y };
      stage.setPointerCapture && stage.setPointerCapture(ev.pointerId);
      begin();
      return;
    }
    if (_psh.selVp) { _psh.selVp = null; draw(); }
  }
  if (ev.button === 1 || (ev.button === 0 && (ev.altKey || ST.panReady || ST.panCmd))) {
    cancelAnim();
    ST.panning = { x: scr[0], y: scr[1], px: V.px, py: V.py };
    ST.panDragged = false; navCursor(); return;
  }
  /* ZOOM real time: drag up to magnify, anchored where the drag started */
  if (ST.rtzoom && ev.button === 0) {
    ST.rtdrag = { x: scr[0], y: scr[1] }; navCursor(); return;  }
  const p = snapPoint(scr[0], scr[1], refPoint());
  ST.cur = p; downPt = p;
  ST.shift = ev.shiftKey;
  hideCycleList();
  /* the style eyedropper takes the click before the command can treat it as a
     point, so the settings can be lifted mid-command */
  if (ST.styleTarget && takeStyleFrom(p)) { downPt = null; downScr = null; return; }
  if (CMD && CMD.phase === 'run') { const eff = dynApply(p); dynRelease(); cmdPoint(eff); syncCoord(); return; }
  if (!selPhase()) return;

  /* a polygon or fence is collecting vertices */
  if (ST.band && !ST.band.live && ST.band.kind !== 'rect') { bandPush(scr); draw(); return; }
  /* implied windowing, second corner */
  if (ST.band && !ST.band.live && ST.band.kind === 'rect') {
    bandMove(scr);
    afterPick(bandCommit(ev.shiftKey ? true : undefined));
    downPt = null; downScr = null; return;
  }
  /* W / C / WP / CP / F was typed and is waiting for its first point */
  if (ST.pendOption) {
    const o = ST.pendOption; ST.pendOption = null;
    startBandGesture(scr, o.kind, o.sense, true);
    draw(); return;
  }
  /* a grip goes hot the instant it is pressed */
  const g = gripAt(p);
  if (g) { gripClick(g, ev.shiftKey); downPt = null; return; }
  pend = { scr, p, shift: ev.shiftKey };
}, { passive: false });

stage.addEventListener('pointermove', ev => {
  const scr = localXY(ev);
  if (ptrs.has(ev.pointerId)) ptrs.set(ev.pointerId, scr);
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = dist(a, b), c = mid(a, b);
    const f = d / Math.max(pinch.d, 1);
    V.px += c[0] - pinch.c[0]; V.py += c[1] - pinch.c[1];
    pinch.c = c;
    zoomAt(c[0], c[1], (pinch.z * f) / V.z); pinch.d = d; pinch.z = V.z;
    return;
  }
  if (ST.vpDrag) {
    const sh = curSheet();
    if (sh) {
      const pp = s2paper(sh, scr[0], scr[1]);
      const d = ST.vpDrag;
      if (d.grip < 0) {
        /* moving the window takes its view with it: the same model stays in
           frame, which is what dragging a view on a sheet has to mean */
        d.vp.x = clamp(pp[0] - d.ox, 0, sh.w - d.vp.w);
        d.vp.y = clamp(pp[1] - d.oy, 0, sh.h - d.vp.h);
      } else {
        vpApplyGrip(sh, d.vp, d.grip, pp[0], pp[1]);
      }
      moved = true; draw();
    }
    return;
  }
  if (ST.panning) {
    /* 1:1 and absolute — recomputed from the press point every move, so a pan
       can never accumulate drift however long the drag runs */
    V.px = ST.panning.px + (scr[0] - ST.panning.x);
    V.py = ST.panning.py + (scr[1] - ST.panning.y);
    moved = true; ST.panDragged = true; syncViewUI(); draw(); return;
  }
  if (ST.rtdrag) {
    const dy = scr[1] - ST.rtdrag.y;
    ST.rtdrag.y = scr[1];
    if (dy) zoomAt(ST.rtdrag.x, ST.rtdrag.y, Math.pow(1.006, -dy));
    return;
  }
  const p = snapPoint(scr[0], scr[1], refPoint());
  ST.cur = p;
  if (downScr && hyp(scr[0] - downScr[0], scr[1] - downScr[1]) > 4) moved = true;
  if (CMD && CMD.phase === 'run') cmdPreview(dynApply(p));
  else if (ST.band) bandMove(scr);
  else if (pend && moved) {
    /* press-drag-release is a lasso — AutoCAD's PICKAUTO lasso bit. With it
       off the same gesture rubber-bands a rectangle. */
    startBandGesture(pend.scr, ST.lassoOn ? 'lasso' : 'rect', null, pend.shift);
    ST.band.live = true;
    bandMove(scr);
  } else if (selPhase()) {
    const g = gripAt(p);
    gripHoverUpdate(g);
    syncGripMenu();
    if (g) { ST.hot = null; ST.cycleList = null; }
    else pickHover(p, 8);
  }
  syncCoord(); syncDyn(); draw();
}, { passive: false });

stage.addEventListener('pointerup', ev => {
  ptrs.delete(ev.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (ST.vpDrag) {
    const d = ST.vpDrag; ST.vpDrag = null;
    commit(d.grip < 0 ? 'Move viewport' : 'Resize viewport');
    downPt = null; downScr = null; pend = null; draw();
    return;
  }
  if (ST.panning) { ST.panning = null; navCursor(); downPt = null; downScr = null; pend = null; return; }
  if (ST.rtdrag) { ST.rtdrag = null; navCursor(); downPt = null; downScr = null; pend = null; return; }  const scr = localXY(ev);
  const p = ST.cur || s2w(scr[0], scr[1]);
  /* a grip dragged rather than clicked finishes where the button came up */
  if (CMD && CMD.def.key === 'gripedit' && moved) {
    cmdPoint(dynApply(p)); syncCoord();
    downPt = null; downScr = null; pend = null; return;
  }
  if (ST.band && ST.band.live) {
    bandMove(scr);
    afterPick(bandCommit(ev.shiftKey ? true : undefined));
    downPt = null; downScr = null; pend = null; return;
  }
  if (pend && !moved && selPhase()) resolveClick(pend, ev);
  downPt = null; downScr = null; pend = null;
});
/**
 * A click that did not turn into a drag.
 *   nothing under it  → clear the set and arm implied windowing, so the next
 *                       click completes a window (left→right) or a crossing.
 *   one object        → add it (PICKADD); Shift takes it back out.
 *   several           → hand them to the cycling list so any is reachable.
 */
function resolveClick(q, ev) {
  const p = q.p;
  const cands = pickCandidates(p, 9);
  const remove = ev.shiftKey || ST.selMode === 'remove';
  if (!cands.length) {
    if (!ev.shiftKey && ST.selMode !== 'remove') selClearAll();
    startBandGesture(q.scr, 'rect', null, true);
    syncUI(); draw(); return;
  }
  if (cands.length > 1 && ST.selCycling >= 2 && !ev.shiftKey) {
    showCycleList(q.scr, cands, remove);
    return;
  }
  const e = cands[Math.min(ST.cycleIdx || 0, cands.length - 1)];
  afterPick(selApply([e.id], remove));
}
stage.addEventListener('pointercancel', ev => { ptrs.delete(ev.pointerId); pinch = null; ST.panning = null; });
stage.addEventListener('contextmenu', ev => {
  ev.preventDefault();
  /* AutoCAD's convention: Shift + right-click is the object snap menu */
  if (ev.shiftKey) { showSnapMenu(ev.clientX, ev.clientY); return; }
  hideSnapMenu();
  if (CMD) { if (CMD.def.enter) cmdEnter(); else endCmd(); }
});
window.addEventListener('pointerdown', ev => {
  if (SNAPMENU && !ev.target.closest('.snapmenu')) hideSnapMenu();
}, true);
stage.addEventListener('dblclick', ev => {
  /* On a sheet, a double click is the model/paper toggle, not an edit: inside
     a viewport it takes you through the window, outside it brings you back. */
  const sh = (typeof curSheet === 'function') ? curSheet() : null;
  if (sh) {
    const scr = localXY(ev);
    const pp = s2paper(sh, scr[0], scr[1]);
    const vp = vpAt(sh, pp[0], pp[1]);
    setActiveVp(sh, vp ? vp.id : null);
    return;
  }
  const p = ST.cur; if (!p) return;
  const e = pickAt(p, 9);
  if (!e) return;
  SEL.clear(); SEL.add(e.id); syncUI();
  if (e.t === 'mtext') {
    /* one object, so one dialog — the whole paragraph, its height and the
       width it wraps to */
    mtextDialog(e.p, e.w || 0, e);
  } else if (e.t === 'text') {
    modal('<h3>Edit text</h3><div class="row"><label>Text</label><input class="f" id="tx" value="' + esc(e.s) + '"></div>',
      () => { begin(); mut(e); e.s = $('#tx').value; commit('Text'); draw(); buildProps(); });
  } else if (e.t === 'room') {
    modal('<h3>Room name</h3><div class="row"><label>Name</label><input class="f" id="rn" value="' + esc(e.name || '') + '"></div>',
      () => { begin(); mut(e); e.name = ($('#rn').value || '').toUpperCase(); commit('Room'); draw(); buildProps(); });
  } else if (e.t === 'door' || e.t === 'window') {
    begin(); mut(e); e.flip = !e.flip; commit('Flipped'); draw(); buildProps();
  } else if (MODE !== 'arch' && GEOM[e.t]) setMode('arch');
  draw();
});
/* AutoCAD sizes the wheel step from ZOOMFACTOR and only ever sees detents;
   the browser hands us a delta instead — 100 units per notch on a wheel, a
   few units at a time on a trackpad — so dividing gives one feel on both. */
stage.addEventListener('wheel', ev => {
  ev.preventDefault();
  const scr = localXY(ev);
  /* One wheel detent is WHEEL_DELTA = 120 on Windows, and browsers pass that
     straight through as deltaY. Dividing it by 100 made a single click 1.2
     notches, so ZOOMFACTOR 60 actually delivered about 76% per click. Only the
     exact-multiple-of-120 case is treated this way: trackpads send many small
     arbitrary deltas and must keep their smooth 100-unit scaling, or scrolling
     two fingers would jump the view. */
  const px = Math.abs(ev.deltaY);
  const unit = ev.deltaMode === 1 ? 3 : ev.deltaMode === 2 ? 1
             : (px >= 120 && px % 120 === 0) ? 120 : 100;
  const notches = clamp(ev.deltaY / unit, -4, 4);
  if (!notches) return;
  /* No special case for viewports: inside one, V already IS the model view, so
     the ordinary zoom moves the model behind the paper by construction. */
  zoomAt(scr[0], scr[1], wheelFactor(notches));
  ST.cur = snapPoint(scr[0], scr[1], refPoint());
  syncCoord(); syncDyn();
}, { passive: false });
/* the crosshair is drawn on the canvas, so the pointer has to be told when it
   is over the drawing area and when it has left */
stage.addEventListener('pointerenter', () => { ST.inView = true; navCursor(); draw(); });
stage.addEventListener('pointerleave', () => {
  if (ST.panning) return;
  ST.inView = false; navCursor(); draw();
});

/* ============================================================
   Dynamic input
   ------------------------------------------------------------
   Always live while a command is running: absolute X/Y before the
   first point, then length and angle. Typing in a field locks it
   and the mouse drives the other one — that is the whole point of
   dynamic input, and it is what makes it feel unlocked rather than
   a box that freezes on stale numbers. Tab moves on and locks what
   you typed, Enter commits, Esc releases the locks before it ever
   cancels the command.
   ============================================================ */
let dynEl = null, dynMode = null;
const dynLock = { f1: false, f2: false };

function dynRelease() {
  dynLock.f1 = false; dynLock.f2 = false;
  if (dynEl) dynEl.querySelectorAll('input').forEach(i => i.classList.remove('act'));
}
function dynKill() { if (dynEl) { dynEl.remove(); dynEl = null; } dynMode = null; dynRelease(); }
function dynLocked() { return dynLock.f1 || dynLock.f2; }
/** the `<45` angle override: lock the angle field so the mouse only sets length */
function dynLockAngle(degVal) {
  syncDyn();
  const f2 = $('#dF2');
  if (!f2 || dynMode !== 'polar') return false;
  f2.value = String(deg(rad(degVal)).toFixed(1));
  dynLock.f2 = true;
  if (f2.classList) f2.classList.add('act');
  cmdPreview(dynApply(ST.cur));
  draw();
  return true;
}

/** the point the command should actually use, after any locked field */
function dynApply(p) {
  if (!ST.dyn || !dynEl || !p || !dynLocked()) return p;
  const ref = refPoint();
  const f1 = $('#dF1'), f2 = $('#dF2');
  if (!f1 || !f2) return p;
  if (!ref) {
    const x = dynLock.f1 ? parseLen(f1.value) : p[0];
    const y = dynLock.f2 ? parseLen(f2.value) : p[1];
    return [isNaN(x) ? p[0] : x, isNaN(y) ? p[1] : y];
  }
  let L = dynLock.f1 ? parseLen(f1.value) : dist(ref, p);
  let A = dynLock.f2 ? rad(parseFloat(f2.value)) : ang(ref, p);
  if (isNaN(L)) L = dist(ref, p);
  if (isNaN(A)) A = ang(ref, p);
  return [ref[0] + Math.cos(A) * L, ref[1] + Math.sin(A) * L];
}
function dynCommit() {
  const p = dynApply(ST.cur);
  if (!p || !isFinite(p[0]) || !isFinite(p[1])) return;
  const ref = refPoint();
  const f1 = $('#dF1'), f2 = $('#dF2');
  let out = p;
  if (!ref) {
    const x = parseLen(f1.value), y = parseLen(f2.value);
    if (isNaN(x) && isNaN(y)) return;
    out = [isNaN(x) ? p[0] : x, isNaN(y) ? p[1] : y];
  } else {
    const L = parseLen(f1.value);
    const A = f2.value.trim() === '' ? ang(ref, ST.cur) : rad(parseFloat(f2.value));
    if (isNaN(L)) return;
    out = [ref[0] + Math.cos(isNaN(A) ? ang(ref, ST.cur) : A) * L,
      ref[1] + Math.sin(isNaN(A) ? ang(ref, ST.cur) : A) * L];
  }
  dynRelease();
  cmdPoint(out);
  cv.focus();
}
function syncDyn() {
  syncTouch();
  if (!ST.dyn || !CMD || CMD.phase !== 'run' || !ST.cur) { dynKill(); return; }
  const ref = refPoint();
  const mode = ref ? 'polar' : 'abs';
  if (dynEl && dynMode !== mode) dynKill();        /* the fields mean something else now */
  const s = w2s(ST.cur);
  if (!isFinite(s[0]) || !isFinite(s[1])) { dynKill(); return; }
  if (!dynEl) {
    dynMode = mode;
    const l1 = mode === 'abs' ? 'X' : 'LENGTH', l2 = mode === 'abs' ? 'Y' : 'ANGLE';
    dynEl = el('div', 'dyn',
      `<div style="position:relative"><label>${l1}</label><input id="dF1" autocomplete="off" spellcheck="false"></div>
       <div style="position:relative"><label>${l2}</label><input id="dF2" autocomplete="off" spellcheck="false"></div>`);
    $('#hud').appendChild(dynEl);
    const fields = [$('#dF1'), $('#dF2')];
    fields.forEach((inp, idx) => {
      const key = idx === 0 ? 'f1' : 'f2';
      inp.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter') { ev.preventDefault(); dynCommit(); }
        else if (ev.key === 'Tab') {
          ev.preventDefault();
          dynLock[key] = inp.value.trim() !== '';
          inp.classList.toggle('act', dynLock[key]);
          const o = fields[(idx + 1) % 2];
          o.focus(); if (o.select) o.select();
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          /* release the locks first; a second Esc cancels the command */
          if (dynLocked()) { dynRelease(); cv.focus(); }
          else { dynKill(); endCmd(); }
        }
      });
      inp.addEventListener('input', () => {
        dynLock[key] = inp.value.trim() !== '';
        inp.classList.toggle('act', dynLock[key]);
        cmdPreview(dynApply(ST.cur));
        draw();
      });
    });
  }
  dynEl.style.left = s[0] + 'px'; dynEl.style.top = s[1] + 'px';
  const f1 = $('#dF1'), f2 = $('#dF2');
  const live1 = mode === 'abs' ? fmt(ST.cur[0]) : fmt(dist(ref, ST.cur));
  const live2 = mode === 'abs' ? fmt(ST.cur[1]) : deg(ang(ref, ST.cur)).toFixed(1);
  if (document.activeElement !== f1 && !dynLock.f1) f1.value = live1;
  if (document.activeElement !== f2 && !dynLock.f2) f2.value = live2;
}
/** hand focus to the dynamic input so a typed digit starts editing it */
function focusDyn() {
  if (!dynEl) return false;
  const f = $('#dF1'); if (!f) return false;
  f.focus(); if (f.select) f.select();
  return true;
}

window.addEventListener('keydown', ev => {
  const tag = document.activeElement && document.activeElement.tagName;
  const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  if (ev.key === 'Escape') {
    if (SNAPMENU) { hideSnapMenu(); return; }
    /* leaving a viewport comes before cancelling a command: Escape on a sheet
       most often means "put me back on the page" */
    const _es = (typeof curSheet === 'function') ? curSheet() : null;
    if (_es && _es.activeVp) { setActiveVp(_es, null); return; }
    if (CYCLEUI) { hideCycleList(); draw(); return; }
    if (ST.styleTarget) { ST.styleTarget = null; echo('Cancelled'); buildProps(); return; }
    if ($('#modal').classList.contains('show')) return closeModal();
    if (dynLocked()) { dynRelease(); draw(); return; }
    /* An in-flight window goes first: abandoning the box leaves the selection
       you already had, exactly as AutoCAD does. Otherwise one Esc cancels
       whatever is running — command, transparent command, grip drag — and
       rolls the journal back; a second clears the selection. */
    if (ST.band) { bandCancel(); ST.pendOption = null; draw(); return; }
    dynKill();
    if (!cancelCmd()) { selClearAll(); syncUI(); }
    ST.rtzoom = false; ST.rtdrag = null; ST.panReady = false; navCursor();
    bandCancel(); gripMenuClose(); hint(''); draw(); return;  }
  /* ---------------- driving the crosshair from the keyboard ----------------
     Coordinates could always be typed, so a keyboard user could draw
     precisely. What they could not do is AIM: move the crosshair to see what
     it snaps to, hover something to read it, or pick an object that already
     exists. Everything downstream of picking was mouse-only because picking
     was.

     Below the in-a-field guard, deliberately: the arrows belong to the
     command line's caret and history whenever it has focus, and taking them
     would make the command line unusable. */
  if (!inField && /^Arrow(Up|Down|Left|Right)$/.test(ev.key)
      && !ev.ctrlKey && !ev.metaKey && !acOpen()) {
    ev.preventDefault();
    crosshairStep(ev.key, ev.shiftKey, ev.altKey);
    return;
  }
  /* Ctrl+Enter is the click. Plain Enter repeats the last command — muscle
     memory older than this program — so it cannot be taken for picking. */
  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && !inField) {
    ev.preventDefault();
    crosshairPick();
    return;
  }

  /* The drafting toggles are hoisted above the in-a-field guard on purpose.
     Typing any letter focuses the command line, so with them below it F8 would
     be dead for the whole of every command — which is exactly when a drafter
     reaches for it. They are function keys; no text field wants them. */
  if (ev.key === 'F2') { ev.preventDefault(); if (typeof toggleCliHistory === 'function') toggleCliHistory(); return; }
  if (ev.key === 'F8') { ev.preventDefault(); return tgl('ortho'); }
  if (ev.key === 'F9') { ev.preventDefault(); return tgl('snapgrid'); }
  if (ev.key === 'F3') { ev.preventDefault(); return tgl('osnap'); }
  if (ev.key === 'F7') { ev.preventDefault(); return tgl('grid'); }
  if (ev.key === 'F10') { ev.preventDefault(); return tgl('polar'); }
  if (ev.key === 'F11') { ev.preventDefault(); return tgl('otrack'); }
  if (ev.key === 'F12') { ev.preventDefault(); return tgl('dyn'); }
  if (inField) {
    if (ev.key === 'Enter' && $('#modal').classList.contains('show') && tag !== 'TEXTAREA') {
      const f = _ok; closeModal(); if (f) f();
    }
    return;
  }
  const K = ev.key.toLowerCase();
  if (ev.ctrlKey || ev.metaKey) {
    /* Ctrl on its own is a grip modifier: it toggles Copy inside a grip edit,
       and steps a multifunctional grip menu outside one */
    if ((ev.key === 'Control' || ev.key === 'Meta') && !ev.repeat) {
      if (gripCtrl()) { ev.preventDefault(); syncGripMenu(); }
      return;
    }
    if (K === 'z') { ev.preventDefault(); ev.shiftKey ? redoStep() : undoStep(); }
    else if (K === 'y') { ev.preventDefault(); redoStep(); }
    else if (K === 'a') { ev.preventDefault(); selectAll(); }    else if (K === 's') { ev.preventDefault(); doSave(); }
    else if (K === 'o') { ev.preventDefault(); $('#fileIn').click(); }
    else if (K === 'c') { ev.preventDefault(); doClipCopy(); }
    else if (K === 'v') { ev.preventDefault(); doClipPaste(); }
    else if (K === 'd') { ev.preventDefault(); setMode(MODE === 'arch' ? 'drafting' : 'arch'); }
    return;
  }
  /* Shift+Space steps the rollover through the objects sharing the pick box.
     It has to be tested before the plain Space handler below, which returns. */
  if (ev.key === ' ' && ev.shiftKey && selPhase() && ST.cycleList && ST.cycleList.length > 1) {
    ev.preventDefault();
    cyclePick(1);
    echo('Cycle ' + (ST.cycleIdx + 1) + '/' + ST.cycleList.length);
    draw(); return;
  }
  /* Enter means "again" at the Command prompt and "done" inside a command —
     the key a draughtsman's left hand never leaves. */
  if (ev.key === 'Enter') {
    ev.preventDefault();
    if (CMD) return cmdEnter();
    repeatLast(); return;
  }
  /* Space is Enter too, but holding it arms a pan, so the Enter action waits
     for the key to come back up and fires only if the view did not move. That
     keeps both: tap to repeat, hold to drag the view. Middle-drag is the other
     pan and is unavailable on a trackpad, which is why this one matters.

     This block sat BELOW the Enter/Space handler once and was therefore
     unreachable — the handler above returned on space before it ran — so
     ST.panReady was read in three places and set in none. TEXT and friends
     read a literal line, so space must reach them untouched. */
  if (ev.key === ' ') {
    if (typeof cmdTakesSpace === 'function' && cmdTakesSpace()) return;
    ev.preventDefault();
    if (!ev.repeat) { ST.panReady = true; ST.panDragged = false; navCursor(); }
    return;
  }
  if (ev.key === 'Delete' || ev.key === 'Backspace') {
    ev.preventDefault();
    if (SEL.size) { begin(); selEnts().forEach(e => eraseEnt(e.id)); commit('Erase'); draw(); syncUI(); }
    return;
  }
  /* Numbers and coordinate punctuation go to the dynamic input at the cursor;
     everything else goes to the command line. There are no instant one-key
     tools, because there are none in AutoCAD: you type L and press Enter. */
  if (/^[0-9.@#\-]$/.test(ev.key) && CMD && ST.dyn && focusDyn()) return;
  if (ev.key.length === 1 && !ev.altKey) {
    /* the character is appended here rather than left to the browser: focus
       moves during this keydown, and the keypress that follows would otherwise
       still be delivered to the canvas */
    ev.preventDefault();
    if (cmdIn) { cmdIn.value += ev.key; focusCmd(); }
    return;
  }
});
window.addEventListener('keyup', ev => {
  if (ev.key === 'Shift') ST.shift = false;
  if (ev.key === ' ') {
    const dragged = ST.panDragged;
    ST.panReady = false; ST.panDragged = false; navCursor();
    const tag = document.activeElement && document.activeElement.tagName;
    /* a space that panned the view is not an Enter, and a space typed into a
       field belongs to the field */
    if (dragged || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (typeof cmdTakesSpace === 'function' && cmdTakesSpace()) return;
    if (CMD) return cmdEnter();
    repeatLast();
  }
});
window.addEventListener('keydown', ev => { if (ev.key === 'Shift') ST.shift = true; });

/* ---------- clipboard ---------- */
let CLIP = [];
function doClipCopy() { CLIP = selEnts().map(clone); echo(CLIP.length + ' copied'); }
function doClipPaste() {
  if (!CLIP.length) return;
  const b = bboxAll(CLIP), c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const d = sub(ST.cur || c, c);
  begin(); SEL.clear();
  const idmap = {};
  CLIP.forEach(e => {
    const n = clone(e); const old = n.id; delete n.id;
    addEnt(xf(n, T.move(d)));
    idmap[old] = n.id; SEL.add(n.id);
  });
  /* keep openings attached to the copied wall, not the original */
  for (const id of SEL) {
    const e = DOC.ents.get(id);
    if (e && (e.t === 'door' || e.t === 'window') && idmap[e.host]) e.host = idmap[e.host];
  }
  commit('Paste'); draw(); syncUI();
}

/* ---------- files ---------- */
function doNew() {
  modal('<h3>Start a new drawing</h3><p>The current drawing is discarded. Save it first if you need it.</p>', () => {
    resetDoc(); V.z = 1; V.px = V.w / 2; V.py = V.h / 2;
    DOC.gridStep = 100; DOC.snapStep = 100; DOC.textH = 200;
    syncUI(); draw(); echo('New drawing');
  });
}
function doSave() { download('drawing.dxf', exportDXF(), 'application/dxf'); toast('Saved drawing.dxf (R2000)'); }
function doExport() {
  modal(`<h3>Export</h3><p>DXF keeps everything editable. The project file also keeps walls, doors and windows
    as live objects — DXF turns them into plain geometry.</p>
    <div class="acts" style="justify-content:flex-start;flex-wrap:wrap">
      <button class="btn pri" id="eJson">Project file (.ocad)</button>
      <button class="btn" id="eDxf">DXF R2000</button>
      <button class="btn" id="eSvg">SVG</button>
      <button class="btn" id="ePng">PNG</button>
      <button class="btn" id="eCsv">Schedules (.csv)</button>
      <button class="btn" id="eDwg">DWG (experimental)</button>
    </div>`, null);
  $('#mo').style.display = 'none';
  $('#eDxf').onclick = () => { closeModal(); doSave(); };
  $('#eSvg').onclick = () => { closeModal(); download('drawing.svg', exportSVG(), 'image/svg+xml'); toast('Saved drawing.svg'); };
  $('#ePng').onclick = () => { closeModal(); exportPNG(2400).toBlob(b => { download('drawing.png', b); toast('Saved drawing.png'); }); };
  $('#eJson').onclick = () => { closeModal(); download('drawing.ocad', saveNative(), 'application/json');
    /* the work has reached a file, so there is nothing left to recover */
    markSaved(); toast('Saved drawing.ocad'); };
  $('#eDwg').onclick = () => { closeModal(); doSaveDWG(); };
  $('#eCsv').onclick = () => { closeModal(); exportSchedules(); };
}
/** Every schedule in the drawing, one CSV each. The drawing is where they are
    read; a spreadsheet is where they are ordered from. */
function exportSchedules() {
  const tables = [...DOC.ents.values()].filter(e => e.t === 'table' && (e.rows || []).length);
  if (!tables.length) {
    toast('There are no schedules in this drawing yet');
    return 0;
  }
  let n = 0;
  for (const tb of tables) {
    const csv = tableCSV(tb);
    if (!csv) continue;
    download(tableFileName(tb), csv, 'text/csv;charset=utf-8');
    n++;
  }
  toast(n === 1 ? 'Saved 1 schedule' : 'Saved ' + n + ' schedules');
  return n;
}
function readFile(f) {
  if (/\.dwg$/i.test(f.name)) return importDWG(f);
  const r = new FileReader();
  r.onload = () => {
    try {
      const txt = String(r.result);
      if (/\.ocad$|\.json$/i.test(f.name) || txt.trim().startsWith('{')) { loadNative(txt); markSaved(); }
      else importDXF(txt);
    } catch (e) { console.error(e); toast('Could not read that file'); }
  };
  r.readAsText(f);
}

/* ---------- touch ---------- */
const TOUCH = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || navigator.maxTouchPoints > 0;
function syncTouch() { const t = $('#touchbar'); if (t) t.classList.toggle('show', TOUCH && !!CMD); }

/* ---------- help ---------- */
function showHelp() {
  modal(`<h3>Orthograph</h3>
  <p>A 2D drafting board with a parametric architecture layer. Type commands, or use the rail on the left.
  <kbd>Ctrl</kbd>+<kbd>D</kbd> swaps between Drafting and Architecture.</p>
  <div class="keys">
    <kbd>L P R C A</kbd><span>Line, Polyline, Rectangle, Circle, Arc</span>
    <kbd>T D H</kbd><span>Text, Dimension, Hatch</span>
    <kbd>M K O S I F</kbd><span>Move, Copy, Rotate, Scale, Mirror, Offset</span>
    <kbd>X V</kbd><span>Trim (hold <kbd>Shift</kbd> to extend), Fillet</span>
    <kbd>W D N</kbd><span>In Architecture: Wall, Door, wiNdow</span>
    <kbd>Q</kbd><span>Zoom to everything</span>
    <kbd>F3 F7 F8 F9 F10 F11 F12</kbd><span>Object snap · grid · ortho · grid snap · polar · snap tracking · dynamic input</span>
    <kbd>Tab</kbd><span>Cycle the snap candidates under the cursor</span>
    <kbd>Shift</kbd>+<kbd>right-click</kbd><span>One-shot object snap, FROM, mid between 2 points</span>
    <kbd>Space</kbd><span>Repeat the last command</span>
    <kbd>Esc</kbd><span>Cancel / clear the selection</span>
  </div>
  <p style="margin-top:12px"><b>Precision.</b> Hover a snap point for a moment to acquire it, then track orthogonal or polar
  paths out of it — two acquired points give you their crossing. <kbd>FROM</kbd> at any point prompt sets a base point to
  measure an offset from, <kbd>M2P</kbd> takes the middle of two picks, and typing <kbd>MID</kbd>, <kbd>CEN</kbd>,
  <kbd>PER</kbd>… overrides the running snaps for one point. Hold <kbd>Shift</kbd>+<kbd>E</kbd> endpoint,
  <kbd>Shift</kbd>+<kbd>V</kbd> midpoint, <kbd>Shift</kbd>+<kbd>C</kbd> centre, <kbd>Shift</kbd>+<kbd>D</kbd> nothing.
  <kbd>OSNAP</kbd> opens the settings.</p>
  <p style="margin-top:14px">Coordinates take <kbd>250</kbd>, <kbd>1200,600</kbd>, <kbd>@0,-450</kbd>, <kbd>@800&lt;30</kbd>,
  and units like <kbd>2.5m</kbd> or <kbd>4'-6"</kbd>. Drag left→right to take what is fully inside,
  right→left to catch anything you touch.</p>
  <p><b>Walls</b> are centrelines with a type. Corners mitre themselves, T-junctions clean up, and doors and
  windows are hosted on the wall — move the wall and they travel with it. Select one and the panel on the right
  edits its parameters.</p>
  <p>Drop a DXF, a DWG or a project file on the canvas to open it. <kbd>AUDIT</kbd> checks the drawing for problems.</p>`, null);
  $('#mo').style.display = 'none'; $('#mc').textContent = 'Close';
}

/* ---------- boot ---------- */
function seed() {
  const W = 8400, H = 6000;
  const mk = (a, b, wt) => addEnt({ t: 'wall', a, b, wt: wt || 'brk230', just: 'center', h: 3000, lvl: 0, layer: 'A-WALL' });
  const c = [[0, 0], [W, 0], [W, H], [0, H]];
  for (let i = 0; i < 4; i++) mk(c[i], c[(i + 1) % 4]);
  mk([3600, 0], [3600, 3400], 'part90');
  mk([3600, 3400], [W, 3400], 'part90');
  mk([3600, 3400], [3600, H], 'part90');
  const walls = [...DOC.ents.values()].filter(e => e.t === 'wall');
  addOpening('door', walls[4], 1200, 'sgl900');
  addOpening('door', walls[6], 900, 'sgl800');
  addOpening('window', walls[0], 2100, 'w1512');
  addOpening('window', walls[0], 6000, 'w1512');
  addOpening('window', walls[2], 2400, 'w1812');
  addOpening('door', walls[3], 3000, 'dbl1500');
  /* rooms are seeded as associative so the first thing you can try is moving a
     wall and watching the areas follow */
  for (const [seed, name] of [[[1800, 3000], 'LIVING'], [[6000, 1700], 'KITCHEN'], [[6000, 4700], 'BEDROOM']]) {
    const ring = roomTrace(seed, 0);
    if (ring) addEnt({
      t: 'room', pts: ring, seed, auto: true, name, showArea: true,
      areaUnits: 'auto', h: 280, lvl: 0, layer: 'A-AREA',
    });
  }
  addEnt({ t: 'stair', a: [4200, 4300], b: [6600, 4300], w: 1100, risers: 16, rise: 187,
    tread: 280, kind: 'L', turn: -1, landing: 1100, dir: 1, lvl: 0, layer: 'A-FLOR-STRS' });
  addEnt({ t: 'column', p: [3600, 3400], w: 350, d: 350, shape: 'rect', rot: 0, lvl: 0, layer: 'A-COLS' });
  addEnt({ t: 'dim', k: 'horizontal', p1: [0, 0], p2: [W, 0], off: -900, layer: 'DIMENSIONS' });
  addEnt({ t: 'dim', k: 'vertical', p1: [0, 0], p2: [0, H], off: -900, layer: 'DIMENSIONS' });
  addEnt({ t: 'dim', k: 'horizontal', p1: [0, 0], p2: [3600, 0], off: -450, layer: 'DIMENSIONS' });
  addEnt({ t: 'dim', k: 'horizontal', p1: [3600, 0], p2: [W, 0], off: -450, layer: 'DIMENSIONS' });
}
function boot() {
  resetDoc();
  DOC.gridStep = 100; DOC.snapStep = 100; DOC.textH = 200;
  buildRail();
  seed();
  HIST.past.length = 0; HIST.future.length = 0; HIST.weight = 0;
  document.querySelectorAll('.mode').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  document.querySelectorAll('.tg').forEach(b => b.onclick = () => tgl(b.dataset.tg));
  $('#addLvl').onclick = () => {
    begin(); const rec = addLevel(); commit('New level');
    gotoLevel(rec.id);
  };
  $('#addLay').onclick = () => {
    let i = 1, n; do { n = 'LAYER' + i++; } while (DOC.layers.some(l => l.name === n));
    begin(); touchLayers(); DOC.layers.push(newLayer(n, '#ffd166')); DOC.cur = n; commit('Layer added'); buildLayers();
  };
  $('#mNew').onclick = doNew;
  $('#mTheme').onclick = () => {
    setTheme(themeName() === 'light' ? 'dark' : 'light');
    syncThemeButton();
    if (typeof buildDrawPop === 'function' && $('#dsPop').classList.contains('show')) buildDrawPop();
  };
  $('#mOpen').onclick = () => $('#fileIn').click();
  $('#mSave').onclick = doSave;
  $('#mExport').onclick = doExport;
  $('#mUndo').onclick = undo;
  $('#mRedo').onclick = redo;
  $('#unit').onchange = () => { DOC.units = $('#unit').value; syncUI(); syncCoord(); draw(); };
  $('#vFit').onclick = () => { pushView(); fit(null, true); };
  $('#mHelp').onclick = showHelp;
  $('#mPanel').onclick = () => $('#panel').classList.toggle('open');
  $('#tEsc').onclick = () => { endCmd(); SEL.clear(); syncUI(); draw(); syncTouch(); };
  $('#tDone').onclick = () => { cmdEnter(); syncTouch(); };
  $('#fileIn').onchange = ev => { const f = ev.target.files[0]; if (f) readFile(f); ev.target.value = ''; };
  ['dragenter', 'dragover'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); $('#drop').classList.add('show'); }));
  ['dragleave', 'drop'].forEach(t => stage.addEventListener(t, e => {
    e.preventDefault();
    if (t === 'dragleave' && e.relatedTarget && stage.contains(e.relatedTarget)) return;
    $('#drop').classList.remove('show');
  }));
  stage.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });
  $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };

  let _railH = -1;
  new ResizeObserver(() => {
    resize();
    /* the rail fits itself to the window, so refit when the window changes */
    const h = (window.innerHeight || 800);
    if (h !== _railH) { _railH = h; buildRail(); }
  }).observe(stage);
  /* Before the first paint, not after it: this decides what everything below
     is drawn in, and running it late meant a frame of dark on every load and
     no theme at all if anything above it threw. */
  if (typeof themeReset === 'function') themeReset();
  if (typeof contrastWanted === 'function' && contrastWanted()) setContrast(true);
  syncThemeButton();
  resize(); fit(); syncUI(); syncToggles(); syncCoord(); syncScale(); navCursor();
  if (window.innerWidth <= 860) $('#mPanel').style.display = '';
  /* plain text on purpose: hint() parses bracketed and <em> markup as command
     keywords, and the welcome banner is not a prompt */
  hint('Type ? for the shortcut list. Ctrl+D swaps Drafting and Architecture.');
  setTimeout(() => hint(''), 7000);
  echo('Ready');
  offerRecovery();
  autosaveStart();
  /* A tab closes faster than any timer fires, so take the last chance. Both
     events are used: visibilitychange is the one that actually fires on mobile
     and on a killed tab, beforeunload is the one that can still warn. */
  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') autosaveNow('hidden');
    });
    /* Chrome refuses a beforeunload prompt on a page the user has never
       touched, and logs an error for trying. Arm the asking part only once
       there has been a real gesture — which is exactly when the browser would
       honour it, and by then there is something worth keeping anyway. The
       autosave itself is unconditional. */
    let gestured = false;
    const gesture = () => { gestured = true; };
    window.addEventListener('pointerdown', gesture, { once: true, capture: true });
    window.addEventListener('keydown', gesture, { once: true, capture: true });
    window.addEventListener('beforeunload', ev => {
      autosaveNow('unload');
      if (!gestured || !docDirty()) return;
      /* the browser shows its own wording; returning a string is what asks */
      ev.preventDefault();
      ev.returnValue = '';
      return '';
    });
  }
}
/** If a previous session left work behind, say so and let the person choose.
    Restoring silently would be worse than losing it: they would not know which
    drawing they were looking at. */
function offerRecovery() {
  /* The drawing may be in the overflow store, which answers through events, so
     the prompt is raised from the callback rather than before it. */
  autosaveFetch(rec => { if (rec) recoveryPrompt(rec); });
}
function recoveryPrompt(rec) {
  const when = agoText(Date.now() - (rec.at || Date.now()));
  const size = rec.doc ? Math.round(rec.doc.length / 1024) : 0;
  modal(
    '<h3>Recover unsaved work?</h3>' +
    '<p>Orthograph closed with a drawing still unsaved, autosaved <b>' + esc(when) + '</b>' +
    (size ? ' (' + size + ' KB)' : '') + '.</p>' +
    '<p>Opening it will replace what is on screen now.</p>',
    () => {
      if (autosaveRestore(rec)) {
        fit();
        cliPrint('Recovered the autosaved drawing. It has not been saved to a file yet.');
      } else {
        cliPrint('That autosave could not be read.', 'err');
      }
    },
    { okLabel: 'Recover', cancelLabel: 'Discard', onCancel: () => {
        autosaveClear();
        cliPrint('Autosave discarded.');
      } });
}
if (typeof ORTHO_HEADLESS === 'undefined') boot();
