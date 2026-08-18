/* ============================================================
   ORTHOGRAPH — 07 command engine + drawing commands
   ============================================================ */
let CMD = null;
const CMDS = {};
/** menu grouping: 'draw' | 'modify' | 'annotate' | 'inquiry' | 'arch' */
function defc(key, o) { CMDS[key] = Object.assign({ key, group: 'draw' }, o); }

function parseCoord(s, ref, cursor) {
  s = s.trim().replace(/\s+/g, '');
  if (!s) return null;
  let rel = false;
  if (s[0] === '@') { rel = true; s = s.slice(1); }
  let m = s.match(/^(.+?)<(-?[\d.]+)$/);            /* polar  d<angle */
  if (m) {
    const d = parseLen(m[1]), a = rad(parseFloat(m[2]));
    if (isNaN(d)) return null;
    const base = rel ? (ref || [0, 0]) : [0, 0];
    return [base[0] + d * Math.cos(a), base[1] + d * Math.sin(a)];
  }
  m = s.match(/^(.+?),(.+)$/);                      /* x,y */
  if (m) {
    const x = parseLen(m[1]), y = parseLen(m[2]);
    if (isNaN(x) || isNaN(y)) return null;
    const base = rel ? (ref || [0, 0]) : [0, 0];
    return [base[0] + x, base[1] + y];
  }
  const d = parseLen(s);                            /* plain distance along cursor direction */
  if (!isNaN(d) && ref && cursor) {
    const u = norm(sub(cursor, ref));
    if (hyp(u[0], u[1]) < .5) return null;
    return [ref[0] + u[0] * d, ref[1] + u[1] * d];
  }
  return null;
}

