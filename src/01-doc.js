/* ============================================================
   ORTHOGRAPH — 01 document, journalled history, spatial index
   ============================================================ */

let UID = 1;
const DOC = {
  layers: [],
  ents: new Map(),
  cur: '0',
  units: 'mm',
  gridStep: 10,
  snapStep: 10,
  textH: 2.5,
  filletR: 0,
  chamD: 0,
  /* architectural libraries — travel with the document */
  wallTypes: null,
  doorTypes: null,
  winTypes: null,
  levels: null,
  curLevel: 0,
  wallHatch: true,        /* draw a poche fill inside walls */
  areaUnits: 'auto',      /* room tag units: auto | m2 | ft2 | sqmm | sqin */
  altArea: false,         /* show a second area unit under the first */
};
const SEL = new Set();

function newLayer(name, color) {
  return { name, color: color || '#d7dee8', on: true, lock: false, lw: 0.25, lt: 'solid' };
}
function layer(n) { return DOC.layers.find(l => l.name === n) || DOC.layers[0]; }
function hasLayer(n) { return DOC.layers.some(l => l.name === n); }
function ensureLayer(n, col, lt) {
  if (hasLayer(n)) return layer(n);
  const l = newLayer(n, col); if (lt) l.lt = lt;
  DOC.layers.push(l); return l;
}

/* ---- standard component libraries (millimetres) ---- */
function stdWallTypes() {
  return [
    { id: 'gen100', name: 'Generic 100', t: 100, fn: 'interior' },
    { id: 'part90', name: 'Stud partition 90', t: 90, fn: 'interior' },
    { id: 'part140', name: 'Stud partition 140', t: 140, fn: 'interior' },
    { id: 'brk115', name: 'Brick 115 (half)', t: 115, fn: 'interior' },
    { id: 'brk230', name: 'Brick 230 (full)', t: 230, fn: 'exterior' },
    { id: 'cav300', name: 'Cavity 300', t: 300, fn: 'exterior' },
    { id: 'cmu190', name: 'Block 190', t: 190, fn: 'exterior' },
    { id: 'con150', name: 'Concrete 150', t: 150, fn: 'structural' },
    { id: 'con200', name: 'Concrete 200', t: 200, fn: 'structural' },
    { id: 'con250', name: 'Concrete 250', t: 250, fn: 'structural' },
    { id: 'ret300', name: 'Retaining 300', t: 300, fn: 'structural' },
  ];
}
function stdDoorTypes() {
  return [
    { id: 'sgl700', name: 'Single 700', w: 700, h: 2100, k: 'single' },
    { id: 'sgl800', name: 'Single 800', w: 800, h: 2100, k: 'single' },
    { id: 'sgl900', name: 'Single 900', w: 900, h: 2100, k: 'single' },
    { id: 'sgl1000', name: 'Single 1000', w: 1000, h: 2100, k: 'single' },
    { id: 'dbl1200', name: 'Double 1200', w: 1200, h: 2100, k: 'double' },
    { id: 'dbl1500', name: 'Double 1500', w: 1500, h: 2100, k: 'double' },
    { id: 'dbl1800', name: 'Double 1800', w: 1800, h: 2400, k: 'double' },
    { id: 'sld1500', name: 'Sliding 1500', w: 1500, h: 2100, k: 'slide' },
    { id: 'sld1800', name: 'Sliding 1800', w: 1800, h: 2100, k: 'slide' },
    { id: 'pkt900', name: 'Pocket 900', w: 900, h: 2100, k: 'pocket' },
    { id: 'bif1200', name: 'Bifold 1200', w: 1200, h: 2100, k: 'bifold' },
    { id: 'grg2400', name: 'Garage 2400', w: 2400, h: 2100, k: 'slide' },
    { id: 'opn900', name: 'Opening 900', w: 900, h: 2100, k: 'opening' },
  ];
}
function stdWinTypes() {
  return [
    { id: 'w0606', name: 'Window 600×600', w: 600, h: 600, sill: 1200, k: 'fixed' },
    { id: 'w0909', name: 'Window 900×900', w: 900, h: 900, sill: 900, k: 'casement' },
    { id: 'w0912', name: 'Window 900×1200', w: 900, h: 1200, sill: 750, k: 'casement' },
    { id: 'w1212', name: 'Window 1200×1200', w: 1200, h: 1200, sill: 900, k: 'casement' },
    { id: 'w1215', name: 'Window 1200×1500', w: 1200, h: 1500, sill: 600, k: 'casement' },
    { id: 'w1512', name: 'Window 1500×1200', w: 1500, h: 1200, sill: 900, k: 'sliding' },
    { id: 'w1812', name: 'Window 1800×1200', w: 1800, h: 1200, sill: 900, k: 'sliding' },
    { id: 'w2415', name: 'Window 2400×1500', w: 2400, h: 1500, sill: 750, k: 'sliding' },
    { id: 'wb1815', name: 'Bay 1800×1500', w: 1800, h: 1500, sill: 600, k: 'bay' },
  ];
}
function stdLevels() {
  return [
    { id: 0, name: 'Level 0 — Ground', elev: 0, h: 3000 },
    { id: 1, name: 'Level 1', elev: 3000, h: 3000 },
  ];
}
function wallType(id) { return (DOC.wallTypes || []).find(w => w.id === id) || (DOC.wallTypes || [])[0]; }
function doorType(id) { return (DOC.doorTypes || []).find(w => w.id === id) || (DOC.doorTypes || [])[0]; }
function winType(id) { return (DOC.winTypes || []).find(w => w.id === id) || (DOC.winTypes || [])[0]; }

