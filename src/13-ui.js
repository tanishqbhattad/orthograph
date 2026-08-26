/* ============================================================
   ORTHOGRAPH — 13 UI: rails, menus, layers, properties, chrome
   ============================================================ */
const $ = s => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };

const IC = {
  select: '<path d="M3 2l7 16 2.2-6.4L18.6 9z"/>',
  line: '<circle cx="4" cy="16" r="1.6"/><circle cx="16" cy="4" r="1.6"/><path d="M5.2 14.8L14.8 5.2"/>',
  pline: '<path d="M2 15l5-7 4 4 7-9"/><circle cx="2" cy="15" r="1.2"/><circle cx="18" cy="3" r="1.2"/>',
  spline: '<path d="M2 14c4 0 3-8 8-8s4 8 8 8"/>',
  rect: '<rect x="3" y="5" width="14" height="10" rx=".5"/>',
  circle: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="1"/>',
  arc: '<path d="M3 15A9 9 0 0 1 17 15"/><circle cx="3" cy="15" r="1.2"/><circle cx="17" cy="15" r="1.2"/>',
  ellipse: '<ellipse cx="10" cy="10" rx="8" ry="5"/>',
  polygon: '<path d="M10 2.5l6.6 4.8-2.5 7.8H5.9L3.4 7.3z"/>',
  donut: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3"/>',
  point: '<path d="M10 5v10M5 10h10"/>',
  xline: '<path d="M2 16L18 4" stroke-dasharray="3 2"/><circle cx="10" cy="10" r="1.4"/>',
  ray: '<path d="M4 16L18 4" stroke-dasharray="3 2"/><circle cx="4" cy="16" r="1.4"/>',
  revcloud: '<path d="M4 12a2.4 2.4 0 0 1 3-3 2.4 2.4 0 0 1 3.4-1.6A2.4 2.4 0 0 1 15 8.5a2.4 2.4 0 0 1 1.4 4.2 2.4 2.4 0 0 1-3.4 1.6A2.4 2.4 0 0 1 8.6 15 2.4 2.4 0 0 1 4 12z"/>',
  hatch: '<rect x="3" y="4" width="14" height="12" rx=".5"/><path d="M5 14l4-8M9 14l4-8M13 14l3-6"/>',
  text: '<path d="M4 5h12M10 5v11M7.5 16h5"/>',
  mtext: '<path d="M3 5h14M3 9h14M3 13h9"/>',
  leader: '<path d="M3 16l6-6"/><path d="M9 10h8"/><path d="M3 16l1.5-3.5L7 14z" fill="currentColor"/>',
  dim: '<path d="M3 4v12M17 4v12M3 10h14M5.5 8l-2.5 2 2.5 2M14.5 8l2.5 2-2.5 2"/>',
  dimcont: '<path d="M2 5v10M10 5v10M18 5v10M2 10h16"/>',
  move: '<path d="M10 3v14M3 10h14M10 3L8 5.4M10 3l2 2.4M10 17l-2-2.4M10 17l2-2.4M3 10l2.4-2M3 10l2.4 2M17 10l-2.4-2M17 10l-2.4 2"/>',
  copy: '<rect x="3" y="3" width="10" height="10" rx=".6"/><path d="M7 17h10V7"/>',
  rotate: '<path d="M16.5 10a6.5 6.5 0 1 1-2.4-5"/><path d="M17 3v4h-4"/>',
  scale: '<path d="M3 17V6h11"/><path d="M6 14l10-10M12 4h4v4"/>',
  mirror: '<path d="M10 2v16"/><path d="M7 6L3 10l4 4z"/><path d="M13 6l4 4-4 4z"/>',
  offset: '<rect x="3" y="5" width="9" height="10" rx=".5"/><rect x="7" y="2.5" width="10.5" height="11.5" rx=".5" stroke-dasharray="2.4 2"/>',
  trim: '<circle cx="5" cy="15" r="2"/><circle cx="15" cy="15" r="2"/><path d="M6.4 13.6L15 3M13.6 13.6L5 3"/>',
  extend: '<path d="M16 3v14"/><path d="M3 10h9"/><path d="M12 10h4" stroke-dasharray="2 2"/><path d="M9.5 7.5L12 10l-2.5 2.5"/>',
  lengthen: '<path d="M3 10h14"/><path d="M3 7v6M17 7v6"/><path d="M11 7.5L13.5 10 11 12.5"/>',
  fillet: '<path d="M4 17V9a5 5 0 0 1 5-5h8"/><path d="M4 9h5V4" stroke-dasharray="2 2"/>',
  chamfer: '<path d="M4 17V10l6-6h7"/><path d="M4 10h6V4" stroke-dasharray="2 2"/>',
  array: '<rect x="2.5" y="2.5" width="5" height="5"/><rect x="12.5" y="2.5" width="5" height="5"/><rect x="2.5" y="12.5" width="5" height="5"/><rect x="12.5" y="12.5" width="5" height="5"/>',
  erase: '<path d="M7 16h10"/><path d="M3.5 12.5l6-6 5 5-6 6H6z"/>',
  break: '<path d="M3 10h4M13 10h4"/><path d="M8.5 5l1.6 5-1.6 5M11.5 5l-1.6 5 1.6 5"/>',
  join: '<path d="M3 10h5M12 10h5"/><circle cx="10" cy="10" r="2"/>',
  explode: '<path d="M10 10L4 4M10 10l6-6M10 10l-6 6M10 10l6 6"/>',
  stretch: '<path d="M3 14h14"/><path d="M3 6v10M17 6v10"/><path d="M12 11l3 3-3 3"/>',
  align: '<path d="M3 15l5-5 4 4 5-8"/><circle cx="3" cy="15" r="1.3"/><circle cx="17" cy="6" r="1.3"/>',
  divide: '<path d="M3 10h14"/><path d="M7 8v4M11 8v4M15 8v4"/>',
  measure: '<path d="M3 12h14v-4H3z"/><path d="M6 8v2M9 8v3M12 8v2M15 8v3"/>',
  pedit: '<path d="M3 14l5-6 4 3 5-7"/><circle cx="8" cy="8" r="1.4"/><circle cx="12" cy="11" r="1.4"/>',
  matchprop: '<path d="M4 8h6v9H4z"/><path d="M5 8V4h4v4"/><path d="M13 5l4 4-4 4z"/>',
  block: '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="M3 8h14M8 3v14"/>',
  insert: '<rect x="6" y="6" width="11" height="11" rx="1"/><path d="M3 10V3h7" stroke-dasharray="2 2"/>',
  dist: '<path d="M3 14L17 6"/><circle cx="3" cy="14" r="1.6"/><circle cx="17" cy="6" r="1.6"/><path d="M6.5 8.5l5 5" stroke-dasharray="2 2"/>',
  area: '<path d="M3 15l3-9 6 3 5-4v13z"/>',
  id: '<circle cx="10" cy="10" r="2"/><path d="M10 2v4M10 14v4M2 10h4M14 10h4"/>',
  list: '<path d="M6 5h11M6 10h11M6 15h11M3 5h.01M3 10h.01M3 15h.01"/>',
  qselect: '<path d="M3 3h5M3 3v5M17 3h-5M17 3v5M3 17h5M3 17v-5M17 17h-5M17 17v-5"/><circle cx="10" cy="10" r="2.5"/>',
  /* architecture */
  wall: '<path d="M2 7h16M2 13h16"/><path d="M2 7v6M18 7v6"/>',
  wallrect: '<rect x="3" y="4" width="14" height="12"/><rect x="5.5" y="6.5" width="9" height="7"/>',
  door: '<path d="M3 16V6h6"/><path d="M9 6a10 10 0 0 1 8 10H9z" fill="none"/><path d="M3 16h14"/>',
  window: '<path d="M2 7h16M2 13h16"/><path d="M2 9.2h16M2 10.8h16"/>',
  column: '<rect x="5" y="5" width="10" height="10"/><path d="M5 5l10 10M15 5L5 15"/>',
  stair: '<path d="M3 17V13h4V9h4V5h6"/><path d="M3 17h14"/>',
  room: '<rect x="3" y="4" width="14" height="12" rx=".5" stroke-dasharray="3 2"/><path d="M7 10h6"/>',
  grid: '<circle cx="5" cy="5" r="3"/><path d="M7.6 7L17 16" stroke-dasharray="4 2 1 2"/>',
  wallflip: '<path d="M10 3v14"/><path d="M6 7L3 10l3 3"/><path d="M14 7l3 3-3 3"/>',
  walljoin: '<path d="M3 17V7h10"/><path d="M7 17V11h10"/>',
  wallsplit: '<path d="M2 7h16M2 13h16"/><path d="M10 3v14" stroke-dasharray="2 2"/>',
  /* chrome */
  undo: '<path d="M3.5 8.5h9.2a4.3 4.3 0 0 1 0 8.6H7"/><path d="M7 4.5L3.2 8.5 7 12.5"/>',
  redo: '<path d="M16.5 8.5H7.3a4.3 4.3 0 0 0 0 8.6H13"/><path d="M13 4.5l3.8 4-3.8 4"/>',
  fit: '<path d="M3 7.5V3h4.5M16.5 7.5V3H12M3 12.5V17h4.5M16.5 12.5V17H12"/><rect x="6.8" y="6.8" width="6.4" height="6.4" rx=".6"/>',
  north: '<path d="M10 17V4"/><path d="M5.8 8.2L10 4l4.2 4.2"/><path d="M4 18.5h12" opacity=".45"/>',
  gear: '<circle cx="10" cy="10" r="2.7"/><path d="M10 2.4v2.1M10 15.5v2.1M2.4 10h2.1M15.5 10h2.1M4.6 4.6l1.5 1.5M13.9 13.9l1.5 1.5M15.4 4.6l-1.5 1.5M6.1 13.9l-1.5 1.5"/>',
  close: '<path d="M4.5 4.5l11 11M15.5 4.5l-11 11"/>',
  /* wall alignment: which edge of the band the drawn line represents */
  alignIn: '<rect x="6" y="3" width="9" height="14" rx=".5"/><path d="M6 2.2v15.6" stroke-width="2.6"/>',
  alignMid: '<rect x="5.5" y="3" width="9" height="14" rx=".5"/><path d="M10 2.2v15.6" stroke-width="2.6"/>',
  alignOut: '<rect x="5" y="3" width="9" height="14" rx=".5"/><path d="M14 2.2v15.6" stroke-width="2.6"/>',
  colRect: '<rect x="5" y="5" width="10" height="10" rx=".5"/>',
  colRound: '<circle cx="10" cy="10" r="5.4"/>',
  turnL: '<path d="M13 16V9a4 4 0 0 0-4-4H5"/><path d="M7.6 2.6L5 5.2l2.6 2.6"/>',
  turnR: '<path d="M7 16V9a4 4 0 0 1 4-4h4"/><path d="M12.4 2.6L15 5.2l-2.6 2.6"/>',
  flipA: '<path d="M3 10h14"/><path d="M6 6.5L3 10l3 3.5"/><path d="M10 3v4"/>',
  flipB: '<path d="M3 10h14"/><path d="M14 6.5L17 10l-3 3.5"/><path d="M10 13v4"/>',
  handL: '<path d="M5 16V5h4"/><path d="M5 16a11 11 0 0 0 11-11" stroke-dasharray="2.4 2"/>',
  handR: '<path d="M15 16V5h-4"/><path d="M15 16A11 11 0 0 0 4 5" stroke-dasharray="2.4 2"/>',
  eyedrop: '<path d="M13.6 3.4a2 2 0 0 1 2.8 2.8l-1.3 1.3-2.8-2.8z"/><path d="M11.6 5.4l-7 7V15h2.6l7-7"/>',
  plus: '<path d="M10 4.5v11M4.5 10h11"/>',
  eye: '<path d="M1.5 8s2.6-4 6.5-4 6.5 4 6.5 4-2.6 4-6.5 4-6.5-4-6.5-4z"/><circle cx="8" cy="8" r="1.6"/>',
  eyeoff: '<path d="M2 2l12 12"/><path d="M6.2 6.3A2 2 0 0 0 8 10a2 2 0 0 0 1.7-1"/><path d="M4.2 4.4C2.6 5.6 1.5 8 1.5 8s2.6 4 6.5 4c1 0 1.9-.2 2.7-.6M12 4.9c1.6 1.2 2.5 3.1 2.5 3.1s-.5.8-1.4 1.7"/>',
  lock: '<rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  unlock: '<rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.6"/>',
};
const svg = (k, vb) => `<svg viewBox="0 0 ${vb || 20} ${vb || 20}">${IC[k] || ''}</svg>`;

/** Empty a container. Browsers drop the children when innerHTML is cleared;
    the headless DOM stub keeps a plain array, so clear that too. */
function clearNode(n) {
  if (!n) return n;
  n.innerHTML = '';
  if (n.children && typeof n.children.splice === 'function') n.children.length = 0;
  return n;
}

/* ============================================================
   TOOL RAIL
   The rail is a fixed grid: every tool of the active mode is on screen at
   once, grouped under headings that never collapse and never scroll.
   RAIL_LAYOUT mirrors the --tool/--tgap/--rpad/--rhead/--rgap custom
   properties in shell.html; railMetrics() turns it into a pixel height so
   the "must not scroll" rule is testable.
   ============================================================ */
const RAIL_LAYOUT = { cols: 3, tool: 26, gap: 3, pad: 6, head: 14, groupGap: 4 };
let RAIL_FIT = null;

const RAILS = {
  drafting: [
    ['Select', [
      ['select', 'Select', 'Esc'], ['qselect', 'Quick select', ''],
      ['matchprop', 'Match properties', 'MA'],
    ]],
    ['Draw', [
      ['line', 'Line', 'L'], ['pline', 'Polyline', 'PL'], ['spline', 'Spline', 'SPL'],
      ['rect', 'Rectangle', 'REC'], ['circle', 'Circle', 'C'], ['arc', 'Arc', 'A'],
      ['ellipse', 'Ellipse', 'EL'], ['polygon', 'Polygon', 'POL'], ['donut', 'Donut', 'DO'],
      ['point', 'Point', 'PO'], ['xline', 'Construction line', 'XL'], ['ray', 'Ray', ''],
      ['revcloud', 'Revision cloud', ''], ['hatch', 'Hatch', 'H'],
    ]],
    ['Annotate', [
      ['text', 'Single-line text', 'DT'], ['mtext', 'Paragraph text', 'MT'],
      ['leader', 'Leader note', 'LE'], ['dim', 'Dimension', 'DLI'],
      ['dimcont', 'Continue dimension', 'DCO'],
    ]],
    ['Transform', [
      ['move', 'Move', 'M'], ['copy', 'Copy', 'CO'], ['rotate', 'Rotate', 'RO'],
      ['scale', 'Scale', 'SC'], ['mirror', 'Mirror', 'MI'], ['offset', 'Offset', 'O'],
      ['array', 'Array', 'AR'], ['stretch', 'Stretch', 'S'], ['align', 'Align', 'AL'],
    ]],
    ['Modify', [
      ['trim', 'Trim', 'TR'], ['extend', 'Extend', 'EX'], ['lengthen', 'Lengthen', 'LEN'],
      ['fillet', 'Fillet', 'F'], ['chamfer', 'Chamfer', 'CHA'], ['break', 'Break', 'BR'],
      ['join', 'Join', 'J'], ['pedit', 'Edit polyline', 'PE'], ['explode', 'Explode', 'X'],
      ['divide', 'Divide', 'DIV'], ['measure', 'Measure along', 'ME'], ['erase', 'Erase', 'E'],
    ]],
    ['Blocks', [
      ['block', 'Make block', 'B'], ['insert', 'Insert block', 'I'],
    ]],
    ['Inquiry', [
      ['dist', 'Distance', 'DI'], ['area', 'Area', 'AA'],
      ['id', 'Point coordinates', ''], ['list', 'List properties', 'LI'],
    ]],
  ],
  arch: [
    ['Select', [['select', 'Select', 'Esc']]],
    ['Build', [
      ['wall', 'Wall', 'W'], ['wallrect', 'Room of walls', 'WR'],
      ['column', 'Column', 'COL'], ['stair', 'Stair', 'STR'],
    ]],
    ['Openings', [
      ['door', 'Door', 'DR'], ['window', 'Window', 'WI'], ['wallflip', 'Flip opening', 'WF'],
    ]],
    ['Wall tools', [
      ['walljoin', 'Clean up corners', 'WJ'], ['wallsplit', 'Split wall', 'WS'],
    ]],
    ['Space', [
      ['room', 'Room / area tag', 'RM'], ['grid', 'Structural grid', 'CG'],
    ]],
    ['Transform', [
      ['move', 'Move', 'M'], ['copy', 'Copy', 'CO'], ['rotate', 'Rotate', 'RO'],
      ['mirror', 'Mirror', 'MI'], ['array', 'Array', 'AR'], ['erase', 'Erase', 'E'],
    ]],
    ['Annotate', [
      ['dim', 'Dimension', 'DLI'], ['text', 'Text', 'DT'],
      ['dist', 'Distance', 'DI'], ['area', 'Area', 'AA'],
    ]],
  ],
};
let MODE = 'drafting';

