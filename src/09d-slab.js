'use strict';
/* ============================================================
   C5 — floors and roofs
   ------------------------------------------------------------
   Columns, stairs and rooms existed; the horizontal parts of a
   building did not. A floor is the thing every storey stands on
   and the thing a section reads as a building rather than a row
   of walls, and there was no way to draw one.

   A floor is a boundary, a thickness and a storey. Its TOP is at
   the level, because that is the surface you stand on and the
   height everything else is measured from; the slab hangs below
   it. A roof is the same with a pitch.
   ============================================================ */

function slabThick(f) { return f.th != null ? f.th : 200; }
/** the top of a slab: its own datum if given, otherwise its storey's */
function slabTop(f) {
  if (f.top != null) return f.top;
  const l = (DOC.levels || []).find(x => x.id === (f.lvl || 0));
  return l ? l.elev : 0;
}
/** height of a roof surface above its eaves, at a point in plan */
function roofRise(rf, p) {
  const pitch = rf.pitch || 0;                     /* radians */
  if (!pitch) return 0;
  /* measured from the eaves line, in the direction of fall */
  const u = [Math.cos(rf.dir || 0), Math.sin(rf.dir || 0)];
  const d = (p[0] - rf.eaves[0]) * u[0] + (p[1] - rf.eaves[1]) * u[1];
  return Math.max(0, d) * Math.tan(pitch);
}

/** the voids in a slab: a stairwell, a lift shaft, a double-height space */
function slabHoles(f) {
  const h = f && f.holes;
  if (!Array.isArray(h)) return [];
  return h.filter(r => Array.isArray(r) && r.length > 2);
}
/** is p inside one of the voids, and therefore NOT on the slab */
function inSlabHole(f, p) {
  for (const r of slabHoles(f)) if (pointInPoly(p, r)) return true;
  return false;
}
/* a slab's length is the way round it; roof inherits this below */
GEOM.floor = {
  len: f => polyLen(f.pts || [], true),
  /* the void comes off the area: a floor with a stairwell in it is not a
     floor you can lay, price or stand on across the whole of its outline */
  area(f) {
    let a = Math.abs(polyArea(f.pts || []));
    for (const r of slabHoles(f)) a -= Math.abs(polyArea(r));
    return Math.max(0, a);
  },
  shapes(f) {
    const pts = f.pts || [];
    if (pts.length < 3) return [];
    const holes = slabHoles(f);
    const out = [{ pts, closed: true, role: 'face' }];
    for (const r of holes) out.push({ pts: r, closed: true, role: 'face' });
    /* a slab reads as a slab, not as an outline someone left lying about.
       The fill carries its voids so it is not painted straight over them. */
    if (f.hatch !== false) out.push({ pts, closed: true, role: 'poche', holes });
    return out;
  },
  bbox(f) {
    const pts = f.pts || [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of pts) {
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]);
      y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    }
    return x0 === Infinity ? [0, 0, 0, 0] : [x0, y0, x1, y1];
  },
  dist(p, f) {
    const pts = f.pts || [];
    if (pts.length < 3) return Infinity;
    /* Over a void you are looking THROUGH the slab, so the slab is not there
       to be picked — but its rim is, or a hole could never be reshaped. */
    if (inSlabHole(f, p)) {
      let d = Infinity;
      for (const r of slabHoles(f)) d = Math.min(d, polyDist(p, r, true));
      return d;
    }
    return pointInPoly(p, pts) ? 0 : polyDist(p, pts, true);
  },
  /* holes get grips too, keyed 'h<ring>:<corner>', so a stairwell can be
     resized without being deleted and drawn again */
  grips(f) {
    const g = (f.pts || []).map((p, i) => ({ p, k: i }));
    slabHoles(f).forEach((r, hi) => r.forEach((p, i) => g.push({ p, k: 'h' + hi + ':' + i })));
    return g;
  },
  grip(f, k, p) {
    if (typeof k === 'string' && k[0] === 'h') {
      const [hi, i] = k.slice(1).split(':').map(Number);
      const r = f.holes && f.holes[hi];
      if (r && r[i]) r[i] = p;
      return;
    }
    if (f.pts && f.pts[k]) f.pts[k] = p;
  },
  xf(f, fn) {
    f.pts = (f.pts || []).map(fn);
    if (Array.isArray(f.holes)) f.holes = f.holes.map(r => r.map(fn));
  },
};
GEOM.roof = Object.assign({}, GEOM.floor, {
  shapes(rf) {
    const pts = rf.pts || [];
    if (pts.length < 3) return [];
    const out = [{ pts, closed: true, role: 'face' }];
    /* the fall arrow: which way the water runs, which is the one thing a roof
       in plan has to say that a floor does not */
    if (rf.pitch) {
      const b = GEOM.roof.bbox(rf);
      const c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      const len = Math.min(b[2] - b[0], b[3] - b[1]) * 0.35;
      const u = [Math.cos(rf.dir || 0), Math.sin(rf.dir || 0)];
      const tail = [c[0] - u[0] * len / 2, c[1] - u[1] * len / 2];
      const tip = [c[0] + u[0] * len / 2, c[1] + u[1] * len / 2];
      out.push({ pts: [tail, tip], role: 'swing' });
      out.push({ pts: arrowPoly(tip, Math.atan2(u[1], u[0]), len * 0.16),
                 closed: true, fill: true, role: 'arrowhead' });
      out.push({ text: (deg(rf.pitch)).toFixed(0) + '°',
                 p: [c[0], c[1] + len * 0.12], h: DOC.textH, rot: 0, anchor: 'c' });
    }
    return out;
  },
});