const ARCH_LAYERS = [
  ['A-WALL', '#e8e8e8'], ['A-WALL-PATT', '#8d9aab'], ['A-DOOR', '#4ee6a8'],
  ['A-GLAZ', '#6ba8ff'], ['A-FLOR-STRS', '#c792ea'], ['A-COLS', '#ff9f43'],
  ['A-AREA', '#ffd166'], ['A-GRID', '#ff6b81'],
];
function resetDoc() {
  DOC.layers = [
    newLayer('0', '#d7dee8'),
    newLayer('DIMENSIONS', '#6ba8ff'),
    newLayer('TEXT', '#ffd166'),
    newLayer('HIDDEN', '#8d9aab'),
  ];
  DOC.layers[3].lt = 'dashed';
  for (const [n, c] of ARCH_LAYERS) DOC.layers.push(newLayer(n, c));
  DOC.ents.clear(); DOC.cur = '0'; UID = 1;
  DOC.wallTypes = stdWallTypes(); DOC.doorTypes = stdDoorTypes();
  DOC.winTypes = stdWinTypes(); DOC.levels = stdLevels(); DOC.curLevel = 0;
  idxInvalidate(); HIST.past.length = 0; HIST.future.length = 0;
}

/* ============================================================
   spatial index — uniform hash on unbounded integer cells
   Cell size comes from a high percentile of entity extent, so a
   single far-away entity can no longer collapse the whole grid.
   Anything spanning too many cells lands in `big` and is always
   considered. Kept incrementally in sync; never silently stale.
   ============================================================ */
let IDX = null, IDXok = false;
let DOCV = 0;                                    /* bumps on any document mutation */
/* Which entities changed since a consumer last looked. Lets the renderer
   rebuild only what moved instead of throwing the whole shape cache away on
   every mouse-move during a drag. */
const DIRTY = new Set();
function markDirty(id) { if (id != null) DIRTY.add(id); }
const IDXdirty = new Set();
const IDX_MAX_CELLS = 96;

function idxInvalidate() { IDX = null; IDXok = false; IDXdirty.clear(); DOCV++; }
const bumpIndex = idxInvalidate;                 /* legacy alias */
const ikey = (i, j) => i + ',' + j;