/** Pixel height the rail needs for a mode — must stay under the stage height. */
function railMetricsFor(mode, cols, tool) {
  const L = RAIL_LAYOUT, groups = RAILS[mode || MODE] || [];
  let rows = 0, tools = 0;
  for (const g of groups) { tools += g[1].length; rows += Math.ceil(g[1].length / cols); }
  const gridRows = groups.length + rows;
  return {
    groups: groups.length, tools, rows, cols, tool,
    height: L.pad * 2 + groups.length * L.head + rows * tool
      + Math.max(gridRows - 1, 0) * L.gap + Math.max(groups.length - 1, 0) * L.groupGap,
    width: cols * tool + (cols - 1) * L.gap + L.pad * 2,
  };
}
/** Height the rail may occupy: the viewport less the top and bottom bars. */
function railAvailable() {
  const h = (typeof window !== 'undefined' && window.innerHeight) || 800;
  return Math.max(h - 46 - 60, 200);
}
/** Every tool has to be visible without scrolling, so the rail fits itself to
    the window rather than assuming a tall one: widen to more columns first,
    then step the button size down. A fixed 3-column rail needed 674px and was
    silently clipping twelve tools on a 1366x768 laptop. */
function railFit(mode, avail) {
  const room = avail == null ? railAvailable() : avail;
  let best = null;
  for (const tool of [26, 24, 22, 20, 18]) {
    for (const cols of [3, 4, 5, 6]) {
      const m = railMetricsFor(mode, cols, tool);
      if (m.height <= room) return m;
      if (!best || m.height < best.height) best = m;
    }
  }
  return best;
}
function railMetrics(mode) { return railFit(mode); }

const tipEl = el('div', 'tip'); document.body.appendChild(tipEl);
/** Shared hover tooltip. side: 'right' (rail) or 'bottom' (top bar / nav). */
function tipOn(b, label, key, side) {
  b.onpointerenter = () => {
    const q = b.getBoundingClientRect ? b.getBoundingClientRect() : null; if (!q) return;
    tipEl.innerHTML = esc(label) + (key ? '<b>' + esc(key) + '</b>' : '');
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 900;
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 1400;
    if (side === 'bottom') { tipEl.style.left = Math.min(q.left, vw - 190) + 'px'; tipEl.style.top = (q.bottom + 7) + 'px'; }
    else if (side === 'left') { tipEl.style.left = Math.max(q.left - 168, 8) + 'px'; tipEl.style.top = (q.top + 4) + 'px'; }
    else { tipEl.style.left = (q.right + 8) + 'px'; tipEl.style.top = Math.min(q.top + 4, vh - 40) + 'px'; }
    tipEl.style.opacity = 1;
  };
  b.onpointerleave = () => tipEl.style.opacity = 0;
  b.tipText = label + (key ? ' (' + key + ')' : '');
  if ('ariaLabel' in b) b.ariaLabel = b.tipText;      /* the visible tip is ours, not the browser's */
  return b;
}

function buildRail() {
  initShellUI();
  const r = $('#rail'); if (!r) return;
  clearNode(r);
  /* fit the rail to the window so nothing is ever clipped or scrolled away */
  RAIL_FIT = railFit(MODE);
  const cols = (RAIL_FIT && RAIL_FIT.cols) || RAIL_LAYOUT.cols;
  const tool = (RAIL_FIT && RAIL_FIT.tool) || RAIL_LAYOUT.tool;
  r.style.gridTemplateColumns = 'repeat(' + cols + ',var(--tool))';
  if (r.style) {
    r.style.setProperty ? r.style.setProperty('--tool', tool + 'px') : (r.style['--tool'] = tool + 'px');
  }
  const railW = cols * tool + (cols - 1) * RAIL_LAYOUT.gap + RAIL_LAYOUT.pad * 2;
  const root = document.documentElement;
  if (root && root.style && root.style.setProperty) root.style.setProperty('--rail', railW + 'px');
  for (const [title, tools] of (RAILS[MODE] || [])) {
    const h = el('div', 'rgrp', esc(title)); h.dataset.group = title;
    r.appendChild(h);
    for (const [k, label, key] of tools) {
      const b = el('button', 'tool', svg(k));
      b.dataset.tool = k; b.dataset.group = title; if (key) b.dataset.k = key;
      b.onclick = () => { tipEl.style.opacity = 0; k === 'select' ? endCmd() : startCmd(k); };
      tipOn(b, label, key, 'right');
      r.appendChild(b);
    }
  }
  syncTools();
}
function setMode(m) {
  if (MODE === m) return;
  MODE = m; endCmd(true);
  document.querySelectorAll('.mode').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  buildRail(); syncUI(); draw();
  echo(m === 'arch' ? 'Architecture' : 'Drafting');
}
function syncTools() {
  document.querySelectorAll('.tool').forEach(b =>
    b.classList.toggle('on', b.dataset.tool === (CMD ? CMD.def.key : 'select')));
  /* the quick editor must never fight the dynamic-input box */
  if (CMD) hideQuickProps();
  else if (!QP && typeof SEL !== 'undefined' && SEL.size) showQuickProps(selEnts());
  if (typeof syncTouch === 'function') syncTouch();
}

/* ============================================================
   SHELL CHROME — undo/redo icons, navigation widget, drawing settings
   Wired once, lazily, from whichever of buildRail()/buildProps() runs first,
   so the whole shell stays inside this module.
   ============================================================ */
let _shellReady = false;
function initShellUI() {
  if (_shellReady) return; _shellReady = true;
  const u = $('#mUndo'), rd = $('#mRedo');
  if (u) { u.innerHTML = svg('undo'); u.className = 'tb ico'; tipOn(u, 'Undo', 'Ctrl+Z', 'bottom'); }
  if (rd) { rd.innerHTML = svg('redo'); rd.className = 'tb ico'; tipOn(rd, 'Redo', 'Ctrl+Y', 'bottom'); }

  const f = $('#vFit');
  if (f) { f.innerHTML = svg('fit'); tipOn(f, 'Zoom to fit the drawing', 'Q', 'left'); }
  const n = $('#vNorth');
  if (n) { n.innerHTML = svg('north'); tipOn(n, 'Reset view rotation', '', 'left'); n.onclick = () => setViewRot(0); }
  const g = $('#dsMore');
  if (g) { g.innerHTML = svg('gear'); g.onclick = toggleDrawPop; tipOn(g, 'Drawing settings', '', 'left'); }
  const vs = $('#vscale');
  if (vs) { vs.onclick = () => { pushView(); fit(null, true); }; syncScale(); }

  /* the widget is inside #stage: keep its pointer traffic off the canvas */
  const nav = $('#nav');
  if (nav && nav.addEventListener)
    ['pointerdown', 'pointerup', 'pointermove', 'click', 'dblclick'].forEach(t =>
      nav.addEventListener(t, ev => { if (ev.stopPropagation) ev.stopPropagation(); }));

  initDial();
  /* keep the floating editor glued to its object while the view moves */
  const st = $('#stage');
  if (st && st.addEventListener) {
    ['pointermove', 'pointerup', 'wheel'].forEach(t =>
      st.addEventListener(t, () => { if (QP && QP._ent) placeQuickProps(QP._ent, QP); }));
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('pointerdown', ev => {
      const p = $('#dsPop'); if (!p || !p.classList.contains('show')) return;
      const t = ev.target;
      if (t && t.closest && (t.closest('#dsPop') || t.closest('#dsMore'))) return;
      p.classList.remove('show');
    });
  }
  syncNav(); buildDrawSettings();
}

/* ---------- navigation: fit + view rotation dial ---------- */
function setViewRot(r) {
  V.rot = wrapS(r);
  if (Math.abs(V.rot) < 1e-9) V.rot = 0;
  draw(); syncNav();
}
function viewRotDeg() { const d = deg(V.rot) % 360; return d < 0 ? d + 360 : d; }
function syncNav() {
  const rose = $('#dialRose');
  if (rose) rose.style.transform = 'rotate(' + (-deg(V.rot)).toFixed(3) + 'deg)';
  const a = $('#navAng'); if (a) a.textContent = viewRotDeg().toFixed(1) + '°';
  const n = $('#vNorth'); if (n) n.classList.toggle('off', !V.rot);
}
function initDial() {
  const d = $('#dialWrap'); if (!d || !d.addEventListener) return;
  let grab = null;
  const angAt = ev => {
    const r = d.getBoundingClientRect();
    return Math.atan2(ev.clientX - (r.left + r.width / 2), -(ev.clientY - (r.top + r.height / 2)));
  };
  d.addEventListener('pointerdown', ev => {
    if (ev.preventDefault) ev.preventDefault();
    if (ev.stopPropagation) ev.stopPropagation();
    grab = { a: angAt(ev), r: V.rot };
    if (d.setPointerCapture && ev.pointerId != null) { try { d.setPointerCapture(ev.pointerId); } catch (e) { } }
  });
  d.addEventListener('pointermove', ev => {
    if (!grab) return;
    if (ev.stopPropagation) ev.stopPropagation();
    let r = grab.r - (angAt(ev) - grab.a);
    if (ev.shiftKey) r = Math.round(r / rad(15)) * rad(15);
    setViewRot(r);
  });
  const up = () => { grab = null; };
  d.addEventListener('pointerup', up);
  d.addEventListener('pointercancel', up);
  d.addEventListener('pointerleave', up);
  d.addEventListener('dblclick', () => setViewRot(0));
}

/* ---------- drawing settings (bottom bar) ---------- */
/** The editable form of a length. It goes through fmt(), so a field is written
    in the same notation the coordinate readout, the dimensions and the AutoSnap
    tooltips use — an imperial drawing put 9.84252 in a property field and
    9'-10 1/8" in the status bar, which is two answers to one question — and
    asks only for more decimals than a readout needs. `raw` marks the counts and
    pixel settings, which are not lengths and carry no unit at all. */
function dispNum(v, raw) {
  return raw ? +Number(v).toFixed(4) : fmt(Number(v), DOC.units, 5);
}
function dsField(w, tag, val, label, on, raw) {
  const b = el('label', 'ds');
  b.title = label + (raw ? '' : ' (' + DOC.units + ')');
  b.appendChild(el('i', '', tag));
  const i = el('input');
  i.value = dispNum(val, raw); i.title = b.title;
  i.onchange = () => {
    const v = raw ? parseFloat(i.value) : parseLen(i.value);
    if (!isNaN(v)) { on(v); buildDrawSettings(); } else i.value = dispNum(val, raw);
  };
  b.appendChild(i); w.appendChild(b); return i;
}
function drawSettingsExtras(w) {
  addRow(w, 'Crosshair %', ST.crossLen == null ? 100 : ST.crossLen,
    v => { ST.crossLen = clamp(v, 1, 100); draw(); }, 1);
  addRow(w, 'Pick box px', ST.pickBox || 8,
    v => { ST.pickBox = clamp(Math.round(v), 2, 40); draw(); }, 1);
  addRow(w, 'Grip size px', ST.gripSize || 5,
    v => { ST.gripSize = clamp(Math.round(v), 2, 20); draw(); }, 1);
  /* snap settings first, since they follow the pick box; display below */
  addRow(w, 'Aperture px', ST.aperture || 10,
    v => { ST.aperture = clamp(Math.round(v), 1, 50); draw(); }, 1);
  addRow(w, 'Marker px', ST.markerSize || 6,
    v => { ST.markerSize = clamp(Math.round(v), 2, 20); draw(); }, 1);
  btnRow(w, 'Object snap', 'Settings…', () => { w.classList.remove('show'); openOsnapSettings(2); });
  addRow(w, 'Zoom factor', VS.zoomFactor, v => { VS.zoomFactor = clamp(Math.round(v), 3, 100); }, 1);
  grpRow(w, 'Display');
  addRow(w, 'LTSCALE', ltScale(), v => { DOC.ltScale = clamp(v, 1e-4, 1e6); draw(); }, 1);
  addRow(w, 'Grid major', VS.gridMajor, v => { VS.gridMajor = clamp(Math.round(v), 1, 100); draw(); }, 1);
  btnRow(w, 'Lineweights', ST.lwt === false ? 'off' : 'on', () => {
    ST.lwt = ST.lwt === false; syncToggles(); draw(); buildDrawPop();
  });
  btnRow(w, 'UCS icon', VS.ucsIcon ? 'on' : 'off', () => {
    VS.ucsIcon = !VS.ucsIcon; draw(); buildDrawPop();
  });  btnRow(w, 'Wall poche', DOC.wallHatch === false ? 'off' : 'on', () => {
    begin(); DOC.wallHatch = DOC.wallHatch === false; commit('Wall poche');
    draw(); syncUI();
  });
}
function buildDrawSettings() {
  const w = $('#dset'); if (!w) return;
  clearNode(w);
  dsField(w, 'GRID', DOC.gridStep, 'Grid spacing', v => { DOC.gridStep = Math.max(v, 1e-6); draw(); });
  dsField(w, 'SNAP', DOC.snapStep, 'Grid snap step', v => { DOC.snapStep = Math.max(v, 1e-6); });
  dsField(w, 'TEXT', DOC.textH, 'Default text height', v => { DOC.textH = Math.max(v, 1e-6); draw(); });
  dsField(w, 'POLAR', ST.polarInc, 'Polar tracking increment in degrees', v => { ST.polarInc = clamp(v, 1, 180); }, 1);
}
function toggleDrawPop() {
  const p = $('#dsPop'); if (!p) return;
  const on = !p.classList.contains('show');
  if (on) buildDrawPop();
  p.classList.toggle('show', on);
}
function buildDrawPop() {
  const w = $('#dsPop'); if (!w) return;
  clearNode(w);
  const h = el('div', 'ph', 'Drawing settings');
  const x = el('button', '', '×'); x.title = 'Close';
  x.onclick = () => w.classList.remove('show');
  h.appendChild(x); w.appendChild(h);
  const sync = () => { buildDrawSettings(); buildDrawPop(); };
  addRow(w, 'Grid step', DOC.gridStep, v => { DOC.gridStep = Math.max(v, 1e-6); draw(); sync(); });
  addRow(w, 'Snap step', DOC.snapStep, v => { DOC.snapStep = Math.max(v, 1e-6); sync(); });
  addRow(w, 'Text height', DOC.textH, v => { DOC.textH = Math.max(v, 1e-6); draw(); sync(); });
  addRow(w, 'Polar °', ST.polarInc, v => { ST.polarInc = clamp(v, 1, 180); sync(); }, 1);
  grpRow(w, 'Cursor');
  drawSettingsExtras(w);
  if (MODE === 'arch') {
    grpRow(w, 'Architecture');
    selRow(w, 'Level', (DOC.levels || []).map((l, i) => [i, l.name]), DOC.curLevel, v => { DOC.curLevel = +v; draw(); });
    selRow(w, 'Wall type', (DOC.wallTypes || []).map(t => [t.id, t.name]), ARCH.wt, v => { ARCH.wt = v; });
    addRow(w, 'Wall height', ARCH.wallH, v => { ARCH.wallH = Math.max(v, 1); });
    btnRow(w, 'Libraries', 'Edit types…', () => { w.classList.remove('show'); openTypeManager(); });
  }
  grpRow(w, 'Drawing');
  ro(w, 'Units', DOC.units);
  ro(w, 'Objects', DOC.ents.size);
  ro(w, 'Layers', DOC.layers.length);
  ro(w, 'Undo steps', HIST.past.length);
}

