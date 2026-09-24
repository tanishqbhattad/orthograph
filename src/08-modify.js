/* ============================================================
   ORTHOGRAPH — 08 modify, inquiry, blocks
   ============================================================ */

/** delete honouring hosted openings */
function eraseEnt(id) {
  const e = DOC.ents.get(id);
  if (e && e.t === 'wall') delWallCascade(id); else delEnt(id);
}

defc('move', {
  needSel: true, group: 'modify', hint: 'Base point · <em>D</em> displacement',
  init: c => { c.pts = []; c.disp = false; },
  /* Displacement is the version you want when you already know the vector
     rather than two points on the drawing: MOVE, D, 0,-1200. */
  text(c, s) {
    if (!c.pts.length && /^d$/i.test(String(s).trim())) {
      c.disp = true; hint('Displacement — type <em>dx,dy</em>'); return true;
    }
    return false;
  },
  point(c, p) {
    if (c.disp) {
      begin(); selEnts().forEach(e => xf(e, T.move(p))); commit('Move'); endCmd(); return;
    }
    c.pts.push(p);
    if (c.pts.length === 2) {
      const d = sub(c.pts[1], c.pts[0]);
      begin(); selEnts().forEach(e => xf(e, T.move(d))); commit('Move'); endCmd();
    } else hint('Second point or type <em>@dx,dy</em>');
  },
  preview(c, p) {
    if (c.pts.length !== 1) return null;
    const d = sub(p, c.pts[0]);
    ST.tracks = [[c.pts[0], p]];
    return selEnts().map(e => xf(clone(e), T.move(d)));
  },
});
defc('copy', {
  needSel: true, group: 'modify', hint: 'Base point · <em>D</em> displacement',
  init: c => { c.pts = []; c.disp = false; },
  text(c, s) {
    if (!c.pts.length && /^d$/i.test(String(s).trim())) {
      c.disp = true; c.src = selEnts().map(clone);
      hint('Displacement — type <em>dx,dy</em>'); return true;
    }
    return false;
  },
  point(c, p) {
    if (c.disp) {
      begin();
      (c.src || []).forEach(e => { const n = clone(e); delete n.id; addEnt(xf(n, T.move(p))); });
      commit('Copy'); endCmd(); return;
    }
    if (!c.pts.length) { c.pts.push(p); c.src = selEnts().map(clone); hint('Place a copy · repeats until <em>Enter</em>'); return; }
    const d = sub(p, c.pts[0]);
    begin(); c.src.forEach(e => { const n = clone(e); delete n.id; addEnt(xf(n, T.move(d))); }); commit('Copy');
  },
  preview(c, p) {
    if (!c.pts.length) return null;
    const d = sub(p, c.pts[0]);
    return (c.src || []).map(e => xf(clone(e), T.move(d)));
  },
});
defc('rotate', {
  needSel: true, group: 'modify', hint: 'Base point',
  init: c => { c.pts = []; c.refA = null; c.copy = false; },
  text(c, s) {
    /* Copy is offered before the base point too, which is how it is usually
       typed: ROTATE, C, then pick. */
    if (/^c$/i.test(s)) { c.copy = true; echo('Rotating a copy — the original stays'); return true; }
    if (c.pts.length !== 1) return false;
    if (/^r$/i.test(s)) { c.mode = 'ref'; hint('Reference angle — click two points or type it'); return true; }
    const v = parseFloat(s);
    if (isNaN(v)) return false;
    if (c.mode === 'ref' && c.refA === null) { c.refA = rad(v); hint('New angle'); return true; }
    const a = c.refA === null ? rad(v) : rad(v) - c.refA;
    applyRotate(c, a); return true;
  },
  point(c, p) {
    if (!c.pts.length) { c.pts.push(p); c.src = selEnts().map(clone);
      hint('Rotation angle · click or type degrees · <em>R</em> reference · <em>C</em> copy'); return; }
    if (c.mode === 'ref' && c.refA === null) { c.refA = ang(c.pts[0], p); hint('New angle'); return; }
    const a = ang(c.pts[0], p) - (c.refA || 0);
    applyRotate(c, a);
  },
  preview(c, p) {
    if (c.pts.length !== 1) return null;
    const a = ang(c.pts[0], p) - (c.refA || 0);
    ST.tracks = [[c.pts[0], p]];
    return (c.src || []).map(e => xf(clone(e), T.rot(c.pts[0], a)));
  },
});
defc('scale', {
  needSel: true, group: 'modify', hint: 'Base point',
  init: c => { c.pts = []; c.d0 = null; c.refL = null; c.copy = false; },
  text(c, s) {
    if (/^c$/i.test(s)) { c.copy = true; echo('Scaling a copy — the original stays'); return true; }
    if (c.pts.length !== 1) return false;
    if (/^r$/i.test(s)) { c.mode = 'ref'; hint('Reference length'); return true; }
    if (c.mode === 'ref' && c.refL === null) { const v = parseLen(s); if (isNaN(v) || v <= 0) return false; c.refL = v; hint('New length'); return true; }
    if (c.mode === 'ref') { const v = parseLen(s); if (isNaN(v) || v <= 0) return false;
      applyScale(c, v / c.refL); return true; }
    const v = parseFloat(s);
    if (isNaN(v) || v === 0) return false;
    applyScale(c, v); return true;
  },
  point(c, p) {
    if (!c.pts.length) {
      c.pts.push(p); c.src = selEnts().map(clone);
      c.d0 = Math.max(dist(p, ST.cur || p), 1e-9);
      hint('Scale factor · drag, type a number · <em>R</em> reference · <em>C</em> copy'); return;
    }
    if (c.mode === 'ref' && c.refL === null) { c.refL = Math.max(dist(c.pts[0], p), 1e-9); hint('New length'); return; }
    applyScale(c, scaleFactor(c, p));
  },
  preview(c, p) {
    if (c.pts.length !== 1) return null;
    const f = scaleFactor(c, p);
    return (c.src || []).map(e => xf(clone(e), T.scale(c.pts[0], f)));
  },
});
function scaleFactor(c, p) {
  if (c.mode === 'ref' && c.refL) return Math.max(dist(c.pts[0], p) / c.refL, 1e-9);
  if (!c.d0) c.d0 = Math.max(dist(c.pts[0], p), 1e-9);
  return Math.max(dist(c.pts[0], p) / c.d0, 1e-9);
}
function applyScale(c, f) { applyXf(c, T.scale(c.pts[0], f), 'Scale'); }
function applyRotate(c, a) { applyXf(c, T.rot(c.pts[0], a), 'Rotate'); }
/** Move the selection, or leave it where it is and transform a copy — which is
    what AutoCAD's Copy option on ROTATE and SCALE does. The new objects become
    the selection afterwards, because that is what you almost always want to
    act on next. */
function applyXf(c, fn, label) {
  begin();
  if (c.copy) {
    const made = [];
    for (const e of selEnts()) {
      const n = clone(e); delete n.id;
      made.push(addEnt(xf(n, fn)));
    }
    SEL.clear();
    for (const n of made) if (n && n.id != null) SEL.add(n.id);
    commit(label + ' copy');
  } else {
    selEnts().forEach(e => xf(e, fn));
    commit(label);
  }
  endCmd();
}
defc('mirror', {
  needSel: true, group: 'modify', hint: 'First point of the mirror line', init: c => { c.pts = []; c.keep = true; },
  text(c, s) { if (/^[dn]/i.test(s)) { c.keep = false; echo('Source will be deleted'); return true; } if (/^k/i.test(s)) { c.keep = true; echo('Source kept'); return true; } return false; },
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length === 1) { c.src = selEnts().map(clone); hint('Second point · <em>D</em> to delete the source'); return; }
    begin();
    c.src.forEach(e => { const n = clone(e); delete n.id; addEnt(xf(n, T.mirror(c.pts[0], p))); });
    if (!c.keep) selEnts().forEach(e => eraseEnt(e.id));
    commit('Mirror'); endCmd();
  },
  preview(c, p) {
    if (c.pts.length !== 1) return null;
    ST.tracks = [[c.pts[0], p]];
    return (c.src || []).map(e => xf(clone(e), T.mirror(c.pts[0], p)));
  },
});
defc('offset', {
  group: 'modify',
  hint: 'Offset distance · <em>T</em>hrough · <em>M</em>ultiple · <em>E</em>rase source · <em>L</em>ayer',
  init: c => { c.d = null; c.e = null; c.thru = false;
               c.multiple = false; c.erase = false; c.layerCur = false; },
  text(c, s) {
    const k = String(s).trim().toLowerCase();
    if (k === 't') { c.thru = true; c.d = 0; hint('Select the object to offset'); return true; }
    /* Multiple keeps offsetting from the object just made, which is how a run
       of parallel lines actually gets drawn. */
    if (k === 'm') { c.multiple = !c.multiple;
      echo(c.multiple ? 'Multiple: each offset continues from the last' : 'Multiple off'); return true; }
    if (k === 'e') { c.erase = !c.erase;
      echo(c.erase ? 'The source will be erased' : 'The source will be kept'); return true; }
    if (k === 'l') { c.layerCur = !c.layerCur;
      echo(c.layerCur ? 'Offsets go on the current layer' : 'Offsets keep the source layer'); return true; }
    if (c.d === null || c.thru === false) {
      const v = parseLen(s);
      if (!isNaN(v) && v > 0) { c.d = v; c.thru = false; hint('Select the object to offset'); return true; }
    }
    return false;
  },
  point(c, p) {
    if (c.d === null) { echo('Type a distance first'); return; }
    if (!c.e) {
      const e = pickAt(p, 10, x => !GEOM[x.t] && x.t !== 'dim' && x.t !== 'text');
      if (!e) return;
      c.e = e; SEL.clear(); SEL.add(e.id);
      hint(c.thru ? 'Through point' : 'Side to offset');
      return;
    }
    const d = c.thru ? entDist(p, c.e) : c.d;
    const n = offsetEnt(c.e, d, offsetSide(c.e, p));
    if (!n) { c.e = null; SEL.clear(); hint('Select the object to offset'); return; }
    begin();
    /* Layer: AutoCAD's OFFSETLAYER chooses between the source's layer and the
       current one. Everything else about appearance follows the source, since
       an offset is meant to be the same kind of line as what it came from. */
    const meta = c.layerCur
      ? { layer: DOC.cur, color: c.e.color, lt: c.e.lt, lw: c.e.lw }
      : { layer: c.e.layer, color: c.e.color, lt: c.e.lt, lw: c.e.lw };
    const made = addEnt(Object.assign(n, meta));
    const src = c.e;
    if (c.erase) { eraseEnt(src.id); }
    commit('Offset');
    SEL.clear();
    if (c.multiple && made) {
      /* continue from what was just made, so a second click steps out again */
      c.e = made; SEL.add(made.id);
      hint('Side to offset again · <em>Enter</em> to stop');
    } else {
      c.e = null;
      hint('Select the object to offset');
    }
  },
  enter(c) {
    /* Enter finishes a multiple run, or ends the command when idle */
    if (c.multiple && c.e) { c.e = null; SEL.clear(); hint('Select the object to offset'); return; }
    endCmd();
  },
  preview(c, p) {
    if (!c.e || c.d === null) return null;
    const d = c.thru ? entDist(p, c.e) : c.d;
    const n = offsetEnt(c.e, d, offsetSide(c.e, p));
    return n ? [Object.assign(n, { layer: c.layerCur ? DOC.cur : c.e.layer })] : null;
  },
  done() { SEL.clear(); },
});
/* ============================================================
   THE EDITING COMMANDS
   ------------------------------------------------------------
   TRIM, EXTEND, OFFSET, FILLET, CHAMFER, BREAK, BREAKATPOINT,
   JOIN, LENGTHEN, STRETCH and ALIGN, asking what AutoCAD 2025
   asks, in its order, with its keywords and its defaults. The
   geometry is the curve kernel in 03-solve; what lives here is
   the conversation — what each prompt accepts, what a keyword
   means where it is typed, and what one U takes back.

   Three rules hold for all of them:
     · a pick at a prompt that wants an OBJECT means the cursor,
       not wherever object snap pulled it (rawPick)
     · every operation inside a command can be taken back by the
       command's own Undo, one at a time, and the whole command is
       still ONE step for U afterwards
     · a piece of an object keeps everything the object had —
       layer, colour, linetype, lineweight, storey
   ============================================================ */
