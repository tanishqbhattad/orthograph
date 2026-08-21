/* ============================================================
   ORTHOGRAPH — 07b navigation commands and view variables
   ------------------------------------------------------------
   ZOOM with the options AutoCAD offers, PAN, DRAWORDER, and the
   handful of system variables that decide what the viewport looks
   like. Kept out of 05-view.js so the renderer stays a renderer.
   ============================================================ */

/* ---- the view scale, the way a drafter reads it ---- */
function viewScale() { return V.z / PX_PER_MM; }   /* screen mm per drawing mm */
function viewScaleText() {
  const s = viewScale();
  if (!isFinite(s) || s <= 0) return '—';
  if (s >= 1) { const n = s < 10 ? +s.toFixed(2) : Math.round(s); return n + ':1'; }
  const inv = 1 / s;
  const n = inv < 10 ? +inv.toFixed(2) : inv < 1e6 ? Math.round(inv) : inv.toPrecision(3);
  return '1:' + n;
}
/** every view change funnels through here, so the shell can follow along */
function onViewChanged() {
  if (typeof syncNav === 'function') syncNav();
  if (typeof syncScale === 'function') syncScale();
  if (typeof syncCoord === 'function') syncCoord();
}

/* ---- cursor ----
   The crosshair is drawn on the canvas, so the operating system cursor is
   hidden over the drawing area and only comes back for the modes that have
   their own: the pan hand and the real-time zoom lens. */
const CUR_PAN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><g fill='%23fff' stroke='%23000' stroke-width='1.2'><path d='M11 21c-3 0-5-2-6-4l-2-4c-.4-.9.6-1.8 1.4-1.2L7 14V5.5a1.2 1.2 0 0 1 2.4 0V11h.6V4a1.2 1.2 0 0 1 2.4 0v7h.6V5a1.2 1.2 0 0 1 2.4 0v6h.6V7.2a1.2 1.2 0 0 1 2.4 0V15c0 3.3-2 6-5.4 6z'/></g></svg>\") 12 12, grab";
const CUR_ZOOM = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><g fill='none' stroke='%23000' stroke-width='3'><circle cx='10' cy='10' r='6'/><path d='M14.5 14.5L21 21M7 10h6M10 7v6'/></g><g fill='none' stroke='%23fff' stroke-width='1.5'><circle cx='10' cy='10' r='6'/><path d='M14.5 14.5L21 21M7 10h6M10 7v6'/></g></svg>\") 10 10, zoom-in";
function navCursor() {
  const st = typeof stage !== 'undefined' ? stage : (typeof $ === 'function' ? $('#stage') : null);
  if (!st || !st.style) return;
  if (ST.panning) st.style.cursor = 'grabbing';
  else if (ST.panCmd || ST.panReady) st.style.cursor = CUR_PAN;
  else if (ST.rtzoom) st.style.cursor = CUR_ZOOM;
  else st.style.cursor = ST.inView === false ? 'crosshair' : 'none';
}

/* ============================================================
   ZOOM
   ============================================================ */
const ZOOM_HINT = 'Window corner, a scale (<em>2x</em>, <em>2xp</em>), or ' +
  '<em>A</em>ll <em>C</em>entre <em>D</em>ynamic <em>E</em>xtents <em>O</em>bject ' +
  '<em>P</em>revious <em>S</em>cale <em>W</em>indow · <em>Enter</em> for real time';

function endZoomModes() { ST.rtzoom = false; ST.dynz = null; navCursor(); }

/** a preview rectangle in the current layer colour */
function boxPv(b) { return pv({ t: 'pline', pts: [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], closed: true }); }