/* ---------- layers ---------- */
function buildLayers() {
  const w = $('#layers'); if (!w) return;
  clearNode(w);
  for (const l of DOC.layers) {
    const row = el('div', 'lay' + (l.name === DOC.cur ? ' cur' : ''));
    const sw = el('span', 'sw'); sw.style.background = l.color;
    sw.title = 'Layer colour';
    sw.onclick = ev => { ev.stopPropagation(); pickColor(l.color, c => { begin(); touchLayers(); l.color = c; commit('Layer colour'); draw(); }); };
    const nm = el('span', 'lname', esc(l.name));
    nm.title = l.name + ' — double-click to rename';
    nm.ondblclick = ev => { ev.stopPropagation(); renameLayer(l); };
    const eye = el('span', 'ic' + (l.on ? '' : ' off'), svg(l.on ? 'eye' : 'eyeoff', 16));
    eye.title = l.on ? 'Hide layer' : 'Show layer';
    eye.onclick = ev => { ev.stopPropagation(); begin(); touchLayers(); l.on = !l.on; commit(); draw(); buildLayers(); };
    const lk = el('span', 'ic' + (l.lock ? ' off' : ''), svg(l.lock ? 'lock' : 'unlock', 16));
    lk.title = l.lock ? 'Unlock layer' : 'Lock layer';
    lk.onclick = ev => { ev.stopPropagation(); begin(); touchLayers(); l.lock = !l.lock; commit(); draw(); buildLayers(); };
    row.append(sw, nm, eye, lk);
    row.onclick = () => {
      DOC.cur = l.name;
      if (SEL.size) { begin(); selEnts().forEach(e => { mut(e); e.layer = l.name; }); commit('Moved to ' + l.name); }
      buildLayers(); draw(); buildProps();
    };
    w.appendChild(row);
  }
}
function renameLayer(l) {
  modal(`<h3>Layer</h3>
    <div class="row"><label>Name</label><input class="f" id="ln" value="${esc(l.name)}"></div>
    <div class="row"><label>Lineweight</label><select class="f" id="lw">
      ${LW_LADDER.map(v => `<option value="${v}" ${lwSnap(l.lw) === v ? 'selected' : ''}>${v === 0 ? '0.00 (hairline)' : v.toFixed(2) + ' mm'}</option>`).join('')}
    </select></div>
    <div class="row"><label>Linetype</label><select class="f" id="lt">
      ${Object.keys(LTDEF).concat('solid').sort().map(t => `<option ${t === l.lt ? 'selected' : ''}>${t}</option>`).join('')}
    </select></div>`, () => {
    const n = $('#ln').value.trim().toUpperCase();
    begin(); touchLayers();
    if (n && n !== l.name && !DOC.layers.some(x => x.name === n)) {
      const old = l.name; l.name = n;
      for (const e of DOC.ents.values()) if (e.layer === old) { mut(e); e.layer = n; }
      if (DOC.cur === old) DOC.cur = n;
    }
    l.lw = lwSnap(parseFloat($('#lw').value));
    l.lt = $('#lt').value;
    commit('Layer updated'); buildLayers(); draw();
  });
}

/* ---------- property rows ---------- */
function addRow(w, label, val, on, raw) {
  const r = el('div', 'row', `<label>${label}</label>`);
  const i = el('input', 'f');
  i.value = dispNum(val, raw);
  i.onchange = () => { const v = raw ? parseFloat(i.value) : parseLen(i.value); if (!isNaN(v)) on(v); };
  r.appendChild(i); w.appendChild(r); return i;
}
function ro(w, label, v) { w.appendChild(el('div', 'row', `<label>${label}</label><span class="ro">${esc(v)}</span>`)); }
function selRow(w, label, options, cur, on) {
  const r = el('div', 'row', `<label>${label}</label>`);
  const s = el('select', 'f');
  for (const [v, t] of options) { const o = el('option', '', t); o.value = v; if (String(v) === String(cur)) o.selected = true; s.appendChild(o); }
  s.onchange = () => on(s.value);
  r.appendChild(s); w.appendChild(r); return s;
}
function btnRow(w, label, text, on) {
  const r = el('div', 'row', `<label>${label}</label>`);
  const b = el('button', 'f'); b.style.textAlign = 'left'; b.textContent = text;
  b.onclick = on; r.appendChild(b); w.appendChild(r); return b;
}
function txtRow(w, label, val, on) {
  const r = el('div', 'row', `<label>${label}</label>`);
  const i = el('input', 'f'); i.value = val == null ? '' : val;
  i.onchange = () => on(i.value);
  r.appendChild(i); w.appendChild(r); return i;
}
function grpRow(w, title) { w.appendChild(el('div', 'grp', esc(title))); return w; }

/** a segmented choice — three buttons that read as one control */
function segRow(w, label, options, cur, on) {
  const r = el('div', 'row', `<label>${label}</label>`);
  const g = el('div', 'seg');
  for (const o of options) {
    const [v, title, icon] = o;
    const b = el('button', 'segb' + (String(v) === String(cur) ? ' on' : ''), icon ? svg(icon) : esc(title));
    b.title = title;
    b.onclick = () => on(v);
    g.appendChild(b);
  }
  r.appendChild(g); w.appendChild(r); return g;
}
/** the style header: what is being drawn, plus its actions */
function styleHead(w, title, actions) {
  const h = el('div', 'sty');
  h.appendChild(el('b', '', esc(title)));
  const box = el('span', 'styacts');
  for (const [icon, tip, fn] of (actions || [])) {
    const b = el('button', 'styb', svg(icon, 20));
    b.title = tip; b.onclick = fn;
    box.appendChild(b);
  }
  h.appendChild(box); w.appendChild(h); return h;
}
/** a colour row: swatch, name, and a control to clear it */
function swatchRow(w, label, colour, text, on, onClear) {
  const r = el('div', 'row', `<label>${label}</label>`);
  const b = el('button', 'f swrow');
  const sw = el('span', 'swb'); sw.style.background = colour || 'transparent';
  b.appendChild(sw); b.appendChild(el('span', 'swt', esc(text)));
  b.onclick = on;
  r.appendChild(b);
  if (onClear) { const x = el('button', 'swx', '−'); x.title = 'Reset to ByLayer'; x.onclick = onClear; r.appendChild(x); }
  w.appendChild(r); return b;
}

/* ============================================================
   The Command panel
   ------------------------------------------------------------
   Revit shows you what you are ABOUT to draw the instant a tool
   is picked, so the type and its placement can be set before the
   first click rather than by drawing something and correcting it.
   Split the way Revit splits it: "Active style" is the type — the
   thing shared by every wall of that type — and "Active
   properties" are the per-instance settings for this run of the
   command.
   ============================================================ */