/** where a pick really lands: the cursor, not the snap it was pulled to */
function rawPick(p) {
  const r = ST.raw;
  if (r && ST.snap && ST.snap.p && dist(ST.snap.p, p) < 1e-9 && dist(r, p) < px(60)) return r.slice();
  return p;
}
/** Is the running command asking for an object rather than a point? The snap
    engine asks, so a pick prompt shows AutoCAD's pick box and no snap
    markers rather than offering endpoints nobody asked for. */
function cmdPicksObjects() {
  return !!(typeof CMD !== 'undefined' && CMD && CMD.phase === 'run' && CMD.def.objPick && CMD.def.objPick(CMD));
}
/** objects the editing commands can change */
function editable(e) { return !!e && pickable(e) && !GEOM[e.t] && !!curveOf(e); }
/* construction lines and rays have no extent the spatial index can hold, so
   the few there are listed separately — rebuilt only when the drawing moves */
const UNBOUNDED = { v: -1, list: [] };
function unboundedEnts() {
  if (UNBOUNDED.v !== DOCV) {
    UNBOUNDED.v = DOCV; UNBOUNDED.list = [];
    for (const e of DOC.ents.values()) if (e.t === 'xline' || e.t === 'ray') UNBOUNDED.list.push(e);
  }
  return UNBOUNDED.list;
}
/** the editable object under a pick, construction lines included */
function pickEditable(p, filter) {
  const f = x => editable(x) && (!filter || filter(x));
  let best = pickAt(p, 10, f);
  let bd = best ? entDist(p, best) : Infinity;
  const r = px(10 * (pickBoxPx() / 8));
  for (const x of unboundedEnts()) {
    if (!f(x)) continue;
    const q = crvNear(curveOf(x), p);
    if (q && q.d <= r && q.d < bd) { best = x; bd = q.d; }
  }
  return best;
}
/* ---- one operation inside a command, and taking it back ---- */
function opRun(c, label, fn) {
  if (!c.ops) c.ops = [];
  const seq = HIST.seq;
  begin();
  let out;
  try { out = fn(); } catch (err) { rollback(); throw err; }
  commit(label);
  if (HIST.seq !== seq) c.ops.push(seq);
  draw();
  return out;
}
function opUndo(c) {
  if (!c.ops || !c.ops.length) { cliPrint('Command has been completely undone.'); return false; }
  const seq = c.ops.pop();
  while (HIST.past.length && HIST.past[HIST.past.length - 1].seq > seq) undoOne(HIST.past, HIST.future, false);
  SEL.clear(); syncUI(); modRefresh(c);
  return true;
}
/** Redo the preview for where the cursor is NOW. The engine refreshes it on
    a mouse move; after an edit, the one on screen describes a drawing that
    no longer exists — the piece just trimmed, still drawn as about to go. */
function modRefresh(c) {
  if (typeof CMD === 'undefined' || CMD !== c) { draw(); return; }
  ST.preview = null;
  if (c.phase === 'run' && c.def.preview) {
    try { ST.preview = c.def.preview(c, ST.cur || [0, 0]) || null; } catch (err) { ST.preview = null; }
  }
  if (typeof syncDyn === 'function') syncDyn();
  draw();
}
/** Put `keep` in place of `e`. The first piece IS the object — same id, so
    anything that refers to it still does — and the rest are new. */
function replaceWith(e, keep) {
  if (!keep || !keep.length) { eraseEnt(e.id); return []; }
  const id = e.id;
  mut(e);
  for (const k of Object.keys(e)) if (k !== 'id') delete e[k];
  Object.assign(e, keep[0]); e.id = id;
  const made = [e];
  for (let i = 1; i < keep.length; i++) made.push(addEnt(keep[i]));
  return made;
}
/** A piece drawn as a screen-sized dash pattern in the preview colour. The
    linetype dashes are drawing units, which at a plan's zoom are too small to
    see; a trim preview has to read at any zoom. */
function dashPreview(ent, on, off) {
  const C = curveOf(ent);
  if (!C) return [];
  const L = crvLen(C);
  let a = px(on || 7), b = px(off || 5);
  const per = a + b;
  if (!(L > 0)) return [];
  if (L / per > 400) { const k = L / per / 400; a *= k; b *= k; }
  const out = [];
  for (let l = 0; l < L - 1e-12; l += a + b) {
    const q = crvSub(C, crvAtLen(C, l), crvAtLen(C, Math.min(L, l + a)));
    if (q) out.push(q);
  }
  if (!out.length) out.push(clone(ent));
  /* heavier than the line it lies on, so it reads over it rather than as it */
  for (const q of out) { q.lw = 0.6; q.lt = null; }
  return out;
}

/* ---------------- system variables of the editing commands ---------------- */
const MODSET = {
  offDist: -1,          /* OFFSETDIST: -1 is Through                    */
  offErase: false,      /* OFFSET Erase option                          */
  offLayerCur: false,   /* OFFSET Layer option: current, not source     */
  chamD2: null,         /* CHAMFERB, null = same as CHAMFERA            */
  chamL: 0,             /* CHAMFERC: chamfer length for the angle method */
  chamAng: 0,           /* CHAMFERD: angle for the angle method, radians */
  chamAngle: false,     /* CHAMMODE: 0 distance, 1 angle                */
  lenMode: 'de',        /* LENGTHEN's option, remembered between runs   */
  lenDelta: 0, lenPct: 100, lenTotal: 1000, lenAngle: false,
};
if (VS.trimextendmode == null) VS.trimextendmode = 1;
if (VS.offsetgaptype == null) VS.offsetgaptype = 0;
defvar('TRIMEXTENDMODE', {
  desc: 'TRIM and EXTEND: 1 Quick (every object is an edge), 0 Standard (pick the edges)',
  get: () => VS.trimextendmode ? 1 : 0, set(v) { VS.trimextendmode = v ? 1 : 0; },
});
defvar('OFFSETGAPTYPE', {
  desc: 'Closing the gaps of an offset polyline: 0 extend, 1 fillet, 2 chamfer',
  get: () => VS.offsetgaptype | 0, set(v) { v |= 0; VS.offsetgaptype = v === 1 || v === 2 ? v : 0; },
});
defvar('OFFSETDIST', {
  type: 'real', desc: 'Default offset distance; negative means Through',
  get: () => MODSET.offDist, set(v) { MODSET.offDist = v < 0 ? -1 : v; },
});
defvar('CHAMFERB', {
  type: 'real', desc: 'Second chamfer distance',
  get: () => MODSET.chamD2 == null ? (DOC.chamD || 0) : MODSET.chamD2, set(v) { MODSET.chamD2 = Math.max(0, v); },
});
defvar('CHAMFERC', {
  type: 'real', desc: 'Chamfer length for the angle method',
  get: () => MODSET.chamL, set(v) { MODSET.chamL = Math.max(0, v); },
});
defvar('CHAMFERD', {
  type: 'real', desc: 'Chamfer angle for the angle method, degrees',
  get: () => deg(MODSET.chamAng), set(v) { MODSET.chamAng = rad(clamp(v, 0, 90)); },
});
defvar('CHAMMODE', {
  desc: 'Chamfer method: 0 two distances, 1 a length and an angle',
  get: () => MODSET.chamAngle ? 1 : 0, set(v) { MODSET.chamAngle = !!v; },
});

/* ---- pointer state a command can read: is the button down, has it moved ----
   TRIM's freehand fence is a press-drag-release, and the engine hands a
   command its press (as a point) and its moves (as previews) but not its
   release. So this listens for itself, on the window, and tells the command. */
const MODPTR = { down: false, moved: false, x: 0, y: 0 };
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('pointerdown', ev => {
    MODPTR.down = ev.button === 0; MODPTR.moved = false; MODPTR.x = ev.clientX; MODPTR.y = ev.clientY;
  }, true);
  window.addEventListener('pointermove', ev => {
    if (MODPTR.down && Math.hypot(ev.clientX - MODPTR.x, ev.clientY - MODPTR.y) > 4) MODPTR.moved = true;
  }, true);
  window.addEventListener('pointerup', () => {
    const was = MODPTR.down;
    MODPTR.down = false;
    const c = typeof CMD !== 'undefined' ? CMD : null;
    if (was && c && c.phase === 'run' && c.def.release) {
      try { c.def.release(c, MODPTR.moved); } catch (err) { cmdFail(err, c.def.key); }
      draw();
    }
  });
}

/* ============================================================
   TRIM and EXTEND
   ------------------------------------------------------------
   Quick mode, AutoCAD's default since 2021: every object is a
   cutting edge (or boundary) without being asked for. Click a
   piece and it goes; press and drag a freehand path, or click two
   empty places, and every piece the path crosses goes; an object
   that nothing crosses is erased outright. Shift swaps the sense.
   As the cursor moves, the piece that a click would take is shown.

   Standard mode is the older conversation: choose the edges first
   (Enter takes them all), then pick. It keeps Fence, Crossing and
   Edge — where a boundary that stops short is treated as running on.
   ============================================================ */
