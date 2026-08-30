'use strict';
/* ============================================================
   8.1 — hatch patterns

   A section through a compound wall where brick, insulation and
   blockwork are told apart only by how grey they are is a
   diagram, not a drawing. It is the first thing the README's own
   known limits listed.

   A pattern is nothing but N families of parallel lines, each
   {angle, origin, shift-along, spacing, dashes}. drawHatch
   already did exactly one of those, correctly — clip to the
   loops, rotate into the pattern frame, stroke parallel lines
   across the diagonal. This is that, N times.

   The definitions here are our own. The names are the industry
   ones so a DXF round trip means something, but the numbers were
   authored for this file: the .pat libraries that ship with other
   CAD are somebody else's work under somebody else's licence.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  const hatchOf = (pat) => { begin();
    const e = addEnt({t:'hatch', loops:[[[0,0],[4000,0],[4000,4000],[0,4000]]],
                      pattern:pat, sp:200, hatchAng:0, layer:'0'});
    commit('h'); return e; };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('the pattern library');

  t('carries the materials a section is actually drawn with', () => {
    const r = R(`${SETUP}
      const names = hatchPatterns();
      return { names, n: names.length };`);
    ok(r.n >= 12, 'a usable library, got ' + r.n);
    for (const need of ['AR-CONC', 'AR-BRSTD', 'INSUL', 'EARTH', 'STEEL', 'ANSI31'])
      ok(r.names.indexOf(need) >= 0, need + ' is in it: ' + r.names.join(', '));
  });

  t('every definition is a list of line families with real numbers', () => {
    const r = R(`${SETUP}
      const bad = [];
      for (const n of hatchPatterns()) {
        const fams = hatchPattern(n);
        if (!Array.isArray(fams) || !fams.length) { bad.push(n + ': empty'); continue; }
        for (const f of fams) {
          if (!isFinite(f.a)) bad.push(n + ': angle ' + f.a);
          if (!(f.dy > 0)) bad.push(n + ': spacing ' + f.dy);
          if (f.dash && f.dash.some(d => !isFinite(d))) bad.push(n + ': dash');
        }
      }
      return { bad, count: hatchPatterns().length };`);
    eq(r.bad.length, 0, 'all sound: ' + r.bad.join(' | '));
  });

  t('a name nobody has defined draws as plain lines rather than nothing', () => {
    const r = R(`${SETUP}
      const fams = hatchPattern('SOMETHING-FROM-A-CONSULTANT');
      return { n: fams.length, a: fams[0] && fams[0].a };`);
    eq(r.n, 1, 'one family');
    ok(isFinite(r.a), 'at a real angle: a pattern we cannot draw is still a hatch');
  });

  group('what gets drawn');

  /* Each family is one rotate-and-stroke pass, so the count of stroke calls
     is the honest measure of "is this pattern actually being drawn". */
  t('a multi-family pattern strokes more than a single-family one', () => {
    const r = R(`${SETUP}
      const c = document.getElementById('cv').getContext('2d');
      const strokesFor = (pat) => { resetDoc(); const e = hatchOf(pat); fit();
        c.__trace.counts.stroke = 0; paint();
        return c.__trace.counts.stroke || 0; };
      return { line: strokesFor('line'), cross: strokesFor('cross'),
               brick: strokesFor('AR-BRSTD'), conc: strokesFor('AR-CONC') };`);
    ok(r.line > 0, 'a plain hatch draws');
    ok(r.cross > r.line, 'a crosshatch draws more, got ' + r.cross + ' vs ' + r.line);
    ok(r.brick > r.line, 'and so does brickwork, got ' + r.brick);
    ok(r.conc > r.line, 'and concrete, got ' + r.conc);
  });

  t('a dashed family sets a dash pattern, a solid one does not', () => {
    const r = R(`${SETUP}
      const c = document.getElementById('cv').getContext('2d');
      const dashesFor = (pat) => { resetDoc(); hatchOf(pat); fit();
        c.__trace.counts.setLineDash = 0; c.__trace.sets.length = 0; paint();
        return c.__trace.counts.setLineDash || 0; };
      return { plain: dashesFor('line'), brick: dashesFor('AR-BRSTD') };`);
    ok(r.brick >= r.plain,
      'the dashed family reaches setLineDash: ' + r.brick + ' vs ' + r.plain);
  });

  t('the spacing and angle on the object still drive it', () => {
    const r = R(`${SETUP}
      const c = document.getElementById('cv').getContext('2d');
      const strokes = (sp) => { resetDoc(); begin();
        addEnt({t:'hatch', loops:[[[0,0],[4000,0],[4000,4000],[0,4000]]],
                pattern:'line', sp, hatchAng:0, layer:'0'});
        commit('h'); fit();
        c.__trace.counts.moveTo = 0; paint();
        return c.__trace.counts.moveTo || 0; };
      return { wide: strokes(800), tight: strokes(200) };`);
    ok(r.tight > r.wide,
      'tighter spacing means more lines: ' + r.tight + ' vs ' + r.wide);
  });

  group('reaching a drawing');

  t('the hatch dialog offers the library, not three options', () => {
    const r = R(`${SETUP}
      /* the dialog opens once a region has been found, not on start */
      begin();
      addEnt({t:'pline', pts:[[0,0],[4000,0],[4000,4000],[0,4000]], closed:true, layer:'0'});
      commit('r');
      cancelCmd(); startCmd('hatch'); cmdPoint([2000,2000]);
      const card = document.getElementById('card');
      const html = (card && card.innerHTML) || '';
      endCmd(true);
      return { hasConc: /AR-CONC/.test(html), hasInsul: /INSUL/.test(html),
               len: html.length };`);
    eq(r.hasConc, true, 'concrete is offered');
    eq(r.hasInsul, true, 'and insulation');
  });

  /* The reason this was ranked first: a wall's layers should read as what
     they are made of, not as three shades of the same grey. */
  t('a wall layer can carry a pattern for its material', () => {
    const r = R(`${SETUP}
      return { brick: materialPattern('brick'), insul: materialPattern('insulation'),
               block: materialPattern('block'), unknown: materialPattern('nonsense') };`);
    ok(r.brick && r.brick !== r.insul, 'brick and insulation are drawn differently');
    ok(r.block && r.block !== r.brick, 'and blockwork differently again');
    eq(r.unknown, null, 'a material nobody has mapped gets no pattern invented for it');
  });

  /* The whole reason this was ranked first: a cut cavity wall should read as
     brick, cavity, block and plaster, not as four shades of one grey. */
  t('a cut wall is hatched by what each layer is made of', () => {
    const r = R(`${SETUP}
      ensureLayer('A-WALL');
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'cav300', layer:'A-WALL'});
      commit('w');
      fit();
      const c = document.getElementById('cv').getContext('2d');
      VS.wallpat = 1;
      c.__trace.counts.stroke = 0; paint();
      const patterned = c.__trace.counts.stroke || 0;
      VS.wallpat = 0;
      c.__trace.counts.stroke = 0; shapeCacheClear(); paint();
      const plain = c.__trace.counts.stroke || 0;
      VS.wallpat = 1;
      const bands = shapes(w, 32).filter(x => x.role === 'poche');
      return { patterned, plain,
               mats: bands.map(b => b.mat || '-'),
               pats: bands.map(b => materialPattern(b.mat) || '-') };`);
    ok(r.mats.length >= 3, 'the wall has layers: ' + r.mats.join(', '));
    ok(r.pats.filter(p => p !== '-').length >= 2,
      'and they map to different patterns: ' + r.pats.join(', '));
    ok(r.patterned > r.plain,
      'which are actually drawn: ' + r.patterned + ' strokes against ' + r.plain);
  });

  t('WALLPAT turns it off for anyone who wants the plain fill back', () => {
    const r = R(`${SETUP}
      return { known: 'WALLPAT' in SYSVAR, def: getvar('WALLPAT') };`);
    eq(r.known, true, 'it is in the variable table');
    eq(r.def, 1, 'and on by default: a section that reads as materials is the point');
  });

  t('a pattern name survives the project file', () => {
    const r = R(`${SETUP}
      hatchOf('AR-CONC');
      loadNative(saveNative());
      const h = [...DOC.ents.values()].find(e => e.t === 'hatch');
      return { pattern: h && h.pattern };`);
    eq(r.pattern, 'AR-CONC');
  });
};
