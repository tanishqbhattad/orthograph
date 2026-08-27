'use strict';
/* ============================================================
   C6 — sections
   ------------------------------------------------------------
   A plan is a horizontal cut. A section is a vertical one, and
   until now this program could not take one at all: it knew
   where every wall was and how thick, it knew the storey heights
   and where the openings sat, and none of that could be looked
   at from the side.

   The section is GENERATED, not live. Cutting produces real
   geometry you can then dimension, annotate and plot like any
   other drawing — which is what an architect does with a section
   anyway — and it means a section cannot silently disagree with
   itself halfway through being edited. Re-cut to bring it up to
   date, exactly as the room schedule works.
   ============================================================ */

/** How tall a wall is: its own height if it has been given one, otherwise the
    floor-to-floor of the storey it belongs to. A wall with no answer at all is
    3000, which is a storey rather than a guess at nothing. */
function wallHeight(w) {
  if (w.hgt != null) return w.hgt;
  const l = (DOC.levels || []).find(x => x.id === (w.lvl || 0));
  return (l && l.h) || 3000;
}
function levelElev(id) {
  const l = (DOC.levels || []).find(x => x.id === (id || 0));
  return l ? l.elev : 0;
}

/* ---------------- the cut ----------------
   Everything is measured in the section's own frame: x is distance along the
   section line, y is elevation. That is the only coordinate system a section
   has, and keeping it explicit means the geometry below never has to think
   about where the line happens to sit on the plan. */
function sectionFrame(sec) {
  const a = sec.a, b = sec.b;
  const L = dist(a, b);
  if (L < 1e-9) return null;
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const n = [-u[1], u[0]];                       /* left of the run */
  const look = (sec.dir || 1) >= 0 ? 1 : -1;     /* which way you are facing */
  return { a, u, n, L, look };
}
/** where a wall crosses the section line, in the section's frame */
function wallCrossing(sec, F, w) {
  const X = xLineLine(sec.a, sec.b, w.a, w.b, false);
  if (!X.length) return null;
  const P = X[0];
  const d = (P[0] - F.a[0]) * F.u[0] + (P[1] - F.a[1]) * F.u[1];
  if (d < -1e-6 || d > F.L + 1e-6) return null;  /* crosses the infinite line, not the run */
  /* a wall meeting the section at an angle is cut wider than it is thick */
  const wu = wallU(w);
  const sinA = Math.abs(wu[0] * F.n[0] + wu[1] * F.n[1]);
  if (sinA < 1e-6) return null;                  /* parallel: not a cut, a face */
  const cut = wallT(w) / sinA;
  /* how far along the WALL the cut happens, so its openings can be found */
  const dw = (P[0] - w.a[0]) * wu[0] + (P[1] - w.a[1]) * wu[1];
  return { w, d, cut, dw, P };
}
/** the openings the section passes through on this wall, as sill/head bands */
function crossingHoles(cr) {
  const out = [];
  for (const o of wallOpenings(cr.w)) {
    if (cr.dw < o.s - 1e-6 || cr.dw > o.e + 1e-6) continue;   /* misses it */
    const h = openH(o.o);
    const sill = o.o.t === 'window' ? (o.o.sill != null ? o.o.sill : 900) : 0;
    out.push({ sill, head: sill + h, kind: o.o.t });
  }
  return out;
}

/** What a section may cut. Deliberately NOT visible(): that answers for the
    current STOREY, which is right for a plan and wrong here — a section is a
    cut through the whole building, and using visible() meant a two-storey
    section showed one storey and a floating roof. Layer visibility still
    applies, because turning a layer off means you do not want to see it
    anywhere. */
function inSection(e) {
  const l = layer(e.layer);
  return l.on && !l.frozen;
}
/** Cut the model and return the section as plain geometry, in the section's
    own frame: x along the line, y in elevation. */
