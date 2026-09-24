/* ============================================================
   ORTHOGRAPH — 06 input state, the snap engine, AutoTrack
   ------------------------------------------------------------
   AutoCAD's model, in AutoCAD's order: the APERTURE finds objects,
   the MODES find points on them, and the point closest to the
   crosshair wins.

   Every object is reduced to exact PIECES — segments, infinite
   lines, circular arcs, elliptical arcs — and every answer is
   solved on those rather than on a tessellation: the nearest point
   on a circle is on the circle, and an arc/line intersection is
   right to the last bit (see "snap geometry" below).

   Candidates come in two tiers:
     1. points INSIDE the aperture. Ranked by distance to the
        crosshair, with priority buying a bounded head start
        (SNAP_BIAS_PX): an endpoint beats a nearest at the same spot,
        and a perpendicular under the crosshair is not stolen by an
        intersection across the box.
     2. the DEFINED points — ends and middle — of whatever piece the
        aperture is touching, however far along it they are. That is
        AutoCAD's "the closest endpoint of the object": the marker
        that jumps to a line's midpoint as the cursor crosses it, and
        END-then-click-near-the-end-you-want.
   Tier 2 only speaks when nothing is inside the aperture.

   A one-shot override (typed END, the Shift+right-click menu) is
   AIMED: every point of that kind on the object under the aperture
   is admitted wherever it lands — a perpendicular foot, a tangency
   point, a quadrant — and a pick that finds none is refused with
   AutoCAD's own "No Endpoint found for specified point."

   Everything the cursor could land on is kept in ST.snapCands so
   Tab can cycle through it, and acquired points (ST.trackPts) throw
   alignment paths the cursor can snap to — object snap tracking.

   Three layers of osnap state, in the order they win:
     1. a temporary override held on the keyboard (Shift+E …), or a
        one-shot typed or picked from the menu — ST.osnapOne;
     2. the running set — ST.osnapOn, gated by F3 (ST.osnap);
     3. nothing, when F3 is off.
   ============================================================ */
const ST = {
  tool: 'select', cur: null, raw: null, snap: null, hot: null, hotGrip: null,
  band: null, preview: null, tracks: null, drawing: false,
  osnap: true, grid: true, snapgrid: false, ortho: false, polar: true, otrack: true, dyn: true,
  lwt: true,              /* LWDISPLAY — draw lineweights at their true plotted width */
  inView: true,           /* the pointer is over the drawing area, so draw the crosshair */
  polarInc: 45, lastPt: null, dragGrip: null, panning: false, shift: false,
  /* Running object snaps. AutoCAD ships OSMODE 4133 (endpoint, centre,
     intersection, extension); this set adds the four everyone turns on within
     a minute of installing it, and leaves off the three that make a running
     osnap noisy — nearest, tangent and apparent intersection. */
  osnapOn: {
    end: 1, mid: 1, cen: 1, gcen: 0, node: 1, quad: 1, int: 1, ext: 1,
    ins: 0, perp: 1, tan: 0, near: 0, appint: 0, par: 0,
    wcen: 1, wface: 1,
  },
  osnapOne: null,         /* temporary override: one kind, or 'none'      */
  osnapOneShot: false,    /* the override expires with the next point     */
  osPrompt: null,         /* the command's prompt, parked while "of" shows */
  defer: null,            /* a deferred PER/TAN first point: {kind,pc,pick,cmd} */
  xpick: null,            /* the first object of an extended intersection */
  /* ---- polar tracking ---- */
  polarExtra: [],         /* additional angles, degrees                   */
  polarRel: false,        /* measure polar angles from the last segment   */
  trackPolar: true,       /* otrack follows every polar angle, not just 0/90 */
  /* ---- shared interaction contract (several modules read these) ---- */
  crossLen: CROSS_PCT,    /* crosshair arm length, % of viewport; 100 = full width */
  crossGap: CROSS_GAP,    /* hole at the centre of the crosshair, screen px      */
  liveDim: true,          /* show the numbers that place what is selected        */
  pickBox: PICK_PX,       /* pick aperture in screen px */
  /* APERTURE. One number, whichever door it comes in by: the settings dialog
     writes ST.aperture and the APERTURE system variable writes SNAP_R, and
     while they were two numbers the variable changed nothing at all. */
  get aperture() { return SNAP_R; },
  set aperture(v) { const n = +v; if (isFinite(n) && n > 0) SNAP_R = clamp(Math.round(n), 1, 50); },
  apBox: false,           /* draw the aperture box at a point prompt — APBOX */
  markerSize: 6,          /* AutoSnap marker half-size in screen px */
  snapCands: null,        /* every snap candidate under the cursor, best first */
  snapCycle: 0,           /* Tab index into snapCands */
  snapCycled: false,      /* Tab has been pressed since the cursor last moved */
  snapScr: null,          /* screen point the cycle was anchored at */
  snapAt: null,           /* the screen point and reference of the last snap */
  snapV: -1,              /* DOCV the candidates were computed against */
  snapTip: null,          /* the AutoSnap tooltip string for this cursor position */
  lastCmd: null,          /* for Space = repeat */
  trackPts: [],           /* acquired points for snap tracking: {p,k} */
  extPts: [],             /* acquired ends for the extension snap: {id,i}  */
  parRefs: [],            /* acquired directions for the parallel snap: {u,a,p} */
  fromBase: null,         /* FROM: the base point an offset is measured from */
  ptMod: null,            /* a point modifier collecting its own points */

  /* ---- selection & grips: the AutoCAD system variables this app honours ----
     Names deliberately echo the real sysvars so the behaviour is checkable
     against AutoCAD one setting at a time. */
  gripSize: 5,            /* GRIPSIZE   — grip box, screen px                  */
  gripsOn: 1,             /* GRIPS      — 0 hides grips entirely               */
  gripObjLimit: 100,      /* GRIPOBJLIMIT — grips suppressed past this many    */
  selCycling: 2,          /* SELECTIONCYCLING — 0 off, 1 badge, 2 badge+list   */
  /* Off. Press-drag rubber-bands a window, which is the gesture forty years
     of drafting muscle memory expects. With the lasso on, a quick straight
     flick — exactly how a fast draughtsman selects — traces a sliver that
     encloses nothing, so the selection appears not to work at all unless you
     move slowly. PICKAUTO 1 puts the lasso back. */
  lassoOn: 0,             /* PICKAUTO bit 4 — press-drag makes a lasso         */
  pickAdd: 2,             /* PICKADD    — 2 = picks accumulate, Shift removes  */
  selAreaOpacity: 25,     /* SELECTIONAREAOPACITY, per cent                    */
  /* live interaction state */
  bandPreview: null,      /* Set of ids the in-flight window would take        */
  cycleList: null,        /* ids under the pickbox when they overlap           */
  cycleIdx: 0,
  gripHot: [],            /* the red grips: [{id,k,p}]                         */
  gripHover: null,        /* the grip under the cursor: {id,k,p}               */
  gripMenu: null,         /* multifunctional grip menu: {id,k,p,items,idx}     */
  selMode: 'add',         /* the A / R switch inside a Select objects prompt   */
};
/** the pick box only shows when no command is running (AutoCAD behaviour) */
function showPickBox() { return !CMD || CMD.phase === 'sel'; }
let SNAP_R = 10;                                  /* aperture, screen px — AutoCAD's APERTURE, default 10 */
const SNAP_CYCLE_RESET = 4;                       /* px of travel that resets Tab cycling */
const TRACK_DWELL_MS = 260;                       /* hover time before a point is acquired */
const TRACK_MAX = 7;                              /* AutoCAD keeps seven acquired points */
const PAR_MAX = 3;                                /* acquired parallel references */
const POLAR_TOL = 3.2;                            /* degrees either side of a polar angle */
/** the aperture in world units */
function apertureR() { return px(clamp(+SNAP_R || 10, 1, 50)); }

/* Scan budgets. snapPoint runs on every mouse move, so the entity work is
   bounded — always by taking the entities *closest to the cursor* first. */
const SNAP_MAX_SCAN = 600;      /* entDist evaluations per move            */
const SNAP_MAX_POINT = 32;      /* entities contributing point snaps       */
const SNAP_MAX_X = 8;           /* entities entering the pairwise int scan */
const SNAP_MAX_XP = 32;         /* pieces entering the pairwise int scan   */
const SNAP_MAX_WALL = 6;        /* walls entering the face-corner int scan */
const SNAP_MAX_CANDS = 64;      /* candidates kept for Tab                 */

/* ---------------- priority ----------------
   endpoint/node/insertion > intersection > apparent intersection >
   midpoint > centre > geometric centre > quadrant > perpendicular/tangent >
   wall face > wall centreline > extension/parallel > grid > nearest. */
const SNAP_PRI = {
  end: 100, node: 100, ins: 100,
  int: 90,
  xint: 88, xapp: 88,     /* extended intersection, second object picked   */
  appint: 88,
  extx: 87,               /* an extension path crossing something          */
  trackx: 86,             /* two alignment paths crossing                  */
  mid: 80,
  cen: 70,
  gcen: 68,
  quad: 60,
  track: 55,              /* on a single alignment path                    */
  perp: 50, tan: 50,
  perpd: 50, tand: 50,    /* deferred: the other end is not known yet      */
  cenEdge: 48,            /* a centre inferred from hovering its curve      */
  gcenEdge: 47, insEdge: 47,
  perpx: 46, tanx: 46,    /* the foot/point is past the drawn geometry      */
  wface: 40,
  wcen: 30,
  par: 22,
  ext: 20,
  grid: 8,
  near: 5,
  xint1: 2, xapp1: 2,     /* extended intersection, first object: a last resort */
};
const SNAP_PRI_MAX = 100;
/* How much of a head start the top priority buys itself, in screen px — the
   whole of the priority/distance trade lives in this one number.

   Chosen as the LARGEST value that still fixes the arbitration defect, because
   a larger bias preserves more of AutoCAD's real priority behaviour. The two
   cases that bound it, both measured:
     · an apparent intersection 0.29px out must beat an endpoint 5.7px out
       (pri gap 12 → head start 0.96px ≪ 5.41px gap) ✓
     · a perpendicular under the crosshair must beat an intersection ~5px out
       (pri gap 40 → 3.2px < 5px) ✓  — fails above ~12px
   and the case that sets the floor:
     · a node 4.24px out must still beat a line midpoint 3.16px out
       (pri gap 20 → 1.6px > 1.08px) ✓ — fails below ~5.4px
   8px sits in the middle of that window rather than on either edge. */
const SNAP_BIAS_PX = 8;
/* which snap kinds can be acquired for tracking */
const TRACK_KINDS = { end: 1, mid: 1, cen: 1, gcen: 1, quad: 1, int: 1, appint: 1, node: 1, ins: 1, perp: 1, tan: 1 };

/* ---------------- the mode table ----------------
   Listed in the order AutoCAD's Drafting Settings dialog lists them, so the
   settings dialog and the Shift+right-click menu read the same way. `bit` is
   the OSMODE bit: AutoCAD gave Geometric Center the 1024 that the obsolete
   QUIck mode left behind, and uses 16384 to mean "running snaps suppressed"
   (F3 off). Orthograph's two wall modes live above AutoCAD's range. */
const SNAP_KINDS = [
  { k: 'end', label: 'Endpoint', bit: 1, tok: 'endp' },
  { k: 'mid', label: 'Midpoint', bit: 2, tok: 'mid' },
  { k: 'cen', label: 'Centre', bit: 4, tok: 'cen' },
  { k: 'gcen', label: 'Geometric Centre', bit: 1024, tok: 'gcen' },
  { k: 'node', label: 'Node', bit: 8, tok: 'nod' },
  { k: 'quad', label: 'Quadrant', bit: 16, tok: 'qua' },
  { k: 'int', label: 'Intersection', bit: 32, tok: 'int' },
  { k: 'ext', label: 'Extension', bit: 4096, tok: 'ext' },
  { k: 'ins', label: 'Insertion', bit: 64, tok: 'ins' },
  { k: 'perp', label: 'Perpendicular', bit: 128, tok: 'per', to: 1 },
  { k: 'tan', label: 'Tangent', bit: 256, tok: 'tan', to: 1 },
  { k: 'near', label: 'Nearest', bit: 512, tok: 'nea', to: 1 },
  { k: 'appint', label: 'Apparent Intersection', bit: 2048, tok: 'appint' },
  { k: 'par', label: 'Parallel', bit: 8192, tok: 'par', to: 1 },
  { k: 'wcen', label: 'Wall centreline', bit: 131072, tok: 'wcen' },
  { k: 'wface', label: 'Wall face', bit: 262144, tok: 'wface' },
];
const OSMODE_OFF = 16384;
const SNAP_LABEL = {};
const SNAP_TOK = {};
for (const s of SNAP_KINDS) { SNAP_LABEL[s.k] = s.label; SNAP_TOK[s.k] = s; }
SNAP_LABEL.perpx = 'Perpendicular';
SNAP_LABEL.tanx = 'Tangent';
SNAP_LABEL.perpd = 'Deferred Perpendicular';
SNAP_LABEL.tand = 'Deferred Tangent';
SNAP_LABEL.xint = SNAP_LABEL.xint1 = 'Extended Intersection';
SNAP_LABEL.xapp = SNAP_LABEL.xapp1 = 'Extended Apparent Intersection';
SNAP_LABEL.extx = 'Extended Intersection';
SNAP_LABEL.track = 'Tracking';
SNAP_LABEL.trackx = 'Tracking intersection';
SNAP_LABEL.grid = 'Snap';
function snapKindLabel(k) { return SNAP_LABEL[k] || k; }
/** every alias a user might type at a point prompt, mapped to a mode */
const SNAP_ALIAS = {
  end: 'end', endp: 'end', endpoint: 'end',
  mid: 'mid', midp: 'mid', midpoint: 'mid',
  cen: 'cen', cent: 'cen', center: 'cen', centre: 'cen',
  gce: 'gcen', gcen: 'gcen', geo: 'gcen',
  nod: 'node', node: 'node',
  qua: 'quad', quad: 'quad', quadrant: 'quad',
  int: 'int', inte: 'int', intersection: 'int',
  ext: 'ext', exte: 'ext', extension: 'ext',
  ins: 'ins', inse: 'ins', insert: 'ins', insertion: 'ins',
  per: 'perp', perp: 'perp', perpendicular: 'perp',
  tan: 'tan', tang: 'tan', tangent: 'tan',
  nea: 'near', near: 'near', nearest: 'near',
  app: 'appint', appi: 'appint', appint: 'appint', apparent: 'appint',
  par: 'par', para: 'par', parallel: 'par',
  non: 'none', none: 'none',
  wcen: 'wcen', wface: 'wface',
};
/* The Shift+right-click menu is not in the dialog's order: AutoCAD groups it
   by what the modes do — the ends and middle, then the crossings, then the
   curve points, then the ones that point at something — and has kept that
   order for years, so a hand finds Intersection without reading. */
const SNAP_MENU_ORDER = ['end', 'mid', 'int', 'appint', 'ext', 'cen', 'gcen', 'quad', 'tan',
  'perp', 'par', 'node', 'ins', 'near', 'wcen', 'wface'];
/** the list the Shift+right-click menu renders, in AutoCAD's menu order: [{kind,label,on}] */
function snapMenuItems() {
  return SNAP_MENU_ORDER.map(k => SNAP_TOK[k]).filter(Boolean)
    .map(s => ({ kind: s.k, label: s.label, on: !!ST.osnapOn[s.k] }));
}
/** flip one snap kind; 'all' / 'none' set every kind at once. Returns the new state. */
function toggleSnap(kind) {
  if (kind === 'all' || kind === 'none') {
    const v = kind === 'all' ? 1 : 0;
    for (const s of SNAP_KINDS) ST.osnapOn[s.k] = v;
    return !!v;
  }
  if (!(kind in ST.osnapOn)) return false;
  ST.osnapOn[kind] = ST.osnapOn[kind] ? 0 : 1;
  return !!ST.osnapOn[kind];
}
/** the running set as an OSMODE bit code, 16384 included while F3 is off */
function osmode() {
  let m = 0;
  for (const s of SNAP_KINDS) if (ST.osnapOn[s.k]) m |= s.bit;
  if (!ST.osnap) m |= OSMODE_OFF;
  return m;
}
function setOsmode(m) {
  m = m | 0;
  for (const s of SNAP_KINDS) ST.osnapOn[s.k] = (m & s.bit) ? 1 : 0;
  ST.osnap = !(m & OSMODE_OFF);
  return osmode();
}
/* The OSMODE system variable speaks AutoCAD's bits only. Somebody typing
   OSMODE 4133 means AutoCAD's four modes and has never heard of a wall face,
   so the two Orthograph modes are neither reported nor switched off by it. */
const OSMODE_ACAD = 0x3fff;
function osmodeVar() { return osmode() & (OSMODE_ACAD | OSMODE_OFF); }
function setOsmodeVar(v) {
  v = v | 0;
  for (const s of SNAP_KINDS) if (s.bit <= OSMODE_ACAD) ST.osnapOn[s.k] = (v & s.bit) ? 1 : 0;
  ST.osnap = !(v & OSMODE_OFF);
  return osmodeVar();
}

/* ---------------- running vs one-shot ----------------
   A temporary override replaces the running set for as long as it is held
   (a keyboard override) or until the next point is picked (a menu pick or a
   typed MID/CEN/…). AutoCAD calls the second kind a "one-shot" osnap, and
   answers it the way it always has: the prompt becomes "of" — "to" for the
   modes that point AT something — until the point is given. */
const SNAP_NONE = Object.freeze({});
function setSnapOverride(kind, oneShot, typed) {
  if (!kind) { ST.osnapOne = null; ST.osnapOneShot = false; ST.xpick = null; return null; }
  const k = kind === 'none' ? 'none' : (SNAP_ALIAS[kind] || kind);
  ST.osnapOne = k;
  ST.osnapOneShot = !!oneShot;
  ST.xpick = null;
  if (oneShot) osPromptFor(k, typed);
  return ST.osnapOne;
}
function clearSnapOverride(force) {
  if (ST.osnapOne && (force || ST.osnapOneShot)) {
    ST.osnapOne = null; ST.osnapOneShot = false; ST.xpick = null;
    return true;
  }
  return false;
}
/** the word AutoCAD prompts with after a one-shot override */
function osWord(k) { return k === 'none' ? '' : (SNAP_TOK[k] && SNAP_TOK[k].to ? 'to' : 'of'); }
/** a running command is asking for a point, so the command line can speak */
function osAtPrompt() {
  return typeof CMD !== 'undefined' && CMD && CMD.phase === 'run' && typeof hint === 'function';
}
/** "Specify first point: end of" — the history line gains the word, the
    prompt becomes it, and the command's own prompt is parked until the
    point arrives. A menu pick writes AutoCAD's "_endp of" itself. */
