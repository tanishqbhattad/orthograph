'use strict';
/* ============================================================
   Layer tools — LAYISO, LAYOFF, LAYFRZ, LAYMCUR and friends,
   plus named layer states.

   A layer panel is fine for housekeeping and useless in the
   middle of drawing: what a draughtsman actually does is point
   at something and say "hide that", "make that current", "show
   me only this". These are AutoCAD's names for exactly that, and
   they are the commands that make a busy drawing workable.
   ============================================================ */

/** the layer of whatever is under a pick, or null with a message */
function layerAtPick(p, why) {
  const e = pickAt(p, 10);
  if (!e) { echo('Nothing there'); return null; }
  const l = layer(e.layer);
  if (!l) { echo('That object has no layer'); return null; }
  return l;
}
/** every layer that any of these entities sits on */
function layersOf(ents) {
  const set = new Set();
  for (const e of ents) set.add(e.layer);
  return [...set];
}

defc('layoff', {
  group: 'view', hint: 'Pick something on the layer to hide · <em>Enter</em> to stop',
  point(c, p) {
    const l = layerAtPick(p); if (!l) return;
    if (l.name === DOC.cur) return echo('That is the current layer — draw somewhere else first');
    begin(); touchLayers(); l.on = false; commit('Layer ' + l.name + ' off');
    SEL.clear(); syncUI(); draw();
  },
});
defc('layfrz', {
  group: 'view', hint: 'Pick something on the layer to freeze · <em>Enter</em> to stop',
  point(c, p) {
    const l = layerAtPick(p); if (!l) return;
    /* freezing what you are drawing on would leave you working blind */
    if (l.name === DOC.cur) return echo('The current layer cannot be frozen');
    begin(); touchLayers(); l.frozen = true; commit('Layer ' + l.name + ' frozen');
    SEL.clear(); syncUI(); draw();
  },
});
defc('laymcur', {
  group: 'view', hint: 'Pick something on the layer to make current',
  point(c, p) {
    const l = layerAtPick(p); if (!l) return;
    if (l.frozen) return echo('A frozen layer cannot be made current');
    DOC.cur = l.name;
    cliPrint('Current layer is now ' + l.name);
    SEL.clear(); syncUI(); draw(); endCmd();
  },
});
defm('LAYON', () => {
  begin(); touchLayers();
  for (const l of DOC.layers) l.on = true;
  commit('All layers on');
  syncUI(); draw();
}, { group: 'view' });
defm('LAYTHW', () => {
  begin(); touchLayers();
  for (const l of DOC.layers) l.frozen = false;
  commit('All layers thawed');
  syncUI(); draw();
}, { group: 'view' });

/* ---------------- isolate ----------------
   LAYISO hides everything except the layers you pointed at, and LAYUNISO puts
   it back. Putting it back is the whole trick: the state before isolating is
   remembered, so unisolating restores exactly what was on and off rather than
   turning everything on and destroying the setup you had. */
let LAYISO_PREV = null;
defc('layiso', {
  group: 'view', needSel: false,
  hint: 'Pick what to keep visible · <em>Enter</em> when done',
  init(c) { c.keep = new Set(SEL.size ? layersOf(selEnts()) : []); },
  point(c, p) {
    const l = layerAtPick(p); if (!l) return;
    c.keep.add(l.name);
    echo('Keeping ' + [...c.keep].join(', '));
  },
  enter(c) {
    if (!c.keep.size) { echo('Nothing picked'); return endCmd(); }
    LAYISO_PREV = DOC.layers.map(l => ({ name: l.name, on: l.on, frozen: l.frozen }));
    begin(); touchLayers();
    for (const l of DOC.layers) if (!c.keep.has(l.name)) l.on = false;
    /* the current layer has to be one you can see, or the next thing drawn
       vanishes the moment it is made */
    if (!c.keep.has(DOC.cur)) DOC.cur = [...c.keep][0];
    commit('Isolated ' + [...c.keep].join(', '));
    SEL.clear(); syncUI(); draw(); endCmd();
  },
});
defm('LAYUNISO', () => {
  if (!LAYISO_PREV) { echo('Nothing was isolated'); return; }
  begin(); touchLayers();
  for (const rec of LAYISO_PREV) {
    const l = DOC.layers.find(x => x.name === rec.name);
    if (l) { l.on = rec.on; l.frozen = rec.frozen; }
  }
  commit('Un-isolated');
  LAYISO_PREV = null;
  syncUI(); draw();
}, { group: 'view' });

