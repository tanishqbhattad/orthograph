'use strict';
/* ============================================================
   C1 — compound wall structure

   A cavity wall is not 300mm of one thing. Its layers are what a
   section is drawn from, what a U-value is calculated from and
   what a builder is told to build.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  const rolesOf = (w) => { const o = {};
    for (const s of shapes(w, 48)) o[s.role || '?'] = (o[s.role || '?'] || 0) + 1;
    return o; };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('the shipped library is internally consistent');

  /* If the layers do not sum to the type's own thickness the stack is scaled
     to fit, and the library quietly stops matching its own numbers: a 102.5
     brick leaf silently became 97.6 the first time I wrote this. */
  t('every layered wall type sums to its declared thickness', () => {
    const r = R(`${SETUP}
      const bad = [];
      for (const ty of DOC.wallTypes) {
        if (!ty.layers) continue;
        const sum = ty.layers.reduce((n, l) => n + (l.t || 0), 0);
        if (Math.abs(sum - ty.t) > 1e-9) bad.push(ty.id + ': ' + sum + ' vs ' + ty.t);
      }
      return { bad, layered: DOC.wallTypes.filter(x => x.layers).length };`);
    ok(r.layered >= 2, 'there are layered types to check');
    eq(r.bad.length, 0, r.bad.join('; '));
  });

  group('layers are drawn inside the wall');

  t('a four-layer type draws three boundaries', () => {
    const r = R(`${SETUP}
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'cav300', layer:'A-WALL'});
      commit('w');
      const stack = wallLayerStack(w);
      return { layers: stack.length, roles: rolesOf(w),
               total: +stack.reduce((n, l) => n + l.t, 0).toFixed(6),
               thickness: wallT(w) };`);
    eq(r.layers, 4, 'the cavity build-up has four layers');
    eq(r.roles.wlayer, 3, 'four layers, three boundaries between them');
    eq(r.roles.face, 2, 'and still two faces');
    close(r.total, 300, 1e-9, 'summing to the wall thickness');
    eq(r.thickness, 300);
  });

  t('a plain type has no stack and draws no boundaries', () => {
    const r = R(`${SETUP}
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'brk230', layer:'A-WALL'});
      commit('w');
      return { stack: wallLayerStack(w), roles: rolesOf(w) };`);
    eq(r.stack, null, 'a single-material type has no layers to draw');
    eq(r.roles.wlayer, undefined, 'so no boundary lines are produced');
    eq(r.roles.face, 2);
  });

  /* An override on one wall must not put the layers out of proportion: a 300
     type drawn at 330 keeps its ratios rather than growing a 30mm gap nobody
     specified. */
  t('an overridden thickness scales the stack in proportion', () => {
    const r = R(`${SETUP}
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'cav300', th:600, layer:'A-WALL'});
      commit('w');
      const stack = wallLayerStack(w);
      const base = DOC.wallTypes.find(x => x.id === 'cav300').layers;
      return { total: +stack.reduce((n, l) => n + l.t, 0).toFixed(6),
               ratios: stack.map((l, i) => +(l.t / base[i].t).toFixed(9)) };`);
    close(r.total, 600, 1e-9, 'the stack fills the overridden thickness');
    ok(r.ratios.every(x => Math.abs(x - 2) < 1e-9),
      'every layer doubled, got ' + r.ratios.join(','));
  });

  t('layer boundaries sit between the faces, at the right offsets', () => {
    const r = R(`${SETUP}
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'cav300', just:'center', layer:'A-WALL'});
      commit('w');
      /* a horizontal wall: every boundary is a horizontal line, and its y is
         the offset from the centreline */
      const ys = shapes(w, 48).filter(s => s.role === 'wlayer')
        .map(s => +s.pts[0][1].toFixed(6)).sort((a, b) => b - a);
      const faces = shapes(w, 48).filter(s => s.role === 'face')
        .map(s => +s.pts[0][1].toFixed(6)).sort((a, b) => b - a);
      return { ys, faces };`);
    eq(r.faces.join(','), '150,-150', 'the faces are at plus and minus half the thickness');
    /* 102.5 from the plus face, then 85, then 100 */
    eq(r.ys.join(','), '47.5,-37.5,-137.5',
      'and the boundaries follow the build-up, got ' + r.ys.join(','));
  });

  t('an opening cuts the layer lines exactly as it cuts the faces', () => {
    const r = R(`${SETUP}
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'cav300', layer:'A-WALL'});
      const before = rolesOf(w);
      addEnt({t:'door', host:w.id, pos:3000, w:900, layer:'A-DOOR'});
      commit('w');
      const after = rolesOf(w);
      /* every layer line is now in two pieces, like every face */
      return { beforeLayers: before.wlayer, afterLayers: after.wlayer,
               beforeFaces: before.face, afterFaces: after.face };`);
    eq(r.beforeLayers, 3); eq(r.beforeFaces, 2);
    eq(r.afterFaces, 4, 'a door breaks each face in two');
    eq(r.afterLayers, 6, 'and each layer line with them, got ' + r.afterLayers);
  });

  /* Both faces are already mitred at a junction, so a line interpolated
     between them is mitred too — the layers cannot disagree with the faces
     that enclose them. */
  t('layer lines mitre at a corner along with the faces', () => {
    const r = R(`${SETUP}
      begin();
      const a = addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'cav300', layer:'A-WALL'});
      const b = addEnt({t:'wall', a:[6000,0], b:[6000,5000], wt:'cav300', layer:'A-WALL'});
      commit('w');
      const la = shapes(a, 48).filter(s => s.role === 'wlayer');
      const lb = shapes(b, 48).filter(s => s.role === 'wlayer');
      /* the innermost boundary of each wall should meet at the corner */
      const endA = la.map(s => s.pts[1]);
      const startB = lb.map(s => s.pts[0]);
      let worst = 0;
      for (let i = 0; i < Math.min(endA.length, startB.length); i++)
        worst = Math.max(worst, Math.min(...startB.map(q => dist(endA[i], q))));
      return { na: la.length, nb: lb.length, worst: +worst.toFixed(6) };`);
    eq(r.na, 3); eq(r.nb, 3, 'both walls draw their boundaries');
    ok(r.worst < 1e-6,
      'and each one meets its opposite number at the corner, worst gap ' + r.worst);
  });
  group('where three or more walls meet');

  /* Each wall's body stops at its own mitre, so with three ends or more the
     patch between them belonged to nobody and the background showed through:
     a white triangle at a T, a white star in the middle of a junction. It was
     always there — a faint wash hid it, and a solid poche does not. */
  t('a T-junction has no hole in the middle of it', () => {
    const r = R(`${SETUP}
      const a = addEnt({t:'wall', a:[0,0], b:[-4000,0], wt:'gen100', layer:'A-WALL'});
      const b = addEnt({t:'wall', a:[0,0], b:[4000,0], wt:'gen100', layer:'A-WALL'});
      const c = addEnt({t:'wall', a:[0,0], b:[0,-4000], wt:'gen100', layer:'A-WALL'});
      const poche = [];
      for (const w of [a, b, c])
        for (const s of shapes(w, 32)) if (s.role === 'poche') poche.push(s.pts);
      return { covered: poche.some(p => pointInPoly([0,0], p)), n: poche.length };`);
    eq(r.covered, true, 'the node itself is inside the poche');
  });

  t('so does a six-way junction', () => {
    const r = R(`${SETUP}
      const ws = [];
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        ws.push(addEnt({t:'wall', a:[0,0], b:[Math.cos(a)*4000, Math.sin(a)*4000],
                        wt:'gen100', layer:'A-WALL'}));
      }
      const poche = [];
      for (const w of ws) for (const s of shapes(w, 32)) if (s.role === 'poche') poche.push(s.pts);
      /* a point just off the node, where the star used to show through */
      return { node: poche.some(p => pointInPoly([0,0], p)),
               near: poche.some(p => pointInPoly([12,7], p)) };`);
    eq(r.node, true, 'the middle is filled');
    eq(r.near, true, 'and so is the rest of the patch');
  });

  t('the patch is drawn once, not once per wall', () => {
    const r = R(`${SETUP}
      const ws = [];
      ws.push(addEnt({t:'wall', a:[0,0], b:[-4000,0], wt:'gen100', layer:'A-WALL'}));
      ws.push(addEnt({t:'wall', a:[0,0], b:[4000,0], wt:'gen100', layer:'A-WALL'}));
      ws.push(addEnt({t:'wall', a:[0,0], b:[0,-4000], wt:'gen100', layer:'A-WALL'}));
      let n = 0;
      for (const w of ws) for (const s of shapes(w, 32)) if (s.node) n++;
      return { n };`);
    eq(r.n, 1, 'one wall owns it');
  });

  t('a plain corner grows nothing extra, because it has no hole', () => {
    const r = R(`${SETUP}
      const a = addEnt({t:'wall', a:[0,0], b:[4000,0], wt:'gen100', layer:'A-WALL'});
      const b = addEnt({t:'wall', a:[0,0], b:[0,4000], wt:'gen100', layer:'A-WALL'});
      let n = 0;
      for (const w of [a, b]) for (const s of shapes(w, 32)) if (s.node) n++;
      return { n };`);
    eq(r.n, 0, 'a mitred corner already closes itself');
  });

  t('an end that meets nothing is still capped', () => {
    const r = R(`${SETUP}
      const a = addEnt({t:'wall', a:[0,0], b:[4000,0], wt:'gen100', layer:'A-WALL'});
      let n = 0;
      for (const s of shapes(a, 32)) if (s.node) n++;
      return { n, capped: wallEndPoints(a, 1).capped };`);
    eq(r.n, 0);
    eq(r.capped, true, 'a free end is unchanged by any of this');
  });
};