defc('zoom', {
  key: 'zoom', group: 'view', hint: ZOOM_HINT,
  init(c) {
    if (c.data && c.data.mode === 'object') {          /* returning from the select phase */
      const es = selEnts();
      const b = es.length ? bboxAll(es) : null;
      if (b) { pushView(); animView(viewForBox(b), true); }
      else echo('Nothing selected');
      c.done = true; endCmd(); return;
    }
    c.data = {};
    hint(ZOOM_HINT);
  },
  point(c, p) {
    const d = c.data;
    if (d.mode === 'center') {
      if (!d.cp) { d.cp = p; hint('Height in drawing units, or <em>Enter</em> to keep the current one'); return; }
      return;
    }
    if (d.mode === 'dynamic') { d.size = !d.size; hint(d.size ? 'Drag right to enlarge the view box · <em>Enter</em> to accept' : 'Move the view box · click to resize · <em>Enter</em> to accept'); return; }
    if (!d.w0) { d.w0 = p; hint('Opposite corner'); return; }
    pushView(); zoomWindow(d.w0, p, true); endCmd();
  },
  preview(c, p) {
    const d = c.data;
    if (d.mode === 'dynamic') {
      const out = [];
      if (d.ext) out.push(boxPv(d.ext));
      const hw = d.vw / 2 * (d.k || 1), hh = d.vh / 2 * (d.k || 1);
      if (d.size && d.anchor) {
        const k = clamp(dist(d.anchor, p) / Math.max(d.vw / 2, 1e-9), 0.02, 200);
        d.k = k;
      } else d.centre = p;
      const cpt = d.centre || p;
      if (d.size && d.anchor) { out.push(boxPv([d.anchor[0] - hw, d.anchor[1] - hh, d.anchor[0] + hw, d.anchor[1] + hh])); }
      else out.push(boxPv([cpt[0] - hw, cpt[1] - hh, cpt[0] + hw, cpt[1] + hh]));
      if (d.size && !d.anchor) d.anchor = cpt;
      if (!d.size) d.anchor = null;
      return out;
    }
    if (d.w0) return [boxPv([Math.min(d.w0[0], p[0]), Math.min(d.w0[1], p[1]), Math.max(d.w0[0], p[0]), Math.max(d.w0[1], p[1])])];
    return null;
  },
  text(c, s) {
    const d = c.data;
    s = String(s).trim();
    if (d.mode === 'center' && d.cp) {
      const h = parseLen(s);
      pushView(); zoomCenter(d.cp, isNaN(h) ? 0 : h, true); endCmd(); return true;
    }
    if (d.mode === 'scale') { return zoomScaleText(s) ? (endCmd(), true) : false; }
    const k = s.toLowerCase();
    if (k === 'a' || k === 'all') { pushView(); zoomAll(true); endCmd(); return true; }
    if (k === 'e' || k === 'extents') { pushView(); fit(null, true); endCmd(); return true; }
    if (k === 'p' || k === 'previous') { zoomPrev(); endCmd(); return true; }
    if (k === 'w' || k === 'window') { d.mode = 'window'; hint('First corner of the window'); return true; }
    if (k === 'c' || k === 'centre' || k === 'center') { d.mode = 'center'; hint('Centre point'); return true; }
    if (k === 's' || k === 'scale') { d.mode = 'scale'; hint('Scale factor — <em>2</em> of the full view, <em>2x</em> of the current one, <em>2xp</em> relative to paper'); return true; }
    if (k === 'r' || k === 'realtime') { startRealtimeZoom(c); return true; }
    if (k === 'o' || k === 'object') {
      d.mode = 'object';
      if (SEL.size) { c.data = { mode: 'object' }; this.init(c); return true; }
      c.phase = 'sel'; hint('Select the objects to zoom to, then press <em>Enter</em>'); return true;
    }
    if (k === 'd' || k === 'dynamic') { startDynamicZoom(c); return true; }
    if (zoomScaleText(s)) { endCmd(); return true; }
    return false;
  },
  enter(c) {
    const d = c.data;
    if (d.mode === 'dynamic') { applyDynamicZoom(c); return; }
    if (d.mode === 'center' && d.cp) { pushView(); zoomCenter(d.cp, 0, true); endCmd(); return; }
    if (!d.mode) { startRealtimeZoom(c); return; }
    endCmd();
  },
  done() { endZoomModes(); },
});
/** 2 · 2x · 2xp — returns true when the text really was a scale */
function zoomScaleText(s) {
  const m = String(s).trim().match(/^(-?[\d.]+)\s*(xp|x)?$/i);
  if (!m) return false;
  const f = parseFloat(m[1]);
  if (!(f > 0)) return false;
  pushView();
  const kind = (m[2] || '').toLowerCase();
  /* xp is paper-relative: at 1xp one drawing unit plots one paper unit */
  if (kind === 'xp') { const c = viewCentreR(viewState()), nz = clamp(PX_PER_MM * f, ZMIN, ZMAX); animView({ z: nz, px: V.w / 2 - c[0] * nz, py: V.h / 2 + c[1] * nz, rot: V.rot }, true); }
  else zoomScale(f, kind === 'x', true);
  return true;
}
function startRealtimeZoom(c) {
  ST.rtzoom = true; ST.dynz = null;
  hint('Drag up to zoom in, down to zoom out · <em>Esc</em> or right-click to stop');
  navCursor(); echo('ZOOM real time');
}
function startDynamicZoom(c) {
  const d = c.data;
  d.mode = 'dynamic'; d.size = false; d.k = 1; d.anchor = null;
  const b = bboxAll([...DOC.ents.values()].filter(visible));
  d.ext = b ? b.slice() : null;
  d.vw = V.w / V.z; d.vh = V.h / V.z;
  const cur = s2w(V.w / 2, V.h / 2);
  d.centre = cur;
  pushView();
  if (b) animView(viewForBox(b, 0.55), true);
  hint('Move the view box · click to resize · <em>Enter</em> to accept');
}
function applyDynamicZoom(c) {
  const d = c.data;
  const cpt = (d.size && d.anchor) ? d.anchor : (d.centre || s2w(V.w / 2, V.h / 2));
  const hw = d.vw / 2 * (d.k || 1), hh = d.vh / 2 * (d.k || 1);
  animView(viewForBox([cpt[0] - hw, cpt[1] - hh, cpt[0] + hw, cpt[1] + hh], 1), true);
  endCmd();
}

