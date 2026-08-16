/* ============================================================
   ORTHOGRAPH — 14 events, command line, files, boot
   ============================================================ */
function echo(s) { const n = $('#echo'); if (n) n.textContent = s || ''; }
function hint(h) { const n = $('#hint'); if (!n) return; n.innerHTML = h || ''; n.style.display = h ? '' : 'none'; }
let _tt;
function toast(s) {
  const t = $('#toast'); if (!t) return;
  t.textContent = s; t.classList.add('show');
  clearTimeout(_tt); _tt = setTimeout(() => t.classList.remove('show'), 2800);
}
function syncUI() {
  buildLayers(); buildProps(); syncTools();
  const u = $('#mUndo'), r = $('#mRedo');
  if (u) u.disabled = !HIST.past.length;
  if (r) r.disabled = !HIST.future.length;
}

/* ---------- command line ---------- */
const ALIAS = {
  l: 'line', li: 'line', pl: 'pline', p: 'pline', spl: 'spline', sp: 'spline',
  rec: 'rect', r: 'rect', rectang: 'rect', rectangle: 'rect',
  c: 'circle', ci: 'circle', a: 'arc', el: 'ellipse', g: 'polygon', pol: 'polygon', po: 'point',
  do: 'donut', xl: 'xline', revcloud: 'revcloud', rev: 'revcloud', h: 'hatch', bh: 'hatch',
  t: 'text', dt: 'text', mt: 'mtext', le: 'leader', lead: 'leader',
  d: 'dim', di: 'dim', dimlinear: 'dim', dimaligned: 'dim', dli: 'dim', dco: 'dimcont',
  m: 'move', mv: 'move', k: 'copy', co: 'copy', cp: 'copy', o: 'rotate', ro: 'rotate',
  s: 'scale', sc: 'scale', i: 'mirror', mi: 'mirror', f: 'offset', off: 'offset',
  x: 'trim', tr: 'trim', ex: 'extend', len: 'lengthen', v: 'fillet', fil: 'fillet', cha: 'chamfer',
  ar: 'array', br: 'break', j: 'join', pe: 'pedit', xp: 'explode', exp: 'explode',
  e: 'erase', del: 'erase', er: 'erase', st: 'stretch', al: 'align',
  div: 'divide', me: 'measure', ma: 'matchprop', mat: 'matchprop',
  b: 'block', ins: 'insert', qs: 'qselect', ls: 'list', li2: 'list',
  di2: 'dist', dis: 'dist', aa: 'area',
  w: 'wall', wa: 'wall', wr: 'wallrect', dr: 'door', win: 'window', wi: 'window',
  col: 'column', str: 'stair', rm: 'room', gr: 'grid',
  wf: 'wallflip', wj: 'walljoin', ws: 'wallsplit',
};
const META = {
  u: undo, undo, redo, z: () => fit(), zoom: () => fit(), ze: () => fit(), zoomextents: () => fit(),
  all: () => { SEL.clear(); [...DOC.ents.values()].filter(pickable).forEach(e => SEL.add(e.id)); syncUI(); draw(); },
  qsave: () => doSave(), save: () => doSave(), saveas: () => doExport(), open: () => $('#fileIn').click(),
  new: () => doNew(), help: showHelp, '?': showHelp,
  ortho: () => tgl('ortho'), osnap: () => tgl('osnap'), grid: () => tgl('grid'),
  polar: () => tgl('polar'), snap: () => tgl('snapgrid'), dyn: () => tgl('dyn'),
  drafting: () => setMode('drafting'), arch: () => setMode('arch'), architecture: () => setMode('arch'),
  types: openTypeManager, wt: openTypeManager,
  units: () => toast('Use the unit menu, top right'),
  dimstyle: openDimStyle, ds: openDimStyle,
  purge: () => {
    begin(); touchLayers();
    DOC.layers = DOC.layers.filter(l => l.name === '0' || [...DOC.ents.values()].some(e => e.layer === l.name));
    if (!DOC.layers.some(l => l.name === DOC.cur)) DOC.cur = '0';
    commit('Purged unused layers'); syncUI();
  },
  audit: runAudit,
  dwg: () => doSaveDWG(),
};
function openDimStyle() {
  const S = dimStyle();
  modal(`<h3>Dimension style</h3>
    <div class="row"><label>Text height</label><input class="f" id="dsT" value="${+(S.txt / U[DOC.units]).toFixed(4)}"></div>
    <div class="row"><label>Arrow size</label><input class="f" id="dsA" value="${+(S.arrow / U[DOC.units]).toFixed(4)}"></div>
    <div class="row"><label>Ext offset</label><input class="f" id="dsO" value="${+(S.extOff / U[DOC.units]).toFixed(4)}"></div>
    <div class="row"><label>Ext beyond</label><input class="f" id="dsB" value="${+(S.extBey / U[DOC.units]).toFixed(4)}"></div>
    <div class="row"><label>Decimals</label><input class="f" id="dsP" value="${S.prec == null ? '' : S.prec}" placeholder="auto"></div>`, () => {
    DOC.dimStyle = DOC.dimStyle || {};
    DOC.dimStyle.txt = parseLen($('#dsT').value) || S.txt;
    DOC.dimStyle.arrow = parseLen($('#dsA').value) || S.arrow;
    DOC.dimStyle.extOff = parseLen($('#dsO').value);
    DOC.dimStyle.extBey = parseLen($('#dsB').value);
    const p = $('#dsP').value.trim();
    DOC.dimStyle.prec = p === '' ? null : clamp(parseInt(p) || 0, 0, 6);
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
const HISTC = []; let hi = -1;
function focusCmd() { if (cmdIn) cmdIn.focus(); }
if (cmdIn) cmdIn.addEventListener('keydown', ev => {
  if (ev.key === 'ArrowUp') { if (hi < HISTC.length - 1) { hi++; cmdIn.value = HISTC[HISTC.length - 1 - hi]; } ev.preventDefault(); }
  else if (ev.key === 'ArrowDown') { if (hi > 0) { hi--; cmdIn.value = HISTC[HISTC.length - 1 - hi]; } else { hi = -1; cmdIn.value = ''; } ev.preventDefault(); }
  else if (ev.key === 'Escape') { cmdIn.value = ''; endCmd(); cv.focus(); }
  else if (ev.key === 'Enter') {
    const s = cmdIn.value.trim(); cmdIn.value = '';
    if (s) { HISTC.push(s); hi = -1; }
    runInput(s); ev.preventDefault();
  }
});
function runInput(s) {
  if (!s) { if (CMD) return cmdEnter(); if (HISTC.length) return runInput(HISTC[HISTC.length - 1]); return; }
  if (CMD && cmdText(s)) { cmdPreview(ST.cur || [0, 0]); draw(); return; }
  const k = s.toLowerCase().split(/\s+/)[0];
  if (META[k]) { META[k](); echo(k.toUpperCase()); return; }
  const key = ALIAS[k] || k;
  if (CMDS[key]) {
    if (CMDS[key].group === 'arch' && MODE !== 'arch') setMode('arch');
    startCmd(key); echo(CMDS[key].key.toUpperCase()); return;
  }
  const p = parseCoord(s, ST.lastPt, ST.cur);
  if (p && CMD) { cmdPoint(p); return; }
  echo('Unknown: ' + s);
}
function tgl(k) {
  /* SELECTIONCYCLING is 0/1/2 — off, badge only, badge and list — not a flag */
  if (k === 'selCycling') ST.selCycling = ST.selCycling ? 0 : 2;
  else ST[k] = !ST[k];
  syncToggles(); draw(); echo(k.toUpperCase() + ' ' + (ST[k] ? 'on' : 'off'));
}
function syncToggles() { document.querySelectorAll('.tg').forEach(b => b.classList.toggle('on', !!ST[b.dataset.tg])); }

function syncCoord() {
  const p = ST.cur || [0, 0];
  let s = `<b>X</b> ${fmt(p[0])}  <b>Y</b> ${fmt(p[1])}`;
  if (ST.lastPt && ST.drawing) s += `  <b>Δ</b> ${fmt(dist(ST.lastPt, p))} ∠${deg(ang(ST.lastPt, p)).toFixed(1)}°`;
  const n = $('#coord'); if (n) n.innerHTML = s;
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
  stage.setPointerCapture(ev.pointerId);
  ptrs.set(ev.pointerId, localXY(ev));
  if (cmdIn) cmdIn.blur();
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: dist(a, b), c: mid(a, b), z: V.z }; bandCancel(); ST.panning = false; return;
  }
  const scr = localXY(ev);
  downScr = scr; moved = false; pend = null;
  if (ev.button === 1 || (ev.button === 0 && ev.altKey) || ev.button === 2) {
    ST.panning = { x: scr[0], y: scr[1], px: V.px, py: V.py }; return;
  }
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
  if (ST.panning) {
    V.px = ST.panning.px + (scr[0] - ST.panning.x);
    V.py = ST.panning.py + (scr[1] - ST.panning.y);
    moved = true; draw(); return;
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
    if (g) { ST.hot = null; ST.cycleList = null; }
    else pickHover(p, 8);
  }
  syncCoord(); syncDyn(); draw();
}, { passive: false });

