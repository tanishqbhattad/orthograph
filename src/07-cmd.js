/* ============================================================
   ORTHOGRAPH — 07 command engine + drawing commands
   ------------------------------------------------------------
   The command line is the primary interface, so this module owns
   rather more than the drawing commands: the alias table, the
   system variables, the prompt/keyword model that the command
   line and the crosshair tooltip both render from one string, the
   transparent-command stack, and coordinate entry.
   ============================================================ */
let CMD = null;
const CMDS = {};
/** commands that act at once and have no prompts of their own — see defm() */
const META = {};
/** menu grouping: 'draw' | 'modify' | 'annotate' | 'inquiry' | 'arch' | 'view' */
function defc(key, o) { CMDS[key] = Object.assign({ key, group: 'draw' }, o); }

/* ============================================================
   System variables
   ------------------------------------------------------------
   Real variables, not a lookup table with a pretty name: every
   one of these reads and writes the state the rest of the app
   already runs on, so `OSMODE 39` changes what the snap engine
   does on the very next mouse move. Names, types, bit codes and
   defaults follow AutoCAD; where our state genuinely differs the
   comment says so.
   ============================================================ */
const SYSVAR = {};
function defvar(name, o) { SYSVAR[name] = Object.assign({ name, type: 'int' }, o); }
function varNames() { return Object.keys(SYSVAR).sort(); }
function getvar(n) {
  const v = SYSVAR[String(n).toUpperCase()];
  return v ? v.get() : undefined;
}
function setvar(n, val) {
  const v = SYSVAR[String(n).toUpperCase()];
  if (!v) return false;
  if (v.ro) return false;
  v.set(val);
  return true;
}
/** the string form the command line shows: points as `x,y`, reals trimmed */
function varStr(v) {
  const raw = v.get();
  if (v.type === 'point') return raw.map(x => +(+x).toFixed(4)).join(',');
  if (v.type === 'real') return String(+(+raw).toFixed(4));
  if (v.type === 'string') return '"' + raw + '"';
  if (v.type === 'bool') return raw ? 'ON' : 'OFF';
  return String(raw);
}
/** parse a typed value into the variable's type; undefined = rejected */
function varParse(v, s) {
  s = String(s).trim();
  if (v.type === 'string') return s.replace(/^"|"$/g, '');
  /* AutoCAD takes ON/OFF for the toggle variables as well as 1/0, and the
     commands that front them (LWDISPLAY, UCSICON) prompt in those words. */
  if (v.type === 'bool') {
    const k = s.toLowerCase();
    if (k === 'on' || k === '1' || k === 'yes' || k === 'true') return true;
    if (k === 'off' || k === '0' || k === 'no' || k === 'false') return false;
    return undefined;
  }
  if (v.type === 'point') {
    const p = s.split(/[, ]+/).map(parseFloat);
    return p.length >= 2 && p.every(isFinite) ? p.slice(0, 2) : undefined;
  }
  const n = parseFloat(s.replace(/,/g, '.'));
  if (!isFinite(n)) return undefined;
  return v.type === 'int' ? Math.round(n) : n;
}

/* OSMODE is a bit code and always has been. 64 (insertion), 1024, 2048
   (apparent intersection) and 8192 (parallel) have no snap in this app, so
   they round-trip as zero rather than pretending. 16384 suppresses the lot,
   which is exactly what our osnap toggle does. */
const OSBITS = [[1, 'end'], [2, 'mid'], [4, 'cen'], [8, 'node'], [16, 'quad'],
  [32, 'int'], [128, 'perp'], [256, 'tan'], [512, 'near'], [4096, 'ext']];

defvar('OSMODE', {
  desc: 'Running object snap modes, bit coded',
  get() { let v = 0; for (const [b, k] of OSBITS) if (ST.osnapOn[k]) v |= b; if (!ST.osnap) v |= 16384; return v; },
  set(v) {
    v = v | 0;
    ST.osnap = !(v & 16384);
    for (const [b, k] of OSBITS) ST.osnapOn[k] = (v & b) ? 1 : 0;
    if (typeof syncToggles === 'function') syncToggles();
    draw();
  },
});
const flagVar = (name, key, desc, after) => defvar(name, {
  desc, get: () => ST[key] ? 1 : 0,
  set(v) { ST[key] = !!v; if (typeof syncToggles === 'function') syncToggles(); if (after) after(); draw(); },
});
flagVar('ORTHOMODE', 'ortho', 'Ortho mode on/off');
flagVar('SNAPMODE', 'snapgrid', 'Snap to the grid on/off');
flagVar('GRIDMODE', 'grid', 'Grid display on/off');
defvar('POLARANG', {
  type: 'real', desc: 'Polar tracking increment, degrees',
  get: () => ST.polarInc, set(v) { ST.polarInc = clamp(v, 1, 180); },
});
defvar('AUTOSNAP', {
  desc: 'AutoSnap marker/magnet/tooltip/polar, bit coded (8 = polar tracking)',
  get: () => (ST.autosnap == null ? 55 : ST.autosnap & ~8) | (ST.polar ? 8 : 0),
  set(v) {
    v = v | 0; ST.autosnap = v; ST.polar = !!(v & 8);
    if (typeof syncToggles === 'function') syncToggles(); draw();
  },
});
defvar('DYNMODE', {
  desc: 'Dynamic input: 0 off, 3 on (pointer + dimensional)',
  get: () => ST.dyn ? 3 : 0,
  set(v) {
    ST.dyn = v > 0;
    if (!ST.dyn && typeof dynKill === 'function') dynKill();
    if (typeof syncToggles === 'function') syncToggles();
    if (typeof syncDyn === 'function') syncDyn();
    draw();
  },
});
defvar('PICKBOX', {
  desc: 'Object selection target height, pixels',
  get: () => ST.pickBox, set(v) { ST.pickBox = clamp(Math.round(v), 1, 50); draw(); },
});
/* Selection and grips. Every one of these was already read by the renderer or
   the pick path; none had a way in. A variable the code obeys but no user can
   reach is indistinguishable from a hardcoded constant. */
defvar('GRIPS', {
  desc: 'Show grips on selected objects (0 hides them)',
  get: () => ST.gripsOn ? 1 : 0, set(v) { ST.gripsOn = v ? 1 : 0; draw(); },
});
defvar('GRIPSIZE', {
  desc: 'Grip box size, pixels',
  get: () => ST.gripSize, set(v) { ST.gripSize = clamp(Math.round(v), 2, 20); draw(); },
});
defvar('GRIPOBJLIMIT', {
  desc: 'Suppress grips once a selection exceeds this many objects',
  get: () => ST.gripObjLimit, set(v) { ST.gripObjLimit = clamp(Math.round(v), 0, 32767); draw(); },
});
defvar('SELECTIONCYCLING', {
  desc: 'Overlapping objects: 0 off, 1 badge, 2 badge and list',
  get: () => ST.selCycling, set(v) { ST.selCycling = clamp(Math.round(v), 0, 2); draw(); },
});
defvar('PICKAUTO', {
  desc: 'Press-drag makes a lasso (AutoCAD PICKAUTO bit 4)',
  get: () => ST.lassoOn ? 1 : 0, set(v) { ST.lassoOn = v ? 1 : 0; },
});
defvar('SELECTIONAREAOPACITY', {
  desc: 'Fill opacity of the selection window, per cent',
  get: () => ST.selAreaOpacity, set(v) { ST.selAreaOpacity = clamp(Math.round(v), 0, 100); draw(); },
});
defvar('PICKADD', {
  desc: '0 = a new pick replaces the set and Shift adds; 1/2 = picks accumulate',
  get: () => ST.pickAdd, set(v) { ST.pickAdd = clamp(Math.round(v), 0, 2); },
});
defvar('APERTURE', {
  desc: 'Object snap target height, pixels',
  get: () => SNAP_R, set(v) { SNAP_R = clamp(Math.round(v), 1, 50); draw(); },
});
defvar('LTSCALE', {
  type: 'real', desc: 'Global linetype scale',
  get: () => DOC.ltScale == null ? 1 : DOC.ltScale,
  set(v) { DOC.ltScale = Math.max(v, 1e-4); draw(); },
});
/* The view variables. These were reachable from the old command table before
   dispatch moved in here; they are declared as real sysvars so SETVAR, the
   command line and the settings popover all read one definition. */
defvar('ZOOMFACTOR', {
  desc: 'Wheel zoom step, 3..100 as AutoCAD',
  get: () => VS.zoomFactor, set(v) { VS.zoomFactor = clamp(Math.round(v), 3, 100); },
});
defvar('GRIDMAJOR', {
  desc: 'Minor grid lines between two major ones',
  get: () => VS.gridMajor, set(v) { VS.gridMajor = clamp(Math.round(v), 1, 100); draw(); },
});
defvar('CURSORSIZE', {
  desc: 'Crosshair length as a percentage of the viewport',
  get: () => ST.crossLen, set(v) { ST.crossLen = clamp(Math.round(v), 1, 100); draw(); },
});
defvar('LWDISPLAY', {
  type: 'bool', desc: 'Draw lineweights at their true plotted width',
  get: () => ST.lwt !== false,
  set(v) { ST.lwt = !!v; if (typeof syncToggles === 'function') syncToggles(); draw(); },
});
defvar('UCSICON', {
  type: 'bool', desc: 'Show the UCS icon',
  get: () => !!VS.ucsIcon, set(v) { VS.ucsIcon = !!v; draw(); },
});
defvar('DIMSCALE', {
  type: 'real', desc: 'Overall scale applied to dimension sizes',
  get: () => DOC.dimScale == null ? 1 : DOC.dimScale,
  set(v) { DOC.dimScale = Math.max(v, 1e-4); draw(); },
});
defvar('TEXTSIZE', {
  type: 'real', desc: 'Default height for new text',
  get: () => DOC.textH, set(v) { DOC.textH = Math.max(v, 1e-6); if (typeof buildDrawSettings === 'function') buildDrawSettings(); },
});
defvar('CLAYER', {
  type: 'string', desc: 'Current layer',
  get: () => DOC.cur,
  set(v) {
    const n = String(v).trim();
    if (!hasLayer(n)) { cliPrint('Cannot find layer "' + n + '".', 'err'); return; }
    DOC.cur = n; if (typeof syncUI === 'function') syncUI(); draw();
  },
});
defvar('CECOLOR', {
  type: 'string', desc: 'Colour for new objects ("BYLAYER" or #rrggbb)',
  get: () => DOC.cecolor || 'BYLAYER',
  set(v) { const s = String(v).trim(); DOC.cecolor = /^bylayer$/i.test(s) ? null : s; },
});
defvar('CELTYPE', {
  type: 'string', desc: 'Linetype for new objects ("BYLAYER", solid, dashed, hidden, center, dashdot)',
  get: () => DOC.celtype || 'BYLAYER',
  set(v) { const s = String(v).trim().toLowerCase(); DOC.celtype = (s === 'bylayer' || !LTDEF[s]) ? null : s; },
});
defvar('CELWEIGHT', {
  type: 'real', desc: 'Lineweight for new objects, mm (-1 = BYLAYER)',
  get: () => DOC.celweight == null ? -1 : DOC.celweight,
  set(v) { DOC.celweight = v < 0 ? null : v; draw(); },
});
defvar('GRIDUNIT', {
  type: 'point', desc: 'Grid spacing, X and Y',
  get: () => [DOC.gridStep, DOC.gridStep],
  set(p) { DOC.gridStep = Math.max(p[0], 1e-6); if (typeof buildDrawSettings === 'function') buildDrawSettings(); draw(); },
});
defvar('SNAPUNIT', {
  type: 'point', desc: 'Grid snap spacing, X and Y',
  get: () => [DOC.snapStep, DOC.snapStep],
  set(p) { DOC.snapStep = Math.max(p[0], 1e-6); if (typeof buildDrawSettings === 'function') buildDrawSettings(); },
});
defvar('LIMMIN', {
  type: 'point', desc: 'Lower-left drawing limit',
  get: () => (DOC.limits || [[0, 0], [420000, 297000]])[0],
  set(p) { DOC.limits = [p, (DOC.limits || [[0, 0], [420000, 297000]])[1]]; },
});
defvar('LIMMAX', {
  type: 'point', desc: 'Upper-right drawing limit',
  get: () => (DOC.limits || [[0, 0], [420000, 297000]])[1],
  set(p) { DOC.limits = [(DOC.limits || [[0, 0], [420000, 297000]])[0], p]; },
});
defvar('INSUNITS', {
  desc: 'Drawing units: 1 in, 2 ft, 4 mm, 5 cm, 6 m',
  get: () => ({ in: 1, ft: 2, mm: 4, cm: 5, m: 6 })[DOC.units] || 4,
  set(v) {
    const u = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' }[v | 0];
    if (!u) return;
    DOC.units = u;
    const sel = typeof $ === 'function' ? $('#unit') : null; if (sel) sel.value = u;
    if (typeof syncUI === 'function') syncUI();
    if (typeof syncCoord === 'function') syncCoord();
    draw();
  },
});
defvar('LUNITS', {
  desc: 'Linear units: 2 decimal, 4 architectural',
  get: () => DOC.units === 'ft' ? 4 : 2,
  set(v) { if ((v | 0) === 4) setvar('INSUNITS', 2); else if (DOC.units === 'ft') setvar('INSUNITS', 4); },
});
defvar('FILLETRAD', {
  type: 'real', desc: 'Current fillet radius',
  get: () => DOC.filletR == null ? 0 : DOC.filletR, set(v) { DOC.filletR = Math.max(v, 0); },
});
defvar('CHAMFERA', {
  type: 'real', desc: 'Current chamfer distance',
  get: () => DOC.chamD == null ? 0 : DOC.chamD, set(v) { DOC.chamD = Math.max(v, 0); },
});
defvar('CMDECHO', {
  desc: 'Echo prompts and input to the command history',
  get: () => CLI.echo ? 1 : 0, set(v) { CLI.echo = !!v; },
});
defvar('SHORTCUTMENU', {
  desc: 'Right-click shortcut menus: 1 default, 2 edit, 4 command-with-options, 8 command always, 16 time-sensitive',
  get: () => CLI.shortcutMenu, set(v) { CLI.shortcutMenu = v | 0; },
});
defvar('AUTOCOMPLETEMODE', {
  desc: 'AutoComplete: 1 append, 2 list, 4 icon, 8 system variables, 16 mid-string search',
  get: () => CLI.autoComplete, set(v) { CLI.autoComplete = v | 0; },
});
defvar('CMDNAMES', { type: 'string', ro: true, desc: 'Name of the active command', get: () => CMD ? cmdName(CMD.def.key) : '' });
defvar('CMDACTIVE', { ro: true, desc: '1 while an ordinary command is active', get: () => CMD ? 1 : 0 });
defvar('LASTPOINT', {
  type: 'point', desc: 'Last point entered',
  get: () => ST.lastPt || [0, 0], set(p) { ST.lastPt = p; },
});
defvar('SCREENSIZE', { type: 'point', ro: true, desc: 'Viewport size in pixels', get: () => [V.w, V.h] });
defvar('VIEWSIZE', { type: 'real', ro: true, desc: 'Height of the view in drawing units', get: () => V.h / V.z });
defvar('VIEWCTR', { type: 'point', ro: true, desc: 'Centre of the view in world coordinates', get: () => s2w(V.w / 2, V.h / 2) });
defvar('UNDOMARKS', { ro: true, desc: 'Marks placed in the undo journal', get: () => HIST.marks.length });
defvar('UNDOCTL', {
  ro: true, desc: 'Undo state: 1 enabled, 2 one-command mode, 8 group active',
  get: () => (HIST.depth > 0 ? 1 : 0) | (HIST.depth === 1 ? 2 : 0) | (HIST.group ? 8 : 0),
});

