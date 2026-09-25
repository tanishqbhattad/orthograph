'use strict';
/* ============================================================
   B1 — the curve kernel under TRIM, EXTEND and OFFSET

   Every editing command asks the same few questions of an object:
   where does it cross that one, what is the piece between here and
   there. These used to be answered off a tessellation, which was
   right to the eye and wrong in the file — a trimmed polyline with
   an arc in it came back as forty vertices still carrying the old
   bulges, and so drew as a different shape.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; VS.edgemode = 0;
`;
module.exports = ({ group, t, ok, eq, close, R }) => {
  group('B1 kernel — trimming keeps the true geometry');

  t('a polyline with an arc in it trims to an exact arc, not a string of chords', () => {
    const r = R(`${SETUP}
      /* a straight run into a quarter-circle corner of radius 1000 about 2000,1000 */
      const e = { t:'pline', pts:[[0,0],[2000,0],[3000,1000],[3000,3000]], bulges:[0, Math.tan(Math.PI/8), 0], id: 1 };
      const cut = { t:'line', a:[2500,-500], b:[2500,3500], id: 2 };
      const parts = trimAt(e, [3000, 2000], [cut]);
      const p = parts && parts[0];
      return { n: parts && parts.length, pts: p && p.pts, bulges: p && p.bulges };`);
    eq(r.n, 1, 'one piece is left');
    eq(r.pts.length, 3, 'three vertices: the arc stays an arc, got ' + JSON.stringify(r.pts));
    close(r.pts[2][0], 2500, 1e-9, 'it ends ON the cutter');
    close(Math.hypot(r.pts[2][0] - 2000, r.pts[2][1] - 1000), 1000, 1e-9, 'and on the original arc');
    /* the remaining sweep is 30 degrees: asin(500/1000) */
    close(r.bulges[1], Math.tan(Math.PI / 6 / 4), 1e-9, 'with the bulge of the part that remains');
  });

  t('a closed polyline trimmed once comes back as ONE open polyline', () => {
    const r = R(`${SETUP}
      const e = { t:'pline', pts:[[0,0],[1000,0],[1000,1000],[0,1000]], closed:true, id: 1 };
      const cut = { t:'line', a:[500,-100], b:[500,1100], id: 2 };
      const parts = trimAt(e, [1000, 500], [cut]);
      return parts && parts.map(p => ({ t: p.t, closed: p.closed, pts: p.pts }));`);
    eq(r.length, 1, 'one object, not four lines or two pieces');
    eq(r[0].closed, false, 'and it is open where the piece came out');
    eq(JSON.stringify(r[0].pts), JSON.stringify([[500,1000],[0,1000],[0,0],[500,0]]),
       'running round the part that is left');
  });

  t('a circle trimmed between two cuts is an arc ending on both', () => {
    const r = R(`${SETUP}
      const e = { t:'circle', c:[0,0], r:500, id: 1 };
      const cut = { t:'line', a:[0,-900], b:[0,900], id: 2 };
      const parts = trimAt(e, [500, 0], [cut]);
      const a = parts && parts[0];
      return a && { t: a.t, s: arcPt(a, 0), e: arcPt(a, 1), mid: arcPt(a, 0.5) };`);
    eq(r.t, 'arc');
    close(r.s[0], 0, 1e-9); close(r.e[0], 0, 1e-9);
    ok(r.mid[0] < 0, 'the half that was not picked is the half that stays');
  });

  t('an ellipse trims to an elliptical arc whose ends are on the cutter', () => {
    const r = R(`${SETUP}
      const e = { t:'ellipse', c:[0,0], rx:1000, ry:400, rot:0.3, id: 1 };
      const cut = { t:'line', a:[200,-2000], b:[200,2000], id: 2 };
      const parts = trimAt(e, ellPt(e, Math.PI), [cut]);
      const a = parts && parts[0];
      return a && { t: a.t, p0: ellPt(a, a.a0), p1: ellPt(a, a.a1) };`);
    eq(r.t, 'ellipse');
    close(r.p0[0], 200, 1e-7, 'first end on the cutter, x = ' + r.p0[0]);
    close(r.p1[0], 200, 1e-7, 'second end on the cutter, x = ' + r.p1[0]);
  });

  t('a construction line trimmed at one cutter is a ray', () => {
    const r = R(`${SETUP}
      const e = { t:'xline', a:[0,0], d:[1,0], id: 1 };
      const cut = { t:'line', a:[500,-100], b:[500,100], id: 2 };
      const parts = trimAt(e, [2000, 0], [cut]);
      return parts && parts.map(p => ({ t: p.t, a: p.a, d: p.d }));`);
    eq(r.length, 1);
    eq(r[0].t, 'ray', 'the half that stays runs to infinity from the cut');
    close(r[0].a[0], 500, 1e-7); close(r[0].a[1], 0, 1e-9);
    eq(JSON.stringify(r[0].d), '[-1,0]', 'pointing away from the part removed');
  });

  t('a cut at an end leaves no zero-length sliver behind', () => {
    const r = R(`${SETUP}
      const e = { t:'line', a:[0,0], b:[1000,0], id: 1 };
      /* one cutter through the end itself, one through the middle */
      const c1 = { t:'line', a:[1000,-100], b:[1000,100], id: 2 };
      const c2 = { t:'line', a:[400,-100], b:[400,100], id: 3 };
      const parts = trimAt(e, [700, 0], [c1, c2]);
      return parts && parts.map(p => [p.a[0], p.b[0]]);`);
    eq(JSON.stringify(r), '[[0,400]]', 'only the real piece, nothing 0 long at x = 1000');
  });

  group('B1 kernel — extend stops at a boundary that is really there');

  t('a boundary the extension would miss is not a boundary', () => {
    const r = R(`${SETUP}
      const e = { t:'line', a:[0,0], b:[500,0], id: 1 };
      /* a short line off to one side: its carrier crosses y = 0, it does not */
      const b = { t:'line', a:[800,100], b:[800,600], id: 2 };
      return extendTo(e, [450, 0], [b]);`);
    eq(r, null, 'nothing to extend to, so nothing is extended');
  });

  t('an arc extends round its own circle', () => {
    const r = R(`${SETUP}
      const e = { t:'arc', c:[0,0], r:500, a0:0, a1:Math.PI/2, id: 1 };
      const b = { t:'line', a:[-900,0], b:[900,0], id: 2 };
      const n = extendTo(e, [0, 500], [b]);
      return n && { t: n.t, end: arcPt(n, 1), r: n.r };`);
    eq(r.t, 'arc');
    close(r.end[0], -500, 1e-9, 'round to the far side of the boundary');
    close(r.end[1], 0, 1e-9);
  });

  group('B1 kernel — tangency, near-parallels and degenerate input');

  const finite = `const fin = o => JSON.stringify(o, (k, v) => typeof v === 'number' && !isFinite(v) ? 'BAD' : v).indexOf('BAD') < 0;`;

  t('a line tangent to a circle cuts it at exactly one point', () => {
    const r = R(`${SETUP} ${finite}
      const e = { t:'circle', c:[0,0], r:500, id: 1 };
      const tan = { t:'line', a:[-900,500], b:[900,500], id: 2 };       /* touches at the top */
      const sec = { t:'line', a:[200,-900], b:[200,900], id: 3 };
      const S = trimSplit(e, [curveOf(tan), curveOf(sec)], false);
      const k = trimAt(e, [500, 0], [tan, sec]);
      return { cuts: S.ts.length, ok: fin(k), n: k && k.length, t: k && k[0].t };`);
    eq(r.cuts, 3, 'two where the secant crosses and one where the tangent touches — not two a hair apart');
    eq(r.ok, true); eq(r.n, 1); eq(r.t, 'arc');
  });

  t('an extension that just touches a circle reaches the tangent point', () => {
    const r = R(`${SETUP}
      const e = { t:'line', a:[-2000,500], b:[-1000,500], id: 1 };
      const b = { t:'circle', c:[0,0], r:500, id: 2 };
      const n = extendTo(e, [-1100, 500], [b]);
      return n && n.b;`);
    close(r[0], 0, 1e-6); close(r[1], 500, 1e-9);
  });

  t('lines a thousandth of a degree apart fillet to finite geometry or not at all', () => {
    const r = R(`${SETUP} ${finite}
      cancelCmd(); VS.trimmode = 1;
      begin();
      addEnt({t:'line', a:[0,0], b:[10000,0]});
      addEnt({t:'line', a:[0,50], b:[10000, 50 + 10000 * Math.tan(rad(0.001))]});
      commit('x');
      startCmd('fillet'); dispatch('R'); dispatch('100');
      cmdPoint([5000, 0]); cmdPoint([5000, 50]);
      endCmd(true);
      return { ok: fin([...DOC.ents.values()]), n: DOC.ents.size };`);
    eq(r.ok, true, 'no NaN and no Infinity anywhere');
    ok(r.n === 2 || r.n === 3, 'either the two lines untouched, or two lines and an arc');
  });

  t('a repeated vertex does not throw a spike or a NaN into an offset', () => {
    const r = R(`${SETUP} ${finite}
      const e = { t:'pline', pts:[[0,0],[1000,0],[1000,0],[1000,1000]], id: 1 };
      const o = offsetEnts(e, 100, offsetSide(e, [500, 500]));
      return { ok: fin(o), n: o.length, far: Math.max(...o[0].pts.map(p => Math.hypot(p[0] - 1000, p[1]))) };`);
    eq(r.ok, true); eq(r.n, 1);
    ok(r.far < 1500, 'the corner stays near the corner: ' + r.far);
  });

  t('a cutter through a polyline vertex cuts there once, leaving no sliver', () => {
    const r = R(`${SETUP}
      const e = { t:'line', a:[0,0], b:[2000,0], id: 1 };
      const pl = { t:'pline', pts:[[1000,-500],[1000,0],[1500,500]], id: 2 };   /* its vertex is ON the line */
      const S = trimSplit(e, [curveOf(pl)], false);
      return S.ts.length;`);
    eq(r, 1);
  });

  group('B1 kernel — a curved polyline measures as what it is');

  /* Round-1 critic: line + semicircle + line showed Length 5000 in the
     panel — the chords — where it is 5570.8. The shared measures sampled the
     arcs; a polyline's length and area have exact forms, so use them. */
  t('length counts its arcs exactly', () => {
    const r = R(`${SETUP}
      const e = { t:'pline', pts:[[0,0],[2000,0],[2000,1000],[0,1000]], bulges:[0,1,0,0], id: 1 };
      return entLength(e);`);
    close(r, 2000 + 500 * Math.PI + 2000, 1e-9, 'two lines and half a circle of radius 500');
  });

  t('area adds or takes away each arc segment exactly', () => {
    const r = R(`${SETUP}
      const b = Math.tan(Math.PI / 8);
      const round = { t:'pline', closed:true, id: 1,
        pts:[[300,0],[3700,0],[4000,300],[4000,2700],[3700,3000],[300,3000],[0,2700],[0,300]], bulges:[0,b,0,b,0,b,0,b] };
      /* a notch: the same arcs bowed inward */
      const inward = Object.assign({}, round, { bulges: [0,-b,0,-b,0,-b,0,-b] });
      return { out: entArea(round), inn: entArea(inward) };`);
    const R2 = 300 * 300;
    const octagon = 4000 * 3000 - 4 * R2 / 2;              /* the vertices alone */
    const seg = R2 / 2 * (Math.PI / 2 - 1);                /* one quarter-circle segment */
    close(r.out, 4000 * 3000 - 4 * (R2 - Math.PI * R2 / 4), 1e-6, 'a rounded rectangle');
    close(r.out, octagon + 4 * seg, 1e-6, 'which is the octagon plus four segments');
    close(r.inn, octagon - 4 * seg, 1e-6, 'and bowed inward, the octagon less them');
  });

  /* Siblings of the round-1 finding: two more places read a polyline's arcs
     as their chords. */
  /* MID on a polyline arc span landing on the arc rather than its chord is
     pinned by the snap engine's own suite (a2-snaps: 'a polyline arc span:
     its midpoint, its centre and a crossing, all exact'). This copy drove the
     engine that A2 replaced, through a function that no longer exists. */

  t('Add and Remove Vertex keep every arc on its own span', () => {
    const r = R(`${SETUP}
      cancelCmd();
      begin();
      const e = addEnt({ t:'pline', pts:[[0,0],[1000,0],[2000,1000],[3000,1000]], bulges:[0, Math.tan(Math.PI/8), 0, 0] });
      commit('x');
      const L0 = entLength(e);
      begin(); gripDo(e, 's1', 'addv'); commit('a');                 /* on the arc */
      const add = { n: e.pts.length, L: entLength(e), q: e.pts[2], b: e.bulges.slice(0, 4) };
      begin(); gripDo(e, 's0', 'addv'); commit('b');                 /* on the straight run before it */
      const add2 = { L: entLength(e), arcs: e.bulges.filter(Boolean).length };
      begin(); gripDo(e, 'p1', 'delv'); commit('c');                 /* the vertex just added */
      const del = { L: entLength(e), arcs: e.bulges.filter(Boolean).length, n: e.pts.length };
      return { L0, add, add2, del };`);
    close(r.add.L, r.L0, 1e-9, 'a vertex added on the arc splits it and changes nothing');
    close(Math.hypot(r.add.q[0] - 1000, r.add.q[1] - 1000), 1000, 1e-9, 'the new vertex is on the arc');
    close(r.add.b[1], Math.tan(Math.PI / 16), 1e-12); close(r.add.b[2], Math.tan(Math.PI / 16), 1e-12);
    close(r.add2.L, r.L0, 1e-9, 'one on a straight run changes nothing either'); eq(r.add2.arcs, 2);
    close(r.del.L, r.L0, 1e-9, 'and removing a vertex between two straight pieces changes nothing');
    eq(r.del.arcs, 2, 'with both halves of the arc still arcs');
  });

  t('an arc segment grip sits on the arc, and dragging it bends the arc through the cursor', () => {
    const r = R(`${SETUP}
      const e = { t:'pline', pts:[[0,0],[1000,0],[1000,1000]], bulges:[0, 1, 0], id: 1 };   /* half circle */
      const g = gripsOf(e).find(q => q.k === 's1');
      gripSet(e, 's1', [1200, 500]);                /* pull it in to a flatter arc */
      const A = bulgeArc(e.pts[1], e.pts[2], e.bulges[1]);
      return { g: g.p.map(v => +v.toFixed(6)), ends: [e.pts[1], e.pts[2]],
               through: A && +Math.abs(dist(A.c, [1200, 500]) - A.r).toFixed(9) };`);
    eq(JSON.stringify(r.g), '[1500,500]', 'the grip is at the middle of the arc');
    eq(JSON.stringify(r.ends), JSON.stringify([[1000,0],[1000,1000]]), 'dragging it leaves the ends where they are');
    eq(r.through, 0, 'and the arc now passes through where it was dropped');
  });

  group('B1 kernel — OFFSET the way AutoCAD makes it');

  t('an arc segment of a polyline offsets to an arc about the same centre', () => {
    const r = R(`${SETUP}
      const e = { t:'pline', pts:[[0,0],[2000,0],[3000,1000],[3000,3000]], bulges:[0, Math.tan(Math.PI/8), 0], id: 1 };
      const o = offsetEnt(e, 200, offsetSide(e, [1000, 500]));
      return o && { pts: o.pts, b: o.bulges };`);
    eq(r.pts.length, 4, 'same number of vertices');
    close(r.pts[1][0], 2000, 1e-6); close(r.pts[1][1], 200, 1e-6);
    close(r.pts[2][0], 2800, 1e-6); close(r.pts[2][1], 1000, 1e-6);
    close(r.b[1], Math.tan(Math.PI / 8), 1e-9, 'still a quarter circle, radius 800 about the same centre');
  });

  t('a closed shape offset inward past its collapse makes nothing', () => {
    const r = R(`${SETUP}
      const e = { t:'pline', pts:[[0,0],[1000,0],[1000,1000],[0,1000]], closed:true, id: 1 };
      const side = offsetSide(e, [500, 500]);
      return { ok: offsetEnts(e, 400, side).map(o => o.pts), gone: offsetEnts(e, 600, side).length };`);
    eq(JSON.stringify(r.ok), JSON.stringify([[[400,400],[600,400],[600,600],[400,600]]]), 'inside, while it fits');
    eq(r.gone, 0, 'and nothing at all once it does not — not a small inside-out copy');
  });

  t('a waisted shape offset inward pinches into two', () => {
    const r = R(`${SETUP}
      const e = { t:'pline', closed:true, id: 1, pts:[[0,0],[1000,0],[1000,400],[2000,400],[2000,0],[3000,0],
                  [3000,1000],[2000,1000],[2000,600],[1000,600],[1000,1000],[0,1000]] };
      return offsetEnts(e, 150, offsetSide(e, [500, 500])).map(o => o.pts);`);
    eq(r.length, 2, 'two loops, one in each lobe');
    eq(JSON.stringify(r.map(p => p.length)), '[4,4]', 'each a clean square: ' + JSON.stringify(r));
  });

  t('an ellipse offsets to a spline that is the distance off all the way round', () => {
    const r = R(`${SETUP}
      const e = { t:'ellipse', c:[0,0], rx:1000, ry:500, rot:0, id: 1 };
      const o = offsetEnts(e, 100, offsetSide(e, [0, 700]));
      const C = curveOf(e);
      const d = o[0] ? o[0].pts.map(p => crvNear(C, p).d) : [];
      return { n: o.length, t: o[0] && o[0].t, closed: o[0] && o[0].closed,
               lo: Math.min(...d), hi: Math.max(...d) };`);
    eq(r.n, 1); eq(r.t, 'spline', 'the offset of an ellipse is not an ellipse');
    eq(r.closed, true);
    close(r.lo, 100, 1e-6, 'nearest point ' + r.lo); close(r.hi, 100, 1e-6, 'furthest ' + r.hi);
  });
};