function osPromptFor(k, typed) {
  if (!osAtPrompt()) return;
  const w = osWord(k);
  if (typeof CLI !== 'undefined' && CLI && CLI.echo) {
    const L = CLI.lines[CLI.lines.length - 1];
    const tail = w ? ' ' + w : '';
    if (typed && L && typeof L.t === 'string') { L.t += tail; if (typeof renderCli === 'function') renderCli(); }
    else if (!typed && typeof cliPrint === 'function') {
      const tok = k === 'none' ? 'non' : (SNAP_TOK[k] ? SNAP_TOK[k].tok : k);
      cliPrint((typeof PROMPT !== 'undefined' ? PROMPT.text + ' ' : '') + '_' + tok + tail);
    }
  }
  if (!w) return;
  osPromptWord(w);
}
/** show `w` as the prompt, remembering the command's own */
function osPromptWord(w) {
  if (!osAtPrompt()) return;
  if (ST.osPrompt == null && typeof PROMPT !== 'undefined') ST.osPrompt = PROMPT.raw;
  hint(w);
}
/** give the command its prompt back; true when there was one parked */
function osPromptRestore() {
  if (ST.osPrompt == null) return false;
  const s = ST.osPrompt;
  ST.osPrompt = null;
  if (typeof hint === 'function' && typeof CMD !== 'undefined' && CMD) hint(s);
  return true;
}
/** true when *something* wants object snapping this move */
function osnapActive() { return !!ST.osnapOne || !!ST.osnap; }
/** the mode table snapPoint should honour right now */
function activeModes() {
  const one = ST.osnapOne;
  if (one) {
    if (one === 'none') return SNAP_NONE;
    const m = {};
    m[one] = 1;
    /* an apparent-intersection override still wants the real ones offered */
    if (one === 'appint') m.int = 1;
    return m;
  }
  return ST.osnap ? ST.osnapOn : SNAP_NONE;
}
/** the one-shot kind in force, or null (a held 'none' is not a kind) */
function oneShotKind() { return ST.osnapOne && ST.osnapOne !== 'none' ? ST.osnapOne : null; }

/* ---------------- temporary override keys ----------------
   AutoCAD's temporary overrides are HELD, not toggled: the mode applies for
   exactly as long as the key is down and the running set comes back the moment
   it is released. That is what makes them worth having — you take one endpoint
   without ever leaving the running set you spent a minute setting up.

   Both of AutoCAD's default sets are here, because which hand is free depends
   on which hand is on the mouse:

     E  P    endpoint            M  V    midpoint          C   centre
     D  L    disable all snapping and tracking
     A       object snap on/off  S       force object snap on
     X       polar               Z  Q    object snap tracking

   Each entry says what to do to ST; whatever it touches is saved and put back
   on release, so an override can never leave the drafting settings altered. */
const TEMP_OVERRIDE = {
  e: { snap: 'end', label: 'Endpoint' },
  p: { snap: 'end', label: 'Endpoint' },
  m: { snap: 'mid', label: 'Midpoint' },
  v: { snap: 'mid', label: 'Midpoint' },
  c: { snap: 'cen', label: 'Centre' },
  d: { snap: 'none', off: ['otrack', 'snapgrid', 'polar', 'ortho'], label: 'No snapping' },
  l: { snap: 'none', off: ['otrack', 'snapgrid', 'polar', 'ortho'], label: 'No snapping' },
  a: { toggle: 'osnap', label: 'Object snap' },
  s: { on: 'osnap', label: 'Object snap on' },
  x: { toggle: 'polar', label: 'Polar' },
  z: { toggle: 'otrack', label: 'Object snap tracking' },
  q: { toggle: 'otrack', label: 'Object snap tracking' },
};
let TEMP_HELD = null;              /* {k, o, saved} while a key is down */
function tempOverrideKey(key) {
  const k = String(key || '').toLowerCase();
  return k.length === 1 && TEMP_OVERRIDE[k] ? k : null;
}
/** apply the override bound to `key`; returns its entry, or null */
function tempOverrideDown(key) {
  const k = tempOverrideKey(key);
  if (!k) return null;
  /* one at a time: a second key while one is held is ignored, not stacked */
  if (TEMP_HELD) return TEMP_HELD.k === k ? TEMP_HELD.o : null;
  const o = TEMP_OVERRIDE[k];
  const saved = { osnapOne: ST.osnapOne, osnapOneShot: ST.osnapOneShot };
  for (const f of (o.off || [])) { saved[f] = ST[f]; ST[f] = false; }
  if (o.on) { saved[o.on] = ST[o.on]; ST[o.on] = true; }
  /* polar and ortho exclude each other, so a toggle of either goes through the
     one function that knows it */
  if (o.toggle) {
    /* both sides of the exclusion are saved, since turning polar on turns
       ortho off and the release has to undo the whole of that */
    saved.ortho = ST.ortho; saved.polar = ST.polar;
    saved[o.toggle] = ST[o.toggle];
    if (typeof draftToggle === 'function') draftToggle(o.toggle);
    else ST[o.toggle] = !ST[o.toggle];
  }
  if (o.snap) setSnapOverride(o.snap, false);
  TEMP_HELD = { k, o, saved };
  if (typeof syncToggles === 'function') syncToggles();
  return o;
}
/** release the held override, whatever it was. Returns true if one was up. */
function tempOverrideUp(key) {
  if (!TEMP_HELD) return false;
  const k = key == null ? TEMP_HELD.k : tempOverrideKey(key);
  /* releasing Shift ends the override too — the chord is gone either way */
  if (key != null && k !== TEMP_HELD.k && String(key) !== 'Shift') return false;
  const s = TEMP_HELD.saved;
  for (const f of Object.keys(s)) ST[f] = s[f];
  TEMP_HELD = null;
  if (typeof syncToggles === 'function') syncToggles();
  return true;
}
/** true when the drawing area, not a text field, should get the chord */
function tempOverrideAllowed() {
  if (typeof document === 'undefined' || !document.querySelector) return true;
  const modal = document.querySelector('#modal');
  if (modal && modal.classList && modal.classList.contains('show')) return false;
  const a = document.activeElement, tag = a && a.tagName;
  /* the command line is fair game — Shift means nothing to a command name —
     but every other field is someone typing, and capitals are capitals there */
  if (tag === 'TEXTAREA' || tag === 'SELECT') return false;
  if (tag === 'INPUT' && a.id !== 'cmd') return false;
  /* TEXT, MTEXT and LEADER read a literal line through the command line */
  if (typeof CMD !== 'undefined' && CMD && CMD.phase === 'run' &&
    (CMD.def.key === 'text' || CMD.def.key === 'mtext' || CMD.def.key === 'leader')) return false;
  return true;
}
/* Registered here rather than with the rest of the key handling because this
   listener has to run BEFORE the one that appends every printable character to
   the command line — 06 loads before 14, so it does. */
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('keydown', ev => {
    if (!ev || !ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey) return;
    if (!tempOverrideKey(ev.key) || !tempOverrideAllowed()) return;
    if (ev.repeat) { if (ev.preventDefault) ev.preventDefault(); return; }
    const o = tempOverrideDown(ev.key);
    if (!o) return;
    if (ev.preventDefault) ev.preventDefault();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    if (typeof echo === 'function') echo(o.label + ' (hold)');
    if (typeof draw === 'function') draw();
  });
  window.addEventListener('keyup', ev => {
    if (!ev || !TEMP_HELD) return;
    if (!tempOverrideUp(ev.key)) return;
    if (typeof echo === 'function') echo('');
    if (typeof draw === 'function') draw();
  });
  /* an override must not survive the window losing focus mid-chord */
  window.addEventListener('blur', () => { if (tempOverrideUp()) { if (typeof draw === 'function') draw(); } });
}

/* ---------------- Tab cycling ---------------- */
/** step through the overlapping candidates under the cursor; returns the chosen one.
    Candidates computed before the drawing last changed are thrown away first —
    Tab after an undo must not offer a point on geometry that has gone. */
function cycleSnap(dir) {
  if (ST.snapV !== DOCV && ST.snapAt) snapRefresh();
  const c = ST.snapCands;
  if (!c || !c.length) return null;
  const n = c.length;
  ST.snapCycle = (((ST.snapCycle + (dir || 1)) % n) + n) % n;
  ST.snapCycled = true;
  ST.snap = c[ST.snapCycle];
  ST.snapTip = snapTipFor(ST.snap);
  return ST.snap;
}
/** re-run the last snap where the cursor still is. The candidates are pure
    functions of the drawing, so after an edit they are simply recomputed —
    there is nothing cached that could go stale. */
function snapRefresh() {
  const a = ST.snapAt;
  if (!a) return null;
  const keep = ST.snapCycle;
  const ref = typeof refPoint === 'function' ? refPoint() : a.ref;
  const p = snapPoint(a.sx, a.sy, ref);
  if (ST.snapCands && keep < ST.snapCands.length && ST.snapCycled) {
    ST.snapCycle = keep; ST.snap = ST.snapCands[keep]; ST.snapTip = snapTipFor(ST.snap);
    return ST.snap.p.slice();
  }
  return p;
}
/** the snap under a screen point, for callers that want the candidate
    rather than the point (the keyboard crosshair) */
function snapAt(sx, sy, ref) { snapPoint(sx, sy, ref); return ST.snap; }

/* ---------------- snap tracking ---------------- */
let _dwellPt = null, _dwellT0 = 0, _dwellUsed = false;
let _parEnt = null, _parT0 = 0, _parUsed = false;
/** remember a point so alignment paths radiate from it */
function acquireTrack(p, k) {
  if (!p || !isFinite(p[0]) || !isFinite(p[1])) return null;
  const tol = Math.max(px(1.5), 1e-9);
  for (const q of ST.trackPts) if (dist(q.p, p) <= tol) { if (k) q.k = k; return q; }
  const e = { p: [p[0], p[1]], k: k || 'end' };
  ST.trackPts.push(e);
  while (ST.trackPts.length > TRACK_MAX) ST.trackPts.shift();
  return e;
}
/** drop one acquired point (hovering an acquired point again un-acquires it) */
function releaseTrack(p) {
  const tol = Math.max(px(1.5), 1e-9);
  for (let i = 0; i < ST.trackPts.length; i++)
    if (dist(ST.trackPts[i].p, p) <= tol) { ST.trackPts.splice(i, 1); return true; }
  return false;
}
function clearTracks() {
  ST.trackPts.length = 0; ST.parRefs.length = 0; ST.extPts.length = 0; ST.tracks = null;
  _dwellPt = null; _dwellUsed = false; _parEnt = null; _parUsed = false;
}
/** hovering a snap point for TRACK_DWELL_MS acquires it; hovering an already
    acquired point for as long drops it again, exactly as AutoCAD does. Only a
    point inside the aperture can be acquired: pausing over the middle of a
    line is not pausing over its end. */
function trackDwell(best, now) {
  now = now == null ? Date.now() : now;
  if (!ST.otrack || !best || !TRACK_KINDS[best.k] || best.tier > 1) { _dwellPt = null; _dwellUsed = false; return null; }
  if (!_dwellPt || dist(_dwellPt, best.p) > Math.max(px(0.5), 1e-9)) {
    _dwellPt = best.p.slice(); _dwellT0 = now; _dwellUsed = false; return null;
  }
  if (_dwellUsed) return null;                     /* one decision per visit */
  if (now - _dwellT0 < TRACK_DWELL_MS) return null;
  _dwellUsed = true;
  const tol = Math.max(px(1.5), 1e-9);
  if (ST.trackPts.some(q => dist(q.p, _dwellPt) <= tol)) { releaseTrack(_dwellPt); return null; }
  return acquireTrack(_dwellPt, best.k);
}
/** acquire the direction of a linear object for the parallel snap. `p` is
    where it was acquired, which is where AutoCAD leaves its small // mark. */
function acquirePar(u, p) {
  const a = wrap(Math.atan2(u[1], u[0])) % Math.PI;
  for (const q of ST.parRefs) if (Math.abs(wrapS(q.a - a)) < 1e-6) { if (p) q.p = p.slice(); return q; }
  const e = { u: [Math.cos(a), Math.sin(a)], a, p: p ? p.slice() : null };
  ST.parRefs.push(e);
  while (ST.parRefs.length > PAR_MAX) ST.parRefs.shift();
  return e;
}
/** hovering a straight edge while PAR is live acquires its direction */
function parDwell(raw, r, now, on, pcs) {
  if (!(on || activeModes()).par) { _parEnt = null; _parUsed = false; return null; }
  now = now == null ? Date.now() : now;
  const seg = nearestLinearDir(raw, r, pcs);
  if (!seg) { _parEnt = null; _parUsed = false; return null; }
  if (_parEnt !== seg.id) { _parEnt = seg.id; _parT0 = now; _parUsed = false; return null; }
  if (_parUsed || now - _parT0 < TRACK_DWELL_MS) return null;
  _parUsed = true;
  return acquirePar(seg.u, seg.p);
}
/** the straight piece nearest the cursor, if one is under the aperture */
function nearestLinearDir(raw, r, pcs) {
  if (!pcs) pcs = piecesNear(raw, r);
  let best = null, bd = r;
  for (const pc of pcs) {
    if (pc.g !== 'seg' && pc.g !== 'lin') continue;
    if (!(pc.nd <= bd)) continue;
    const L = lform(pc);
    if (!L) continue;
    bd = pc.nd; best = { id: pc.key, u: L.u, p: pc.np };
  }
  return best;
}

/* ============================================================
   snap geometry — the exact pieces an object offers the engine
   ------------------------------------------------------------
   Every entity is reduced to PIECES, the curves it is actually made
   of, in world coordinates:

     { g:'seg', a, b }                     a finite segment
     { g:'lin', a, u, t0, t1 }             xline (−∞,∞) or ray (0,∞); u unit
     { g:'arc', c, r, a0, sw }             circular arc, CCW; sw = TAU is a circle
     { g:'ell', c, rx, ry, rot, t0, sw }   ellipse, parametric angle, CCW
     { g:'pl',  pts, closed }              a curve already stored as points (spline)

   Each piece carries the DEFINED points it offers — ends:[[p,meta]…],
   mid:[p,meta], cen:[p,meta], quad:true — and ext:[bool,bool], the ends an
   Extension may run on from. `meta` names the entity and the point it is
   defined by, when there is one, so a dimension snapped here stays attached.

   Nothing here is tessellated that the drawing is not: a polyline's bulge
   is an arc, an ellipse an ellipse, so nearest, perpendicular, tangent and
   every intersection come out on the curve itself.
   ============================================================ */
/** the sweep the renderer draws from a0 to a1: counter-clockwise, and a
    whole turn when the two meet */
function sweepOf(a0, a1) {
  const d = a1 - a0;
  if (!isFinite(d) || Math.abs(d) >= TAU - 1e-12) return TAU;
  const s = ((d % TAU) + TAU) % TAU;
  return s < 1e-12 ? TAU : s;
}
function inSweep(a0, sw, a) { return sw >= TAU - 1e-12 || wrap(a - a0) <= sw + 1e-11; }
function arcAt(pc, a) { return [pc.c[0] + pc.r * Math.cos(a), pc.c[1] + pc.r * Math.sin(a)]; }
/* ---- ellipses: parametric angle t, x = rx·cos t, y = ry·sin t in the ellipse's frame ---- */
function ellAt(E, t) {
  const cs = Math.cos(E.rot), sn = Math.sin(E.rot), x = E.rx * Math.cos(t), y = E.ry * Math.sin(t);
  return [E.c[0] + x * cs - y * sn, E.c[1] + x * sn + y * cs];
}
function ellLoc(E, p) {
  const cs = Math.cos(E.rot), sn = Math.sin(E.rot), dx = p[0] - E.c[0], dy = p[1] - E.c[1];
  return [dx * cs + dy * sn, -dx * sn + dy * cs];
}
function ellParam(E, p) { const q = ellLoc(E, p); return Math.atan2(q[1] / E.ry, q[0] / E.rx); }
/** the stationary points of the distance from p to an ellipse are the roots
    of this, in the parameter — the closest point and every normal foot */
function ellF(E, q, t) {
  const c = Math.cos(t), s = Math.sin(t);
  return (E.rx * E.rx - E.ry * E.ry) * s * c - q[0] * E.rx * s + q[1] * E.ry * c;
}
function ellDF(E, q, t) {
  const c = Math.cos(t), s = Math.sin(t);
  return (E.rx * E.rx - E.ry * E.ry) * (c * c - s * s) - q[0] * E.rx * c - q[1] * E.ry * s;
}
/** a root of f bracketed in [lo, hi], to the last bit */
function bisect(f, lo, hi, flo) {
  let a = lo, b = hi, fa = flo == null ? f(lo) : flo;
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2;
    if (m === a || m === b) break;
    const fm = f(m);
    if (fm === 0) return m;
    if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}