function cmdTitle(k) {
  return ({ wall: 'Wall', wallrect: 'Room of walls', door: 'Door', window: 'Window',
    column: 'Column', stair: 'Stair', room: 'Room', grid: 'Grid line',
    line: 'Line', pline: 'Polyline', rect: 'Rectangle', circle: 'Circle', arc: 'Arc',
    ellipse: 'Ellipse', polygon: 'Polygon', spline: 'Spline', text: 'Text',
    mtext: 'Paragraph text', dim: 'Dimension', hatch: 'Hatch', leader: 'Leader',
    point: 'Point', revcloud: 'Revision cloud', xline: 'Construction line', ray: 'Ray',
    donut: 'Donut' }[k]) || (k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Command');
}
const ALIGN_OPTS = [
  ['inner', 'Inner face — the line you draw is the inside of the wall', 'alignIn'],
  ['centre', 'Centreline — the line you draw is the middle of the wall', 'alignMid'],
  ['outer', 'Outer face — the line you draw is the outside of the wall', 'alignOut'],
];
/** live command object, if the tool has started collecting input */
function activeCmd() { return (typeof CMD !== 'undefined' && CMD) ? CMD : null; }

const CMDPROPS = {
  wall(w, c) {
    const wt = wallType((c && c.wt) || ARCH.wt) || {};
    styleHead(w, 'Wall', [
      ['eyedrop', 'Copy the settings off an existing wall', () => matchStyleFrom('wall', c)],
      ['plus', 'Save these settings as a new wall type', () => saveWallType(c)],
    ]);
    selRow(w, 'Type', (DOC.wallTypes || []).map(t => [t.id, t.name]), (c && c.wt) || ARCH.wt, v => {
      /* picking a type adopts that type's thickness, so the override goes */
      ARCH.wt = v; ARCH.wallTh = null;
      if (c) { c.wt = v; c.th = null; }
      buildProps(); draw();
    });
    addRow(w, 'Thickness', (c && c.th) || ARCH.wallTh || wt.t || 100, v => {
      const t = Math.max(v, 1);
      ARCH.wallTh = t;
      if (c) c.th = t;
      buildProps(); draw();
    });
    grpRow(w, 'Active properties');
    segRow(w, 'Alignment', ALIGN_OPTS, (c && c.jmode) || ARCH.jmode || 'centre', v => {
      ARCH.jmode = v;
      if (c) { c.jmode = v; if (typeof wallRejustify === 'function') wallRejustify(c); }
      buildProps(); draw();
    });
    addRow(w, 'Height', ARCH.wallH, v => { ARCH.wallH = Math.max(v, 1); buildProps(); draw(); });
  },
  door(w, c) { openingCmdProps(w, c, 'door'); },
  window(w, c) { openingCmdProps(w, c, 'window'); },
  column(w, c) {
    styleHead(w, 'Column', []);
    addRow(w, (c && c.shape) === 'round' ? 'Diameter' : 'Width', (c && c.w) || ARCH.colW || 400,
      v => { if (c) c.w = Math.max(v, 1); ARCH.colW = Math.max(v, 1); buildProps(); draw(); });
    if (!c || c.shape !== 'round')
      addRow(w, 'Depth', (c && c.d) || ARCH.colD || 400,
        v => { if (c) c.d = Math.max(v, 1); ARCH.colD = Math.max(v, 1); buildProps(); draw(); });
    grpRow(w, 'Active properties');
    segRow(w, 'Shape', [['rect', 'Rectangular', 'colRect'], ['round', 'Round', 'colRound']],
      (c && c.shape) || ARCH.colShape || 'rect',
      v => { if (c) c.shape = v; ARCH.colShape = v; buildProps(); draw(); });
  },
  stair(w, c) {
    styleHead(w, 'Stair', []);
    addRow(w, 'Width', (c && c.w) || ARCH.stairW || 1000,
      v => { if (c) c.w = Math.max(v, 1); ARCH.stairW = Math.max(v, 1); buildProps(); draw(); });
    addRow(w, 'Risers', (c && c.risers) || ARCH.risers || 16,
      v => { const n = clamp(Math.round(v), 2, 80); if (c) c.risers = n; ARCH.risers = n; buildProps(); draw(); }, 1);
    grpRow(w, 'Active properties');
    selRow(w, 'Shape', [['straight', 'straight flight'], ['L', 'L with landing'], ['U', 'U with landing']],
      (c && c.kind) || ARCH.stairKind || 'straight',
      v => { if (c) c.kind = v; ARCH.stairKind = v; buildProps(); draw(); });
    if (((c && c.kind) || ARCH.stairKind || 'straight') !== 'straight')
      segRow(w, 'Turn', [[1, 'Turns left', 'turnL'], [-1, 'Turns right', 'turnR']],
        (c && c.turn) || ARCH.stairTurn || 1,
        v => { if (c) c.turn = +v; ARCH.stairTurn = +v; buildProps(); draw(); });
  },
  wallrect(w, c) { CMDPROPS.wall(w, c); },
};
function openingCmdProps(w, c, kind) {
  const lib = kind === 'door' ? (DOC.doorTypes || []) : (DOC.winTypes || []);
  const cur = (c && c.type) || (kind === 'door' ? ARCH.dt : ARCH.wtp);
  const T = (kind === 'door' ? doorType(cur) : winType(cur)) || {};
  styleHead(w, kind === 'door' ? 'Door' : 'Window', [
    ['eyedrop', 'Copy the settings off an existing one', () => matchStyleFrom(kind, c)],
  ]);
  selRow(w, 'Type', lib.map(t => [t.id, t.name]), cur, v => {
    if (c) c.type = v;
    if (kind === 'door') ARCH.dt = v; else ARCH.wtp = v;
    buildProps(); draw();
  });
  ro(w, 'Width', fmt(T.w || 900));
  ro(w, 'Height', fmt(T.h || 2100));
  if (kind === 'window') ro(w, 'Sill', fmt(T.sill || 900));
  grpRow(w, 'Active properties');
  segRow(w, 'Facing', [[0, 'Opens to this side', 'flipA'], [1, 'Opens to the other side', 'flipB']],
    (c && c.flip) ? 1 : 0, v => { if (c) c.flip = !!+v; buildProps(); draw(); });
  if (kind === 'door')
    segRow(w, 'Hinge', [[1, 'Hinge on the near jamb', 'handL'], [-1, 'Hinge on the far jamb', 'handR']],
      (c && c.hand === -1) ? -1 : 1, v => { if (c) c.hand = +v; buildProps(); draw(); });
}
/** pick an existing object and adopt its settings for the tool in hand */
function matchStyleFrom(kind, c) {
  toast('Click an existing ' + kind + ' to copy its settings');
  ST.styleTarget = { kind, c };
}
function saveWallType(c) {
  const base = wallType((c && c.wt) || ARCH.wt) || {};
  const th = (c && c.th) || base.t || 100;
  modal(`<h3>New wall type</h3>
    <div class="row"><label>Name</label><input class="f" id="wtn" value="${esc('Wall ' + Math.round(th))}"></div>
    <div class="row"><label>Thickness</label><input class="f" id="wtt" value="${dispNum(th)}"></div>`, () => {
    const t = parseLen($('#wtt').value) || th;
    const id = 'u' + Date.now().toString(36);
    (DOC.wallTypes = DOC.wallTypes || []).push({ id, name: ($('#wtn').value || 'Wall').trim(), t, fn: 'interior' });
    ARCH.wt = id; if (c) { c.wt = id; c.th = null; }
    buildProps(); draw();
  });
}
/** the pending-element panel shown while a tool is running */
function commandProps(w) {
  const c = activeCmd();
  const key = c ? c.def.key : null;
  if (!key) return false;
  const head = el('div', 'pttl');
  head.appendChild(el('b', '', esc(cmdTitle(key))));
  head.appendChild(el('i', '', 'command'));
  w.appendChild(head);

  grpRow(w, 'Command');
  selRow(w, 'Active layer', DOC.layers.map(l => [l.name, l.name]), DOC.cur, v => {
    DOC.cur = v; buildLayers(); buildProps(); draw();
  });

  const P = CMDPROPS[key];
  if (P) { grpRow(w, 'Active style'); P(w, c); }
  else {
    grpRow(w, 'Active style');
    styleHead(w, cmdTitle(key), []);
    const lay = layer(DOC.cur) || {};
    swatchRow(w, 'Stroke', lay.color, (lay.lt || 'solid') + '  ·  ' + (lay.lw || 0.25) + ' mm',
      () => pickColor(lay.color, col => { begin(); touchLayers(); lay.color = col; commit('Layer colour'); buildProps(); draw(); }));
    ro(w, 'Drawn on', DOC.cur);
  }
  if (c.def.hint) {
    const h = el('div', 'cmdhint');
    h.innerHTML = c.def.hint;
    w.appendChild(h);
  }
  return true;
}

/* ---------- properties panel ---------- */
function buildProps() {
  initShellUI();
  const w = $('#props'); if (!w) return;
  clearNode(w);
  const es = selEnts();
  /* A running tool owns the panel: it shows what is about to be drawn. */
  if (activeCmd() && !es.length) { hideQuickProps(); commandProps(w); return; }
  if (!es.length) { hideQuickProps(); return emptyProps(w); }
  const e = es[0], one = es.length === 1;

  const head = el('div', 'pttl');
  head.appendChild(el('b', '', esc(one ? niceName(e) : es.length + ' objects')));
  head.appendChild(el('i', '', one ? '#' + e.id : esc(kindSummary(es))));
  w.appendChild(head);

  const upd = () => { draw(); buildProps(); };
  const set = fn => v => { begin(); es.forEach(x => mut(x)); fn(v); commit(); upd(); };

  /* most-edited things first: the object's own parameters */
  if (one) {
    const P = PROPS[e.t];
    grpRow(w, P ? 'Parameters' : 'Geometry');
    if (P) P(w, e, set, upd); else genericProps(w, e, set);
  } else {
    totals(w, es);
  }

  /* then the shared appearance controls */
  grpRow(w, 'General');
  selRow(w, 'Layer', DOC.layers.map(l => [l.name, l.name]), e.layer,
    v => { begin(); es.forEach(x => { mut(x); x.layer = v; }); commit('Layer'); draw(); buildProps(); });
  btnRow(w, 'Colour', e.color || 'ByLayer',
    () => pickColor(e.color || entColor(e), c => { begin(); es.forEach(x => { mut(x); x.color = c; }); commit('Colour'); upd(); }, true));
  selRow(w, 'Linetype', [['', 'ByLayer'], ['solid', 'solid'], ['dashed', 'dashed'], ['hidden', 'hidden'], ['center', 'center'], ['dashdot', 'dashdot']],
    e.lt || '', v => { begin(); es.forEach(x => { mut(x); x.lt = v || null; }); commit('Linetype'); draw(); });

  showQuickProps(one ? e : es);
}
function kindSummary(es) {
  const c = {}; for (const e of es) c[e.t] = (c[e.t] || 0) + 1;
  return Object.keys(c).sort().map(k => c[k] + '×' + k).join('  ');
}
function niceName(e) {
  return ({ wall: 'Wall', door: 'Door', window: 'Window', column: 'Column', stair: 'Stair',
    room: 'Room', grid: 'Grid line', hatch: 'Hatch', insert: 'Block reference',
    pline: 'Polyline', spline: 'Spline', dim: 'Dimension', xline: 'Construction line',
    line: 'Line', circle: 'Circle', arc: 'Arc', ellipse: 'Ellipse', text: 'Text',
    point: 'Point', ray: 'Ray', leader: 'Leader' }[e.t]) || e.t;
}
/* Nothing selected: say so and stop. Drawing settings live in the bottom bar. */
function emptyProps(w) {
  w.appendChild(el('div', 'empty',
    `<b>Nothing selected</b>
     <p>Click an object to edit it. Drag left→right to take what is fully inside,
        right→left to catch anything you touch.</p>
     <div class="cl">CURRENT LAYER <i>${esc(DOC.cur)}</i></div>`));
}
function genericProps(w, e, set) {
  const L = entLength(e), A = entArea(e);
  if (L) ro(w, 'Length', fmt(L));
  if (A) ro(w, 'Area', fmtArea(A));
  if (!L && !A) ro(w, 'Type', e.t);
}
function totals(w, es) {
  grpRow(w, 'Totals');
  let L = 0, A = 0;
  const counts = {};
  for (const e of es) { L += entLength(e); A += entArea(e); counts[e.t] = (counts[e.t] || 0) + 1; }
  ro(w, 'Count', es.length);
  for (const k in counts) ro(w, '· ' + k, counts[k]);
  if (L) ro(w, 'Length', fmt(L));
  if (A) ro(w, 'Area', fmtArea(A));
}

/* ============================================================
   FLOATING QUICK PROPERTIES
   A small non-modal card beside the selected object with its two to four
   most-edited fields. Never shown while a command is running, so it can
   never collide with the dynamic-input box (.dyn).
   ============================================================ */
let QP = null, QPmuted = null;
function hideQuickProps() { if (QP) { QP.remove(); QP = null; } }
function quickFields(e) { return e && (QUICK[e.t] || QUICK._default); }
/** the fields two or more objects have in common. Anything type-specific is
    dropped the moment the types disagree — showing Thickness over a mixed
    bag of walls and doors would be a lie about what an edit will touch. */
function quickCommon(w, es, upd) {
  ro(w, 'Types', kindSummary(es));
  let L = 0, A = 0;
  for (const e of es) { L += entLength(e); A += entArea(e); }
  if (L) ro(w, 'Total length', fmt(L));
  else if (A) ro(w, 'Total area', fmtArea(A));
  const lay = es.every(e => e.layer === es[0].layer) ? es[0].layer : '';
  selRow(w, 'Layer', (lay ? [] : [['', '(varies)']]).concat(DOC.layers.map(l => [l.name, l.name])), lay,
    v => { if (!v) return; begin(); es.forEach(x => { mut(x); x.layer = v; }); commit('Layer'); draw(); buildProps(); });
}
function showQuickProps(sel) {
  hideQuickProps();
  const es = Array.isArray(sel) ? sel.filter(Boolean) : (sel ? [sel] : []);
  if (!es.length || (typeof CMD !== 'undefined' && CMD)) return;   /* .dyn owns the cursor */
  const one = es.length === 1, e = es[0];
  const key = one ? e.id : es.map(x => x.id).sort().join(',');
  if (QPmuted === key) return;
  const hud = $('#hud'); if (!hud) return;
  const F = one ? quickFields(e) : null;
  if (one && !F) return;

  const c = el('div', 'qp'); c._ent = e;
  const h = el('div', 'qph');
  h.appendChild(el('b', '', esc(one ? niceName(e) : es.length + ' objects selected')));
  h.appendChild(el('i', '', one ? '#' + e.id : String(es.length)));
  const x = el('button', '', svg('close', 20));
  x.title = 'Dismiss';
  x.onclick = ev => { if (ev && ev.stopPropagation) ev.stopPropagation(); QPmuted = key; hideQuickProps(); };
  h.appendChild(x); c.appendChild(h);

  const body = el('div', 'qpb'); c.appendChild(body);
  const upd = () => { draw(); buildProps(); };
  const set = fn => v => { begin(); mut(e); fn(v); commit(); upd(); };
  try { if (one) F(body, e, set, upd); else quickCommon(body, es, upd); }
  catch (err) { console.error(err); }

  if (c.addEventListener)
    ['pointerdown', 'pointerup', 'pointermove', 'click', 'dblclick', 'wheel'].forEach(t =>
      c.addEventListener(t, ev => { if (ev.stopPropagation) ev.stopPropagation(); }));
  hud.appendChild(c); QP = c;
  placeQuickProps(es, c);
  return c;
}
/** Beside the cursor, not the centre of the object — a card that opens half a
    screen away from your hand is a card you have to go looking for. */
function placeQuickProps(sel, c) {
  const es = Array.isArray(sel) ? sel : [sel];
  if (!es.length || !c) return;
  let s = null;
  if (ST && ST.cur) { const q = w2s(ST.cur); if (isFinite(q[0]) && isFinite(q[1])) s = q; }
  if (!s) {
    let b = null;
    try { b = bboxAll(es); } catch (err) { b = null; }
    if (!b || !isFinite(b[0])) return;
    s = w2s([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
  }
  if (!isFinite(s[0]) || !isFinite(s[1])) return;
  const vw = V.w || 1200, vh = V.h || 800, cw = 198, ch = 132;
  c.style.left = clamp(s[0] + 22, 8, Math.max(8, vw - cw - 8)) + 'px';
  c.style.top = clamp(s[1] + 18, 8, Math.max(8, vh - ch - 8)) + 'px';
}
const QUICK = {
  _default(w, e, set) {
    const L = entLength(e), A = entArea(e);
    if (L) ro(w, 'Length', fmt(L));
    if (A) ro(w, 'Area', fmtArea(A));
    selRow(w, 'Layer', DOC.layers.map(l => [l.name, l.name]), e.layer,
      v => { begin(); mut(e); e.layer = v; commit('Layer'); draw(); buildProps(); });
  },
  line(w, e, set, upd) {
    addRow(w, 'Length', dist(e.a, e.b), v => {
      if (!(v > 0)) return;
      begin(); mut(e); const a = ang(e.a, e.b);
      e.b = [e.a[0] + Math.cos(a) * v, e.a[1] + Math.sin(a) * v];
      commit('Length'); upd();
    });
    addRow(w, 'Angle °', deg(ang(e.a, e.b)), v => {
      begin(); mut(e); const L = dist(e.a, e.b), a = rad(v);
      e.b = [e.a[0] + Math.cos(a) * L, e.a[1] + Math.sin(a) * L];
      commit('Angle'); upd();
    }, 1);
  },
  circle(w, e, set) {
    addRow(w, 'Radius', e.r, set(v => e.r = Math.max(v, 1e-9)));
    addRow(w, 'Diameter', e.r * 2, set(v => e.r = Math.max(v / 2, 1e-9)));
  },
  arc(w, e, set) {
    addRow(w, 'Radius', e.r, set(v => e.r = Math.max(v, 1e-9)));
    ro(w, 'Included °', deg(arcSweep(e)).toFixed(2));
  },
  ellipse(w, e, set) {
    addRow(w, 'Radius X', e.rx, set(v => e.rx = Math.max(v, 1e-9)));
    addRow(w, 'Radius Y', e.ry, set(v => e.ry = Math.max(v, 1e-9)));
  },
  pline(w, e, set, upd) {
    ro(w, 'Length', fmt(polyLen(e.pts, e.closed)));
    btnRow(w, 'Closed', e.closed ? 'yes' : 'no', () => { begin(); mut(e); e.closed = !e.closed; commit(); upd(); });
  },
  text(w, e, set, upd) {
    txtRow(w, 'Text', e.s, v => { begin(); mut(e); e.s = v; commit('Text'); upd(); });
    addRow(w, 'Height', e.h, set(v => e.h = Math.max(v, 1e-6)));
  },
  point(w, e, set) {
    addRow(w, 'X', e.p[0], set(v => e.p[0] = v));
    addRow(w, 'Y', e.p[1], set(v => e.p[1] = v));
  },
  dim(w, e, set, upd) {
    ro(w, 'Measured', dimGeom(e).txt);
    txtRow(w, 'Override', e.txt || '', v => { begin(); mut(e); e.txt = v || null; commit(); upd(); });
    if (e.off != null) addRow(w, 'Offset', e.off, set(v => e.off = v));
  },
  hatch(w, e, set, upd) {
    selRow(w, 'Pattern', [['line', 'diagonal'], ['cross', 'cross'], ['solid', 'solid']], e.solid ? 'solid' : e.pattern,
      v => { begin(); mut(e); e.solid = v === 'solid'; e.pattern = v === 'solid' ? 'line' : v; commit(); upd(); });
    addRow(w, 'Spacing', e.sp || 100, set(v => e.sp = Math.max(v, 1e-3)));
  },
  insert(w, e, set) {
    addRow(w, 'Scale', e.sx == null ? 1 : e.sx, set(v => { e.sx = v || 1; e.sy = v || 1; }), 1);
    addRow(w, 'Rotation °', deg(e.rot || 0), set(v => e.rot = rad(v)), 1);
  },
  /* ---- architecture ---- */
  wall(w, e, set, upd) {
    selRow(w, 'Type', (DOC.wallTypes || []).map(t => [t.id, t.name]), e.wt,
      v => { begin(); mut(e); e.wt = v; e.th = null; commit('Wall type'); upd(); });
    addRow(w, 'Thickness', wallT(e), set(v => e.th = Math.max(v, 1)));
    ro(w, 'Length', fmt(wallLen(e)));
  },
  door(w, e, set, upd) {
    selRow(w, 'Type', (DOC.doorTypes || []).map(t => [t.id, t.name]), e.dt, v => {
      begin(); mut(e); e.dt = v; e.w = null; e.h = null; e.k = null;
      const host = hostOf(e); if (host) wallReclampOpenings(host);
      commit('Door type'); upd();
    });
    addRow(w, 'Width', openW(e), set(v => { e.w = Math.max(v, 50); const h = hostOf(e); if (h) wallReclampOpenings(h); }));
    btnRow(w, 'Opens to', e.flip ? 'other side' : 'this side',
      () => { begin(); mut(e); e.flip = !e.flip; commit('Flipped'); upd(); });
    btnRow(w, 'Hinge', e.hand === -1 ? 'far jamb' : 'near jamb',
      () => { begin(); mut(e); e.hand = e.hand === -1 ? 1 : -1; commit('Hinge'); upd(); });
  },
  window(w, e, set, upd) {
    selRow(w, 'Type', (DOC.winTypes || []).map(t => [t.id, t.name]), e.wtp, v => {
      begin(); mut(e); e.wtp = v; e.w = null; e.h = null; e.k = null;
      const host = hostOf(e); if (host) wallReclampOpenings(host);
      commit('Window type'); upd();
    });
    addRow(w, 'Width', openW(e), set(v => { e.w = Math.max(v, 50); const h = hostOf(e); if (h) wallReclampOpenings(h); }));
    addRow(w, 'Sill', e.sill != null ? e.sill : ((winType(e.wtp) || {}).sill || 900), set(v => e.sill = Math.max(v, 0)));
  },
  column(w, e, set) {
    addRow(w, e.shape === 'round' ? 'Diameter' : 'Width', e.w || 400, set(v => e.w = Math.max(v, 1)));
    if (e.shape !== 'round') addRow(w, 'Depth', e.d || e.w || 400, set(v => e.d = Math.max(v, 1)));
    addRow(w, 'Rotation °', deg(e.rot || 0), set(v => e.rot = rad(v)), 1);
  },
  stair(w, e, set, upd) {
    const C = stairCalc(e);
    addRow(w, 'Width', e.w || 1000, set(v => e.w = Math.max(v, 1)));
    addRow(w, 'Risers', C.risers, set(v => e.risers = clamp(Math.round(v), 2, 80)), 1);
    btnRow(w, 'Direction', e.dir === -1 ? 'down' : 'up',
      () => { begin(); mut(e); e.dir = e.dir === -1 ? 1 : -1; commit('Direction'); upd(); });
  },
  room(w, e, set, upd) {
    txtRow(w, 'Name', e.name || '', v => { begin(); mut(e); e.name = v.toUpperCase(); commit('Room'); upd(); });
    const qp = roomBoundary(e) || e.pts || [];
    ro(w, 'Area', qp.length >= 3 ? roomAreaText(e, polyArea(qp)) : 'not enclosed');
    btnRow(w, 'Show area', e.showArea === false ? 'no' : 'yes',
      () => { begin(); mut(e); e.showArea = e.showArea === false; commit(); upd(); });
  },
  grid(w, e, set, upd) {
    txtRow(w, 'Label', e.label || '', v => { begin(); mut(e); e.label = v.toUpperCase(); commit('Grid'); upd(); });
    addRow(w, 'Bubble r', e.br || DOC.textH * 2.2, set(v => e.br = Math.max(v, 1e-6)));
  },
};
QUICK.spline = QUICK.pline;

/* per-type property editors */
const PROPS = {
  line(w, e, set) {
    addRow(w, 'Start X', e.a[0], set(v => e.a[0] = v)); addRow(w, 'Start Y', e.a[1], set(v => e.a[1] = v));
    addRow(w, 'End X', e.b[0], set(v => e.b[0] = v)); addRow(w, 'End Y', e.b[1], set(v => e.b[1] = v));
    ro(w, 'Length', fmt(dist(e.a, e.b))); ro(w, 'Angle', deg(ang(e.a, e.b)).toFixed(3) + '°');
  },
  circle(w, e, set) {
    addRow(w, 'Centre X', e.c[0], set(v => e.c[0] = v)); addRow(w, 'Centre Y', e.c[1], set(v => e.c[1] = v));
    addRow(w, 'Radius', e.r, set(v => e.r = Math.max(v, 1e-9)));
    addRow(w, 'Diameter', e.r * 2, set(v => e.r = Math.max(v / 2, 1e-9)));
    ro(w, 'Circumference', fmt(TAU * e.r)); ro(w, 'Area', fmtArea(Math.PI * e.r * e.r));
  },
  arc(w, e, set) {
    addRow(w, 'Centre X', e.c[0], set(v => e.c[0] = v)); addRow(w, 'Centre Y', e.c[1], set(v => e.c[1] = v));
    addRow(w, 'Radius', e.r, set(v => e.r = Math.max(v, 1e-9)));
    addRow(w, 'Start °', deg(e.a0), set(v => e.a0 = rad(v)), 1);
    addRow(w, 'End °', deg(e.a1), set(v => e.a1 = rad(v)), 1);
    ro(w, 'Included °', deg(arcSweep(e)).toFixed(2)); ro(w, 'Length', fmt(e.r * arcSweep(e)));
  },
  ellipse(w, e, set) {
    addRow(w, 'Centre X', e.c[0], set(v => e.c[0] = v)); addRow(w, 'Centre Y', e.c[1], set(v => e.c[1] = v));
    addRow(w, 'Radius X', e.rx, set(v => e.rx = Math.max(v, 1e-9)));
    addRow(w, 'Radius Y', e.ry, set(v => e.ry = Math.max(v, 1e-9)));
    addRow(w, 'Rotation °', deg(e.rot || 0), set(v => e.rot = rad(v)), 1);
    ro(w, 'Area', fmtArea(Math.PI * e.rx * e.ry));
  },
  pline(w, e, set, upd) {
    ro(w, 'Vertices', e.pts.length);
    btnRow(w, 'Closed', e.closed ? 'yes' : 'no', () => { begin(); mut(e); e.closed = !e.closed; commit(); upd(); });
    ro(w, 'Length', fmt(polyLen(e.pts, e.closed)));
    if (e.closed) ro(w, 'Area', fmtArea(polyArea(e.pts)));
  },
  text(w, e, set, upd) {
    const r = el('div', 'row', '<label>Text</label>');
    const inp = el('input', 'f'); inp.value = e.s;
    inp.onchange = () => { begin(); mut(e); e.s = inp.value; commit(); upd(); };
    r.appendChild(inp); w.appendChild(r);
    addRow(w, 'Height', e.h, set(v => e.h = Math.max(v, 1e-6)));
    addRow(w, 'Rotation °', deg(e.rot || 0), set(v => e.rot = rad(v)), 1);
    selRow(w, 'Align', [['l', 'left'], ['c', 'centre'], ['r', 'right']], e.anchor || 'l',
      v => { begin(); mut(e); e.anchor = v; commit(); upd(); });
    addRow(w, 'X', e.p[0], set(v => e.p[0] = v)); addRow(w, 'Y', e.p[1], set(v => e.p[1] = v));
  },
  dim(w, e, set, upd) {
    ro(w, 'Kind', e.k);
    ro(w, 'Measured', dimGeom(e).txt);
    const r = el('div', 'row', '<label>Override</label>');
    const inp = el('input', 'f'); inp.value = e.txt || ''; inp.placeholder = 'automatic';
    inp.onchange = () => { begin(); mut(e); e.txt = inp.value || null; commit(); upd(); };
    r.appendChild(inp); w.appendChild(r);
    if (e.off != null) addRow(w, 'Offset', e.off, set(v => e.off = v));
  },
  point(w, e, set) { addRow(w, 'X', e.p[0], set(v => e.p[0] = v)); addRow(w, 'Y', e.p[1], set(v => e.p[1] = v)); },

  /* ---- architecture ---- */
  wall(w, e, set, upd) {
    selRow(w, 'Type', (DOC.wallTypes || []).map(t => [t.id, `${t.name} — ${fmt(t.t)}`]), e.wt,
      v => { begin(); mut(e); e.wt = v; e.th = null; commit('Wall type'); upd(); });
    addRow(w, 'Thickness', wallT(e), set(v => e.th = Math.max(v, 1)));
    selRow(w, 'Justify', [['center', 'centre'], ['left', 'left face'], ['right', 'right face']], e.just || 'center',
      v => { begin(); mut(e); e.just = v; commit('Justification'); upd(); });
    addRow(w, 'Height', e.h || ARCH.wallH, set(v => e.h = Math.max(v, 1)));
    btnRow(w, 'Poche', e.hatch === false ? 'off' : (e.hatch === true ? 'on' : 'follows drawing'), () => {
      begin(); mut(e);
      e.hatch = e.hatch === true ? false : (e.hatch === false ? null : true);
      commit('Wall poche'); upd();
    });
    w.appendChild(el('div', 'grp', 'Centreline'));
    addRow(w, 'Start X', e.a[0], set(v => e.a[0] = v)); addRow(w, 'Start Y', e.a[1], set(v => e.a[1] = v));
    addRow(w, 'End X', e.b[0], set(v => e.b[0] = v)); addRow(w, 'End Y', e.b[1], set(v => e.b[1] = v));
    ro(w, 'Length', fmt(wallLen(e)));
    ro(w, 'Angle', deg(ang(e.a, e.b)).toFixed(2) + '°');
    ro(w, 'Area (plan)', fmtArea(polyArea(wallOutline(e))));
    ro(w, 'Elevation area', fmtArea(wallLen(e) * (e.h || ARCH.wallH)));
    const ops = openingsByHost().get(e.id) || [];
    ro(w, 'Openings', ops.length);
    if (ops.length) btnRow(w, '', 'Select openings', () => { SEL.clear(); ops.forEach(o => SEL.add(o.id)); syncUI(); draw(); });
    btnRow(w, '', 'Flip justification', () => {
      begin(); mut(e);
      e.just = e.just === 'left' ? 'right' : e.just === 'right' ? 'left' : 'center';
      commit('Flipped'); upd();
    });
  },
  door(w, e, set, upd) { openingProps(w, e, set, upd, 'door'); },
  window(w, e, set, upd) { openingProps(w, e, set, upd, 'window'); },
  column(w, e, set, upd) {
    selRow(w, 'Shape', [['rect', 'rectangular'], ['round', 'round']], e.shape || 'rect',
      v => { begin(); mut(e); e.shape = v; commit(); upd(); });
    addRow(w, e.shape === 'round' ? 'Diameter' : 'Width', e.w || 400, set(v => e.w = Math.max(v, 1)));
    if (e.shape !== 'round') addRow(w, 'Depth', e.d || e.w || 400, set(v => e.d = Math.max(v, 1)));
    addRow(w, 'Rotation °', deg(e.rot || 0), set(v => e.rot = rad(v)), 1);
    addRow(w, 'X', e.p[0], set(v => e.p[0] = v)); addRow(w, 'Y', e.p[1], set(v => e.p[1] = v));
    ro(w, 'Area', fmtArea(entArea(e)));
  },
  stair(w, e, set, upd) {
    const C = stairCalc(e);
    selRow(w, 'Shape', [['straight', 'straight flight'], ['L', 'L with landing'], ['U', 'U with landing']],
      e.kind || 'straight', v => { begin(); mut(e); e.kind = v; commit('Stair shape'); upd(); });
    addRow(w, 'Width', e.w || 1000, set(v => e.w = Math.max(v, 1)));
    addRow(w, 'Risers', C.risers, set(v => e.risers = clamp(Math.round(v), 2, 80)), 1);
    if ((e.kind || 'straight') !== 'straight') {
      addRow(w, 'Risers before', C.r1, set(v => e.risers1 = clamp(Math.round(v), 1, (e.risers || C.risers) - 1)), 1);
      ro(w, 'Risers after', C.r2);
      addRow(w, 'Landing depth', C.land, set(v => e.landing = Math.max(v, 1)));
      selRow(w, 'Turn', [[1, 'left'], [-1, 'right']], e.turn === -1 ? -1 : 1,
        v => { begin(); mut(e); e.turn = +v; commit('Turn'); upd(); });
    }
    ro(w, 'Treads', C.treads);
    addRow(w, 'Going', C.tread, set(v => e.tread = Math.max(v, 1)));
    addRow(w, 'Riser height', e.rise || C.rise, set(v => e.rise = Math.max(v, 1)));
    ro(w, 'Total rise', fmt((e.rise || C.rise) * C.risers));
    const ratio = 2 * (e.rise || C.rise) + C.tread;
    ro(w, '2R+G', fmt(ratio) + (ratio >= 550 && ratio <= 700 ? '  ✓' : '  ⚠'));
    selRow(w, 'Direction', [[1, 'up along the arrow'], [-1, 'down along the arrow']], e.dir === -1 ? -1 : 1,
      v => { begin(); mut(e); e.dir = +v; commit(); upd(); });
    btnRow(w, 'Break line', e.cut === false ? 'hidden' : 'shown',
      () => { begin(); mut(e); e.cut = e.cut === false; commit(); upd(); });
  },
  room(w, e, set, upd) {
    const r = el('div', 'row', '<label>Name</label>');
    const inp = el('input', 'f'); inp.value = e.name || '';
    inp.onchange = () => { begin(); mut(e); e.name = inp.value.toUpperCase(); commit(); upd(); };
    r.appendChild(inp); w.appendChild(r);
    const pts = roomBoundary(e) || e.pts || [];
    const a = polyArea(pts);
    ro(w, 'Area', roomAreaText(e, a));
    const alt = roomAltText(e, a); if (alt) ro(w, 'Also', alt);
    ro(w, 'Perimeter', fmt(polyLen(pts, true)));
    ro(w, 'Corners', pts.length);
    ro(w, 'Boundary', e.auto ? 'follows the walls' : 'drawn by hand');
    if (e.auto) btnRow(w, '', 'Detach from walls',
      () => { begin(); mut(e); e.auto = false; e.pts = (roomBoundary(e) || e.pts).map(q => q.slice()); commit('Detached'); upd(); });
    else if (e.seed) btnRow(w, '', 'Re-attach to walls',
      () => { begin(); mut(e); e.auto = true; commit('Re-attached'); upd(); });
    selRow(w, 'Area units', [['auto', 'follow the drawing'], ['m2', 'm²'], ['sqcm', 'cm²'], ['sqmm', 'mm²'], ['ft2', 'ft²'], ['in2', 'in²']],
      e.areaUnits || 'auto', v => { begin(); mut(e); e.areaUnits = v; commit('Area units'); upd(); });
    selRow(w, 'Also show', [['none', 'none'], ['m2', 'm²'], ['ft2', 'ft²'], ['sqcm', 'cm²'], ['in2', 'in²']],
      e.altUnits || 'none', v => { begin(); mut(e); e.altUnits = v === 'none' ? null : v; commit('Alternate area'); upd(); });
    addRow(w, 'Tag height', e.h || DOC.textH, set(v => e.h = Math.max(v, 1e-6)));
    btnRow(w, 'Show area', e.showArea === false ? 'no' : 'yes',
      () => { begin(); mut(e); e.showArea = e.showArea === false; commit(); upd(); });
  },
  grid(w, e, set, upd) {
    const r = el('div', 'row', '<label>Label</label>');
    const inp = el('input', 'f'); inp.value = e.label || '';
    inp.onchange = () => { begin(); mut(e); e.label = inp.value.toUpperCase(); commit(); upd(); };
    r.appendChild(inp); w.appendChild(r);
    addRow(w, 'Bubble r', e.br || DOC.textH * 2.2, set(v => e.br = Math.max(v, 1e-6)));
    ro(w, 'Length', fmt(dist(e.a, e.b)));
    btnRow(w, 'Start bubble', e.bubbleA === false ? 'off' : 'on', () => { begin(); mut(e); e.bubbleA = e.bubbleA === false; commit(); upd(); });
    btnRow(w, 'End bubble', e.bubbleB === false ? 'off' : 'on', () => { begin(); mut(e); e.bubbleB = e.bubbleB === false; commit(); upd(); });
  },
  hatch(w, e, set, upd) {
    selRow(w, 'Pattern', [['line', 'diagonal'], ['cross', 'cross'], ['solid', 'solid']], e.solid ? 'solid' : e.pattern,
      v => { begin(); mut(e); e.solid = v === 'solid'; e.pattern = v === 'solid' ? 'line' : v; commit(); upd(); });
    addRow(w, 'Spacing', e.sp || 100, set(v => e.sp = Math.max(v, 1e-3)));
    addRow(w, 'Angle °', e.hatchAng || 0, set(v => e.hatchAng = v), 1);
    ro(w, 'Area', fmtArea(entArea(e)));
  },
  insert(w, e, set, upd) {
    ro(w, 'Block', e.name);
    addRow(w, 'X', e.p[0], set(v => e.p[0] = v)); addRow(w, 'Y', e.p[1], set(v => e.p[1] = v));
    addRow(w, 'Scale X', e.sx == null ? 1 : e.sx, set(v => e.sx = v || 1), 1);
    addRow(w, 'Scale Y', e.sy == null ? 1 : e.sy, set(v => e.sy = v || 1), 1);
    addRow(w, 'Rotation °', deg(e.rot || 0), set(v => e.rot = rad(v)), 1);
  },
};
PROPS.spline = PROPS.pline;
function openingProps(w, e, set, upd, kind) {
  const host = hostOf(e);
  const lib = kind === 'door' ? DOC.doorTypes : DOC.winTypes;
  const key = kind === 'door' ? 'dt' : 'wtp';
  selRow(w, 'Type', lib.map(t => [t.id, t.name]), e[key], v => {
    begin(); mut(e); e[key] = v; e.w = null; e.h = null; e.k = null;
    if (host) wallReclampOpenings(host);
    commit('Type'); upd();
  });
  addRow(w, 'Width', openW(e), set(v => { e.w = Math.max(v, 50); if (host) wallReclampOpenings(host); }));
  addRow(w, 'Height', openH(e), set(v => e.h = Math.max(v, 50)));
  if (kind === 'window') {
    const T = winType(e.wtp) || {};
    addRow(w, 'Sill height', e.sill != null ? e.sill : (T.sill || 900), set(v => e.sill = Math.max(v, 0)));
  }
  addRow(w, 'Position on wall', e.pos, set(v => {
    const L = host ? wallLen(host) : v;
    e.pos = clamp(v, openW(e) / 2, Math.max(openW(e) / 2, L - openW(e) / 2));
  }));
  if (host) {
    ro(w, 'Wall', '#' + host.id + ' · ' + fmt(wallLen(host)));
    ro(w, 'From far end', fmt(Math.max(wallLen(host) - e.pos, 0)));
    btnRow(w, '', 'Select the wall', () => { SEL.clear(); SEL.add(host.id); syncUI(); draw(); });
  } else ro(w, 'Wall', 'missing');
  if (kind === 'door') {
    selRow(w, 'Leaf', [['single', 'single'], ['double', 'double'], ['slide', 'sliding'], ['pocket', 'pocket'], ['bifold', 'bifold'], ['opening', 'opening only']],
      e.k || (doorType(e.dt) || {}).k || 'single', v => { begin(); mut(e); e.k = v; commit(); upd(); });
    addRow(w, 'Swing °', e.swing == null ? 90 : e.swing, set(v => e.swing = clamp(v, 5, 180)), 1);
    btnRow(w, 'Flip facing', e.flip ? 'other side' : 'this side',
      () => { begin(); flipFacing(e); commit('Flip facing'); upd(); });
    if (flipHandApplies(e)) btnRow(w, 'Flip hand', e.hand === -1 ? 'far jamb' : 'near jamb',
      () => { begin(); flipHand(e); commit('Flip hand'); upd(); });
    btnRow(w, 'Flip both', 'mirror the door', () => { begin(); flipBoth(e); commit('Flip'); upd(); });
  } else {
    selRow(w, 'Style', [['casement', 'casement'], ['fixed', 'fixed'], ['sliding', 'sliding'], ['bay', 'bay']],
      e.k || (winType(e.wtp) || {}).k || 'casement', v => { begin(); mut(e); e.k = v; commit(); upd(); });
  }
}

/* ---------- component library manager ---------- */
function openTypeManager() {
  const rows = (list, cols) => list.map((t, i) =>
    `<tr data-i="${i}">${cols.map(c => `<td><input class="tf" data-k="${c[0]}" value="${esc(t[c[0]] == null ? '' : (c[2] ? +(t[c[0]] / U[DOC.units]).toFixed(4) : t[c[0]]))}"></td>`).join('')}
      <td><button class="tdel" data-i="${i}">×</button></td></tr>`).join('');
  const wallCols = [['name', 'Name'], ['t', 'Thickness', 1]];
  const doorCols = [['name', 'Name'], ['w', 'Width', 1], ['h', 'Height', 1]];
  const winCols = [['name', 'Name'], ['w', 'Width', 1], ['h', 'Height', 1], ['sill', 'Sill', 1]];
  modal(`<h3>Component library</h3>
    <p>Sizes are in ${DOC.units}. These travel with the drawing.</p>
    <style>
      .tabs{display:flex;gap:4px;margin-bottom:10px}
      .tab{padding:5px 10px;border-radius:5px;background:var(--bg2);font-size:12px}
      .tab.on{background:var(--amber);color:#141821}
      table{width:100%;border-collapse:collapse;font-size:11.5px}
      td{padding:2px}
      .tf{width:100%;background:var(--bg2);border:1px solid var(--bd);border-radius:4px;padding:3px 5px;font-family:var(--mono);font-size:11px}
      .tdel{color:var(--rose);padding:0 5px}
      th{text-align:left;font-size:9.5px;letter-spacing:.12em;color:var(--tx2);text-transform:uppercase;padding:4px 2px}
    </style>
    <div class="tabs"><button class="tab on" data-t="wall">Walls</button><button class="tab" data-t="door">Doors</button><button class="tab" data-t="win">Windows</button></div>
    <div id="tmbody"></div>
    <div class="acts" style="justify-content:flex-start;margin-top:10px"><button class="btn" id="tmadd">Add a row</button></div>`, () => {
    saveTypeTable();
    syncUI(); draw();
  });
  let cur = 'wall';
  const conf = {
    wall: { list: () => DOC.wallTypes, cols: wallCols, blank: () => ({ id: 'w' + Date.now().toString(36), name: 'New wall', t: 100 }) },
    door: { list: () => DOC.doorTypes, cols: doorCols, blank: () => ({ id: 'd' + Date.now().toString(36), name: 'New door', w: 900, h: 2100, k: 'single' }) },
    win: { list: () => DOC.winTypes, cols: winCols, blank: () => ({ id: 'n' + Date.now().toString(36), name: 'New window', w: 1200, h: 1200, sill: 900, k: 'casement' }) },
  };
  function render() {
    const c = conf[cur];
    clearNode($('#tmbody')).innerHTML = `<table><thead><tr>${c.cols.map(x => `<th>${x[1]}</th>`).join('')}<th></th></tr></thead>
      <tbody>${rows(c.list(), c.cols)}</tbody></table>`;
    document.querySelectorAll('.tdel').forEach(b => b.onclick = () => {
      saveTypeTable();
      const list = conf[cur].list();
      if (list.length > 1) list.splice(+b.dataset.i, 1);
      render();
    });
  }
  /* A function declaration, not a property hung on `window`: the dialog's own
     save step is nobody else's business, and leaving it on the global object
     meant every open of this dialog overwrote the last one's closure. */
  function saveTypeTable() {
    const c = conf[cur], list = c.list();
    document.querySelectorAll('#tmbody tbody tr').forEach(tr => {
      const t = list[+tr.dataset.i]; if (!t) return;
      tr.querySelectorAll('.tf').forEach(inp => {
        const k = inp.dataset.k;
        const spec = c.cols.find(x => x[0] === k);
        if (spec && spec[2]) { const v = parseLen(inp.value); if (!isNaN(v)) t[k] = v; }
        else t[k] = inp.value;
      });
    });
  }
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
    saveTypeTable();
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); cur = b.dataset.t; render();
  });
  $('#tmadd').onclick = () => { saveTypeTable(); conf[cur].list().push(conf[cur].blank()); render(); };
  render();
}