const TRIM_WORD = { trim: 'Trim', extend: 'Extend' };
function trimPrompt(c) {
  const ext = c.ext;
  const q = c.quick;
  hint(ext
    ? 'Select object to extend or shift-select to trim or [' + (q ? 'Boundary edges/' : 'Fence/') +
      'Crossing/mOde/Project/' + (q ? '' : 'Edge/') + 'Undo]:'
    : 'Select object to trim or shift-select to extend or [' + (q ? 'cuTting edges/' : 'Fence/') +
      'Crossing/mOde/Project/' + (q ? '' : 'Edge/') + 'eRase/Undo]:');
}
function trimSettings(c) {
  cliPrint('Current settings: Projection=UCS, Edge=' + (VS.edgemode ? 'Extend' : 'None') +
           ', Mode=' + (c.quick ? 'Quick' : 'Standard'));
}
/** ask for the edges: the engine's own Select objects prompt, all of its grammar */
function trimAskEdges(c) {
  cliPrint(c.ext ? 'Select boundary edges ...' : 'Select cutting edges ...');
  c.phase = 'sel';
  SEL.clear();
  if (typeof selPromptReset === 'function') selPromptReset();
  c.back = cc => {
    cc.back = null;
    const ids = SEL.size ? [...SEL] : [...DOC.ents.values()].filter(x => visible(x) && edgeCurves(x).length).map(x => x.id);
    cc.edges = ids; cc.quick = false;
    SEL.clear();
    cliPrint(ids.length + ' found');
    cc.stage = 'pick'; trimPrompt(cc);
  };
  hint('Select objects or <select all>:');
}
/** the edges that can matter to `e` (whole drawing when `reach` or edge mode) */
function trimEdges(c, e, reach) {
  if (!c.ecache || c.ecache.v !== DOCV) c.ecache = { v: DOCV, m: new Map() };
  const cache = c.ecache.m;
  const out = [], seen = new Set([e.id]);
  const take = x => {
    if (!x || seen.has(x.id)) return;
    seen.add(x.id);
    if (!visible(x)) return;
    let K = cache.get(x.id);
    if (!K) { K = edgeCurves(x); cache.set(x.id, K); }
    for (const k of K) out.push(k);
  };
  if (c.edges) { for (const id of c.edges) take(DOC.ents.get(id)); return out; }
  const b = bbox(e);
  if (reach || trimEdgeOn(c) || e.t === 'xline' || e.t === 'ray') {
    for (const x of DOC.ents.values()) take(x);
    return out;
  }
  const m = 1e-6 + (b[2] - b[0] + b[3] - b[1]) * 1e-9;
  for (const x of query(b[0] - m, b[1] - m, b[2] + m, b[3] + m)) take(x);
  for (const x of unboundedEnts()) take(x);
  return out;
}
/** Edge mode is a Standard-mode setting, as it is in AutoCAD */
function trimEdgeOn(c) { return !c.quick && !!VS.edgemode; }
/** whether this click trims or extends */
function trimSense(c, shift) { return c.ext ? !shift : !!shift; }
/** what one pick would do: { ext, e, n } or { e, r } */
function trimPlanAt(c, p, shift) {
  const e = pickEditable(p);
  if (!e) return null;
  const doExt = trimSense(c, shift);
  if (doExt) return { ext: true, e, n: extendPick(e, p, trimEdges(c, e, true), trimEdgeOn(c)) };
  return { ext: false, e, r: trimPick(e, p, trimEdges(c, e), trimEdgeOn(c)) };
}
function trimDoPick(c, p, shift) {
  const P = trimPlanAt(c, p, shift);
  if (!P) return false;
  if (P.ext) {
    if (!P.n) { cliPrint('No edge in that direction.'); return true; }
    opRun(c, 'Extend', () => replaceWith(P.e, [P.n]));
    return true;
  }
  const r = P.r;
  if (r.stuck) { cliPrint(r.stuck + '.'); return true; }
  if (r.erase) {
    if (!c.quick) { cliPrint('Object does not intersect an edge.'); return true; }
    opRun(c, 'Trim', () => eraseEnt(P.e.id));
    return true;
  }
  opRun(c, 'Trim', () => replaceWith(P.e, r.keep));
  return true;
}
/** the objects a stroke or window could touch */
function strokeCands(pts) {
  const b = ptsBox(pts);
  const out = new Set();
  for (const e of query(b[0], b[1], b[2], b[3])) if (editable(e)) out.add(e);
  for (const e of unboundedEnts()) if (editable(e)) out.add(e);
  return [...out];
}
/** Plan a fence (open path) or window (closed ring) across the drawing. Every
    plan is made against the drawing as it stands, then applied together, so
    the order objects happen to be stored in never changes the answer. */