/** every parameter where f changes sign over [t0, t0+sw], each solved exactly */
function rootsOn(f, t0, sw, n) {
  const out = [];
  let tp = t0, fp = f(t0);
  if (fp === 0) out.push(t0);
  for (let i = 1; i <= n; i++) {
    const t = t0 + sw * i / n, fv = f(t);
    if (fv === 0) out.push(t);
    else if (fp !== 0 && (fv < 0) !== (fp < 0)) out.push(bisect(f, tp, t, fp));
    tp = t; fp = fv;
  }
  return out;
}
/** normal feet from p onto the whole ellipse, as parameters */
function ellFeet(E, p) {
  const q = ellLoc(E, p);
  return rootsOn(t => ellF(E, q, t), 0, TAU, 96);
}
/** the parameter of the point on the ellipse (within its sweep) closest to p */
function ellNearestT(E, p) {
  const q = ellLoc(E, p);
  const d2 = t => { const x = E.rx * Math.cos(t) - q[0], y = E.ry * Math.sin(t) - q[1]; return x * x + y * y; };
  let bt = E.t0, bd = Infinity;
  const N = 64;
  for (let i = 0; i <= N; i++) { const t = E.t0 + E.sw * i / N; const d = d2(t); if (d < bd) { bd = d; bt = t; } }
  /* polish with Newton on the stationary condition; it only ever improves */
  let t = bt;
  for (let k = 0; k < 40; k++) {
    const g = ellDF(E, q, t);
    if (!g || !isFinite(g)) break;
    let dt = ellF(E, q, t) / g;
    if (Math.abs(dt) > 0.25) dt = Math.sign(dt) * 0.25;
    t -= dt;
    if (Math.abs(dt) < 1e-16) break;
  }
  if (inSweep(E.t0, E.sw, t) && d2(t) <= bd + 1e-18) return t;
  return bt;
}
/** the point halfway along an elliptical arc, by length */
function ellMidByLength(E) {
  const sp = t => Math.hypot(E.rx * Math.sin(t), E.ry * Math.cos(t));
  const N = 512, h = E.sw / N, acc = [0];
  for (let i = 0; i < N; i++) {
    const a = E.t0 + h * i;
    acc.push(acc[i] + h / 6 * (sp(a) + 4 * sp(a + h / 2) + sp(a + h)));
  }
  const half = acc[N] / 2;
  let i = 0;
  while (i < N && acc[i + 1] < half) i++;
  let t = E.t0 + h * i, L = acc[i];
  for (let k = 0; k < 6; k++) {
    const s = sp(t); if (!(s > 0)) break;
    const dt = (half - L) / s;
    const t2 = t + dt;
    const m = (t + t2) / 2;
    L += dt / 6 * (sp(t) + 4 * sp(m) + sp(t2));
    t = t2;
    if (Math.abs(dt) < 1e-15) break;
  }
  return ellAt(E, t);
}
/** a straight piece as a point, a unit direction and a parameter range */
function lform(pc) {
  if (pc._l !== undefined) return pc._l;
  if (pc.g === 'lin') return (pc._l = pc);
  if (pc.g !== 'seg') return (pc._l = null);
  const dx = pc.b[0] - pc.a[0], dy = pc.b[1] - pc.a[1], L = Math.hypot(dx, dy);
  return (pc._l = L > 1e-12 ? { a: pc.a, u: [dx / L, dy / L], t0: 0, t1: L } : null);
}
/** the point of a piece closest to p: {p, d} */
function pieceNear(pc, p) {
  switch (pc.g) {
    case 'seg': { const c = segClosest(p, pc.a, pc.b); return { p: c.p, d: dist(p, c.p) }; }
    case 'lin': {
      const t = clamp(dot(sub(p, pc.a), pc.u), pc.t0, pc.t1);
      const q = [pc.a[0] + pc.u[0] * t, pc.a[1] + pc.u[1] * t];
      return { p: q, d: dist(p, q) };
    }
    case 'arc': {
      const dx = p[0] - pc.c[0], dy = p[1] - pc.c[1], D = Math.hypot(dx, dy);
      const a = D > 1e-300 ? Math.atan2(dy, dx) : pc.a0;
      if (inSweep(pc.a0, pc.sw, a)) {
        const q = D > 1e-300 ? [pc.c[0] + dx / D * pc.r, pc.c[1] + dy / D * pc.r] : arcAt(pc, a);
        return { p: q, d: Math.abs(D - pc.r) };
      }
      const e0 = arcAt(pc, pc.a0), e1 = arcAt(pc, pc.a0 + pc.sw);
      const d0 = dist(p, e0), d1 = dist(p, e1);
      return d0 <= d1 ? { p: e0, d: d0 } : { p: e1, d: d1 };
    }
    case 'ell': {
      const t = ellNearestT(pc, p), q = ellAt(pc, t);
      return { p: q, d: dist(p, q) };
    }
    case 'pl': {
      const P = pc.pts, n = P.length;
      let bp = P[0], bd = Infinity;
      const segs = pc.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const c = segClosest(p, P[i], P[(i + 1) % n]);
        const d = dist(p, c.p);
        if (d < bd) { bd = d; bp = c.p; }
      }
      return { p: bp, d: bd };
    }
  }
  return { p, d: Infinity };
}
/** perpendicular feet from ref onto a piece: [{p, on}] — `on` is false where
    the foot lies on the object's extension rather than on the object */
function pieceFeet(pc, ref) {
  const out = [];
  if (pc.g === 'seg' || pc.g === 'lin') {
    const L = lform(pc); if (!L) return out;
    const t = dot(sub(ref, L.a), L.u);
    const tol = 1e-9 * Math.max(1, Math.abs(t));
    out.push({ p: [L.a[0] + L.u[0] * t, L.a[1] + L.u[1] * t], on: t >= L.t0 - tol && t <= L.t1 + tol });
  } else if (pc.g === 'arc') {
    const dx = ref[0] - pc.c[0], dy = ref[1] - pc.c[1], D = Math.hypot(dx, dy);
    if (!(D > 1e-12)) return out;
    for (const s of [1, -1]) {
      const p = [pc.c[0] + dx / D * pc.r * s, pc.c[1] + dy / D * pc.r * s];
      out.push({ p, on: inSweep(pc.a0, pc.sw, Math.atan2(p[1] - pc.c[1], p[0] - pc.c[0])) });
    }
  } else if (pc.g === 'ell') {
    for (const t of ellFeet(pc, ref)) out.push({ p: ellAt(pc, t), on: inSweep(pc.t0, pc.sw, t) });
  } else if (pc.g === 'pl') {
    const P = pc.pts, n = P.length, segs = pc.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const f = perpFoot(P[i], P[(i + 1) % n], ref);
      if (f && f.on) out.push({ p: f.p, on: true });
    }
  }
  return out;
}
/** tangency points from ref onto a piece: [{p, on}] */
function pieceTangents(pc, ref) {
  const out = [];
  if (pc.g === 'arc') {
    const D = dist(ref, pc.c);
    if (!(D > pc.r * (1 + 1e-12))) return out;
    const a0 = ang(pc.c, ref), da = Math.acos(clamp(pc.r / D, -1, 1));
    for (const s of [1, -1]) {
      const a = a0 + s * da;
      out.push({ p: arcAt(pc, a), on: inSweep(pc.a0, pc.sw, a) });
    }
  } else if (pc.g === 'ell') {
    /* Tangency survives an affine map, and an ellipse is the affine image of
       the unit circle — so solve it there, exactly, and map the answer back */
    const q = ellLoc(pc, ref), Q = [q[0] / pc.rx, q[1] / pc.ry], L = Math.hypot(Q[0], Q[1]);
    if (!(L > 1 + 1e-12)) return out;
    const b = Math.atan2(Q[1], Q[0]), da = Math.acos(1 / L);
    for (const s of [1, -1]) { const t = b + s * da; out.push({ p: ellAt(pc, t), on: inSweep(pc.t0, pc.sw, t) }); }
  } else if (pc.g === 'pl') {
    /* a curve stored as points is tangent where the sight line from ref
       stops sweeping one way and starts back — between two vertices */
    const P = pc.pts, n = P.length;
    let prev = null;
    for (let i = 0; i + 1 < n; i++) {
      const s = cross(sub(P[i + 1], P[i]), sub(ref, P[i]));
      if (prev != null && (s < 0) !== (prev < 0) && Math.abs(s) + Math.abs(prev) > 0) out.push({ p: P[i], on: true });
      prev = s;
    }
  }
  return out;
}

/* ---- intersections between pieces ---- */
function xLinLin(A, B, inf) {
  const den = cross(A.u, B.u);
  if (Math.abs(den) < 1e-12) return [];
  const w = sub(B.a, A.a);
  const t = cross(w, B.u) / den, s = cross(w, A.u) / den;
  if (!inf) {
    const ta = 1e-9 * Math.max(1, Math.abs(t)), tb = 1e-9 * Math.max(1, Math.abs(s));
    if (t < A.t0 - ta || t > A.t1 + ta || s < B.t0 - tb || s > B.t1 + tb) return [];
  }
  return [[A.a[0] + A.u[0] * t, A.a[1] + A.u[1] * t]];
}
/** a line meets a circle: measured from the foot of the centre, which is
    stable however long the line is — an xline is 10^7 long as a segment */
function xLinCirc(L, c, r, inf) {
  const w = sub(c, L.a), tc = dot(w, L.u);
  const f = [L.a[0] + L.u[0] * tc, L.a[1] + L.u[1] * tc];
  const h2 = r * r - dist2(f, c);
  if (h2 < -1e-12 * r * r) return [];
  const h = h2 > 0 ? Math.sqrt(h2) : 0;
  const ts = h > 1e-12 * r ? [tc - h, tc + h] : [tc];
  const out = [];
  for (const t of ts) {
    const tol = 1e-9 * Math.max(1, Math.abs(t));
    if (!inf && (t < L.t0 - tol || t > L.t1 + tol)) continue;
    out.push([L.a[0] + L.u[0] * t, L.a[1] + L.u[1] * t]);
  }
  return out;
}
/** a line meets an ellipse: in the frame where the ellipse is a unit circle */
function xLinEll(L, E, inf) {
  const A = ellLoc(E, L.a), cs = Math.cos(E.rot), sn = Math.sin(E.rot);
  const U = [L.u[0] * cs + L.u[1] * sn, -L.u[0] * sn + L.u[1] * cs];
  const a = [A[0] / E.rx, A[1] / E.ry], u = [U[0] / E.rx, U[1] / E.ry];
  const qa = dot(u, u), qb = 2 * dot(a, u), qc = dot(a, a) - 1;
  let disc = qb * qb - 4 * qa * qc;
  if (disc < -1e-12 * qb * qb) return [];
  disc = disc > 0 ? Math.sqrt(disc) : 0;
  const q = -0.5 * (qb + (qb < 0 ? -disc : disc));
  const ts = [];
  if (q !== 0) { ts.push(q / qa); if (disc > 0) ts.push(qc / q); }
  else ts.push(0);
  const out = [];
  for (const t of ts) {
    const tol = 1e-9 * Math.max(1, Math.abs(t));
    if (!inf && (t < L.t0 - tol || t > L.t1 + tol)) continue;
    const p = [L.a[0] + L.u[0] * t, L.a[1] + L.u[1] * t];
    if (!inf && !inSweep(E.t0, E.sw, ellParam(E, p))) continue;
    out.push(p);
  }
  return out;
}
/** a circle or an ellipse meets an ellipse: solved on the ellipse's own
    parameter, every sign change of the other curve's equation bisected out */
function xEllCurve(E, other, inf) {
  let F;
  if (other.g === 'arc') {
    F = t => { const p = ellAt(E, t); return dist2(p, other.c) - other.r * other.r; };
  } else {
    F = t => { const q = ellLoc(other, ellAt(E, t)); return (q[0] / other.rx) ** 2 + (q[1] / other.ry) ** 2 - 1; };
  }
  const out = [];
  for (const t of rootsOn(F, 0, TAU, 256)) {
    if (!inf && !inSweep(E.t0, E.sw, t)) continue;
    const p = ellAt(E, t);
    if (!inf) {
      if (other.g === 'arc' && !inSweep(other.a0, other.sw, ang(other.c, p))) continue;
      if (other.g === 'ell' && !inSweep(other.t0, other.sw, ellParam(other, p))) continue;
    }
    if (!out.some(q => dist2(q, p) < 1e-18)) out.push(p);
  }
  return out;
}
/** every point where two pieces cross; `inf` runs both on for ever (apparent) */
function xPieces(A, B, inf) {
  const la = lform(A), lb = lform(B);
  if (la && lb) return xLinLin(la, lb, inf);
  if (la || lb) {
    const L = la || lb, C = la ? B : A;
    if (C.g === 'arc') return xLinCirc(L, C.c, C.r, inf).filter(p => inf || inSweep(C.a0, C.sw, ang(C.c, p)));
    if (C.g === 'ell') return xLinEll(L, C, inf);
    return [];
  }
  if (A.g === 'arc' && B.g === 'arc') {
    return xCircleCircle(A.c, A.r, B.c, B.r).filter(p => inf ||
      (inSweep(A.a0, A.sw, ang(A.c, p)) && inSweep(B.a0, B.sw, ang(B.c, p))));
  }
  if (A.g === 'ell') return xEllCurve(A, B, inf);
  if (B.g === 'ell') return xEllCurve(B, A, inf);
  return [];
}

/* ---- the pieces of each kind of entity ---- */
/** the exact centre of area of a closed run of straight and arc spans —
    Green's theorem on each span, so a slot or a rounded rectangle is
    answered by its true outline and not by a polygon standing in for it */
function spansCentroid(P, bul) {
  let A2 = 0, Mx = 0, My = 0;
  const n = P.length;
  for (let i = 0; i < n; i++) {
    const p = P[i], q = P[(i + 1) % n];
    const arc = bul ? bulgeArc(p, q, bul[i] || 0) : null;
    if (!arc) {
      const dx = q[0] - p[0], dy = q[1] - p[1];
      A2 += p[0] * q[1] - q[0] * p[1];
      Mx += dy * (p[0] * p[0] + p[0] * dx + dx * dx / 3);
      My += dx * (p[1] * p[1] + p[1] * dy + dy * dy / 3);
      continue;
    }
    /* signed sweep, the way the span actually runs from p to q */
    const al = arc.a0;
    const phi = arc.ccw ? wrap(arc.a1 - arc.a0) : -wrap(arc.a0 - arc.a1);
    const be = al + phi, r = arc.r, cx = arc.c[0], cy = arc.c[1];
    const sB = Math.sin(be), sA = Math.sin(al), cB = Math.cos(be), cA = Math.cos(al);
    A2 += cx * r * (sB - sA) - cy * r * (cB - cA) + r * r * phi;
    const I = (f, a, b) => f(b) - f(a);
    Mx += cx * cx * r * (sB - sA) + 2 * cx * r * r * I(t => t / 2 + Math.sin(2 * t) / 4, al, be) +
      r * r * r * I(t => Math.sin(t) - Math.sin(t) ** 3 / 3, al, be);
    My += -(-cy * cy * r * (cB - cA) + 2 * cy * r * r * I(t => t / 2 - Math.sin(2 * t) / 4, al, be) +
      r * r * r * I(t => -Math.cos(t) + Math.cos(t) ** 3 / 3, al, be));
  }
  if (Math.abs(A2) < 1e-12) return null;
  return [Mx / A2, -My / A2];
}
/** the centre of area of a closed outline, or null */
function geomCentre(e) {
  if (!e) return null;
  if (e.t === 'circle' || e.t === 'ellipse') return e.c;
  if (e.t === 'pline') {
    if (!e.closed || !e.pts || e.pts.length < 3) return null;
    return spansCentroid(e.pts, hasBulge(e) ? e.pts.map((p, i) => bulgeAt(e, i)) : null) || vertexMean(e.pts);
  }
  let pts = null;
  if (e.t === 'hatch') {
    const L = e.loops || [];
    let best = 0;
    for (const loop of L) { const a = Math.abs(polyArea(loop)); if (a > best) { best = a; pts = loop; } }
  } else if (e.t === 'room') {
    try { pts = roomBoundary(e) || e.pts; } catch (err) { pts = e.pts; }
  } else if (e.t === 'spline') {
    if (!e.closed) return null;
    pts = e.pts;
  } else if (e.t === 'column') return e.p;
  else {
    if (!GEOM[e.t]) return null;
    try { const ss = shapes(e, 24).filter(s => s.pts && s.closed && s.pts.length > 2); pts = ss.length ? ss[0].pts : null; } catch (err) { return null; }
  }
  if (!pts || pts.length < 3) return null;
  return spansCentroid(pts, null) || vertexMean(pts);
}
function vertexMean(pts) {
  let sx = 0, sy = 0;
  for (const p of pts) { sx += p[0]; sy += p[1]; }
  return [sx / pts.length, sy / pts.length];
}
/** a closed or open run of points as segment pieces, each offering its ends and middle */
function ptsPieces(P, closed, out, src, endsMeta, extOpen) {
  const n = P.length;
  if (n < 2) return;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = P[i], b = P[(i + 1) % n];
    if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue;
    out.push({
      g: 'seg', a, b, src,
      ends: [[a, endsMeta ? endsMeta(i) : null], [b, endsMeta ? endsMeta((i + 1) % n) : null]],
      mid: [mid(a, b), null],
      ext: extOpen ? [i === 0, i === segs - 1] : null,
    });
  }
}
/** a {c,r,a0,a1} or {c,r} shape record as a piece */
function shapeArcPiece(s, src) {
  if (s.a0 == null || s.a1 == null) return { g: 'arc', c: s.c, r: s.r, a0: 0, sw: TAU, cen: [s.c, null], quad: 1, src };
  const sw = sweepOf(s.a0, s.a1);
  const pc = { g: 'arc', c: s.c, r: s.r, a0: s.a0, sw, cen: [s.c, null], quad: 1, src };
  pc.ends = [[arcAt(pc, s.a0), null], [arcAt(pc, s.a0 + sw), null]];
  pc.mid = [arcAt(pc, s.a0 + sw / 2), null];
  return pc;
}
/** the spans of a polyline as pieces — only those that can reach the cursor */
function plinePieces(e, raw, reach, out, meta) {
  const P = e.pts || [], n = P.length;
  if (n === 1) { out.pcs.push({ g: 'seg', a: P[0], b: P[0], ends: [[P[0], meta(0)]], src: e }); return; }
  const spans = e.closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const p1 = P[i], p2 = P[(i + 1) % n];
    if (!p1 || !p2) continue;
    const b = bulgeAt(e, i), chord = dist(p1, p2);
    /* every point of a bulged span lies within max(chord/2, sagitta) of the
       chord's middle, so a span that cannot reach is skipped unbuilt */
    if (raw && dist(raw, mid(p1, p2)) > reach + Math.max(chord / 2, Math.abs(b) * chord / 2) + 1e-9) continue;
    const ext = e.closed ? null : [i === 0, i === spans - 1];
    const ends = [[p1, meta(i)], [p2, meta((i + 1) % n)]];
    const arc = bulgeArc(p1, p2, b);
    if (!arc) {
      if (chord === 0) continue;
      out.pcs.push({ g: 'seg', a: p1, b: p2, ends, mid: [mid(p1, p2), null], ext, src: e, key: e.id + ':' + i });
      continue;
    }
    const a0 = arc.ccw ? arc.a0 : arc.a1;
    const sw = sweepOf(a0, arc.ccw ? arc.a1 : arc.a0);
    const pc = { g: 'arc', c: arc.c, r: arc.r, a0, sw, ends, cen: [arc.c, null], quad: 1, ext, src: e, key: e.id + ':' + i };
    pc.mid = [arcAt(pc, a0 + sw / 2), null];
    out.pcs.push(pc);
  }
}
const DEF_META = (e, at) => (e && e.id != null) ? { id: e.id, at } : null;
/**
 * The pieces and feature points of one entity.
 *   pcs  — pieces (see above)
 *   pts  — feature points that belong to the whole object: a point's node,
 *          a text's or block's insertion point, a closed outline's centre of
 *          area, a dimension's definition points. {p, k, meta, body}
 *          `body` marks one that hovering the object anywhere offers.
 * `raw`/`reach` let a big polyline build only the spans near the cursor.
 */