/* ---------- colour picker ---------- */
const SWATCH = ['#d7dee8', '#ffffff', '#ff5f5f', '#ffd166', '#4ee6a8', '#6ba8ff', '#c792ea', '#ff9f43',
  '#8d9aab', '#5c6878', '#e0e0e0', '#2ec4b6', '#e71d36', '#3d5a80', '#98c1d9', '#0f0f0f'];
function pickColor(cur, cb, allowByLayer) {
  const sw = SWATCH.map(c => `<button class="sw2" data-c="${c}" style="background:${c}"></button>`).join('');
  modal(`<h3>Colour</h3>
    <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px;margin-bottom:12px">${sw}</div>
    <style>.sw2{height:26px;border-radius:5px;border:1px solid #0006}.sw2:hover{outline:2px solid var(--amber)}</style>
    <div class="row"><label>Hex</label><input class="f" id="hx" value="${cur}"></div>
    ${allowByLayer ? '<div class="acts" style="margin-top:10px"><button class="btn" id="bylay">Set ByLayer</button></div>' : ''}`,
    () => { const v = $('#hx').value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) cb(v); });
  document.querySelectorAll('.sw2').forEach(b => b.onclick = () => { closeModal(); cb(b.dataset.c); });
  const bl = $('#bylay'); if (bl) bl.onclick = () => { closeModal(); cb(null); };
}