function buildIndex() {
  const list = [...DOC.ents.values()];
  const spans = [];
  for (const e of list) { const b = bbox(e); const s = Math.max(b[2] - b[0], b[3] - b[1]); if (isFinite(s)) spans.push(s); }
  spans.sort((a, b) => a - b);
  let cell = spans.length ? spans[Math.floor(spans.length * 0.75)] : 1;
  if (!(cell > 0) || !isFinite(cell)) cell = 1;
  cell = Math.max(cell * 2, 1e-6);
  IDX = { cell, map: new Map(), cells: new Map(), big: [] };
  for (const e of list) idxInsert(e);
  IDXok = true; IDXdirty.clear();
}
function idxInsert(e) {
  if (!IDX || !e) return;
  const c = IDX.cell, b = bbox(e);
  const i0 = Math.floor(b[0] / c), i1 = Math.floor(b[2] / c);
  const j0 = Math.floor(b[1] / c), j1 = Math.floor(b[3] / c);
  const n = (i1 - i0 + 1) * (j1 - j0 + 1);
  if (!isFinite(n) || n > IDX_MAX_CELLS) { IDX.big.push(e); IDX.cells.set(e.id, null); return; }
  const keys = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const k = ikey(i, j); let a = IDX.map.get(k); if (!a) IDX.map.set(k, a = []); a.push(e); keys.push(k);
  }
  IDX.cells.set(e.id, keys);
}
function idxRemove(e) {
  if (!IDX || !e) return;
  const keys = IDX.cells.get(e.id);
  if (keys === undefined) return;
  if (keys === null) { const i = IDX.big.indexOf(e); if (i >= 0) IDX.big.splice(i, 1); }
  else for (const k of keys) {
    const a = IDX.map.get(k); if (!a) continue;
    const i = a.indexOf(e); if (i >= 0) a.splice(i, 1);
    if (!a.length) IDX.map.delete(k);
  }
  IDX.cells.delete(e.id);
}
function idxFlush() {
  if (!IDXdirty.size) return;
  if (IDX) for (const e of IDXdirty) if (DOC.ents.get(e.id) === e) { idxRemove(e); idxInsert(e); }
  IDXdirty.clear();
}
/** query world rect; returns a superset of entities whose bbox may overlap */
function query(x0, y0, x1, y1) {
  /* Below this the index costs more than it saves. Keep it low: at 256 a
     few hundred walls fell back to a full scan and snapping got slower as
     the drawing got smaller. */
  if (DOC.ents.size < 64) return [...DOC.ents.values()];
  idxFlush();
  if (!IDXok) buildIndex();
  const c = IDX.cell;
  const i0 = Math.floor(x0 / c), i1 = Math.floor(x1 / c);
  const j0 = Math.floor(y0 / c), j1 = Math.floor(y1 / c);
  if (!isFinite(i0) || !isFinite(j0) || (i1 - i0 + 1) * (j1 - j0 + 1) > 60000) return [...DOC.ents.values()];
  const out = new Set(IDX.big);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const a = IDX.map.get(ikey(i, j)); if (a) for (const e of a) out.add(e);
  }
  return [...out];
}

/* ============================================================
   history — journalled patches, O(changed) not O(document)
   ============================================================ */
const HIST = { past: [], future: [], depth: 200 };
const JN = { on: false, before: new Map(), added: new Set(), removed: new Map(), layers: null, cur: null, uid: 0 };

function begin() {
  if (JN.on) return;                             /* nested begin is a no-op */
  JN.on = true;
  JN.before.clear(); JN.added.clear(); JN.removed.clear();
  JN.layers = null; JN.cur = DOC.cur; JN.uid = UID;
}
/** record an entity's pre-edit state. Call BEFORE mutating. */
function touch(e) {
  if (!e) return e;
  if (JN.on && e.id != null && !JN.before.has(e.id) && !JN.added.has(e.id) && DOC.ents.has(e.id))
    JN.before.set(e.id, clone(e));
  return e;
}
/** touch + schedule reindex. The normal way to edit a live entity. */
function mut(e) { touch(e); if (e && e.id != null) { IDXdirty.add(e); markDirty(e.id); DOCV++; } return e; }
function touchLayers() { if (JN.on && !JN.layers) JN.layers = clone(DOC.layers); }