function snapGeo(e, raw, reach, depth, opts) {
  const out = { pcs: [], pts: [] };
  const M = at => DEF_META(e, at);
  switch (e.t) {
    case 'line':
      out.pcs.push({ g: 'seg', a: e.a, b: e.b, ends: [[e.a, M('a')], [e.b, M('b')]], mid: [mid(e.a, e.b), M('mid')], ext: [1, 1], src: e });
      break;
    case 'xline': case 'ray': {
      const u = norm(e.d || (e.b ? sub(e.b, e.a) : [1, 0]));
      if (!u[0] && !u[1]) break;
      /* AutoCAD's midpoint of an xline is the point it was drawn through */
      const pc = { g: 'lin', a: e.a, u, t0: e.t === 'ray' ? 0 : -Infinity, t1: Infinity, src: e };
      if (e.t === 'ray') pc.ends = [[e.a, M('a')]]; else pc.mid = [e.a, M('a')];
      out.pcs.push(pc);
      break;
    }
    case 'circle':
      if (e.r > 0) out.pcs.push({ g: 'arc', c: e.c, r: e.r, a0: 0, sw: TAU, cen: [e.c, M('c')], quad: 1, src: e });
      break;
    case 'arc': {
      if (!(e.r > 0)) break;
      const sw = arcSweep(e);
      const pc = { g: 'arc', c: e.c, r: e.r, a0: e.a0, sw, cen: [e.c, M('c')], quad: 1, ext: [1, 1], src: e };
      if (sw < TAU) { pc.ends = [[arcPt(e, 0), null], [arcPt(e, 1), null]]; pc.mid = [arcPt(e, 0.5), null]; }
      out.pcs.push(pc);
      break;
    }
    case 'ellipse': {
      if (!(e.rx > 0 && e.ry > 0)) break;
      const t0 = e.a0 == null ? 0 : e.a0;
      const sw = (e.a0 == null && e.a1 == null) ? TAU : sweepOf(t0, e.a1 == null ? TAU : e.a1);
      const E = { g: 'ell', c: e.c, rx: e.rx, ry: e.ry, rot: e.rot || 0, t0, sw, cen: [e.c, M('c')], quad: 1, src: e };
      if (sw < TAU - 1e-12) { E.ends = [[ellAt(E, t0), null], [ellAt(E, t0 + sw), null]]; E.mid = [ellMidByLength(E), null]; }
      out.pcs.push(E);
      break;
    }
    case 'pline':
      plinePieces(e, raw, reach, out, i => M(i));
      if (e.closed) out.pts.push({ lazy: e, k: 'gcen', body: 1 });
      break;
    case 'spline': {
      const P = e.pts || [];
      if (P.length < 2) break;
      const pc = { g: 'pl', pts: P, closed: !!e.closed, src: e };
      if (!e.closed) {
        pc.ends = [[P[0], M(0)], [P[P.length - 1], M(P.length - 1)]];
        pc.mid = [polyAlong(P, 0.5), null];
      }
      out.pcs.push(pc);
      if (e.closed) out.pts.push({ lazy: e, k: 'gcen', body: 1 });
      break;
    }
    case 'point':
      out.pts.push({ p: e.p, k: 'node', meta: M('p') });
      break;
    case 'text': case 'mtext': case 'attdef':
      if (e.p) out.pts.push({ p: e.p, k: 'ins', meta: M('p'), body: 1 });
      break;
    case 'dim': {
      /* A dimension is a block of lines to AutoCAD: its lines take END, MID
         and INT, and its definition points and text position are NODES. */
      let g = null; try { g = dimGeom(e); } catch (err) { g = null; }
      if (g) {
        for (const [a, b] of g.lines) ptsPieces([a, b], false, out.pcs, e);
        if (g.tp) out.pts.push({ p: g.tp, k: 'node' });
      }
      const d1 = typeof dimEnd === 'function' ? dimEnd(e, 1) : e.p1;
      const d2 = typeof dimEnd === 'function' ? dimEnd(e, 2) : e.p2;
      if (d1) out.pts.push({ p: d1, k: 'node' });
      if (d2) out.pts.push({ p: d2, k: 'node' });
      if (e.p3) out.pts.push({ p: e.p3, k: 'node' });
      break;
    }
    case 'leader': {
      let g = null; try { g = leaderGeom(e); } catch (err) { g = null; }
      if (g && g.spine) ptsPieces(g.spine, false, out.pcs, e);
      break;
    }
    case 'hatch': {
      for (const L of (e.loops || [])) if (L && L.length > 1) ptsPieces(L, true, out.pcs, e);
      out.pts.push({ lazy: e, k: 'gcen', body: 1 });
      break;
    }
    case 'insert': {
      /* the geometry INSIDE the block, moved into place, snaps as itself —
         an arc in a door block is an arc, not twenty-four little lines */
      if ((depth || 0) < 4 && typeof insertEnts === 'function') {
        let kids = [];
        try { kids = insertEnts(e); } catch (err) { kids = []; }
        for (const k of kids) {
          if (k.t === 'attdef' && k.hidden) continue;
          const inner = snapGeo(k, raw, reach, (depth || 0) + 1, opts);
          for (const pc of inner.pcs) { pc.src = e; if (pc.ends) pc.ends = pc.ends.map(q => [q[0], null]); if (pc.mid) pc.mid = [pc.mid[0], null]; if (pc.cen) pc.cen = [pc.cen[0], null]; pc.ext = null; out.pcs.push(pc); }
          for (const f of inner.pts) out.pts.push({ p: f.p, lazy: f.lazy, k: f.k, body: f.body && f.k !== 'gcen' ? 1 : 0 });
        }
      }
      if (e.p) out.pts.push({ p: e.p, k: 'ins', meta: M('p'), body: 1 });
      break;
    }
    case 'wall':
      wallPieces(e, out, opts);
      break;
    default:
      if (GEOM[e.t]) archPieces(e, out);
  }
  return out;
}
/** the point a fraction `f` of the way along a run of points, by length */
function polyAlong(P, f) {
  let L = 0;
  for (let i = 1; i < P.length; i++) L += dist(P[i - 1], P[i]);
  let want = L * f;
  for (let i = 1; i < P.length; i++) {
    const d = dist(P[i - 1], P[i]);
    if (want <= d || i === P.length - 1) {
      const t = d > 0 ? clamp(want / d, 0, 1) : 0;
      return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t];
    }
    want -= d;
  }
  return P[0];
}
/** an architectural object snaps to its GENERATED geometry — the outline it
    draws — plus the one point it is placed by */
function archPieces(e, out) {
  let ss = [];
  try { ss = shapes(e, 24) || []; } catch (err) { ss = []; }
  const dref = q => defPointRef(e, q);
  for (const s of ss) {
    if (s.text != null || s.fill || s.role === 'arrowhead') continue;
    if (s.pts && s.pts.length > 1) ptsPieces(s.pts, !!s.closed, out.pcs, e, null);
    else if (s.c && s.r > 0) out.pcs.push(shapeArcPiece(s, e));
  }
  /* the ends of what the object is defined BY keep their attachment, so a
     dimension from a grid line end follows the grid */
  for (const pc of out.pcs) if (pc.ends) pc.ends = pc.ends.map(q => [q[0], q[1] || dref(q[0])]);
  if (e.t === 'door' || e.t === 'window') {
    const F = typeof openFrame === 'function' ? openFrame(e) : null;
    if (F) out.pts.push({ p: F.c, k: 'ins', body: 1 });
  } else if (e.t === 'column') {
    if (e.p) out.pts.push({ p: e.p, k: 'ins', meta: DEF_META(e, 'p'), body: 1 });
    if (e.shape !== 'round' && e.p) out.pts.push({ p: e.p, k: 'gcen', body: 1 });
  } else if (e.t === 'room' || e.t === 'floor' || e.t === 'roof') {
    out.pts.push({ lazy: e, k: 'gcen', body: 1 });
  }
}
/* ---------------- walls ----------------
   wcen: the centreline — its ends, its midpoint, nearest along it.
   wface: the two mitred face lines — their ends, midpoints, nearest,
          the reveals at every opening and the breaks at a junction. */
/* Wall face and break snaps are dropped above this many walls, so that
   dragging stays interactive on a large plan. That is a reasonable trade and
   an unreasonable secret: the snaps somebody is reaching for stop existing and
   nothing says why. Said once — a message on every cursor move would be worse
   than the silence it replaced. */
const WALL_SNAP_MAX = 240;
let SNAP_LIMIT_SAID = false;
function snapLimitNotice() {
  ST.snapLimited = true;
  if (SNAP_LIMIT_SAID) return;
  SNAP_LIMIT_SAID = true;
  if (typeof echo === 'function')
    echo('Over ' + WALL_SNAP_MAX + ' walls: snapping to wall faces and breaks is off, endpoints and midpoints still work');
}
/** a new document starts quiet again */
function snapLimitForget() { SNAP_LIMIT_SAID = false; }
function wallPieces(w, out, opts) {
  if (wallLen(w) < EPS) return;
  /* The centreline ends ARE the points a wall is defined by, so a dimension
     snapped here attaches to the wall itself and follows it. */
  out.pcs.push({
    g: 'seg', a: w.a, b: w.b, gate: 'wcen', nk: 'wcen', src: w, key: w.id + ':c',
    ends: [[w.a, { id: w.id, at: 'a' }], [w.b, { id: w.id, at: 'b' }]], mid: [mid(w.a, w.b), { id: w.id, at: 'mid' }],
    ext: [1, 1],
  });
  const dref = q => defPointRef(w, q);
  const face = (a, b, key) => {
    if (!a || !b || dist(a, b) < 1e-9) return;
    out.pcs.push({ g: 'seg', a, b, gate: 'wface', nk: 'wface', src: w, key, ends: [[a, dref(a)], [b, dref(b)]], mid: [mid(a, b), null] });
  };
  /* the mitred face carriers are cheap; the full shape list (jambs at
     openings, breaks at T-junctions) costs a scan of every wall, so only take
     it on drawings small enough to afford it. A mitred end has no cap — the
     diagonal between the two face points is not a line anyone can see. */
  const E0 = wallEndPoints(w, 0), E1 = wallEndPoints(w, 1);
  face(E0.plus, E1.minus, w.id + ':L');
  face(E0.minus, E1.plus, w.id + ':R');
  if (E0.capped) face(E0.plus, E0.minus, w.id + ':c0');
  if (E1.capped) face(E1.plus, E1.minus, w.id + ':c1');
  /* the reveals and breaks are wall-face snaps; nobody asking for anything
     else pays for the scan that finds them */
  if (opts && !opts.one && opts.on && !opts.on.wface) return;
  if (allWalls().length > WALL_SNAP_MAX) { snapLimitNotice(); return; }
  let ss = [];
  try { ss = wallShapes(w); } catch (err) { ss = []; }
  let k = 0;
  for (const s of ss) {
    if (!s.pts || s.pts.length < 2) continue;
    if (s.role !== 'face' && s.role !== 'faceGhost' && s.role !== 'jamb' && s.role !== 'cap' && s.role !== 'wlayer') continue;
    face(s.pts[0], s.pts[s.pts.length - 1], w.id + ':s' + (k++));
  }
}
/** walls whose *body* comes near the cursor, closest first.
    A face corner sits a full thickness away from the centreline, so this
    reaches wider than the point-snap shortlist does. */
function nearWalls(raw, r, pool) {
  const all = allWalls();
  const src = all.length <= 400 ? all
    : pool.map(h => h.e).filter(e => e.t === 'wall');
  const out = [];
  for (const w of src) {
    if (wallLen(w) < EPS || !visible(w)) continue;
    const d = segDist(raw, w.a, w.b) - wallT(w) / 2;
    if (d > r * 3) continue;
    out.push({ w, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, SNAP_MAX_WALL).map(x => x.w);
}
/** the two mitred face lines of a wall, as finite segments */
function wallFaceSegs(w) {
  const E0 = wallEndPoints(w, 0), E1 = wallEndPoints(w, 1);
  return [[E0.plus, E1.minus], [E0.minus, E1.plus]];
}
/** where the faces of two nearby walls cross — the corner points of a junction.
    Deliberately segment-to-segment, not carrier-to-carrier: at a T the stem's
    faces stop at the head, and an intersection out on the far face would be a
    point nothing is actually drawn at. */
function wallFaceIntersections(pool, raw, r, push) {
  const ws = nearWalls(raw, r, pool);
  const F = ws.map(wallFaceSegs);
  for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
    if ((ws[i].lvl || 0) !== (ws[j].lvl || 0)) continue;
    for (const A of F[i]) for (const B of F[j]) {
      const X = xLineLine(A[0], A[1], B[0], B[1], false);
      if (X.length) push(X[0], 'int');
    }
  }
}
/** perpendicular foot from `ref` onto segment a→b; off the segment is "on:false" */
function perpFoot(a, b, ref) {
  const d = sub(b, a), L = dot(d, d);
  if (L < EPS) return null;
  const t = dot(sub(ref, a), d) / L;
  return { p: [a[0] + d[0] * t, a[1] + d[1] * t], t, on: t >= -1e-9 && t <= 1 + 1e-9 };
}

/* ============================================================
   the engine
   ============================================================ */
/* the commands whose first point can wait for the second — AutoCAD's
   Deferred Perpendicular and Deferred Tangent */
const DEFER_CMDS = { line: 1, pline: 1 };
/** a deferred first point is waiting on the command that took it */
function deferLive() {
  const D = ST.defer;
  if (!D) return false;
  if (typeof CMD === 'undefined' || CMD !== D.cmd || !CMD.pts || CMD.pts.length !== 1) { ST.defer = null; return false; }
  return true;
}
/** where a deferred PER/TAN end has to be, now that the other end is P */
function solveDefer(D, P) {
  const pc = D.pc;
  if (!pc || !P) return null;
  let cands;
  if (D.kind === 'tan') {
    cands = pieceTangents(pc, P).map(c => c.p);
    /* no tangent from inside the curve: stay on the object, nearest the pick */
    if (!cands.length) return null;
  } else {
    cands = pieceFeet(pc, P).map(c => c.p);
    if (!cands.length) return null;
  }
  let best = null, bd = Infinity;
  for (const p of cands) { const d = dist(p, D.pick); if (d < bd) { bd = d; best = p; } }
  return best;
}
/** Both ends constrained: TAN–TAN, TAN–PER, PER–TAN, PER–PER. Two circles
    are solved in closed form — the four common tangents, the one nearest
    the two picks. Anything else by alternation, each end re-solved from the
    other until neither moves; for these curves that is a contraction. */
function solveJoint(D, E) {
  if (D.kind === 'tan' && E.kind === 'tan' && D.pc.g === 'arc' && E.pc.g === 'arc') {
    const c1 = D.pc.c, r1 = D.pc.r, c2 = E.pc.c, r2 = E.pc.r;
    const d = dist(c1, c2);
    if (!(d > 1e-12)) return null;
    const v = [(c2[0] - c1[0]) / d, (c2[1] - c1[1]) / d];
    let best = null, bd = Infinity;
    for (const s of [1, -1]) {
      const cc = (r1 - s * r2) / d;
      if (cc * cc > 1) continue;
      const h = Math.sqrt(Math.max(0, 1 - cc * cc));
      for (const k of [1, -1]) {
        const n = [v[0] * cc - k * h * v[1], v[1] * cc + k * h * v[0]];
        const T1 = [c1[0] + r1 * n[0], c1[1] + r1 * n[1]];
        const T2 = [c2[0] + s * r2 * n[0], c2[1] + s * r2 * n[1]];
        if (!inSweep(D.pc.a0, D.pc.sw, ang(c1, T1)) && D.pc.sw < TAU) { /* still a tangent to the carrier */ }
        const score = dist(T1, D.pick) + dist(T2, E.pick);
        if (score < bd) { bd = score; best = { p1: T1, p2: T2 }; }
      }
    }
    return best;
  }
  let p1 = D.pick.slice(), p2 = E.pick.slice();
  for (let i = 0; i < 60; i++) {
    const n2 = solveDefer(E, p1); if (!n2) return null;
    const n1 = solveDefer(D, n2); if (!n1) return null;
    const moved = dist(n1, p1) + dist(n2, p2);
    p1 = n1; p2 = n2;
    if (moved < 1e-11 * Math.max(1, Math.abs(p1[0]) + Math.abs(p1[1]))) return { p1, p2 };
  }
  /* PER–PER between lines that are not parallel has no answer */
  const chk2 = solveDefer(E, p1), chk1 = chk2 && solveDefer(D, chk2);
  return chk1 && dist(chk1, p1) < 1e-6 ? { p1, p2 } : null;
}
/** can this piece take a deferred PER (anything) or TAN (curves only)? */
function deferable(kind, pc) {
  if (kind === 'tan') return pc.g === 'arc' || pc.g === 'ell';
  return pc.g === 'seg' || pc.g === 'lin' || pc.g === 'arc' || pc.g === 'ell';
}
/** the first point of a LINE or PLINE is being picked with PER or TAN */
function deferAvailable() {
  return typeof CMD !== 'undefined' && CMD && CMD.phase === 'run' && DEFER_CMDS[CMD.def.key] &&
    Array.isArray(CMD.pts) && CMD.pts.length === 0;
}

/**
 * Resolve a screen position to a world point.
 * @param sx,sy screen px
 * @param ref   the rubber-band reference point (perp/tan/polar key off it)
 * @param now   optional clock override, for tests
 */
function snapPoint(sx, sy, ref, now) {
  const raw = s2w(sx, sy);
  ST.raw = raw;
  ST.snapAt = { sx, sy, ref: ref || null };
  ST.snapV = DOCV; ST.snapT = Date.now();
  const r = apertureR();
  const on = activeModes();
  const osOn = osnapActive();
  const one = oneShotKind();
  const tracks = [];
  ST.snapLimited = false;
  /* FROM measures its offset from the base point, and MID-BETWEEN-2 rubber
     bands from its first pick — both outrank whatever the command handed us */
  const modRef = ptModRef();
  if (modRef) ref = modRef;
  /* a deferred first point has no position yet, so nothing can be measured
     from it: the line's far end is found first and the near end follows */
  const deferred = deferLive();
  if (deferred) ref = null;

  /* Tab cycling survives a jittery hand but not a real move */
  if (!ST.snapScr || hyp(sx - ST.snapScr[0], sy - ST.snapScr[1]) > SNAP_CYCLE_RESET) {
    ST.snapCycle = 0; ST.snapScr = [sx, sy]; ST.snapCycled = false;
  }

  /* ---- candidate collection, deduplicated on a coarse screen-pixel grid ---- */
  const cands = [];
  const cell = new Map();
  const gtol = Math.max(px(0.5), 1e-12);
  const merge2 = gtol * gtol * 4;
  /* `d` ranks the candidate; whether it may stand OUTSIDE the aperture is the
     caller's statement, never an accident of what `d` was. Everything inside
     the aperture is tier 1. A far candidate — the defined points of the
     object under the crosshair, or an aimed override — is tier 2 unless it
     happens to be inside too. */
  function push(p, k, d, priOverride, allowFar, meta, src) {
    if (!p) return;
    const x = p[0], y = p[1];
    if (!isFinite(x) || !isFinite(y)) return;
    const dp = hyp(x - raw[0], y - raw[1]);
    if (d == null) d = dp;
    const inside = dp <= r;
    if (!inside && !allowFar) return;
    if (!allowFar && !(d <= r)) return;
    /* allowFar 1: admitted as if it were under the crosshair (a centre found
       from its rim, an aimed override, the grid); 2: a defined point of the
       object under the aperture, tier 2 unless it is inside anyway */
    const tier = inside || allowFar === 1 ? 1 : 2;
    const pri = priOverride == null ? (SNAP_PRI[k] || 1) : priOverride;
    const i0 = Math.round(x / gtol), j0 = Math.round(y / gtol);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const c = cell.get((i0 + a) + ',' + (j0 + b));
      if (c && dist2(c.p, [x, y]) < merge2) {
        if (tier < c.tier || (tier === c.tier && (pri > c.pri || (pri === c.pri && d < c.d)))) {
          c.k = k; c.d = d; c.pri = pri; c.p = [x, y]; c.tier = tier;
          if (meta || !c.meta) c.meta = meta || null;
          if (src != null) c.src = src;
        } else if (meta && !c.meta && dist2(c.p, [x, y]) < 1e-18) c.meta = meta;
        return;
      }
    }
    const c = { p: [x, y], k, d, pri, meta: meta || null, tier, src: src == null ? null : src };
    cell.set(i0 + ',' + j0, c);
    cands.push(c);
  }

  let hits = null, pcs = null;
  if (osOn && on !== SNAP_NONE) {
    hits = nearEnts(raw, r);
    const pool = hits.slice(0, SNAP_MAX_POINT);
    const reach = r * 2.5;
    pcs = [];
    const xPool = [];
    let nX = 0;
    const opts = { on, one };
    for (const h of pool) {
      const G = snapGeo(h.e, raw, reach, 0, opts);
      let body = Infinity;
      const xEnt = nX < SNAP_MAX_X;
      let any = false;
      for (let i = 0; i < G.pcs.length; i++) {
        const pc = G.pcs[i];
        if (pc.gate && !one && !on[pc.gate]) continue;
        const nr = pieceNear(pc, raw);
        if (!(nr.d <= reach)) continue;
        pc.nd = nr.d; pc.np = nr.p;
        if (pc.key == null) pc.key = (h.e.id != null ? h.e.id : 'x') + ':' + i;
        if (nr.d < body) body = nr.d;
        pcs.push(pc);
        pieceSnaps(pc, raw, ref, r, on, one, push, deferred);
        /* a wall's centreline is not drawn, so nothing crosses it */
        if (xEnt && pc.gate !== 'wcen' && xPool.length < SNAP_MAX_XP) { xPool.push(pc); any = true; }
      }
      if (any) nX++;
      if (!G.pcs.length) body = h.d;
      for (const f of G.pts) featureSnap(f, body, raw, r, on, one, push, h.e);
    }
    if (on.int || on.appint) pieceIntersections(xPool, raw, r, push, on);
    if (on.int && (on.wface || one)) wallFaceIntersections(pool, raw, r, push);
    if (on.ext) extensionSnaps(hits, pcs, xPool, raw, r, push, tracks);
    /* the extended intersection: two objects that would cross if they ran
       on — offered only when no real crossing is under the aperture */
    if ((one === 'int' || one === 'appint') && (ST.xpick || !cands.some(c => c.k === 'int' || c.k === 'appint')))
      extendedIntSnaps(pcs, raw, r, one, push);
  }

  /* ---- deferred perpendicular ----
     The foot of a perpendicular can sit far from the geometry that carries it:
     dropping a perpendicular onto a quarter arc lands at 180 degrees, nowhere
     near the arc itself. Those entities never reach the pool above, so scan
     the carriers separately. */
  if (osOn && on.perp && ref && !one) deferredPerp(raw, ref, r, push);

  /* ---- parallel: a direction lifted off another object, offered as a ray
     out of the rubber-band reference point ---- */
  if (osOn && ref) {
    parDwell(raw, r, now, on, pcs);
    if (on.par) parallelSnaps(raw, ref, r, push, tracks);
  }

  /* ---- alignment paths from acquired points ----
     A one-shot override is an instruction about THIS point: tracking and the
     grid do not get to answer it instead. */
  if (!one) trackSnaps(raw, r, push, tracks);

  /* ---- grid snap: the cursor is held to the grid, and any real object snap
     inside the aperture still outranks it ---- */
  if (ST.snapgrid && !one) {
    const step = DOC.snapStep;
    if (step > 0) push([Math.round(raw[0] / step) * step, Math.round(raw[1] / step) * step], 'grid', null, null, 1);
  }

  /* ---- pick the winner: distance decides, priority only buys a head start ----
     Sorting by priority first (which this did originally) let any high-priority
     candidate anywhere in the aperture beat a low-priority one sitting directly
     under the crosshair — an apparent intersection 0.29px from the cursor lost
     to an endpoint 5.7px away, and a perpendicular at d=0 lost to an
     intersection 138mm off.

     Score = true distance − (priority × bias). One numeric key, so the order
     stays total and stable; a "within N px, compare priority instead"
     comparator is non-transitive and sorts inconsistently. Tier first: a point
     inside the aperture always beats one the aperture merely points along. */
  const bias = px(SNAP_BIAS_PX) / SNAP_PRI_MAX;
  for (const c of cands) c.score = c.d - c.pri * bias;
  cands.sort((a, b) => a.tier - b.tier || a.score - b.score || b.pri - a.pri);
  if (cands.length > SNAP_MAX_CANDS) cands.length = SNAP_MAX_CANDS;
  ST.snapCands = cands;
  if (ST.snapCycle >= cands.length) ST.snapCycle = 0;
  let best = cands.length ? cands[ST.snapCycle] : null;
  ST.snap = best;
  if (osOn) trackDwell(best, now);

  let out = best ? best.p.slice() : raw;
  ST.snapTip = best ? snapTipFor(best) : null;

  /* ---- ortho / polar constrain relative to ref ----
     An override is an instruction, not a preference. Asking for PER and being
     handed a polar point instead is the wrong answer confidently given, so
     while one is up neither constraint gets to speak. */
  if (ref && !best && !one) {
    const v = sub(out, ref);
    if (ST.ortho) {
      out = Math.abs(v[0]) >= Math.abs(v[1]) ? [ref[0] + v[0], ref[1]] : [ref[0], ref[1] + v[1]];
      const t = [ref, out]; t.k = 'ortho'; tracks.push(t);
      ST.snapTip = 'Ortho: ' + fmt(dist(ref, out)) + ' < ' + fmtAng(ang(ref, out)) + '°';
    } else if (ST.polar) {
      const lock = polarLock(ref, out);
      if (lock) {
        out = lock.p;
        const t = polarPath(ref, lock.u, lock.L); t.k = 'polar'; tracks.push(t);
        ST.snapTip = 'Polar: ' + fmt(lock.L) + ' < ' + fmtAng(lock.a) + '°';
      }
    }
  }
  /* ---- the deferred end follows the one being placed ---- */
  if (deferred) {
    const first = (best && best.meta && best.meta.first) || solveDefer(ST.defer, out);
    if (first) CMD.pts[CMD.pts.length - 1] = first;
  }
  ST.tracks = tracks.length ? tracks : null;
  return out;
}