/* ---------- modal ---------- */
let _ok = null;
/* opts: { okLabel, cancelLabel, onCancel }. A dialog that asks a real question
   needs to name its answers — "Apply / Cancel" is meaningless when the choice
   is between recovering a drawing and throwing it away. */
function modal(html, ok, opts) {
  const o = opts || {};
  clearNode($('#card')).innerHTML = html + `<div class="acts"><button class="btn" id="mc">` +
    esc(o.cancelLabel || 'Cancel') + `</button><button class="btn pri" id="mo">` +
    esc(o.okLabel || 'Apply') + `</button></div>`;
  $('#modal').classList.add('show'); _ok = ok;
  $('#mc').onclick = () => { const f = o.onCancel; closeModal(); if (f) f(); };
  $('#mo').onclick = () => { const f = _ok; closeModal(); if (f) f(); };
  const first = $('#card input,#card textarea,#card select');
  if (first && first.tagName !== 'SELECT') { first.focus(); if (first.select) first.select(); }
}
function closeModal() { $('#modal').classList.remove('show'); _ok = null; }

function openArray() {
  if (!SEL.size) return toast('Select objects first');
  const src = selEnts().map(clone);
  modal(`<h3>Array</h3><p>Repeat the selection in a grid, around a point, or along a path.</p>
    <div class="row"><label>Type</label><select class="f" id="at">
      <option value="rect">Rectangular</option><option value="polar">Polar</option><option value="path">Along a path</option></select></div>
    <div id="arect">
      <div class="row"><label>Columns</label><input class="f" id="ac" value="3"></div>
      <div class="row"><label>Col spacing</label><input class="f" id="acs" value="${+(1000 / U[DOC.units]).toFixed(3)}"></div>
      <div class="row"><label>Rows</label><input class="f" id="ar" value="1"></div>
      <div class="row"><label>Row spacing</label><input class="f" id="ars" value="${+(1000 / U[DOC.units]).toFixed(3)}"></div>
      <div class="row"><label>Angle °</label><input class="f" id="aang" value="0"></div>
    </div>
    <div id="apol" style="display:none">
      <div class="row"><label>Count</label><input class="f" id="an" value="6"></div>
      <div class="row"><label>Total angle</label><input class="f" id="aa" value="360"></div>
      <div class="row"><label>Rotate items</label><select class="f" id="arot"><option value="1">yes</option><option value="0">no</option></select></div>
      <p style="margin:8px 0 0;font-size:11px">Centre is the middle of the selection.</p>
    </div>
    <div id="apath" style="display:none">
      <div class="row"><label>Count</label><input class="f" id="pn" value="8"></div>
      <div class="row"><label>Align to path</label><select class="f" id="pal"><option value="1">yes</option><option value="0">no</option></select></div>
      <p style="margin:8px 0 0;font-size:11px">Select the objects <b>and</b> one open path. The path is used, not copied.</p>
    </div>`, () => {
    const t = $('#at').value;
    begin();
    if (t === 'rect') arrayRect(src);
    else if (t === 'polar') arrayPolar(src);
    else arrayPath(src);
    commit('Array'); draw(); syncUI();
  });
  $('#at').onchange = () => {
    const v = $('#at').value;
    $('#arect').style.display = v === 'rect' ? '' : 'none';
    $('#apol').style.display = v === 'polar' ? '' : 'none';
    $('#apath').style.display = v === 'path' ? '' : 'none';
  };
}
function arrayRect(src) {
  const cN = clamp(parseInt($('#ac').value) || 1, 1, 500), rN = clamp(parseInt($('#ar').value) || 1, 1, 500);
  const cs = parseLen($('#acs').value) || 0, rs = parseLen($('#ars').value) || 0;
  const a = rad(parseFloat($('#aang').value) || 0);
  const ux = [Math.cos(a), Math.sin(a)], uy = perp(ux);
  for (let i = 0; i < cN; i++) for (let j = 0; j < rN; j++) {
    if (!i && !j) continue;
    const d = add(mul(ux, i * cs), mul(uy, j * rs));
    src.forEach(e => { const n = clone(e); delete n.id; addEnt(xf(n, T.move(d))); });
  }
}
function arrayPolar(src) {
  const n = clamp(parseInt($('#an').value) || 2, 2, 720), tot = rad(parseFloat($('#aa').value) || 360);
  const rotIt = $('#arot').value === '1';
  const b = bboxAll(src), c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const full = Math.abs(deg(tot) - 360) < .01;
  for (let i = 1; i < n; i++) {
    const a = tot * i / (full ? n : n - 1);
    src.forEach(e => {
      const q = clone(e); delete q.id;
      if (rotIt) xf(q, T.rot(c, a));
      else { const g = bboxAll([q]); const cc = [(g[0] + g[2]) / 2, (g[1] + g[3]) / 2]; xf(q, T.move(sub(rot(cc, c, a), cc))); }
      addEnt(q);
    });
  }
}
function arrayPath(src) {
  const path = selEnts().find(e => e.t === 'line' || e.t === 'pline' || e.t === 'arc' || e.t === 'spline' || e.t === 'circle');
  if (!path) return toast('Include a path object in the selection');
  const items = src.filter(e => e.id !== path.id);
  if (!items.length) return toast('Select something to repeat as well');
  const n = clamp(parseInt($('#pn').value) || 2, 2, 500);
  const align = $('#pal').value === '1';
  const b = bboxAll(items), c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const a0 = align ? Math.atan2(tanAt(path, 0)[1], tanAt(path, 0)[0]) : 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const p = ptAt(path, t);
    if (i === 0) continue;
    const ta = align ? Math.atan2(tanAt(path, t)[1], tanAt(path, t)[0]) : 0;
    items.forEach(e => {
      const q = clone(e); delete q.id;
      if (align) xf(q, T.rot(c, ta - a0));
      addEnt(xf(q, T.move(sub(p, c))));
    });
  }
}


/* ============================================================
   Object snap cursor menu (Shift + right-click, as in AutoCAD)
   ------------------------------------------------------------
   This menu is NOT the running-snap switchboard — that is the Drafting
   Settings dialog below. Picking a mode here is a one-shot override that
   applies to the next point and then gets out of the way, which is what
   AutoCAD's object snap cursor menu does.
   ============================================================ */
let SNAPMENU = null;
function hideSnapMenu() { if (SNAPMENU) { SNAPMENU.remove(); SNAPMENU = null; } }
/** render one AutoSnap glyph into a data URL, using the renderer's own glyph
    table so the menu and the dialog can never drift from what is drawn */