stage.addEventListener('pointerup', ev => {
  ptrs.delete(ev.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (ST.panning) { ST.panning = null; downPt = null; downScr = null; pend = null; return; }
  const scr = localXY(ev);
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
stage.addEventListener('dblclick', () => {
  const p = ST.cur; if (!p) return;
  const e = pickAt(p, 9);
  if (!e) return;
  SEL.clear(); SEL.add(e.id); syncUI();
  if (e.t === 'text') {
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
stage.addEventListener('wheel', ev => {
  ev.preventDefault();
  const scr = localXY(ev);
  const f = Math.pow(0.9988, ev.deltaY * (ev.deltaMode === 1 ? 16 : 1));
  zoomAt(scr[0], scr[1], clamp(f, .2, 5));
  ST.cur = snapPoint(scr[0], scr[1], refPoint());
  syncCoord(); syncDyn();
}, { passive: false });

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

const KEYS_DRAFT = {
  l: 'line', p: 'pline', r: 'rect', c: 'circle', a: 'arc', e: 'ellipse', g: 'polygon',
  t: 'text', d: 'dim', h: 'hatch', m: 'move', k: 'copy', o: 'rotate', s: 'scale',
  i: 'mirror', f: 'offset', x: 'trim', v: 'fillet',
};
const KEYS_ARCH = {
  w: 'wall', d: 'door', n: 'window', t: 'text', m: 'move', k: 'copy', o: 'rotate', i: 'mirror',
};
window.addEventListener('keydown', ev => {
  const tag = document.activeElement && document.activeElement.tagName;
  const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  if (ev.key === 'Escape') {
    if (SNAPMENU) { hideSnapMenu(); return; }
    if (CYCLEUI) { hideCycleList(); draw(); return; }
    if (ST.styleTarget) { ST.styleTarget = null; echo('Cancelled'); buildProps(); return; }
    if ($('#modal').classList.contains('show')) return closeModal();
    if (dynLocked()) { dynRelease(); draw(); return; }
    /* an in-flight window goes first: the selection you already have survives
       abandoning the box, exactly as it does in AutoCAD */
    if (ST.band) { bandCancel(); ST.pendOption = null; draw(); return; }
    dynKill();
    if (CMD) endCmd(); else { selClearAll(); syncUI(); }
    gripMenuClose(); hint(''); draw(); return;
  }
  if (inField) {
    if (ev.key === 'Enter' && $('#modal').classList.contains('show') && tag !== 'TEXTAREA') {
      const f = _ok; closeModal(); if (f) f();
    }
    return;
  }
  const K = ev.key.toLowerCase();
  if (ev.ctrlKey || ev.metaKey) {
    if (K === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); }
    else if (K === 'y') { ev.preventDefault(); redo(); }
    else if (K === 'a') { ev.preventDefault(); META.all(); }
    else if (K === 's') { ev.preventDefault(); doSave(); }
    else if (K === 'o') { ev.preventDefault(); $('#fileIn').click(); }
    else if (K === 'c') { ev.preventDefault(); doClipCopy(); }
    else if (K === 'v') { ev.preventDefault(); doClipPaste(); }
    else if (K === 'd') { ev.preventDefault(); setMode(MODE === 'arch' ? 'drafting' : 'arch'); }
    return;
  }
  if (ev.key === 'Enter') { ev.preventDefault(); if (CMD) cmdEnter(); else focusCmd(); return; }
  if (ev.key === 'Delete' || ev.key === 'Backspace') {
    ev.preventDefault();
    if (SEL.size) { begin(); selEnts().forEach(e => eraseEnt(e.id)); commit('Erase'); draw(); syncUI(); }
    return;
  }
  if (ev.key === ' ') {
    ev.preventDefault();
    if (CMD) return cmdEnter();
    if (ST.lastCmd && CMDS[ST.lastCmd]) { startCmd(ST.lastCmd); echo(ST.lastCmd.toUpperCase()); return; }
    if (HISTC.length) runInput(HISTC[HISTC.length - 1]);
    return;
  }
  if (ev.key === 'F8') { ev.preventDefault(); return tgl('ortho'); }
  if (ev.key === 'F9') { ev.preventDefault(); return tgl('snapgrid'); }
  if (ev.key === 'F3') { ev.preventDefault(); return tgl('osnap'); }
  if (ev.key === 'F7') { ev.preventDefault(); return tgl('grid'); }
  if (ev.key === 'F10') { ev.preventDefault(); return tgl('polar'); }
  if (/^[0-9.@\-]$/.test(ev.key) && CMD) { if (!focusDyn()) focusCmd(); return; }
  /* A letter typed while a command is running belongs to that command — the
     on-screen prompt says "C to close", so C must close, not start CIRCLE.
     Only if the running command has no use for the key does it fall through
     to starting a tool. */
  if (CMD && CMD.phase === 'run' && /^[a-z]$/.test(K) && !ev.repeat) {
    let taken = false;
    try { taken = !!cmdText(K); } catch (e) { taken = false; }
    if (taken) {
      ev.preventDefault();
      cmdPreview(ST.cur || [0, 0]);
      syncDyn(); draw();
      return;
    }
  }
  const map = MODE === 'arch' ? KEYS_ARCH : KEYS_DRAFT;
  if (map[K] && !ev.repeat) { ev.preventDefault(); startCmd(map[K]); return; }
  if (K === 'q') { ev.preventDefault(); fit(); }
});
window.addEventListener('keyup', ev => { if (ev.key === 'Shift') ST.shift = false; });
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
      <button class="btn" id="eDwg">DWG (experimental)</button>
    </div>`, null);
  $('#mo').style.display = 'none';
  $('#eDxf').onclick = () => { closeModal(); doSave(); };
  $('#eSvg').onclick = () => { closeModal(); download('drawing.svg', exportSVG(), 'image/svg+xml'); toast('Saved drawing.svg'); };
  $('#ePng').onclick = () => { closeModal(); exportPNG(2400).toBlob(b => { download('drawing.png', b); toast('Saved drawing.png'); }); };
  $('#eJson').onclick = () => { closeModal(); download('drawing.ocad', saveNative(), 'application/json'); toast('Saved drawing.ocad'); };
  $('#eDwg').onclick = () => { closeModal(); doSaveDWG(); };
}
function readFile(f) {
  if (/\.dwg$/i.test(f.name)) return importDWG(f);
  const r = new FileReader();
  r.onload = () => {
    try {
      const txt = String(r.result);
      if (/\.ocad$|\.json$/i.test(f.name) || txt.trim().startsWith('{')) loadNative(txt);
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
    <kbd>F3 F7 F8 F9 F10</kbd><span>Object snap · grid · ortho · grid snap · polar</span>
    <kbd>Space</kbd><span>Repeat the last command</span>
    <kbd>Esc</kbd><span>Cancel / clear the selection</span>
  </div>
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
  HIST.past.length = 0; HIST.future.length = 0;
  document.querySelectorAll('.mode').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  document.querySelectorAll('.tg').forEach(b => b.onclick = () => tgl(b.dataset.tg));
  $('#addLay').onclick = () => {
    let i = 1, n; do { n = 'LAYER' + i++; } while (DOC.layers.some(l => l.name === n));
    begin(); touchLayers(); DOC.layers.push(newLayer(n, '#ffd166')); DOC.cur = n; commit('Layer added'); buildLayers();
  };
  $('#mNew').onclick = doNew;
  $('#mOpen').onclick = () => $('#fileIn').click();
  $('#mSave').onclick = doSave;
  $('#mExport').onclick = doExport;
  $('#mUndo').onclick = undo;
  $('#mRedo').onclick = redo;
  $('#unit').onchange = () => { DOC.units = $('#unit').value; syncUI(); syncCoord(); draw(); };
  $('#vFit').onclick = () => fit();
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
  resize(); fit(); syncUI(); syncToggles(); syncCoord();
  if (window.innerWidth <= 860) $('#mPanel').style.display = '';
  hint('Press <em>?</em> for the shortcut list · <em>Ctrl+D</em> swaps Drafting and Architecture');
  setTimeout(() => hint(''), 7000);
  echo('Ready');
}
if (typeof ORTHO_HEADLESS === 'undefined') boot();