function sectionGeometry(sec) {
  const F = sectionFrame(sec);
  if (!F) return null;
  const parts = [];
  const cuts = [];
  for (const e of DOC.ents.values()) {
    if (e.t !== 'wall' || !inSection(e)) continue;
    const cr = wallCrossing(sec, F, e);
    if (cr) cuts.push(cr);
  }
  for (const cr of cuts) {
    const base = levelElev(cr.w.lvl);
    const top = base + wallHeight(cr.w);
    const x0 = cr.d - cr.cut / 2, x1 = cr.d + cr.cut / 2;
    const holes = crossingHoles(cr);
    /* the wall is one poched rectangle with a band taken out for each opening
       the cut passes through — a door reaching the floor simply leaves the
       band open at the bottom, which falls out of the same arithmetic */
    const bands = [];
    let y = base;
    for (const h of holes.slice().sort((p, q) => p.sill - q.sill)) {
      const s = clamp(base + h.sill, base, top);
      const e2 = clamp(base + h.head, base, top);
      if (s > y + 1e-6) bands.push([y, s]);
      y = Math.max(y, e2);
    }
    if (top > y + 1e-6) bands.push([y, top]);
    for (const [lo, hi] of bands) {
      parts.push({ kind: 'wall', pts: [[x0, lo], [x1, lo], [x1, hi], [x0, hi]], w: cr.w });
    }
    /* the head and sill of each opening are drawn, so a window reads as one */
    for (const h of holes) {
      const s = base + h.sill, e2 = base + h.head;
      if (h.kind === 'window' && s > base + 1e-6)
        parts.push({ kind: 'sill', pts: [[x0, s], [x1, s]] });
      if (e2 < top - 1e-6) parts.push({ kind: 'head', pts: [[x0, e2], [x1, e2]] });
    }
  }
  /* Slabs. A section that cuts the walls and ignores what spans between them
     is a row of posts; the floors are what make it a building. A slab's TOP is
     at its storey, so it hangs below the level line rather than sitting on it.
     A roof is the same with a rise added along the fall. */
  for (const e of DOC.ents.values()) {
    if ((e.t !== 'floor' && e.t !== 'roof') || !inSection(e)) continue;
    if (typeof slabCrossing !== 'function') break;
    const spans = slabCrossing(sec, F, e);
    if (!spans) continue;
    const th = slabThick(e);
    for (const [s0, e0] of spans) {
      if (e.t === 'roof' && e.pitch) {
        /* a pitched roof is a sloping band: the rise is measured at each end
           of the span, in the section's own frame */
        const P0 = [F.a[0] + F.u[0] * s0, F.a[1] + F.u[1] * s0];
        const P1 = [F.a[0] + F.u[0] * e0, F.a[1] + F.u[1] * e0];
        const base = slabTop(e);
        const y0 = base + roofRise(e, P0), y1 = base + roofRise(e, P1);
        parts.push({ kind: 'slab', pts: [[s0, y0 - th], [e0, y1 - th], [e0, y1], [s0, y0]], e });
      } else {
        const top = slabTop(e);
        parts.push({ kind: 'slab', pts: [[s0, top - th], [e0, top - th], [e0, top], [s0, top]], e });
      }
    }
  }

  /* ---------------- projection beyond the cut ----------------
     A section shows what is cut AND what is seen beyond it. Without this a
     room reads as two posts and a floor with nothing between them, when in
     fact you are looking at the far wall. Anything on the side you are facing,
     within the view depth, is drawn in elevation: its extent along the section
     line, from its base to its top, in lighter lines because it is behind the
     cut and must not compete with it. */
  const depth = sec.depth || 20000;
  for (const e of DOC.ents.values()) {
    if (e.t !== 'wall' || !inSection(e)) continue;
    if (cuts.some(c => c.w.id === e.id)) continue;      /* already cut, not seen */
    /* how far beyond the line each end sits, measured along the way we look */
    const n = [F.n[0] * F.look, F.n[1] * F.look];
    const dA = (e.a[0] - F.a[0]) * n[0] + (e.a[1] - F.a[1]) * n[1];
    const dB = (e.b[0] - F.a[0]) * n[0] + (e.b[1] - F.a[1]) * n[1];
    if (dA < -1e-6 && dB < -1e-6) continue;             /* behind the viewer */
    if (dA > depth && dB > depth) continue;             /* past the view depth */
    /* its extent along the section line */
    const xA = (e.a[0] - F.a[0]) * F.u[0] + (e.a[1] - F.a[1]) * F.u[1];
    const xB = (e.b[0] - F.a[0]) * F.u[0] + (e.b[1] - F.a[1]) * F.u[1];
    const x0 = clamp(Math.min(xA, xB), 0, F.L), x1 = clamp(Math.max(xA, xB), 0, F.L);
    if (x1 - x0 < 1e-6) continue;                       /* end-on: nothing to see */
    const base = levelElev(e.lvl), top = base + wallHeight(e);
    parts.push({ kind: 'seen', pts: [[x0, base], [x1, base], [x1, top], [x0, top]], w: e });
    /* the openings in it are what make an elevation read as a building */
    for (const o of wallOpenings(e)) {
      const oh = openH(o.o);
      const sill = o.o.t === 'window' ? (o.o.sill != null ? o.o.sill : 900) : 0;
      const s0 = clamp(Math.min(xA, xB) + Math.min(o.s, o.e), x0, x1);
      const s1 = clamp(Math.min(xA, xB) + Math.max(o.s, o.e), x0, x1);
      if (s1 - s0 < 1e-6) continue;
      parts.push({ kind: 'seen', pts: [[s0, base + sill], [s1, base + sill],
                                       [s1, base + sill + oh], [s0, base + sill + oh]], w: e });
    }
  }

  /* the storey datums, drawn right across so the section reads as a building
     rather than a row of unrelated posts */
  const datums = [];
  for (const l of (DOC.levels || []).slice().sort((a, b) => a.elev - b.elev)) {
    datums.push({ kind: 'datum', y: l.elev, name: l.name, elev: l.elev });
    datums.push({ kind: 'datum', y: l.elev + (l.h || 3000), name: null, elev: l.elev + (l.h || 3000) });
  }
  return { frame: F, parts, datums, span: F.L, cuts: cuts.length };
}

