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
  hint: '<em>S</em>ave · <em>R</em>estore · <em>D</em>elete · <em>?</em> list',
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

/* ============================================================
   DIMSTYLE and DIMBASELINE
   ------------------------------------------------------------
   A style is only worth having if it can be made, named, set
   current and applied to what is already drawn. Baseline is the
   other half of DIMCONTINUE: continue carries on from the last
   extension line, baseline stacks from the FIRST one, and a
   drawing needs both.
   ============================================================ */
defc('dimstyle', {
  key: 'dimstyle', group: 'annotate',
  hint: '<em>S</em>ave · <em>R</em>estore · <em>A</em>pply to selection · <em>?</em> list',
  init(c) { c.data = {}; },
  text(c, s) {
    const raw = String(s).trim(), k = raw.toLowerCase(), d = c.data;
    if (d.await === 'save') {
      /* saving captures what the current style resolves to, so "save as" from
         a tweaked Standard behaves the way anyone expects */
      const cur = curDimStyleRec() || {};
      const rec = Object.assign({}, cur, { name: raw });
      const list = dimStyles();
      const at = list.findIndex(x => String(x.name).toLowerCase() === k);
      begin();
      if (at >= 0) list[at] = rec; else list.push(rec);
      DOC.curDim = raw;
      commit('Dimension style');
      cliPrint('Dimension style "' + raw + '" saved and made current');
      draw(); return true;
    }
    if (d.await === 'set') {
      if (!dimStyleRec(raw)) { cliPrint('No dimension style called "' + raw + '".', 'err'); return true; }
      begin(); DOC.curDim = dimStyleRec(raw).name; commit('Current dimension style');
      cliPrint('Current dimension style is ' + DOC.curDim);
      draw(); return true;
    }
    if (d.await === 'apply') {
      const rec = dimStyleRec(raw);
      if (!rec) { cliPrint('No dimension style called "' + raw + '".', 'err'); return true; }
      const dims = selEnts().filter(e => e.t === 'dim');
      if (!dims.length) { cliPrint('Select some dimensions first.', 'err'); return true; }
      begin();
      for (const e of dims) { mut(e); e.style = rec.name; }
      commit('Dimension style');
      cliPrint(dims.length + ' dimension' + (dims.length === 1 ? '' : 's') + ' set to ' + rec.name);
      draw(); return true;
    }
    if (k === 's' || k === 'save') { d.await = 'save'; hint('Name for this dimension style:'); return true; }
    if (k === 'r' || k === 'set' || k === 'restore') { d.await = 'set'; hint('Style to make current:'); return true; }
    if (k === 'a' || k === 'apply') { d.await = 'apply'; hint('Style to apply to the selection:'); return true; }
    if (k === '?' || k === 'list') {
      cliPrint(dimStyles().map(x =>
        (x.name === (curDimStyleRec() || {}).name ? '* ' : '  ') + x.name).join('\n'));
      return true;
    }
    return false;
  },
});

/** DIMBASELINE — stack a new dimension from the FIRST extension line of the
    last one, rather than carrying on from its second the way DIMCONTINUE does.
    The offset grows each time so the dimension lines do not land on top of one
    another, which is the whole reason baseline dimensions are drawn stacked. */
defc('dimbase', {
  key: 'dimbase', group: 'annotate',
  hint: 'Pick the next extension line origin · <em>Enter</em> to stop',
  init(c) {
    const dims = [...DOC.ents.values()].filter(e => e.t === 'dim' && e.k !== 'angular'
      && e.k !== 'radius' && e.k !== 'diameter');
    c.base = dims.length ? dims[dims.length - 1] : null;
    if (!c.base) { cliPrint('Draw one dimension first, then stack from it.', 'err'); endCmd(true); return; }
    c.step = 0;
    /* the gap between stacked dimension lines: the text height plus a little,
       scaled the same way every other dimension size is */
    c.gap = dimStyle(c.base).txt * 2.4;
  },
  point(c, p) {
    const b = c.base; if (!b) return;
    c.step++;
    const off = b.off + Math.sign(b.off || 1) * c.gap * c.step;
    begin();
    const n = addEnt(withRefs({
      t: 'dim', k: b.k, p1: dimEnd(b, 1), p2: p, off,
      style: b.style, layer: dimLayer(),
    }, [b.r1, snapRef()]));
    commit('Baseline dimension');
    draw();
  },
});

/* ============================================================
   Block attributes
   ------------------------------------------------------------
   An attribute is a text field that belongs to the block
   DEFINITION but whose value belongs to each INSERT. That is how
   one door block serves forty doors with forty numbers, and how
   a title block is a block at all rather than a drawing of one.
   Without them a block is a rubber stamp; with them it is a
   thing that carries information.
   ============================================================ */
/** the attribute definitions of a block, in the order they were declared */
function blockAttdefs(name) {
  const b = (DOC.blocks || {})[name];
  if (!b) return [];
  return (b.ents || []).filter(e => e.t === 'attdef');
}
/** the value an insert carries for one tag, falling back to the default */
function attValue(ins, def) {
  const own = ins && ins.att && ins.att[def.tag];
  if (own != null && own !== '') return own;
  return def.val == null ? '' : def.val;
}
/* ------------------------------------------------------------
   BATTMAN — the attributes of a block, after the block exists.

   The substance is the rename. An insert stores its values against the TAG,
   so renaming a tag in the definition and stopping there would leave every
   insert in the drawing carrying a value under a name nothing looks up any
   more — the drawing would look right until it was redrawn, and then the
   values would simply be gone.
   ------------------------------------------------------------ */