function addEnt(e) {
  e.id = e.id || UID++;
  if (e.id >= UID) UID = e.id + 1;
  e.layer = e.layer || DOC.cur;
  if (e.color === undefined) e.color = null;      /* null = ByLayer */
  if (e.lw === undefined) e.lw = null;
  if (e.lt === undefined) e.lt = null;
  DOC.ents.set(e.id, e); markDirty(e.id); DOCV++;
  if (JN.on) JN.added.add(e.id);
  if (IDX) idxInsert(e);
  return e;
}
function delEnt(id) {
  const e = DOC.ents.get(id); if (!e) return;
  if (JN.on) {
    if (JN.added.has(id)) JN.added.delete(id);    /* created and killed in one op */
    else JN.removed.set(id, JN.before.get(id) || clone(e));
    JN.before.delete(id);
  }
  idxRemove(e); IDXdirty.delete(e);
  DOC.ents.delete(id); SEL.delete(id); markDirty(id); DOCV++;
}

function commit(label) {
  idxFlush();
  if (!JN.on) { if (label) echo(label); return; }
  const chg = [];
  for (const [id, before] of JN.before) {
    const cur = DOC.ents.get(id); if (!cur) continue;
    chg.push({ id, b: before, a: clone(cur) });
  }
  const addv = [];
  for (const id of JN.added) { const e = DOC.ents.get(id); if (e) addv.push(clone(e)); }
  const delv = [...JN.removed.values()];
  const lay = JN.layers ? { b: JN.layers, a: clone(DOC.layers) } : null;
  const p = { chg, add: addv, del: delv, lay, cur: { b: JN.cur, a: DOC.cur }, uid: { b: JN.uid, a: UID } };
  JN.on = false;
  if (chg.length || addv.length || delv.length || lay || p.cur.b !== p.cur.a) {
    HIST.past.push(p);
    if (HIST.past.length > HIST.depth) HIST.past.shift();
    HIST.future.length = 0;
  }
  if (label) echo(label);
  if (typeof syncUI === 'function') syncUI();
}
/** abandon the in-flight journal without recording (used by cancel paths) */
function rollback() {
  if (!JN.on) return;
  for (const id of JN.added) { const e = DOC.ents.get(id); if (e) { idxRemove(e); DOC.ents.delete(id); SEL.delete(id); } }
  for (const [id, e] of JN.removed) DOC.ents.set(id, clone(e));
  for (const [id, e] of JN.before) if (DOC.ents.has(id)) DOC.ents.set(id, clone(e));
  if (JN.layers) DOC.layers = JN.layers;
  DOC.cur = JN.cur; UID = JN.uid;
  JN.on = false; idxInvalidate();
}

function applyPatch(p, redoDir) {
  for (const e of p.add) markDirty(e.id);
  for (const e of p.del) markDirty(e.id);
  for (const c of p.chg) markDirty(c.id);
  const src = redoDir ? 'a' : 'b';
  const gone = redoDir ? p.del : p.add;
  const back = redoDir ? p.add : p.del;
  for (const e of gone) { const cur = DOC.ents.get(e.id); if (cur) idxRemove(cur); DOC.ents.delete(e.id); SEL.delete(e.id); }
  for (const e of back) DOC.ents.set(e.id, clone(e));
  for (const c of p.chg) if (DOC.ents.has(c.id)) DOC.ents.set(c.id, clone(c[src]));
  if (p.lay) DOC.layers = clone(p.lay[src]);
  DOC.cur = p.cur[src]; UID = p.uid[src];
  idxInvalidate();
}
function undo() {
  if (JN.on) rollback();
  if (!HIST.past.length) return echo('Nothing to undo');
  const p = HIST.past.pop();
  applyPatch(p, false);
  HIST.future.push(p);
  echo('Undo'); syncUI(); draw();
}
function redo() {
  if (!HIST.future.length) return echo('Nothing to redo');
  const p = HIST.future.pop();
  applyPatch(p, true);
  HIST.past.push(p);
  echo('Redo'); syncUI(); draw();
}

/* ---- display attributes ---- */
function entColor(e) { return e.color || layer(e.layer).color; }
function entLt(e) { return e.lt || layer(e.layer).lt || 'solid'; }
function entLw(e) { return e.lw != null ? e.lw : layer(e.layer).lw; }
function visible(e) { const l = layer(e.layer); return l.on; }
function pickable(e) { const l = layer(e.layer); return l.on && !l.lock; }
function selEnts() { return [...SEL].map(i => DOC.ents.get(i)).filter(Boolean); }