function trimStrokePlans(c, pts, ring, doExt) {
  const plans = [];
  if (!pts || pts.length < 2) return plans;
  const F = ring ? curveOf({ t: 'pline', pts, closed: true }) : curveOf({ t: 'pline', pts });
  if (!F) return plans;
  for (const e of strokeCands(pts)) {
    const C = curveOf(e);
    const hits = crvHits(C, F, null, null);
    const inside = ring && pointInPoly(crvPt(C, C.closed ? 0 : C.n / 2), pts);
    if (!hits.length && !inside) continue;
    if (doExt) {
      if (ring) continue;                          /* a window has no near end */
      const n = extendPick(e, hits[0].p, trimEdges(c, e, true), trimEdgeOn(c));
      if (n) plans.push({ e, keep: [n], gone: [] });
      continue;
    }
    const edges = trimEdges(c, e);
    const r = ring ? trimWindow(e, pts, edges, trimEdgeOn(c)) : trimFence(e, F, edges, trimEdgeOn(c));
    if (!r) continue;
    if (r.erase) { if (c.quick) plans.push({ e, keep: [], gone: [e] }); continue; }
    plans.push({ e, keep: r.keep, gone: r.gone || [] });
  }
  return plans;
}
function trimStroke(c, pts, ring, doExt) {
  const plans = trimStrokePlans(c, pts, ring, doExt);
  if (!plans.length) { cliPrint(ring ? 'Nothing crossed that window.' : 'The fence crossed nothing.'); return 0; }
  opRun(c, doExt ? 'Extend' : 'Trim', () => { for (const P of plans) replaceWith(P.e, P.keep); });
  echo((doExt ? 'Extended ' : 'Trimmed ') + plans.length + ' object' + (plans.length > 1 ? 's' : ''));
  return plans.length;
}
/** what a stroke would do, drawn: the path, and the pieces it would take */
function strokePreview(c, pts, ring, doExt) {
  const out = [];
  const path = ring ? pts.concat([pts[0]]) : pts;
  if (path.length >= 2) for (const q of dashPreview({ t: 'pline', pts: path, layer: DOC.cur }, 5, 4)) out.push(q);
  let plans = [];
  try { plans = trimStrokePlans(c, pts, ring, doExt); } catch (err) { plans = []; }
  for (const P of plans.slice(0, 300)) {
    if (doExt) { for (const k of P.keep) out.push(k); continue; }
    for (const g of P.gone) for (const q of dashPreview(g)) out.push(q);
  }
  return out;
}
function trimLike(ext) {
  const WORD = ext ? 'Extend' : 'Trim';
  return {
    group: 'modify',
    objPick: c => c.stage === 'pick',
    init(c) {
      if (c.back) { c.back(c); return; }             /* back from choosing edges */
      c.ext = ext; c.ops = []; c.edges = null; c.fence = null; c.corner = null; c.sub = null;
      c.stage = 'pick';
      c.quick = VS.trimextendmode !== 0;
      const pre = SEL.size ? [...SEL] : null;
      SEL.clear();
      trimSettings(c);
      if (!c.quick) {
        if (pre) { c.edges = pre; cliPrint(pre.length + ' found'); trimPrompt(c); }
        else trimAskEdges(c);
        return;
      }
      trimPrompt(c);
    },
    text(c, s) {
      const k = String(s).trim().toLowerCase();
      if (c.sub) return c.sub(k);
      if (c.stage === 'fence' && k === 'u') {
        c.fence.pts.pop();
        if (!c.fence.pts.length) { c.stage = 'pick'; trimPrompt(c); }
        return true;
      }
      if (k === 'u' || k === 'undo') { opUndo(c); return true; }
      if (k === 'c' || k === 'crossing') { c.stage = 'cross'; c.corner = null; hint('Specify first corner:'); return true; }
      if (k === 'f' || k === 'fence') { c.stage = 'fence'; c.fence = { pts: [], shift: false }; hint('Specify first fence point:'); return true; }
      if ((!ext && k === 't') || (ext && k === 'b')) { trimAskEdges(c); return true; }
      if (k === 'o' || k === 'mode') {
        hint('Enter a ' + (ext ? 'extend' : 'trim') + ' mode option [Quick/Standard] <' + (c.quick ? 'Quick' : 'Standard') + '>:');
        c.sub = a => {
          if (a === '') { c.sub = null; trimPrompt(c); return true; }
          if (a !== 'q' && a !== 's') return false;
          c.sub = null;
          VS.trimextendmode = a === 'q' ? 1 : 0;
          c.quick = a === 'q';
          if (c.quick) { c.edges = null; trimPrompt(c); } else trimAskEdges(c);
          return true;
        };
        return true;
      }
      if (k === 'p' || k === 'project') {
        hint('Enter a projection option [None/Ucs/View] <Ucs>:');
        c.sub = a => { if (a === '' || a === 'n' || a === 'u' || a === 'v') { c.sub = null; trimPrompt(c); return true; } return false; };
        return true;
      }
      if (k === 'e' || k === 'edge') {
        hint('Enter an implied edge extension mode [Extend/No extend] <' + (VS.edgemode ? 'Extend' : 'No extend') + '>:');
        c.sub = a => {
          if (a === 'e' || a === 'extend') VS.edgemode = 1;
          else if (a === 'n' || a === 'no extend') VS.edgemode = 0;
          else if (a !== '') return false;
          c.sub = null; trimPrompt(c); return true;
        };
        return true;
      }
      if (!ext && (k === 'r' || k === 'erase')) {
        cliPrint('Select objects to erase or <exit>:');
        c.phase = 'sel';
        SEL.clear();
        if (typeof selPromptReset === 'function') selPromptReset();
        c.back = cc => {
          cc.back = null;
          const ids = [...SEL];
          SEL.clear();
          if (ids.length) opRun(cc, 'Erase', () => { for (const id of ids) if (DOC.ents.get(id)) eraseEnt(id); });
          cc.stage = 'pick'; trimPrompt(cc);
        };
        hint('Select objects to erase or <exit>:');
        return true;
      }
      return false;
    },
    point(c, p0) { trimPoint(c, p0); modRefresh(c); },
    release(c) {
      if (c.stage !== 'qfence' || !c.fence || !c.fence.free) return;
      const f = c.fence;
      c.fence = null; c.stage = 'pick';
      if (f.pts.length >= 2) trimStroke(c, f.pts, false, trimSense(c, f.shift));
      trimPrompt(c);
      modRefresh(c);
    },
    enter(c) { trimEnter(c); if (CMD === c) modRefresh(c); },
    preview(c, p0) { return trimPreview(c, p0); },
    done() { SEL.clear(); },
  };
}
function trimPoint(c, p0) {
  const p = rawPick(p0);
  if (c.stage === 'cross') {
    if (!c.corner) { c.corner = p; hint('Specify opposite corner:'); return; }
    trimStroke(c, boxFence(c.corner, p), true, trimSense(c, ST.shift));
    c.corner = null; c.stage = 'pick'; trimPrompt(c); return;
  }
  if (c.stage === 'fence') { c.fence.pts.push(p); hint('Specify next fence point or [Undo]:'); return; }
  if (c.stage === 'qfence') {
    /* the second of two clicks in empty space: a straight fence */
    trimStroke(c, [c.fence.pts[0], p], false, trimSense(c, c.fence.shift));
    c.fence = null; c.stage = 'pick'; trimPrompt(c); return;
  }
  if (trimDoPick(c, p, ST.shift)) return;
  /* nothing under the pick */
  if (c.quick) {
    c.stage = 'qfence';
    c.fence = { pts: [p], shift: !!ST.shift, free: false };
    hint('Specify end point of the fence, or drag a freehand path:');
  } else {
    c.stage = 'cross'; c.corner = p; hint('Specify opposite corner:');
  }
}
function trimEnter(c) {
  if (c.sub) { c.sub(''); return; }
  if (c.stage === 'fence') {
    const pts = c.fence.pts;
    if (pts.length >= 2) trimStroke(c, pts, false, trimSense(c, false));
    c.fence = null; c.stage = 'pick'; trimPrompt(c); return;
  }
  if (c.stage === 'cross' || c.stage === 'qfence') { c.fence = null; c.corner = null; c.stage = 'pick'; trimPrompt(c); return; }
  endCmd();
}
function trimPreview(c, p0) {
  const p = rawPick(p0);
  ST.tracks = null;
  if (c.stage === 'qfence' && c.fence) {
    const f = c.fence;
    if (MODPTR.down && MODPTR.moved) {
      f.free = true;
      const last = f.pts[f.pts.length - 1];
      if (dist(last, p) > px(3)) f.pts.push(p);
    }
    return strokePreview(c, f.free ? f.pts : [f.pts[0], p], false, trimSense(c, f.shift));
  }
  if (c.stage === 'fence' && c.fence) return strokePreview(c, c.fence.pts.concat([p]), false, trimSense(c, false));
  if (c.stage === 'cross' && c.corner) return strokePreview(c, boxFence(c.corner, p), true, trimSense(c, ST.shift));
  if (c.stage !== 'pick') return null;
  let P = null;
  try { P = trimPlanAt(c, p, ST.shift); } catch (err) { P = null; }
  if (!P) return null;
  if (P.ext) return P.n ? [P.n] : null;
  const r = P.r;
  if (r.stuck) return null;
  if (r.erase) return c.quick ? dashPreview(P.e) : null;
  return r.gone ? dashPreview(r.gone) : null;
}
defc('trim', trimLike(false));
defc('extend', trimLike(true));
/** consecutive pairs of a point run, for drawing a path as it is built */
function pairs(pts) {
  const out = [];
  for (let i = 1; i < pts.length; i++) out.push([pts[i - 1], pts[i]]);
  return out;
}
/** the rectangle of a crossing window, as a ring */
function boxFence(p0, p1) {
  return [[p0[0], p0[1]], [p1[0], p0[1]], [p1[0], p1[1]], [p0[0], p1[1]]];
}
defc('lengthen', {
  group: 'modify', hint: 'Type <em>DE</em> delta, <em>T</em> total, <em>P</em> percent — then pick an object end',
  init: c => { c.mode = 'de'; c.val = null; },
  text(c, s) {
    let m = s.match(/^(de|t|p)\s*(.*)$/i);
    if (m) { c.mode = m[1].toLowerCase(); if (m[2]) { c.val = c.mode === 'p' ? parseFloat(m[2]) : parseLen(m[2]); } hint('Pick the end to change'); return true; }
    const v = c.mode === 'p' ? parseFloat(s) : parseLen(s);
    if (!isNaN(v)) { c.val = v; hint('Pick the end to change'); return true; }
    return false;
  },
  point(c, p) {
    if (c.val == null) return echo('Give a value first');
    const e = pickAt(p, 10, x => x.t === 'line' || x.t === 'arc'); if (!e) return;
    const opts = c.mode === 'de' ? { delta: c.val } : c.mode === 't' ? { total: c.val } : { pct: c.val };
    const n = lengthenTo(e, p, opts);
    if (!n) return echo('Cannot lengthen that');
    begin(); mut(e); Object.assign(e, n); commit('Lengthen');
  },
});
defc('fillet', {
  group: 'modify', hint: 'Type a radius, then pick two objects · <em>P</em> polyline · <em>T</em> trim',
  init: c => { c.r = DOC.filletR ?? 0; c.a = null; hint('Radius ' + fmt(c.r) + ' — type a new one or pick the first object'); },
  text(c, s) {
    const k = String(s).trim().toLowerCase();
    if (k === 'p') { c.polyMode = true; hint('Pick a polyline to fillet every corner'); return true; }
    /* TRIMMODE is shared with CHAMFER, as it is in AutoCAD: turn it off and the
       arc is added while the two objects are left exactly as they were, which
       is how you fillet something you still need the full length of. */
    if (k === 't' || k === 'trim') {
      VS.trimmode = VS.trimmode ? 0 : 1;
      echo(VS.trimmode ? 'Objects will be trimmed to the fillet'
                       : 'Objects will be left uncut');
      return true;
    }
    const v = parseLen(s);
    if (!isNaN(v) && v >= 0) { c.r = DOC.filletR = v; hint('Pick the first object'); return true; }
    return false;
  },
  point(c, p) {
    if (c.polyMode) {
      const e = pickAt(p, 10, x => x.t === 'pline');
      if (!e) return echo('Pick a polyline');
      begin(); mut(e); e.pts = filletPolyline(e, c.r); commit('Fillet'); c.polyMode = false; return;
    }
    const e = pickAt(p, 10, x => x.t === 'line' || x.t === 'arc' || x.t === 'circle');
    if (!e) return echo('Fillet works on lines, arcs and circles');
    if (!c.a) { c.a = e; c.ap = p; SEL.clear(); SEL.add(e.id); hint('Pick the second object'); return; }
    if (e.id === c.a.id) return;
    const f = filletCurves(c.a, c.ap, e, p, c.r);
    if (!f) { echo('No fillet of that radius fits'); c.a = null; SEL.clear(); return; }
    begin();
    if (VS.trimmode) { pullEnd(c.a, f.P, f.t1); pullEnd(e, f.P, f.t2); }
    if (c.r > 0 && f.arc) addEnt(Object.assign(f.arc, { layer: c.a.layer, color: c.a.color, lt: c.a.lt }));
    commit('Fillet');
    c.a = null; SEL.clear(); hint('Pick the first object');
  },
  done() { SEL.clear(); },
});
function filletPolyline(e, r) {
  if (r <= 0) return e.pts;
  const P = e.pts, n = P.length, out = [];
  const last = e.closed ? n : n - 1;
  if (!e.closed) out.push(P[0]);
  for (let i = e.closed ? 0 : 1; i < (e.closed ? n : n - 1); i++) {
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
    const u1 = norm(sub(a, b)), u2 = norm(sub(c, b));
    const th = Math.acos(clamp(dot(u1, u2), -1, 1));
    if (th < 1e-4 || Math.abs(th - Math.PI) < 1e-4) { out.push(b); continue; }
    const tanL = Math.min(r / Math.tan(th / 2), dist(a, b) * .49, dist(b, c) * .49);
    const t1 = add(b, mul(u1, tanL)), t2 = add(b, mul(u2, tanL));
    const rr = tanL * Math.tan(th / 2);
    const bis = norm(add(u1, u2));
    const cc = add(b, mul(bis, rr / Math.sin(th / 2)));
    let a0 = ang(cc, t1), a1 = ang(cc, t2);
    if (wrap(a1 - a0) > Math.PI) { const k = a0; a0 = a1; a1 = k; }
    const pts = arcPts({ c: cc, r: rr, a0, a1 }, 10);
    if (dist(pts[0], t1) > dist(pts[pts.length - 1], t1)) pts.reverse();
    out.push(...pts);
  }
  if (!e.closed) out.push(P[n - 1]);
  return out;
}
defc('chamfer', {
  group: 'modify', hint: 'Distance, then pick two lines · <em>A</em> angle · <em>T</em> trim',
  init: c => { c.d = DOC.chamD ?? 0; c.d2 = null; c.a = null; c.ang = null;
               hint('Distance ' + fmt(c.d) + ' — type a new one or pick the first line'); },
  text(c, s) {
    const k = String(s).trim().toLowerCase();
    if (k === 't' || k === 'trim') {
      VS.trimmode = VS.trimmode ? 0 : 1;
      echo(VS.trimmode ? 'Lines will be trimmed to the chamfer'
                       : 'Lines will be left uncut');
      return true;
    }
    /* The Angle method: a distance along the first line and an angle from it,
       which is how a chamfer is dimensioned on a drawing more often than as
       two distances. */
    if (k === 'a') { c.awaitAngle = true; hint('Distance along the first line'); return true; }
    if (c.awaitAngle) {
      if (c.angD == null) { const v = parseLen(s); if (isNaN(v) || v < 0) return false;
        c.angD = v; hint('Angle from the first line, in degrees'); return true; }
      const t = parseFloat(s);
      if (isNaN(t) || t <= 0 || t >= 90) { echo('An angle between 0 and 90'); return true; }
      c.d = DOC.chamD = c.angD;
      c.d2 = c.angD * Math.tan(rad(t));
      c.ang = t; c.awaitAngle = false; c.angD = null;
      echo('Chamfer ' + fmt(c.d) + ' at ' + t + ' degrees');
      hint('Pick the first line');
      return true;
    }
    const m = s.match(/^([\d.]+[a-z'"]*)[,x]([\d.]+[a-z'"]*)$/i);
    if (m) { c.d = parseLen(m[1]); c.d2 = parseLen(m[2]); DOC.chamD = c.d; hint('Pick the first line'); return true; }
    const v = parseLen(s);
    if (!isNaN(v) && v >= 0) { c.d = DOC.chamD = v; c.d2 = null; hint('Pick the first line'); return true; }
    return false;
  },
  point(c, p) {
    const e = pickAt(p, 10, x => x.t === 'line');
    if (!e) return echo('Chamfer works on lines');
    if (!c.a) { c.a = e; c.ap = p; SEL.clear(); SEL.add(e.id); hint('Pick the second line'); return; }
    if (e.id === c.a.id) return;
    const X = xLineLine(c.a.a, c.a.b, e.a, e.b, true);
    if (!X.length) { c.a = null; SEL.clear(); return echo('Those lines are parallel'); }
    const P = X[0];
    const u1 = dirFrom(P, c.a, c.ap), u2 = dirFrom(P, e, p);
    const t1 = add(P, mul(u1, c.d)), t2 = add(P, mul(u2, c.d2 != null ? c.d2 : c.d));
    begin();
    if (VS.trimmode) { pullEnd(c.a, P, t1); pullEnd(e, P, t2); }
    if (c.d > 0) addEnt({ t: 'line', a: t1, b: t2, layer: c.a.layer, color: c.a.color, lt: c.a.lt });
    commit('Chamfer'); c.a = null; SEL.clear(); hint('Pick the first line');
  },
  done() { SEL.clear(); },
});
defc('erase', {
  needSel: true, group: 'modify',
  init(c) { begin(); selEnts().forEach(e => eraseEnt(e.id)); commit('Erase'); endCmd(); },
});
defc('stretch', {
  needSel: true, group: 'modify',
  selHint: 'Drag a <em>crossing</em> window (right→left) over the parts to stretch, then <em>Enter</em>',
  hint: 'Base point', init: c => { c.pts = []; c.box = ST.lastBand || null; },
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length === 2) {
      const d = sub(c.pts[1], c.pts[0]);
      begin(); stretchSel(c.box, d); commit('Stretch'); endCmd();
    } else hint('Second point or type <em>@dx,dy</em>');
  },
  preview(c, p) {
    if (c.pts.length !== 1) return null;
    const d = sub(p, c.pts[0]);
    const out = [];
    for (const e of selEnts()) { const n = clone(e); stretchOne(n, c.box, d); out.push(n); }
    return out;
  },
});
function inBox(p, b) { return b ? (p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]) : true; }
function stretchOne(e, box, d) {
  const gs = gripsOf(e);
  const move = new Set();
  gs.forEach((g, i) => { if (inBox(g.p, box)) move.add(g.k); });
  if (!box || move.size === gs.length) { xf(e, T.move(d)); return; }
  if (!move.size) return;
  const mv = p => add(p, d);
  if (e.t === 'line') { if (move.has('a')) e.a = mv(e.a); if (move.has('b')) e.b = mv(e.b); }
  else if (e.t === 'wall') { if (move.has('a')) e.a = mv(e.a); if (move.has('b')) e.b = mv(e.b); }
  else if (e.t === 'stair') { if (move.has('a')) e.a = mv(e.a); if (move.has('b')) e.b = mv(e.b); }
  else if (e.t === 'pline' || e.t === 'spline' || e.t === 'room') {
    const P = e.pts;
    for (let i = 0; i < P.length; i++) if (move.has('p' + i)) P[i] = mv(P[i]);
  }
  else xf(e, T.move(d));
}
function stretchSel(box, d) { selEnts().forEach(e => { mut(e); stretchOne(e, box, d); }); }

