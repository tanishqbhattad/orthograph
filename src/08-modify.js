/* ============================================================
   ORTHOGRAPH — 08 modify, inquiry, blocks
   ============================================================ */

/** delete honouring hosted openings */
function eraseEnt(id) {
  const e = DOC.ents.get(id);
  if (e && e.t === 'wall') delWallCascade(id); else delEnt(id);
}

defc('move', {
  needSel: true, group: 'modify', hint: 'Base point', init: c => c.pts = [],
  point(c, p) {
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
  needSel: true, group: 'modify', hint: 'Base point', init: c => c.pts = [],
  point(c, p) {
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
  needSel: true, group: 'modify', hint: 'Base point', init: c => { c.pts = []; c.refA = null; },
  text(c, s) {
    if (c.pts.length !== 1) return false;
    if (/^r$/i.test(s)) { c.mode = 'ref'; hint('Reference angle — click two points or type it'); return true; }
    const v = parseFloat(s);
    if (isNaN(v)) return false;
    if (c.mode === 'ref' && c.refA === null) { c.refA = rad(v); hint('New angle'); return true; }
    const a = c.refA === null ? rad(v) : rad(v) - c.refA;
    begin(); selEnts().forEach(e => xf(e, T.rot(c.pts[0], a))); commit('Rotate'); endCmd(); return true;
  },
  point(c, p) {
    if (!c.pts.length) { c.pts.push(p); c.src = selEnts().map(clone); hint('Rotation angle · click or type degrees · <em>R</em> reference'); return; }
    if (c.mode === 'ref' && c.refA === null) { c.refA = ang(c.pts[0], p); hint('New angle'); return; }
    const a = ang(c.pts[0], p) - (c.refA || 0);
    begin(); selEnts().forEach(e => xf(e, T.rot(c.pts[0], a))); commit('Rotate'); endCmd();
  },
  preview(c, p) {
    if (c.pts.length !== 1) return null;
    const a = ang(c.pts[0], p) - (c.refA || 0);
    ST.tracks = [[c.pts[0], p]];
    return (c.src || []).map(e => xf(clone(e), T.rot(c.pts[0], a)));
  },
});
defc('scale', {
  needSel: true, group: 'modify', hint: 'Base point', init: c => { c.pts = []; c.d0 = null; c.refL = null; },
  text(c, s) {
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
      hint('Scale factor · drag, type a number, or <em>R</em> reference'); return;
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
function applyScale(c, f) {
  begin(); selEnts().forEach(e => xf(e, T.scale(c.pts[0], f))); commit('Scale'); endCmd();
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
  group: 'modify', hint: 'Offset distance · <em>T</em> through point', init: c => { c.d = null; c.e = null; c.thru = false; },
  text(c, s) {
    if (/^t$/i.test(s)) { c.thru = true; c.d = 0; hint('Select the object to offset'); return true; }
    if (c.d === null) { const v = parseLen(s); if (!isNaN(v) && v > 0) { c.d = v; hint('Select the object to offset'); return true; } }
    return false;
  },
  point(c, p) {
    if (c.d === null) { echo('Type a distance first'); return; }
    if (!c.e) {
      const e = pickAt(p, 10, x => !GEOM[x.t] && x.t !== 'dim' && x.t !== 'text');
      if (!e) return;
      c.e = e; SEL.clear(); SEL.add(e.id); hint(c.thru ? 'Through point' : 'Side to offset'); return;
    }
    const d = c.thru ? entDist(p, c.e) : c.d;
    const n = offsetEnt(c.e, d, offsetSide(c.e, p));
    if (n) { begin(); addEnt(Object.assign(n, { layer: c.e.layer, color: c.e.color, lt: c.e.lt, lw: c.e.lw })); commit('Offset'); }
    c.e = null; SEL.clear(); hint('Select the object to offset');
  },
  preview(c, p) {
    if (!c.e || c.d === null) return null;
    const d = c.thru ? entDist(p, c.e) : c.d;
    const n = offsetEnt(c.e, d, offsetSide(c.e, p));
    return n ? [Object.assign(n, { layer: c.e.layer })] : null;
  },
  done() { SEL.clear(); },
});
defc('trim', {
  group: 'modify', hint: 'Click the piece to remove · hold <em>Shift</em> to extend instead',
  point(c, p) {
    const e = pickAt(p, 10, x => !GEOM[x.t]);
    if (!e) return;
    const others = [...DOC.ents.values()].filter(x => x.id !== e.id && visible(x) && !GEOM[x.t]);
    if (ST.shift) {
      const n = extendTo(e, p, others);
      if (n) { begin(); mut(e); Object.assign(e, n); commit('Extend'); } else echo('No boundary in that direction');
      return;
    }
    const parts = trimAt(e, p, others);
    if (!parts) return echo('No cutting edge crosses that object');
    begin(); const meta = { layer: e.layer, color: e.color, lt: e.lt, lw: e.lw };
    delEnt(e.id);
    parts.forEach(n => addEnt(Object.assign(n, meta)));
    commit('Trim');
  },
});
defc('extend', {
  group: 'modify', hint: 'Click near the end you want to extend',
  point(c, p) {
    const e = pickAt(p, 10, x => !GEOM[x.t]); if (!e) return;
    const others = [...DOC.ents.values()].filter(x => x.id !== e.id && visible(x) && !GEOM[x.t]);
    const n = extendTo(e, p, others);
    if (n) { begin(); mut(e); Object.assign(e, n); commit('Extend'); }
    else echo('No boundary in that direction');
  },
});
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
  group: 'modify', hint: 'Type a radius, then pick two objects · <em>P</em> polyline',
  init: c => { c.r = DOC.filletR ?? 0; c.a = null; hint('Radius ' + fmt(c.r) + ' — type a new one or pick the first object'); },
  text(c, s) {
    if (/^p$/i.test(s)) { c.polyMode = true; hint('Pick a polyline to fillet every corner'); return true; }
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
    pullEnd(c.a, f.P, f.t1); pullEnd(e, f.P, f.t2);
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
  group: 'modify', hint: 'Type a distance, then pick two lines',
  init: c => { c.d = DOC.chamD ?? 0; c.d2 = null; c.a = null; hint('Distance ' + fmt(c.d) + ' — type a new one or pick the first line'); },
  text(c, s) {
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
    pullEnd(c.a, P, t1); pullEnd(e, P, t2);
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
defc('join', {
  needSel: true, group: 'modify',
  init(c) {
    const es = selEnts().filter(e => e.t === 'line' || e.t === 'pline');
    if (es.length < 2) { echo('Select two or more lines or polylines'); return endCmd(); }
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
      const n = addEnt(Object.assign({ t: 'pline', pts: closed ? ch.slice(0, -1) : ch, closed }, meta));
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
function insertEnts(ins) {
  const b = (DOC.blocks || {})[ins.name];
  if (!b) return [];
  const cs = Math.cos(ins.rot || 0), sn = Math.sin(ins.rot || 0);
  const sx = ins.sx == null ? 1 : ins.sx, sy = ins.sy == null ? 1 : (ins.sy == null ? sx : ins.sy);
  const f = p => {
    const q = [(p[0] - b.base[0]) * sx, (p[1] - b.base[1]) * sy];
    return [ins.p[0] + q[0] * cs - q[1] * sn, ins.p[1] + q[0] * sn + q[1] * cs];
  };
  return b.ents.map(e => { const n = clone(e); delete n.id; n.layer = n.layer === '0' ? ins.layer : n.layer; return xf(n, f); });
}
GEOM.insert = {
  shapes(ins, tol) {
    const out = [];
    for (const e of insertEnts(ins)) out.push(...(GEOM[e.t] ? shapes(e, tol) : shapesOfPrimitive(e, tol)));
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
defc('hatch', {
  group: 'draw', hint: 'Click inside a closed shape, or select shapes first then <em>Enter</em>',
  init(c) {
    if (SEL.size) { hatchFrom(selEnts()); endCmd(); }
  },
  point(c, p) {
    const loops = findEnclosing(p);
    if (!loops.length) return echo('No closed boundary around that point');
    hatchFrom(loops);
  },
});
/** closed entities whose interior contains p, smallest area first */
function findEnclosing(p) {
  const hits = [];
  for (const e of DOC.ents.values()) {
    if (!visible(e)) continue;
    let ring = null;
    if ((e.t === 'pline' || e.t === 'spline') && e.closed) ring = e.pts;
    else if (e.t === 'circle' || e.t === 'ellipse') ring = poly(e, 64);
    else if (e.t === 'room') ring = e.pts;
    else if (e.t === 'wall') ring = wallOutline(e);
    if (!ring || ring.length < 3) continue;
    if (pointInPoly(p, ring)) hits.push({ e, a: polyArea(ring) });
  }
  hits.sort((x, y) => x.a - y.a);
  return hits.length ? [hits[0].e] : [];
}
function hatchFrom(ents) {
  const loops = [];
  for (const e of ents) {
    if ((e.t === 'pline' || e.t === 'spline') && e.closed) loops.push(e.pts);
    else if (e.t === 'circle' || e.t === 'ellipse') loops.push(poly(e, 64));
    else if (e.t === 'room') loops.push(e.pts);
    else if (e.t === 'wall') loops.push(wallOutline(e));
  }
  if (!loops.length) return echo('Select closed shapes to hatch');
  modal(`<h3>Hatch</h3>
    <div class="row"><label>Pattern</label><select class="f" id="hp">
      <option value="line">Diagonal lines</option><option value="cross">Cross hatch</option><option value="solid">Solid fill</option></select></div>
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
  area: h => (h.loops || []).reduce((a, L) => a + polyArea(L), 0),
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
defc('quickarea', {
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