/* ============================================================
   Command names, variants and the alias table
   ------------------------------------------------------------
   Internal keys are short ('rect'); the name a draughtsman types
   is AutoCAD's ('RECTANG'). CMDNAME bridges the two wherever
   they differ, CMDVARIANT gives the preset-carrying names their
   own entry, and ALIAS is acad.pgp — the table that lives in
   every AutoCAD user's fingers.
   ============================================================ */
const CMDNAME = {
  rect: 'RECTANG', dimcont: 'DIMCONTINUE', revcloud: 'REVCLOUD',
  matchprop: 'MATCHPROP', qselect: 'QSELECT', pedit: 'PEDIT',
  /* GRID is AutoCAD's grid-display command, so the structural grid takes the
     Revit name for the same object. */
  grid: 'COLUMNGRID', wallrect: 'WALLRECT', wallflip: 'WALLFLIP',
  walljoin: 'WALLJOIN', wallsplit: 'WALLSPLIT',
  /* the settings commands need keys that do not collide with the drawing
     commands of the same name, so the public name is spelled out here */
  gridcmd: 'GRID', snapcmd: 'SNAP', orthocmd: 'ORTHO', osnapcmd: 'OSNAP',
  unitscmd: 'UNITS', layercmd: 'LAYER', undocmd: 'UNDO', aliascmd: 'ALIAS',
};
/** public names that drive an existing command with an option already chosen */
const CMDVARIANT = {
  DIMLINEAR: ['dim', { k: 'linear' }], DIMALIGNED: ['dim', { k: 'aligned' }],
  DIMANGULAR: ['dim', { k: 'angular' }], DIMRADIUS: ['dim', { k: 'radius' }],
  DIMDIAMETER: ['dim', { k: 'diameter' }],
  DTEXT: ['text', null], RECTANGLE: ['rect', null], WBLOCK: ['block', null],
  QLEADER: ['leader', null], MLEADER: ['leader', null],
};
/* acad.pgp. Only aliases whose target this app actually implements are here —
   an alias that resolves to a command we do not have would be a lie in the
   AutoComplete list. */
const ALIAS = {
  a: 'ARC', aa: 'AREA', al: 'ALIGN', ar: 'ARRAY',
  b: 'BLOCK', bh: 'HATCH', br: 'BREAK',
  c: 'CIRCLE', ch: 'PROPERTIES', cha: 'CHAMFER', co: 'COPY', cp: 'COPY',
  d: 'DIMSTYLE', dal: 'DIMALIGNED', dan: 'DIMANGULAR', dco: 'DIMCONTINUE',
  ddi: 'DIMDIAMETER', di: 'DIST', dim: 'DIM', div: 'DIVIDE', dli: 'DIMLINEAR',
  do: 'DONUT', dra: 'DIMRADIUS', ds: 'DSETTINGS', dt: 'TEXT',
  e: 'ERASE', el: 'ELLIPSE', ex: 'EXTEND',
  f: 'FILLET',
  h: 'HATCH',
  i: 'INSERT',
  j: 'JOIN',
  l: 'LINE', la: 'LAYER', le: 'QLEADER', len: 'LENGTHEN', li: 'LIST',
  ls: 'LIST', lt: 'LINETYPE', lts: 'LTSCALE', lw: 'LWEIGHT',
  m: 'MOVE', ma: 'MATCHPROP', me: 'MEASURE', mi: 'MIRROR',
  /* a wall IS a multiline in this app, so ML lands on the nearest real thing */
  ml: 'WALL', mo: 'PROPERTIES', mt: 'MTEXT',
  o: 'OFFSET', op: 'OPTIONS', os: 'OSNAP',
  p: 'PAN', pe: 'PEDIT', pl: 'PLINE', po: 'POINT', pol: 'POLYGON',
  pr: 'PROPERTIES', pt: 'POINT', pu: 'PURGE',
  r: 'REDRAW', re: 'REGEN', rec: 'RECTANG', ro: 'ROTATE',
  s: 'STRETCH', sc: 'SCALE', se: 'DSETTINGS', set: 'SETVAR', sn: 'SNAP',
  sp: 'SPLINE', spl: 'SPLINE',
  t: 'MTEXT', tr: 'TRIM',
  un: 'UNITS',
  x: 'EXPLODE', xl: 'XLINE',
  z: 'ZOOM', zo: 'ZOOM', pa: 'PAN', dro: 'DRAWORDER', dor: 'DRAWORDER',
  /* the architecture layer keeps the two-letter habit */
  w: 'WALL', wa: 'WALL', wr: 'WALLRECT', dr: 'DOOR', win: 'WINDOW', wi: 'WINDOW',
  col: 'COLUMN', str: 'STAIR', rm: 'ROOM', cg: 'COLUMNGRID',
  wf: 'WALLFLIP', wj: 'WALLJOIN', ws: 'WALLSPLIT',
};
/** aliases the user has defined this session, checked before acad.pgp */
const USERALIAS = {};

function cmdName(key) { return CMDNAME[key] || String(key).toUpperCase(); }

/* NAME -> {kind,key,opt}. CMDS is filled by defc() calls spread over three
   modules, so the map is built on demand and rebuilt when the count moves. */
let _n2k = null, _n2kSize = -1, _n2kMeta = -1;
function nameIndex() {
  const nc = Object.keys(CMDS).length, nm = Object.keys(META).length;
  if (_n2k && nc === _n2kSize && nm === _n2kMeta) return _n2k;
  _n2kSize = nc; _n2kMeta = nm;
  _n2k = {};
  for (const k of Object.keys(CMDS)) _n2k[cmdName(k)] = { kind: 'cmd', key: k, group: CMDS[k].group };
  for (const n of Object.keys(CMDVARIANT)) {
    const [k, opt] = CMDVARIANT[n];
    if (CMDS[k]) _n2k[n] = { kind: 'cmd', key: k, opt, group: CMDS[k].group };
  }
  for (const k of Object.keys(META)) _n2k[META[k].name] = { kind: 'meta', key: k, group: META[k].group || 'view' };
  return _n2k;
}
/** what a typed word means. Handles the `_` and `-` prefixes AutoCAD accepts. */
function resolveWord(word) {
  let w = String(word || '').trim();
  if (!w) return null;
  const dash = w[0] === '-';
  w = w.replace(/^[_-]+/, '');
  const lo = w.toLowerCase(), up = w.toUpperCase();
  const target = USERALIAS[lo] || ALIAS[lo];
  const name = target ? target.toUpperCase() : up;
  const idx = nameIndex();
  if (idx[name]) return Object.assign({ name, dash, alias: target ? up : null }, idx[name]);
  if (SYSVAR[name]) return { kind: 'var', name, key: name };
  return null;
}

/* ============================================================
   Prompts and keywords
   ------------------------------------------------------------
   A prompt is written the way AutoCAD writes it:

       Specify next point or [Close/Undo]:

   The bracketed group IS the keyword list, and the capitals
   inside a word are the letters you may type instead ("eXit" is
   typed X). One string therefore drives the command line, the
   clickable keywords and the crosshair tooltip — a command only
   ever states its prompt once.

   Older prompts in this codebase use `· <em>C</em> close`; those
   are translated into the same structure so every command gets
   clickable options whether or not it has been rewritten.
   ============================================================ */
const PROMPT = { raw: '', text: 'Command:', base: 'Command:', keys: [], extra: '' };

/** the letters that stand for a keyword: its capitals, else its first letter.
    A word with no lower case at all (3P, ON, Ttr) is typed whole. */