/* ---------------- drawing them ---------------- */
function traceOrPick(c, p, make) {
  if (!c.pts.length) {
    const ring = (typeof roomTrace === 'function') ? roomTrace(p, DOC.curLevel) : null;
    if (ring) { make(ring); return true; }
    echo('That spot is not enclosed — pick corners instead');
  }
  c.pts.push(p);
  hint('Next corner · <em>Enter</em> to finish');
  return false;
}
defc('floor', {
  key: 'floor', group: 'arch',
  hint: 'Click inside an enclosed space, or pick corners then <em>Enter</em>',
  init(c) { c.pts = []; },
  point(c, p) {
    traceOrPick(c, p, ring => { makeSlab('floor', ring); endCmd(); });
  },
  enter(c) { if (c.pts.length > 2) makeSlab('floor', c.pts); endCmd(); },
  preview(c, p) {
    if (c.pts.length) return [pv({ t: 'pline', pts: [...c.pts, p], closed: true })];
    const ring = (typeof roomTrace === 'function') ? roomTrace(p, DOC.curLevel) : null;
    return ring ? [pv({ t: 'pline', pts: ring, closed: true })] : null;
  },
});
defc('roof', {
  key: 'roof', group: 'arch',
  hint: 'Click inside an enclosed space, or pick corners then <em>Enter</em>',
  init(c) { c.pts = []; },
  point(c, p) {
    traceOrPick(c, p, ring => { makeSlab('roof', ring); endCmd(); });
  },
  enter(c) { if (c.pts.length > 2) makeSlab('roof', c.pts); endCmd(); },
  preview(c, p) {
    if (c.pts.length) return [pv({ t: 'pline', pts: [...c.pts, p], closed: true })];
    const ring = (typeof roomTrace === 'function') ? roomTrace(p, DOC.curLevel) : null;
    return ring ? [pv({ t: 'pline', pts: ring, closed: true })] : null;
  },
});
/* ------------------------------------------------------------
   SLABHOLE — a void through a floor or roof.

   A stairwell is the reason this exists: without it the floor runs straight
   across the opening the stair comes through, and both the plan and the
   section say the storey is sealed.

   Picking inside an enclosed space traces it, exactly as FLOOR does, so a
   stairwell already walled on all sides is one click. Otherwise pick the
   corners.
   ------------------------------------------------------------ */