function snapGlyphURL(kind, size, colour) {
  if (typeof SNAP_GLYPH !== 'function' && typeof SNAP_GLYPH !== 'object') return '';
  const g = SNAP_GLYPH[kind] || SNAP_GLYPH.near;
  if (!g) return '';
  let c;
  try { c = document.createElement('canvas'); } catch (e) { return ''; }
  if (typeof c.toDataURL !== 'function') return '';
  const s = size || 20;
  c.width = s; c.height = s;
  const g2 = c.getContext('2d');
  const old = ctx;
  try {
    ctx = g2;
    g2.strokeStyle = colour || '#4ee6a8';
    g2.lineWidth = 1.3; g2.lineCap = 'butt'; g2.lineJoin = 'miter';
    g((s / 2) + .5, (s / 2) + .5, Math.round(s * 0.28));
  } catch (e) { return ''; } finally { ctx = old; }
  try { return c.toDataURL(); } catch (e) { return ''; }
}
function snapGlyphImg(kind) {
  const u = snapGlyphURL(kind, 20);
  return u ? `<img class="smg" src="${u}" alt="">` : '<span class="smg"></span>';
}
function showSnapMenu(sx, sy) {
  hideSnapMenu();
  if (typeof snapMenuItems !== 'function') return;
  const row = (k, label) =>
    `<button class="smi" data-k="${esc(k)}">${snapGlyphImg(k)}<span class="smt">${esc(label)}</span></button>`;
  const rows = snapMenuItems().map(it => row(it.kind, it.label)).join('');
  SNAPMENU = el('div', 'snapmenu',
    `<button class="smi" data-m="tt"><span class="smg"></span><span class="smt">Temporary track point</span></button>
     <button class="smi" data-m="from"><span class="smg"></span><span class="smt">From</span></button>
     <button class="smi" data-m="m2p"><span class="smg"></span><span class="smt">Mid between 2 points</span></button>
     <div class="smsep"></div>
     <div class="smh">Object snap — next point only</div>${rows}
     <button class="smi" data-k="none"><span class="smg"></span><span class="smt">None</span></button>
     <div class="smsep"></div>
     <button class="smi" data-s="1"><span class="smg"></span><span class="smt">Object snap settings…</span></button>`);
  document.body.appendChild(SNAPMENU);
  const H = (window.innerHeight || 800), W = (window.innerWidth || 1200);
  SNAPMENU.style.left = Math.max(4, Math.min(sx, W - 232)) + 'px';
  SNAPMENU.style.top = Math.max(4, Math.min(sy, H - 470)) + 'px';
  SNAPMENU.querySelectorAll('.smi').forEach(b => {
    b.onclick = ev => {
      ev.stopPropagation();
      const d = b.dataset;
      hideSnapMenu();
      if (d.s) { openOsnapSettings(); return; }
      if (d.m) { startPtMod(d.m); draw(); return; }
      setSnapOverride(d.k, true);
      echo(d.k === 'none' ? 'No snap for the next point' : snapKindLabel(d.k).toUpperCase());
      draw();
    };
  });
}
/* ============================================================
   SELECTION CYCLING LIST
   ------------------------------------------------------------
   When several objects share the pick box, AutoCAD offers a small list at
   the cursor: hovering a row pre-highlights that object in the drawing, and
   clicking one takes it. The canvas badge (05-view) is the signal that the
   list is available; this is the list itself.
   ============================================================ */
let CYCLEUI = null;
function hideCycleList() { if (CYCLEUI) { CYCLEUI.remove(); CYCLEUI = null; } }
function showCycleList(scr, cands, remove) {
  hideCycleList();
  if (!cands || cands.length < 2) return null;
  const hud = $('#hud'); if (!hud) return null;
  const c = el('div', 'cyclelist');
  c.appendChild(el('div', 'clh', 'Selection cycling'));
  for (const e of cands) {
    const b = el('button', 'cli', `<span>${esc(niceName(e))}</span><i>#${e.id}</i>`);
    b.dataset.id = String(e.id);
    /* hovering a row is a preview, not a commitment */
    const over = () => { ST.hot = e.id; draw(); };
    b.onmouseenter = over;
    b.addEventListener('pointerenter', over);
    b.onclick = ev => {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      hideCycleList();
      const n = selApply([e.id], !!remove);
      ST.hot = null; ST.cycleList = null;
      syncUI(); draw();
      if (typeof CMD !== 'undefined' && CMD && CMD.phase === 'sel') echo(n + ' found, ' + SEL.size + ' total');
    };
    c.appendChild(b);
  }
  /* the canvas listens on pointerdown, so the list has to swallow its own
     events or the click would land on the drawing and dismiss the list */
  if (c.addEventListener)
    ['pointerdown', 'pointerup', 'pointermove', 'dblclick', 'wheel'].forEach(t =>
      c.addEventListener(t, ev => { if (ev.stopPropagation) ev.stopPropagation(); }));
  hud.appendChild(c); CYCLEUI = c;
  const vw = V.w || 1200, vh = V.h || 800;
  const h = 22 + cands.length * 21;
  c.style.left = clamp((scr ? scr[0] : 0) + 16, 6, Math.max(6, vw - 186)) + 'px';
  c.style.top = clamp((scr ? scr[1] : 0) + 8, 6, Math.max(6, vh - h - 6)) + 'px';
  return c;
}

/* ============================================================
   MULTIFUNCTIONAL GRIP MENU
   Hover a grip that has more than one job and its alternatives appear.
   Ctrl steps them without the menu; clicking one arms it for the next drag.
   ============================================================ */
let GRIPMENU = null, GRIPMENUKEY = null;
function hideGripMenu() { if (GRIPMENU) { GRIPMENU.remove(); GRIPMENU = null; GRIPMENUKEY = null; } }
/** rebuild or reposition the menu to match ST.gripMenu */
function syncGripMenu() {
  const m = typeof ST !== 'undefined' ? ST.gripMenu : null;
  if (!m || (typeof CMD !== 'undefined' && CMD && CMD.phase === 'run')) { hideGripMenu(); return null; }
  const hud = $('#hud'); if (!hud) return null;
  const key = m.id + '/' + m.k;
  if (GRIPMENUKEY !== key) {
    hideGripMenu();
    const c = el('div', 'gripmenu');
    m.items.forEach((it, i) => {
      const b = el('button', 'gmi', esc(it.label));
      b.dataset.act = it.id;
      b.onclick = ev => {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        m.idx = i;
        const g = { id: m.id, k: m.k, p: m.p.slice() };
        ST.gripMenu = m;
        gripClick(g, false);
      };
      c.appendChild(b);
    });
    if (c.addEventListener)
      ['pointerdown', 'pointerup', 'pointermove', 'wheel'].forEach(t =>
        c.addEventListener(t, ev => { if (ev.stopPropagation) ev.stopPropagation(); }));
    hud.appendChild(c); GRIPMENU = c; GRIPMENUKEY = key;
  }
  const rows = GRIPMENU.children;
  for (let i = 0; i < rows.length; i++) rows[i].classList.toggle('on', i === m.idx);
  const s = w2s(m.p);
  const vw = V.w || 1200, vh = V.h || 800;
  GRIPMENU.style.left = clamp(s[0] + 12, 6, Math.max(6, vw - 146)) + 'px';
  GRIPMENU.style.top = clamp(s[1] + 12, 6, Math.max(6, vh - 24 - m.items.length * 21)) + 'px';
  return GRIPMENU;
}

/* ============================================================
   Drafting settings — snap and grid, polar tracking, object snap.
   One dialog, the three tabs AutoCAD's DSETTINGS has, because they are the
   three halves of the same decision and splitting them makes users hunt.
   ============================================================ */
const POLAR_PRESETS = [90, 45, 30, 22.5, 18, 15, 10, 5];
function openOsnapSettings(tab) {
  /* edited on a working copy: Cancel has to mean cancel */
  const W = {
    on: Object.assign({}, ST.osnapOn),
    osnap: !!ST.osnap, polar: !!ST.polar, ortho: !!ST.ortho, otrack: !!ST.otrack,
    snapgrid: !!ST.snapgrid, grid: !!ST.grid,
    polarInc: +ST.polarInc || 45,
    extra: (ST.polarExtra || []).slice(),
    polarRel: !!ST.polarRel, trackPolar: ST.trackPolar !== false,
    aperture: clamp(+ST.aperture || 10, 1, 50),
    markerSize: clamp(+ST.markerSize || 6, 2, 20),
    apBox: !!ST.apBox,
    gridStep: DOC.gridStep, snapStep: DOC.snapStep,
  };
  const tabs = ['Snap and grid', 'Polar tracking', 'Object snap'];
  let cur = tab == null ? 2 : tab;

  modal(`<h3>Drafting settings</h3>
    <div class="dstabs" id="dsTabs">${tabs.map((t, i) =>
    `<button class="dstab${i === cur ? ' on' : ''}" data-i="${i}">${esc(t)}</button>`).join('')}</div>
    <div id="dsBody"></div>`, () => {
    Object.assign(ST.osnapOn, W.on);
    ST.osnap = W.osnap; ST.otrack = W.otrack; ST.snapgrid = W.snapgrid; ST.grid = W.grid;
    /* ortho and polar are mutually exclusive, so route them through the one
       place that knows it */
    if (W.polar !== ST.polar) draftToggle('polar', W.polar);
    if (W.ortho !== ST.ortho) draftToggle('ortho', W.ortho);
    ST.polarInc = clamp(W.polarInc, 0.1, 180);
    ST.polarExtra = W.extra.slice();
    ST.polarRel = W.polarRel; ST.trackPolar = W.trackPolar;
    ST.aperture = W.aperture; ST.markerSize = W.markerSize; ST.apBox = W.apBox;
    DOC.gridStep = Math.max(W.gridStep, 1e-6); DOC.snapStep = Math.max(W.snapStep, 1e-6);
    buildDrawSettings(); syncToggles(); draw();
  });
  $('#mo').textContent = 'OK';

  const body = () => {
    const b = $('#dsBody'); if (!b) return;
    clearNode(b);
    if (cur === 0) buildSnapGridTab(b, W);
    else if (cur === 1) buildPolarTab(b, W, body);
    else buildOsnapTab(b, W, body);
  };
  const tb = $('#dsTabs');
  if (tb) tb.querySelectorAll('.dstab').forEach(t => {
    t.onclick = () => {
      cur = +t.dataset.i;
      tb.querySelectorAll('.dstab').forEach(x => x.classList.toggle('on', +x.dataset.i === cur));
      body();
    };
  });
  body();
}
function chk(w, label, val, on, hintText) {
  const r = el('label', 'osr');
  const i = el('input'); i.type = 'checkbox'; i.checked = !!val;
  i.onchange = () => on(!!i.checked);
  const s = el('span', '', esc(label));
  if (hintText) r.title = hintText;
  r.append(i, s); w.appendChild(r); return i;
}
function buildSnapGridTab(w, W) {
  grpRow(w, 'Snap');
  chk(w, 'Snap on (F9)', W.snapgrid, v => W.snapgrid = v);
  addRow(w, 'Snap step', W.snapStep, v => W.snapStep = v);
  grpRow(w, 'Grid');
  chk(w, 'Grid on (F7)', W.grid, v => W.grid = v);
  addRow(w, 'Grid step', W.gridStep, v => W.gridStep = v);
  grpRow(w, 'Cursor');
  addRow(w, 'Crosshair %', ST.crossLen == null ? 100 : ST.crossLen,
    v => { ST.crossLen = clamp(v, 1, 100); draw(); }, 1);
  addRow(w, 'Pick box px', ST.pickBox || 8,
    v => { ST.pickBox = clamp(Math.round(v), 2, 40); draw(); }, 1);
}
function buildPolarTab(w, W, redraw) {
  grpRow(w, 'Polar tracking');
  chk(w, 'Polar tracking on (F10)', W.polar, v => { W.polar = v; if (v) W.ortho = false; });
  chk(w, 'Ortho on (F8)', W.ortho, v => { W.ortho = v; if (v) W.polar = false; });
  w.appendChild(el('div', 'grp', 'Increment angle'));
  const g = el('div', 'pang');
  for (const a of POLAR_PRESETS) {
    const b = el('button', 'pangb' + (Math.abs(W.polarInc - a) < 1e-9 ? ' on' : ''), a + '°');
    b.onclick = () => { W.polarInc = a; redraw(); };
    g.appendChild(b);
  }
  w.appendChild(g);
  addRow(w, 'Custom °', W.polarInc, v => { W.polarInc = clamp(v, 0.1, 180); redraw(); }, 1);
  w.appendChild(el('div', 'grp', 'Additional angles'));
  const x = el('div', 'pang');
  for (const a of W.extra) {
    const b = el('button', 'pangb on', a + '° ×');
    b.title = 'Remove this angle';
    b.onclick = () => { W.extra = W.extra.filter(v => v !== a); redraw(); };
    x.appendChild(b);
  }
  if (!W.extra.length) x.appendChild(el('span', 'pnone', 'none'));
  w.appendChild(x);
  const add = txtRow(w, 'Add angle °', '', v => {
    const n = parseFloat(v);
    if (isFinite(n) && !W.extra.some(q => Math.abs(q - n) < 1e-9)) { W.extra.push(((n % 360) + 360) % 360); W.extra.sort((a, b) => a - b); }
    redraw();
  });
  if (add) add.placeholder = 'e.g. 33.75';
  chk(w, 'Measure angles from the last segment', W.polarRel,
    v => W.polarRel = v, 'Relative to last segment, rather than absolute from 0°');
  grpRow(w, 'Object snap tracking');
  chk(w, 'Object snap tracking on (F11)', W.otrack, v => W.otrack = v);
  chk(w, 'Track using all polar angles', W.trackPolar,
    v => W.trackPolar = v, 'Off: tracking paths run orthogonally only');
}
function buildOsnapTab(w, W, redraw) {
  const head = el('div', 'oshead');
  head.appendChild(el('span', 'grp2', 'Object snap modes'));
  const all = el('button', 'lnk', 'Select all');
  all.onclick = () => { for (const s of SNAP_KINDS) W.on[s.k] = 1; redraw(); };
  const none = el('button', 'lnk', 'Clear all');
  none.onclick = () => { for (const s of SNAP_KINDS) W.on[s.k] = 0; redraw(); };
  head.append(all, none);
  w.appendChild(head);
  chk(w, 'Object snap on (F3)', W.osnap, v => W.osnap = v);
  /* The grid is appended BEFORE it is filled, and each row is built inside its
     own try. Sixteen checkboxes are the whole point of this tab; a glyph that
     will not draw — a canvas the browser refuses to read back, a renderer that
     is not there yet — must cost that row its picture, never the tab its list.
     A throw here left the master toggle and Select all sitting over nothing. */
  const grid = el('div', 'osgrid');
  w.appendChild(grid);
  for (const s of SNAP_KINDS) {
    const r = el('label', 'osr' + (s.bit > 65535 ? ' ext' : ''));
    r.title = s.bit > 65535 ? s.label + ' — an Orthograph mode, no AutoCAD equivalent' : s.label;
    const i = el('input'); i.type = 'checkbox'; i.checked = !!W.on[s.k];
    i.onchange = () => { W.on[s.k] = i.checked ? 1 : 0; };
    let u = ''; try { u = snapGlyphURL(s.k, 20); } catch (err) { u = ''; }
    const ic = u ? el('img', 'smg') : el('span', 'smg');
    if (u) ic.src = u;
    r.append(i, ic, el('span', '', esc(s.label)));
    grid.appendChild(r);
  }
  grpRow(w, 'AutoSnap');
  addRow(w, 'Aperture px', W.aperture, v => W.aperture = clamp(Math.round(v), 1, 50), 1);
  addRow(w, 'Marker px', W.markerSize, v => W.markerSize = clamp(Math.round(v), 2, 20), 1);
  chk(w, 'Show the aperture box', W.apBox, v => W.apBox = v);
  w.appendChild(el('div', 'oshint',
    'Shift + right-click for a one-shot override. Hold Shift+E or Shift+P endpoint, ' +
    'Shift+M or Shift+V midpoint, Shift+C centre, Shift+D or Shift+L nothing at all, ' +
    'Shift+A object snap, Shift+X polar, Shift+Z tracking — for as long as the key is down. ' +
    'Tab cycles the candidates under the cursor.'));
}