function kwKey(word) {
  const w = String(word).split(/[ (]/)[0];
  if (!/[a-z]/.test(w)) return w.toUpperCase();
  const caps = w.replace(/[^A-Z]/g, '');
  return caps || w.charAt(0).toUpperCase();
}
/* The markup a prompt may carry, and nothing else.
   A bare /<\/?[a-zA-Z][^>]*>/ also ate the default in
   "Enter new value for LWDISPLAY <ON>:" — <ON> looks exactly like a tag — so
   every bool variable prompted with no default at all, while PICKBOX kept its
   <8> only because a digit cannot start a tag name. */
const PROMPT_TAG = /<\/?(?:em|b|i|u|s|strong|small|kbd|code|span)\b[^>]*>/gi;
/** put `key` into `label` as the capitalised run AutoCAD would show */
function kwWord(label, key) {
  const l = String(label).replace(PROMPT_TAG, '').trim();
  if (!l) return String(key).toUpperCase();
  const i = l.toLowerCase().indexOf(String(key).toLowerCase());
  const w = i < 0 ? l : l.slice(0, i) + l.slice(i, i + key.length).toUpperCase() + l.slice(i + key.length);
  return i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}
function parsePrompt(s) {
  const raw = String(s == null ? '' : s);
  if (!raw) return { raw: '', base: 'Command:', keys: [], extra: '' };
  const m = raw.match(/^([^[]*)\[([^\]]*)\]\s*:?\s*(.*)$/);
  if (m && m[2].trim()) {
    const keys = [];
    for (const w of m[2].split('/')) {
      const word = w.trim(); if (!word) continue;
      keys.push({ word, key: kwKey(word) });
    }
    return { raw, base: m[1].replace(/\s*or\s*$/i, '').trim(), keys, extra: m[3].replace(/^[·\s]+/, '').trim() };
  }
  /* legacy: "Next point · <em>C</em> close · <em>Enter</em> end" */
  const parts = raw.split('·');
  const keys = [], extra = [];
  /* An option list written straight into the first segment is still an option
     list: ZOOM writes its whole vocabulary that way and got none of it back,
     so the command line read "…or All Centre Dynamic Extents…" with no
     brackets, no separators and nothing to click. A key that runs *into*
     lowercase letters (<em>A</em>ll) is unambiguous; a marked word followed by
     a space or punctuation (<em>2x</em>, <em>Enter</em> — or press…) is prose
     and stays in the base, which is why the test is this narrow. */
  const base = parts.shift()
    .replace(/<em>([A-Za-z]{1,2})<\/em>([a-z][A-Za-z-]*)/g, (all, k, tail) => {
      keys.push({ word: kwWord(k + tail, k), key: k.toUpperCase() });
      return '';
    })
    .replace(PROMPT_TAG, '').replace(/[\s,]*\bor\b[\s,]*$/i, '').replace(/\s+/g, ' ').trim();
  for (const p of parts) {
    const em = p.match(/<em>([^<]+)<\/em>/);
    const label = p.replace(/<em>[^<]*<\/em>/, '').replace(PROMPT_TAG, '').trim();
    if (!em) { extra.push(p.replace(PROMPT_TAG, '').trim()); continue; }
    const k = em[1].trim();
    /* Enter/Esc/Shift are not keywords, they are keys */
    if (/^(enter|esc|escape|shift|tab|ctrl|del|delete)$/i.test(k)) { extra.push((k + ' ' + label).trim()); continue; }
    /* Two spellings are in use. `<em>C</em> close` marks a key beside a
       separate label; `<em>B</em>ack` marks the first LETTER of the word, with
       the rest running straight on. Treating the second as the first dropped
       the letter, so DRAWORDER prompted `[ack/bove object/nder object]`. */
    const _e = p.indexOf('</em>');
    const joined = _e >= 0 && /\S/.test(p.slice(_e + 5, _e + 6));
    keys.push({ word: kwWord(joined ? k + label : (label || k), k), key: k.toUpperCase() });
  }
  return { raw, base, keys, extra: extra.filter(Boolean).join(' · ') };
}
/** "Specify next point or [Close/Undo]:" */
function promptText(p) {
  if (!p.base && !p.keys.length) return 'Command:';
  let s = p.base || 'Specify option';
  if (p.keys.length) s += (p.base ? ' or ' : ' ') + '[' + p.keys.map(k => k.word).join('/') + ']';
  return s.replace(/:\s*$/, '') + ':';
}
/** Draw the prompt. renderPromptKeys (13-ui) is the renderer that makes each
    keyword a click target; renderPrompt (14-events) is the plain-text one it
    supersedes. Every prompt goes through here so the two can never disagree. */
function promptRender() {
  if (typeof renderPromptKeys === 'function') return renderPromptKeys();
  if (typeof renderPrompt === 'function') renderPrompt();
}
/** set the prompt that the command line, the tooltip and the HUD all show */
function promptSet(s) {
  const p = parsePrompt(s);
  PROMPT.raw = p.raw; PROMPT.base = p.base; PROMPT.keys = p.keys; PROMPT.extra = p.extra;
  PROMPT.text = promptText(p);
  promptRender();
  return PROMPT;
}
/** a typed word matched against the live keyword list; returns the key letters */
function matchKeyword(s) {
  const w = String(s).trim().toLowerCase();
  if (!w || !PROMPT.keys.length) return null;
  for (const k of PROMPT.keys) if (k.key.toLowerCase() === w) return k.key;
  for (const k of PROMPT.keys) if (k.word.toLowerCase() === w) return k.key;
  for (const k of PROMPT.keys) if (k.word.toLowerCase().startsWith(w)) return k.key;
  return null;
}

/* ============================================================
   The command line's own state
   ============================================================ */
const CLI = {
  lines: [],                 /* scrollback: {t:text, c:class}                */
  max: 500,
  history: [],               /* everything typed, oldest first (Up recalls)  */
  mru: [],                   /* command names, most recent first             */
  echo: true,                /* CMDECHO                                      */
  shortcutMenu: 11,          /* SHORTCUTMENU: default + edit + command menus */
  autoComplete: 15,          /* AUTOCOMPLETEMODE: append + list + icon + vars*/
  multiple: null,            /* MULTIPLE: the key being repeated             */
  pendingKey: null,          /* prompt waiting to be flushed to scrollback   */
  open: false,               /* the tall F2 history panel                    */
};
function cliPrint(text, cls) {
  CLI.lines.push({ t: String(text), c: cls || '' });
  if (CLI.lines.length > CLI.max) CLI.lines.splice(0, CLI.lines.length - CLI.max);
  if (typeof renderCli === 'function') renderCli();
}
/** echo the prompt that was just answered, with the answer appended */
function cliAnswer(answer) {
  if (!CLI.echo) return;
  cliPrint(PROMPT.text + (answer ? ' ' + answer : ''));
}
function cliRemember(name) {
  const i = CLI.mru.indexOf(name);
  if (i >= 0) CLI.mru.splice(i, 1);
  CLI.mru.unshift(name);
  if (CLI.mru.length > 40) CLI.mru.length = 40;
}

/* ============================================================
   Coordinate entry
   ------------------------------------------------------------
   Every form AutoCAD takes:
     1200,600     absolute
     @0,-450      relative to the last point
     @800<30      relative polar
     800<30       absolute polar
     #1200,600    absolute override (for the tooltip, where entry
                  is relative by default)
     250          direct distance entry — the number goes along
                  whatever direction the cursor is pointing
   `rel` flips the default for the dynamic-input tooltip, which is
   what DYNPICOORDS=0 does in AutoCAD.
   ============================================================ */
function parseCoord(s, ref, cursor, rel) {
  s = String(s).trim().replace(/\s+/g, '');
  if (!s) return null;
  let relative = !!rel && !!ref;
  if (s[0] === '@') { relative = true; s = s.slice(1); }
  else if (s[0] === '#') { relative = false; s = s.slice(1); }
  if (!s) return null;
  let m = s.match(/^(.+?)<(-?[\d.]+)$/);            /* polar  d<angle */
  if (m) {
    const d = parseLen(m[1]), a = rad(parseFloat(m[2]));
    if (isNaN(d) || isNaN(a)) return null;
    const base = relative ? (ref || [0, 0]) : [0, 0];
    return [base[0] + d * Math.cos(a), base[1] + d * Math.sin(a)];
  }
  m = s.match(/^(.+?),(.+)$/);                      /* x,y */
  if (m) {
    const x = parseLen(m[1]), y = parseLen(m[2]);
    if (isNaN(x) || isNaN(y)) return null;
    const base = relative ? (ref || [0, 0]) : [0, 0];
    return [base[0] + x, base[1] + y];
  }
  const d = parseLen(s);                            /* direct distance entry */
  if (!isNaN(d) && ref) {
    /* an angle override (`<45`) beats the cursor; otherwise the cursor
       direction is the direction, which is the whole point of DDE */
    if (ST.angOverride != null) return [ref[0] + Math.cos(ST.angOverride) * d, ref[1] + Math.sin(ST.angOverride) * d];
    if (!cursor) return null;
    const u = norm(sub(cursor, ref));
    if (hyp(u[0], u[1]) < .5) return null;
    return [ref[0] + u[0] * d, ref[1] + u[1] * d];
  }
  return null;
}

/* ============================================================
   Running commands
   ============================================================ */
/** suspended commands, innermost last — the transparent-command stack */
const TRANS = [];

function startCmd(key, arg, quiet) {
  const def = CMDS[key];
  if (!def) { cliPrint('Unknown command "' + String(key).toUpperCase() + '".  Press F1 for help.', 'err'); return; }
  /* Starting a command from the rail while another is suspended abandons the
     whole stack, exactly as picking a new tool does in AutoCAD. */
  if (CMD) { CMD.transparent = false; endCmd(true); TRANS.length = 0; }
  if (!quiet && CLI.echo) cliPrint('Command: _' + cmdName(key).toLowerCase());
  const c = { def, pts: [], step: 0, data: {}, arg };
  CMD = c;
  ST.lastCmd = key; ST.lastArg = arg;              /* Space repeats this */
  /* One command is one undo step, however many patches it takes to build.
     HIST.group was recorded onto every patch and then never set by anything,
     so the grouping machinery was inert and U after a four-segment LINE took
     back a single segment. An explicit UNDO Begin group, if the user opened
     one, outranks this and is restored when the command ends. */
  c.grpOuter = HIST.group;
  if (!HIST.group) HIST.group = ++HIST.groupSeq;
  ST.tool = key; ST.drawing = true; ST.preview = null; ST.angOverride = null;
  cliRemember(cmdName(key));
  /* alwaysSel commands (GRIPEDIT and friends) open the Select prompt even when
     something is already selected, so the pick set can be rebuilt from scratch */
  if (def.alwaysSel || (def.needSel && !SEL.size)) {
    c.phase = 'sel';
    if (typeof selPromptReset === 'function') selPromptReset();
    hint(def.selHint || 'Select objects: · <em>Enter</em> when done');
  } else {
    c.phase = 'run';
    if (def.needSel && typeof selRemember === 'function') selRemember();
    const before = PROMPT.raw;
    if (def.init) def.init(c);
    /* init may have issued its own prompt (SETVAR names the variable) or ended
       the command outright (EXPLODE); neither should be stamped over */
    if (def.hint && CMD === c && PROMPT.raw === before) hint(def.hint);
  }
  syncTools();
  /* the panel shows what is about to be drawn, so it has to follow the tool */
  if (typeof buildProps === 'function') buildProps();
  draw();
}
/** run `key` without disturbing the command already in progress */
function startTransparent(key, arg) {
  if (!CMDS[key]) { cliPrint('Unknown command "' + String(key).toUpperCase() + '".  Press F1 for help.', 'err'); return; }
  if (CMD) {
    if (TRANS.length > 6) { cliPrint('Command nested too deeply.', 'err'); return; }
    TRANS.push({ cmd: CMD, prompt: PROMPT.raw, tool: ST.tool });
    if (typeof dynKill === 'function') dynKill();
    CMD = null; ST.preview = null;
  }
  /* Space/Enter repeats the last command the user actually chose. A
     transparent command is a detour inside another one, not a choice — letting
     startCmd stamp it meant Enter after 'ZOOM inside LINE restarted ZOOM. */
  const prevCmd = ST.lastCmd, prevArg = ST.lastArg;
  startCmd(key, arg, true);
  if (CMD) CMD.transparent = true;
  ST.lastCmd = prevCmd; ST.lastArg = prevArg;
}
/** put the interrupted command back exactly where it was */
function resumeSuspended() {
  const s = TRANS.pop(); if (!s) return false;
  CMD = s.cmd;
  ST.tool = s.tool; ST.drawing = true; ST.preview = null;
  hint(s.prompt);
  syncTools();
  if (typeof buildProps === 'function') buildProps();
  if (typeof syncDyn === 'function') syncDyn();
  draw();
  return true;
}
function endCmd(silent, cancelled) {
  /* A command must never leave a journal open. Every command here opens and
     closes its journal inside one handler, so anything still in flight when
     the command ends belongs to an interrupted edit and has to go back. */
  if (typeof rollback === 'function') rollback();
  if (typeof dynKill === 'function') dynKill();
  const c = CMD;
  if (c && c.def.done) { try { c.def.done(c); } catch (e) { console.error(e); } }
  const had = !!c;
  if (c) HIST.group = c.grpOuter || 0;             /* close this command's group */
  CMD = null; ST.drawing = false; ST.preview = null; ST.tool = 'select'; ST.tracks = null;
  ST.angOverride = null;
  if (c && c.transparent && TRANS.length) { resumeSuspended(); return; }
  if (!silent) { hint(''); syncTools(); draw(); }
  if (had && typeof buildProps === 'function') buildProps();
  /* MULTIPLE keeps the command coming back until Esc stops it */
  if (had && !cancelled && !silent && CLI.multiple && CMDS[CLI.multiple]) {
    const k = CLI.multiple;
    startCmd(k, null, true);
    if (CLI.echo) cliPrint('Command: ' + cmdName(k));
  }
}
/** Esc, from any state: kill the whole stack, roll back, print *Cancel* */
function cancelCmd() {
  CLI.multiple = null;
  const had = !!CMD || TRANS.length > 0 || !!ST.dragGrip;
  while (TRANS.length) { CMD = TRANS.pop().cmd; }
  if (CMD) { CMD.transparent = false; endCmd(true, true); }
  else if (typeof rollback === 'function') rollback();
  ST.dragGrip = null;
  CMD = null; ST.drawing = false; ST.preview = null; ST.tool = 'select';
  ST.tracks = null; ST.band = null; ST.angOverride = null;
  if (typeof dynKill === 'function') dynKill();
  hint(''); syncTools();
  if (typeof buildProps === 'function') buildProps();
  if (had && CLI.echo) cliPrint('*Cancel*', 'warn');
  draw();
  return had;
}
/** `quiet` is set when the caller already echoed the typed answer */
function cmdPoint(p, quiet) {
  const c = CMD; if (!c) return;
  if (c.phase === 'sel') return;
  if (!quiet) cliAnswer('');
  try { c.def.point(c, p); } catch (e) { console.error(e); cliPrint('That did not work.', 'err'); }
  ST.lastPt = p;
  ST.angOverride = null;
  draw();
}
function cmdPreview(p) {
  const c = CMD; if (!c || c.phase === 'sel') return;
  if (c.def.preview) { try { ST.preview = c.def.preview(c, p) || null; } catch (e) { ST.preview = null; } }
}
function cmdText(s) {
  const c = CMD; if (!c) return false;
  if (c.phase === 'sel') {
    if (!s) { c.phase = 'run'; if (c.def.init) c.def.init(c); if (c.def.hint) hint(c.def.hint); return true; }
    /* W C WP CP F ALL P L R A U — the selection grammar answers first, so a
       typed W means Window here and not the WALL command */
    if (typeof selOption === 'function' && selOption(s)) { if (typeof syncUI === 'function') syncUI(); return true; }
    return false;
  }
  /* `<45` constrains the direction the way AutoCAD's angle override does: the
     mouse still sets the distance, the typed angle holds. */
  const ao = String(s).match(/^<\s*(-?[\d.]+)$/);
  if (ao) {
    const a = parseFloat(ao[1]);
    if (isFinite(a)) {
      ST.angOverride = rad(a);
      if (typeof dynLockAngle === 'function') dynLockAngle(a);
      return true;
    }
  }
  /* a keyword may be typed in full — "close" is as good as "C" */
  const kw = matchKeyword(s);
  const txt = kw || s;
  /* an option the command understood may have changed what is about to be
     drawn — J flips the alignment, T swaps the type — so refresh the panel */
  if (c.def.text && c.def.text(c, txt)) {
    if (typeof buildProps === 'function') buildProps();
    return true;
  }
  const ref = c.pts.length ? c.pts[c.pts.length - 1] : (ST.lastPt || null);
  const p = parseCoord(s, ref, ST.cur);
  if (p) { cmdPoint(p, true); return true; }
  return false;
}
function cmdEnter() {
  const c = CMD; if (!c) return;
  if (c.phase === 'sel') {
    /* a polygon or fence gesture is still open: Enter closes IT, not the
       selection prompt — the same two-stage Enter AutoCAD uses */
    if (typeof ST !== 'undefined' && ST.band && ST.band.kind !== 'rect') {
      const n = bandCommit();
      echo(n + ' found, ' + SEL.size + ' total');
      hint(c.def.selHint || 'Select objects, then press <em>Enter</em>');
      if (typeof syncUI === 'function') syncUI();
      draw(); return;
    }
    c.phase = 'run';
    if (typeof selRemember === 'function') selRemember();
    if (typeof selPromptReset === 'function') selPromptReset();
    if (c.def.init) c.def.init(c);
    if (c.def.hint) hint(c.def.hint);
    if (typeof buildProps === 'function') buildProps();
    draw(); return;
  }
  if (c.def.enter) c.def.enter(c); else endCmd();
}
/** helper: a preview entity carrying the current layer */
const pv = o => Object.assign({ layer: DOC.cur }, o);

/* =============== DRAW =============== */
defc('line', {
  hint: 'Specify first point:', group: 'draw', init: c => c.pts = [],
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length >= 2) {
      begin(); addEnt({ t: 'line', a: c.pts[c.pts.length - 2], b: p }); commit('Line');
      hint(c.pts.length > 2 ? 'Specify next point or [Close/Undo]:' : 'Specify next point or [Undo]:');
    } else hint('Specify next point or [Undo]:');
  },
  text(c, s) {
    if (/^c$/i.test(s) && c.pts.length > 2) {
      begin(); addEnt({ t: 'line', a: c.pts[c.pts.length - 1], b: c.pts[0] }); commit('Line'); endCmd(); return true;
    }
    if (/^u$/i.test(s) && c.pts.length > 1) { undo(); c.pts.pop(); return true; }
    return false;
  },
  preview: (c, p) => c.pts.length ? [pv({ t: 'line', a: c.pts[c.pts.length - 1], b: p })] : null,
  enter: () => endCmd(),
});

