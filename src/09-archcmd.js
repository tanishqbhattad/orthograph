/* ============================================================
   ORTHOGRAPH — 09 architecture commands
   ============================================================ */
const ARCH = { wt: 'brk230', dt: 'sgl900', wtp: 'w1212', just: 'center', jmode: 'centre', wallH: 3000 };

/* ---------------- wall placement ----------------
   Architects place walls by centreline, inner face or outer face. Left and
   right are what the geometry actually stores; which of them "inner" means
   depends on which way round the chain being drawn encloses its space, so the
   winding is worked out as the chain grows and the walls already placed are
   re-justified the moment the first corner tells us the answer.            */
const JUST_MODES = ['centre', 'inner', 'outer'];
const justLabel = m => m === 'centre' ? 'centreline' : m === 'inner' ? 'inner face' : 'outer face';
/** +1 anticlockwise, -1 clockwise, 0 while the chain is still a straight line */
function chainWind(pts) {
  if (!pts || pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) a += cross(pts[i], pts[(i + 1) % pts.length]);
  if (Math.abs(a) < 1e-6) return 0;
  return a > 0 ? 1 : -1;
}
/** the stored justification for a placement mode and a chain winding.
    An anticlockwise ring encloses the space on the left of every leg. */
function justFor(mode, wind) {
  if (mode !== 'inner' && mode !== 'outer') return 'center';
  const inner = wind < 0 ? 'right' : 'left';
  return mode === 'inner' ? inner : (inner === 'left' ? 'right' : 'left');
}

/** Ortho and polar as hard constraints on the point the command accepts —
    not merely on the cursor. An object snap must never be able to slip a
    three degree wall past F8. */
function wallConstrain(ref, p) {
  if (!ref || !p) return p ? p.slice() : p;
  const d = sub(p, ref);
  if (Math.abs(d[0]) < 1e-12 && Math.abs(d[1]) < 1e-12) return p.slice();
  if (ST.ortho) {
    const q = Math.abs(d[0]) >= Math.abs(d[1]) ? [ref[0] + d[0], ref[1]] : [ref[0], ref[1] + d[1]];
    ST.tracks = [[ref, q]];
    return q;
  }
  if (ST.polar) {
    const inc = rad(ST.polarInc || 90);
    if (inc > 1e-9) {
      const a = Math.atan2(d[1], d[0]), k = Math.round(a / inc) * inc;
      if (Math.abs(wrapS(a - k)) < rad(3.2)) {
        const dir = [Math.cos(k), Math.sin(k)], L = dot(d, dir);
        if (L > EPS) { const q = add(ref, mul(dir, L)); ST.tracks = [[ref, q]]; return q; }
      }
    }
  }
  return p.slice();
}
/** unit direction from ref towards the cursor, after the same constraint */
function wallDir(ref, cur) {
  if (!ref || !cur) return null;
  const u = norm(sub(wallConstrain(ref, cur), ref));
  return (u[0] || u[1]) ? u : null;
}
function wallCmdT(c) { return (wallType(c.wt) || {}).t || 100; }
/** the point the wall command really commits to: constrained, then pulled onto
    a neighbouring node or centreline — but never at the cost of the constraint */
function wallAcceptPoint(c, p, raw) {
  const ref = c.pts.length ? c.pts[c.pts.length - 1] : null;
  const q = raw ? p.slice() : wallConstrain(ref, p);
  const s = wallCleanPoint(q, wallCmdT(c), null, ref);
  if (dist(s, q) < 1e-9) return q;
  if (!raw && ref && ST.ortho && dist(wallConstrain(ref, s), s) > 1e-6) return q;
  return s;
}
function wallHint(c) {
  const n = (wallType(c.wt) || {}).name;
  hint(`${c.pts.length ? 'Next point' : 'Wall start point'} · <em>T</em> type (${esc(n)})` +
    ` · <em>J</em> ${justLabel(c.jmode)}` +
    (c.pts.length > 1 ? ' · <em>C</em> close · <em>U</em> undo · <em>Enter</em> end' : ''));
}