/* ---------------- named layer states ----------------
   A drawing has moods: everything on for coordination, structure only for a
   frame plan, services off for a GA. Saving those by name is the difference
   between a set of layer settings you can return to and one you rebuild by
   hand every time. */
function layerStates() { return DOC.layerStates || (DOC.layerStates = []); }
function saveLayerState(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  const snap = DOC.layers.map(l => ({
    name: l.name, on: l.on, frozen: l.frozen, lock: l.lock,
    plot: l.plot, color: l.color, lw: l.lw, lt: l.lt,
  }));
  const list = layerStates();
  const at = list.findIndex(s => s.name.toLowerCase() === n.toLowerCase());
  const rec = { name: n, cur: DOC.cur, layers: snap };
  if (at >= 0) list[at] = rec; else list.push(rec);
  return true;
}
/** Restore a state. Layers that did not exist when it was saved are left
    exactly as they are rather than guessed at — a state is a record of what it
    saw, not a claim about everything that came after. */
function restoreLayerState(name) {
  const n = String(name || '').trim().toLowerCase();
  const rec = layerStates().find(s => s.name.toLowerCase() === n);
  if (!rec) return false;
  begin(); touchLayers();
  for (const snap of rec.layers) {
    const l = DOC.layers.find(x => x.name === snap.name);
    if (!l) continue;
    l.on = snap.on; l.frozen = snap.frozen; l.lock = snap.lock;
    l.plot = snap.plot; l.color = snap.color; l.lw = snap.lw; l.lt = snap.lt;
  }
  if (rec.cur && DOC.layers.some(l => l.name === rec.cur && !l.frozen)) DOC.cur = rec.cur;
  commit('Layer state ' + rec.name);
  syncUI(); draw();
  return true;
}
defc('layerstate', {
  key: 'layerstate', group: 'view',
  hint: '<em>S</em> save · <em>R</em> restore · <em>D</em> delete · <em>?</em> list',
  init(c) { c.data = {}; },
  text(c, s) {
    const raw = String(s).trim(), k = raw.toLowerCase(), d = c.data;
    if (d.await === 'save') {
      begin(); saveLayerState(raw); commit('Save layer state');
      cliPrint('Layer state "' + raw + '" saved'); return true;
    }
    if (d.await === 'restore') {
      if (!restoreLayerState(raw)) cliPrint('No layer state called "' + raw + '".', 'err');
      return true;
    }
    if (d.await === 'delete') {
      const before = layerStates().length;
      DOC.layerStates = layerStates().filter(x => x.name.toLowerCase() !== k);
      cliPrint(DOC.layerStates.length < before ? 'Deleted "' + raw + '"' : 'No such state');
      return true;
    }
    if (k === 's' || k === 'save') { d.await = 'save'; hint('Name for this layer state:'); return true; }
    if (k === 'r' || k === 'restore') { d.await = 'restore'; hint('Layer state to restore:'); return true; }
    if (k === 'd' || k === 'delete') { d.await = 'delete'; hint('Layer state to delete:'); return true; }
    if (k === '?' || k === 'list') {
      const l = layerStates();
      cliPrint(l.length ? l.map(x => x.name + '  (' + x.layers.length + ' layers)').join('\n')
                        : 'No layer states saved yet.');
      return true;
    }
    return false;
  },
});