function blockInserts(name) {
  const out = [];
  for (const e of DOC.ents.values()) if (e.t === 'insert' && e.name === name) out.push(e);
  return out;
}
function attRename(block, from, to) {
  const b = (DOC.blocks || {})[block];
  if (!b) return false;
  const tag = String(to || '').trim().toUpperCase();
  if (!tag) return false;
  const defs = (b.ents || []).filter(e => e.t === 'attdef');
  const def = defs.find(d => d.tag === from);
  if (!def) return false;
  /* two attributes sharing a tag would make attValue ambiguous for ever */
  if (defs.some(d => d !== def && d.tag === tag)) {
    if (typeof echo === 'function') echo('There is already an attribute called ' + tag);
    return false;
  }
  if (tag === from) return true;
  begin();
  def.tag = tag;
  for (const ins of blockInserts(block)) {
    if (!ins.att || !(from in ins.att)) continue;
    mut(ins);
    ins.att[tag] = ins.att[from];
    delete ins.att[from];
  }
  commit('Rename attribute');
  if (typeof shapeCacheClear === 'function') shapeCacheClear();
  return true;
}
function attEditDef(block, tag, o) {
  const b = (DOC.blocks || {})[block];
  if (!b) return false;
  const def = (b.ents || []).find(e => e.t === 'attdef' && e.tag === tag);
  if (!def) return false;
  begin();
  if (o.prompt != null) def.prompt = o.prompt;
  if (o.val != null) def.val = o.val;
  if (o.h != null && o.h > 0) def.h = o.h;
  commit('Edit attribute');
  if (typeof shapeCacheClear === 'function') shapeCacheClear();
  return true;
}
function attRemove(block, tag) {
  const b = (DOC.blocks || {})[block];
  if (!b) return false;
  const i = (b.ents || []).findIndex(e => e.t === 'attdef' && e.tag === tag);
  if (i < 0) return false;
  begin();
  b.ents.splice(i, 1);
  /* the value goes too: a value for an attribute that no longer exists is
     invisible, unreachable, and still in the file */
  for (const ins of blockInserts(block)) {
    if (!ins.att || !(tag in ins.att)) continue;
    mut(ins);
    delete ins.att[tag];
  }
  commit('Remove attribute');
  if (typeof shapeCacheClear === 'function') shapeCacheClear();
  return true;
}
defc('battman', {
  key: 'battman', group: 'annotate',
  hint: 'Manage the attributes of a block',
  init(c) {
    const names = Object.keys(DOC.blocks || {}).filter(n => blockAttdefs(n).length);
    if (!names.length) { toast('No block in this drawing has attributes'); return endCmd(); }
    const pick = names[0];
    const rows = (n) => blockAttdefs(n).map(d =>
      '<div class="row"><label>' + esc(d.tag) + '</label><input class="f" data-tag="' +
      esc(d.tag) + '" value="' + esc(d.val == null ? '' : d.val) + '"></div>').join('');
    modal('<h3>Block attributes</h3>' +
      '<div class="row"><label>Block</label><select class="f" id="bmB">' +
      names.map(n => '<option>' + esc(n) + '</option>').join('') + '</select></div>' +
      '<div class="row"><label>Rename</label><input class="f" id="bmFrom" placeholder="tag"></div>' +
      '<div class="row"><label>to</label><input class="f" id="bmTo" placeholder="new tag"></div>' +
      '<div class="row"><label>Remove</label><input class="f" id="bmDel" placeholder="tag"></div>' +
      '<div id="bmDefs">' + rows(pick) + '</div>', () => {
      const n = ($('#bmB') || {}).value || pick;
      const from = (($('#bmFrom') || {}).value || '').trim().toUpperCase();
      const to = (($('#bmTo') || {}).value || '').trim().toUpperCase();
      if (from && to) attRename(n, from, to);
      const del = (($('#bmDel') || {}).value || '').trim().toUpperCase();
      if (del) attRemove(n, del);
      for (const inp of document.querySelectorAll('#bmDefs input')) {
        const tg = inp.getAttribute('data-tag');
        if (tg) attEditDef(n, tg, { val: inp.value });
      }
      syncUI(); draw();
    });
    endCmd();
  },
});

/* ------------------------------------------------------------
   REFEDIT — editing the drawing inside a block, in place.

   The contents come out into the drawing at the size, angle and place the
   insert sits, so what you edit is what you were looking at. The insert is
   taken out of the way while that is true, or the block would be drawn twice
   on top of itself.

   Saving maps the entities back through the exact inverse of the placement.
   Opening and closing without touching anything therefore has to leave the
   definition identical — there is a test for precisely that, because a lossy
   round trip would degrade a block a little on every edit.
   ------------------------------------------------------------ */
let REFEDIT = null;
function refeditName() { return REFEDIT ? REFEDIT.name : null; }
/** drop the edit without touching the document: for resetDoc, where the
    entities it was tracking are about to stop existing anyway */