defc('wall', {
  group: 'arch', hint: 'Wall start point',
  init(c) {
    c.pts = []; c.ids = []; c.wind = 0;
    c.wt = ARCH.wt; c.jmode = ARCH.jmode;
    c.th = ARCH.wallTh || null;                    /* a thickness override outlives the command */
    wallHint(c);
  },
  text(c, s) {
    if (/^t$/i.test(s)) { pickWallType(t => { c.wt = ARCH.wt = t; echo((wallType(t) || {}).name); wallHint(c); draw(); }); return true; }
    if (/^j$/i.test(s)) {
      c.jmode = ARCH.jmode = JUST_MODES[(JUST_MODES.indexOf(c.jmode) + 1) % JUST_MODES.length];
      if (c.ids && c.ids.length) { begin(); wallRejustify(c); commit('Placement'); }
      wallHint(c);
      echo('Placement: ' + justLabel(c.jmode)); draw(); return true;
    }
    if (/^c$/i.test(s) && c.pts.length > 2) {
      placeWall(c, c.pts[c.pts.length - 1], c.pts[0]); endCmd(); return true;
    }
    if (/^u$/i.test(s) && c.pts.length > 1) { undo(); c.pts.pop(); c.ids.pop(); wallRejustify(c); wallHint(c); return true; }
    const ref = c.pts.length ? c.pts[c.pts.length - 1] : null;
    /* typed coordinates are explicit and override ortho, exactly as in AutoCAD */
    if (/[@<,]/.test(s)) {
      const q = parseCoord(s, ref, ST.cur);
      if (q) { c.raw = true; cmdPoint(q); return true; }
    }
    const v = parseLen(s);                          /* a bare length runs along the lock */
    if (!isNaN(v) && v > 0 && ref) {
      const u = wallDir(ref, ST.cur);
      if (u) { c.raw = true; cmdPoint(add(ref, mul(u, v))); return true; }
    }
    return false;
  },
  point(c, p) {
    const raw = !!c.raw; c.raw = false;
    const q = wallAcceptPoint(c, p, raw);
    c.pts.push(q);
    if (c.pts.length >= 2) placeWall(c, c.pts[c.pts.length - 2], q);
    wallHint(c);
  },
  preview(c, p) {
    if (!c.pts.length) return null;
    const a = c.pts[c.pts.length - 1];
    const b = wallAcceptPoint(c, p, false);
    const wind = chainWind([...c.pts, b]) || c.wind;
    return [pv({ t: 'wall', a, b, wt: c.wt, th: c.th || null, just: justFor(c.jmode, wind),
      h: ARCH.wallH, lvl: DOC.curLevel, layer: 'A-WALL' })];
  },
  enter: () => endCmd(),
});
function placeWall(c, a, b) {
  if (dist(a, b) < 1) return null;
  begin();
  const w = addEnt({ t: 'wall', a: a.slice(), b: b.slice(), wt: c.wt, th: c.th || null,
    just: justFor(c.jmode, c.wind), h: ARCH.wallH, lvl: DOC.curLevel, layer: 'A-WALL' });
  (c.ids = c.ids || []).push(w.id);
  wallRejustify(c);
  commit('Wall');
  return w;
}
/** re-resolve inner/outer for the whole chain now that its winding is known.
    Only edits inside an open journal, so it is always undoable in one step. */
function wallRejustify(c) {
  c.wind = chainWind(c.pts);
  if (!c.ids || !c.ids.length || !JN.on) return;
  const j = justFor(c.jmode, c.wind);
  for (const id of c.ids) {
    const w = DOC.ents.get(id);
    if (w && w.t === 'wall' && w.just !== j) { mut(w); w.just = j; }
  }
}
function pickWallType(cb) {
  const list = DOC.wallTypes || [];
  modal(`<h3>Wall type</h3>
    <div class="row"><label>Type</label><select class="f" id="wt">${list.map(w =>
    `<option value="${w.id}" ${w.id === ARCH.wt ? 'selected' : ''}>${esc(w.name)} — ${fmt(w.t)}</option>`).join('')}</select></div>
    <div class="row"><label>Height</label><input class="f" id="wh" value="${+(ARCH.wallH / U[DOC.units]).toFixed(4)}"></div>
    <p style="margin-top:12px;font-size:11.5px">Add your own sizes under Architecture → Wall types.</p>`, () => {
    ARCH.wallH = parseLen($('#wh').value) || 3000;
    cb($('#wt').value);
  });
}

