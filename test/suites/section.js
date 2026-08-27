'use strict';
/* ============================================================
   C6 — sections

   A plan is a horizontal cut; a section is a vertical one. The
   program knew where every wall was, how thick, how tall and
   where its openings sat — and none of it could be looked at
   from the side.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-SECT', '#ff9f5c');
  /* a box, a partition down the middle, a door in it and a window each side */
  const plan = () => {
    begin();
    const S = addEnt({t:'wall', a:[0,0], b:[10000,0], wt:'cav300', layer:'A-WALL'});
    const E = addEnt({t:'wall', a:[10000,0], b:[10000,6000], wt:'cav300', layer:'A-WALL'});
    const N = addEnt({t:'wall', a:[10000,6000], b:[0,6000], wt:'cav300', layer:'A-WALL'});
    const W = addEnt({t:'wall', a:[0,6000], b:[0,0], wt:'cav300', layer:'A-WALL'});
    const P = addEnt({t:'wall', a:[5000,0], b:[5000,6000], wt:'part140', layer:'A-WALL'});
    addEnt({t:'door', host:P.id, pos:3000, w:900, h:2100, layer:'A-DOOR'});
    addEnt({t:'window', host:W.id, pos:3000, w:1200, h:1200, sill:900, layer:'A-GLAZ'});
    addEnt({t:'window', host:E.id, pos:3000, w:1200, h:1200, sill:900, layer:'A-GLAZ'});
    commit('plan');
    return { S, E, N, W, P };
  };
  const cutLine = () => { begin();
    const s = addEnt({t:'section', a:[-1500,3000], b:[11500,3000], dir:1, label:'A', layer:'A-SECT'});
    commit('sec'); return s; };
  const bandsOf = (G) => G.parts.filter(p => p.kind === 'wall').map(p => {
    const xs = p.pts.map(q => q[0]), ys = p.pts.map(q => q[1]);
    return { x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
             lo: Math.round(Math.min(...ys)), hi: Math.round(Math.max(...ys)),
             cut: Math.round(Math.max(...xs) - Math.min(...xs)) };
  }).sort((a, b) => a.x - b.x || a.lo - b.lo);
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('the cut');

  t('a section cuts the walls it crosses, at their real thickness', () => {
    const r = R(`${SETUP}
      plan();
      const G = sectionGeometry(cutLine());
      const bands = bandsOf(G);
      return { cuts: G.cuts, bands, span: Math.round(G.span) };`);
    eq(r.cuts, 3, 'it crosses two external walls and the partition');
    eq(r.bands[0].cut, 300, 'the cavity wall is cut 300 wide');
    eq(r.bands[2].cut, 140, 'and the partition 140, got ' + r.bands[2].cut);
    eq(r.span, 13000);
  });

  /* This is what makes it a section rather than a row of posts: the cut passes
     through the openings, and the wall is what is left. */
  t('an opening leaves a gap, and the wall is what is left around it', () => {
    const r = R(`${SETUP}
      plan();
      const bands = bandsOf(sectionGeometry(cutLine()));
      const at = x => bands.filter(b => b.x === x).map(b => b.lo + '-' + b.hi);
      return { west: at(1500), part: at(6500), east: at(11500) };`);
    eq(r.west.join(','), '0-900,2100-3000',
      'a window leaves the wall below the sill and above the head');
    eq(r.east.join(','), '0-900,2100-3000');
    eq(r.part.join(','), '2100-3000',
      'a door reaches the floor, so only the head band survives');
  });

  t('heads and sills are drawn so an opening reads as one', () => {
    const r = R(`${SETUP}
      plan();
      const G = sectionGeometry(cutLine());
      return { heads: G.parts.filter(p => p.kind === 'head').map(p => Math.round(p.pts[0][1])),
               sills: G.parts.filter(p => p.kind === 'sill').map(p => Math.round(p.pts[0][1])) };`);
    eq(r.heads.join(','), '2100,2100,2100', 'three openings, three heads');
    eq(r.sills.join(','), '900,900', 'and two of them have sills — a door does not');
  });

  t('a wall the section only runs alongside is not a cut', () => {
    const r = R(`${SETUP}
      begin();
      /* a wall lying exactly along the section line */
      addEnt({t:'wall', a:[0,3000], b:[9000,3000], wt:'cav300', layer:'A-WALL'});
      commit('w');
      const G = sectionGeometry(cutLine());
      return { cuts: G.cuts, parts: G.parts.filter(p => p.kind === 'wall').length };`);
    eq(r.cuts, 0, 'a parallel wall is a face, not a cut');
    eq(r.parts, 0);
  });

  t('a wall crossed at an angle is cut wider than it is thick', () => {
    const r = R(`${SETUP}
      begin();
      /* 45 degrees to the section line */
      addEnt({t:'wall', a:[3000,0], b:[9000,6000], wt:'cav300', layer:'A-WALL'});
      commit('w');
      const bands = bandsOf(sectionGeometry(cutLine()));
      return { cut: bands.length ? bands[0].cut : null,
               want: Math.round(300 / Math.sin(Math.PI / 4)) };`);
    eq(r.cut, r.want, 'cut = thickness / sin(angle), got ' + r.cut + ' want ' + r.want);
  });

  t('a section only cuts what it reaches', () => {
    const r = R(`${SETUP}
      plan();
      begin();
      /* a short line that stops before the east wall */
      const s = addEnt({t:'section', a:[-1500,3000], b:[6000,3000], dir:1, label:'B', layer:'A-SECT'});
      commit('s');
      const bands = bandsOf(sectionGeometry(s));
      return { xs: [...new Set(bands.map(b => b.x))] };`);
    eq(r.xs.join(','), '1500,6500',
      'the east wall is beyond the end of the line, got ' + r.xs.join(','));
  });

  group('placing it in the drawing');

  /* Generated, not live: the section is real geometry you can dimension and
     plot, and it cannot disagree with itself halfway through an edit. */
  t('cutting places real geometry that can be edited like anything else', () => {
    const r = R(`${SETUP}
      const P = plan();
      const s = cutLine();
      const before = DOC.ents.size;
      const n = placeSection(s, [0, -9000]);
      const made = [...DOC.ents.values()].filter(e => e.layer === 'A-SECT' && e.t !== 'section');
      const kinds = made.reduce((o, e) => { o[e.t] = (o[e.t] || 0) + 1; return o; }, {});
      /* it is ordinary geometry: it moves */
      const one = made.find(e => e.t === 'pline');
      begin(); xf(one, T.move([100, 0])); commit('mv');
      return { n, added: DOC.ents.size - before, kinds, moved: !!one };`);
    ok(r.n > 0, 'something was placed');
    ok(r.kinds.hatch > 0, 'the cut walls are poched');
    ok(r.kinds.pline > 0, 'and outlined');
    ok(r.kinds.line > 0, 'with the storey datums drawn across');
    eq(r.moved, true, 'and it is ordinary geometry afterwards');
  });

  t('re-cutting after a change gives a different section', () => {
    const r = R(`${SETUP}
      const P = plan();
      const s = cutLine();
      const a = bandsOf(sectionGeometry(s));
      /* take the door out: the partition should now cut floor to ceiling */
      const d = [...DOC.ents.values()].find(e => e.t === 'door');
      begin(); delEnt(d.id); commit('rm');
      const b = bandsOf(sectionGeometry(s));
      const at = (bands, x) => bands.filter(y => y.x === x).map(y => y.lo + '-' + y.hi);
      return { before: at(a, 6500), after: at(b, 6500) };`);
    eq(r.before.join(','), '2100-3000', 'with the door, only the head band');
    eq(r.after.join(','), '0-3000', 'without it, the whole partition');
  });

  t('a section line has a direction, and it can be flipped', () => {
    const r = R(`${SETUP}
      const s = cutLine();
      const before = s.dir;
      SEL.clear(); SEL.add(s.id);
      META.sectionflip.fn();
      const after = s.dir;
      const F = sectionFrame(s);
      return { before, after, look: F.look };`);
    eq(r.before, 1); eq(r.after, -1, 'flipping turns it round');
    eq(r.look, -1, 'and the frame follows');
  });

  /* A section is a cut through the WHOLE building, not through the storey you
     happen to be standing on. This used visible(), which answers for the
     current level — so a two-storey section showed one storey and a floating
     roof, and the level filter added in C3 silently broke it. */
  t('a section cuts every storey, whichever one is current', () => {
    const r = R(`${SETUP}
      plan();
      gotoLevel(1);
      begin();
      addEnt({t:'wall', a:[2000,0], b:[2000,6000], wt:'part140', layer:'A-WALL'});
      commit('up');
      const onFirst = bandsOf(sectionGeometry(cutLine())).map(b => b.lo + '-' + b.hi);
      gotoLevel(0);
      const onGround = bandsOf(sectionGeometry(cutLine())).map(b => b.lo + '-' + b.hi);
      return { onFirst, onGround };`);
    ok(r.onFirst.includes('3000-6000'), 'the upper storey is cut at its own elevation');
    ok(r.onFirst.some(b => b.startsWith('0-') || b === '2100-3000'),
      'and the ground floor is cut too, got ' + r.onFirst.join(','));
    eq(r.onGround.join(','), r.onFirst.join(','),
      'and it does not matter which storey is current');
  });

  t('a layer turned off is left out of the section', () => {
    const r = R(`${SETUP}
      plan();
      const before = sectionGeometry(cutLine()).cuts;
      DOC.layers.find(l => l.name === 'A-WALL').on = false;
      const after = sectionGeometry(cutLine()).cuts;
      DOC.layers.find(l => l.name === 'A-WALL').on = true;
      return { before, after };`);
    eq(r.before, 3);
    eq(r.after, 0, 'turning a layer off means you do not want it anywhere');
  });

  group('what is seen beyond the cut');

  /* A section shows what is cut AND what is seen past it. Without projection a
     room reads as two posts and a floor with nothing between them, when what
     you are actually looking at is the far wall. */
  t('a wall beyond the line is drawn in elevation', () => {
    const r = R(`${SETUP}
      const w = plan();
      const G = sectionGeometry(cutLine());
      const seen = G.parts.filter(p => p.kind === 'seen').map(p => {
        const xs = p.pts.map(q => q[0]), ys = p.pts.map(q => q[1]);
        return { x0: Math.round(Math.min(...xs)), x1: Math.round(Math.max(...xs)),
                 lo: Math.round(Math.min(...ys)), hi: Math.round(Math.max(...ys)) };
      });
      return { cut: G.cuts, seen: seen.length, first: seen[0] };`);
    eq(r.cut, 3, 'the three crossed walls are still cut');
    ok(r.seen >= 1, 'and the far wall is seen, got ' + r.seen);
    eq(r.first.lo + '..' + r.first.hi, '0..3000', 'at its full storey height');
  });

  t('openings in a wall beyond the line show as openings', () => {
    const r = R(`${SETUP}
      const w = plan();
      begin();
      addEnt({t:'window', host:w.N.id, pos:2500, w:1500, h:1400, sill:800, layer:'A-GLAZ'});
      commit('far window');
      const G = sectionGeometry(cutLine());
      const seen = G.parts.filter(p => p.kind === 'seen').map(p => {
        const ys = p.pts.map(q => q[1]);
        return Math.round(Math.min(...ys)) + '..' + Math.round(Math.max(...ys));
      });
      return { seen };`);
    ok(r.seen.includes('800..2200'),
      'the window reads sill to head, got ' + r.seen.join(', '));
  });

  /* A face you are merely looking at must not read as one you sliced through. */
  t('what is seen is outlined, never poched', () => {
    const r = R(`${SETUP}
      plan();
      const s = cutLine();
      placeSection(s, [0, -9000]);
      const made = [...DOC.ents.values()].filter(e => e.layer === 'A-SECT' && e.t !== 'section');
      const hatches = made.filter(e => e.t === 'hatch').length;
      const plines = made.filter(e => e.t === 'pline').length;
      const G = sectionGeometry(s);
      return { hatches, plines,
               cutBands: G.parts.filter(p => p.kind === 'wall').length,
               seen: G.parts.filter(p => p.kind === 'seen').length };`);
    eq(r.hatches, r.cutBands,
      'exactly the cut bands are poched, got ' + r.hatches + ' for ' + r.cutBands);
    eq(r.plines, r.cutBands + r.seen,
      'and everything is outlined, cut and seen alike');
  });

  t('a wall past the view depth is not drawn', () => {
    const r = R(`${SETUP}
      begin();
      /* one wall just beyond the line, one far past any sensible depth */
      addEnt({t:'wall', a:[0,4000], b:[8000,4000], wt:'cav300', layer:'A-WALL'});
      addEnt({t:'wall', a:[0,80000], b:[8000,80000], wt:'cav300', layer:'A-WALL'});
      commit('w');
      const s = cutLine();
      s.depth = 20000;
      const seen = sectionGeometry(s).parts.filter(p => p.kind === 'seen');
      return { seen: seen.length };`);
    eq(r.seen, 1, 'the near one is seen and the distant one is not');
  });

  t('a wall behind the viewer is not drawn either', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'wall', a:[0,-4000], b:[8000,-4000], wt:'cav300', layer:'A-WALL'});
      commit('w');
      const s = cutLine();
      const facing = sectionGeometry(s).parts.filter(p => p.kind === 'seen').length;
      s.dir = -1;
      const turned = sectionGeometry(s).parts.filter(p => p.kind === 'seen').length;
      return { facing, turned };`);
    eq(r.facing, 0, 'looking away from it, it is not there');
    eq(r.turned, 1, 'and turning the section round brings it into view');
  });
};