defc('pline', {
  hint: 'Specify start point:', group: 'draw', init: c => c.pts = [],
  point(c, p) { c.pts.push(p); hint('Specify next point or [Close/Undo]:'); },
  text(c, s) {
    if (/^c$/i.test(s) && c.pts.length > 2) { c.data.close = true; this.enter(c); return true; }
    if (/^u$/i.test(s) && c.pts.length) { c.pts.pop(); return true; }
    return false;
  },
  preview(c, p) { return c.pts.length ? [pv({ t: 'pline', pts: [...c.pts, p] })] : null; },
  enter(c) {
    if (c.pts.length > 1) { begin(); addEnt({ t: 'pline', pts: c.pts, closed: !!c.data.close }); commit('Polyline'); }
    endCmd();
  },
});

defc('spline', {
  hint: 'Specify first point:', group: 'draw', init: c => c.pts = [],
  point(c, p) { c.pts.push(p); hint('Specify next point or [Close/Undo]:'); },
  text(c, s) {
    if (/^c$/i.test(s) && c.pts.length > 2) { c.data.close = true; this.enter(c); return true; }
    if (/^u$/i.test(s) && c.pts.length) { c.pts.pop(); return true; }
    return false;
  },
  preview(c, p) {
    if (c.pts.length < 1) return null;
    const f = [...c.pts, p];
    return [pv({ t: 'spline', pts: f.length > 2 ? fitSpline(f, false) : f, fit: f })];
  },
  enter(c) {
    if (c.pts.length > 1) {
      begin();
      addEnt({ t: 'spline', pts: c.pts.length > 2 ? fitSpline(c.pts, !!c.data.close) : c.pts, fit: c.pts, closed: !!c.data.close, deg: 3 });
      commit('Spline');
    }
    endCmd();
  },
});

defc('rect', {
  hint: 'Specify first corner point or [Chamfer/Fillet]:', group: 'draw', init: c => c.pts = [],
  text(c, s) {
    if (c.pts.length === 1) {
      const m = s.match(/^(.+?)[x,](.+)$/i);
      if (m) {
        const w = parseLen(m[1]), h = parseLen(m[2]);
        if (!isNaN(w) && !isNaN(h)) {
          const a = c.pts[0], b = [a[0] + w, a[1] + h];
          begin(); addEnt(rectEnt(a, b, c.data)); commit('Rectangle');
          c.pts = []; hint('Specify first corner point or [Chamfer/Fillet]:'); return true;
        }
      }
    }
    const m2 = s.match(/^f\s*([\d.]+)?$/i);         /* fillet radius */
    if (m2) { c.data.fillet = parseLen(m2[1] || '0') || 0; echo('Fillet ' + fmt(c.data.fillet)); return true; }
    const m3 = s.match(/^c\s*([\d.]+)?$/i);         /* chamfer */
    if (m3) { c.data.cham = parseLen(m3[1] || '0') || 0; echo('Chamfer ' + fmt(c.data.cham)); return true; }
    return false;
  },
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length === 2) {
      begin(); addEnt(rectEnt(c.pts[0], p, c.data)); commit('Rectangle');
      c.pts = []; hint('Specify first corner point or [Chamfer/Fillet]:');
    } else hint('Specify other corner point or [Fillet/Chamfer]: · type <em>W,H</em> for an exact size');
  },
  preview(c, p) { return c.pts.length === 1 ? [pv(rectEnt(c.pts[0], p, c.data))] : null; },
});
function rectEnt(a, b, o) {
  o = o || {};
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  const r = Math.min(Math.max(o.fillet || o.cham || 0, 0), (x1 - x0) / 2, (y1 - y0) / 2);
  if (r <= 1e-9) return { t: 'pline', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true };
  if (o.cham) {
    return { t: 'pline', closed: true, pts: [
      [x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r],
      [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r]] };
  }
  const pts = [[x0 + r, y0], [x1 - r, y0]];
  const corners = [
    [[x1 - r, y0 + r], -Math.PI / 2, 0], [[x1 - r, y1 - r], 0, Math.PI / 2],
    [[x0 + r, y1 - r], Math.PI / 2, Math.PI], [[x0 + r, y0 + r], Math.PI, Math.PI * 1.5],
  ];
  const straights = [[x1, y1 - r], [x0 + r, y1], [x0, y0 + r], null];
  for (let i = 0; i < 4; i++) {
    pts.push(...arcPts({ c: corners[i][0], r, a0: corners[i][1], a1: corners[i][2] }, 12).slice(1, -1));
    if (straights[i]) pts.push(polarPt(corners[i][0], r, corners[i][2]), straights[i]);
    else pts.push(polarPt(corners[i][0], r, corners[i][2]));
  }
  return { t: 'pline', pts, closed: true };
}
defc('circle', {
  hint: 'Specify center point for circle or [3P/2P/Ttr (tan tan radius)]:', group: 'draw',
  init: c => { c.pts = []; c.mode = 'cr'; c.data = {}; },
  text(c, s) {
    if (/^2p?$/i.test(s)) { c.mode = '2p'; c.pts = []; hint('Specify first end point of circle diameter:'); return true; }
    if (/^3p?$/i.test(s)) { c.mode = '3p'; c.pts = []; hint('Specify first point on circle:'); return true; }
    if (/^t(tr)?$/i.test(s)) { c.mode = 'ttr'; c.pts = []; c.ents = []; hint('Specify point on object for first tangent of circle:'); return true; }
    if (/^d$/i.test(s)) { c.data.dia = true; cliPrint('Specify diameter of circle:'); return true; }
    if (c.mode === 'ttr' && c.ents && c.ents.length === 2) {
      const r = parseLen(s);
      if (!isNaN(r) && r > 0) { ttrCircle(c, r); return true; }
    }
    if (c.mode === 'cr' && c.pts.length === 1) {
      const d = parseLen(s);
      if (!isNaN(d) && d > 0) {
        begin(); addEnt({ t: 'circle', c: c.pts[0], r: c.data.dia ? d / 2 : d }); commit('Circle');
        c.pts = []; c.data.dia = false; hint('Specify center point for circle or [3P/2P/Ttr (tan tan radius)]:'); return true;
      }
    }
    return false;
  },
  point(c, p) {
    if (c.mode === 'ttr') {
      const e = pickAt(p, 10, x => x.t === 'line' || x.t === 'circle' || x.t === 'arc');
      if (!e) return echo('Pick a line, circle or arc');
      c.ents = c.ents || []; c.ents.push(e); c.tp = c.tp || []; c.tp.push(p);
      SEL.add(e.id);
      hint(c.ents.length === 1 ? 'Specify point on object for second tangent of circle:' : 'Specify radius of circle:');
      return;
    }
    c.pts.push(p);
    if (c.mode === 'cr' && c.pts.length === 2) { begin(); addEnt({ t: 'circle', c: c.pts[0], r: dist(c.pts[0], p) }); commit('Circle'); c.pts = []; }
    else if (c.mode === '2p' && c.pts.length === 2) { begin(); addEnt({ t: 'circle', c: mid(c.pts[0], p), r: dist(c.pts[0], p) / 2 }); commit('Circle'); c.pts = []; }
    else if (c.mode === '3p' && c.pts.length === 3) {
      const cc = circum(c.pts[0], c.pts[1], c.pts[2]);
      if (cc) { begin(); addEnt({ t: 'circle', c: cc.c, r: cc.r }); commit('Circle'); } else echo('Those points are collinear');
      c.pts = [];
    } else hint(c.mode === 'cr' ? 'Specify radius of circle or [Diameter]:' : 'Specify next point:');
  },
  preview(c, p) {
    if (c.mode === 'cr' && c.pts.length === 1) return [pv({ t: 'circle', c: c.pts[0], r: dist(c.pts[0], p) }), pv({ t: 'line', a: c.pts[0], b: p, lt: 'dashed' })];
    if (c.mode === '2p' && c.pts.length === 1) return [pv({ t: 'circle', c: mid(c.pts[0], p), r: dist(c.pts[0], p) / 2 })];
    if (c.mode === '3p' && c.pts.length === 2) { const cc = circum(c.pts[0], c.pts[1], p); return cc ? [pv({ t: 'circle', c: cc.c, r: cc.r })] : null; }
    return null;
  },
  done() { SEL.clear(); },
});
function ttrCircle(c, r) {
  const [e1, e2] = c.ents, [p1, p2] = c.tp;
  const f = filletCurves(e1, p1, e2, p2, r);
  if (!f) { echo('No circle of that radius touches both'); return; }
  begin(); addEnt({ t: 'circle', c: f.P, r }); commit('Circle');
  c.ents = []; c.tp = []; SEL.clear(); hint('Specify point on object for first tangent of circle:');
}