defc('align', {
  needSel: true, group: 'modify', hint: 'First source point', init: c => c.pts = [],
  point(c, p) {
    c.pts.push(p);
    const n = c.pts.length;
    if (n === 1) { c.src = selEnts().map(clone); hint('First destination point'); }
    else if (n === 2) hint('Second source point');
    else if (n === 3) hint('Second destination point · <em>Enter</em> to skip scaling');
    else if (n === 4) { begin(); doAlign(c, true); commit('Align'); endCmd(); }
  },
  enter(c) {
    if (c.pts.length === 2) { begin(); selEnts().forEach(e => xf(e, T.move(sub(c.pts[1], c.pts[0])))); commit('Align'); }
    else if (c.pts.length === 4) { begin(); doAlign(c, false); commit('Align'); }
    endCmd();
  },
  preview(c, p) {
    if (c.pts.length === 3) { const t = { pts: [...c.pts, p] }; return alignPreview(c, t.pts); }
    if (c.pts.length === 1) return (c.src || []).map(e => xf(clone(e), T.move(sub(p, c.pts[0]))));
    return null;
  },
});
function alignXform(pts, doScale) {
  const [s1, d1, s2, d2] = pts;
  const a = ang(s1, s2), b = ang(d1, d2);
  const ls = dist(s1, s2), ld = dist(d1, d2);
  const k = doScale && ls > 1e-9 ? ld / ls : 1;
  return p => {
    let q = sub(p, s1);
    q = [q[0] * k, q[1] * k];
    const t = b - a, cs = Math.cos(t), sn = Math.sin(t);
    return [d1[0] + q[0] * cs - q[1] * sn, d1[1] + q[0] * sn + q[1] * cs];
  };
}
function doAlign(c, doScale) { const f = alignXform(c.pts, doScale); selEnts().forEach(e => xf(e, f)); }
function alignPreview(c, pts) { const f = alignXform(pts, true); return (c.src || []).map(e => xf(clone(e), f)); }

defc('explode', {
  needSel: true, group: 'modify',
  init(c) {
    begin(); let n = 0;
    for (const e of selEnts()) {
      const meta = { layer: e.layer, color: e.color, lt: e.lt, lw: e.lw };
      if (e.t === 'pline' || e.t === 'spline') {
        const P = e.closed ? [...e.pts, e.pts[0]] : e.pts;
        for (let i = 1; i < P.length; i++) addEnt(Object.assign({ t: 'line', a: P[i - 1], b: P[i] }, meta));
        delEnt(e.id); n++;
      } else if (e.t === 'insert') {
        for (const q of insertEnts(e)) addEnt(q);
        delEnt(e.id); n++;
      } else if (GEOM[e.t] || e.t === 'dim') {
        for (const q of flattenToPrimitives(e)) addEnt(q);
        if (e.t === 'wall') delWallCascade(e.id); else delEnt(e.id);
        n++;
      }
    }
    commit(n ? 'Exploded ' + n : 'Nothing to explode'); endCmd();
  },
});
/** turn any composite entity into plain lines / arcs / text */
function flattenToPrimitives(e) {
  const out = [];
  const meta = { layer: e.layer, color: e.color, lt: e.lt, lw: e.lw };
  if (e.t === 'dim') {
    const g = dimGeom(e);
    g.lines.forEach(([a, b]) => out.push(Object.assign({ t: 'line', a, b }, meta)));
    g.arrows.forEach(ar => out.push(Object.assign({ t: 'pline', pts: arrowPoly(ar.p, ar.a, g.S.arrow), closed: true, fill: true }, meta)));
    out.push(Object.assign({ t: 'text', p: g.tp, s: g.txt, h: g.S.txt, rot: g.tr, anchor: 'c' }, meta));
    return out;
  }
  for (const s of shapes(e, 64)) {
    const m = Object.assign({}, meta, s.lt ? { lt: s.lt } : {});
    if (s.text != null) out.push(Object.assign({ t: 'text', p: s.p, s: String(s.text), h: s.h, rot: s.rot || 0, anchor: s.anchor || 'l' }, m));
    else if (s.pts) {
      if (s.pts.length === 2 && !s.closed) out.push(Object.assign({ t: 'line', a: s.pts[0], b: s.pts[1] }, m));
      else out.push(Object.assign({ t: 'pline', pts: s.pts, closed: !!s.closed }, m));
    } else if (s.r != null && s.a0 != null) out.push(Object.assign({ t: 'arc', c: s.c, r: s.r, a0: s.a0, a1: s.a1 }, m));
    else if (s.r != null) out.push(Object.assign({ t: 'circle', c: s.c, r: s.r }, m));
  }
  return out;
}
/* ---------------- joining arcs ----------------
   Two arcs off the same centre and radius whose ends meet are one arc. JOIN
   handled lines and polylines and silently left arcs alone, so the one case
   where joining is unambiguous — the geometry says outright that they belong
   together — was the case it could not do. */
function arcsJoinable(a, b, tol) {
  return Math.abs(a.r - b.r) < tol && dist(a.c, b.c) < tol;
}
/** merge a set of co-radial arcs into as few arcs as possible; a run that
    closes on itself comes back as a circle, which is what it is */
function joinArcs(arcs, tol) {
  const out = [];
  const pool = arcs.slice();
  while (pool.length) {
    let cur = pool.shift();
    let a0 = cur.a0, a1 = cur.a1, moved = true;
    while (moved && pool.length) {
      moved = false;
      for (let i = 0; i < pool.length; i++) {
        const o = pool[i];
        if (!arcsJoinable(cur, o, tol)) continue;
        const aTol = tol / Math.max(cur.r, 1e-9);
        if (Math.abs(wrap(o.a0 - a1)) < aTol) { a1 = a1 + wrap(o.a1 - o.a0); }
        else if (Math.abs(wrap(a0 - o.a1)) < aTol) { a0 = a0 - wrap(o.a1 - o.a0); }
        else continue;
        pool.splice(i, 1); moved = true; break;
      }
    }
    const span = a1 - a0;
    out.push(span >= Math.PI * 2 - 1e-6
      ? { t: 'circle', c: cur.c.slice(), r: cur.r }
      : { t: 'arc', c: cur.c.slice(), r: cur.r, a0, a1 });
  }
  return out;
}
defc('join', {
  needSel: true, group: 'modify',
  init(c) {
    /* arcs first: they join by geometry, not by chaining endpoints */
    const arcs = selEnts().filter(e => e.t === 'arc');
    if (arcs.length >= 2 && selEnts().every(e => e.t === 'arc')) {
      const tol = Math.max(px(6), 1e-6);
      const merged = joinArcs(arcs, tol);
      if (merged.length < arcs.length) {
        begin();
        const meta = { layer: arcs[0].layer, color: arcs[0].color, lt: arcs[0].lt, lw: arcs[0].lw };
        arcs.forEach(e => delEnt(e.id));
        SEL.clear();
        for (const m of merged) { const n = addEnt(Object.assign(m, meta)); SEL.add(n.id); }
        commit('Join');
        echo(arcs.length + ' arcs joined into ' + merged.length);
        syncUI(); return endCmd();
      }
      echo('Those arcs do not meet, or are not off the same centre');
      return endCmd();
    }
    const es = selEnts().filter(e => e.t === 'line' || e.t === 'pline');
    if (es.length < 2) { echo('Select two or more lines, polylines or arcs'); return endCmd(); }
    const chains = es.map(e => e.t === 'line' ? [e.a, e.b] : (e.closed ? [...e.pts, e.pts[0]] : e.pts.slice()));
    const tol = Math.max(px(6), 1e-6);
    const merged = [];
    while (chains.length) {
      let cur = chains.shift(), moved = true;
      while (moved && chains.length) {
        moved = false;
        for (let i = 0; i < chains.length; i++) {
          const ch = chains[i];
          if (dist(cur[cur.length - 1], ch[0]) < tol) { cur = cur.concat(ch.slice(1)); }
          else if (dist(cur[cur.length - 1], ch[ch.length - 1]) < tol) { cur = cur.concat(ch.slice().reverse().slice(1)); }
          else if (dist(cur[0], ch[ch.length - 1]) < tol) { cur = ch.slice(0, -1).concat(cur); }
          else if (dist(cur[0], ch[0]) < tol) { cur = ch.slice().reverse().slice(0, -1).concat(cur); }
          else continue;
          chains.splice(i, 1); moved = true; break;
        }
      }
      merged.push(cur);
    }
    begin();
    const meta = { layer: es[0].layer, color: es[0].color, lt: es[0].lt, lw: es[0].lw };
    es.forEach(e => delEnt(e.id));
    SEL.clear();
    for (const ch of merged) {
      const closed = ch.length > 2 && dist(ch[0], ch[ch.length - 1]) < tol;
      /* Collinear pieces join back into a LINE, which is what AutoCAD does and
         what anyone joining two halves of the same line expects. Coming back
         as a three-point polyline is technically the same shape and behaves
         differently everywhere afterwards — offset, fillet, grips and the DXF
         it writes. */
      const straight = !closed && ch.length > 2 && collinearRun(ch, tol);
      const n = straight
        ? addEnt(Object.assign({ t: 'line', a: ch[0].slice(), b: ch[ch.length - 1].slice() }, meta))
        : addEnt(Object.assign({ t: 'pline', pts: closed ? ch.slice(0, -1) : ch, closed }, meta));
      SEL.add(n.id);
    }
    commit('Joined into ' + merged.length); endCmd();
  },
});
defc('pedit', {
  group: 'modify', hint: 'Pick a polyline · then <em>C</em> close, <em>O</em> open, <em>S</em> smooth, <em>D</em> decurve',
  init: c => { c.e = null; },
  point(c, p) {
    const e = pickAt(p, 10, x => x.t === 'pline' || x.t === 'spline' || x.t === 'line');
    if (!e) return;
    if (e.t === 'line') {
      begin();
      const n = addEnt({ t: 'pline', pts: [e.a, e.b], layer: e.layer, color: e.color, lt: e.lt, lw: e.lw });
      delEnt(e.id); commit('Converted to polyline'); c.e = n;
    } else c.e = e;
    SEL.clear(); SEL.add(c.e.id);
    hint('<em>C</em> close · <em>O</em> open · <em>S</em> smooth · <em>D</em> decurve · <em>Enter</em> done');
  },
  text(c, s) {
    if (!c.e) return false;
    const k = s.toLowerCase();
    begin(); mut(c.e);
    if (k === 'c') c.e.closed = true;
    else if (k === 'o') c.e.closed = false;
    else if (k === 's') { c.e.fit = c.e.fit || c.e.pts.slice(); c.e.t = 'spline'; c.e.pts = fitSpline(c.e.fit, c.e.closed); }
    else if (k === 'd') { c.e.t = 'pline'; if (c.e.fit) c.e.pts = c.e.fit; }
    else { rollback(); return false; }
    commit('Polyline edit'); draw(); return true;
  },
  done() { SEL.clear(); },
});
defc('break', {
  group: 'modify', hint: 'Pick the object, then two break points · <em>F</em> break at one point',
  init: c => { c.e = null; c.pts = []; },
  text(c, s) { if (/^f$/i.test(s)) { c.single = true; echo('Break at a single point'); return true; } return false; },
  point(c, p) {
    if (!c.e) {
      const e = pickAt(p, 10, x => !GEOM[x.t]); if (!e) return;
      c.e = e; SEL.clear(); SEL.add(e.id); hint('First break point'); return;
    }
    c.pts.push(p);
    if (c.single && c.pts.length === 1) c.pts.push(p);
    if (c.pts.length === 2) {
      let t0 = paramOf(c.e, c.pts[0]), t1 = paramOf(c.e, c.pts[1]);
      if (t0 > t1) { const s = t0; t0 = t1; t1 = s; }
      const e = c.e, meta = { layer: e.layer, color: e.color, lt: e.lt, lw: e.lw };
      begin();
      if (e.t === 'circle' && Math.abs(t1 - t0) > 1e-6) addEnt(Object.assign(subEnt(e, t1, t0 + 1), meta));
      else {
        if (t0 > 1e-4) addEnt(Object.assign(subEnt(e, 0, t0), meta));
        if (t1 < 1 - 1e-4) addEnt(Object.assign(subEnt(e, t1, 1), meta));
      }
      delEnt(e.id); commit('Break'); endCmd();
    } else hint('Second break point');
  },
  done() { SEL.clear(); },
});
defc('divide', {
  group: 'modify', hint: 'Pick an object, then type the number of segments', init: c => { c.e = null; },
  point(c, p) { const e = pickAt(p, 10, x => !GEOM[x.t]); if (!e) return; c.e = e; SEL.clear(); SEL.add(e.id); hint('Number of segments'); },
  text(c, s) {
    if (!c.e) return false;
    const n = parseInt(s); if (!(n >= 2 && n <= 2000)) return false;
    begin();
    for (let i = 1; i < n; i++) addEnt({ t: 'point', p: ptAt(c.e, i / n), layer: c.e.layer });
    commit('Divided into ' + n); endCmd(); return true;
  },
  done() { SEL.clear(); },
});
defc('measure', {
  group: 'modify', hint: 'Pick an object, then type the segment length', init: c => { c.e = null; },
  point(c, p) { const e = pickAt(p, 10, x => !GEOM[x.t]); if (!e) return; c.e = e; SEL.clear(); SEL.add(e.id); hint('Segment length'); },
  text(c, s) {
    if (!c.e) return false;
    const L = parseLen(s); if (isNaN(L) || L <= 0) return false;
    const total = entLength(c.e);
    const n = Math.floor(total / L);
    if (n < 1 || n > 5000) { echo('That gives no usable divisions'); return true; }
    begin();
    for (let i = 1; i <= n; i++) addEnt({ t: 'point', p: ptAt(c.e, (i * L) / total), layer: c.e.layer });
    commit('Marked ' + n + ' points'); endCmd(); return true;
  },
  done() { SEL.clear(); },
});
defc('matchprop', {
  group: 'modify', hint: 'Pick the source object', init: c => { c.src = null; },
  point(c, p) {
    const e = pickAt(p, 10); if (!e) return;
    if (!c.src) { c.src = e; SEL.clear(); SEL.add(e.id); hint('Pick objects to paint'); return; }
    begin(); mut(e);
    e.layer = c.src.layer; e.color = c.src.color; e.lt = c.src.lt; e.lw = c.src.lw;
    commit('Match properties');
  },
  done() { SEL.clear(); },
});
defc('array', { needSel: true, group: 'modify', init(c) { openArray(); endCmd(); } });

