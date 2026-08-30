'use strict';
/* ============================================================
   7.1 — polylines with arc segments

   A bulge is how every DXF in the world stores a curved
   polyline: one number per vertex, tan(theta/4) of the included
   angle to the next one. A rounded rectangle, a slot, an
   obround, a curved kerb, a stair nosing — all of them.

   The reader took p.slice(0,2) and never looked at group 42, so
   every one of those arrived as a chord chain. No error, no
   warning: a rounded corner became a chamfer and the drawing
   opened looking broadly right. The ezdxf gate could not catch
   it, because it validates what our writer emits against a
   fixture we wrote, not what our reader kept.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  /* a square with the top edge bulged into a half circle upward */
  const halfCircle = () => { begin();
    const e = addEnt({t:'pline', pts:[[0,0],[1000,0],[1000,1000],[0,1000]],
                      bulges:[0,0,1,0], closed:true, layer:'0'});
    commit('p'); return e; };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('the arc a bulge describes');

  /* b = tan(theta/4). b = 1 is a half circle, and its centre is the midpoint
     of the chord — the one case that can be checked by eye. */
  t('a bulge of 1 is a half circle on the chord', () => {
    const r = R(`${SETUP}
      const a = bulgeArc([0,0], [1000,0], 1);
      return { c: a && a.c.map(Math.round), r: a && Math.round(a.r),
               sweep: a && Math.round(deg(Math.abs(wrap(a.a1 - a.a0)))) };`);
    eq(r.c.join(','), '500,0', 'centred on the middle of the chord');
    eq(r.r, 500, 'radius is half the chord');
    eq(r.sweep, 180, 'and it sweeps 180 degrees');
  });

  /* Positive is counterclockwise from start to end — the DXF definition.
     Travelling left to right, counterclockwise puts the arc BELOW the chord,
     which is the opposite of what the word "bulge" suggests to the eye. Worth
     a test precisely because it is easy to assume the other way round. */
  t('a positive bulge is counterclockwise, and negative is its mirror', () => {
    const r = R(`${SETUP}
      const pos = bulgeArc([0,0], [1000,0], 0.5);
      const neg = bulgeArc([0,0], [1000,0], -0.5);
      /* wrap() returns [0, 2pi), so the midpoint has to be walked in the
         direction the arc actually goes or a clockwise one samples the far
         half of the circle */
      const crest = (a) => { const sweep = a.ccw ? wrap(a.a1 - a.a0) : -wrap(a.a0 - a.a1);
        const m = a.a0 + sweep / 2;
        return [a.c[0] + a.r * Math.cos(m), a.c[1] + a.r * Math.sin(m)]; };
      return { pos: crest(pos).map(Math.round), neg: crest(neg).map(Math.round),
               posCcw: pos.ccw, negCcw: neg.ccw };`);
    eq(r.posCcw, true, 'positive is counterclockwise');
    eq(r.negCcw, false, 'negative is clockwise');
    ok(r.pos[1] < 0, 'so on a left-to-right chord it arcs below, got ' + r.pos.join(','));
    ok(r.neg[1] > 0, 'and the negative one above, got ' + r.neg.join(','));
    eq(Math.abs(r.pos[1]), Math.abs(r.neg[1]), 'by the same amount');
    eq(r.pos[0], 500, 'both symmetric about the chord midpoint');
  });

  /* The fixture arcs the other way because its top edge runs right to left,
     so the same +1 arcs upward. Pinned because the rest of this suite
     measures against it. */
  t('and which way that looks depends on how the span is travelled', () => {
    const r = R(`${SETUP}
      const e = halfCircle();
      return { top: Math.round(bbox(e)[3]) };`);
    eq(r.top, 1500, 'the top edge runs right to left, so +1 arcs up');
  });

  t('a quarter circle comes out with the right radius', () => {
    const r = R(`${SETUP}
      /* a 90 degree arc: b = tan(90/4) = tan(22.5) */
      const b = Math.tan(rad(22.5));
      const a = bulgeArc([0,0], [1000,1000], b);
      return { r: a.r, sweep: deg(Math.abs(wrap(a.a1 - a.a0))) };`);
    close(r.sweep, 90, 0.01, 'ninety degrees');
    close(r.r, 1000, 0.01, 'a 1000-long chord subtending 90 degrees has radius 1000');
  });

  t('a zero bulge is a straight line, not a degenerate arc', () => {
    const r = R(`${SETUP}
      return { zero: bulgeArc([0,0], [1000,0], 0),
               tiny: bulgeArc([0,0], [1000,0], 1e-12),
               nul: bulgeArc([0,0], [0,0], 1) };`);
    eq(r.zero, null, 'no arc for a zero bulge');
    eq(r.tiny, null, 'nor for one below the threshold where an arc means anything');
    eq(r.nul, null, 'nor for a zero-length chord');
  });

  group('a polyline that carries them');

  t('draws the bulged span as an arc and the rest as lines', () => {
    const r = R(`${SETUP}
      const e = halfCircle();
      const sh = shapes(e, 32);
      return { arcs: sh.filter(s => s.r != null).length,
               lines: sh.filter(s => s.pts).length,
               radius: Math.round((sh.find(s => s.r != null) || {}).r || 0) };`);
    eq(r.arcs, 1, 'one arc');
    ok(r.lines >= 1, 'and the straight spans as lines');
    eq(r.radius, 500, 'the arc is the half circle on the 1000 top edge');
  });

  t('is measured round its arcs, not across their chords', () => {
    const r = R(`${SETUP}
      const e = halfCircle();
      const withArc = entLength(e);
      begin(); mut(e); e.bulges = null; commit('flat');
      const flat = entLength(e);
      return { withArc, flat, expected: flat - 1000 + Math.PI * 500 };`);
    close(r.withArc, r.expected, 1,
      'the half circle is 1571 long, not the 1000 chord: got ' + Math.round(r.withArc));
    ok(r.withArc > r.flat, 'and longer than the flat version');
  });

  t('its bounds include the bulge, not just the vertices', () => {
    const r = R(`${SETUP}
      const e = halfCircle();
      const b = bbox(e);
      return { top: Math.round(b[3]) };`);
    eq(r.top, 1500, 'the arc reaches 500 above the 1000 edge it bulges from');
  });

  t('a point on the arc is on the object', () => {
    const r = R(`${SETUP}
      const e = halfCircle();
      /* the crown of the half circle bulging up from y=1000 */
      return { onArc: entDist([500, 1500], e), offArc: entDist([500, 1300], e) };`);
    close(r.onArc, 0, 1, 'the crown of the arc is on it');
    ok(r.offArc > 100, 'and the hollow under the arc is not, got ' + r.offArc);
  });

  group('moving one');

  t('a bulge survives a move and a rotation unchanged', () => {
    const r = R(`${SETUP}
      const e = halfCircle();
      const before = e.bulges.slice();
      begin(); xf(e, p => [p[0] + 500, p[1] - 200]); commit('m');
      const moved = e.bulges.slice();
      begin(); xf(e, p => { const c = Math.cos(rad(30)), s = Math.sin(rad(30));
        return [p[0]*c - p[1]*s, p[0]*s + p[1]*c]; }); commit('r');
      return { before, moved, rotated: e.bulges.slice(), len: Math.round(entLength(e)) };`);
    eq(r.moved.join(','), r.before.join(','), 'a move leaves it alone');
    eq(r.rotated.join(','), r.before.join(','), 'and so does a rotation');
    ok(r.len > 3000, 'and the shape is still the same size: ' + r.len);
  });

  /* A mirror reverses which way the arc bows; keeping the sign would flip the
     shape inside out while leaving the vertices right, which looks almost
     correct and is not. */
  t('a mirror flips the direction it bows', () => {
    const r = R(`${SETUP}
      const e = halfCircle();
      const before = e.bulges.slice();
      begin(); xf(e, p => [-p[0], p[1]]); commit('mirror');
      return { before, after: e.bulges.slice() };`);
    eq(r.after.join(','), r.before.map(b => -b || 0).join(','),
      'every bulge changed sign: ' + r.after.join(','));
  });

  t('a uniform scale keeps it; a non-uniform one gives up honestly', () => {
    const r = R(`${SETUP}
      const u = halfCircle();
      begin(); xf(u, p => [p[0] * 2, p[1] * 2]); commit('s');
      const uniform = { bulges: u.bulges && u.bulges.slice(), len: Math.round(entLength(u)) };
      const n = halfCircle();
      const ptsBefore = n.pts.length;
      begin(); xf(n, p => [p[0] * 2, p[1]]); commit('ns');
      return { uniform, nonUniform: { curved: hasBulge(n), pts: n.pts.length, ptsBefore } };`);
    eq(r.uniform.bulges.join(','), '0,0,1,0', 'a uniform scale leaves the bulge alone');
    close(r.uniform.len, 2 * (3000 + Math.PI * 500), 2, 'and doubles the length');
    ok(!r.nonUniform.curved,
      'a non-uniform scale cannot keep a circular arc, so it does not pretend to');
    ok(r.nonUniform.pts > r.nonUniform.ptsBefore,
      'it tessellates instead, got ' + r.nonUniform.pts + ' points');
  });

  group('through a DXF');

  t('a bulged polyline written out and read back is the same shape', () => {
    const r = R(`${SETUP}
      const e = halfCircle();
      const len = entLength(e);
      const dxf = exportDXF();
      resetDoc();
      importDXF(dxf);
      const back = [...DOC.ents.values()].find(x => x.t === 'pline');
      const NL = String.fromCharCode(10);
      return { has42: dxf.split(NL).some(l => l.trim() === '42'),
               bulges: back && back.bulges, len, backLen: back && entLength(back) };`);
    eq(r.has42, true, 'group 42 is written');
    ok(r.bulges, 'and read back');
    close(r.backLen, r.len, 1,
      'so the shape survives: ' + Math.round(r.backLen) + ' vs ' + Math.round(r.len));
  });

  /* The bug this whole suite exists for. */
  t('a curved polyline from another package does not arrive as chords', () => {
    const r = R(`${SETUP}
      /* an LWPOLYLINE with a bulge on its second vertex, as any CAD writes it */
      const dxf = ['0','SECTION','2','ENTITIES',
        '0','LWPOLYLINE','8','0','90','3','70','0',
        '10','0','20','0','42','0',
        '10','1000','20','0','42','1',
        '10','1000','20','1000','42','0',
        '0','ENDSEC','0','EOF'].join(String.fromCharCode(10));
      importDXF(dxf);
      const e = [...DOC.ents.values()].find(x => x.t === 'pline');
      return { found: !!e, bulges: e && e.bulges,
               len: e && Math.round(entLength(e)),
               chordLen: 1000 + 1000 };`);
    eq(r.found, true, 'the polyline imported');
    ok(r.bulges && r.bulges[1] === 1, 'carrying its bulge: ' + JSON.stringify(r.bulges));
    ok(r.len > r.chordLen + 500,
      'and it is the arc length, not the chord: ' + r.len + ' against a chord total of ' + r.chordLen);
  });

  t('a plain polyline is completely unchanged by any of this', () => {
    const r = R(`${SETUP}
      begin();
      const e = addEnt({t:'pline', pts:[[0,0],[1000,0],[1000,1000]], closed:false, layer:'0'});
      commit('p');
      const saved = JSON.parse(saveNative());
      const rec = saved.ents.find(x => x.t === 'pline');
      return { keys: Object.keys(rec).indexOf('bulges') >= 0,
               len: Math.round(entLength(e)),
               shapes: shapes(e, 32).length,
               arcs: shapes(e, 32).filter(s => s.r != null).length };`);
    eq(r.keys, false, 'nothing is written that was not there before');
    eq(r.len, 2000, 'the length is the two straight spans');
    eq(r.arcs, 0, 'and there are no arcs in it');
  });
};