defc('arc', {
  hint: 'Specify start point of arc or [Center]: · <em>S</em> start-centre-end', group: 'draw',
  init: c => { c.pts = []; c.mode = '3p'; },
  text(c, s) {
    if (/^c$/i.test(s)) { c.mode = 'cse'; c.pts = []; hint('Specify center point of arc:'); return true; }
    if (/^s$/i.test(s)) { c.mode = 'sce'; c.pts = []; hint('Specify start point of arc:'); return true; }
    return false;
  },
  point(c, p) {
    c.pts.push(p);
    if (c.mode === '3p' && c.pts.length === 3) {
      const a = arc3(c.pts[0], c.pts[1], c.pts[2]);
      if (a) { begin(); addEnt(a); commit('Arc'); } else echo('Those points are collinear');
      c.pts = []; hint('Specify start point of arc or [Center]:');
    } else if (c.mode === 'cse' && c.pts.length === 3) {
      const [cc, s0, e0] = c.pts;
      begin(); addEnt({ t: 'arc', c: cc, r: dist(cc, s0), a0: ang(cc, s0), a1: ang(cc, e0) }); commit('Arc');
      c.pts = []; hint('Specify center point of arc:');
    } else if (c.mode === 'sce' && c.pts.length === 3) {
      const [s0, cc, e0] = c.pts;
      begin(); addEnt({ t: 'arc', c: cc, r: dist(cc, s0), a0: ang(cc, s0), a1: ang(cc, e0) }); commit('Arc');
      c.pts = []; hint('Specify start point of arc:');
    } else hint(c.mode === '3p' ? (c.pts.length === 1 ? 'Specify second point of arc:' : 'Specify end point of arc:')
      : c.mode === 'cse' ? (c.pts.length === 1 ? 'Specify start point of arc:' : 'Specify end point of arc:')
        : (c.pts.length === 1 ? 'Specify center point of arc:' : 'Specify end point of arc:'));
  },
  preview(c, p) {
    if (c.mode === '3p') {
      if (c.pts.length === 1) return [pv({ t: 'line', a: c.pts[0], b: p, lt: 'dashed' })];
      if (c.pts.length === 2) { const a = arc3(c.pts[0], c.pts[1], p); return a ? [pv(a)] : null; }
    } else if (c.mode === 'cse') {
      if (c.pts.length === 1) return [pv({ t: 'circle', c: c.pts[0], r: dist(c.pts[0], p), lt: 'dashed' })];
      if (c.pts.length === 2) { const cc = c.pts[0]; return [pv({ t: 'arc', c: cc, r: dist(cc, c.pts[1]), a0: ang(cc, c.pts[1]), a1: ang(cc, p) })]; }
    } else {
      if (c.pts.length === 2) { const cc = c.pts[1]; return [pv({ t: 'arc', c: cc, r: dist(cc, c.pts[0]), a0: ang(cc, c.pts[0]), a1: ang(cc, p) })]; }
      if (c.pts.length === 1) return [pv({ t: 'line', a: c.pts[0], b: p, lt: 'dashed' })];
    }
    return null;
  },
});

defc('ellipse', {
  hint: 'Specify center of ellipse or [Axis endpoint]:', group: 'draw', init: c => { c.pts = []; c.mode = 'c'; },
  text(c, s) { if (/^a$/i.test(s)) { c.mode = 'a'; c.pts = []; hint('Specify axis endpoint of ellipse:'); return true; } return false; },
  point(c, p) {
    c.pts.push(p);
    const need = 3;
    if (c.pts.length === need) {
      const e = c.mode === 'a' ? ellipseFromAxis(c.pts) : ellipseFromCentre(c.pts);
      if (e) { begin(); addEnt(e); commit('Ellipse'); }
      c.pts = []; hint(c.mode === 'a' ? 'Specify axis endpoint of ellipse:' : 'Specify center of ellipse or [Axis endpoint]:');
    } else hint(c.pts.length === 1 ? (c.mode === 'a' ? 'Specify other endpoint of axis:' : 'Specify endpoint of axis:') : 'Specify distance to other axis:');
  },
  preview(c, p) {
    if (c.pts.length === 1) return [pv({ t: 'line', a: c.pts[0], b: p, lt: 'dashed' })];
    if (c.pts.length === 2) {
      const e = c.mode === 'a' ? ellipseFromAxis([...c.pts, p]) : ellipseFromCentre([...c.pts, p]);
      return e ? [pv(e)] : null;
    }
    return null;
  },
});
function ellipseFromCentre(p) {
  const cc = p[0], rx = dist(cc, p[1]);
  if (rx < EPS) return null;
  return { t: 'ellipse', c: cc, rx, ry: Math.max(segDist(p[2], cc, p[1]), 1e-6), rot: ang(cc, p[1]) };
}
function ellipseFromAxis(p) {
  const cc = mid(p[0], p[1]), rx = dist(p[0], p[1]) / 2;
  if (rx < EPS) return null;
  return { t: 'ellipse', c: cc, rx, ry: Math.max(segDist(p[2], p[0], p[1]), 1e-6), rot: ang(p[0], p[1]) };
}

defc('polygon', {
  hint: 'Enter number of sides <6>:', group: 'draw',
  init: c => { c.pts = []; c.n = 6; c.insc = true; },
  text(c, s) {
    if (!c.pts.length) { const n = parseInt(s); if (n >= 3 && n <= 200) { c.n = n; hint('Specify center of polygon or [Inscribed in circle/Circumscribed about circle]:'); return true; } }
    if (/^i$/i.test(s)) { c.insc = true; cliPrint('Inscribed in circle'); return true; }
    if (/^c$/i.test(s)) { c.insc = false; cliPrint('Circumscribed about circle'); return true; }
    if (c.pts.length === 1) {
      const r = parseLen(s);
      if (!isNaN(r) && r > 0) {
        begin(); addEnt(polyGon(c.pts[0], r, c.n, 0, c.insc)); commit('Polygon'); c.pts = []; hint('Specify center of polygon or [Inscribed in circle/Circumscribed about circle]:'); return true;
      }
    }
    return false;
  },
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length === 2) {
      begin(); addEnt(polyGon(c.pts[0], dist(c.pts[0], p), c.n, ang(c.pts[0], p), c.insc)); commit('Polygon');
      c.pts = []; hint('Specify center of polygon or [Inscribed in circle/Circumscribed about circle]:');
    } else hint('Specify radius of circle:');
  },
  preview(c, p) {
    return c.pts.length === 1 ? [pv(polyGon(c.pts[0], dist(c.pts[0], p), c.n, ang(c.pts[0], p), c.insc))] : null;
  },
});

defc('donut', {
  hint: 'Specify inside diameter of donut:', group: 'draw', init: c => { c.pts = []; c.id_ = null; c.od = null; },
  text(c, s) {
    const v = parseLen(s);
    if (isNaN(v)) return false;
    if (c.id_ === null) { c.id_ = v; hint('Specify outside diameter of donut:'); return true; }
    if (c.od === null) { c.od = v; hint('Specify center of donut:'); return true; }
    return false;
  },
  point(c, p) {
    if (c.id_ === null || c.od === null) { cliPrint('Specify the inside and outside diameters first.', 'err'); return; }
    begin();
    if (c.id_ > 0) addEnt({ t: 'circle', c: p, r: c.id_ / 2 });
    addEnt({ t: 'circle', c: p, r: c.od / 2 });
    commit('Donut');
  },
  preview(c, p) {
    if (c.id_ === null || c.od === null) return null;
    const o = [pv({ t: 'circle', c: p, r: c.od / 2 })];
    if (c.id_ > 0) o.push(pv({ t: 'circle', c: p, r: c.id_ / 2 }));
    return o;
  },
});

defc('xline', {
  hint: 'Specify a point:', group: 'draw', init: c => c.pts = [],
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length === 2) {
      begin(); addEnt({ t: 'xline', a: c.pts[0], d: norm(sub(p, c.pts[0])), lt: 'dashdot' }); commit('Construction line');
      c.pts = [c.pts[0]]; hint('Specify through point:');
    } else hint('Specify through point:');
  },
  preview: (c, p) => c.pts.length ? [pv({ t: 'xline', a: c.pts[0], d: norm(sub(p, c.pts[0])), lt: 'dashdot' })] : null,
});
defc('ray', {
  hint: 'Specify start point:', group: 'draw', init: c => c.pts = [],
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length === 2) {
      begin(); addEnt({ t: 'ray', a: c.pts[0], d: norm(sub(p, c.pts[0])), lt: 'dashdot' }); commit('Ray');
      c.pts = [c.pts[0]]; hint('Specify through point:');
    } else hint('Specify through point:');
  },
  preview: (c, p) => c.pts.length ? [pv({ t: 'ray', a: c.pts[0], d: norm(sub(p, c.pts[0])), lt: 'dashdot' })] : null,
});

defc('revcloud', {
  hint: 'Guide crosshairs along the cloud path · <em>Enter</em> to close', group: 'draw',
  init: c => { c.pts = []; c.arc = DOC.revArc || 500; },
  text(c, s) { const v = parseLen(s); if (!isNaN(v) && v > 0) { c.arc = DOC.revArc = v; cliPrint('Arc length ' + fmt(v)); return true; } return false; },
  point(c, p) {
    if (!c.pts.length || dist(c.pts[c.pts.length - 1], p) > c.arc * 0.8) c.pts.push(p);
  },
  preview(c, p) {
    const pts = [...c.pts, p];
    return pts.length > 2 ? [pv({ t: 'pline', pts: revCloud(pts, c.arc, false) })] : null;
  },
  enter(c) {
    if (c.pts.length > 2) { begin(); addEnt({ t: 'pline', pts: revCloud(c.pts, c.arc, true), closed: true }); commit('Revision cloud'); }
    endCmd();
  },
});
function revCloud(pts, r, closed) {
  const out = [];
  const P = closed ? [...pts, pts[0]] : pts;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], L = dist(a, b);
    if (L < 1e-9) continue;
    const n = Math.max(1, Math.round(L / r));
    const seg = L / n, rr = seg / 2;
    const u = norm(sub(b, a)), nn = perp(u);
    for (let k = 0; k < n; k++) {
      const c0 = add(a, mul(u, seg * (k + .5)));
      const base = Math.atan2(u[1], u[0]);
      for (let s = 0; s <= 8; s++) {
        const t = Math.PI - (s / 8) * Math.PI;
        out.push([c0[0] + rr * Math.cos(base + t), c0[1] + rr * Math.sin(base + t)]);
      }
    }
  }
  return out.length > 2 ? out : pts;
}

defc('point', {
  hint: 'Specify a point:', group: 'draw',
  point(c, p) { begin(); addEnt({ t: 'point', p }); commit('Point'); },
});

defc('text', {
  hint: 'Specify start point of text:', group: 'annotate', init: c => { c.pts = []; },
  point(c, p) { c.pts = [p]; hint('Enter text: · <em>Enter</em> when done'); focusCmd(); },
  text(c, s) {
    if (!c.pts.length) return false;
    if (!s) { endCmd(); return true; }
    begin();
    addEnt({ t: 'text', p: c.pts[0], s, h: DOC.textH, rot: 0, anchor: 'l', layer: annoLayer('TEXT') });
    commit('Text'); endCmd(); return true;
  },
});
defc('mtext', {
  hint: 'Specify first corner:', group: 'annotate', init: c => { c.pts = []; },
  point(c, p) {
    c.pts = [p];
    modal(`<h3>Multiline text</h3>
      <div class="row"><label>Text</label><textarea class="f" id="mtx" rows="5" style="resize:vertical"></textarea></div>
      <div class="row"><label>Height</label><input class="f" id="mth" value="${+(DOC.textH / U[DOC.units]).toFixed(4)}"></div>`, () => {
      const raw = $('#mtx').value.replace(/\r/g, ''); if (!raw.trim()) return endCmd();
      const h = parseLen($('#mth').value) || DOC.textH;
      begin();
      raw.split('\n').forEach((ln, i) => {
        if (!ln.trim()) return;
        addEnt({ t: 'text', p: [p[0], p[1] - i * h * 1.55], s: ln, h, rot: 0, anchor: 'l', layer: annoLayer('TEXT') });
      });
      commit('Text'); endCmd();
    });
  },
});
function annoLayer(n) { return hasLayer(n) ? n : DOC.cur; }
function dimLayer() { return annoLayer('DIMENSIONS'); }