function refeditForget() { REFEDIT = null; }
/** the placement of an insert, and its inverse */
function refPlacement(ins, b) {
  const cs = Math.cos(ins.rot || 0), sn = Math.sin(ins.rot || 0);
  const sx = ins.sx == null ? 1 : ins.sx;
  const sy = ins.sy == null ? sx : ins.sy;
  const fwd = p => {
    const q = [(p[0] - b.base[0]) * sx, (p[1] - b.base[1]) * sy];
    return [ins.p[0] + q[0] * cs - q[1] * sn, ins.p[1] + q[0] * sn + q[1] * cs];
  };
  const inv = p => {
    const dx = p[0] - ins.p[0], dy = p[1] - ins.p[1];
    /* undo the rotation, then the scale, then put the base point back */
    const rx = dx * cs + dy * sn, ry = -dx * sn + dy * cs;
    return [rx / (sx || 1) + b.base[0], ry / (sy || 1) + b.base[1]];
  };
  return { fwd, inv };
}
function refeditOpen(ins) {
  if (REFEDIT) { if (typeof echo === 'function') echo('Already editing ' + REFEDIT.name); return 0; }
  if (!ins || ins.t !== 'insert') return 0;
  const b = (DOC.blocks || {})[ins.name];
  if (!b) return 0;
  const { fwd } = refPlacement(ins, b);
  const keep = clone(ins);
  begin();
  const ids = [];
  for (const e of (b.ents || [])) {
    const n = clone(e);
    delete n.id;
    const made = addEnt(n);
    xf(made, fwd);
    made.__ref = ins.name;                 /* what is being edited, and what is not */
    ids.push(made.id);
  }
  eraseEnt(ins.id);
  commit('Edit block ' + ins.name);
  REFEDIT = { name: ins.name, ids, ins: keep, base: b.base.slice() };
  if (typeof cliPrint === 'function')
    cliPrint('Editing ' + ins.name + ' — REFCLOSE to save, or Escape to abandon it.');
  return ids.length;
}
/** Strip what addEnt stamps on a live entity but a block definition has no
    use for. Without this a definition gains color/lw/lt nulls and a storey on
    every edit — harmless one at a time, and a definition that grows keys for
    ever. A block's contents belong to the insert's storey, not their own. */
function refClean(n) {
  for (const k of ['color', 'lw', 'lt']) if (n[k] == null) delete n[k];
  delete n.lvl;
  return n;
}
/** collect what is on screen back into the definition */
function refeditSave() {
  if (!REFEDIT) return false;
  const R = REFEDIT;
  const b = (DOC.blocks || {})[R.name];
  if (!b) { REFEDIT = null; return false; }
  const { inv } = refPlacement(R.ins, { base: R.base });
  const ents = [];
  begin();
  /* whatever carries the mark now, so objects DRAWN during the edit are part
     of the block as well — which is the point of editing it in place */
  for (const e of [...DOC.ents.values()]) {
    if (e.__ref !== R.name) continue;
    const n = clone(e);
    delete n.id; delete n.__ref;
    xf(n, inv);
    delete n.id;
    ents.push(refClean(n));
  }
  b.ents = ents;
  for (const id of [...DOC.ents.values()].filter(e => e.__ref === R.name).map(e => e.id))
    eraseEnt(id);
  const back = addEnt(clone(R.ins));
  delete back.__ref;
  commit('Save block ' + R.name);
  REFEDIT = null;
  if (typeof shapeCacheClear === 'function') shapeCacheClear();
  if (typeof syncUI === 'function') syncUI();
  return back;
}
function refeditCancel() {
  if (!REFEDIT) return false;
  const R = REFEDIT;
  begin();
  for (const id of [...DOC.ents.values()].filter(e => e.__ref === R.name).map(e => e.id))
    eraseEnt(id);
  addEnt(clone(R.ins));
  commit('Abandon block edit');
  REFEDIT = null;
  if (typeof shapeCacheClear === 'function') shapeCacheClear();
  if (typeof syncUI === 'function') syncUI();
  return true;
}
/* ------------------------------------------------------------
   Visibility states — one block being several things.

   A door in four swings used to be four blocks with four names, and nothing
   tying them together. A state is a name; an object inside the block either
   belongs to the block itself, and is always drawn, or belongs to a list of
   states and is drawn only in those.

   States are assigned during a reference edit, because that is the one moment
   the contents of a block are objects you can select.
   ------------------------------------------------------------ */
function blockStates(name) {
  const b = (DOC.blocks || {})[name];
  return (b && Array.isArray(b.states)) ? b.states : [];
}
/** Put the current selection into `state`, creating the state if it is new.
    Only reachable while a reference edit is open. */
function blockStateAssign(state) {
  const nm = String(state || '').trim();
  if (!nm) return false;
  if (!REFEDIT) {
    if (typeof echo === 'function') echo('Open the block with REFEDIT first');
    return false;
  }
  const b = (DOC.blocks || {})[REFEDIT.name];
  if (!b) return false;
  const picked = selEnts().filter(e => e.__ref === REFEDIT.name);
  if (!picked.length) {
    if (typeof echo === 'function') echo('Select what belongs to that state');
    return false;
  }
  begin();
  if (!Array.isArray(b.states)) b.states = [];
  if (b.states.indexOf(nm) < 0) b.states.push(nm);
  for (const e of picked) {
    mut(e);
    const v = Array.isArray(e.vis) ? e.vis.slice() : [];
    if (v.indexOf(nm) < 0) v.push(nm);
    e.vis = v;
  }
  commit('Visibility state');
  if (typeof shapeCacheClear === 'function') shapeCacheClear();
  return true;
}
defc('bvstate', {
  key: 'bvstate', group: 'modify',
  hint: 'Name the state the selected objects belong to',
  init(c) {
    if (!REFEDIT) { echo('Open the block with REFEDIT first'); return endCmd(); }
    if (!SEL.size) { echo('Select what belongs to the state, then run BVSTATE'); return endCmd(); }
    hint('Name of the visibility state:');
  },
  text(c, s) {
    if (blockStateAssign(s)) {
      cliPrint(SEL.size + ' object' + (SEL.size === 1 ? '' : 's') + ' put in state "' + s.trim() + '".');
      draw();
    }
    endCmd();
    return true;
  },
});