function startCmd(key, arg) {
  endCmd(true);
  const def = CMDS[key];
  if (!def) { echo('Unknown command: ' + key); return; }
  const c = { def, pts: [], step: 0, data: {}, arg };
  CMD = c;
  ST.lastCmd = key;                                /* Space repeats this */
  ST.tool = key; ST.drawing = true; ST.preview = null;
  if (def.needSel && !SEL.size) { c.phase = 'sel'; hint(def.selHint || 'Select objects, then press <em>Enter</em>'); }
  else { c.phase = 'run'; if (def.init) def.init(c); if (def.hint && !c.done) hint(def.hint); }
  syncTools();
  /* the panel shows what is about to be drawn, so it has to follow the tool */
  if (typeof buildProps === 'function') buildProps();
  draw();
}
function endCmd(silent) {
  if (typeof dynKill === 'function') dynKill();
  if (CMD && CMD.def.done) { try { CMD.def.done(CMD); } catch (e) { console.error(e); } }
  const had = !!CMD;
  CMD = null; ST.drawing = false; ST.preview = null; ST.tool = 'select'; ST.tracks = null;
  if (!silent) { hint(''); syncTools(); draw(); }
  if (had && typeof buildProps === 'function') buildProps();
}
function cmdPoint(p) {
  const c = CMD; if (!c) return;
  if (c.phase === 'sel') return;
  try { c.def.point(c, p); } catch (e) { console.error(e); echo('That did not work'); }
  ST.lastPt = p;
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
    return false;
  }
  /* an option the command understood may have changed what is about to be
     drawn — J flips the alignment, T swaps the type — so refresh the panel */
  if (c.def.text && c.def.text(c, s)) {
    if (typeof buildProps === 'function') buildProps();
    return true;
  }
  const ref = c.pts.length ? c.pts[c.pts.length - 1] : null;
  const p = parseCoord(s, ref, ST.cur);
  if (p) { cmdPoint(p); return true; }
  return false;
}
function cmdEnter() {
  const c = CMD; if (!c) return;
  if (c.phase === 'sel') {
    c.phase = 'run';
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
  hint: 'First point', group: 'draw', init: c => c.pts = [],
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length >= 2) {
      begin(); addEnt({ t: 'line', a: c.pts[c.pts.length - 2], b: p }); commit('Line');
      hint('Next point · <em>C</em> close · <em>U</em> undo · <em>Enter</em> end');
    } else hint('Next point');
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
  hint: 'First point', group: 'draw', init: c => c.pts = [],
  point(c, p) { c.pts.push(p); hint('Next point · <em>C</em> close · <em>U</em> undo · <em>Enter</em> end'); },
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
  hint: 'First fit point · <em>Enter</em> to finish', group: 'draw', init: c => c.pts = [],
  point(c, p) { c.pts.push(p); hint('Next fit point · <em>C</em> close · <em>Enter</em> end'); },
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
  hint: 'First corner', group: 'draw', init: c => c.pts = [],
  text(c, s) {
    if (c.pts.length === 1) {
      const m = s.match(/^(.+?)[x,](.+)$/i);
      if (m) {
        const w = parseLen(m[1]), h = parseLen(m[2]);
        if (!isNaN(w) && !isNaN(h)) {
          const a = c.pts[0], b = [a[0] + w, a[1] + h];
          begin(); addEnt(rectEnt(a, b, c.data)); commit('Rectangle');
          c.pts = []; hint('First corner'); return true;
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
      c.pts = []; hint('First corner');
    } else hint('Opposite corner · type <em>W,H</em> · <em>F</em> fillet · <em>C</em> chamfer');
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
  hint: 'Centre · <em>2P</em> · <em>3P</em> · <em>T</em> tan-tan-radius', group: 'draw',
  init: c => { c.pts = []; c.mode = 'cr'; c.data = {}; },
  text(c, s) {
    if (/^2p?$/i.test(s)) { c.mode = '2p'; c.pts = []; hint('First point on diameter'); return true; }
    if (/^3p?$/i.test(s)) { c.mode = '3p'; c.pts = []; hint('First point'); return true; }
    if (/^t(tr)?$/i.test(s)) { c.mode = 'ttr'; c.pts = []; c.ents = []; hint('First tangent object'); return true; }
    if (/^d$/i.test(s)) { c.data.dia = true; echo('Diameter mode'); return true; }
    if (c.mode === 'ttr' && c.ents && c.ents.length === 2) {
      const r = parseLen(s);
      if (!isNaN(r) && r > 0) { ttrCircle(c, r); return true; }
    }
    if (c.mode === 'cr' && c.pts.length === 1) {
      const d = parseLen(s);
      if (!isNaN(d) && d > 0) {
        begin(); addEnt({ t: 'circle', c: c.pts[0], r: c.data.dia ? d / 2 : d }); commit('Circle');
        c.pts = []; c.data.dia = false; hint('Centre'); return true;
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
      hint(c.ents.length === 1 ? 'Second tangent object' : 'Type the radius');
      return;
    }
    c.pts.push(p);
    if (c.mode === 'cr' && c.pts.length === 2) { begin(); addEnt({ t: 'circle', c: c.pts[0], r: dist(c.pts[0], p) }); commit('Circle'); c.pts = []; }
    else if (c.mode === '2p' && c.pts.length === 2) { begin(); addEnt({ t: 'circle', c: mid(c.pts[0], p), r: dist(c.pts[0], p) / 2 }); commit('Circle'); c.pts = []; }
    else if (c.mode === '3p' && c.pts.length === 3) {
      const cc = circum(c.pts[0], c.pts[1], c.pts[2]);
      if (cc) { begin(); addEnt({ t: 'circle', c: cc.c, r: cc.r }); commit('Circle'); } else echo('Those points are collinear');
      c.pts = [];
    } else hint(c.mode === 'cr' ? 'Radius — click or type a value' : 'Next point');
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
  c.ents = []; c.tp = []; SEL.clear(); hint('First tangent object');
}

defc('arc', {
  hint: 'Start point · <em>C</em> centre-first · <em>S</em> start-centre-end', group: 'draw',
  init: c => { c.pts = []; c.mode = '3p'; },
  text(c, s) {
    if (/^c$/i.test(s)) { c.mode = 'cse'; c.pts = []; hint('Centre'); return true; }
    if (/^s$/i.test(s)) { c.mode = 'sce'; c.pts = []; hint('Start point'); return true; }
    return false;
  },
  point(c, p) {
    c.pts.push(p);
    if (c.mode === '3p' && c.pts.length === 3) {
      const a = arc3(c.pts[0], c.pts[1], c.pts[2]);
      if (a) { begin(); addEnt(a); commit('Arc'); } else echo('Those points are collinear');
      c.pts = []; hint('Start point');
    } else if (c.mode === 'cse' && c.pts.length === 3) {
      const [cc, s0, e0] = c.pts;
      begin(); addEnt({ t: 'arc', c: cc, r: dist(cc, s0), a0: ang(cc, s0), a1: ang(cc, e0) }); commit('Arc');
      c.pts = []; hint('Centre');
    } else if (c.mode === 'sce' && c.pts.length === 3) {
      const [s0, cc, e0] = c.pts;
      begin(); addEnt({ t: 'arc', c: cc, r: dist(cc, s0), a0: ang(cc, s0), a1: ang(cc, e0) }); commit('Arc');
      c.pts = []; hint('Start point');
    } else hint(c.mode === '3p' ? (c.pts.length === 1 ? 'Point on arc' : 'End point')
      : c.mode === 'cse' ? (c.pts.length === 1 ? 'Start point' : 'End point')
        : (c.pts.length === 1 ? 'Centre' : 'End point'));
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
  hint: 'Centre · <em>A</em> axis-endpoints', group: 'draw', init: c => { c.pts = []; c.mode = 'c'; },
  text(c, s) { if (/^a$/i.test(s)) { c.mode = 'a'; c.pts = []; hint('First axis endpoint'); return true; } return false; },
  point(c, p) {
    c.pts.push(p);
    const need = 3;
    if (c.pts.length === need) {
      const e = c.mode === 'a' ? ellipseFromAxis(c.pts) : ellipseFromCentre(c.pts);
      if (e) { begin(); addEnt(e); commit('Ellipse'); }
      c.pts = []; hint(c.mode === 'a' ? 'First axis endpoint' : 'Centre');
    } else hint(c.pts.length === 1 ? (c.mode === 'a' ? 'Other axis endpoint' : 'End of major axis') : 'Minor axis distance');
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
  hint: 'Number of sides (default 6)', group: 'draw',
  init: c => { c.pts = []; c.n = 6; c.insc = true; },
  text(c, s) {
    if (!c.pts.length) { const n = parseInt(s); if (n >= 3 && n <= 200) { c.n = n; hint('Centre · <em>I</em> inscribed · <em>C</em> circumscribed'); return true; } }
    if (/^i$/i.test(s)) { c.insc = true; echo('Inscribed'); return true; }
    if (/^c$/i.test(s)) { c.insc = false; echo('Circumscribed'); return true; }
    if (c.pts.length === 1) {
      const r = parseLen(s);
      if (!isNaN(r) && r > 0) {
        begin(); addEnt(polyGon(c.pts[0], r, c.n, 0, c.insc)); commit('Polygon'); c.pts = []; hint('Centre'); return true;
      }
    }
    return false;
  },
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length === 2) {
      begin(); addEnt(polyGon(c.pts[0], dist(c.pts[0], p), c.n, ang(c.pts[0], p), c.insc)); commit('Polygon');
      c.pts = []; hint('Centre');
    } else hint('Radius');
  },
  preview(c, p) {
    return c.pts.length === 1 ? [pv(polyGon(c.pts[0], dist(c.pts[0], p), c.n, ang(c.pts[0], p), c.insc))] : null;
  },
});

defc('donut', {
  hint: 'Inside diameter', group: 'draw', init: c => { c.pts = []; c.id_ = null; c.od = null; },
  text(c, s) {
    const v = parseLen(s);
    if (isNaN(v)) return false;
    if (c.id_ === null) { c.id_ = v; hint('Outside diameter'); return true; }
    if (c.od === null) { c.od = v; hint('Centre of donut'); return true; }
    return false;
  },
  point(c, p) {
    if (c.id_ === null || c.od === null) { echo('Type the inside and outside diameters first'); return; }
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
  hint: 'Point on the construction line', group: 'draw', init: c => c.pts = [],
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length === 2) {
      begin(); addEnt({ t: 'xline', a: c.pts[0], d: norm(sub(p, c.pts[0])), lt: 'dashdot' }); commit('Construction line');
      c.pts = [c.pts[0]]; hint('Through point');
    } else hint('Through point');
  },
  preview: (c, p) => c.pts.length ? [pv({ t: 'xline', a: c.pts[0], d: norm(sub(p, c.pts[0])), lt: 'dashdot' })] : null,
});
defc('ray', {
  hint: 'Start point', group: 'draw', init: c => c.pts = [],
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length === 2) {
      begin(); addEnt({ t: 'ray', a: c.pts[0], d: norm(sub(p, c.pts[0])), lt: 'dashdot' }); commit('Ray');
      c.pts = [c.pts[0]]; hint('Through point');
    } else hint('Through point');
  },
  preview: (c, p) => c.pts.length ? [pv({ t: 'ray', a: c.pts[0], d: norm(sub(p, c.pts[0])), lt: 'dashdot' })] : null,
});

defc('revcloud', {
  hint: 'Drag to trace the cloud · <em>Enter</em> to close', group: 'draw',
  init: c => { c.pts = []; c.arc = DOC.revArc || 500; },
  text(c, s) { const v = parseLen(s); if (!isNaN(v) && v > 0) { c.arc = DOC.revArc = v; echo('Arc ' + fmt(v)); return true; } return false; },
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
  hint: 'Point location', group: 'draw',
  point(c, p) { begin(); addEnt({ t: 'point', p }); commit('Point'); },
});

defc('text', {
  hint: 'Text insertion point', group: 'annotate', init: c => { c.pts = []; },
  point(c, p) { c.pts = [p]; hint('Type the text, then <em>Enter</em>'); focusCmd(); },
  text(c, s) {
    if (!c.pts.length) return false;
    if (!s) { endCmd(); return true; }
    begin();
    addEnt({ t: 'text', p: c.pts[0], s, h: DOC.textH, rot: 0, anchor: 'l', layer: annoLayer('TEXT') });
    commit('Text'); endCmd(); return true;
  },
});
defc('mtext', {
  hint: 'Insertion point for the paragraph', group: 'annotate', init: c => { c.pts = []; },
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
  hint: 'Arrow point', group: 'annotate', init: c => c.pts = [],
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length < 2) return hint('Landing point');
    hint('Type the note, then <em>Enter</em>'); focusCmd();
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
defc('dim', {
  hint: 'First extension point · <em>R</em> radius · <em>D</em> diameter · <em>A</em> angular · <em>H</em>/<em>V</em> locked',
  group: 'annotate', init: c => { c.pts = []; c.k = 'aligned'; },
  text(c, s) {
    const map = { r: 'radius', d: 'diameter', a: 'angular', h: 'horizontal', v: 'vertical', l: 'aligned' };
    const k = map[s.toLowerCase()];
    if (k) { c.k = k; c.pts = []; hint(k === 'radius' || k === 'diameter' ? 'Select a circle or arc' : k === 'angular' ? 'Vertex point' : 'First extension point'); return true; }
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
      } else hint(c.pts.length === 1 ? 'First side' : 'Second side');
      return;
    }
    c.pts.push(p);
    if (c.pts.length === 3) {
      const [a, b, o] = c.pts;
      const u = c.k === 'horizontal' ? [1, 0] : c.k === 'vertical' ? [0, 1] : norm(sub(b, a));
      const off = dot(sub(o, a), perp(u));
      begin(); addEnt({ t: 'dim', k: c.k, p1: a, p2: b, off, layer: dimLayer() }); commit('Dimension');
      c.pts = []; hint('First extension point');
    } else hint(c.pts.length === 1 ? 'Second extension point' : 'Dimension line position');
  },
  preview(c, p) {
    if (c.pts.length === 2 && c.k !== 'angular') {
      const [a, b] = c.pts;
      const u = c.k === 'horizontal' ? [1, 0] : c.k === 'vertical' ? [0, 1] : norm(sub(b, a));
      return [pv({ t: 'dim', k: c.k, p1: a, p2: b, off: dot(sub(p, a), perp(u)), layer: dimLayer() })];
    }
    if (c.pts.length === 1) return [pv({ t: 'line', a: c.pts[0], b: p, lt: 'dashed' })];
    return null;
  },
});
defc('dimcont', {
  hint: 'Pick the next extension point to continue the last dimension', group: 'annotate',
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