/* ============================================================
   PAN — AutoCAD's transparent real-time pan
   ============================================================ */
defc('pan', {
  key: 'pan', group: 'view',
  hint: 'Drag to pan · <em>Esc</em> or right-click to stop',
  init(c) { ST.panCmd = true; navCursor(); },
  point() { },
  enter() { endCmd(); },
  done() { ST.panCmd = false; navCursor(); },
});

/* ============================================================
   DRAWORDER
   ============================================================ */
defc('draworder', {
  key: 'draworder', group: 'modify', needSel: true,
  selHint: 'Select the objects to reorder, then press <em>Enter</em>',
  hint: '<em>F</em>ront · <em>B</em>ack · <em>A</em>bove object · <em>U</em>nder object',
  init(c) { c.data = { list: selEnts() }; },
  text(c, s) {
    const d = c.data, k = String(s).trim().toLowerCase();
    if (k === 'f' || k === 'front') { applyOrder(d.list, 'front'); return true; }
    if (k === 'b' || k === 'back') { applyOrder(d.list, 'back'); return true; }
    if (k === 'a' || k === 'above') { d.rel = 'above'; hint('Pick the object to sit above'); return true; }
    if (k === 'u' || k === 'under') { d.rel = 'under'; hint('Pick the object to sit under'); return true; }
    return false;
  },
  point(c, p) {
    const d = c.data;
    if (!d.rel) return;
    const ref = pickAt(p, 10, e => d.list.indexOf(e) < 0);
    if (!ref) { echo('Nothing there'); return; }
    applyOrder(d.list, d.rel, ref);
  },
  enter(c) { applyOrder(c.data.list, 'front'); },
});
function applyOrder(list, mode, ref) {
  if (!list || !list.length) { endCmd(); return; }
  begin();
  const n = drawOrder(list, mode, ref);
  commit('Draw order');
  echo(n + (n === 1 ? ' object' : ' objects') + ' sent ' + mode);
  draw(); endCmd();
}

/* ============================================================
   view system variables
   ------------------------------------------------------------
   Typed the way AutoCAD takes them: `LTSCALE 20`, or bare to be asked.
   ============================================================ */
const VARDEF = {
  ltscale: { get: () => ltScale(), set: v => { DOC.ltScale = clamp(v, 1e-4, 1e6); draw(); }, min: 1e-4, max: 1e6, label: 'Global linetype scale' },
  zoomfactor: { get: () => VS.zoomFactor, set: v => { VS.zoomFactor = clamp(Math.round(v), 3, 100); }, label: 'Wheel zoom step (3–100)' },
  gridmajor: { get: () => VS.gridMajor, set: v => { VS.gridMajor = clamp(Math.round(v), 1, 100); draw(); }, label: 'Minor grid lines per major line' },
  cursorsize: { get: () => ST.crossLen, set: v => { ST.crossLen = clamp(Math.round(v), 1, 100); draw(); }, label: 'Crosshair size, % of the viewport' },
  pickbox: { get: () => ST.pickBox, set: v => { ST.pickBox = clamp(Math.round(v), 2, 40); draw(); }, label: 'Pick box, screen pixels' },
  vtduration: { get: () => VS.vtDuration, set: v => { VS.vtDuration = clamp(Math.round(v), 0, 3000); }, label: 'View transition time, ms' },
};
function setVar(name, line) {
  const d = VARDEF[name]; if (!d) return;
  const arg = String(line || '').trim().split(/\s+/).slice(1).join(' ');
  if (arg !== '') {
    const v = name === 'ltscale' ? parseFloat(arg) : parseFloat(arg);
    if (!isNaN(v)) { d.set(v); echo(name.toUpperCase() + ' = ' + d.get()); return; }
  }
  modal(`<h3>${name.toUpperCase()}</h3><p>${d.label}.</p>
    <div class="row"><label>Value</label><input class="f" id="svv" value="${d.get()}"></div>`, () => {
    const v = parseFloat($('#svv').value);
    if (!isNaN(v)) { d.set(v); echo(name.toUpperCase() + ' = ' + d.get()); }
  });
}
/** LWDISPLAY / UCSICON take on|off */
function setFlag(line, get, set, label) {
  const arg = String(line || '').trim().split(/\s+/)[1];
  const on = arg ? /^(on|1|yes|y)$/i.test(arg) : !get();
  set(on); draw();
  echo(label + ' ' + (on ? 'on' : 'off'));
}