/** The points one piece offers. Tier 1 is whatever lies inside the
    aperture; tier 2 the piece's own defined points, however far along it
    they are, when the aperture is actually on the piece. */
function pieceSnaps(pc, raw, ref, r, on, one, push, deferred) {
  const under = pc.nd <= r;
  const far = under ? 2 : false;
  const src = pc.src ? pc.src.id : null;
  if (on.end && pc.ends) for (const q of pc.ends) push(q[0], 'end', null, null, far, q[1], src);
  if (on.mid && pc.mid) push(pc.mid[0], 'mid', null, null, far, pc.mid[1], src);
  if (on.cen && pc.cen) {
    const c = pc.cen[0], dc = dist(raw, c);
    if (dc <= r) push(c, 'cen', dc, null, false, pc.cen[1], src);
    /* A centre is a full-strength snap when the cursor is on it. Hovering the
       curve instead still offers it — that is how you pick the centre of a big
       circle — but at a lower rank, and never while a point that actually lies
       on the curve (quadrant, end, midpoint) is already inside the aperture. */
    else if (under && (one === 'cen' || !curvePtInReach(pc, raw, r, on)))
      push(c, 'cen', pc.nd, one === 'cen' ? null : SNAP_PRI.cenEdge, 1, pc.cen[1], src);
  }
  if (on.quad && pc.quad) {
    for (let i = 0; i < 4; i++) {
      const q = quadPoint(pc, i);
      if (q) push(q, 'quad', null, null, one === 'quad' ? far : false, null, src);
    }
  }
  if (on.perp) {
    if (ref) {
      const feet = pieceFeet(pc, ref);
      if (one === 'perp') {
        /* aimed: the foot on the side you are pointing at, wherever it lands */
        const f = nearestOf(feet, raw);
        if (f && under) push(f.p, f.on ? 'perp' : 'perpx', pc.nd, null, 1, null, src);
      } else for (const f of feet) push(f.p, f.on ? 'perp' : 'perpx', null, null, false, null, src);
    } else if (one === 'perp' && under) deferSnap('perp', pc, raw, push, deferred, src);
  }
  if (on.tan) {
    if (ref) {
      const tp = pieceTangents(pc, ref);
      if (one === 'tan') {
        const t = nearestOf(tp, raw);
        if (t && under) push(t.p, t.on ? 'tan' : 'tanx', pc.nd, null, 1, null, src);
      } else for (const t of tp) push(t.p, t.on ? 'tan' : 'tanx', null, null, false, null, src);
    } else if (one === 'tan' && under) deferSnap('tan', pc, raw, push, deferred, src);
  }
  if (on.near && under) push(pc.np, 'near', pc.nd, null, false, null, src);
  if (pc.nk && on[pc.nk] && under) push(pc.np, pc.nk, pc.nd, null, false, pc.src ? defPointRef(pc.src, pc.np) : null, src);
}
/** Deferred Perpendicular / Deferred Tangent. With nothing to measure from
    yet, the marker sits where the aperture is on the object; the true point
    is solved when the other end is known. If the other end is ITSELF a
    deferred pick — LINE, TAN, TAN — both are solved together. */
function deferSnap(kind, pc, raw, push, deferred, src) {
  if (!deferable(kind, pc)) return;
  if (deferred) {
    const J = solveJoint(ST.defer, { kind, pc, pick: pc.np });
    if (J) push(J.p2, kind, pc.nd, null, 1, { first: J.p1 }, src);
    return;
  }
  if (!deferAvailable()) return;
  push(pc.np, kind === 'tan' ? 'tand' : 'perpd', pc.nd, null, 1, { defer: pc }, src);
}
function nearestOf(list, p) {
  let best = null, bd = Infinity;
  for (const c of list) { const d = dist2(c.p, p); if (d < bd) { bd = d; best = c; } }
  return best;
}
/** quadrant i (0..3) of a circular or elliptical piece, or null off its sweep */
function quadPoint(pc, i) {
  const a = i * Math.PI / 2;
  if (pc.g === 'arc') return inSweep(pc.a0, pc.sw, a) ? arcAt(pc, a) : null;
  if (pc.g === 'ell') return inSweep(pc.t0, pc.sw, a) ? ellAt(pc, a) : null;
  return null;
}
/** is a point lying on this curve, of a mode that is on, already within the aperture? */
function curvePtInReach(pc, raw, r, on) {
  on = on || ST.osnapOn;
  if (on.end && pc.ends) for (const q of pc.ends) if (dist(raw, q[0]) <= r) return true;
  if (on.mid && pc.mid && dist(raw, pc.mid[0]) <= r) return true;
  if (on.quad) for (let i = 0; i < 4; i++) { const q = quadPoint(pc, i); if (q && dist(raw, q) <= r) return true; }
  return false;
}
/** a feature point of the whole object: node, insertion, centre of area */
function featureSnap(f, body, raw, r, on, one, push, e) {
  if (!on[f.k]) return;
  if (!f.p && f.lazy) f.p = geomCentre(f.lazy);
  if (!f.p) return;
  const src = e && e.id != null ? e.id : null;
  const dp = dist(raw, f.p);
  if (dp <= r) { push(f.p, f.k, dp, null, false, f.meta || null, src); return; }
  if (!f.body || !(body <= r)) return;
  /* hovering the object anywhere offers it — the text, the block, the
     boundary of the closed shape — ranked by how close the crosshair is to
     the OBJECT, below any point that is actually under the crosshair */
  const pri = one === f.k ? null : (f.k === 'gcen' ? SNAP_PRI.gcenEdge : SNAP_PRI.insEdge);
  push(f.p, f.k, body, pri, 1, f.meta || null, src);
}

/* ---------------- pairwise intersections ----------------
   Bounded two ways: only the SNAP_MAX_X entities nearest the cursor take
   part, and only their pieces within reach of the aperture, so a
   5000-vertex polyline contributes one or two spans. A polyline crossing
   itself is an intersection too — any two of its spans that do not merely
   share a vertex. */
function pieceIntersections(P, raw, r, push, on) {
  /* a curve stored as points takes part through the segments near the cursor */
  const L = [];
  const reach = r * 2.5;
  for (const pc of P) {
    if (pc.g !== 'pl') { L.push(pc); continue; }
    const Q = pc.pts, n = Q.length, segs = pc.closed ? n : n - 1;
    for (let i = 0; i < segs && L.length < SNAP_MAX_XP * 4; i++) {
      const a = Q[i], b = Q[(i + 1) % n];
      if (segDist(raw, a, b) <= reach) L.push({ g: 'seg', a, b, src: pc.src, key: pc.key + '/' + i });
    }
  }
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const A = L[i], B = L[j];
    const same = A.src && A.src === B.src;
    if (on.int) for (const p of xPieces(A, B, false)) {
      if (same && sharesEnd(A, B, p)) continue;
      push(p, 'int');
    }
    if (on.appint && !same) for (const p of xPieces(A, B, true)) push(p, 'appint');
  }
}
/** two spans of one polyline meeting at their common vertex are not crossing */
function sharesEnd(A, B, p) {
  const ea = A.ends || (A.g === 'seg' ? [[A.a], [A.b]] : null);
  const eb = B.ends || (B.g === 'seg' ? [[B.a], [B.b]] : null);
  if (!ea || !eb) return false;
  const tol = 1e-9 * Math.max(1, Math.abs(p[0]) + Math.abs(p[1]));
  for (const x of ea) for (const y of eb)
    if (dist(x[0], y[0]) <= tol && dist(x[0], p) <= tol * 10 + 1e-9) return true;
  return false;
}
/** INT or APP typed with only one object under the aperture: AutoCAD's
    Extended Intersection. The first pick names an object; the second the
    object it would meet if both ran on — however far away that is. */
function extendedIntSnaps(pcs, raw, r, one, push) {
  if (!pcs) return;
  const X = ST.xpick;
  if (X && X.pc) {
    for (const pc of pcs) {
      if (!(pc.nd <= r) || pc.key === X.pc.key) continue;
      const pts = xPieces(X.pc, pc, true);
      const q = nearestOf(pts.map(p => ({ p })), raw);
      if (q) push(q.p, one === 'appint' ? 'xapp' : 'xint', pc.nd, null, 1, null, pc.src ? pc.src.id : null);
    }
    return;
  }
  let hov = null;
  for (const pc of pcs) if (pc.nd <= r && (!hov || pc.nd < hov.nd)) hov = pc;
  if (hov) push(hov.np, one === 'appint' ? 'xapp1' : 'xint1', hov.nd, null, 1, { xfirst: hov }, hov.src ? hov.src.id : null);
}

/* ---------------- entity shortlist ---------------- */
/** entities whose geometry comes within reach of the cursor, closest first.
    A circle, arc or ellipse whose CENTRE is under the cursor is in reach too:
    pointing straight at the centre of a big circle is pointing at it. */
function nearEnts(raw, r) {
  const w = r * 2.5;
  const pool = query(raw[0] - w, raw[1] - w, raw[0] + w, raw[1] + w);
  const reach = r * 2.4, hits = [];
  /* The primitives are measured exactly and cheaply here — a polyline span
     that cannot reach is rejected on its chord before its arc is ever built —
     so a zoomed-out view with hundreds of objects under the aperture costs
     microseconds each. Only the objects with no cheap form (architecture,
     text, blocks, dimensions) go through the general entDist, and a bounded
     number of those. */
  let heavy = 0;
  for (const e of pool) {
    if (!e) continue;
    let d = quickDist(e, raw, reach);
    if (d === undefined) {
      if (heavy >= SNAP_MAX_SCAN) continue;
      heavy++;
      try { d = entDist(raw, e); } catch (err) { continue; }
    }
    if (!(d < reach)) {
      /* pointing straight at the centre of a big circle is pointing at it */
      if ((e.t === 'circle' || e.t === 'arc' || e.t === 'ellipse') && e.c && dist(raw, e.c) <= r) d = r;
      /* and a dimension is pointed at by its definition points too */
      else if (e.t === 'dim') {
        const p1 = typeof dimEnd === 'function' ? dimEnd(e, 1) : e.p1;
        const p2 = typeof dimEnd === 'function' ? dimEnd(e, 2) : e.p2;
        const dd = Math.min(p1 ? dist(raw, p1) : Infinity, p2 ? dist(raw, p2) : Infinity);
        if (dd <= r) d = dd;
      }
    }
    if (!(d < reach) || !visible(e)) continue;
    hits.push({ e, d });
  }
  hits.sort((a, b) => a.d - b.d);
  return hits;
}
/** the exact distance from p to a primitive entity, or undefined when it has
    no cheap form. `cut` lets a long polyline skip spans that cannot beat it. */