defc('wallrect', {
  group: 'arch', hint: 'First corner of the room',
  init: c => { c.pts = []; c.wt = ARCH.wt; c.jmode = ARCH.jmode; c.th = ARCH.wallTh || null; },
  text(c, s) {
    if (/^t$/i.test(s)) { pickWallType(t => { c.wt = ARCH.wt = t; draw(); }); return true; }
    if (/^j$/i.test(s)) {
      c.jmode = ARCH.jmode = JUST_MODES[(JUST_MODES.indexOf(c.jmode) + 1) % JUST_MODES.length];
      echo('Placement: ' + justLabel(c.jmode)); draw(); return true;
    }
    if (c.pts.length === 1) {
      const m = s.match(/^(.+?)[x,](.+)$/i);
      if (m) {
        const w = parseLen(m[1]), h = parseLen(m[2]);
        if (!isNaN(w) && !isNaN(h)) { buildWallRect(c, c.pts[0], [c.pts[0][0] + w, c.pts[0][1] + h]); endCmd(); return true; }
      }
    }
    return false;
  },
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length === 2) { buildWallRect(c, c.pts[0], p); endCmd(); }
    else hint(`Opposite corner · type <em>W,H</em> · <em>T</em> wall type · <em>J</em> ${justLabel(c.jmode)}`);
  },
  preview(c, p) {
    if (c.pts.length !== 1) return null;
    return wallRectPts(c.pts[0], p).map(([a, b]) =>
      pv({ t: 'wall', a, b, wt: c.wt, th: c.th || null, just: justFor(c.jmode, 1), layer: 'A-WALL' }));
  },
});
/* corners run anticlockwise, so the enclosed side is the left of every leg */
function wallRectPts(a, b) {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]];
}
function buildWallRect(c, a, b) {
  const segs = wallRectPts(a, b).filter(([p, q]) => dist(p, q) > 1);
  if (!segs.length) return;
  const just = justFor(c.jmode || 'centre', 1);
  begin();
  for (const [p, q] of segs)
    addEnt({ t: 'wall', a: p, b: q, wt: c.wt, th: c.th || null, just, h: ARCH.wallH, lvl: DOC.curLevel, layer: 'A-WALL' });
  commit('Room walls');
}