function slabAt(p) {
  /* the smallest slab under the point wins: a void is cut in the thing you
     are pointing at, and a roof over a floor should not swallow the pick */
  let best = null, bestA = Infinity;
  for (const e of DOC.ents.values()) {
    if (e.t !== 'floor' && e.t !== 'roof') continue;
    if (!visible(e) || !pointInPoly(p, e.pts || [])) continue;
    const a = Math.abs(polyArea(e.pts || []));
    if (a < bestA) { bestA = a; best = e; }
  }
  return best;
}
function cutSlabHole(f, ring) {
  if (!f || !ring || ring.length < 3) return false;
  /* a void has to be IN the slab, or it is not a void in it */
  const c = ring.reduce((a, q) => [a[0] + q[0] / ring.length, a[1] + q[1] / ring.length], [0, 0]);
  if (!pointInPoly(c, f.pts || [])) {
    cliPrint('That opening is not inside the slab.', 'err');
    return false;
  }
  begin();
  mut(f);
  f.holes = (f.holes || []).concat([ring.map(q => q.slice())]);
  commit('Slab opening');
  cliPrint('Opening cut — ' + fmtArea(Math.abs(polyArea(ring))) + ' through the ' + f.t + '.');
  return true;
}
defc('slabhole', {
  key: 'slabhole', group: 'arch',
  hint: 'Click inside the opening, or pick its corners then <em>Enter</em>',
  init(c) { c.pts = []; c.f = null; },
  point(c, p) {
    if (!c.pts.length) {
      c.f = slabAt(p);
      if (!c.f) return echo('No floor or roof under that point');
    }
    traceOrPick(c, p, ring => { cutSlabHole(c.f, ring); endCmd(); });
  },
  enter(c) {
    if (c.pts.length > 2 && c.f) cutSlabHole(c.f, c.pts);
    endCmd();
  },
  preview(c, p) {
    if (c.pts.length) return [pv({ t: 'pline', pts: [...c.pts, p], closed: true })];
    const ring = (typeof roomTrace === 'function') ? roomTrace(p, DOC.curLevel) : null;
    return ring ? [pv({ t: 'pline', pts: ring, closed: true })] : null;
  },
});

function makeSlab(kind, pts) {
  const isRoof = kind === 'roof';
  ensureLayer(isRoof ? 'A-ROOF' : 'A-FLOR', isRoof ? '#c99a6b' : '#8fa3b8');
  modal('<h3>' + (isRoof ? 'Roof' : 'Floor') + '</h3>' +
    '<div class="row"><label>Thickness</label><input class="f" id="sth" value="' +
      (+((isRoof ? 250 : 200) / U[DOC.units]).toFixed(4)) + '"></div>' +
    (isRoof
      ? '<div class="row"><label>Pitch °</label><input class="f" id="spi" value="30"></div>' +
        '<div class="row"><label>Falls toward °</label><input class="f" id="sdi" value="0"></div>'
      : '<div class="row"><label>Top at</label><input class="f" id="stp" value="' +
        (+(levelElev(DOC.curLevel) / U[DOC.units]).toFixed(4)) + '"></div>'), () => {
    const th = parseLen($('#sth').value) || (isRoof ? 250 : 200);
    begin();
    const e = {
      t: kind, pts: pts.map(q => q.slice()), th,
      lvl: DOC.curLevel, layer: isRoof ? 'A-ROOF' : 'A-FLOR',
    };
    if (isRoof) {
      e.pitch = rad(parseFloat($('#spi').value) || 0);
      e.dir = rad(parseFloat($('#sdi').value) || 0);
      /* the eaves are the low edge: the corner furthest back along the fall */
      const u = [Math.cos(e.dir), Math.sin(e.dir)];
      let best = null, bd = Infinity;
      for (const q of e.pts) {
        const d = q[0] * u[0] + q[1] * u[1];
        if (d < bd) { bd = d; best = q; }
      }
      e.eaves = best ? best.slice() : e.pts[0].slice();
    } else {
      const tp = parseLen($('#stp').value);
      if (!isNaN(tp)) e.top = tp;
    }
    const n = addEnt(e);
    SEL.clear(); SEL.add(n.id);
    commit(isRoof ? 'Roof' : 'Floor');
    syncUI(); draw();
  });
}