function quickDist(e, p, cut) {
  switch (e.t) {
    case 'line': return segDist(p, e.a, e.b);
    case 'point': return e.p ? dist(p, e.p) : Infinity;
    case 'circle': return Math.abs(dist(p, e.c) - e.r);
    case 'arc': {
      const a = ang(e.c, p);
      if (angOnArc(e, a) !== null) return Math.abs(dist(p, e.c) - e.r);
      return Math.min(dist(p, arcPt(e, 0)), dist(p, arcPt(e, 1)));
    }
    case 'xline': case 'ray': {
      const u = norm(e.d || (e.b ? sub(e.b, e.a) : [1, 0]));
      if (!u[0] && !u[1]) return dist(p, e.a);
      let t = dot(sub(p, e.a), u);
      if (e.t === 'ray' && t < 0) t = 0;
      return dist(p, [e.a[0] + u[0] * t, e.a[1] + u[1] * t]);
    }
    case 'pline': {
      const P = e.pts || [], n = P.length;
      if (!n) return Infinity;
      if (n === 1) return dist(p, P[0]);
      const spans = e.closed ? n : n - 1;
      let best = Infinity;
      for (let i = 0; i < spans; i++) {
        const a = P[i], b = P[(i + 1) % n];
        const bl = bulgeAt(e, i);
        if (!bl) { const d = segDist(p, a, b); if (d < best) best = d; continue; }
        const ch = dist(a, b);
        if (dist(p, mid(a, b)) - Math.max(ch / 2, Math.abs(bl) * ch / 2) > Math.min(best, cut == null ? Infinity : cut)) continue;
        const arc = bulgeArc(a, b, bl);
        if (!arc) { const d = segDist(p, a, b); if (d < best) best = d; continue; }
        const a0 = arc.ccw ? arc.a0 : arc.a1, sw = sweepOf(a0, arc.ccw ? arc.a1 : arc.a0);
        const d = pieceNear({ g: 'arc', c: arc.c, r: arc.r, a0, sw }, p).d;
        if (d < best) best = d;
      }
      return best;
    }
    case 'spline': {
      const P = e.pts || [];
      if (P.length < 2) return P.length ? dist(p, P[0]) : Infinity;
      return polyDist(p, P, !!e.closed);
    }
    case 'ellipse': {
      if (!(e.rx > 0 && e.ry > 0)) return Infinity;
      /* a cheap bound first: nothing on the ellipse is nearer than this */
      const lo = dist(p, e.c) - Math.max(e.rx, e.ry);
      if (cut != null && lo > cut) return lo;
      const t0 = e.a0 == null ? 0 : e.a0;
      const sw = (e.a0 == null && e.a1 == null) ? TAU : sweepOf(t0, e.a1 == null ? TAU : e.a1);
      return pieceNear({ g: 'ell', c: e.c, rx: e.rx, ry: e.ry, rot: e.rot || 0, t0, sw }, p).d;
    }
  }
  return undefined;
}
/** the pieces of everything near a point, with their distances — for
    callers outside snapPoint (the parallel acquisition) */
function piecesNear(raw, r) {
  const out = [];
  for (const h of nearEnts(raw, r).slice(0, SNAP_MAX_POINT)) {
    for (const pc of snapGeo(h.e, raw, r * 2.5).pcs) {
      const nr = pieceNear(pc, raw);
      pc.nd = nr.d; pc.np = nr.p;
      if (pc.key == null) pc.key = h.e.id + ':' + out.length;
      out.push(pc);
    }
  }
  return out;
}

/* ---------------- deferred-foot scan ----------------
   Perpendicular feet onto carriers whose own geometry is out of reach.
   Cheap because it only looks at entities whose infinite carrier passes
   through the aperture. */
function deferredPerp(raw, ref, r, push) {
  const box = query(raw[0] - r * 2, raw[1] - r * 2, raw[0] + r * 2, raw[1] + r * 2);
  let n = 0;
  for (const e of box) {
    if (n > SNAP_MAX_POINT) break;
    if (!visible(e)) continue;
    if (e.t === 'line') {
      const f = perpFoot(e.a, e.b, ref);
      if (f && !f.on && dist(raw, f.p) <= r) { push(f.p, 'perpx', dist(raw, f.p)); n++; }
    } else if (e.t === 'arc') {
      const D = dist(ref, e.c);
      if (D < 1e-9) continue;
      const u = norm(sub(ref, e.c));
      for (const sg of [1, -1]) {
        const p = [e.c[0] + u[0] * e.r * sg, e.c[1] + u[1] * e.r * sg];
        if (dist(raw, p) > r) continue;
        if (angOnArc(e, ang(e.c, p)) !== null) continue;   /* on the sweep: handled already */
        push(p, 'perpx', dist(raw, p)); n++;
      }
    }
  }
}

/* ---------------- parallel ----------------
   PAR is a two-step snap: hover a straight edge to lift its direction, then
   swing the rubber band until it lines up with that direction. The alignment
   path only appears once the band is within tolerance, exactly like polar. */
function parallelSnaps(raw, ref, r, push, tracks) {
  if (!ST.parRefs.length) return;
  const v = sub(raw, ref);
  const L0 = hyp(v[0], v[1]);
  if (!(L0 > px(6))) return;
  const a0 = Math.atan2(v[1], v[0]);
  for (const q of ST.parRefs) {
    for (const s of [1, -1]) {
      const a = q.a + (s < 0 ? Math.PI : 0);
      if (Math.abs(wrapS(a0 - a)) > rad(POLAR_TOL)) continue;
      const u = [Math.cos(a), Math.sin(a)];
      const L = dot(v, u);
      if (!(L > 0)) continue;
      const foot = [ref[0] + u[0] * L, ref[1] + u[1] * L];
      if (dist(raw, foot) > r) continue;
      push(foot, 'par', dist(raw, foot), null, false, { a, L });
      const t = polarPath(ref, u, L); t.k = 'par'; tracks.push(t);
    }
  }
}

/* ---------------- extension ----------------
   Project past the end of a line, a polyline, a wall or an arc, and draw the
   dotted path back to the end it came from.

   The entity shortlist cannot find these on its own: stand 3 metres past the
   end of a wall and the wall is 3 metres away, far outside the aperture. So
   the ends are *acquired* by hovering them, exactly as AutoCAD does — a small
   + marks each one — and the extension stays live from then until the command
   ends. Entities that happen to be near the cursor anyway are still offered
   without acquisition, because short extensions should not need a ceremony.
   Where an extension path crosses another path or an object, that crossing
   is a snap of its own: AutoCAD's extension-and-intersection. */
const EXT_MAX = 4;
const EXT_TYPES = { line: 1, wall: 1, arc: 1, pline: 1 };
/** how each end of an extendable entity runs on: [{p, u} | {p, c, r, th, dir}, …] */
function extEndsOf(e) {
  if (e.t === 'line' || e.t === 'wall') {
    const u = norm(sub(e.b, e.a));
    if (!u[0] && !u[1]) return [null, null];
    return [{ p: e.a, u: [-u[0], -u[1]] }, { p: e.b, u }];
  }
  if (e.t === 'arc') {
    const sw = arcSweep(e);
    if (!(e.r > 0) || sw >= TAU - 1e-9) return [null, null];
    return [{ p: arcPt(e, 0), c: e.c, r: e.r, th: e.a0, dir: -1 },
            { p: arcPt(e, 1), c: e.c, r: e.r, th: e.a0 + sw, dir: 1 }];
  }
  if (e.t === 'pline') {
    const P = e.pts || [], n = P.length;
    if (e.closed || n < 2) return [null, null];
    const end = (i, j, bi, atStart) => {
      const p = P[i], q = P[j];
      const arc = bulgeArc(atStart ? p : q, atStart ? q : p, bulgeAt(e, bi));
      if (!arc) { const u = norm(sub(p, q)); return (u[0] || u[1]) ? { p, u } : null; }
      /* the span runs from its first vertex to its second; which way round
         the circle depends on the bulge's sign */
      const thP = Math.atan2(p[1] - arc.c[1], p[0] - arc.c[0]);
      const runsCCW = arc.ccw;
      /* beyond the span's start we go back against its direction of travel */
      const dir = atStart ? (runsCCW ? -1 : 1) : (runsCCW ? 1 : -1);
      return { p, c: arc.c, r: arc.r, th: thP, dir };
    };
    return [end(0, 1, 0, true), end(n - 1, n - 2, n - 2, false)];
  }
  return [null, null];
}
/** hovering an end remembers it, so the extension survives moving away */
function acquireExt(hits, raw, r) {
  /* hits are distance-sorted, so only the handful nearest the cursor can
     possibly have an end inside the aperture — scanning the rest is pure cost
     on a drawing with hundreds of walls under the pointer */
  for (let i = 0; i < hits.length && i < 6; i++) {
    const e = hits[i].e;
    if (!EXT_TYPES[e.t] || e.id == null) continue;
    const ends = extEndsOf(e);
    for (let k = 0; k < 2; k++) {
      if (!ends[k] || dist(raw, ends[k].p) > r) continue;
      const j = ST.extPts.findIndex(q => q.id === e.id && q.i === k);
      if (j >= 0) ST.extPts.splice(j, 1);
      ST.extPts.push({ id: e.id, i: k });
      while (ST.extPts.length > EXT_MAX) ST.extPts.shift();
    }
  }
}
/** the acquired extension points that still exist, for the + markers */
function extAcquired() {
  const out = [];
  for (const q of ST.extPts) {
    const e = DOC.ents.get(q.id);
    if (!e || !EXT_TYPES[e.t] || !visible(e)) continue;
    const E = extEndsOf(e)[q.i];
    if (E) out.push(E.p);
  }
  return out;
}
function extensionSnaps(hits, pcs, xPool, raw, r, push, tracks) {
  acquireExt(hits, raw, r);
  const seen = new Set();
  const list = [];
  for (const q of ST.extPts) {
    const e = DOC.ents.get(q.id);
    if (e && EXT_TYPES[e.t] && visible(e) && !seen.has(e.id)) { seen.add(e.id); list.push({ e, acq: true }); }
  }
  for (const h of hits) {
    const e = h.e;
    if (!EXT_TYPES[e.t] || seen.has(e.id)) continue;
    seen.add(e.id); list.push({ e, acq: false });
    if (list.length >= SNAP_MAX_X + EXT_MAX) break;
  }
  const paths = [];                       /* live extension paths, as pieces */
  let n = 0;
  for (const it of list) {
    if (++n > SNAP_MAX_X + EXT_MAX) break;
    const ends = extEndsOf(it.e);
    for (let k = 0; k < 2; k++) {
      const E = ends[k];
      if (!E) continue;
      if (E.u) {
        const along = dot(sub(raw, E.p), E.u);
        const lp = { g: 'lin', a: E.p, u: E.u, t0: 0, t1: Infinity, ext: E, key: 'ext:' + it.e.id + ':' + k };
        if (it.acq) paths.push(lp);
        if (along < px(4)) continue;
        const proj = add(E.p, mul(E.u, along));
        const d = dist(raw, proj);
        if (d < r) {
          push(proj, 'ext', d, null, false, { o: E.p, a: Math.atan2(E.u[1], E.u[0]), L: along });
          const tr = [E.p, proj]; tr.k = 'ext'; tracks.push(tr);
          if (!it.acq) paths.push(lp);
        }
      } else {
        const A = arcExtension(E, raw, r, push, tracks);
        const ap = { g: 'arc', c: E.c, r: E.r, a0: E.dir > 0 ? E.th : E.th - Math.PI / 2, sw: Math.PI / 2, key: 'ext:' + it.e.id + ':' + k };
        if (it.acq || A) paths.push(ap);
      }
    }
  }
  /* an extension path crossing another, or crossing an object near the cursor */
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++)
      for (const p of xPieces(paths[i], paths[j], false)) extCross(p, [paths[i], paths[j]], raw, r, push, tracks);
    for (const pc of (xPool || []))
      for (const p of xPieces(paths[i], pc, false)) extCross(p, [paths[i]], raw, r, push, tracks);
  }
}
function extCross(p, via, raw, r, push, tracks) {
  if (dist(raw, p) > r) return;
  for (const v of via) if (dist(p, v.a || arcAt(v, v.a0)) < px(4) && v.g === 'lin') return;
  push(p, 'extx', null, null, false, { via: via.map(v => v.g === 'lin' ? { o: v.a, a: Math.atan2(v.u[1], v.u[0]), L: dist(v.a, p) } : null) });
  for (const v of via) if (v.g === 'lin') { const t = [v.a, p]; t.k = 'ext'; tracks.push(t); }
}
/** an arc's extension runs on around its own circle, not off on a tangent */
function arcExtension(E, raw, r, push, tracks) {
  if (Math.abs(dist(raw, E.c) - E.r) > r) return false;
  const a = ang(E.c, raw);
  const span = E.dir > 0 ? wrap(a - E.th) : wrap(E.th - a);
  if (!(span > 1e-9) || span > Math.PI / 2) return false;     /* half the circle away is not an extension */
  const p = [E.c[0] + E.r * Math.cos(a), E.c[1] + E.r * Math.sin(a)];
  const d = dist(raw, p);
  if (d > r) return false;
  push(p, 'ext', d, null, false, { o: E.p, L: E.r * span, arc: true });
  const steps = Math.max(2, Math.ceil(span / rad(4)));
  const path = [];
  for (let i = 0; i <= steps; i++) {
    const t = E.th + E.dir * span * (i / steps);
    path.push([E.c[0] + E.r * Math.cos(t), E.c[1] + E.r * Math.sin(t)]);
  }
  path.k = 'ext';
  tracks.push(path);
  return true;
}

/** the AutoSnap tooltip AutoCAD would show for this candidate */
function snapTipFor(s) {
  if (!s) return null;
  if (s.k === 'track' && s.meta) {
    const d = dist(s.meta.o, s.p);
    return snapKindLabel(s.meta.k) + ': ' + fmt(d) + ' < ' + fmtAng(s.meta.a) + '°';
  }
  if (s.k === 'par' && s.meta) return 'Parallel: ' + fmt(s.meta.L) + ' < ' + fmtAng(s.meta.a) + '°';
  if (s.k === 'ext' && s.meta) {
    if (s.meta.arc) return 'Extension: ' + fmt(s.meta.L);
    return 'Extension: ' + fmt(s.meta.L) + ' < ' + fmtAng(s.meta.a) + '°';
  }
  if (s.k === 'extx' && s.meta && s.meta.via) {
    const parts = s.meta.via.filter(Boolean).map(v => 'Extension: ' + fmt(v.L) + ' < ' + fmtAng(v.a) + '°');
    if (s.meta.via.length === 1) parts.unshift('Intersection');
    return parts.join(', ');
  }
  return snapKindLabel(s.k);
}
function fmtAng(a) {
  let d = deg(a) % 360; if (d < 0) d += 360;
  return (Math.abs(d - Math.round(d)) < 5e-4 ? Math.round(d) : +d.toFixed(2)).toString();
}

/* ---------------- polar tracking ----------------
   The tracked angle set is the increment plus any additional angles, measured
   either from zero or (POLARANG relative) from the previous segment. */
function polarAngles() {
  const inc = clamp(Math.abs(+ST.polarInc) || 90, 0.1, 180);
  const out = [];
  for (let a = 0; a < 360 - 1e-9; a += inc) out.push(rad(a));
  for (const x of (ST.polarExtra || [])) {
    const v = +x;
    if (isFinite(v)) out.push(rad(((v % 360) + 360) % 360));
  }
  return out;
}
/** the direction polar angles are measured from */
function polarBase() {
  if (!ST.polarRel) return 0;
  const c = (typeof CMD !== 'undefined') && CMD;
  if (c && c.pts && c.pts.length >= 2) return ang(c.pts[c.pts.length - 2], c.pts[c.pts.length - 1]);
  return 0;
}
/** if the cursor is within tolerance of a polar angle, the point locked onto it */
function polarLock(ref, p) {
  const v = sub(p, ref);
  const L0 = hyp(v[0], v[1]);
  if (!(L0 > px(6))) return null;
  const a0 = Math.atan2(v[1], v[0]);
  const base = polarBase();
  const tol = rad(POLAR_TOL);
  let bestA = null, bestErr = tol;
  for (const a of polarAngles()) {
    const t = base + a;
    const err = Math.abs(wrapS(a0 - t));
    if (err < bestErr) { bestErr = err; bestA = t; }
  }
  if (bestA == null) return null;
  const u = [Math.cos(bestA), Math.sin(bestA)];
  const L = dot(v, u);                     /* project, do not stretch */
  if (!(L > 0)) return null;
  return { p: [ref[0] + u[0] * L, ref[1] + u[1] * L], u, L, a: bestA };
}
/** the rubber-band alignment vector: from the base, out past the cursor to the
    edge of the viewport, the way AutoCAD runs it off the screen */
function polarPath(o, u, L) {
  const reach = Math.max(L * 1.2, px(hyp(V.w, V.h)));
  return [o, [o[0] + u[0] * reach, o[1] + u[1] * reach]];
}

/* ---------------- object snap tracking ----------------
   Every acquired point radiates alignment paths. AutoCAD offers a choice:
   orthogonal only, or every polar angle. The cursor snaps onto a path, and
   onto the crossing of two paths — the feature that lets you place a point
   "above that corner and to the right of that one" without drawing a thing. */
function trackAngles() {
  if (!ST.trackPolar) return [0, Math.PI / 2];
  const set = [], seen = new Set();
  for (const a of polarAngles()) {
    const h = wrap(a) % Math.PI;                   /* a path is a line: fold to a half turn */
    const key = Math.round(h * 1e7);
    if (seen.has(key)) continue;
    seen.add(key); set.push(h);
  }
  return set.length ? set : [0, Math.PI / 2];
}
function trackSnaps(raw, r, push, tracks) {
  const pts = ST.trackPts;
  if (!ST.otrack || !pts || !pts.length) return;
  const angs = trackAngles();
  const lines = [];
  for (const tp of pts) {
    for (const a of angs) {
      const u = [Math.cos(a), Math.sin(a)];
      const v = sub(raw, tp.p);
      const off = cross(u, v);                        /* signed distance to the path */
      if (Math.abs(off) > r) continue;
      const along = dot(v, u);
      const foot = [tp.p[0] + u[0] * along, tp.p[1] + u[1] * along];
      lines.push({ o: tp.p, u, foot, along, k: tp.k, a });
    }
  }
  if (!lines.length) return;
  for (const L of lines) {
    const dir = Math.sign(L.along || 1);
    push(L.foot, 'track', dist(raw, L.foot), null, false,
      { o: L.o, k: L.k, a: Math.atan2(L.u[1] * dir, L.u[0] * dir) });
    const t = polarPath(L.o, [L.u[0] * dir, L.u[1] * dir], Math.abs(L.along));
    t.k = 'track';
    tracks.push(t);
  }
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = lines[i], B = lines[j];
    if (Math.abs(cross(A.u, B.u)) < 1e-9) continue;
    const X = xLinLin({ a: A.o, u: A.u, t0: -Infinity, t1: Infinity }, { a: B.o, u: B.u, t0: -Infinity, t1: Infinity }, true);
    if (X.length) push(X[0], 'trackx');
  }
}


/* ---------------- picking ---------------- */
/** every pickable entity under the pick box, nearest first.
    Ties go to the newest object, which is the one drawn on top. */