defc('refedit', {
  key: 'refedit', group: 'modify',
  hint: 'Select the block reference to edit',
  point(c, p) {
    const ins = pickAt(p, 10, x => x.t === 'insert');
    if (!ins) return echo('Pick a block reference');
    if (!refeditOpen(ins)) return;
    draw(); endCmd();
  },
});
defc('refclose', {
  key: 'refclose', group: 'modify',
  hint: 'Save the block being edited',
  init() {
    if (!REFEDIT) { echo('Nothing is being edited'); return endCmd(); }
    const n = REFEDIT.name;
    refeditSave();
    cliPrint('Saved ' + n + ' — every reference to it is updated.');
    draw(); endCmd();
  },
});

defc('attdef', {
  key: 'attdef', group: 'annotate',
  hint: 'Pick where the attribute sits',
  point(c, p) {
    modal('<h3>Define an attribute</h3>' +
      '<div class="row"><label>Tag</label><input class="f" id="atg" value="TAG"></div>' +
      '<div class="row"><label>Prompt</label><input class="f" id="apr" value=""></div>' +
      '<div class="row"><label>Default</label><input class="f" id="ade" value=""></div>' +
      '<div class="row"><label>Height</label><input class="f" id="ahh" value="' +
        (+(DOC.textH / U[DOC.units]).toFixed(4)) + '"></div>' +
      '<div class="row"><label>Visible</label><select class="f" id="avi">' +
        '<option value="1">shown on the drawing</option>' +
        '<option value="0">hidden — data only</option></select></div>', () => {
      const tag = ($('#atg').value || 'TAG').trim().toUpperCase().replace(/\s+/g, '_');
      begin();
      addEnt({ t: 'attdef', p: p.slice(), tag,
               prompt: $('#apr').value, val: $('#ade').value,
               h: parseLen($('#ahh').value) || DOC.textH,
               hidden: $('#avi').value === '0',
               rot: 0, anchor: 'l', layer: annoLayer('TEXT') });
      commit('Attribute ' + tag);
      cliPrint('Attribute ' + tag + ' defined — include it in a block to use it');
      endCmd();
    });
  },
});

/** EATTEDIT — edit the attribute values carried by one insert */
defc('eattedit', {
  key: 'eattedit', group: 'annotate', hint: 'Pick a block to edit its attributes',
  point(c, p) {
    const ins = pickAt(p, 10, e => e.t === 'insert');
    if (!ins) return echo('Pick a block insert');
    const defs = blockAttdefs(ins.name);
    if (!defs.length) return echo('That block has no attributes');
    const rows = defs.map((d, i) =>
      '<div class="row"><label>' + esc(d.prompt || d.tag) + '</label>' +
      '<input class="f" id="av' + i + '" value="' + esc(attValue(ins, d)) + '"></div>').join('');
    modal('<h3>' + esc(ins.name) + '</h3>' + rows, () => {
      const vals = {};
      defs.forEach((d, i) => { vals[d.tag] = $('#av' + i).value; });
      setAttValues(ins, vals);
    });
  },
});

/** Write attribute values onto ONE insert. Kept out of the dialog because a
    block's data should not depend on whether a modal rendered — and because
    the values belong to the insert, never to the definition: editing the door
    number on one door must not renumber the other thirty-nine. */
function setAttValues(ins, vals) {
  if (!ins || !vals) return false;
  begin(); mut(ins);
  ins.att = Object.assign({}, ins.att);
  for (const k of Object.keys(vals)) ins.att[k] = vals[k];
  commit('Attributes');
  if (typeof draw === 'function') draw();
  return true;
}

/* ============================================================
   Levels
   ------------------------------------------------------------
   A plan is a drawing of one storey. The model has always had
   levels and walls have always mitred only against walls on
   their own, but there was no way to change which one you were
   drawing on — so the second storey was unreachable.
   ============================================================ */
function levelRec(id) { return (DOC.levels || []).find(l => l.id === id) || null; }
function curLevelRec() { return levelRec(DOC.curLevel || 0) || (DOC.levels || [])[0]; }
/** every level, lowest first — the order a section reads in */
function levelsSorted() { return (DOC.levels || []).slice().sort((a, b) => a.elev - b.elev); }
function gotoLevel(id) {
  const l = levelRec(id);
  if (!l) return false;
  DOC.curLevel = l.id;
  cliPrint('Drawing on ' + l.name + ' at ' + fmt(l.elev));
  if (typeof syncUI === 'function') syncUI();
  if (typeof buildLevels === 'function') buildLevels();
  draw();
  return true;
}
/** Add a storey above the top one, spaced by its floor-to-floor height. The
    id is the next free integer, never a reused one: entities remember their
    level by id, and reusing an id would silently move them. */