defc('leader', {
  hint: 'Specify leader arrowhead location:', group: 'annotate', init: c => c.pts = [],
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length < 2) return hint('Specify landing point:');
    hint('Enter annotation text: · <em>Enter</em> when done'); focusCmd();
  },
  text(c, s) {
    if (c.pts.length < 2 || !s) return false;
    begin();
    const a = c.pts[0], b = c.pts[1];
    const dir = b[0] >= a[0] ? 1 : -1;
    const tail = [b[0] + dir * DOC.textH * 3, b[1]];
    addEnt({ t: 'pline', pts: [a, b, tail], layer: dimLayer() });
    const ah = DOC.textH * 0.8, u = norm(sub(b, a));
    addEnt({ t: 'pline', pts: arrowPoly(a, ang(b, a), ah), closed: true, fill: true, layer: dimLayer() });
    addEnt({ t: 'text', p: [tail[0] + dir * DOC.textH * .3, tail[1] + DOC.textH * .3], s, h: DOC.textH,
      rot: 0, anchor: dir > 0 ? 'l' : 'r', layer: dimLayer() });
    commit('Leader'); endCmd(); return true;
  },
  preview(c, p) { return c.pts.length === 1 ? [pv({ t: 'line', a: c.pts[0], b: p })] : null; },
});

/* --- dimensions --- */
/** DIMLINEAR picks horizontal or vertical from where the dimension line is
    dragged: pull it sideways and you are measuring Y, pull it up or down and
    you are measuring X. Exactly what AutoCAD does with the same two points. */
function linearK(a, b, o) {
  const m = mid(a, b);
  return Math.abs(o[0] - m[0]) > Math.abs(o[1] - m[1]) ? 'vertical' : 'horizontal';
}
const DIM_PROMPT = {
  radius: 'Select arc or circle:', diameter: 'Select arc or circle:',
  angular: 'Specify vertex point:',
};
/** The geometry the current snap came from, if it came from any. This is how
    a dimension ends up attached to a wall rather than to a pair of numbers: at
    the moment of the pick the snap knows what it hit, and a moment later
    nothing does. */
function snapRef() {
  const m = ST.snap && ST.snap.meta;
  if (!m || m.id == null) return null;
  return DOC.ents.get(m.id) ? { id: m.id, at: m.at } : null;
}
/** attach r1/r2 only when there is something to attach to, so a plain
    dimension stays a plain object in the saved file */
function withRefs(d, refs) {
  if (refs && refs[0]) d.r1 = refs[0];
  if (refs && refs[1]) d.r2 = refs[1];
  return d;
}
defc('dim', {
  hint: 'Specify first extension line origin or [Linear/ALigned/ANgular/Radius/Diameter/Horizontal/Vertical]:',
  group: 'annotate',
  init(c) { c.pts = []; c.k = (c.arg && c.arg.k) || 'aligned'; if (c.arg && c.arg.k) hint(DIM_PROMPT[c.k] || 'Specify first extension line origin:'); },
  text(c, s) {
    const map = { r: 'radius', d: 'diameter', an: 'angular', h: 'horizontal', v: 'vertical', al: 'aligned', l: 'linear' };
    const k = map[s.toLowerCase()];
    if (k) { c.k = k; c.pts = []; hint(DIM_PROMPT[k] || 'Specify first extension line origin:'); return true; }
    return false;
  },
  point(c, p) {
    if (c.k === 'radius' || c.k === 'diameter') {
      const e = pickAt(p, 10, x => x.t === 'circle' || x.t === 'arc');
      if (!e) return echo('Pick a circle or an arc');
      begin();
      addEnt({ t: 'dim', k: c.k, p1: e.c, p2: [e.c[0] + e.r * Math.cos(ang(e.c, p)), e.c[1] + e.r * Math.sin(ang(e.c, p))], layer: dimLayer() });
      commit('Dimension');
      return;
    }
    if (c.k === 'angular') {
      c.pts.push(p);
      if (c.pts.length === 3) {
        begin();
        addEnt({ t: 'dim', k: 'angular', p3: c.pts[0], p1: c.pts[1], p2: c.pts[2], off: dist(c.pts[0], c.pts[1]) * .25, layer: dimLayer() });
        commit('Dimension'); c.pts = [];
      } else hint(c.pts.length === 1 ? 'Specify first angle endpoint:' : 'Specify second angle endpoint:');
      return;
    }
    c.pts.push(p);
    (c.refs || (c.refs = [])).push(snapRef());
    if (c.pts.length === 3) {
      const [a, b, o] = c.pts;
      const k = c.k === 'linear' ? linearK(a, b, o) : c.k;
      const u = k === 'horizontal' ? [1, 0] : k === 'vertical' ? [0, 1] : norm(sub(b, a));
      const off = dot(sub(o, a), perp(u));
      begin();
      addEnt(withRefs({ t: 'dim', k, p1: a, p2: b, off, layer: dimLayer() }, c.refs));
      commit('Dimension');
      c.pts = []; c.refs = []; hint('Specify first extension line origin:');
    } else hint(c.pts.length === 1 ? 'Specify second extension line origin:' : 'Specify dimension line location:');
  },
  preview(c, p) {
    if (c.pts.length === 2 && c.k !== 'angular') {
      const [a, b] = c.pts;
      const k = c.k === 'linear' ? linearK(a, b, p) : c.k;
      const u = k === 'horizontal' ? [1, 0] : k === 'vertical' ? [0, 1] : norm(sub(b, a));
      return [pv({ t: 'dim', k, p1: a, p2: b, off: dot(sub(p, a), perp(u)), layer: dimLayer() })];
    }
    if (c.pts.length === 1) return [pv({ t: 'line', a: c.pts[0], b: p, lt: 'dashed' })];
    return null;
  },
});
defc('dimcont', {
  hint: 'Specify a second extension line origin:', group: 'annotate',
  init(c) {
    const dims = [...DOC.ents.values()].filter(e => e.t === 'dim' && e.k !== 'angular' && e.k !== 'radius' && e.k !== 'diameter');
    c.base = dims[dims.length - 1];
    if (!c.base) { echo('Draw a linear dimension first'); endCmd(); }
  },
  point(c, p) {
    if (!c.base) return;
    begin();
    const n = addEnt({ t: 'dim', k: c.base.k, p1: c.base.p2, p2: p, off: c.base.off, layer: dimLayer() });
    commit('Dimension'); c.base = n;
  },
  preview(c, p) { return c.base ? [pv({ t: 'dim', k: c.base.k, p1: c.base.p2, p2: p, off: c.base.off })] : null; },
});

/* ============================================================
   Undo: steps, groups and marks
   ------------------------------------------------------------
   `commit()` stamps every patch with a sequence number and, if a
   group is open, the group it belongs to. That is all UNDO needs
   to offer AutoCAD's Mark/Back and BEgin/End: a mark is a
   sequence number, and a group undoes as one operation because
   its patches all carry the same tag.
   ============================================================ */
function undoStep() {
  if (!HIST.past.length) { cliPrint('Nothing to undo'); return false; }
  const g = HIST.past[HIST.past.length - 1].grp;
  undo();
  if (g) while (HIST.past.length && HIST.past[HIST.past.length - 1].grp === g) undo();
  return true;
}
function redoStep() {
  if (!HIST.future.length) { cliPrint('Nothing to redo'); return false; }
  const g = HIST.future[HIST.future.length - 1].grp;
  redo();
  if (g) while (HIST.future.length && HIST.future[HIST.future.length - 1].grp === g) redo();
  return true;
}
function undoN(n) {
  let done = 0;
  for (let i = 0; i < n; i++) { if (!undoStep()) break; done++; }
  return done;
}
function undoMark() { HIST.marks.push(HIST.seq); cliPrint('Mark placed'); }
function undoBack() {
  if (!HIST.marks.length) { cliPrint('No mark has been placed. Use UNDO Mark first.', 'warn'); return 0; }
  const m = HIST.marks.pop();
  let n = 0;
  while (HIST.past.length && HIST.past[HIST.past.length - 1].seq > m) { undo(); n++; }
  cliPrint(n + ' operation' + (n === 1 ? '' : 's') + ' undone back to the mark');
  return n;
}
function undoGroupBegin() { HIST.group = ++HIST.groupSeq; cliPrint('Group begun'); }
function undoGroupEnd() { HIST.group = 0; cliPrint('Group ended'); }

/* ============================================================
   View commands — ZOOM and PAN, both transparent
   ============================================================ */
const VHIST = [];                                 /* ZOOM Previous stack */
function viewPush() {
  VHIST.push({ z: V.z, px: V.px, py: V.py, rot: V.rot });
  if (VHIST.length > 20) VHIST.shift();
}
function viewPop() {
  const v = VHIST.pop();
  if (!v) { cliPrint('No previous view.', 'warn'); return false; }
  V.z = v.z; V.px = v.px; V.py = v.py; V.rot = v.rot;
  draw(); if (typeof syncNav === 'function') syncNav();
  return true;
}
function docLimits() { return DOC.limits || [[0, 0], [420000, 297000]]; }
/** ZOOM All: the limits, or the extents when the drawing spills past them */
function zoomAll() {
  const L = docLimits();
  const b = bboxAll([...DOC.ents.values()].filter(visible));
  const box = b
    ? [Math.min(L[0][0], b[0]), Math.min(L[0][1], b[1]), Math.max(L[1][0], b[2]), Math.max(L[1][1], b[3])]
    : [L[0][0], L[0][1], L[1][0], L[1][1]];
  fit([{ t: 'line', a: [box[0], box[1]], b: [box[2], box[3]], layer: DOC.cur }]);
}
function zoomCenter(p, h) {
  if (h > 0) V.z = clamp(V.h / h, 1e-6, 20000);
  const s = w2s(p);
  V.px += V.w / 2 - s[0]; V.py += V.h / 2 - s[1];
  draw();
}
function zoomWindow(a, b) {
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
  const cr = Math.cos(V.rot), sr = Math.sin(V.rot);
  const cs = [a, [b[0], a[1]], b, [a[0], b[1]]].map(p => [p[0] * cr - p[1] * sr, p[0] * sr + p[1] * cr]);
  const xs = cs.map(p => p[0]), ys = cs.map(p => p[1]);
  const w = Math.max(Math.max(...xs) - Math.min(...xs), 1e-6);
  const h = Math.max(Math.max(...ys) - Math.min(...ys), 1e-6);
  V.z = clamp(Math.min(V.w / w, V.h / h), 1e-6, 20000);
  zoomCenter([cx, cy], 0);
}
const ZOOM_PROMPT = 'Specify corner of window, enter a scale factor (nX or nXP), or [All/Center/Dynamic/Extents/Previous/Scale/Window/Object]:';
defc('zoom', {
  group: 'view', hint: ZOOM_PROMPT,
  init(c) {
    c.pts = []; c.mode = 'win';
    if (c.arg && c.arg.opt) { if (this.text(c, c.arg.opt)) return; }
  },
  text(c, s) {
    const k = String(s).trim().toLowerCase();
    if (k === 'a') { viewPush(); zoomAll(); endCmd(); return true; }
    if (k === 'e') { viewPush(); fit(); endCmd(); return true; }
    if (k === 'p') { viewPop(); endCmd(); return true; }
    if (k === 'o') {
      if (!SEL.size) { cliPrint('Select objects first, then ZOOM Object.', 'warn'); endCmd(); return true; }
      viewPush(); fit(selEnts()); endCmd(); return true;
    }
    if (k === 'd') { cliPrint('Dynamic zoom is not available; use Window or Extents.', 'warn'); return true; }
    if (k === 'c') { c.mode = 'cen'; c.pts = []; hint('Specify center point:'); return true; }
    if (k === 'w') { c.mode = 'win'; c.pts = []; hint('Specify first corner:'); return true; }
    if (k === 's') { hint('Enter a scale factor (nX or nXP):'); return true; }
    /* 2x / 0.5x relative to the current view, plain n relative to the limits */
    const m = k.match(/^(-?[\d.]+)(xp?)?$/);
    if (m) {
      const n = parseFloat(m[1]);
      if (!isFinite(n) || n <= 0) return true;
      viewPush();
      if (m[2]) zoomAt(V.w / 2, V.h / 2, n);
      else {
        const L = docLimits();
        const h = Math.max(L[1][1] - L[0][1], 1e-6);
        zoomCenter(s2w(V.w / 2, V.h / 2), h / n);
      }
      endCmd(); return true;
    }
    if (c.mode === 'cen' && c.pts.length === 1) {
      const h = parseLen(s);
      if (!isNaN(h) && h > 0) { viewPush(); zoomCenter(c.pts[0], h); endCmd(); return true; }
    }
    return false;
  },
  point(c, p) {
    c.pts.push(p);
    if (c.mode === 'cen') {
      if (c.pts.length === 1) { hint('Enter magnification or height:'); return; }
      return;
    }
    if (c.pts.length === 1) { hint('Specify opposite corner:'); return; }
    viewPush(); zoomWindow(c.pts[0], p); endCmd();
  },
  preview(c, p) {
    if (c.mode !== 'win' || c.pts.length !== 1) return null;
    const a = c.pts[0];
    return [pv({ t: 'pline', pts: [a, [p[0], a[1]], p, [a[0], p[1]]], closed: true, lt: 'dashed' })];
  },
  enter() { endCmd(); },
});
defc('pan', {
  group: 'view',
  hint: 'Press Esc or Enter to exit · drag to pan',
  init(c) { ST.panMode = true; },
  done() { ST.panMode = false; },
  point() { },
  enter() { endCmd(); },
});

