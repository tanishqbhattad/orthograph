'use strict';
/* ============================================================
   ORTHOGRAPH — 09g the schedule engine

   There were three schedules: rooms, doors, windows. Each was a
   function that knew how to build its own table, so a fourth —
   walls by type with a total length, columns by size, furniture
   by block name with a count — meant writing a fourth function,
   and nobody ever does.

   A schedule is three decisions. What to count. Which
   properties go in the columns. Whether the identical ones
   collapse into one row with a quantity, and whether the
   numbers are totalled. Name those three rather than hard-code
   them and a schedule of anything is a sentence:

     { of: 'wall', cols: ['wallType', 'length'], group: true, total: true }

   The three that already existed are now three sentences in
   the same language, which is the test that the language is
   the right one.
   ============================================================ */

/* ---------------- fields ----------------
   A field is a named way of getting one value out of an object: a label for
   the column heading, a getter, and the units to write it in.

   `num` and `sum` are not the same thing and conflating them is how a
   schedule starts lying. `num` says the value is a number — right-aligned,
   formatted as a length or an area. `sum` says it is an AMOUNT of something,
   so grouping several rows adds it up. Lengths, areas and counts are amounts.
   A thickness is not: two 100mm walls are not a 200mm wall, and a door
   schedule that reports 1800 for a pair of 900 doors is worse than no
   schedule. */
const SCHED_FIELDS = {
  mark:     { label: 'Mark', get: e => e.mark || e.num || '—' },
  type:     { label: 'Type', get: e => e.t },
  name:     { label: 'Name', get: e => e.name || e.s || '—' },
  layer:    { label: 'Layer', get: e => e.layer || '0' },
  level:    { label: 'Level', get: e => { const L = levelById(entLevel(e)); return (L && L.name) || String(entLevel(e)); } },
  wallType: { label: 'Wall type', get: e => (wallType(e.wt) || {}).name || '—' },
  thickness:{ label: 'Thk', get: e => e.t === 'wall' ? wallT(e) : (e.th || 0), num: true, unit: 'len' },
  width:    { label: 'W', get: e => (e.t === 'door' || e.t === 'window') ? openW(e) : (e.w || 0), num: true, unit: 'len' },
  height:   { label: 'H', get: e => (e.t === 'door' || e.t === 'window') ? openH(e) : (e.h || 0), num: true, unit: 'len' },
  sill:     { label: 'Sill', get: e => e.sill || 0, num: true, unit: 'len' },
  length:   { label: 'Length', get: e => entLength(e) || 0, num: true, sum: true, unit: 'len' },
  area:     { label: 'Area', get: e => Math.abs(entArea(e) || 0), num: true, sum: true, unit: 'area' },
  count:    { label: 'Qty', get: () => 1, num: true, sum: true, unit: 'n' },
  host:     { label: 'Wall', get: e => { const h = DOC.ents.get(e.host); return h ? ((wallType(h.wt) || {}).name || '—') : '—'; } },
  opening:  { label: 'Type', get: e => openingTypeName(e, e.t === 'door') },
  fire:     { label: 'Fire', get: e => fireText(openingSpec(e).fire) },
  acoustic: { label: 'Acoustic Rw', get: e => specText(openingSpec(e).acoustic) },
  finish:   { label: 'Finish', get: e => specText(openingSpec(e).finish) },
  material: { label: 'Material', get: e => e.mat || (wallType(e.wt) || {}).mat || '—' },
  block:    { label: 'Block', get: e => e.name || '—' },
  /* a room's area comes from the boundary it draws and labels with, so the
     schedule cannot disagree with the plan */
  roomArea: { label: 'Area', get: e => Math.abs(polyArea(roomBoundary(e) || e.pts || [])), num: true, sum: true, unit: 'area' },
};
/** how a field's value is written into a cell */
function schedText(f, v) {
  if (!f.num) return v == null ? '—' : String(v);
  if (f.unit === 'area') return fmtArea(v);
  if (f.unit === 'n') return String(Math.round(v));
  return fmt(v);
}

/* ---------------- what can be scheduled ----------------
   Everything the document knows how to make. A schedule of a type nobody has
   drawn is a heading with nothing under it, which is honest — the columns are
   still named, and the table fills itself in the moment one is drawn. */