/* ============================================================
   Prompt keywords you can click
   ------------------------------------------------------------
   The bracketed list is the command's entire vocabulary at that
   moment, and AutoCAD has let you click it for fifteen years.
   Here it was rendered as `[<em>C</em>lose/<em>U</em>ndo]`
   under `pointer-events:none` — a list of things you may do,
   printed on glass. Each word is now a real button, and it runs
   runInput(key): the same single path the typed capital takes,
   so the click and the letter can never come to disagree.
   ============================================================ */
/** one keyword, with the letters you may type instead marked the way AutoCAD
    capitalises them */
function kwLabelHTML(k) {
  const w = k.word, i = w.toLowerCase().indexOf(String(k.key).toLowerCase());
  if (i < 0) return '<em>' + esc(w) + '</em>';
  return esc(w.slice(0, i)) + '<em>' + esc(w.slice(i, i + k.key.length)) + '</em>' + esc(w.slice(i + k.key.length));
}
function promptKeyPick(key) {
  if (!key) return;
  /* whatever is half-typed is not the answer to this prompt */
  const inp = $('#cmd'); if (inp) inp.value = '';
  if (typeof acReset === 'function') acReset();
  if (typeof runInput === 'function') runInput(key);
  if (inp && inp.focus) inp.focus();
}
/* the live keyword buttons, in prompt order. Built as elements and wired as
   they are built rather than written as HTML and queried back, so there is
   never a render that produced buttons nothing is listening to. */
const PROMPT_KW = [];
function renderPromptKeys() {
  const n = $('#hint'); if (!n) return;
  const p = PROMPT;
  PROMPT_KW.length = 0;
  clearNode(n);
  if (!p.base && !p.keys.length) { n.style.display = 'none'; return; }
  const txt = s => { n.appendChild(el('span', 'hx', esc(s))); };
  const base = p.base.replace(/:\s*$/, '');
  if (base) txt(base);
  if (p.keys.length) {
    txt(base ? ' or [' : '[');
    p.keys.forEach((k, i) => {
      if (i) txt('/');
      const b = el('button', 'kw', kwLabelHTML(k));
      b.type = 'button';
      b.title = k.word + ' — or type ' + k.key;
      b.dataset.k = k.key;
      b.onclick = ev => {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (ev && ev.stopPropagation) ev.stopPropagation();
        promptKeyPick(b.dataset.k);
      };
      n.appendChild(b);
      PROMPT_KW.push(b);
    });
    txt(']:');
  } else if (!/[.?!:]$/.test(base)) txt(':');
  if (p.extra) txt(' · ' + p.extra);
  n.style.display = '';
}

/* ============================================================
   AutoComplete
   ------------------------------------------------------------
   acSuggest() has ranked commands, aliases and system variables
   by prefix and recency since the command engine was written,
   and in the built file its only appearance was its own
   definition: zero callers. AUTOCOMPLETEMODE reported 15 and
   not one of the four bits did anything.

   This is the list, and the bits:
      1  append the rest of the top match into the input
      2  show the list
      4  show a kind badge beside each row
      8  include system variables
     16  match mid-string as well as by prefix

   It sits ABOVE the input because the command line is docked at
   the bottom of the window, which is where AutoCAD puts it too,
   and it answers the Command prompt only: inside a running
   command the same letters are options and coordinates.
   ============================================================ */
const AC_MAX = 10;
const AC = { el: null, rows: [], items: [], idx: -1, typed: '', echo: null };
const AC_BADGE = { cmd: '⌘', var: '$', meta: '☰' };
function acClose() {
  if (AC.el) { AC.el.remove(); AC.el = null; }
  AC.items = []; AC.rows = []; AC.idx = -1;
  return false;
}
/** the field was cleared or answered: forget what we last wrote into it */
function acReset() { AC.typed = ''; AC.echo = null; return acClose(); }
function acOpen() { return !!AC.el; }
/** the run of the name the typed text matched, marked so the eye can see why
    the row is in the list at all */
function acNameHTML(name, q) {
  const i = name.toLowerCase().indexOf(String(q).toLowerCase());
  if (i < 0 || !q) return esc(name);
  return esc(name.slice(0, i)) + '<b>' + esc(name.slice(i, i + q.length)) + '</b>' + esc(name.slice(i + q.length));
}
function acDraw(q) {
  const wrap = $('#cmdwrap'); if (!wrap) return;
  if (!AC.el) { AC.el = el('div'); AC.el.id = 'acList'; wrap.appendChild(AC.el); }
  const icons = !!(CLI.autoComplete & 4);
  clearNode(AC.el);
  AC.rows = AC.items.map((it, i) => {
    const b = el('button', 'aci' + (i === AC.idx ? ' on' : ''));
    b.type = 'button'; b.dataset.i = String(i);
    if (icons) b.appendChild(el('span', 'ack', esc(AC_BADGE[it.kind] || '·')));
    b.appendChild(el('span', 'acn', acNameHTML(it.name, q)));
    if (it.alias) b.appendChild(el('span', 'aca', esc(it.alias)));
    /* mousedown, not click: the input must not lose focus first, or the blur
       handler tears the list down before the click can land on it */
    b.onmousedown = ev => { if (ev && ev.preventDefault) ev.preventDefault(); };
    b.onclick = () => acAccept(i, true);
    AC.el.appendChild(b);
    return b;
  });
}
/** bit 1 — write the rest of the top match into the input and leave it
    selected, so the next keystroke replaces it. The characters already typed
    are left exactly as typed: yanking them into capitals under a moving cursor
    is what makes an aggressive completer unusable. */
function acAppend(inp, typed, name) {
  if (!inp || name.length <= typed.length) return;
  /* Only into the field that holds the caret. A selection in an unfocused
     input is invisible, and the canvas key handler grows the command line with
     `value += key` instead of replacing the selection — so completing a field
     nobody is typing in turns the next keystroke into "lASTPOINTi". */
  if (typeof document !== 'undefined' && document.activeElement && document.activeElement !== inp) return;
  if (name.slice(0, typed.length).toLowerCase() !== typed.toLowerCase()) return;  /* a mid-string hit has nothing to append */
  inp.value = typed + name.slice(typed.length);
  AC.echo = inp.value;
  if (typeof inp.setSelectionRange === 'function') inp.setSelectionRange(typed.length, inp.value.length);
}
/** rebuild from whatever is in the command line right now */
function acRefresh(grow) {
  const inp = $('#cmd'); if (!inp) return acReset();
  if (typeof CMD !== 'undefined' && CMD) return acReset();
  const text = String(inp.value || '');
  /* one bare word, or it is not a command name being typed */
  if (!text.trim() || /[\s,'"@#<]/.test(text)) return acReset();
  const list = (typeof acSuggest === 'function') ? acSuggest(text, AC_MAX) : [];
  if (!list.length) return acClose();
  AC.items = list; AC.idx = -1; AC.typed = text;
  if (CLI.autoComplete & 1) { if (grow) acAppend(inp, text, list[0].name); }
  if (CLI.autoComplete & 2) acDraw(text); else if (AC.el) { AC.el.remove(); AC.el = null; }
  return true;
}
/** read the field and re-rank. Called on every key, because the field is
    filled two ways: typed into directly, and appended to by the canvas key
    handler (`cmdIn.value += key`), which fires no input event at all. */
function acSync() {
  const inp = $('#cmd'); if (!inp) return;
  const v = String(inp.value || '');
  /* Text this list put in the field itself is not the user typing. Arrowing
     down the list writes the highlighted name into the input, and re-querying
     on that narrowed the list to the one row the highlight was sitting on —
     three presses of Down and there was nothing left to arrow through. */
  if (v === AC.echo) return;
  const grow = v.length > AC.typed.length;
  AC.typed = v;
  acRefresh(grow);
}
function acMove(d) {
  if (!AC.items.length) return false;
  const n = AC.items.length;
  AC.idx = AC.idx < 0 ? (d > 0 ? 0 : n - 1) : (((AC.idx + d) % n) + n) % n;
  acDraw(AC.typed);
  const inp = $('#cmd');
  /* the highlighted row IS the text: AutoCAD writes it into the field as you
     arrow, so Enter needs no special case. AC.typed stays the query. */
  if (inp) { inp.value = AC.items[AC.idx].name; AC.echo = inp.value; }
  return true;
}
/** take suggestion `i`; `run` executes it, Tab only completes the word */
function acAccept(i, run) {
  const it = AC.items[i < 0 ? 0 : i]; if (!it) return false;
  const inp = $('#cmd'); if (!inp) return false;
  inp.value = it.name;
  AC.typed = it.name; AC.echo = it.name;
  acClose();
  if (inp.focus) inp.focus();
  if (run && typeof runInput === 'function') { inp.value = ''; runInput(it.name); }
  else if (typeof inp.setSelectionRange === 'function') inp.setSelectionRange(it.name.length, it.name.length);
  return true;
}
/* Wired here rather than beside the rest of the command-line keys because this
   handler has to run BEFORE the one that recalls history on Up and Down — 13
   loads before 14, so it does, and stopImmediatePropagation keeps the arrows
   for the list while it is open. */
(function acWire() {
  const inp = typeof $ === 'function' ? $('#cmd') : null;
  if (!inp || !inp.addEventListener) return;
  inp.addEventListener('input', () => acSync());
  inp.addEventListener('blur', () => acClose());
  inp.addEventListener('keydown', ev => {
    if (!ev) return;
    const stop = () => {
      if (ev.preventDefault) ev.preventDefault();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    };
    if (ev.key === 'Tab' && (AC.items.length || acRefresh(false))) { stop(); acAccept(AC.idx, false); return; }
    if (!acOpen()) return;
    if (ev.key === 'ArrowDown') { stop(); acMove(1); return; }
    if (ev.key === 'ArrowUp') { stop(); acMove(-1); return; }
    /* one Escape dismisses the list and keeps what you typed; the next one is
       the Escape that cancels, which is the order AutoCAD uses */
    if (ev.key === 'Escape') { stop(); acClose(); return; }
    if (ev.key === 'Enter') { acClose(); return; }   /* the field already holds the answer */
  });
  /* keyup, not keydown: on the canvas path the character is appended by a
     keydown handler that has not run yet when ours does */
  if (typeof window !== 'undefined' && window.addEventListener)
    window.addEventListener('keyup', ev => {
      if (!ev || ev.key === 'Escape' || ev.key === 'Shift') return;
      acSync();
    });
})();

/* ============================================================
   The command transcript.

   cliPrint() has always filled CLI.lines and then called renderCli(), which
   did not exist — so every prompt, every error and every variable readout was
   recorded and thrown away. Typing a command that does not exist produced no
   visible response at all, which is the single worst thing a command line can
   do. This is that function.
   ============================================================ */
function renderCli() {
  const box = $('#cmdhist'); if (!box) return;
  const n = CLI.open ? CLI.lines.length : 4;
  const show = CLI.lines.slice(-n);
  /* rebuilt rather than appended: the buffer is capped at CLI.max and trims
     from the front, so the DOM would drift out of step with it */
  box.innerHTML = '';
  for (const l of show) {
    const d = el('div', 'cl' + (l.c ? ' ' + l.c : ''));
    d.textContent = l.t;
    box.appendChild(d);
  }
  box.classList.toggle('open', !!CLI.open);
  box.scrollTop = box.scrollHeight;
}
/** F2 — the tall history window, as in AutoCAD */
function toggleCliHistory() {
  CLI.open = !CLI.open;
  renderCli();
  const box = $('#cmdhist');
  if (box) box.scrollTop = box.scrollHeight;
}

/* ============================================================
   Layout tabs
   ------------------------------------------------------------
   Model and each sheet, along the bottom. Paper space is not
   discoverable from a command line alone: without a tab strip
   nobody finds out a drawing can have sheets, which is most of
   why the feature would go unused.
   ============================================================ */
function buildSheetTabs() {
  const bar = $('#tabs'); if (!bar) return;
  clearNode(bar);
  const tab = (label, on, fn, cls, title) => {
    const b = el('button', 'tab' + (on ? ' on' : '') + (cls ? ' ' + cls : ''), esc(label));
    if (title) b.title = title;
    b.onclick = fn;
    bar.appendChild(b);
    return b;
  };
  tab('Model', DOC.curSheet == null, () => gotoSheet(null), '', 'The model \u2014 draw here');
  for (const sh of (DOC.sheets || [])) {
    const b = tab(sh.name, DOC.curSheet === sh.id, () => gotoSheet(sh.id), '',
      sh.size + (sh.landscape ? ' landscape' : ' portrait'));
    /* right-click is where a layout gets renamed or thrown away, as it is in
       every other tabbed thing on the machine */
    b.oncontextmenu = ev => { ev.preventDefault(); sheetTabMenu(sh, b); };
  }
  tab('+', false, () => {
    /* a new layout straight from the tab strip, named for you. Typing LAYOUT N
       is still there for anyone who prefers the keyboard. */
    const n = (DOC.sheets || []).length + 1;
    cancelCmd();
    dispatch('LAYOUT'); dispatch('N'); dispatch('Sheet ' + n);
  }, 'add', 'New layout');
}
function sheetTabMenu(sh, anchor) {
  const items = [
    ['Rename\u2026', () => {
      const n = prompt('Layout name', sh.name);
      if (n == null) return;
      begin(); sh.name = String(n).trim() || sh.name; commit('Rename layout');
      buildSheetTabs(); draw();
    }],
    ['Sheet setup…', () => { gotoSheet(sh.id); META.pagesetup.fn(); }],
    ['Plot\u2026', () => { gotoSheet(sh.id); plotSheet(sh); }],
    ['Delete', () => {
      begin();
      DOC.sheets = DOC.sheets.filter(x => x.id !== sh.id);
      commit('Delete layout');
      gotoSheet(DOC.sheets.length ? DOC.sheets[0].id : null);
    }],
  ];
  popMenu(items, anchor);
}
/** a small menu anchored to an element, used by the tab strip */
function popMenu(items, anchor) {
  const old = $('#tabmenu'); if (old) old.remove();
  const m = el('div'); m.id = 'tabmenu';
  m.className = 'gripmenu';
  const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 60, top: 60 };
  m.style.left = Math.round(r.left) + 'px';
  m.style.top = Math.round((r.top || 0) - 8 - items.length * 22) + 'px';
  for (const [label, fn] of items) {
    const b = el('button', 'gmi', esc(label));
    b.onclick = () => { m.remove(); fn(); };
    m.appendChild(b);
  }
  document.body.appendChild(m);
  setTimeout(() => {
    const close = () => { m.remove(); document.removeEventListener('pointerdown', close); };
    document.addEventListener('pointerdown', close);
  }, 0);
  return m;
}