/** Place a cut section into the drawing as ordinary geometry, at `at`. */
function placeSection(sec, at) {
  const G = sectionGeometry(sec);
  if (!G || !G.parts.length) { cliPrint('The section line crosses no walls.', 'err'); return 0; }
  const lay = hasLayer('A-SECT') ? 'A-SECT' : DOC.cur;
  const P = (x, y) => [at[0] + x, at[1] + y];
  begin();
  let n = 0;
  /* datums first, so the poche sits over them */
  const xs = G.parts.flatMap(p => p.pts.map(q => q[0]));
  const x0 = Math.min(...xs) - 500, x1 = Math.max(...xs) + 500;
  const seen = new Set();
  for (const d of G.datums) {
    if (seen.has(d.y)) continue;
    seen.add(d.y);
    addEnt({ t: 'line', a: P(x0, d.y), b: P(x1, d.y), lt: 'dashdot', layer: lay });
    if (d.name) addEnt({ t: 'text', s: d.name, p: P(x0, d.y + DOC.textH * 0.4),
                         h: DOC.textH, rot: 0, anchor: 'l', layer: lay });
    n++;
  }
  for (const p of G.parts) {
    if (p.kind === 'seen') {
      /* outlined, never poched: poche means CUT, and a face you are merely
         looking at must not read as one you sliced through */
      addEnt({ t: 'pline', closed: true, pts: p.pts.map(q => P(q[0], q[1])),
               layer: lay, lw: 0.13 });
      n++;
      continue;
    }
    if (p.kind === 'wall' || p.kind === 'slab') {
      addEnt({ t: 'hatch', loops: [p.pts.map(q => P(q[0], q[1]))], solid: true,
               pattern: 'solid', layer: lay });
      addEnt({ t: 'pline', closed: true, pts: p.pts.map(q => P(q[0], q[1])), layer: lay });
    } else {
      addEnt({ t: 'line', a: P(p.pts[0][0], p.pts[0][1]),
               b: P(p.pts[1][0], p.pts[1][1]), layer: lay });
    }
    n++;
  }
  commit('Section');
  return n;
}