/* ---------------- blocks ---------------- */
DOC.blocks = DOC.blocks || {};
/** Which entities of a block are drawn for a given state.

    An entity with no `vis` belongs to the block itself and is always there;
    one with a list belongs only to those states. An insert with no state
    chosen, or one naming a state nobody defined, gets the whole block: an
    unrecognised state is not a reason to draw nothing, which would look
    exactly like the block having been deleted. */
function blockEntsFor(b, state) {
  const ents = b.ents || [];
  const states = b.states || [];
  if (!state || !states.length || states.indexOf(state) < 0) return ents;
  return ents.filter(e => !Array.isArray(e.vis) || e.vis.indexOf(state) >= 0);
}
function insertEnts(ins) {
  const b = (DOC.blocks || {})[ins.name];
  if (!b) return [];
  const cs = Math.cos(ins.rot || 0), sn = Math.sin(ins.rot || 0);
  const sx = ins.sx == null ? 1 : ins.sx, sy = ins.sy == null ? 1 : (ins.sy == null ? sx : ins.sy);
  const f = p => {
    const q = [(p[0] - b.base[0]) * sx, (p[1] - b.base[1]) * sy];
    return [ins.p[0] + q[0] * cs - q[1] * sn, ins.p[1] + q[0] * sn + q[1] * cs];
  };
  return blockEntsFor(b, ins.state).map(e => { const n = clone(e); delete n.id; n.layer = n.layer === '0' ? ins.layer : n.layer; return xf(n, f); });
}
/* ---------------- colour inside a block ----------------
   An insert flattened its contents into one shape list and drew the lot in the
   insert's colour, so a block could only ever be monochrome: a door leaf and
   its swing could not differ, and a red note inside a block came out whatever
   the insert was. AutoCAD's three cases are all real and all different:

     explicit  — the entity's own colour, wherever it is inserted
     ByLayer   — the colour of the layer the entity is on (the default here,
                 expressed by having no colour of its own)
     ByBlock   — the INSERT's colour, which is what makes one block definition
                 usable in several colours

   ByBlock needs a marker, since "no colour" already means ByLayer. */
const BYBLOCK = 'byblock';
/** the colour a block's contents should draw in, or null to inherit */
function blockPartColor(e) {
  if (!e) return null;
  if (e.color === BYBLOCK) return null;         /* inherit from the insert */
  if (e.color) return e.color;                  /* explicit */
  if (e.layer && hasLayer(e.layer)) return layer(e.layer).color;   /* ByLayer */
  return null;
}
GEOM.insert = {
  shapes(ins, tol) {
    const out = [];
    for (const e of insertEnts(ins)) {
      /* An attdef inside an insert draws as that insert's VALUE, not as the
         tag typed into the definition. Use the entity from insertEnts, which
         has already been moved, turned and scaled into place — reading the
         definition's own coordinates instead stacks every insert's text on
         top of the first one, which is exactly what it did. */
      if (e.t === 'attdef') {
        if (e.hidden) continue;
        const v = (typeof attValue === 'function') ? attValue(ins, e) : (e.val || '');
        if (!v) continue;
        out.push({ text: v, p: e.p, h: e.h || DOC.textH, rot: e.rot || 0,
                   anchor: e.anchor || 'l', col: blockPartColor(e) });
        continue;
      }
      const col = blockPartColor(e);
      const got = GEOM[e.t] ? shapes(e, tol) : shapesOfPrimitive(e, tol);
      if (col) for (const g of got) { if (g.col == null) g.col = col; }
      out.push(...got);
    }
    return out;
  },
  grips: ins => [{ p: ins.p, k: 'p' }],
  grip(ins, k, p) { ins.p = p; },
  xf(ins, fn) {
    const p2 = fn(ins.p), q = fn(add(ins.p, [Math.cos(ins.rot || 0), Math.sin(ins.rot || 0)]));
    const s = dist(p2, q);
    ins.rot = ang(p2, q); ins.sx = (ins.sx == null ? 1 : ins.sx) * s; ins.sy = (ins.sy == null ? 1 : ins.sy) * s; ins.p = p2;
  },
};
function shapesOfPrimitive(e, tol) {
  switch (e.t) {
    case 'line': return [{ pts: [e.a, e.b], lt: e.lt }];
    case 'pline': case 'spline': return [{ pts: e.pts, closed: !!e.closed, lt: e.lt }];
    case 'circle': return [{ c: e.c, r: e.r, lt: e.lt }];
    case 'arc': return [{ c: e.c, r: e.r, a0: e.a0, a1: e.a1, lt: e.lt }];
    case 'ellipse': return [{ pts: poly(e, tol || 48), lt: e.lt }];
    case 'text': return [{ text: e.s, p: e.p, h: e.h, rot: e.rot || 0, anchor: e.anchor || 'l' }];
    case 'attdef': return [{ text: e.tag, p: e.p, h: e.h, rot: e.rot || 0, anchor: e.anchor || 'l' }];
    case 'dim': return flattenToPrimitives(e).flatMap(q => shapesOfPrimitive(q, tol));
    default: return [];
  }
}
defc('block', {
  needSel: true, group: 'modify', hint: 'Base point for the block',
  point(c, p) {
    const src = selEnts().map(clone);
    modal(`<h3>Make a block</h3><div class="row"><label>Name</label><input class="f" id="bn" value="BLOCK${Object.keys(DOC.blocks).length + 1}"></div>
      <div class="row"><label>Keep source</label><select class="f" id="bk"><option value="1">replace with the block</option><option value="0">keep the objects</option></select></div>`, () => {
      const name = ($('#bn').value || 'BLOCK').trim().toUpperCase();
      begin();
      DOC.blocks[name] = { base: p, ents: src.map(e => { const n = clone(e); delete n.id; return n; }) };
      if ($('#bk').value === '1') {
        selEnts().forEach(e => eraseEnt(e.id));
        SEL.clear();
        const n = addEnt({ t: 'insert', name, p, rot: 0, sx: 1, sy: 1 });
        SEL.add(n.id);
      }
      commit('Block ' + name); endCmd();
    });
  },
});
defc('insert', {
  group: 'modify', hint: 'Insertion point',
  init(c) {
    const names = Object.keys(DOC.blocks);
    if (!names.length) { toast('No blocks yet — make one with BLOCK'); return endCmd(); }
    c.name = names[0];
    modal(`<h3>Insert a block</h3>
      <div class="row"><label>Block</label><select class="f" id="ib">${names.map(n => `<option>${esc(n)}</option>`).join('')}</select></div>
      <div class="row"><label>Scale</label><input class="f" id="is" value="1"></div>
      <div class="row"><label>Rotation °</label><input class="f" id="ir" value="0"></div>`, () => {
      c.name = $('#ib').value; c.s = parseFloat($('#is').value) || 1; c.r = rad(parseFloat($('#ir').value) || 0);
      hint('Insertion point');
    });
  },
  point(c, p) {
    if (!c.name) return;
    begin(); addEnt({ t: 'insert', name: c.name, p, rot: c.r || 0, sx: c.s || 1, sy: c.s || 1 }); commit('Insert');
  },
  preview(c, p) { return c.name ? [pv({ t: 'insert', name: c.name, p, rot: c.r || 0, sx: c.s || 1, sy: c.s || 1 })] : null; },
});

/* ---------------- hatch ---------------- */
/* ------------------------------------------------------------
   HULL — the smallest convex ring around a selection.

   Andrew's monotone chain over the flattened points of everything selected,
   so a hull of two circles follows the arcs rather than their bounding boxes.
   Site boundary from survey points, extent of a furniture layout, catchment
   of an escape route, the swept envelope of a door and its approach.
   ------------------------------------------------------------ */