/* ---------------- in section ----------------
   A section that cuts the walls and ignores what spans between them is a row
   of posts. Slabs are what turn it into a building. */
function slabCrossing(sec, F, f) {
  const pts = f.pts || [];
  if (pts.length < 3) return null;
  /* every place the section line enters or leaves the slab outline */
  const hits = [];
  /* the outline AND every void: a section across a stairwell has to show the
     floor stopping at the void and starting again on the far side */
  const rings = [pts].concat(slabHoles(f));
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const A = ring[i], B = ring[(i + 1) % ring.length];
      const X = xSegSeg(sec.a, sec.b, A, B);
      if (X) hits.push((X[0] - F.a[0]) * F.u[0] + (X[1] - F.a[1]) * F.u[1]);
    }
  }
  if (hits.length < 2) return null;
  hits.sort((a, b) => a - b);
  /* pair them up: in, out, in, out — a slab with a hole gives two spans */
  const spans = [];
  for (let i = 0; i + 1 < hits.length; i += 2) {
    const s = clamp(hits[i], 0, F.L), e = clamp(hits[i + 1], 0, F.L);
    if (e - s > 1e-6) spans.push([s, e]);
  }
  return spans.length ? spans : null;
}
/** a segment/segment intersection that returns null when they do not cross */
function xSegSeg(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}

/* ============================================================
   C2 — marks, tags and opening schedules
   ------------------------------------------------------------
   A door on a drawing is not "a door", it is D-04: a number that
   a schedule, an order and a person on site all refer to. Doors
   and windows knew their size and their host and had no way to
   be referred to at all, so no opening could appear on a
   schedule and no schedule could be checked against the plan.
   ============================================================ */
const MARK_PREFIX = { door: 'D', window: 'W' };
/** every opening of one kind, ordered the way a plan is read */
function openingsOfKind(kind, lvl) {
  const l = lvl == null ? null : lvl;
  return [...DOC.ents.values()]
    .filter(e => e.t === kind && (l == null || (e.lvl || 0) === l))
    .sort((a, b) => {
      const ba = bbox(a), bb = bbox(b);
      const dy = bb[3] - ba[3];
      return Math.abs(dy) > 1e-6 ? dy : ba[0] - bb[0];
    });
}
/** Give every unmarked opening a number. Existing marks are left alone: a
    mark that changes when someone adds a door is worse than no mark, because
    the schedule, the order and the drawing stop agreeing. */
function markOpenings(kind) {
  const pre = MARK_PREFIX[kind] || 'X';
  const list = openingsOfKind(kind);
  const used = new Set(list.map(o => o.mark).filter(Boolean));
  let n = 0, given = 0;
  begin();
  for (const o of list) {
    if (o.mark) continue;
    let m;
    do { n++; m = pre + '-' + String(n).padStart(2, '0'); } while (used.has(m));
    used.add(m);
    mut(o); o.mark = m; given++;
  }
  commit('Mark ' + kind + 's');
  return given;
}
defm('MARKDOORS', () => {
  const n = markOpenings('door');
  cliPrint(n ? 'Marked ' + n + ' door' + (n === 1 ? '' : 's') : 'Every door is already marked');
  draw();
}, { group: 'arch' });
defm('MARKWINDOWS', () => {
  const n = markOpenings('window');
  cliPrint(n ? 'Marked ' + n + ' window' + (n === 1 ? '' : 's') : 'Every window is already marked');
  draw();
}, { group: 'arch' });

/** The tag drawn beside an opening: its mark in a ring, offset clear of the
    wall so it does not sit on top of the thing it is labelling. */