/* ---------------- the commands ---------------- */
defc('section', {
  key: 'section', group: 'arch',
  hint: 'Start of the section line',
  init(c) { c.pts = []; },
  point(c, p) {
    c.pts.push(p);
    if (c.pts.length < 2) { hint('End of the section line'); return; }
    ensureLayer('A-SECT', '#ff9f5c');
    begin();
    addEnt({ t: 'section', a: c.pts[0], b: c.pts[1], dir: 1,
             label: nextSectionLabel(), layer: 'A-SECT' });
    commit('Section line');
    cliPrint('Section line placed \\u2014 use SECTIONCUT to draw it');
    endCmd();
  },
  preview(c, p) {
    return c.pts.length === 1 ? [pv({ t: 'line', a: c.pts[0], b: p, lt: 'dashdot' })] : null;
  },
});
function nextSectionLabel() {
  const used = new Set([...DOC.ents.values()].filter(e => e.t === 'section').map(e => e.label));
  for (let i = 0; i < 26; i++) {
    const s = String.fromCharCode(65 + i);
    if (!used.has(s)) return s;
  }
  return 'S';
}
defc('sectioncut', {
  key: 'sectioncut', group: 'arch',
  hint: 'Pick a section line, then where to put the drawing',
  init(c) { c.sec = null; },
  point(c, p) {
    if (!c.sec) {
      const s = pickAt(p, 12, e => e.t === 'section');
      if (!s) { echo('Pick a section line'); return; }
      c.sec = s;
      hint('Where to place the section drawing');
      return;
    }
    const n = placeSection(c.sec, p);
    if (n) cliPrint('Section ' + (c.sec.label || '') + ' cut \\u2014 ' + n + ' pieces');
    draw();
    endCmd();
  },
});

/* the section line itself: a dash-dot run with a head at each end showing
   which way you are looking, and its letter beside them */
GEOM.section = {
  shapes(sec) {
    const F = sectionFrame(sec);
    if (!F) return [];
    const t = (DOC.textH || 2.5) * 2.2;
    const out = [{ pts: [sec.a, sec.b], lt: 'dashdot' }];
    for (const [P, sgn] of [[sec.a, 1], [sec.b, -1]]) {
      /* a tail turning the way the section looks */
      const tip = [P[0] + F.n[0] * F.look * t, P[1] + F.n[1] * F.look * t];
      out.push({ pts: [P, tip] });
      out.push({ pts: arrowPoly(tip, Math.atan2(F.n[1] * F.look, F.n[0] * F.look), t * 0.45),
                 closed: true, fill: true, role: 'arrowhead' });
      if (sec.label) {
        out.push({ text: sec.label, h: t * 0.7, rot: 0, anchor: 'c',
                   p: [P[0] - F.u[0] * sgn * t * 0.9, P[1] - F.u[1] * sgn * t * 0.9] });
      }
    }
    return out;
  },
  bbox(sec) {
    const t = (DOC.textH || 2.5) * 3;
    return [Math.min(sec.a[0], sec.b[0]) - t, Math.min(sec.a[1], sec.b[1]) - t,
            Math.max(sec.a[0], sec.b[0]) + t, Math.max(sec.a[1], sec.b[1]) + t];
  },
  dist(p, sec) { return segDist(p, sec.a, sec.b); },
  grips: sec => [{ p: sec.a, k: 'a' }, { p: sec.b, k: 'b' }],
  grip(sec, k, p) { sec[k] = p; },
  xf(sec, fn) { sec.a = fn(sec.a); sec.b = fn(sec.b); },
};
/** flip which side of the line the section looks at */
defm('SECTIONFLIP', () => {
  const secs = selEnts().filter(e => e.t === 'section');
  if (!secs.length) return echo('Select a section line first');
  begin();
  for (const s of secs) { mut(s); s.dir = (s.dir || 1) >= 0 ? -1 : 1; }
  commit('Flip section');
  draw();
}, { group: 'arch' });