/* --- openings --- */
function openingCmd(kind) {
  return {
    group: 'arch',
    hint: kind === 'door' ? 'Click on a wall to place the door' : 'Click on a wall to place the window',
    init(c) {
      c.type = kind === 'door' ? ARCH.dt : ARCH.wtp;
      const T = kind === 'door' ? doorType(c.type) : winType(c.type);
      hint(`Click on a wall · <em>T</em> type (${(T || {}).name}) · <em>F</em> flip`);
    },
    text(c, s) {
      if (/^t$/i.test(s)) { pickOpenType(kind, t => { c.type = t; if (kind === 'door') ARCH.dt = t; else ARCH.wtp = t; draw(); }); return true; }
      if (/^f$/i.test(s)) { c.flip = !c.flip; echo('Flipped'); draw(); return true; }
      if (/^h$/i.test(s)) { c.hand = c.hand === -1 ? 1 : -1; echo('Hinge swapped'); draw(); return true; }
      return false;
    },
    point(c, p) {
      const hit = pickWallAt(p, px(40));
      if (!hit) return echo('Click on a wall');
      begin();
      const e = addOpening(kind, hit.w, hit.d, c.type);
      if (kind === 'door') { mut(e); e.flip = !!c.flip; e.hand = c.hand === -1 ? -1 : 1; }
      commit(kind === 'door' ? 'Door' : 'Window');
      SEL.clear(); SEL.add(e.id); syncUI();
    },
    preview(c, p) {
      const hit = pickWallAt(p, px(40));
      if (!hit) return null;
      const wd = kind === 'door' ? (doorType(c.type) || {}).w : (winType(c.type) || {}).w;
      const L = wallLen(hit.w);
      const pos = clamp(hit.d, wd / 2, Math.max(wd / 2, L - wd / 2));
      return [kind === 'door'
        ? pv({ t: 'door', host: hit.w.id, pos, dt: c.type, flip: !!c.flip, hand: c.hand === -1 ? -1 : 1, swing: 90, layer: 'A-DOOR' })
        : pv({ t: 'window', host: hit.w.id, pos, wtp: c.type, layer: 'A-GLAZ' })];
    },
  };
}
defc('door', openingCmd('door'));
defc('window', openingCmd('window'));
function pickOpenType(kind, cb) {
  const list = kind === 'door' ? DOC.doorTypes : DOC.winTypes;
  const cur = kind === 'door' ? ARCH.dt : ARCH.wtp;
  modal(`<h3>${kind === 'door' ? 'Door' : 'Window'} type</h3>
    <div class="row"><label>Type</label><select class="f" id="ot">${list.map(w =>
    `<option value="${w.id}" ${w.id === cur ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>`,
    () => cb($('#ot').value));
}

/* --- column --- */
defc('column', {
  group: 'arch', hint: 'Column position · <em>T</em> size · <em>R</em> round',
  init(c) { c.w = ARCH.colW || 400; c.d = ARCH.colD || 400; c.shape = ARCH.colShape || 'rect'; },
  text(c, s) {
    if (/^r$/i.test(s)) { c.shape = ARCH.colShape = c.shape === 'round' ? 'rect' : 'round'; echo(c.shape); return true; }
    const m = s.match(/^(?:t\s*)?(.+?)[x,](.+)$/i);
    if (m) { const w = parseLen(m[1]), d = parseLen(m[2]); if (!isNaN(w) && !isNaN(d)) { c.w = ARCH.colW = w; c.d = ARCH.colD = d; echo(fmt(w) + ' × ' + fmt(d)); return true; } }
    const v = parseLen(s);
    if (!isNaN(v) && v > 0) { c.w = c.d = ARCH.colW = ARCH.colD = v; echo(fmt(v)); return true; }
    return false;
  },
  point(c, p) {
    begin();
    addEnt({ t: 'column', p, w: c.w, d: c.d, shape: c.shape, rot: 0, lvl: DOC.curLevel, layer: 'A-COLS' });
    commit('Column');
  },
  preview: (c, p) => [pv({ t: 'column', p, w: c.w, d: c.d, shape: c.shape, rot: 0, layer: 'A-COLS' })],
});

/* --- stair --- */
defc('stair', {
  group: 'arch', hint: 'Start of the flight · <em>W</em> width · <em>N</em> risers · <em>L</em>/<em>U</em> shape · <em>T</em> turn',
  init(c) {
    c.pts = []; c.w = ARCH.stairW || 1000; c.risers = ARCH.risers || 16;
    c.kind = ARCH.stairKind || 'straight'; c.turn = ARCH.stairTurn || 1;
    hint(`Start of the flight · ${c.kind} · <em>W</em> width · <em>N</em> risers · <em>L</em>/<em>U</em> shape · <em>T</em> turn`);
  },
  text(c, s) {
    let m = s.match(/^w\s*(.+)$/i);
    if (m) { const v = parseLen(m[1]); if (!isNaN(v) && v > 0) { c.w = ARCH.stairW = v; echo('Width ' + fmt(v)); return true; } }
    m = s.match(/^n\s*(\d+)$/i);
    if (m) { c.risers = ARCH.risers = clamp(parseInt(m[1]), 2, 60); echo(c.risers + ' risers'); return true; }
    if (/^(s|straight)$/i.test(s)) { c.kind = ARCH.stairKind = 'straight'; echo('Straight flight'); return true; }
    if (/^l$/i.test(s)) { c.kind = ARCH.stairKind = 'L'; echo('L-shaped with a landing'); return true; }
    if (/^u$/i.test(s)) { c.kind = ARCH.stairKind = 'U'; echo('U-shaped with a landing'); return true; }
    if (/^t$/i.test(s)) { c.turn = ARCH.stairTurn = (c.turn === -1 ? 1 : -1); echo('Turns ' + (c.turn === -1 ? 'right' : 'left')); draw(); return true; }
    return false;
  },
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length === 2) {
      begin();
      const lv = (DOC.levels || [])[DOC.curLevel] || {};
      addEnt(stairEnt(c, c.pts[0], p, lv));
      commit('Stair'); endCmd();
    } else hint('End of the first flight · <em>T</em> flips the turn');
  },
  preview(c, p) {
    return c.pts.length === 1 ? [pv(stairEnt(c, c.pts[0], p, (DOC.levels || [])[DOC.curLevel] || {}))] : null;
  },
});
function stairEnt(c, a, b, lv) {
  return {
    t: 'stair', a, b, w: c.w, risers: c.risers, rise: (lv.h || 3000) / c.risers,
    kind: c.kind || 'straight', turn: c.turn === -1 ? -1 : 1, landing: c.w,
    dir: 1, lvl: DOC.curLevel, layer: 'A-FLOR-STRS',
  };
}

/* --- room / area --- */
defc('room', {
  group: 'arch', hint: 'Click inside an enclosed space, or pick corners then <em>Enter</em>',
  init: c => { c.pts = []; },
  point(c, p) {
    if (!c.pts.length) {
      const ring = roomTrace(p, DOC.curLevel);
      if (ring) { makeRoom(ring, p); endCmd(); return; }
      echo('That spot is not enclosed — pick corners instead, or close the walls');
    }
    c.pts.push(p);
    hint('Next corner · <em>Enter</em> to finish · <em>Esc</em> to cancel');
  },
  preview(c, p) {
    if (c.pts.length) return [pv({ t: 'pline', pts: [...c.pts, p], closed: true })];
    /* live outline of whatever encloses the cursor */
    const ring = roomTrace(p, DOC.curLevel);
    return ring ? [pv({ t: 'pline', pts: ring, closed: true })] : null;
  },
  enter(c) { if (c.pts.length > 2) makeRoom(c.pts, null); endCmd(); },
});
function makeRoom(pts, seed) {
  const uOpts = [['auto', 'follow the drawing'], ['m2', 'm²'], ['sqcm', 'cm²'], ['sqmm', 'mm²'], ['ft2', 'ft²'], ['in2', 'in²']];
  const aOpts = [['none', 'none'], ['m2', 'm²'], ['ft2', 'ft²'], ['sqcm', 'cm²'], ['in2', 'in²']];
  modal(`<h3>Room</h3>
    <div class="row"><label>Name</label><input class="f" id="rn" value="ROOM"></div>
    <div class="row"><label>Show area</label><select class="f" id="ra"><option value="1">yes</option><option value="0">no</option></select></div>
    <div class="row"><label>Area units</label><select class="f" id="ru">${uOpts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
    <div class="row"><label>Also show</label><select class="f" id="rl">${aOpts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
    ${seed ? '<p style="margin-top:12px;font-size:11.5px">This room follows its walls — move one and the area updates.</p>' : ''}`, () => {
    begin();
    const alt = $('#rl').value;
    const n = addEnt({
      t: 'room', pts, seed: seed ? seed.slice() : null, auto: !!seed,
      name: ($('#rn').value || '').trim().toUpperCase(),
      showArea: $('#ra').value === '1',
      areaUnits: $('#ru').value, altUnits: alt === 'none' ? null : alt,
      h: DOC.textH * 1.4, lvl: DOC.curLevel, layer: 'A-AREA',
    });
    SEL.clear(); SEL.add(n.id);
    commit('Room'); syncUI();
  });
}
/* --- structural grid --- */
defc('grid', {
  group: 'arch', hint: 'Grid line start · type a label first if you like', init(c) { c.pts = []; c.label = nextGridLabel(); },
  text(c, s) { if (s && !c.pts.length) { c.label = s.toUpperCase(); echo('Label ' + c.label); return true; } return false; },
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length === 2) {
      begin();
      addEnt({ t: 'grid', a: c.pts[0], b: p, label: c.label, br: DOC.textH * 2.2, lvl: DOC.curLevel, layer: 'A-GRID' });
      commit('Grid line');
      c.pts = []; c.label = nextGridLabel(); hint('Grid line start (' + c.label + ')');
    } else hint('Grid line end');
  },
  preview: (c, p) => c.pts.length === 1 ? [pv({ t: 'grid', a: c.pts[0], b: p, label: c.label, br: DOC.textH * 2.2, layer: 'A-GRID' })] : null,
});
function nextGridLabel() {
  const used = new Set([...DOC.ents.values()].filter(e => e.t === 'grid').map(e => e.label));
  for (const ch of 'ABCDEFGHJKLMNPQRSTUVWXYZ') if (!used.has(ch)) return ch;
  for (let i = 1; i < 200; i++) if (!used.has(String(i))) return String(i);
  return '?';
}

/* --- wall utilities --- */
defc('wallflip', {
  group: 'arch', hint: 'Click a door or window to flip it',
  point(c, p) {
    const e = pickAt(p, 12, x => x.t === 'door' || x.t === 'window');
    if (!e) return echo('Pick a door or a window');
    begin(); mut(e);
    if (e.t === 'door' && ST.shift) e.hand = e.hand === -1 ? 1 : -1; else e.flip = !e.flip;
    commit('Flipped'); draw();
  },
});
/* WALLJOIN — pick two walls and their corner is solved, or clean a whole
   selection of near-miss corners in one go. Esc leaves nothing behind. */
defc('walljoin', {
  group: 'arch', needSel: true,
  selHint: 'Select the walls to clean up and press <em>Enter</em> — or press <em>Enter</em> now to pick two',
  init(c) {
    c.w = null;
    const ws = selEnts().filter(e => e.t === 'wall');
    if (ws.length >= 2) { cleanWallSet(ws); return endCmd(); }
    if (ws.length === 1) { c.w = ws[0]; hint('Pick the wall to join it to · <em>Esc</em> cancel'); return; }
    hint('Pick the first wall · <em>Esc</em> cancel');
  },
  point(c, p) {
    const w = pickAt(p, 14, e => e.t === 'wall');
    if (!w) return echo('Pick a wall');
    if (!c.w) {
      c.w = w; SEL.clear(); SEL.add(w.id); syncUI();
      echo('First wall — now pick the one it should meet');
      hint('Pick the wall to join it to · <em>Esc</em> cancel');
      return;
    }
    if (w.id === c.w.id) return echo('Pick a different wall');
    joinTwoWalls(c.w, w);
    endCmd();
  },
  done() { SEL.clear(); },
});
/** move the nearest end of each wall onto the true centreline intersection */
function joinTwoWalls(A, B) {
  const X = xLineLine(A.a, A.b, B.a, B.b, true);
  if (!X.length) { echo('Those two walls are parallel'); return; }
  const P = X[0];
  const reach = w => Math.max(wallLen(w) * 0.75, wallT(w) * 10);
  const ea = dist(A.a, P) <= dist(A.b, P) ? 'a' : 'b';
  const eb = dist(B.a, P) <= dist(B.b, P) ? 'a' : 'b';
  if (dist(A[ea], P) > reach(A) || dist(B[eb], P) > reach(B)) {
    echo('Those two walls do not meet anywhere near their ends'); return;
  }
  begin();
  for (const [w, e] of [[A, ea], [B, eb]]) {
    const L0 = wallLen(w);
    mut(w); w[e] = P.slice();
    if (e === 'a') wallShiftOpenings(w, wallLen(w) - L0);
    wallReclampOpenings(w);
  }
  commit('Walls joined');
}
/** pull every near-miss corner in a set onto its solved intersection */
function cleanWallSet(ws) {
  const tol = ws.reduce((m, w) => Math.max(m, wallT(w)), 100) * 1.5;
  begin();
  let n = 0;
  for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
    const A = ws[i], B = ws[j];
    for (const ea of ['a', 'b']) for (const eb of ['a', 'b']) {
      const d = dist(A[ea], B[eb]);
      if (d <= 1e-9 || d > tol) continue;
      const X = xLineLine(A.a, A.b, B.a, B.b, true);
      const P = (X.length && dist(X[0], A[ea]) <= tol * 2) ? X[0] : mid(A[ea], B[eb]);
      mut(A); A[ea] = P.slice(); mut(B); B[eb] = P.slice(); n++;
    }
  }
  for (const w of ws) wallReclampOpenings(w);
  commit(n ? `Cleaned ${n} corner${n > 1 ? 's' : ''}` : 'Nothing to clean up');
}

/* WALLSPLIT — click the wall, then the split point. A click that already
   lands on a sensible spot does both in one go. */
defc('wallsplit', {
  group: 'arch', hint: 'Click the wall you want to split · <em>Esc</em> cancel',
  init(c) { c.w = null; },
  text(c, s) {
    if (!c.w) return false;
    const d = parseLen(s);                          /* type the distance from the start */
    if (isNaN(d)) return false;
    doWallSplit(c, d); return true;
  },
  point(c, p) {
    if (!c.w || !DOC.ents.get(c.w.id)) {
      const hit = pickWallAt(p, px(30));
      if (!hit) return echo('Click on a wall to split it');
      c.w = hit.w; SEL.clear(); SEL.add(hit.w.id);
      const L = wallLen(hit.w);
      if (hit.d > 10 && hit.d < L - 10) return doWallSplit(c, hit.d);
      echo('Now pick the point to split at');
      hint(`Split point along the wall (0 – ${fmt(L)}) · type a distance · <em>Esc</em> cancel`);
      return;
    }
    doWallSplit(c, dot(sub(p, c.w.a), wallU(c.w)));
  },
  preview(c, p) {
    if (!c.w || !DOC.ents.get(c.w.id)) return null;
    const u = wallU(c.w), d = clamp(dot(sub(p, c.w.a), u), 0, wallLen(c.w));
    const q = add(c.w.a, mul(u, d)), n = mul(perp(u), wallT(c.w));
    return [pv({ t: 'line', a: sub(q, n), b: add(q, n), lt: 'dashed', layer: 'A-WALL' })];
  },
  done() { SEL.clear(); },
});
function doWallSplit(c, d) {
  const w = c.w && DOC.ents.get(c.w.id);
  if (!w) { echo('That wall has gone'); return endCmd(); }
  const L = wallLen(w);
  if (!(d > 10 && d < L - 10)) return echo('Too close to the end — pick a point along the wall');
  const u = wallU(w), split = add(w.a, mul(u, d));
  begin();
  const b0 = w.b;
  mut(w); w.b = split;
  const n = addEnt({ t: 'wall', a: split, b: b0, wt: w.wt, th: w.th, just: w.just,
    hatch: w.hatch, h: w.h, lvl: w.lvl, layer: w.layer });
  /* re-home openings that now sit past the split */
  for (const o of (openingsByHost().get(w.id) || [])) {
    if (o.pos > d) { mut(o); o.host = n.id; o.pos -= d; }
  }
  commit('Wall split');
  SEL.clear(); SEL.add(n.id);
  c.w = null;
  hint('Click the wall you want to split · <em>Esc</em> cancel');
}

/* ---------------- area measurement ---------------- */
defc('area', {
  group: 'arch',
  hint: 'Click inside a space to measure it · <em>B</em> basis · <em>C</em> category · <em>M</em> draw by hand',
  init(c) {
    c.pts = [];
    c.basis = ARCH.areaBasis || 'net';
    c.cat = ARCH.areaCat || 'carpet';
    c.manual = false;
    areaHint(c);
  },
  text(c, s) {
    if (/^b$/i.test(s)) {
      const ks = AREA_BASES.map(x => x[0]).filter(k => k !== 'manual');
      c.basis = ARCH.areaBasis = ks[(ks.indexOf(c.basis) + 1) % ks.length];
      echo(areaBasisLabel(c.basis)); areaHint(c); buildProps(); draw(); return true;
    }
    if (/^c$/i.test(s)) {
      const ks = AREA_CATS.map(x => x[0]);
      c.cat = ARCH.areaCat = ks[(ks.indexOf(c.cat) + 1) % ks.length];
      echo(areaCatLabel(c.cat)); areaHint(c); buildProps(); draw(); return true;
    }
    if (/^m$/i.test(s)) { c.manual = !c.manual; c.pts = []; areaHint(c); draw(); return true; }
    if (/^s$/i.test(s)) { openAreaSchedule(); return true; }
    return false;
  },
  point(c, p) {
    if (!c.manual) {
      const ring = areaTrace(p, DOC.curLevel, c.basis);
      if (ring) { makeArea(c, ring, p); endCmd(); return; }
      echo('That spot is not enclosed — press <em>M</em> to draw the boundary by hand');
      return;
    }
    c.pts.push(p);
    hint('Next corner · <em>Enter</em> to close the area · <em>Esc</em> to cancel');
  },
  preview(c, p) {
    if (c.manual) return c.pts.length ? [pv({ t: 'pline', pts: [...c.pts, p], closed: true })] : null;
    const ring = areaTrace(p, DOC.curLevel, c.basis);
    return ring ? [pv({ t: 'pline', pts: ring, closed: true })] : null;
  },
  enter(c) { if (c.manual && c.pts.length > 2) makeArea(c, c.pts, null); endCmd(); },
});
function areaHint(c) {
  hint(`${c.manual ? 'Pick the corners' : 'Click inside a space'} · <em>B</em> ${areaBasisLabel(c.basis)} · ` +
    `<em>C</em> ${areaCatLabel(c.cat)} · <em>M</em> ${c.manual ? 'auto' : 'by hand'} · <em>S</em> schedule`);
}
function makeArea(c, ring, seed) {
  const factorFor = k => (k === 'balcony' ? 0.5 : 1);
  modal(`<h3>Area</h3>
    <div class="row"><label>Name</label><input class="f" id="an" value="AREA"></div>
    <div class="row"><label>Category</label><select class="f" id="ac">${AREA_CATS.map(([v, t]) =>
    `<option value="${v}" ${v === c.cat ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
    <div class="row"><label>Basis</label><select class="f" id="ab">${AREA_BASES.map(([v, t]) =>
    `<option value="${v}" ${v === (seed ? c.basis : 'manual') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
    <div class="row"><label>Count at</label><input class="f" id="af" value="${factorFor(c.cat)}"></div>
    <div class="row"><label>Deduct columns</label><select class="f" id="ad">
      <option value="1" ${DEDUCT_COLUMNS_BY_DEFAULT[c.cat] ? 'selected' : ''}>yes</option>
      <option value="0" ${DEDUCT_COLUMNS_BY_DEFAULT[c.cat] ? '' : 'selected'}>no</option></select></div>
    ${seed ? '<p style="margin-top:12px;font-size:11.5px">This area follows its walls — move one and it re-measures.</p>' : ''}`, () => {
    begin();
    const n = addEnt({
      t: 'area', pts: ring, seed: seed ? seed.slice() : null,
      basis: seed ? $('#ab').value : 'manual',
      name: ($('#an').value || '').trim().toUpperCase(),
      cat: $('#ac').value,
      factor: parseFloat($('#af').value) || 1,
      deductColumns: $('#ad').value === '1',
      holes: [], h: DOC.textH * 1.3, lvl: DOC.curLevel, layer: annoLayer('A-AREA'),
    });
    SEL.clear(); SEL.add(n.id);
    commit('Area'); syncUI();
  });
}
defc('areasched', { group: 'inquiry', init() { openAreaSchedule(); endCmd(); } });

/** the schedule: every measured area, grouped, totalled, with FAR */
function openAreaSchedule() {
  const S = areaSchedule();
  if (!S.rows.length) { toast('No areas measured yet — run AREA and click inside a space'); return; }
  const u = DOC.areaUnits || 'auto';
  const fa = v => (typeof areaIn === 'function' ? areaIn(v, u) : fmtArea(v));
  const rows = S.rows.map(r => `<tr>
      <td>${esc(r.name)}${r.enclosed ? '' : ' <b style="color:var(--rose)">⚠</b>'}</td>
      <td>${esc(areaCatLabel(r.cat))}</td>
      <td class="n">${esc(fa(r.gross))}</td>
      <td class="n">${r.factor === 1 ? '' : '×' + r.factor}</td>
      <td class="n"><b>${esc(fa(r.net))}</b></td></tr>`).join('');
  const cats = Object.keys(S.byCat).map(k =>
    `<tr><td colspan="2">${esc(areaCatLabel(k))} <i>(${S.byCat[k].n})</i></td>
       <td colspan="3" class="n"><b>${esc(fa(S.byCat[k].net))}</b></td></tr>`).join('');
  modal(`<h3>Area schedule</h3>
    <style>
      .asch{width:100%;border-collapse:collapse;font-size:11.5px}
      .asch td{padding:4px 5px;border-bottom:1px solid var(--bd)}
      .asch .n{text-align:right;font-family:var(--mono)}
      .asch thead td{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--tx2)}
      .asch i{color:var(--tx2);font-style:normal}
      .asum td{border-top:1px solid var(--bd2);border-bottom:none;padding-top:7px}
    </style>
    <table class="asch"><thead><tr><td>Name</td><td>Category</td><td class="n">Measured</td><td class="n">Factor</td><td class="n">Counts</td></tr></thead>
      <tbody>${rows}</tbody>
      <tbody class="asum">${cats}
        <tr><td colspan="2"><b>Total</b></td><td colspan="3" class="n"><b>${esc(fa(S.total))}</b></td></tr>
        <tr><td colspan="2">Gross floor area</td><td colspan="3" class="n">${esc(fa(S.gfa))}</td></tr>
      </tbody></table>
    <div class="row" style="margin-top:12px"><label>Plot area</label><input class="f" id="apl" value="${DOC.plotArea ? dispNum(DOC.plotArea) : ''}" placeholder="for FAR"></div>
    <div class="row"><label>FAR / FSI</label><span class="ro">${S.far == null ? '—' : S.far.toFixed(3)}</span></div>`, () => {
    const v = parseLen($('#apl').value);
    DOC.plotArea = isNaN(v) ? 0 : v;
    openAreaSchedule();
  });
  $('#mo').textContent = 'Update';
}
