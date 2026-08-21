'use strict';
/* ============================================================
   Command line, aliases, coordinate entry and system variables
   — 07-cmd / 14-events
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm';                       /* suites share one sandbox */
  DOC.gridStep = 100; DOC.snapStep = 100; DOC.textH = 200;
  DOC.ltScale = 1; DOC.dimScale = 1; DOC.celtype = null; DOC.cecolor = null; DOC.celweight = null;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ST.dyn = false; ST.osnap = false; ST.ortho = false; ST.polar = false;
  ST.cur = [0,0]; ST.lastPt = null; ST.angOverride = null;
  cancelCmd(); dynKill();
  CLI.lines.length = 0; CLI.history.length = 0; CLI.multiple = null;
  HIST.marks.length = 0; HIST.past.length = 0; HIST.future.length = 0;
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('aliases: the acad.pgp table, not a lookalike');

  t('the single letters mean what they mean in AutoCAD', () => {
    const r = R(SETUP + `
      const out = {};
      for (const a of ['l','pl','c','a','rec','pol','el','do','xl','spl','h','t','mt',
                       'm','co','cp','ro','sc','mi','o','ar','s','al','tr','ex','len',
                       'f','cha','br','j','x','div','me','ma','e','b','i','po','le']) {
        const r = resolveWord(a);
        out[a] = r ? r.name : null;
      }
      return out;`);
    /* the ones the old table had backwards are the ones that matter most */
    eq(r.o, 'OFFSET', 'O is OFFSET, never ROTATE');
    eq(r.ro, 'ROTATE'); eq(r.s, 'STRETCH', 'S is STRETCH, never SCALE');
    eq(r.sc, 'SCALE'); eq(r.x, 'EXPLODE', 'X is EXPLODE, never TRIM');
    eq(r.tr, 'TRIM'); eq(r.f, 'FILLET'); eq(r.i, 'INSERT'); eq(r.mi, 'MIRROR');
    eq(r.l, 'LINE'); eq(r.pl, 'PLINE'); eq(r.rec, 'RECTANG'); eq(r.c, 'CIRCLE');
    eq(r.a, 'ARC'); eq(r.el, 'ELLIPSE'); eq(r.pol, 'POLYGON'); eq(r.do, 'DONUT');
    eq(r.t, 'MTEXT'); eq(r.mt, 'MTEXT'); eq(r.e, 'ERASE'); eq(r.b, 'BLOCK');
    eq(r.co, 'COPY'); eq(r.cp, 'COPY'); eq(r.me, 'MEASURE'); eq(r.ma, 'MATCHPROP');
  });

  t('P is PAN and Z is ZOOM, so the navigation habits work', () => {
    const r = R(SETUP + `return [resolveWord('p').name, resolveWord('z').name, resolveWord('u').name];`);
    eq(r[0], 'PAN'); eq(r[1], 'ZOOM'); eq(r[2], 'U');
  });

  t('the dimension aliases each preset their own kind', () => {
    const r = R(SETUP + `
      const out = {};
      for (const a of ['dli','dal','dan','dra','ddi']) {
        runInput(a); out[a] = [CMD && CMD.def.key, CMD && CMD.k]; cancelCmd();
      }
      out.dco = resolveWord('dco').key;             /* DIMCONTINUE needs a dim to follow */
      return out;`);
    eq(r.dli[1], 'linear'); eq(r.dal[1], 'aligned'); eq(r.dan[1], 'angular');
    eq(r.dra[1], 'radius'); eq(r.ddi[1], 'diameter'); eq(r.dco, 'dimcont');
  });

  t('a user alias overrides the standard table and can be deleted', () => {
    const r = R(SETUP + `
      runInput('alias'); runInput('zz'); runInput('circle');
      runInput('zz'); const made = CMD && CMD.def.key; cancelCmd();
      runInput('alias'); runInput('d'); runInput('zz');
      return {made, gone: !resolveWord('zz')};`);
    eq(r.made, 'circle'); eq(r.gone, true);
  });

  group('coordinate entry: every form AutoCAD takes');

  t('absolute, relative, polar and the # override', () => {
    const abs = R(SETUP + `return parseCoord('1200,600', [100,100], null)`);
    eq(abs[0], 1200); eq(abs[1], 600);
    const rel = R(SETUP + `return parseCoord('@0,-450', [100,100], null)`);
    eq(rel[0], 100); eq(rel[1], -350);
    const pol = R(SETUP + `return parseCoord('@800<30', [0,0], null)`);
    close(pol[0], 800 * Math.cos(Math.PI / 6), 1e-9); close(pol[1], 400, 1e-9);
    /* the tooltip enters relative by default; # forces absolute */
    const dynRel = R(SETUP + `return parseCoord('500,500', [100,100], null, true)`);
    eq(dynRel[0], 600); eq(dynRel[1], 600);
    const hash = R(SETUP + `return parseCoord('#500,500', [100,100], null, true)`);
    eq(hash[0], 500); eq(hash[1], 500);
  });

  t('direct distance entry follows the cursor direction', () => {
    const r = R(SETUP + `
      runInput('line'); runInput('0,0');
      ST.cur = [1, 0]; runInput('250');
      const e = [...DOC.ents.values()][0]; cancelCmd();
      return e && e.b;`);
    close(r[0], 250, 1e-9); close(r[1], 0, 1e-9);
  });

  t('an angle override holds the direction while a distance sets the length', () => {
    const r = R(SETUP + `
      runInput('line'); runInput('0,0');
      ST.cur = [1, 0];
      runInput('<90'); const locked = ST.angOverride;
      runInput('1000');
      const e = [...DOC.ents.values()][0]; cancelCmd();
      return {locked, b: e && e.b};`);
    close(r.locked, Math.PI / 2, 1e-9);
    close(r.b[0], 0, 1e-6); close(r.b[1], 1000, 1e-6);
  });

  t('a whole line of input is played back one word at a time', () => {
    const r = R(SETUP + `
      runInput('line 0,0 1000,0');
      const e = [...DOC.ents.values()][0]; cancelCmd();
      return e && [e.a, e.b];`);
    eq(r[0][0], 0); eq(r[1][0], 1000);
  });

  group('prompts and keywords');

  t('a bracketed prompt becomes a clickable, typeable keyword list', () => {
    const r = R(SETUP + `
      runInput('line'); cmdPoint([0,0]); cmdPoint([1000,0]); cmdPoint([1000,1000]);
      const out = {text: PROMPT.text, keys: PROMPT.keys.map(k => k.key)};
      cancelCmd(); return out;`);
    eq(r.text, 'Specify next point or [Close/Undo]:');
    eq(r.keys.join(','), 'C,U');
  });

  t('a keyword may be typed in full, not just as its capital', () => {
    const r = R(SETUP + `
      runInput('line'); runInput('0,0'); runInput('1000,0'); runInput('1000,1000');
      runInput('close');
      const n = [...DOC.ents.values()].filter(e => e.t === 'line').length;
      cancelCmd(); return n;`);
    eq(r, 3, 'Close must join the last point back to the first');
  });

  t('the older · <em>C</em> close prompts are read as keywords too', () => {
    const r = R(SETUP + `
      hint('Next point · <em>C</em> close · <em>Enter</em> end');
      return {text: PROMPT.text, keys: PROMPT.keys, extra: PROMPT.extra};`);
    eq(r.text, 'Next point or [Close]:');
    eq(r.keys[0].key, 'C'); eq(r.keys[0].word, 'Close');
    eq(r.extra, 'Enter end', 'Enter is a key, not a keyword');
  });

  t('a command name typed at a point prompt is refused, as in AutoCAD', () => {
    const r = R(SETUP + `
      runInput('line'); runInput('0,0');
      CLI.lines.length = 0;
      runInput('circle');
      const out = {still: CMD && CMD.def.key, said: CLI.lines.map(l => l.t)};
      cancelCmd(); return out;`);
    eq(r.still, 'line', 'the running command is not replaced');
    ok(r.said.some(s => /Point or option keyword required/.test(s)), r.said.join(' | '));
  });

  group('transparent commands');

  t("'ZOOM runs inside LINE and hands the prompt back", () => {
    const r = R(SETUP + `
      runInput('line'); runInput('0,0');
      runInput("'zoom");
      const inner = CMD && CMD.def.key;
      runInput('e');
      const out = {inner, back: CMD && CMD.def.key, pts: CMD && CMD.pts.length,
                   prompt: PROMPT.text};
      cancelCmd(); return out;`);
    eq(r.inner, 'zoom'); eq(r.back, 'line');
    eq(r.pts, 1, 'the point already picked survives the interruption');
    eq(r.prompt, 'Specify next point or [Undo]:');
  });

  t('a command that edits the drawing refuses to run transparently', () => {
    const r = R(SETUP + `
      runInput('line'); runInput('0,0');
      CLI.lines.length = 0;
      runInput("'circle");
      const out = {still: CMD && CMD.def.key, said: CLI.lines.map(l => l.t)};
      cancelCmd(); return out;`);
    eq(r.still, 'line');
    ok(r.said.some(s => /may not be invoked transparently/.test(s)), r.said.join(' | '));
  });

  group('Esc, repeat and MULTIPLE');

  t('Esc rolls back an open journal instead of leaking it', () => {
    const r = R(SETUP + `
      const n0 = DOC.ents.size;
      runInput('line'); runInput('0,0');
      begin(); addEnt({t:'line', a:[0,0], b:[1,1]});   /* an edit caught mid-flight */
      cancelCmd();
      return {n0, n1: DOC.ents.size, cmd: CMD, journal: JN.on, undo: HIST.past.length};`);
    eq(r.n1, r.n0, 'nothing half-built is left behind');
    eq(r.cmd, null); eq(r.journal, false, 'and no journal is left open');
    eq(r.undo, 0, 'a cancel is not an undo step');
  });

  t('Esc unwinds the whole transparent stack in one press', () => {
    const r = R(SETUP + `
      runInput('line'); runInput('0,0'); runInput("'zoom");
      cancelCmd();
      return {cmd: CMD, suspended: TRANS.length, tool: ST.tool};`);
    eq(r.cmd, null); eq(r.suspended, 0); eq(r.tool, 'select');
  });

  t('an empty entry repeats the last command', () => {
    const r = R(SETUP + `
      runInput('circle'); cancelCmd();
      runInput('');
      const again = CMD && CMD.def.key; cancelCmd();
      return again;`);
    eq(r, 'circle');
  });

  t('MULTIPLE brings the command straight back until Esc stops it', () => {
    const r = R(SETUP + `
      runInput('multiple'); runInput('circle');
      const first = CMD && CMD.def.key;
      cmdPoint([0,0]); cmdPoint([500,0]); endCmd();
      const second = CMD && CMD.def.key;
      cancelCmd();
      return {first, second, cleared: CLI.multiple, drawn: DOC.ents.size};`);
    eq(r.first, 'circle'); eq(r.second, 'circle', 'it must come back on its own');
    eq(r.cleared, null, 'Esc ends the repetition');
    eq(r.drawn, 1);
  });

  group('system variables are real, not decorative');

  t('OSMODE is a bit code the snap engine actually reads', () => {
    const r = R(SETUP + `
      runInput('osmode 39');
      const on = {v: getvar('OSMODE'), end: ST.osnapOn.end, mid: ST.osnapOn.mid,
                  cen: ST.osnapOn.cen, quad: ST.osnapOn.quad, int: ST.osnapOn.int,
                  osnap: ST.osnap};
      runInput('osmode 16384');
      return {on, suppressed: ST.osnap};`);
    eq(r.on.v, 39); eq(r.on.end, 1); eq(r.on.mid, 1); eq(r.on.cen, 1);
    eq(r.on.int, 1); eq(r.on.quad, 0);
    eq(r.on.osnap, true);
    eq(r.suppressed, false, 'bit 16384 suppresses every running snap');
  });

  t('LTSCALE stretches the dash pattern the renderer hands out', () => {
    const r = R(SETUP + `
      const base = dashFor('dashed').slice();
      runInput('ltscale 2');
      const scaled = dashFor('dashed').slice();
      DOC.ltScale = 1;
      return {base, scaled};`);
    eq(r.scaled[0], r.base[0] * 2); eq(r.scaled[1], r.base[1] * 2);
  });

  t('DIMSCALE resizes a dimension without changing what it measures', () => {
    const r = R(SETUP + `
      const a = dimStyle();
      runInput('dimscale 4');
      const b = dimStyle();
      DOC.dimScale = 1;
      return {txt: [a.txt, b.txt], arrow: [a.arrow, b.arrow]};`);
    close(r.txt[1], r.txt[0] * 4, 1e-9);
    close(r.arrow[1], r.arrow[0] * 4, 1e-9);
  });

  t('CELTYPE and CECOLOR reach the objects that get drawn next', () => {
    const r = R(SETUP + `
      runInput('celtype dashed'); runInput('cecolor #ff0000');
      const e = addEnt({t:'line', a:[0,0], b:[100,0]});
      DOC.celtype = null; DOC.cecolor = null;
      const f = addEnt({t:'line', a:[0,0], b:[100,0]});
      return {lt: e.lt, col: e.color, back: [f.lt, f.color]};`);
    eq(r.lt, 'dashed'); eq(r.col, '#ff0000');
    eq(r.back[0], null); eq(r.back[1], null, 'clearing it returns to ByLayer');
  });

  t('APERTURE, PICKBOX and CLAYER write through to live state', () => {
    const r = R(SETUP + `
      runInput('aperture 20'); runInput('pickbox 5');
      runInput('setvar'); runInput('clayer'); runInput('DIMENSIONS');
      const out = {ap: SNAP_R, pb: ST.pickBox, layer: DOC.cur};
      SNAP_R = 14; ST.pickBox = 8; DOC.cur = '0';
      return out;`);
    eq(r.ap, 20); eq(r.pb, 5); eq(r.layer, 'DIMENSIONS');
  });

  t('a read-only variable reports its value and refuses to be set', () => {
    const r = R(SETUP + `
      runInput('line');
      const active = getvar('CMDNAMES');
      cancelCmd();
      return {active, idle: getvar('CMDNAMES'), set: setvar('CMDNAMES', 'X')};`);
    eq(r.active, 'LINE'); eq(r.idle, ''); eq(r.set, false);
  });

  group('UNDO with marks and groups');

  t('UNDO Mark and Back rewind to the mark and no further', () => {
    const r = R(SETUP + `
      runInput('line 0,0 100,0'); endCmd();
      undoMark();
      runInput('line 0,0 200,0'); endCmd();
      runInput('line 0,0 300,0'); endCmd();
      const before = DOC.ents.size;
      undoBack();
      return {before, after: DOC.ents.size};`);
    eq(r.before, 3); eq(r.after, 1, 'everything after the mark goes, the mark itself stays');
  });

  t('a BEgin/End group undoes as one operation', () => {
    const r = R(SETUP + `
      runInput('line 0,0 100,0'); endCmd();
      undoGroupBegin();
      runInput('line 0,0 200,0'); endCmd();
      runInput('line 0,0 300,0'); endCmd();
      undoGroupEnd();
      const before = DOC.ents.size;
      undoStep();
      return {before, after: DOC.ents.size};`);
    eq(r.before, 3);
    eq(r.after, 1, 'one U must take the whole group, not one line of it');
  });

  group('AutoComplete');

  t('typing li offers LINE, LIMITS and LINETYPE, prefix matches first', () => {
    const r = R(SETUP + `return acSuggest('li', 10).map(x => x.name);`);
    ok(r.indexOf('LINE') >= 0, r.join(','));
    ok(r.indexOf('LIMITS') >= 0, r.join(','));
    ok(r.indexOf('LINETYPE') >= 0, r.join(','));
    ok(r.every(n => n.toLowerCase().startsWith('li')), 'prefix matches only, by default');
  });

  t('a command used recently is offered before one that was not', () => {
    const r = R(SETUP + `
      CLI.mru.length = 0;
      const cold = acSuggest('li', 10).map(x => x.name);
      runInput('list'); cancelCmd();
      const warm = acSuggest('li', 10).map(x => x.name);
      return {cold, warm};`);
    eq(r.warm[0], 'LIST', 'the last one used comes to the top: ' + r.warm.join(','));
    ok(r.cold[0] !== 'LIST', 'and it was not there before');
  });

  t('an alias offers the command it expands to, and names itself', () => {
    const r = R(SETUP + `
      const hit = acSuggest('rec', 10).find(x => x.name === 'RECTANG');
      return hit && {name: hit.name, alias: hit.alias};`);
    ok(r, 'REC must offer RECTANG');
    eq(r.alias, 'REC');
  });

  t('unknown words get AutoCAD’s own message', () => {
    const r = R(SETUP + `
      CLI.lines.length = 0;
      runInput('nosuchthing');
      return CLI.lines.map(l => l.t).join(' | ');`);
    ok(/Unknown command "NOSUCHTHING"\.  Press F1 for help\./.test(r), r);
  });
};