function addLevel(name, elev, h) {
  const ls = DOC.levels || (DOC.levels = []);
  const top = levelsSorted()[ls.length - 1];
  /* A monotonic counter, never max(existing)+1. Entities remember their level
     by id: delete a level and derive the next id from what is left, and the
     next level created takes the dead one's number — quietly adopting every
     entity that still referenced it. */
  const seen = ls.reduce((n, l) => Math.max(n, l.id), -1) + 1;
  DOC.levelUid = Math.max(DOC.levelUid || 0, seen);
  const id = DOC.levelUid++;
  const rec = {
    id,
    name: name || ('Level ' + id),
    elev: elev != null ? elev : (top ? top.elev + (top.h || 3000) : 0),
    h: h || (top && top.h) || 3000,
  };
  ls.push(rec);
  return rec;
}
defc('level', {
  key: 'level', group: 'view',
  hint: '<em>N</em>ew · <em>S</em>et current · <em>R</em>ename · <em>E</em>levation · <em>?</em> list',
  init(c) { c.data = {}; },
  text(c, s) {
    const raw = String(s).trim(), k = raw.toLowerCase(), d = c.data;
    if (d.await === 'new') {
      begin(); const rec = addLevel(raw); commit('New level');
      gotoLevel(rec.id);
      return true;
    }
    if (d.await === 'set') {
      const hit = (DOC.levels || []).find(l => String(l.name).toLowerCase() === k);
      if (!hit) { cliPrint('No level called "' + raw + '".', 'err'); return true; }
      gotoLevel(hit.id); return true;
    }
    if (d.await === 'rename') {
      const l = curLevelRec(); if (!l) return true;
      begin(); l.name = raw || l.name; commit('Rename level');
      if (typeof buildLevels === 'function') buildLevels();
      return true;
    }
    if (d.await === 'elev') {
      const v = parseLen(raw);
      if (isNaN(v)) { cliPrint('Type an elevation.', 'err'); return true; }
      const l = curLevelRec(); if (!l) return true;
      begin(); l.elev = v; commit('Level elevation');
      cliPrint(l.name + ' is now at ' + fmt(v));
      if (typeof buildLevels === 'function') buildLevels();
      draw();
      return true;
    }
    if (k === 'n' || k === 'new') { d.await = 'new'; hint('Name for the new level:'); return true; }
    if (k === 's' || k === 'set') { d.await = 'set'; hint('Level to draw on:'); return true; }
    if (k === 'r' || k === 'rename') { d.await = 'rename'; hint('New name for this level:'); return true; }
    if (k === 'e' || k === 'elevation') { d.await = 'elev'; hint('Elevation for this level:'); return true; }
    if (k === '?' || k === 'list') {
      cliPrint(levelsSorted().map(l =>
        (l.id === (DOC.curLevel || 0) ? '* ' : '  ') + l.name + '  ' + fmt(l.elev)).join('\n'));
      return true;
    }
    return false;
  },
});
defm('LEVELUP', () => {
  const ls = levelsSorted();
  const i = ls.findIndex(l => l.id === (DOC.curLevel || 0));
  if (i < 0 || i >= ls.length - 1) return echo('Already on the top level');
  gotoLevel(ls[i + 1].id);
}, { group: 'view' });
defm('LEVELDOWN', () => {
  const ls = levelsSorted();
  const i = ls.findIndex(l => l.id === (DOC.curLevel || 0));
  if (i <= 0) return echo('Already on the bottom level');
  gotoLevel(ls[i - 1].id);
}, { group: 'view' });

/* ============================================================
   Tables, and the room schedule
   ------------------------------------------------------------
   A schedule is not a picture of a table — it is the drawing
   telling you what it contains. Rooms already know their names
   and areas; a schedule reads them, so it cannot disagree with
   the plan it came from. Rebuild it after moving a wall and the
   number changes, because it was never a copy.
   ============================================================ */
/* ------------------------------------------------------------
   A schedule you can order from.

   A table could be placed in the drawing and read. Getting the numbers into
   an order or a cost plan meant retyping them, which is how a schedule and a
   building stop agreeing with each other.

   RFC 4180 quoting, and only where it is needed: a cell is wrapped only if it
   contains a comma, a quote or a line break. An unquoted comma moves every
   column after it one to the left, which is the quiet way a schedule becomes
   wrong without looking wrong.
   ------------------------------------------------------------ */
