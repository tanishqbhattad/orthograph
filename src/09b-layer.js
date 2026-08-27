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
