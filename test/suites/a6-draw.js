'use strict';
/* ============================================================
   A6 — drawing commands and the command grammar (07-cmd)

   Measured against AutoCAD 2025: its prompts, its keywords, its
   defaults, and the geometry landing exactly where it was asked
   for. Suites share one sandbox, so everything relied on is
   pinned in SETUP.
   ============================================================ */
const SETUP = `
  cancelCmd();
  resetDoc();
  DOC.units = 'mm';
  DOC.gridStep = 100; DOC.snapStep = 100; DOC.textH = 200;
  DOC.celtype = null; DOC.cecolor = null; DOC.celweight = null;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ST.dyn = false; ST.osnap = false; ST.ortho = false; ST.polar = false; ST.snapgrid = false;
  ST.otrack = false; ST.osnapOne = null; ST.ptMod = null; ST.fromBase = null;
  ST.cur = [0,0]; ST.lastPt = null; ST.angOverride = null;
  dynKill();
  CLI.lines.length = 0; CLI.history.length = 0; CLI.multiple = null; CLI.mru.length = 0;
  CLI.echo = true; CLI.autoComplete = 15;
  for (const k of Object.keys(USERALIAS)) delete USERALIAS[k];
  HIST.marks.length = 0; HIST.past.length = 0; HIST.future.length = 0;
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('A6 aliases: the top AutoComplete row is the one acad.pgp names');

  /* The top row is what Enter runs once AutoComplete has appended it into the
     field. Ranked level with every other prefix match, L went to LABEL, C to
     CANNOSCALE and A to ALIAS. */
  t('an alias typed in full puts its own command first', () => {
    const r = R(SETUP + `
      const out = {};
      for (const a of ['l','pl','c','a','rec','pol','el','spl','xl','do','po','li','e','m'])
        out[a] = (acSuggest(a, 10)[0] || {}).name;
      return out;`);
    eq(r.l, 'LINE'); eq(r.pl, 'PLINE'); eq(r.c, 'CIRCLE'); eq(r.a, 'ARC');
    eq(r.rec, 'RECTANG'); eq(r.pol, 'POLYGON'); eq(r.el, 'ELLIPSE');
    eq(r.spl, 'SPLINE'); eq(r.xl, 'XLINE'); eq(r.do, 'DONUT'); eq(r.po, 'POINT');
    eq(r.li, 'LIST'); eq(r.e, 'ERASE'); eq(r.m, 'MOVE');
  });

  t('recency still orders the rest, and a variable never outranks a command', () => {
    const r = R(SETUP + `
      runInput('limits'); cancelCmd();
      const l = acSuggest('l', 10).map(x => x.name);
      const lim = acSuggest('lim', 10).map(x => x.name);
      return { l, lim };`);
    eq(r.l[0], 'LINE', 'the alias still wins: ' + r.l.join(','));
    eq(r.l[1], 'LIMITS', 'and the command used last comes straight after: ' + r.l.join(','));
    eq(r.lim[0], 'LIMITS', 'a command name typed in part: ' + r.lim.join(','));
    const firstVar = r.lim.findIndex(n => n === 'LIMMIN' || n === 'LIMMAX');
    ok(firstVar > 0, 'LIMMIN/LIMMAX come after LIMITS: ' + r.lim.join(','));
  });
};