function csvCell(v) {
  const s = v == null ? '' : String(v);
  if (!/[",\r\n]/.test(s)) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}
function tableCSV(tb) {
  const rows = (tb && tb.rows) || [];
  if (!rows.length) return '';
  return rows.map(r => (r || []).map(csvCell).join(',')).join('\r\n');
}
/** what to call the file: the kind of schedule it is, not "table" */
function tableFileName(tb) {
  const k = (tb && tb.kind) || 'table';
  const base = String(k).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return (DOC.name ? DOC.name.replace(/\.[^.]*$/, '') + '-' : '') + base + '.csv';
}
defc('tableexport', {
  key: 'tableexport', group: 'arch',
  hint: 'Select a schedule, then <em>Enter</em> to write it out as CSV',
  init(c) {
    const tables = selEnts().filter(e => e.t === 'table');
    if (!tables.length) {
      echo(SEL.size ? 'That is not a schedule' : 'Select a schedule first');
      c.done = true; return;
    }
    let n = 0;
    for (const tb of tables) {
      const csv = tableCSV(tb);
      if (!csv) { echo('That schedule is empty'); continue; }
      download(tableFileName(tb), csv, 'text/csv;charset=utf-8');
      n++;
    }
    if (n) cliPrint('Wrote ' + n + (n === 1 ? ' schedule' : ' schedules') + ' as CSV.');
    c.done = true;
  },
  enter() { endCmd(); },
});

GEOM.table = {
  shapes(tb) {
    const rows = tb.rows || [];
    if (!rows.length) return [];
    const h = tb.h || DOC.textH || 2.5;
    const rh = h * 1.9;                       /* row height, with air */
    const cols = tb.colW || [];
    const total = cols.reduce((n, w) => n + w, 0);
    const out = [];
    const x0 = tb.p[0], yTop = tb.p[1];
    /* the grid: one horizontal per row boundary, one vertical per column */
    for (let i = 0; i <= rows.length; i++) {
      const y = yTop - i * rh;
      out.push({ pts: [[x0, y], [x0 + total, y]], role: i === 0 || i === 1 ? 'face' : 'jamb' });
    }
    let cx = x0;
    for (let c = 0; c <= cols.length; c++) {
      out.push({ pts: [[cx, yTop], [cx, yTop - rows.length * rh]], role: 'jamb' });
      cx += cols[c] || 0;
    }
    /* the text, one shape per cell, inset from its own column */
    rows.forEach((row, i) => {
      let x = x0;
      row.forEach((cell, c) => {
        const w = cols[c] || 0;
        const right = tb.align && tb.align[c] === 'r';
        out.push({
          text: String(cell == null ? '' : cell),
          p: [right ? x + w - h * 0.5 : x + h * 0.5, yTop - (i + 1) * rh + rh * 0.55],
          h, rot: 0, anchor: right ? 'r' : 'l',
        });
        x += w;
      });
    });
    return out;
  },
  bbox(tb) {
    const rows = tb.rows || [];
    const rh = (tb.h || DOC.textH || 2.5) * 1.9;
    const total = (tb.colW || []).reduce((n, w) => n + w, 0);
    return [tb.p[0], tb.p[1] - rows.length * rh, tb.p[0] + total, tb.p[1]];
  },
  dist(p, tb) {
    const b = GEOM.table.bbox(tb);
    if (p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]) return 0;
    return Math.hypot(Math.max(b[0] - p[0], 0, p[0] - b[2]),
                      Math.max(b[1] - p[1], 0, p[1] - b[3]));
  },
  grips: tb => [{ p: tb.p, k: 'p' }],
  grip(tb, k, p) { tb.p = p; },
  xf(tb, fn) {
    const p2 = fn(tb.p), q = fn(add(tb.p, [1, 0]));
    const k = dist(p2, q);
    tb.p = p2;
    tb.h = (tb.h || DOC.textH || 2.5) * k;
    tb.colW = (tb.colW || []).map(w => w * k);
  },
};

/** every room on a level, in the order they read on the drawing: up the page,
    then across, which is how anyone numbers a plan */
function roomsOnLevel(lvl) {
  const l = lvl == null ? (DOC.curLevel || 0) : lvl;
  return [...DOC.ents.values()]
    .filter(e => e.t === 'room' && (e.lvl || 0) === l)
    .sort((a, b) => {
      const ba = bbox(a), bb = bbox(b);
      const dy = (bb[3] - ba[3]);
      return Math.abs(dy) > 1e-6 ? dy : ba[0] - bb[0];
    });
}
/** the rows of a room schedule, read from the rooms themselves */
function roomScheduleRows(lvl) {
  const rows = [['No.', 'Room', 'Area']];
  let n = 0;
  for (const r of roomsOnLevel(lvl)) {
    n++;
    /* the area comes from the room's own boundary, the same one it draws and
       labels with — so the schedule cannot disagree with the plan */
    const a = Math.abs(polyArea(roomBoundary(r) || r.pts || []));
    rows.push([r.num || String(n).padStart(2, '0'),
               r.name || 'ROOM',
               roomAreaText(r, a)]);
  }
  return rows;
}
/** column widths that fit the widest cell in each column */
function fitColumns(rows, h) {
  const n = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const w = [];
  for (let c = 0; c < n; c++) {
    let widest = 0;
    for (const r of rows) widest = Math.max(widest, String(r[c] == null ? '' : r[c]).length);
    w.push((widest + 2) * h * MT_CHAR);
  }
  return w;
}
defc('schedule', {
  key: 'schedule', group: 'annotate',
  hint: 'Pick the top-left corner of the schedule',
  init(c) {
    if (!roomsOnLevel().length) { cliPrint('No rooms on this level to schedule.', 'err'); endCmd(true); }
  },
  point(c, p) {
    const rows = roomScheduleRows();
    const h = DOC.textH || 2.5;
    begin();
    addEnt({ t: 'table', p: p.slice(), rows, colW: fitColumns(rows, h), h,
             align: ['l', 'l', 'r'], kind: 'rooms', layer: annoLayer('TEXT') });
    commit('Room schedule');
    cliPrint((rows.length - 1) + ' rooms scheduled');
    endCmd();
  },
});
/** Re-read a schedule from the drawing. It is not a copy, so this is the whole
    of "keeping it up to date" — move a wall, run it again, the number changes. */
defm('SCHEDULEUPDATE', () => {
  const tabs = [...DOC.ents.values()].filter(e => e.t === 'table' && e.kind === 'rooms');
  if (!tabs.length) return echo('No room schedule in this drawing');
  begin();
  for (const tb of tabs) {
    mut(tb);
    tb.rows = roomScheduleRows(tb.lvl);
    tb.colW = fitColumns(tb.rows, tb.h || DOC.textH);
  }
  commit('Update schedule');
  cliPrint('Updated ' + tabs.length + ' schedule' + (tabs.length === 1 ? '' : 's'));
  draw();
}, { group: 'annotate' });

/* ============================================================
   The system variables the newer features answer to
   ------------------------------------------------------------
   All four of these were read by the code and settable by
   nobody: they lived in VS and were never registered, so typing
   their names did nothing. UNDERLAY was the worst of it — the
   storey-below view was built, drawn and tested, and there was
   no way for a person to switch it on.
   ============================================================ */
defvar('MIRRTEXT', {
  desc: 'Mirroring text: 0 keeps it readable, 1 mirrors it too',
  get: () => VS.mirrtext ? 1 : 0,
  set(v) { VS.mirrtext = v ? 1 : 0; draw(); },
});
defvar('TRIMMODE', {
  desc: 'Fillet and chamfer trim the objects: 1 yes, 0 leave them uncut',
  get: () => VS.trimmode ? 1 : 0,
  set(v) { VS.trimmode = v ? 1 : 0; },
});
defvar('UNDERLAY', {
  desc: 'Show the storey below the current one, faintly',
  get: () => VS.underlay ? 1 : 0,
  set(v) { VS.underlay = v ? 1 : 0; draw(); },
});
defvar('TAGS', {
  desc: 'Draw door and window marks on the plan',
  get: () => VS.tags ? 1 : 0,
  set(v) { VS.tags = v ? 1 : 0; draw(); },
});
defvar('CANNOSCALE', {
  desc: 'Annotation scale for model space, as a ratio (0.01 is 1:100)',
  type: 'real',
  get: () => annoScale(),
  set(v) {
    const n = parseFloat(v);
    /* a scale of zero divides every annotative height by nothing; refuse it
       rather than filling the drawing with infinities */
    if (!(isFinite(n) && n > 0)) { echo('That is not a scale'); return; }
    DOC.annoScale = n;
    if (typeof shapeCacheClear === 'function') shapeCacheClear();
    draw();
  },
});
defvar('CONTRAST', {
  desc: 'High-contrast palette: 1 on, 0 the default drawing colours',
  get: () => VS.contrast ? 1 : 0,
  set(v) { setContrast(!!v); },
});
defc('contrast', {
  key: 'contrast', group: 'view',
  hint: 'Toggle the high-contrast palette',
  init() {
    const on = setContrast(!VS.contrast);
    cliPrint('High contrast ' + (on ? 'on' : 'off') + '.');
    endCmd();
  },
});

/** TABLE — the command the rail was already offering. B4 built the table
    ENTITY and never gave it a way in, so the button pointed at nothing. */
defc('table', {
  key: 'table', group: 'annotate',
  hint: 'Pick the top-left corner of the table',
  point(c, p) {
    modal('<h3>Table</h3>' +
      '<div class="row"><label>Columns</label><input class="f" id="tbc" value="3"></div>' +
      '<div class="row"><label>Rows</label><input class="f" id="tbr" value="4"></div>' +
      '<div class="row"><label>Text height</label><input class="f" id="tbh" value="' +
        (+(DOC.textH / U[DOC.units]).toFixed(4)) + '"></div>', () => {
      const cols = clamp(parseInt($('#tbc').value, 10) || 3, 1, 40);
      const rows = clamp(parseInt($('#tbr').value, 10) || 4, 1, 200);
      const h = parseLen($('#tbh').value) || DOC.textH;
      /* an empty grid to type into, with the first row read as a heading */
      const data = [];
      for (let r = 0; r < rows; r++) {
        const row = [];
        for (let cc = 0; cc < cols; cc++) row.push(r === 0 ? 'Heading ' + (cc + 1) : '');
        data.push(row);
      }
      begin();
      addEnt({ t: 'table', p: p.slice(), rows: data, h,
               colW: fitColumns(data, h), layer: annoLayer('TEXT') });
      commit('Table');
      draw(); endCmd();
    });
  },
});

defvar('EDGEMODE', {
  desc: 'Trim and extend treat boundaries as extended: 1 yes, 0 only real crossings',
  get: () => VS.edgemode ? 1 : 0,
  set(v) { VS.edgemode = v ? 1 : 0; },
});

/* ============================================================
   LAYDEL and LAYMRG
   ------------------------------------------------------------
   Deleting a layer is not the same as hiding one, and there was
   no way to do either permanently. LAYMRG is the one that keeps
   a drawing tidy: a layer that arrived from a consultant's file
   under a name you do not use is merged into yours, taking its
   objects with it, and then it is gone.
   ============================================================ */
/** the objects on a layer, and whether it can be got rid of at all */
function layerContents(name) {
  return [...DOC.ents.values()].filter(e => e.layer === name);
}
function layerRemovable(name) {
  if (name === '0') return 'Layer 0 cannot be deleted';
  if (name === DOC.cur) return 'That is the current layer';
  if (!hasLayer(name)) return 'No layer called "' + name + '"';
  return null;
}
defc('laydel', {
  key: 'laydel', group: 'view',
  hint: 'Layer to delete, with everything on it',
  init(c) { c.data = {}; },
  text(c, s) {
    const raw = String(s).trim();
    const why = layerRemovable(raw);
    if (why) { cliPrint(why + '.', 'err'); return true; }
    const n = layerContents(raw).length;
    begin();
    for (const e of layerContents(raw)) eraseEnt(e.id);
    touchLayers();
    DOC.layers = DOC.layers.filter(l => l.name !== raw);
    commit('Delete layer ' + raw);
    cliPrint('Deleted ' + raw + ' and ' + n + ' object' + (n === 1 ? '' : 's'));
    syncUI(); draw();
    return true;
  },
});
defc('laymrg', {
  key: 'laymrg', group: 'view',
  hint: 'Layer to merge FROM',
  init(c) { c.data = {}; },
  text(c, s) {
    const raw = String(s).trim(), d = c.data;
    if (!d.from) {
      const why = layerRemovable(raw);
      if (why) { cliPrint(why + '.', 'err'); return true; }
      d.from = layer(raw).name;
      hint('Layer to merge INTO:');
      return true;
    }
    if (!hasLayer(raw)) { cliPrint('No layer called "' + raw + '".', 'err'); return true; }
    const to = layer(raw).name;
    if (to === d.from) { cliPrint('That is the same layer.', 'err'); return true; }
    const moving = layerContents(d.from);
    begin();
    /* the objects move BEFORE the layer goes, or they would be orphaned onto a
       name that no longer exists and quietly fall back to layer 0 */
    for (const e of moving) { mut(e); e.layer = to; }
    touchLayers();
    DOC.layers = DOC.layers.filter(l => l.name !== d.from);
    commit('Merge ' + d.from + ' into ' + to);
    cliPrint(moving.length + ' object' + (moving.length === 1 ? '' : 's') +
             ' moved from ' + d.from + ' to ' + to + ', and ' + d.from + ' removed');
    syncUI(); draw();
    return true;
  },
});

/** STYLE / TEXTSTYLE — make and choose named text styles, the same three-step
    resolution the dimension styles use. */
defc('style', {
  key: 'style', group: 'annotate',
  hint: '<em>S</em>ave · <em>R</em>estore · <em>A</em>pply · <em>F</em>ont · <em>W</em>idth · <em>O</em>blique · <em>?</em> list',
  init(c) { c.data = {}; },
  text(c, s) {
    const raw = String(s).trim(), k = raw.toLowerCase(), d = c.data;
    if (d.await === 'save') {
      const cur = curTextStyleRec() || {};
      const rec = Object.assign({}, cur, { name: raw });
      const list = textStyles();
      const at = list.findIndex(x => String(x.name).toLowerCase() === k);
      begin();
      if (at >= 0) list[at] = rec; else list.push(rec);
      DOC.curTextStyle = raw;
      commit('Text style');
      cliPrint('Text style "' + raw + '" saved and made current');
      draw(); return true;
    }
    if (d.await === 'set') {
      const rec = textStyleRec(raw);
      if (!rec) { cliPrint('No text style called "' + raw + '".', 'err'); return true; }
      begin(); DOC.curTextStyle = rec.name; commit('Current text style');
      cliPrint('Current text style is ' + rec.name);
      draw(); return true;
    }
    if (d.await === 'apply') {
      const rec = textStyleRec(raw);
      if (!rec) { cliPrint('No text style called "' + raw + '".', 'err'); return true; }
      const txt = selEnts().filter(e => e.t === 'text' || e.t === 'mtext');
      if (!txt.length) { cliPrint('Select some text first.', 'err'); return true; }
      begin();
      for (const e of txt) { mut(e); e.style = rec.name; }
      commit('Text style');
      cliPrint(txt.length + ' set to ' + rec.name);
      draw(); return true;
    }
    if (d.await === 'font') {
      const cur = curTextStyleRec();
      begin(); cur.font = raw || cur.font; commit('Text style font');
      cliPrint(cur.name + ' now uses ' + cur.font);
      draw(); return true;
    }
    if (d.await === 'width') {
      const v = parseFloat(raw);
      if (!(v > 0)) { cliPrint('A width factor is a positive number.', 'err'); return true; }
      const cur = curTextStyleRec();
      begin(); cur.wf = v; commit('Text style width');
      cliPrint(cur.name + ' width factor ' + v);
      draw(); return true;
    }
    if (d.await === 'oblique') {
      const v = parseFloat(raw);
      if (isNaN(v) || Math.abs(v) >= 85) { cliPrint('An oblique angle between -85 and 85.', 'err'); return true; }
      const cur = curTextStyleRec();
      begin(); cur.oblique = v; commit('Text style oblique');
      cliPrint(cur.name + ' oblique ' + v + '°');
      draw(); return true;
    }
    if (k === 's' || k === 'save') { d.await = 'save'; hint('Name for this text style:'); return true; }
    if (k === 'r' || k === 'restore') { d.await = 'set'; hint('Style to make current:'); return true; }
    if (k === 'a' || k === 'apply') { d.await = 'apply'; hint('Style to apply to the selection:'); return true; }
    if (k === 'f' || k === 'font') { d.await = 'font'; hint('Font name:'); return true; }
    if (k === 'w' || k === 'width') { d.await = 'width'; hint('Width factor:'); return true; }
    if (k === 'o' || k === 'oblique') { d.await = 'oblique'; hint('Oblique angle, degrees:'); return true; }
    if (k === '?' || k === 'list') {
      cliPrint(textStyles().map(x =>
        (x.name === (curTextStyleRec() || {}).name ? '* ' : '  ') + x.name +
        '  ' + (x.font || 'Inter') + (x.wf && x.wf !== 1 ? '  x' + x.wf : '') +
        (x.oblique ? '  ' + x.oblique + '°' : '')).join('\n'));
      return true;
    }
    return false;
  },
});