function convexHull(pts) {
  const p = pts.filter(q => q && isFinite(q[0]) && isFinite(q[1]))
    .map(q => [q[0], q[1]])
    .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  if (p.length < 3) return [];
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (src) => {
    const h = [];
    for (const q of src) {
      /* <= 0 drops collinear points, so a straight run does not become a ring
         of coincident vertices */
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  const ring = half(p).concat(half(p.slice().reverse()));
  return ring.length >= 3 ? ring : [];
}
defc('hull', {
  key: 'hull', group: 'modify', needSel: true,
  hint: 'The smallest convex outline around the selection',
  init(c) {
    const es = selEnts();
    if (es.length < 1) { echo('Select something to wrap first'); return endCmd(); }
    const pts = [];
    for (const e of es) {
      let p = [];
      try { p = poly(e, 64) || []; } catch (err) { p = []; }
      if (!p.length && e.p) p = [e.p];
      for (const q of p) pts.push(q);
    }
    const ring = convexHull(pts);
    if (ring.length < 3) { echo('Those points do not enclose anything'); return endCmd(); }
    begin();
    const n = addEnt({ t: 'pline', pts: ring.map(q => q.slice()), closed: true, layer: DOC.cur });
    commit('Hull');
    SEL.clear(); SEL.add(n.id);
    cliPrint('Hull of ' + es.length + ' objects — ' + ring.length + ' points, ' +
             fmtArea(Math.abs(polyArea(ring))) + '.');
    syncUI(); draw();
    endCmd();
  },
});

defc('hatch', {
  group: 'draw', hint: 'Click inside a closed shape, or select shapes first then <em>Enter</em>',
  init(c) {
    if (SEL.size) { hatchFrom(selEnts()); endCmd(); }
  },
  point(c, p) {
    const b = findBoundary(p);
    if (b) return hatchRings([b.outer, ...b.holes]);
    /* Nothing already-closed encloses the pick, so trace one out of whatever
       loose geometry is there. Four lines drawn as four lines enclose a space
       perfectly well, and that is most of how a drawing actually gets made. */
    const traced = (typeof traceBoundary === 'function') ? traceBoundary(p) : null;
    if (traced) return hatchRings([traced]);
    /* the tracer knows which of its four ways it failed; passing that on is
       the difference between "go and close the gap" and "try again" */
    whyFail((typeof traceWhy === 'function' && traceWhy()) || 'Nothing encloses that point.');
  },
});
/** the closed ring an entity encloses, or null if it does not enclose one */
function ringOf(e) {
  if ((e.t === 'pline' || e.t === 'spline') && e.closed) return e.pts;
  if (e.t === 'circle' || e.t === 'ellipse') return poly(e, 64);
  if (e.t === 'room') return e.pts;
  if (e.t === 'wall') return wallOutline(e);
  return null;
}
/** every closed ring in the drawing, with its area */
function closedRings() {
  const out = [];
  for (const e of DOC.ents.values()) {
    if (!visible(e)) continue;
    const ring = ringOf(e);
    if (!ring || ring.length < 3) continue;
    out.push({ e, ring, a: Math.abs(polyArea(ring)) });
  }
  return out;
}
/** is every point of `inner` inside `outer`? */
function ringInside(inner, outer) {
  for (const q of inner) if (!pointInPoly(q, outer)) return false;
  return true;
}
/* ---------------- island detection ----------------
   A room with a column in it is one boundary and one hole, and hatching over
   the column is the difference between a drawing and a picture of one. The
   smallest ring containing the pick is the boundary; anything closed that sits
   wholly inside it, and inside nothing smaller, is a hole. Nesting is handled
   by that second condition: a duct inside a riser inside a room leaves the
   riser as the hole and the duct as solid again, which is what alternating
   fill means and what AutoCAD calls Normal island detection. */
function findEnclosing(p) {
  const rings = closedRings();
  const inside = rings.filter(r => pointInPoly(p, r.ring)).sort((x, y) => x.a - y.a);
  if (!inside.length) return [];
  return [inside[0].e];
}
/** the boundary containing p, plus the rings that are holes in it */
function findBoundary(p) {
  const rings = closedRings();
  const inside = rings.filter(r => pointInPoly(p, r.ring)).sort((x, y) => x.a - y.a);
  if (!inside.length) return null;
  const outer = inside[0];
  const holes = [];
  for (const r of rings) {
    if (r.e.id === outer.e.id) continue;
    if (r.a >= outer.a) continue;
    if (!ringInside(r.ring, outer.ring)) continue;
    /* only rings that are not themselves inside a smaller candidate: the
       first level down is a hole, the level below that is filled again */
    const nestedInAnother = rings.some(o =>
      o.e.id !== r.e.id && o.e.id !== outer.e.id &&
      o.a < outer.a && o.a > r.a && ringInside(r.ring, o.ring));
    if (!nestedInAnother) holes.push(r.ring);
  }
  return { outer: outer.ring, holes };
}
function hatchFrom(ents) {
  const loops = [];
  for (const e of ents) { const r = ringOf(e); if (r) loops.push(r); }
  return hatchRings(loops);
}
function hatchRings(loops) {
  loops = (loops || []).filter(L => L && L.length >= 3);
  if (!loops.length) return echo('Select closed shapes to hatch');
  modal(`<h3>Hatch</h3>
    <div class="row"><label>Pattern</label><select class="f" id="hp">
      <option value="solid">Solid fill</option>` +
      hatchPatterns().map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') + `
      </select></div>
    <div class="row"><label>Spacing</label><input class="f" id="hs" value="${+(200 / U[DOC.units]).toFixed(4)}"></div>
    <div class="row"><label>Angle °</label><input class="f" id="ha" value="45"></div>`, () => {
    begin();
    const n = addEnt({
      t: 'hatch', loops, pattern: $('#hp').value, solid: $('#hp').value === 'solid',
      sp: parseLen($('#hs').value) || 200, hatchAng: parseFloat($('#ha').value) || 0,
    });
    SEL.clear(); SEL.add(n.id);
    commit('Hatch');
  });
}
GEOM.hatch = {
  shapes: h => (h.loops || []).map(L => ({ pts: L, closed: true, role: 'room' })),
  dist(p, h) {
    for (const L of (h.loops || [])) if (pointInPoly(p, L)) return 0;
    let d = Infinity;
    for (const L of (h.loops || [])) d = Math.min(d, polyDist(p, L, true));
    return d;
  },
  grips: () => [],
  xf(h, fn) { h.loops = (h.loops || []).map(L => L.map(fn)); },
  /* Signed, and the loops are ordered outer-first, so a hole subtracts.
     This added them: a 20 square metre room with a square metre column in it
     reported 21, while the fill — an even-odd clip — drew the column
     correctly. The drawing and the number disagreed, which is the worst way
     round to be wrong. */
  area(h) {
    const L = h.loops || [];
    if (!L.length) return 0;
    /* By size, not by position. Our own files put the outer loop first, and a
       file from anywhere else need not — subtracting in file order then gives
       a negative area, which clamps to zero and reads as "no area at all". */
    const areas = L.map(x => Math.abs(polyArea(x)));
    let outer = 0;
    for (let i = 1; i < areas.length; i++) if (areas[i] > areas[outer]) outer = i;
    let a = areas[outer];
    for (let i = 0; i < areas.length; i++) if (i !== outer) a -= areas[i];
    return Math.max(0, a);
  },
  len: h => (h.loops || []).reduce((a, L) => a + polyLen(L, true), 0),
};

/* ---------------- inquiry ---------------- */
defc('dist', {
  group: 'inquiry', hint: 'First point', init: c => c.pts = [],
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length === 2) {
      const d = dist(c.pts[0], c.pts[1]), a = deg(ang(c.pts[0], c.pts[1]));
      echo('Distance ' + fmt(d) + '  ·  Δx ' + fmt(c.pts[1][0] - c.pts[0][0]) + '  Δy ' + fmt(c.pts[1][1] - c.pts[0][1]) + '  ·  ' + a.toFixed(2) + '°');
      c.pts = [];
    } else hint('Second point');
  },
  preview(c, p) { return c.pts.length === 1 ? [pv({ t: 'dim', k: 'aligned', p1: c.pts[0], p2: p, off: 0 })] : null; },
});
defc('area', {
  group: 'inquiry', hint: 'Pick points around the area · <em>O</em> to pick an object · <em>Enter</em> to total',
  init: c => c.pts = [],
  text(c, s) {
    if (/^o$/i.test(s)) { c.obj = true; hint('Pick a closed object'); return true; }
    return false;
  },
  point(c, p) {
    if (c.obj) {
      const e = pickAt(p, 10);
      if (!e) return;
      const a = entArea(e);
      if (!a) return echo('That object encloses no area');
      echo('Area ' + fmtArea(a) + '  ·  perimeter ' + fmt(entLength(e)));
      return;
    }
    c.pts.push(p);
    if (c.pts.length > 2) echo('Area ' + fmtArea(polyArea(c.pts)) + '  ·  perimeter ' + fmt(polyLen(c.pts, true)));
  },
  preview: (c, p) => c.pts.length ? [pv({ t: 'pline', pts: [...c.pts, p], closed: true })] : null,
  enter(c) {
    if (c.pts.length > 2) echo('Area ' + fmtArea(polyArea(c.pts)) + '  ·  perimeter ' + fmt(polyLen(c.pts, true)));
    endCmd();
  },
});
defc('id', {
  group: 'inquiry', hint: 'Pick a point',
  point(c, p) { echo('X ' + fmt(p[0]) + '   Y ' + fmt(p[1])); },
});
defc('list', {
  group: 'inquiry', needSel: true,
  init(c) {
    const es = selEnts();
    if (!es.length) { echo('Nothing selected'); return endCmd(); }
    const rows = es.slice(0, 60).map(e => {
      const bits = [`<b>${esc(e.t)}</b>`, 'layer ' + esc(e.layer)];
      const L = entLength(e), A = entArea(e);
      if (L) bits.push('length ' + fmt(L));
      if (A) bits.push('area ' + fmtArea(A));
      if (e.t === 'wall') bits.push('thickness ' + fmt(wallT(e)), (wallType(e.wt) || {}).name || '');
      if (e.t === 'door' || e.t === 'window') bits.push('width ' + fmt(openW(e)), 'height ' + fmt(openH(e)));
      return '<div style="padding:3px 0;border-bottom:1px solid var(--bd)">' + bits.filter(Boolean).join(' · ') + '</div>';
    }).join('');
    modal(`<h3>${es.length} object${es.length > 1 ? 's' : ''}</h3><div style="font-size:11.5px;font-family:var(--mono);max-height:50vh;overflow:auto">${rows}</div>`, null);
    $('#mo').style.display = 'none'; $('#mc').textContent = 'Close';
    endCmd();
  },
});
defc('qselect', {
  group: 'inquiry',
  init(c) {
    const types = [...new Set([...DOC.ents.values()].map(e => e.t))].sort();
    modal(`<h3>Quick select</h3>
      <div class="row"><label>Type</label><select class="f" id="qt"><option value="">any</option>${types.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
      <div class="row"><label>Layer</label><select class="f" id="ql"><option value="">any</option>${DOC.layers.map(l => `<option>${esc(l.name)}</option>`).join('')}</select></div>
      <div class="row"><label>Mode</label><select class="f" id="qm"><option value="new">replace selection</option><option value="add">add to selection</option></select></div>`, () => {
      const t = $('#qt').value, l = $('#ql').value;
      if ($('#qm').value === 'new') SEL.clear();
      let n = 0;
      for (const e of DOC.ents.values()) {
        if (!pickable(e)) continue;
        if (t && e.t !== t) continue;
        if (l && e.layer !== l) continue;
        SEL.add(e.id); n++;
      }
      echo(n + ' selected'); syncUI(); draw();
    });
    endCmd();
  },
});

/* ============================================================
   SELECT — the standalone selection prompt
   Every keyword AutoCAD answers at "Select objects:" is handled by
   selOption() in 06-snap, so the command itself is only a shell that
   holds the prompt open until Enter.
   ============================================================ */
defc('select', {
  group: 'modify', alwaysSel: true,
  selHint: 'Select objects · <em>W</em> window · <em>C</em> crossing · <em>WP CP</em> polygon · ' +
    '<em>F</em> fence · <em>ALL P L</em> · <em>R</em> remove · <em>A</em> add · <em>U</em> undo · <em>Enter</em> done',
  init() { echo(SEL.size + ' found'); endCmd(); },
});

/* ============================================================
   GRIP EDITING
   ------------------------------------------------------------
   One command covers all five grip modes. Enter or Space steps
   STRETCH -> MOVE -> ROTATE -> SCALE -> MIRROR and round again, each with
   its own prompt and its own Base point / Copy / Undo / eXit options, which
   is the loop AutoCAD runs once a grip goes hot.

   STRETCH edits the live objects inside an open journal rather than drawing
   a ghost. That is what AutoCAD shows, and it is the only way a wall can
   preview honestly: a cloned wall would re-mitre against its real neighbours
   and drag their openings with it. Esc rolls the journal back.
   The other four modes are whole-object transforms, so they ghost from
   clones the way MOVE and ROTATE already do.
   ============================================================ */
const GRIP_MODES = ['stretch', 'move', 'rotate', 'scale', 'mirror'];
const GRIP_TITLE = { stretch: 'STRETCH', move: 'MOVE', rotate: 'ROTATE', scale: 'SCALE', mirror: 'MIRROR' };
const GRIP_ASK = {
  stretch: 'Stretch point', move: 'Move point', rotate: 'Rotation angle',
  scale: 'Scale factor', mirror: 'Second point',
};
function gripPrompt(c) {
  const ref = (c.mode === 'rotate' || c.mode === 'scale') ? ' · <em>R</em> reference' : '';
  return '<b>** ' + GRIP_TITLE[c.mode] + ' **</b> ' + GRIP_ASK[c.mode] +
    ' · <em>B</em> base point · <em>C</em> copy' + (c.copy ? ' (on)' : '') + ref +
    ' · <em>U</em> undo · <em>X</em> exit';
}
function gripEnts(c) { return c.ids.map(id => DOC.ents.get(id)).filter(Boolean); }
/** open the journal the live stretch edits inside */
function gripLiveBegin(c) { if (!c.live) { begin(); c.live = true; } }
/** put every stretched object back where it started */
function gripLiveAbort(c) { if (c.live) { rollback(); c.live = false; } }

defc('gripedit', {
  group: 'modify',
  init(c) {
    gripSyncHot();
    c.mode = 'stretch';
    c.copy = false;
    c.live = false;
    c.refA = null; c.refL = null; c.d0 = null; c.wantBase = false; c.copies = 0;
    c.action = ST.gripAction || 'stretch';
    c.ids = [...SEL];
    c.hot = ST.gripHot.map(g => ({ id: g.id, k: g.k, p: g.p.slice() }));
    c.base = (ST.gripBase && ST.gripBase.slice()) || (c.hot[0] ? c.hot[0].p.slice() : null);
    c.orig = new Map();
    for (const id of new Set(c.hot.map(g => g.id))) {
      const e = DOC.ents.get(id); if (e) c.orig.set(id, clone(e));
    }
    /* a structural menu action (add / remove vertex) happens once, up front,
       and hands back the grip the drag should carry on with */
    if (c.action !== 'stretch' && c.hot.length === 1) {
      const g = c.hot[0], e = DOC.ents.get(g.id);
      /* The journal has to be open BEFORE gripDo mutates. It used to run first
         and begin() second, which meant the mut() inside it recorded nothing:
         Remove Vertex committed an empty patch, so undo rolled back whatever
         operation came before it and the vertex was gone for good, and Add
         Vertex re-cloned the already-modified entity into c.orig so undo left
         the new vertex behind. Both were silent data loss. */
      begin();
      const nk = gripDo(e, g.k, c.action);
      if (nk === null) {                    /* Remove Vertex: nothing left to drag */
        commit('Remove vertex'); gripClearHot(); c.done = true; endCmd(); return;
      }
      if (nk !== g.k) {
        c.live = true;                      /* Add Vertex belongs to this edit */
        g.k = nk;
        const gs = gripsOf(e).find(x => x.k === nk);
        if (gs) { g.p = gs.p.slice(); c.base = gs.p.slice(); }
        c.orig.set(g.id, clone(e));
        c.action = 'stretch';
      } else {
        /* the action did not apply to this grip — abandon the journal rather
           than leave it open across the drag that follows */
        rollback();
      }
    }
    if (!c.base) { c.done = true; endCmd(); return; }
    hint(gripPrompt(c));
  },
  enter(c) {                                 /* Enter / Space steps the mode */
    gripLiveAbort(c);
    c.mode = GRIP_MODES[(GRIP_MODES.indexOf(c.mode) + 1) % GRIP_MODES.length];
    c.refA = null; c.refL = null; c.d0 = null; c.wantBase = false; c.refMode = false;
    ST.preview = null;
    echo('** ' + GRIP_TITLE[c.mode] + ' **');
    hint(gripPrompt(c));
    draw();
  },
  text(c, s) {
    if (/^x$/i.test(s)) { endCmd(); return true; }
    if (/^b$/i.test(s)) { c.wantBase = true; hint('Base point'); return true; }
    if (/^c$/i.test(s)) { c.copy = !c.copy; echo('Copy ' + (c.copy ? 'on' : 'off')); hint(gripPrompt(c)); return true; }
    if (/^u$/i.test(s)) { gripUndo(c); return true; }
    if ((c.mode === 'rotate' || c.mode === 'scale') && /^r$/i.test(s)) {
      c.refMode = true; hint(c.mode === 'rotate' ? 'Reference angle' : 'Reference length'); return true;
    }
    if (c.mode === 'rotate') {
      const v = parseFloat(s);
      if (isNaN(v)) return false;
      if (c.refMode && c.refA === null) { c.refA = rad(v); hint('New angle'); return true; }
      gripCommitXf(c, T.rot(c.base, rad(v) - (c.refA || 0)), 'Rotate'); return true;
    }
    if (c.mode === 'scale') {
      const v = c.refMode ? parseLen(s) : parseFloat(s);
      if (isNaN(v) || v <= 0) return false;
      if (c.refMode && c.refL === null) { c.refL = v; hint('New length'); return true; }
      gripCommitXf(c, T.scale(c.base, c.refL ? v / c.refL : v), 'Scale'); return true;
    }
    return false;
  },
  point(c, p) {
    if (c.wantBase) { c.base = p.slice(); c.wantBase = false; hint(gripPrompt(c)); return; }
    if (c.mode === 'stretch') { gripStretchCommit(c, p); return; }
    if (c.mode === 'rotate' && c.refMode && c.refA === null) { c.refA = ang(c.base, p); hint('New angle'); return; }
    if (c.mode === 'scale' && c.refMode && c.refL === null) { c.refL = Math.max(dist(c.base, p), 1e-9); hint('New length'); return; }
    const fn = gripXform(c, p);
    if (fn) gripCommitXf(c, fn, GRIP_TITLE[c.mode].charAt(0) + GRIP_TITLE[c.mode].slice(1).toLowerCase());
  },
  preview(c, p) {
    if (c.wantBase || !c.base) return null;
    if (c.mode === 'stretch') { gripStretchApply(c, p); return null; }
    const fn = gripXform(c, p);
    if (!fn) return null;
    if (c.mode === 'rotate' || c.mode === 'mirror') ST.tracks = [[c.base, p]];
    return gripEnts(c).map(e => xf(clone(e), fn));
  },
  done(c) {
    gripLiveAbort(c);
    gripClearHot();
    ST.gripBase = null; ST.gripAction = null;
  },
});

/** the transform the current mode describes for a cursor at p */
function gripXform(c, p) {
  const d = sub(p, c.base);
  if (c.mode === 'move') return T.move(d);
  if (c.mode === 'rotate') return T.rot(c.base, ang(c.base, p) - (c.refA || 0));
  if (c.mode === 'scale') {
    if (c.refMode && c.refL) return T.scale(c.base, Math.max(dist(c.base, p) / c.refL, 1e-9));
    if (!c.d0) c.d0 = Math.max(dist(c.base, p), 1e-9);
    return T.scale(c.base, Math.max(dist(c.base, p) / c.d0, 1e-9));
  }
  if (c.mode === 'mirror') return dist(c.base, p) < 1e-9 ? null : T.mirror(c.base, p);
  return null;
}
/** live stretch: every hot grip moves by the same delta, always measured from
    where it started, so re-applying it on each mouse move cannot accumulate */
function gripStretchApply(c, p) {
  if (!c.hot.length) return;
  gripLiveBegin(c);
  const d = sub(p, c.base);
  for (const g of c.hot) {
    const e = DOC.ents.get(g.id); if (!e) continue;
    const o = c.orig.get(g.id);
    const target = gripConstrain(e, g.k, c.action, [g.p[0] + d[0], g.p[1] + d[1]], o);
    try { applyGrip(e, gripEditKey(e, g.k, c.action), target, o); }
    catch (err) { /* a type that refuses this grip simply does not move */ }
  }
}
function gripStretchCommit(c, p) {
  gripStretchApply(c, p);
  if (c.copy) {
    /* the stretched shape becomes the copy; the originals go back */
    const made = gripEnts(c).map(e => clone(e));
    gripLiveAbort(c);
    begin();
    const idmap = {};
    for (const n of made) { const old = n.id; delete n.id; addEnt(n); idmap[old] = n.id; }
    for (const n of made) if ((n.t === 'door' || n.t === 'window') && idmap[n.host]) n.host = idmap[n.host];
    commit('Copy'); c.copies++;
    draw(); syncUI(); return;
  }
  c.live = false; commit('Stretch');
  gripSyncHot(); syncUI(); endCmd();
}
function gripCommitXf(c, fn, label) {
  const ents = gripEnts(c);
  begin();
  if (c.copy) {
    const idmap = {};
    const made = ents.map(e => { const n = clone(e); const old = n.id; delete n.id; addEnt(xf(n, fn)); idmap[old] = n.id; return n; });
    for (const n of made) if ((n.t === 'door' || n.t === 'window') && idmap[n.host]) n.host = idmap[n.host];
    commit(label + ' copy'); c.copies++;
    c.refA = null; c.refL = null; c.d0 = null; c.refMode = false;
    ST.preview = null; draw(); syncUI(); return;
  }
  ents.forEach(e => xf(e, fn));
  commit(label);
  gripSyncHot(); syncUI(); endCmd();
}
/** U inside a grip edit: take back the last copy, or the in-flight stretch */
function gripUndo(c) {
  if (c.copies > 0) { undo(); c.copies--; echo('Undo'); draw(); return; }
  gripLiveAbort(c);
  c.refA = null; c.refL = null; c.d0 = null; c.refMode = false;
  ST.preview = null; echo('Nothing to undo'); draw();
}
/** Ctrl inside a grip edit toggles Copy, exactly where AutoCAD puts it.
    With no edit running it steps the multifunctional menu instead. */
function gripCtrl() {
  if (CMD && CMD.def.key === 'gripedit') {
    CMD.copy = !CMD.copy;
    echo('Copy ' + (CMD.copy ? 'on' : 'off'));
    hint(gripPrompt(CMD));
    return true;
  }
  const it = gripMenuCycle(1);
  if (it) { echo(it.label); draw(); return true; }
  return false;
}
/** start a grip edit from a click on a grip. Shift only toggles hotness, so
    several grips can go hot and stretch together. */
function gripClick(g, additive) {
  if (!g) return false;
  if (additive) { gripSetHot(g, true); syncUI(); draw(); return false; }
  gripSetHot(g, false);
  ST.gripBase = g.p.slice();
  const m = ST.gripMenu && ST.gripMenu.id === g.id && ST.gripMenu.k === g.k ? ST.gripMenu : null;
  ST.gripAction = m ? m.items[m.idx].id : 'stretch';
  gripMenuClose();
  startCmd('gripedit');
  return true;
}

/** Is every point of a run on the straight line between its two ends? The
    tolerance is the same screen-sized one the join itself uses, so what looks
    straight at the zoom you are working at is treated as straight. */
function collinearRun(pts, tol) {
  const a = pts[0], b = pts[pts.length - 1];
  const L = dist(a, b);
  if (L < 1e-9) return false;
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  for (let i = 1; i < pts.length - 1; i++) {
    const vx = pts[i][0] - a[0], vy = pts[i][1] - a[1];
    const t = vx * ux + vy * uy;
    if (t < -tol || t > L + tol) return false;      /* doubles back on itself */
    if (Math.abs(vx * uy - vy * ux) > tol) return false;
  }
  return true;
}