function pickCandidates(p, radius, filter) {
  /* The drawn pick box has to be the aperture that actually picks, otherwise
     the setting is decoration. Explicit radii still matter (a wall wants more
     reach than a line), so they scale with the box rather than ignoring it. */
  const r = px((radius || 8) * (pickBoxPx() / 8));
  const out = [];
  for (const e of query(p[0] - r, p[1] - r, p[0] + r, p[1] + r)) {
    if (!pickable(e)) continue;
    if (filter && !filter(e)) continue;
    let d; try { d = entDist(p, e); } catch (err) { continue; }
    if (d <= r) out.push({ e, d });
  }
  out.sort((a, b) => a.d - b.d || b.e.id - a.e.id);
  return out.map(x => x.e);
}
/* pick topmost entity near a world point */
function pickAt(p, radius, filter) {
  return pickCandidates(p, radius, filter)[0] || null;
}
/** the grip under the cursor. The aperture follows GRIPSIZE, so a bigger grip
    really is easier to grab rather than just looking bigger. */
function gripAt(p) {
  if (!ST.gripsOn) return null;
  const r = px(Math.max(3, (+ST.gripSize || 5)) * 1.4);
  let best = null, bd = r;
  for (const id of SEL) {
    const e = DOC.ents.get(id); if (!e) continue;
    let gs; try { gs = gripsOf(e); } catch (err) { continue; }
    for (const g of gs) {
      const d = dist(p, g.p);
      if (d < bd) { bd = d; best = { id, k: g.k, p: g.p.slice() }; }
    }
  }
  return best;
}
function pickGrip(p) { return gripAt(p); }

/* ============================================================
   SELECTION
   ------------------------------------------------------------
   One grammar covers every way AutoCAD lets you build a selection set:
   a region (rectangle, lasso or typed polygon) judged either as a window
   (everything fully enclosed) or as a crossing (everything touched), a
   fence polyline, and the keyword options typed at "Select objects:".

   Two rules are load-bearing and easy to get wrong:

   * the window/crossing sense is a SCREEN gesture. Judging it in world
     coordinates makes left-to-right mean the wrong thing the moment the
     view is rotated.
   * picks ACCUMULATE (PICKADD 2). Clicking a second object adds it;
     Shift+click removes; a click on empty space clears. Replacing the set
     on every click is the single most common way a CAD clone feels wrong.
   ============================================================ */

/** the point list a region test should use. Text is judged by its box —
    its poly() is one insertion point, which would enclose a whole
    paragraph the moment its corner crept inside the window. */
function selPts(e) {
  if (e.t === 'text' || e.t === 'mtext') {
    let b; try { b = bbox(e); } catch (err) { return []; }
    return [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
  }
  try { return poly(e, 40) || []; } catch (err) { return []; }
}
/** every point of the entity lies inside the (possibly rotated) region */
function entInPoly(e, P) {
  const pts = selPts(e);
  if (!pts.length) return false;
  for (const p of pts) if (!pointInPoly(p, P)) return false;
  return true;
}
/** the entity touches the region at all */
function entCrossPoly(e, P) {
  const pts = selPts(e);
  if (!pts.length) return false;
  for (const p of pts) if (pointInPoly(p, P)) return true;
  const n = P.length;
  for (let i = 1; i < pts.length; i++)
    for (let j = 0; j < n; j++)
      if (segInt(pts[i - 1], pts[i], P[j], P[(j + 1) % n])) return true;
  /* a region drawn wholly inside a closed object still catches it */
  return pts.length > 2 && pointInPoly(P[0], pts);
}
/** the entity crosses an OPEN fence polyline */
function entFenceHit(e, F) {
  const pts = selPts(e);
  if (pts.length < 2 || F.length < 2) return false;
  for (let i = 1; i < pts.length; i++)
    for (let j = 1; j < F.length; j++)
      if (segInt(pts[i - 1], pts[i], F[j - 1], F[j])) return true;
  return false;
}
/* the old names, kept because they read well at the call site */
function inQuad(e, quad) { return entInPoly(e, quad); }
function crossQuad(e, quad) { return entCrossPoly(e, quad); }

function ptsBox(P) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of P) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
}
/** ids inside (or touched by) a world-space region */
function selectRegion(P, crossing, filter) {
  if (!P || P.length < 3) return [];
  const b = ptsBox(P);
  const out = [];
  for (const e of query(b[0], b[1], b[2], b[3])) {
    if (!pickable(e)) continue;
    if (filter && !filter(e)) continue;
    if (crossing ? entCrossPoly(e, P) : entInPoly(e, P)) out.push(e.id);
  }
  return out;
}
/** ids crossed by a world-space fence polyline */
function selectFence(F, filter) {
  if (!F || F.length < 2) return [];
  const b = ptsBox(F);
  const out = [];
  for (const e of query(b[0], b[1], b[2], b[3])) {
    if (!pickable(e)) continue;
    if (filter && !filter(e)) continue;
    if (entFenceHit(e, F)) out.push(e.id);
  }
  return out;
}

/* ---------------- the selection set ---------------- */
const SELHIST = [];              /* one entry per pick step — the U option    */
let SELPREV = [];                /* the P option: the set a command last used */

/** add or remove ids, recording the step so U can take it back */
/* PICKADD, honoured rather than merely declared. 0 means each new pick
   replaces the set and Shift adds to it; 1 and 2 mean picks accumulate and
   Shift removes, which is the modern default. Without this the variable was a
   comment with a number next to it — the renderer never read it and neither
   did the pick path, so setting it changed nothing. */
function selApply(ids, remove) {
  if (!remove && (+ST.pickAdd === 0) && !ST.shift && SEL.size) {
    /* replacing, not accumulating: remember the old set so P still works, and
       drop the pick history because those steps are no longer undoable picks */
    selRemember(); SEL.clear(); SELHIST.length = 0;
  }
  const ch = [];
  for (const id of ids) {
    if (remove) { if (SEL.delete(id)) ch.push(id); }
    else if (!SEL.has(id) && DOC.ents.has(id)) { SEL.add(id); ch.push(id); }
  }
  if (ch.length) SELHIST.push({ ids: ch, removed: !!remove });
  return ch.length;
}
/** U at the Select objects prompt: undo the most recent pick step */
function selUndoPick() {
  const step = SELHIST.pop();
  if (!step) return false;
  for (const id of step.ids) { if (step.removed) SEL.add(id); else SEL.delete(id); }
  return true;
}
/** remember the set a modify command is about to consume, for P */
function selRemember() { if (SEL.size) SELPREV = [...SEL]; }
function selClearAll() { selRemember(); SEL.clear(); SELHIST.length = 0; gripClearHot(); }
/** L: the newest object still in the drawing */
function selLastEnt() {
  let best = null;
  for (const e of DOC.ents.values()) if (pickable(e) && (!best || e.id > best.id)) best = e;
  return best;
}
function selAllIds() {
  const out = [];
  for (const e of DOC.ents.values()) if (pickable(e)) out.push(e.id);
  return out;
}

/* ---------------- the in-flight region gesture ----------------
   ST.band carries the whole gesture in SCREEN coordinates:
     kind   'rect' | 'lasso' | 'wpoly' | 'cpoly' | 'fence'
     sense  'window' | 'crossing'          (fence has neither)
     live   true while the button is held (a drag, so a lasso)
     path   lasso trail / polygon vertices, screen px
     a,cur  rectangle corners, screen px                                  */
function bandBegin(scr, kind, sense) {
  ST.band = {
    kind: kind || 'rect', sense: sense || 'window',
    locked: !!sense, live: false,
    a: [scr[0], scr[1]], cur: [scr[0], scr[1]], path: [[scr[0], scr[1]]],
  };
  ST.bandPreview = null;
  return ST.band;
}
/** the polygon the gesture currently describes, in world coordinates */
function bandPoly(b) {
  b = b || ST.band; if (!b) return null;
  if (b.kind === 'rect') {
    const x0 = Math.min(b.a[0], b.cur[0]), x1 = Math.max(b.a[0], b.cur[0]);
    const y0 = Math.min(b.a[1], b.cur[1]), y1 = Math.max(b.a[1], b.cur[1]);
    return [s2w(x0, y0), s2w(x1, y0), s2w(x1, y1), s2w(x0, y1)];
  }
  const P = b.path.map(q => s2w(q[0], q[1]));
  if (b.kind !== 'fence' && b.cur && (b.live || b.path.length)) P.push(s2w(b.cur[0], b.cur[1]));
  else if (b.kind === 'fence' && b.cur) P.push(s2w(b.cur[0], b.cur[1]));
  return P;
}
/** true when the gesture selects by touching rather than by enclosing */
function bandCrossing(b) {
  b = b || ST.band; if (!b) return false;
  if (b.kind === 'cpoly') return true;
  if (b.kind === 'wpoly') return false;
  return b.sense === 'crossing';
}
const BAND_LASSO_MIN = 3;        /* px between recorded lasso points */
function bandMove(scr) {
  const b = ST.band; if (!b) return;
  b.cur = [scr[0], scr[1]];
  /* the sense of a rubber-band rectangle flips live as the cursor crosses the
     anchor; a lasso keeps whichever way the hand set off, so the fill does not
     strobe while the loop wanders back and forth */
  if (!b.locked) {
    if (b.kind === 'rect') b.sense = scr[0] < b.a[0] ? 'crossing' : 'window';
    else if (b.kind === 'lasso' && hyp(scr[0] - b.a[0], scr[1] - b.a[1]) > 4) {
      b.sense = scr[0] < b.a[0] ? 'crossing' : 'window'; b.locked = true;
    }
  }
  if (b.kind === 'lasso' && b.live) {
    const last = b.path[b.path.length - 1];
    if (hyp(scr[0] - last[0], scr[1] - last[1]) >= BAND_LASSO_MIN) b.path.push([scr[0], scr[1]]);
  }
  bandRefreshPreview();
}
/** a click adds a vertex to a polygon or fence gesture */
function bandPush(scr) {
  const b = ST.band; if (!b) return;
  b.path.push([scr[0], scr[1]]);
  b.cur = [scr[0], scr[1]];
  bandRefreshPreview();
}
/** objects the gesture WOULD take, refreshed live so the box teaches itself */
function bandRefreshPreview() {
  const b = ST.band;
  if (!b) { ST.bandPreview = null; return null; }
  let ids;
  if (b.kind === 'fence') ids = selectFence(bandPoly(b));
  else {
    const P = bandPoly(b);
    ids = P && P.length >= 3 ? selectRegion(P, bandCrossing(b)) : [];
  }
  ST.bandPreview = new Set(ids);
  return ST.bandPreview;
}
/** apply the gesture to the selection set and put the band away */
function bandCommit(remove) {
  const b = ST.band; if (!b) return 0;
  let ids;
  if (b.kind === 'fence') ids = selectFence(bandPoly(b));
  else {
    const P = bandPoly(b);
    ids = P && P.length >= 3 ? selectRegion(P, bandCrossing(b)) : [];
    if (P && P.length >= 3) {
      const q = ptsBox(P);
      ST.lastBand = q;                        /* STRETCH reuses the last box */
    }
  }
  const n = selApply(ids, remove == null ? ST.selMode === 'remove' : remove);
  ST.band = null; ST.bandPreview = null;
  return n;
}
function bandCancel() { ST.band = null; ST.bandPreview = null; }

/* ---------------- keyword options at "Select objects:" ----------------
   W C WP CP F ALL P L R A U — the set AutoCAD answers at every selection
   prompt. Anything that needs points arms a gesture and waits for clicks. */
const SEL_OPTION = {
  w: 'window', win: 'window', window: 'window',
  c: 'crossing', cr: 'crossing', crossing: 'crossing',
  wp: 'wpoly', wpolygon: 'wpoly',
  cp: 'cpoly', cpolygon: 'cpoly',
  f: 'fence', fence: 'fence',
  l: 'last', last: 'last',
  p: 'previous', prev: 'previous', previous: 'previous',
  all: 'all',
  r: 'remove', remove: 'remove',
  a: 'add', add: 'add',
  u: 'undo', undo: 'undo',
  box: 'box', au: 'auto', auto: 'auto', si: 'single', single: 'single',
};
function selOptionName(s) {
  return SEL_OPTION[String(s || '').trim().toLowerCase()] || null;
}
const SEL_PROMPT = {
  window: 'Specify first corner',
  crossing: 'Specify first corner',
  wpoly: 'First polygon point · <em>Enter</em> to close',
  cpoly: 'First polygon point · <em>Enter</em> to close',
  fence: 'First fence point · <em>Enter</em> to finish',
};
/** run one typed selection keyword. Returns true when it was understood. */
function selOption(s) {
  const k = selOptionName(s);
  if (!k) return false;
  const say = t => { if (typeof echo === 'function') echo(t); };
  const tell = h => { if (typeof hint === 'function') hint(h); };
  switch (k) {
    case 'window': case 'crossing':
      ST.band = null;
      ST.pendOption = { kind: 'rect', sense: k };
      tell(SEL_PROMPT[k]); say(k === 'window' ? 'Window' : 'Crossing');
      return true;
    case 'wpoly': case 'cpoly': case 'fence':
      ST.band = null;
      ST.pendOption = { kind: k };
      tell(SEL_PROMPT[k]); say(k.toUpperCase());
      return true;
    case 'box': case 'auto':
      ST.pendOption = null; say(k.toUpperCase());
      return true;
    case 'all': {
      const n = selApply(selAllIds(), ST.selMode === 'remove');
      say(n + ' found');
      return true;
    }
    case 'previous': {
      const live = SELPREV.filter(id => DOC.ents.has(id) && pickable(DOC.ents.get(id)));
      if (!live.length) { say('No previous selection set'); return true; }
      say(selApply(live, ST.selMode === 'remove') + ' found');
      return true;
    }
    case 'last': {
      const e = selLastEnt();
      if (!e) { say('Nothing to select'); return true; }
      say(selApply([e.id], ST.selMode === 'remove') + ' found');
      return true;
    }
    case 'remove': ST.selMode = 'remove'; tell('Remove objects'); say('Remove'); return true;
    case 'add': ST.selMode = 'add'; tell('Select objects'); say('Add'); return true;
    case 'undo':
      say(selUndoPick() ? 'Pick undone — ' + SEL.size + ' selected' : 'Nothing to undo');
      return true;
    case 'single': ST.selSingle = true; say('Single'); return true;
  }
  return false;
}
/** reset the per-prompt switches when a selection prompt opens or closes */
function selPromptReset() {
  ST.selMode = 'add'; ST.selSingle = false; ST.pendOption = null;
  SELHIST.length = 0;
  bandCancel();
}

/* ---------------- rollover highlight and selection cycling ----------------
   Hovering pre-highlights what a click would take. When several objects share
   the pick box AutoCAD shows a cycling badge; the list, or Shift+Space, then
   reaches any of them. */