/* ============================================================
   Settings commands — the command-line half of the status bar
   ============================================================ */
defc('gridcmd', {
  group: 'view',
  hint: 'Specify grid spacing(X) or [ON/OFF/Snap]:',
  text(c, s) {
    const k = String(s).trim().toLowerCase();
    if (k === 'on' || k === 'off') { ST.grid = k === 'on'; syncToggles(); draw(); endCmd(); return true; }
    if (k === 's') { DOC.gridStep = DOC.snapStep; if (typeof buildDrawSettings === 'function') buildDrawSettings(); draw(); endCmd(); return true; }
    const v = parseLen(s);
    if (!isNaN(v) && v > 0) {
      DOC.gridStep = v; ST.grid = true; syncToggles();
      if (typeof buildDrawSettings === 'function') buildDrawSettings();
      draw(); endCmd(); return true;
    }
    return false;
  },
  point() { },
  enter() { endCmd(); },
});
defc('snapcmd', {
  group: 'view',
  hint: 'Specify snap spacing or [ON/OFF]:',
  text(c, s) {
    const k = String(s).trim().toLowerCase();
    if (k === 'on' || k === 'off') { ST.snapgrid = k === 'on'; syncToggles(); draw(); endCmd(); return true; }
    const v = parseLen(s);
    if (!isNaN(v) && v > 0) {
      DOC.snapStep = v; ST.snapgrid = true; syncToggles();
      if (typeof buildDrawSettings === 'function') buildDrawSettings();
      draw(); endCmd(); return true;
    }
    return false;
  },
  point() { },
  enter() { endCmd(); },
});
defc('orthocmd', {
  group: 'view',
  hint: 'Enter mode [ON/OFF]:',
  text(c, s) {
    const k = String(s).trim().toLowerCase();
    if (k !== 'on' && k !== 'off') return false;
    ST.ortho = k === 'on'; syncToggles(); draw(); endCmd(); return true;
  },
  point() { },
  enter() { endCmd(); },
});
/* -OSNAP takes the same comma list AutoCAD takes: END,MID,CEN or NONE */
const OSNAP_WORD = {
  end: 'end', endp: 'end', endpoint: 'end', mid: 'mid', midpoint: 'mid',
  cen: 'cen', center: 'cen', centre: 'cen', nod: 'node', node: 'node',
  qua: 'quad', quad: 'quad', quadrant: 'quad', int: 'int', intersection: 'int',
  per: 'perp', perp: 'perp', perpendicular: 'perp', tan: 'tan', tangent: 'tan',
  nea: 'near', near: 'near', nearest: 'near', ext: 'ext', extension: 'ext',
  wcen: 'wcen', wface: 'wface',
};
defc('osnapcmd', {
  group: 'view',
  hint: 'Enter list of object snap modes:',
  text(c, s) {
    const words = String(s).toLowerCase().split(/[,\s]+/).filter(Boolean);
    if (!words.length) return false;
    if (words[0] === 'none' || words[0] === 'off') {
      for (const k of Object.keys(ST.osnapOn)) ST.osnapOn[k] = 0;
      cliPrint('Running object snaps cleared'); draw(); endCmd(); return true;
    }
    const on = [];
    for (const w of words) { const k = OSNAP_WORD[w]; if (k) on.push(k); }
    if (!on.length) { cliPrint('Invalid object snap mode.', 'err'); return true; }
    for (const k of Object.keys(ST.osnapOn)) ST.osnapOn[k] = 0;
    for (const k of on) ST.osnapOn[k] = 1;
    ST.osnap = true; syncToggles();
    cliPrint('Object snap: ' + on.map(k => snapKindLabel(k)).join(', '));
    draw(); endCmd(); return true;
  },
  point() { },
  enter() { endCmd(); },
});
defc('unitscmd', {
  group: 'view',
  hint: 'Enter drawing unit [Millimetres/Centimetres/Metres/Inches/Feet]:',
  text(c, s) {
    const k = String(s).trim().toLowerCase();
    const map = { mm: 'mm', m: 'm', c: 'cm', cm: 'cm', me: 'm', i: 'in', in: 'in', f: 'ft', ft: 'ft' };
    const u = map[k];
    if (!u) return false;
    setvar('INSUNITS', { in: 1, ft: 2, mm: 4, cm: 5, m: 6 }[u]);
    cliPrint('Units: ' + u);
    endCmd(); return true;
  },
  point() { },
  enter() { endCmd(); },
});
defc('limits', {
  group: 'view',
  hint: 'Specify lower left corner or [ON/OFF]:',
  init(c) { c.pts = []; },
  text(c, s) {
    const k = String(s).trim().toLowerCase();
    if (k === 'on' || k === 'off') { DOC.limCheck = k === 'on'; endCmd(); return true; }
    return false;
  },
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length === 1) { hint('Specify upper right corner:'); return; }
    const [a, b] = c.pts;
    DOC.limits = [[Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.max(a[1], b[1])]];
    cliPrint('Limits ' + fmt(DOC.limits[0][0]) + ',' + fmt(DOC.limits[0][1]) +
      ' to ' + fmt(DOC.limits[1][0]) + ',' + fmt(DOC.limits[1][1]));
    endCmd();
  },
  preview(c, p) {
    if (c.pts.length !== 1) return null;
    const a = c.pts[0];
    return [pv({ t: 'pline', pts: [a, [p[0], a[1]], p, [a[0], p[1]]], closed: true, lt: 'dashed' })];
  },
});
defc('linetype', {
  group: 'view',
  hint: 'Enter linetype name or [?] <BYLAYER>:',
  text(c, s) {
    const k = String(s).trim().toLowerCase();
    if (k === '?') { cliPrint('Linetypes: BYLAYER, ' + Object.keys(DASH).join(', ')); return true; }
    if (k === 'bylayer' || LTDEF[k]) {
      setvar('CELTYPE', k);
      cliPrint('Current linetype: ' + getvar('CELTYPE'));
      endCmd(); return true;
    }
    cliPrint('Cannot find linetype "' + s + '".', 'err');
    return true;
  },
  point() { },
  enter() { endCmd(); },
});
defc('lweight', {
  group: 'view',
  hint: 'Enter default lineweight in mm or [BYLAYER]:',
  text(c, s) {
    if (/^b/i.test(s)) { setvar('CELWEIGHT', -1); cliPrint('Current lineweight: BYLAYER'); endCmd(); return true; }
    const v = parseFloat(s);
    if (!isFinite(v)) return false;
    setvar('CELWEIGHT', v);
    cliPrint('Current lineweight: ' + getvar('CELWEIGHT'));
    endCmd(); return true;
  },
  point() { },
  enter() { endCmd(); },
});
defc('layercmd', {
  group: 'view',
  hint: 'Enter an option [?/Make/Set/New/ON/OFF/Lock/Unlock]:',
  init(c) { c.op = null; },
  text(c, s) {
    const k = String(s).trim();
    if (!c.op) {
      const lo = k.toLowerCase();
      if (lo === '?') { layerReport(); endCmd(); return true; }
      const ops = { m: 'make', s: 'set', n: 'new', on: 'on', off: 'off', l: 'lock', u: 'unlock' };
      if (ops[lo]) { c.op = ops[lo]; hint('Enter layer name:'); return true; }
      return false;
    }
    layerOp(c.op, k);
    endCmd(); return true;
  },
  point() { },
  enter() { endCmd(); },
});
function layerReport() {
  cliPrint('Layers:');
  for (const l of DOC.layers) {
    cliPrint('  ' + (l.name === DOC.cur ? '*' : ' ') + ' ' + l.name.padEnd(16) +
      (l.on ? ' On ' : ' Off') + (l.lock ? ' Locked' : '      ') + '  ' + l.color);
  }
}
function layerOp(op, name) {
  if (!name) { cliPrint('Enter a layer name.', 'err'); return; }
  if (op === 'make' || op === 'new') {
    if (!hasLayer(name)) {
      begin(); touchLayers(); DOC.layers.push(newLayer(name, '#ffd166'));
      if (op === 'make') DOC.cur = name;
      commit('Layer added');
    } else if (op === 'make') { setvar('CLAYER', name); }
    if (typeof buildLayers === 'function') buildLayers();
    cliPrint('Layer "' + name + '"' + (op === 'make' ? ' is current' : ' created'));
    return;
  }
  if (!hasLayer(name)) { cliPrint('Cannot find layer "' + name + '".', 'err'); return; }
  if (op === 'set') { setvar('CLAYER', name); cliPrint('Current layer: ' + name); return; }
  const l = layer(name);
  begin(); touchLayers();
  if (op === 'on') l.on = true;
  else if (op === 'off') l.on = false;
  else if (op === 'lock') l.lock = true;
  else if (op === 'unlock') l.lock = false;
  commit('Layer ' + op);
  if (typeof buildLayers === 'function') buildLayers();
  draw();
  cliPrint('Layer "' + name + '" ' + op);
}

/* ============================================================
   SETVAR, ALIAS and MULTIPLE
   ============================================================ */