function openingTagShapes(o) {
  if (!VS.tags || !o.mark) return [];
  const F = (typeof openFrame === 'function') ? openFrame(o) : null;
  if (!F) return [];
  const h = (DOC.textH || 2.5) * 1.1;
  const r = h * 1.15;
  const off = Math.max(F.t, 200) * 1.1 + r;
  const c = [F.c[0] + F.n[0] * off, F.c[1] + F.n[1] * off];
  return [
    { c, r, role: 'tag' },
    { text: o.mark, p: [c[0], c[1] - h * 0.36], h, rot: 0, anchor: 'c' },
  ];
}

/* ---------------- schedules ---------------- */
function openingScheduleRows(kind, lvl) {
  const isDoor = kind === 'door';
  /* Fire, acoustic and finish are columns whether or not anything fills them.
     A door schedule with no fire column is the one that comes back from
     building control, and an em dash says "not specified" out loud where a
     blank cell only looks like nobody got round to the table. */
  const rows = [['Mark', isDoor ? 'Door' : 'Window', 'W', 'H', 'Wall']
    .concat(isDoor ? ['Fire', 'Acoustic Rw', 'Finish'] : ['Acoustic Rw', 'Finish'])];
  for (const o of openingsOfKind(kind, lvl)) {
    const host = DOC.ents.get(o.host);
    const S = openingSpec(o);
    rows.push([
      o.mark || '—',
      openingTypeName(o, isDoor),
      fmt(openW(o)),
      fmt(openH(o)),
      host ? ((wallType(host.wt) || {}).name || '—') : '—',
    ].concat(isDoor
      ? [fireText(S.fire), specText(S.acoustic), specText(S.finish)]
      : [specText(S.acoustic), specText(S.finish)]));
  }
  return rows;
}
function placeOpeningSchedule(kind, p) {
  const rows = openingScheduleRows(kind, DOC.curLevel);
  if (rows.length < 2) { cliPrint('No ' + kind + 's on this level.', 'err'); return 0; }
  const h = DOC.textH || 2.5;
  begin();
  const align = ['l', 'l', 'r', 'r', 'l'].concat(
    kind === 'door' ? ['l', 'r', 'l'] : ['r', 'l']);
  addEnt({ t: 'table', p: p.slice(), rows, colW: fitColumns(rows, h), h,
           align, kind: kind + 's', layer: annoLayer('TEXT') });
  commit((kind === 'door' ? 'Door' : 'Window') + ' schedule');
  return rows.length - 1;
}
defc('doorschedule', {
  key: 'doorschedule', group: 'annotate', hint: 'Pick the top-left corner of the schedule',
  point(c, p) {
    const n = placeOpeningSchedule('door', p);
    if (n) cliPrint(n + ' doors scheduled');
    draw(); endCmd();
  },
});
defc('windowschedule', {
  key: 'windowschedule', group: 'annotate', hint: 'Pick the top-left corner of the schedule',
  point(c, p) {
    const n = placeOpeningSchedule('window', p);
    if (n) cliPrint(n + ' windows scheduled');
    draw(); endCmd();
  },
});

/** What to call an opening on a schedule.

    doorType() and winType() fall back to the FIRST entry in the library when
    an opening has no type of its own — so an 1800x1500 window with its size
    set directly was reported as "Window 600x600". The size columns were right
    and the name was a lie, which on a schedule someone orders from is the
    worst way round to be wrong. An opening carrying its own size is described
    by that size; only one that really is of a type is named for it. */
function openingTypeName(o, isDoor) {
  const T = isDoor ? (o.dt ? doorType(o.dt) : null) : (o.wtp ? winType(o.wtp) : null);
  if (T && (o.w == null || Math.abs(o.w - T.w) < 1e-9) &&
            (o.h == null || Math.abs(o.h - T.h) < 1e-9)) return T.name;
  return (isDoor ? 'Door ' : 'Window ') + fmt(openW(o)) + '×' + fmt(openH(o));
}