function sameIds(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function pickHover(p, radius) {
  const list = pickCandidates(p, radius || 8);
  const ids = list.map(e => e.id);
  if (!sameIds(ids, ST.cycleList)) ST.cycleIdx = 0;      /* a new stack starts at the top */
  ST.cycleList = ids.length > 1 ? ids : null;
  if (ST.cycleIdx >= ids.length) ST.cycleIdx = 0;
  ST.hot = ids.length ? ids[ST.cycleIdx] : null;
  return list;
}
/** Shift+Space: step the rollover through the objects sharing the pick box */
function cyclePick(dir) {
  const ids = ST.cycleList;
  if (!ids || ids.length < 2) return null;
  const n = ids.length;
  ST.cycleIdx = (((ST.cycleIdx + (dir || 1)) % n) + n) % n;
  ST.hot = ids[ST.cycleIdx];
  return ST.hot;
}

/* ---------------- grips ----------------
   Unselected grips are blue, the one under the cursor takes the hover colour,
   and a grip you click is HOT and red — GRIPCOLOR / GRIPHOVER / GRIPHOT. */
function gripKey(g) { return g.id + '/' + g.k; }
function gripIsHot(id, k) {
  for (const g of ST.gripHot) if (g.id === id && g.k === k) return true;
  return false;
}
function gripClearHot() { ST.gripHot.length = 0; ST.gripMenu = null; }
/** make a grip hot. Shift keeps the ones already hot, so several vertices
    stretch together — the classic way to drag a whole wall junction. */
function gripSetHot(g, additive) {
  if (!g) return null;
  if (!additive) {
    if (!gripIsHot(g.id, g.k)) ST.gripHot = [{ id: g.id, k: g.k, p: g.p.slice() }];
  } else if (gripIsHot(g.id, g.k)) {
    ST.gripHot = ST.gripHot.filter(x => !(x.id === g.id && x.k === g.k));
    return null;
  } else ST.gripHot.push({ id: g.id, k: g.k, p: g.p.slice() });
  return g;
}
/** refresh the stored positions — a grip moves when the object does */
function gripSyncHot() {
  const out = [];
  for (const g of ST.gripHot) {
    const e = DOC.ents.get(g.id); if (!e) continue;
    let gs; try { gs = gripsOf(e); } catch (err) { continue; }
    const m = gs.find(x => x.k === g.k);
    if (m) out.push({ id: g.id, k: g.k, p: m.p.slice() });
  }
  ST.gripHot = out;
  return out;
}

/* ---------------- multifunctional grips ----------------
   Modern AutoCAD gives a grip more than one job: hover it and a small menu
   offers the alternatives, and Ctrl cycles them without the menu. A polyline
   vertex can add or remove itself; an arc grip can drive radius or length. */
function gripMenuItems(e, k) {
  if (!e) return null;
  if (e.t === 'pline' || e.t === 'spline') {
    if (k[0] === 'p') {
      const items = [{ id: 'stretch', label: 'Stretch Vertex' }, { id: 'addv', label: 'Add Vertex' }];
      if (e.pts.length > 2) items.push({ id: 'delv', label: 'Remove Vertex' });
      return items;
    }
    if (k[0] === 's') return [{ id: 'stretch', label: 'Stretch' }, { id: 'addv', label: 'Add Vertex' }];
    return null;
  }
  if (e.t === 'line') {
    if (k === 'a' || k === 'b') return [{ id: 'stretch', label: 'Stretch' }, { id: 'lengthen', label: 'Lengthen' }];
    return null;
  }
  if (e.t === 'arc') {
    if (k === 's' || k === 'e') return [{ id: 'stretch', label: 'Stretch' }, { id: 'lengthen', label: 'Lengthen' }];
    if (k === 'r') return [{ id: 'stretch', label: 'Stretch' }, { id: 'radius', label: 'Radius' }];
    return null;
  }
  if (e.t === 'wall' && (k === 'a' || k === 'b'))
    return [{ id: 'stretch', label: 'Stretch' }, { id: 'lengthen', label: 'Lengthen' }];
  return null;
}
/** open the hover menu for a grip; returns it, or null when it has one job */
function gripMenuOpen(g) {
  if (!g) { ST.gripMenu = null; return null; }
  const e = DOC.ents.get(g.id);
  const items = gripMenuItems(e, g.k);
  if (!items || items.length < 2) { ST.gripMenu = null; return null; }
  if (ST.gripMenu && ST.gripMenu.id === g.id && ST.gripMenu.k === g.k) return ST.gripMenu;
  ST.gripMenu = { id: g.id, k: g.k, p: g.p.slice(), items, idx: 0 };
  return ST.gripMenu;
}
/** Ctrl steps the menu even when it is not on screen */
function gripMenuCycle(dir) {
  const m = ST.gripMenu || gripMenuOpen(ST.gripHover);
  if (!m) return null;
  const n = m.items.length;
  m.idx = (((m.idx + (dir || 1)) % n) + n) % n;
  return m.items[m.idx];
}
function gripMenuClose() { ST.gripMenu = null; }

/** structural menu actions happen once, on a LIVE entity inside a journal.
    Returns the grip key the drag should carry on with, or null when the
    action finished on its own (Remove Vertex has nothing left to drag). */
function gripDo(e, k, action) {
  if (!e || !action || action === 'stretch') return k;
  if ((e.t === 'pline' || e.t === 'spline') && (action === 'addv' || action === 'delv')) {
    const n = e.pts.length;
    const i = +k.slice(1);
    if (!(i >= 0 && i < n)) return k;
    mut(e);
    if (action === 'delv') {
      if (k[0] !== 'p' || n <= 2) return k;
      e.pts.splice(i, 1);
      return null;
    }
    /* on the last vertex of an open polyline there is no "next" to halve, so
       carry the run of the previous segment past the end instead */
    let q;
    if (k[0] === 'p' && !e.closed && i === n - 1) {
      const d = sub(e.pts[i], e.pts[i - 1] || e.pts[i]);
      q = [e.pts[i][0] + d[0] * .5, e.pts[i][1] + d[1] * .5];
    } else q = mid(e.pts[i], e.pts[(i + 1) % n]);
    e.pts.splice(i + 1, 0, q);
    return 'p' + (i + 1);
  }
  return k;
}
/** modal menu actions change how the drag is read, not the object */
function gripEditKey(e, k, action) {
  if (e && e.t === 'arc') {
    if (action === 'lengthen') return k === 's' ? 'sL' : k === 'e' ? 'eL' : k;
    if (action === 'radius') return 'r0';
  }
  return k;
}
/** Lengthen slides the end along its own direction instead of anywhere */
function gripConstrain(e, k, action, p, orig) {
  if (action !== 'lengthen' || !e) return p;
  const O = orig && orig.t === e.t ? orig : e;
  if (e.t === 'line' || e.t === 'wall') {
    const anchor = k === 'a' ? O.b : O.a, moving = k === 'a' ? O.a : O.b;
    const u = norm(sub(moving, anchor));
    if (!u[0] && !u[1]) return p;
    const t = dot(sub(p, anchor), u);
    return [anchor[0] + u[0] * t, anchor[1] + u[1] * t];
  }
  return p;
}

/* the grip hover dwell — the menu must not flash under a travelling cursor */
const GRIP_MENU_DWELL = 380;
let _gripDwellKey = null, _gripDwellT0 = 0;
function gripHoverUpdate(g, now) {
  now = now == null ? Date.now() : now;
  ST.gripHover = g;
  if (!g) { _gripDwellKey = null; if (ST.gripMenu && !ST.gripMenuPinned) ST.gripMenu = null; return null; }
  const key = gripKey(g);
  if (key !== _gripDwellKey) { _gripDwellKey = key; _gripDwellT0 = now; ST.gripMenu = null; return null; }
  if (now - _gripDwellT0 < GRIP_MENU_DWELL) return null;
  return gripMenuOpen(g);
}

/* ============================================================
   point modifiers — FROM, mid-between-2-points, temporary track point
   ------------------------------------------------------------
   These sit *between* the pointing device and the running command: they eat
   one or two points of their own and then hand the command a single derived
   point. Everything a command sees is still an ordinary point.
   ============================================================ */
const PT_MODS = {
  from: { n: 1, hint: 'Base point', label: 'FROM' },
  fro: { n: 1, hint: 'Base point', label: 'FROM' },
  m2p: { n: 2, hint: 'First point of mid', label: 'MID BETWEEN 2 POINTS' },
  mtp: { n: 2, hint: 'First point of mid', label: 'MID BETWEEN 2 POINTS' },
  tt: { n: 1, hint: 'Specify temporary OTRACK point', label: 'TEMPORARY TRACK POINT' },
  tk: { n: 1, hint: 'Specify temporary OTRACK point', label: 'TEMPORARY TRACK POINT' },
};
/** start a point modifier; returns true when one was recognised */
function startPtMod(name, typed) {
  const m = PT_MODS[name];
  if (!m) return false;
  /* the command's prompt comes back when the modifier has done its work */
  const at = osAtPrompt();
  if (at && ST.osPrompt == null && typeof PROMPT !== 'undefined') ST.osPrompt = PROMPT.raw;
  ST.ptMod = { mode: name === 'fro' ? 'from' : (name === 'mtp' ? 'm2p' : (name === 'tk' ? 'tt' : name)), pts: [], def: m };
  ST.fromBase = null;
  /* the history reads the way AutoCAD's does: "Specify first point: from
     Base point:" typed, "…: _from Base point:" from the menu */
  if (at) {
    if (typed) cliAppend(' ' + m.hint + ':');
    else if (typeof cliPrint === 'function' && typeof CLI !== 'undefined' && CLI.echo)
      cliPrint(PROMPT.text + ' _' + ST.ptMod.mode + ' ' + m.hint + ':');
  }
  if (typeof hint === 'function') hint(m.hint);
  if (typeof echo === 'function') echo(m.label);
  return true;
}
/** add to the line the command history is showing, as AutoCAD writes a
    modifier's prompts onto the line that asked for the point */
function cliAppend(s) {
  if (typeof CLI === 'undefined' || !CLI || !CLI.echo) return;
  const L = CLI.lines[CLI.lines.length - 1];
  if (!L || typeof L.t !== 'string') return;
  L.t += s;
  if (typeof renderCli === 'function') renderCli();
}
/** feed a point to the pending modifier. Returns the point the *command*
    should receive, or null when the modifier swallowed it. */
function ptModPoint(p) {
  const m = ST.ptMod;
  if (!m) return p;
  m.pts.push(p.slice());
  if (m.mode === 'from') {
    ST.ptMod = null; ST.fromBase = p.slice();
    /* AutoCAD's own prompt: the offset may be typed (@dx,dy or @d<a) or picked */
    if (typeof hint === 'function') hint('<Offset>');
    return null;
  }
  if (m.mode === 'tt') {
    ST.ptMod = null;
    acquireTrack(p, 'end');
    osPromptRestore();
    return null;
  }
  if (m.mode === 'm2p') {
    if (m.pts.length < 2) { cliAppend(' Second point of mid:'); if (typeof hint === 'function') hint('Second point of mid'); return null; }
    ST.ptMod = null;
    return mid(m.pts[0], m.pts[1]);
  }
  ST.ptMod = null;
  return p;
}
/** the rubber-band reference a modifier imposes (FROM measures from its base) */
function ptModRef() {
  if (ST.ptMod && ST.ptMod.mode === 'm2p' && ST.ptMod.pts.length) return ST.ptMod.pts[0];
  return ST.fromBase || null;
}
function cancelPtMods() { ST.ptMod = null; ST.fromBase = null; }
/** everything a one-shot or a modifier had in flight, dropped at once */
function snapStateReset() {
  clearTracks(); cancelPtMods(); clearSnapOverride(true);
  ST.defer = null; ST.xpick = null; ST.osPrompt = null;
}

/** Text typed at a point prompt that belongs to the snap layer rather than to
    the command: FROM, M2P, TT and every osnap override name. */
function snapInputText(s) {
  const k = String(s || '').trim().toLowerCase().replace(/^[._']+/, '');
  if (!k) return false;
  if (startPtMod(k, true)) { if (typeof draw === 'function') draw(); return true; }
  const kind = SNAP_ALIAS[k];
  if (!kind) return false;
  setSnapOverride(kind, true, true);
  if (typeof echo === 'function') echo(kind === 'none' ? 'No snap for the next point' : snapKindLabel(kind).toUpperCase());
  if (typeof draw === 'function') draw();
  return true;
}
/** the kinds a one-shot override can be answered by */
function oneShotAnswers(one, k) {
  if (!one || !k) return false;
  if (k === one) return true;
  switch (one) {
    case 'int': return k === 'xint';
    case 'appint': return k === 'int' || k === 'xapp';
    case 'ext': return k === 'extx';
    case 'perp': return k === 'perpx' || k === 'perpd';
    case 'tan': return k === 'tanx' || k === 'tand';
  }
  return false;
}

/* ---------------- lifecycle hooks ----------------
   Acquired points are transient: Escape and the end of a command drop them,
   exactly as AutoCAD does. endCmd/cmdPoint/cmdText live in 07-cmd, so wrap
   them rather than reaching across module boundaries. Function declarations
   from every module are hoisted into the one bundle scope, so they are
   already visible here. */
if (typeof endCmd === 'function' && !endCmd.__snapTracked) {
  const _endCmd = endCmd;
  const wrapped = function () {
    snapStateReset();
    return _endCmd.apply(this, arguments);
  };
  wrapped.__snapTracked = true;
  try { endCmd = wrapped; } catch (err) { /* frozen binding: tracking simply persists */ }
}
if (typeof cmdPoint === 'function' && !cmdPoint.__snapTracked) {
  const _cmdPoint = cmdPoint;
  /* `quiet` is the caller saying the point was typed — a coordinate is an
     answer in its own right, and the snap under the mouse has nothing to say
     about it. A pick is judged by what the snap found. */
  const wrapped = function (p, quiet) {
    const c = (typeof CMD !== 'undefined') && CMD;
    const live = c && c.phase === 'run';
    const one = oneShotKind();
    const s = ST.snap;
    if (live && one && ST.osnapOneShot && !quiet) {
      /* the first object of an extended intersection: remember it, ask for the other */
      if (s && (s.k === 'xint1' || s.k === 'xapp1') && s.meta && s.meta.xfirst) {
        ST.xpick = { pc: s.meta.xfirst, kind: one };
        cliAppend(' and');
        osPromptWord('and');
        if (typeof draw === 'function') draw();
        return;
      }
      /* AutoCAD refuses the pick rather than quietly taking the raw cursor —
         a point you asked to be an endpoint and is not one is a wrong point */
      if (!s || !oneShotAnswers(one, s.k)) {
        if (typeof cliPrint === 'function') cliPrint('No ' + snapKindLabel(one) + ' found for specified point.', 'err');
        if (typeof echo === 'function') echo('No ' + snapKindLabel(one) + ' found');
        clearSnapOverride();
        osPromptRestore();
        if (typeof draw === 'function') draw();
        return;
      }
    }
    /* the command's own prompt comes back before the command speaks, and the
       history already carries "…: end of", so no second line is written */
    let parked = false;
    if (!ST.ptMod || ST.ptMod.mode !== 'm2p' || ST.ptMod.pts.length) parked = osPromptRestore();
    const pickMeta = !quiet && s ? s.meta : null;
    const pickKind = !quiet && s ? s.k : null;
    const eff = ptModPoint(p);
    ST.xpick = null;
    clearSnapOverride();
    if (eff == null) { if (typeof draw === 'function') draw(); return; }
    ST.fromBase = null;
    /* Deferred Perpendicular / Tangent. The first pick gives the command a
       provisional point on the object; the second both places itself and
       fixes the first. */
    if (live && deferLive()) {
      const first = (pickMeta && pickMeta.first) || solveDefer(ST.defer, eff);
      if (first) c.pts[c.pts.length - 1] = first;
      ST.defer = null;
    } else if (live && pickMeta && pickMeta.defer && deferAvailable()) {
      ST.defer = { kind: pickKind === 'tand' ? 'tan' : 'perp', pc: pickMeta.defer, pick: eff.slice(), cmd: c };
    }
    return _cmdPoint.call(this, eff, quiet || parked);
  };
  wrapped.__snapTracked = true;
  try { cmdPoint = wrapped; } catch (err) { /* modifiers unavailable */ }
}
if (typeof cmdText === 'function' && !cmdText.__snapTracked) {
  const _cmdText = cmdText;
  const wrapped = function (s) {
    const c = (typeof CMD !== 'undefined') && CMD;
    const live = c && c.phase !== 'sel';
    /* a FROM offset is measured from the base point, not from the last point
       the command took, so it has to be resolved before anything else */
    if (live) {
      const base = ptModRef();
      if (base && /^@/.test(String(s).trim())) {
        const p = parseCoord(String(s).trim(), base, ST.cur);
        if (p) { cmdPoint(p, true); return true; }
      }
    }
    /* the running command's own options win: "C to close" must close */
    if (_cmdText.apply(this, arguments)) return true;
    return live ? snapInputText(s) : false;
  };
  wrapped.__snapTracked = true;
  try { cmdText = wrapped; } catch (err) { /* typed overrides unavailable */ }
}

/* ---------------- keyboard ----------------
   AutoCAD's temporary override keys. They are momentary: the override lives
   only while the key is held, and the running set comes straight back on
   key-up. Shift on its own toggles ortho, but only while a command is asking
   for a point — outside that, Shift belongs to the selection. */
const SNAP_OVERRIDE_KEYS = {
  e: 'end', p: 'end',                              /* endpoint            */
  v: 'mid', m: 'mid',                              /* midpoint            */
  c: 'cen', ',': 'cen',                            /* centre              */
  d: 'none', l: 'none',                            /* disable all snapping */
};
let _shiftOrtho = false, _heldOverride = null;
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { snapStateReset(); return; }
    if (ev.key === 'Tab' && ST.snapCands && ST.snapCands.length > 1) {
      ev.preventDefault();
      cycleSnap(ev.shiftKey ? -1 : 1);
      if (ST.snap) { ST.cur = ST.snap.p.slice(); if (typeof draw === 'function') draw(); }
      return;
    }
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    /* Shift on its own is AutoCAD's momentary ortho override: it inverts
       ORTHO while held and puts it straight back on release. Only while a
       command is asking for a point — elsewhere Shift belongs to selection. */
    if (ev.key === 'Shift' && !_shiftOrtho && typeof CMD !== 'undefined' && CMD && CMD.phase === 'run') {
      _shiftOrtho = true; ST.ortho = !ST.ortho;
      if (typeof syncToggles === 'function') syncToggles();
      if (typeof draw === 'function') draw();
      return;
    }
    if (!ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = String(ev.key).toLowerCase();
    if (k === 'x' || k === '.') {
      ev.preventDefault(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      draftToggle('polar'); return;
    }
    if (k === 'q' || k === ']') {
      ev.preventDefault(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      draftToggle('otrack'); return;
    }
    if (k === 's' || k === "'") {
      ev.preventDefault(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      draftToggle('osnap'); return;
    }
    const kind = SNAP_OVERRIDE_KEYS[k];
    if (!kind) return;
    ev.preventDefault();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    if (_heldOverride === kind) return;
    _heldOverride = kind;
    setSnapOverride(kind, false);
    if (typeof echo === 'function') echo(kind === 'none' ? 'Snap off (held)' : snapKindLabel(kind) + ' (held)');
    if (typeof draw === 'function') draw();
  });
  window.addEventListener('keyup', ev => {
    if (ev.key === 'Shift') {
      if (_shiftOrtho) {
        _shiftOrtho = false; ST.ortho = !ST.ortho;
        if (typeof syncToggles === 'function') syncToggles();
      }
      if (_heldOverride) { _heldOverride = null; clearSnapOverride(true); }
      if (typeof draw === 'function') draw();
      return;
    }
    const k = String(ev.key).toLowerCase();
    if (_heldOverride && SNAP_OVERRIDE_KEYS[k] === _heldOverride) {
      _heldOverride = null; clearSnapOverride(true);
      if (typeof draw === 'function') draw();
    }
  });
}

/** ORTHO and POLAR are mutually exclusive in AutoCAD: turning one on turns
    the other off. Everything that flips a drafting toggle comes through here. */
function draftToggle(k, val) {
  /* SELECTIONCYCLING is 0/1/2 — off, badge only, badge and list — not a flag,
     so a plain !ST[k] would turn 2 into true and strand the cycling list. */
  if (k === 'selCycling') {
    const n = val == null ? (ST.selCycling ? 0 : 2) : (+val || 0);
    ST.selCycling = clamp(Math.round(n), 0, 2);
    if (typeof syncToggles === 'function') syncToggles();
    if (!ST.selCycling && typeof hideCycleList === 'function') hideCycleList();
    if (typeof draw === 'function') draw();
    return ST.selCycling;
  }
  const v = val == null ? !ST[k] : !!val;
  ST[k] = v;
  if (v && k === 'ortho') ST.polar = false;
  if (v && k === 'polar') ST.ortho = false;
  if (!v && k === 'osnap') { ST.snapCands = null; ST.snap = null; }
  if (typeof syncToggles === 'function') syncToggles();
  if (typeof draw === 'function') draw();
  return v;
}

/** A reference to the point an entity is DEFINED by, when the given point is
    one of them. Exact equality is the right test: these points come out of the
    same numbers, so anything that is not exact is a different point and
    attaching to it would be a guess. */
function defPointRef(e, p) {
  if (!e || e.id == null || !p) return null;
  const same = q => q && Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9;
  if (same(e.a)) return { id: e.id, at: 'a' };
  if (same(e.b)) return { id: e.id, at: 'b' };
  if (same(e.c)) return { id: e.id, at: 'c' };
  if (same(e.p)) return { id: e.id, at: 'p' };
  /* A wall's corner is a FACE corner: derived from the centreline and the
     thickness, and not a point the wall is defined by. Recording it as an
     offset from the nearer end, measured in the wall's OWN frame rather than
     in the world, means the attachment survives the wall being stretched,
     moved and turned — which is most of what happens to a wall. */
  if (e.a && e.b) {
    const L = dist(e.a, e.b);
    if (L < 1e-9) return null;
    const ux = (e.b[0] - e.a[0]) / L, uy = (e.b[1] - e.a[1]) / L;
    const nearA = dist(p, e.a) <= dist(p, e.b);
    const base = nearA ? e.a : e.b;
    const dx = p[0] - base[0], dy = p[1] - base[1];
    const du = dx * ux + dy * uy;
    const dv = dx * -uy + dy * ux;
    /* only near an end — a point out along the wall is not that end */
    if (Math.abs(du) > L * 0.5 + 1e-6) return null;
    if (Math.abs(du) < 1e-9 && Math.abs(dv) < 1e-9) return { id: e.id, at: nearA ? 'a' : 'b' };
    return { id: e.id, at: nearA ? 'a' : 'b', du, dv };
  }
  return null;
}