defc('setvar', {
  group: 'inquiry',
  hint: 'Enter variable name or [?]:',
  init(c) {
    c.v = null;
    if (c.arg && c.arg.name && SYSVAR[c.arg.name]) { c.v = SYSVAR[c.arg.name]; askVar(c); }
  },
  text(c, s) {
    const k = String(s).trim();
    if (!c.v) {
      if (k === '?' || k === '*') { varReport('*'); endCmd(); return true; }
      const v = SYSVAR[k.toUpperCase()];
      if (!v) {
        if (/[*?]/.test(k)) { varReport(k); endCmd(); return true; }
        cliPrint('Unknown variable name "' + k + '".  Type ? for a list.', 'err');
        return true;
      }
      c.v = v; askVar(c); return true;
    }
    if (c.v.ro) { cliPrint(c.v.name + ' is read only.', 'warn'); endCmd(); return true; }
    const val = varParse(c.v, k);
    if (val === undefined) { cliPrint('Requires a ' + c.v.type + ' value.', 'err'); return true; }
    c.v.set(val);
    cliPrint(c.v.name + ' = ' + varStr(c.v));
    endCmd(); return true;
  },
  point() { },
  enter(c) {
    if (c.v && !c.v.ro) cliPrint(c.v.name + ' = ' + varStr(c.v) + ' (unchanged)');
    endCmd();
  },
});
function askVar(c) {
  const v = c.v;
  if (v.ro) { cliPrint(v.name + ' = ' + varStr(v) + '  (read only)'); endCmd(); return; }
  hint('Enter new value for ' + v.name + ' <' + varStr(v) + '>:');
}
/** SETVAR ? — the variable table, filtered by a `*` pattern */
function varReport(pattern) {
  const rx = new RegExp('^' + String(pattern || '*').replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
  const names = varNames().filter(n => rx.test(n));
  if (!names.length) { cliPrint('No variable matches "' + pattern + '".', 'warn'); return; }
  for (const n of names) {
    const v = SYSVAR[n];
    cliPrint('  ' + n.padEnd(18) + varStr(v).padEnd(14) + (v.ro ? '(read only) ' : '') + (v.desc || ''));
  }
}
defc('aliascmd', {
  group: 'inquiry',
  hint: 'Enter alias or [?/Delete]:',
  init(c) { c.a = null; c.del = false; },
  text(c, s) {
    const k = String(s).trim();
    if (!c.a && !c.del) {
      if (k === '?') { aliasReport(); endCmd(); return true; }
      if (/^d$/i.test(k)) { c.del = true; hint('Enter alias to delete:'); return true; }
      if (!/^[A-Za-z0-9]{1,10}$/.test(k)) { cliPrint('An alias is 1–10 letters or digits.', 'err'); return true; }
      c.a = k.toLowerCase();
      hint('Enter command name for "' + k.toUpperCase() + '":');
      return true;
    }
    if (c.del) {
      const a = k.toLowerCase();
      if (USERALIAS[a]) { delete USERALIAS[a]; cliPrint('Alias ' + k.toUpperCase() + ' deleted'); }
      else cliPrint('No user alias "' + k.toUpperCase() + '".', 'warn');
      endCmd(); return true;
    }
    const r = resolveWord(k);
    if (!r || r.kind === 'var') { cliPrint('Unknown command "' + k.toUpperCase() + '".', 'err'); return true; }
    USERALIAS[c.a] = r.name;
    cliPrint(c.a.toUpperCase() + ' = ' + r.name);
    endCmd(); return true;
  },
  point() { },
  enter() { endCmd(); },
});
function aliasReport() {
  const u = Object.keys(USERALIAS).sort();
  cliPrint('User aliases: ' + (u.length ? u.map(a => a.toUpperCase() + '=' + USERALIAS[a]).join('  ') : '(none)'));
  const std = Object.keys(ALIAS).sort();
  cliPrint('Standard aliases (' + std.length + '): ' + std.map(a => a.toUpperCase() + '=' + ALIAS[a]).join('  '));
}
defc('multiple', {
  group: 'view',
  hint: 'Enter command name to repeat:',
  text(c, s) {
    const r = resolveWord(s);
    if (!r || r.kind !== 'cmd') { cliPrint('Unknown command "' + String(s).toUpperCase() + '".', 'err'); endCmd(); return true; }
    CLI.multiple = r.key;
    startCmd(r.key, r.opt, true);
    if (CLI.echo) cliPrint('Command: ' + r.name);
    return true;
  },
  point() { },
  enter() { endCmd(); },
});
defc('undocmd', {
  group: 'view',
  hint: 'Enter the number of operations to undo or [Auto/Control/BEgin/End/Mark/Back] <1>:',
  init(c) { c.ctl = false; },
  text(c, s) {
    const k = String(s).trim().toLowerCase();
    if (c.ctl) {
      if (k === 'a') { HIST.depth = 200; cliPrint('Undo: all'); }
      else if (k === 'n') { HIST.depth = 0; HIST.past.length = 0; HIST.weight = 0; cliPrint('Undo: none'); }
      else if (k === 'o') { HIST.depth = 1; cliPrint('Undo: one'); }
      else { cliPrint('Invalid option keyword.', 'err'); return true; }
      endCmd(); return true;
    }
    if (k === 'm') { undoMark(); endCmd(); return true; }
    if (k === 'b') { undoBack(); endCmd(); return true; }
    if (k === 'be') { undoGroupBegin(); endCmd(); return true; }
    if (k === 'e') { undoGroupEnd(); endCmd(); return true; }
    if (k === 'a') { cliPrint('Undo Auto is always on: one command is one undo step.'); endCmd(); return true; }
    if (k === 'c') { c.ctl = true; hint('Enter an UNDO control option [All/None/One] <All>:'); return true; }
    const n = parseInt(k, 10);
    if (isFinite(n) && n > 0) { cliPrint(undoN(n) + ' operation(s) undone'); endCmd(); return true; }
    return false;
  },
  point() { },
  enter() { undoStep(); endCmd(); },
});

/* ============================================================
   META — commands that act at once and have no prompts
   ============================================================ */
function defm(name, fn, o) {
  META[name.toLowerCase()] = Object.assign({ name: name.toUpperCase(), fn, group: 'view' }, o || {});
}
function selectAll() {
  SEL.clear();
  for (const e of DOC.ents.values()) if (pickable(e)) SEL.add(e.id);
  if (typeof syncUI === 'function') syncUI();
  draw();
}
defm('U', () => undoStep());
defm('REDO', () => redoStep());
defm('MREDO', () => redoStep());
defm('REGEN', () => { idxInvalidate(); draw(); cliPrint('Regenerating model.'); });
defm('REGENALL', () => { idxInvalidate(); draw(); cliPrint('Regenerating model.'); });
defm('REDRAW', () => draw());
defm('REDRAWALL', () => draw());
defm('QSAVE', () => doSave());
defm('SAVE', () => doSave());
defm('SAVEAS', () => doExport());
defm('EXPORT', () => doExport());
defm('OPEN', () => { const f = $('#fileIn'); if (f) f.click(); });
defm('NEW', () => doNew());
defm('HELP', () => showHelp());
defm('?', () => showHelp());
defm('OPTIONS', () => toggleDrawPop());
defm('DSETTINGS', () => toggleDrawPop());
defm('DIMSTYLE', () => openDimStyle());
defm('PROPERTIES', () => { const p = $('#panel'); if (p && p.classList) p.classList.add('open'); if (typeof buildProps === 'function') buildProps(); });
defm('AUDIT', () => runAudit());
defm('DRAFTING', () => setMode('drafting'));
defm('ARCHITECTURE', () => setMode('arch'));
defm('WALLTYPES', () => openTypeManager());
defm('DWGOUT', () => doSaveDWG());
defm('POLAR', () => tgl('polar'));
defm('DYN', () => tgl('dyn'));
defm('ALL', () => selectAll());
defm('PURGE', () => {
  begin(); touchLayers();
  DOC.layers = DOC.layers.filter(l => l.name === '0' || [...DOC.ents.values()].some(e => e.layer === l.name));
  if (!DOC.layers.some(l => l.name === DOC.cur)) DOC.cur = '0';
  commit('Purged unused layers');
  if (typeof syncUI === 'function') syncUI();
});

/* Commands that may be run inside another command with a leading apostrophe.
   AutoCAD's rule: anything that does not change the drawing database. */
const TRANSPARENT = {
  zoom: 1, pan: 1, gridcmd: 1, snapcmd: 1, orthocmd: 1, osnapcmd: 1,
  setvar: 1, layercmd: 1, limits: 1, linetype: 1, lweight: 1, unitscmd: 1,
};

/* ============================================================
   The dispatcher — one entry point for everything typed
   ------------------------------------------------------------
   Order of interpretation follows AutoCAD: a running command
   gets first refusal on its own prompt (keyword, then number,
   then coordinate), and only when nothing is running does a word
   get to name a command, an alias or a system variable. Typing
   CIRCLE at "Specify next point:" is an error there too — that
   is what the leading apostrophe is for.
   ============================================================ */
function repeatLast() {
  if (ST.lastCmd && CMDS[ST.lastCmd]) {
    if (CLI.echo) cliPrint('Command: ' + cmdName(ST.lastCmd));
    startCmd(ST.lastCmd, ST.lastArg, true);
    return true;
  }
  if (CLI.history.length) return runInput(CLI.history[CLI.history.length - 1]);
  return false;
}
function runInput(line) {
  const s = String(line == null ? '' : line).trim();
  if (!s) {
    if (CMD) { cliAnswer(''); cmdEnter(); return true; }
    return repeatLast();
  }
  cliAnswer(s);
  if (s[0] === "'") return runTransparentInput(s.slice(1));
  return dispatch(s);
}
function runTransparentInput(rest) {
  const words = String(rest).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const r = resolveWord(words[0]);
  if (!r) { cliPrint('Unknown command "' + words[0].toUpperCase() + '".  Press F1 for help.', 'err'); return false; }
  if (r.kind === 'var') return setVarFromWords(r, words);
  if (r.kind === 'meta') { META[r.key].fn(); return true; }
  if (!TRANSPARENT[r.key]) {
    cliPrint('** ' + r.name + ' may not be invoked transparently **', 'err');
    return false;
  }
  startTransparent(r.key, r.opt);
  for (let i = 1; i < words.length && CMD; i++) runInput(words[i]);
  return true;
}
function setVarFromWords(r, words) {
  const v = SYSVAR[r.name];
  if (words.length < 2) {
    if (CMD) { cliPrint(v.name + ' = ' + varStr(v)); return true; }
    startCmd('setvar', { name: r.name }, true);
    return true;
  }
  if (v.ro) { cliPrint(v.name + ' = ' + varStr(v) + '  (read only)'); return true; }
  const val = varParse(v, words.slice(1).join(' '));
  if (val === undefined) { cliPrint('Requires a ' + v.type + ' value.', 'err'); return false; }
  v.set(val);
  cliPrint(v.name + ' = ' + varStr(v));
  return true;
}
function dispatch(s) {
  const words = s.split(/\s+/).filter(Boolean);
  const first = words[0];
  if (CMD) {
    if (CMD.phase === 'sel') {
      /* The whole selection grammar lives in selOption() — W, C, WP, CP, F,
         ALL, P, L, R, A, U. This branch used to accept ALL and reject
         everything else, which left a complete and correct implementation
         permanently unreachable while the prompt went on advertising it. */
      if (typeof selOption === 'function' && selOption(s)) {
        cmdPreview(ST.cur || [0, 0]);
        promptRender();
        draw(); return true;
      }
      cliPrint('Invalid selection.', 'err');
      return false;
    }
    if (cmdText(s)) {
      cmdPreview(ST.cur || [0, 0]);
      if (typeof syncDyn === 'function') syncDyn();
      draw(); return true;
    }
    cliPrint('Point or option keyword required.', 'err');
    promptRender();
    return false;
  }
  const r = resolveWord(first);
  if (!r) { cliPrint('Unknown command "' + first.toUpperCase() + '".  Press F1 for help.', 'err'); return false; }
  if (r.kind === 'var') return setVarFromWords(r, words);
  if (r.kind === 'meta') {
    cliRemember(r.name);
    try { META[r.key].fn(); } catch (e) { console.error(e); cliPrint('That did not work.', 'err'); }
    return true;
  }
  if (CMDS[r.key].group === 'arch' && typeof MODE !== 'undefined' && MODE !== 'arch') setMode('arch');
  startCmd(r.key, r.opt, true);
  /* the rest of the line is fed in as if each word had been Entered, which is
     how AutoCAD scripts work: LINE 0,0 1000,0 draws a line */
  for (let i = 1; i < words.length && CMD; i++) runInput(words[i]);
  return true;
}

/* ============================================================
   AutoComplete
   ------------------------------------------------------------
   Prefix matches first, then mid-string, and inside each band
   the commands used most recently come first. Aliases are listed
   next to the command they expand to, the way AutoCAD's list
   shows them.
   ============================================================ */
function cmdCatalog() {
  const idx = nameIndex(), out = [];
  for (const name of Object.keys(idx)) out.push({ name, kind: idx[name].kind, key: idx[name].key });
  if (CLI.autoComplete & 8) for (const n of varNames()) out.push({ name: n, kind: 'var', key: n });
  return out;
}
/** the alias that expands to `name`, shortest first, for the list hint */
function aliasFor(name) {
  let best = null;
  for (const src of [USERALIAS, ALIAS])
    for (const a of Object.keys(src))
      if (src[a] === name && (!best || a.length < best.length)) best = a;
  return best ? best.toUpperCase() : null;
}
function acSuggest(text, limit) {
  const q = String(text || '').trim().replace(/^[_'-]+/, '').toLowerCase();
  if (!q) return [];
  const mid = !!(CLI.autoComplete & 16);
  const seen = new Set(), out = [];
  for (const c of cmdCatalog()) {
    const lo = c.name.toLowerCase();
    let rank = -1;
    if (lo.startsWith(q)) rank = 0;
    else if (mid && lo.indexOf(q) > 0) rank = 2;
    /* an alias typed in full offers its command straight away */
    const al = (USERALIAS[q] || ALIAS[q] || '').toUpperCase();
    if (al && al === c.name) rank = Math.min(rank < 0 ? 9 : rank, 1);
    if (rank < 0 || seen.has(c.name)) continue;
    seen.add(c.name);
    const m = CLI.mru.indexOf(c.name);
    out.push({ name: c.name, kind: c.kind, key: c.key, alias: aliasFor(c.name), rank, mru: m < 0 ? 999 : m });
  }
  out.sort((a, b) => a.rank - b.rank || a.mru - b.mru || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out.slice(0, limit || 12);
}
