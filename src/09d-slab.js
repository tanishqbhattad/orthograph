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

GEOM.floor = {
  shapes(f) {
    const pts = f.pts || [];
    if (pts.length < 3) return [];
    const out = [{ pts, closed: true, role: 'face' }];
    /* a slab reads as a slab, not as an outline someone left lying about */
    if (f.hatch !== false) out.push({ pts, closed: true, role: 'poche' });
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
    return pointInPoly(p, pts) ? 0 : polyDist(p, pts, true);
  },
  grips: f => (f.pts || []).map((p, i) => ({ p, k: i })),
  grip(f, k, p) { if (f.pts && f.pts[k]) f.pts[k] = p; },
  xf(f, fn) { f.pts = (f.pts || []).map(fn); },
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
  for (let i = 0; i < pts.length; i++) {
    const A = pts[i], B = pts[(i + 1) % pts.length];
    const X = xSegSeg(sec.a, sec.b, A, B);
    if (X) hits.push((X[0] - F.a[0]) * F.u[0] + (X[1] - F.a[1]) * F.u[1]);
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