const SCHED_OF = {
  room: { label: 'Rooms', cols: ['mark', 'name', 'roomArea'] },
  door: { label: 'Doors', cols: ['mark', 'opening', 'width', 'height', 'host', 'fire', 'acoustic', 'finish'] },
  window: { label: 'Windows', cols: ['mark', 'opening', 'width', 'height', 'host', 'acoustic', 'finish'] },
  wall: { label: 'Walls', cols: ['wallType', 'thickness', 'length'] },
  column: { label: 'Columns', cols: ['mark', 'width', 'height'] },
  floor: { label: 'Floors', cols: ['mark', 'area', 'thickness'] },
  roof: { label: 'Roofs', cols: ['mark', 'area'] },
  stair: { label: 'Stairs', cols: ['mark', 'width', 'length'] },
  insert: { label: 'Blocks', cols: ['block', 'layer'] },
};
function schedKinds() { return Object.keys(SCHED_OF); }
/** the plural word someone would type, mapped to the type it means */
function schedOfName(word) {
  const k = String(word || '').trim().toLowerCase().replace(/s$/, '');
  if (SCHED_OF[k]) return k;
  const hit = Object.keys(SCHED_OF).find(x => SCHED_OF[x].label.toLowerCase() === String(word).trim().toLowerCase());
  return hit || null;
}

/* ---------------- the three that already existed ----------------
   Written in the same language as everything else, which is the test that the
   language is the right one. */
const SCHED_PRESET = {
  rooms: { of: 'room', cols: SCHED_OF.room.cols.slice(), align: ['l', 'l', 'r'] },
  doors: { of: 'door', cols: SCHED_OF.door.cols.slice() },
  windows: { of: 'window', cols: SCHED_OF.window.cols.slice() },
};

/** everything of this type on this level */
function schedSource(spec) {
  const of = spec.of;
  const lvl = spec.lvl == null ? (DOC.curLevel || 0) : spec.lvl;
  const out = [];
  for (const e of DOC.ents.values()) {
    if (e.t !== of) continue;
    if (entLevel(e) !== lvl) continue;
    if (spec.layer && e.layer !== spec.layer) continue;
    out.push(e);
  }
  return out;
}
/** the fields a spec actually has — a column nobody has defined is dropped
    rather than printed as a row of undefined */
function schedCols(spec) {
  return (spec.cols || []).filter(n => SCHED_FIELDS[n]);
}
/** Build the table. One row per object, or one per distinct set of values with
    a quantity beside it, and a total row when asked for. */
function schedRows(spec) {
  const names = schedCols(spec);
  if (!names.length) return [[]];
  const fields = names.map(n => SCHED_FIELDS[n]);
  const src = schedSource(spec);
  const head = fields.map(f => f.label);
  if (spec.group) head.push(SCHED_FIELDS.count.label);
  const rows = [head];
  const sums = new Array(fields.length).fill(0);
  const addSums = (vals) => {
    for (let i = 0; i < fields.length; i++) if (fields[i].sum) sums[i] += (+vals[i] || 0);
  };
  if (spec.group) {
    const bucket = new Map();
    for (const e of src) {
      const vals = fields.map(f => f.get(e));
      /* group on everything that is not an amount: two walls of the same type
         are the same line item however long each of them is */
      const key = fields.map((f, i) => f.sum ? '' : String(vals[i])).join('  ');
      const b = bucket.get(key);
      if (b) { b.n++; for (let i = 0; i < fields.length; i++) if (fields[i].sum) b.vals[i] += (+vals[i] || 0); }
      else bucket.set(key, { n: 1, vals });
      addSums(vals);
    }
    for (const b of bucket.values())
      rows.push(fields.map((f, i) => schedText(f, b.vals[i])).concat([String(b.n)]));
  } else {
    for (const e of src) {
      const vals = fields.map(f => f.get(e));
      addSums(vals);
      rows.push(fields.map((f, i) => schedText(f, vals[i])));
    }
  }
  if (spec.total) {
    const row = fields.map((f, i) => f.sum ? schedText(f, sums[i]) : '');
    row[0] = 'Total';
    if (spec.group) row.push(String(src.length));
    rows.push(row);
  }
  return rows;
}
/** the alignment of each column: numbers right, words left */
function schedAlign(spec) {
  const a = schedCols(spec).map(n => SCHED_FIELDS[n].num ? 'r' : 'l');
  if (spec.group) a.push('r');
  return a;
}
/** What a placed table calls itself. The three that existed keep the names
    they had — a room schedule is still a 'rooms' table — so an older drawing,
    and anything that goes looking for one by name, still finds it. */
function schedKindName(spec) {
  const of = spec && spec.of;
  for (const k of Object.keys(SCHED_PRESET)) if (SCHED_PRESET[k].of === of) return k;
  return 'sched';
}
/** place a schedule built from a spec */
function schedPlace(spec, p, label) {
  const rows = schedRows(spec);
  const h = DOC.textH || 2.5;
  begin();
  const tb = addEnt({ t: 'table', p: p.slice(), rows, colW: fitColumns(rows, h), h,
                      align: schedAlign(spec), kind: schedKindName(spec), spec: clone(spec),
                      layer: annoLayer('TEXT') });
  commit((label || 'Schedule'));
  cliPrint((rows.length - 1 - (spec.total ? 1 : 0)) + ' rows scheduled.');
  return tb;
}
