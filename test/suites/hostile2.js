'use strict';
/* ============================================================
   A project file is hostile input

   An outside audit found three ways a .ocad file could hurt the
   program that opened it. All three were real, and one of them
   was wider than reported:

     · two entities sharing an id loaded "successfully" with one
       of them silently gone
     · a units value nothing recognises was accepted, and then
       every measurement in the drawing was NaN
     · a units value that is HTML was interpolated into a dialog
       unescaped — and so are a wall type's name, an entity's
       layer and an entity's name, which the audit did not reach

   The rule this file asserts: a file the program did not write
   is data, not instructions. It is checked before it replaces
   the drawing on screen, and it is escaped everywhere it is
   shown.
   ============================================================ */
const SETUP = `
  resetDoc(); ensureLayer('A-WALL');
  begin();
  addEnt({t:'line', a:[0,0], b:[1000,0], layer:'A-WALL'});
  addEnt({t:'line', a:[0,500], b:[1000,500], layer:'A-WALL'});
  commit('l');
  const good = saveNative();
  const doc = () => JSON.parse(good);
  const entsOf = (d) => d.ents || d.entities || [];
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('a file that contradicts itself');

  /* Two objects cannot both be id 7. The loader used to hand both to addEnt,
     which puts them in a Map — so the second quietly replaced the first and
     the file reported that it had opened. */
  t('two entities with one id is refused, not half-loaded', () => {
    const r = R(`${SETUP}
      const d = doc();
      const es = entsOf(d);
      es[1].id = es[0].id;
      const took = loadNative(JSON.stringify(d));
      return { took, still: DOC.ents.size };`);
    eq(r.took, false, 'the file is refused');
    eq(r.still, 2, 'and the drawing that was open is still open');
  });

  t('and it says which id, because that is the repairable fact', () => {
    const r = R(`${SETUP}
      CLI.lines.length = 0;
      const d = doc();
      const es = entsOf(d);
      es[1].id = es[0].id;
      loadNative(JSON.stringify(d));
      return { said: CLI.lines.map(l => l.t).join(' | ') };`);
    ok(/twice|duplicate|already/i.test(r.said), 'it names the problem: ' + r.said);
  });

  t('a good file still opens, with every object in it', () => {
    const r = R(`${SETUP}
      const took = loadNative(good);
      return { took, n: DOC.ents.size };`);
    ok(r.took !== false, 'it opens');
    eq(r.n, 2, 'with both objects');
  });

  group('units the program does not know');

  t('a units value nothing recognises does not become the drawing units', () => {
    const r = R(`${SETUP}
      const d = doc(); d.units = 'bogus';
      loadNative(JSON.stringify(d));
      return { units: DOC.units, fmt: fmt(100), parse: parseLen('100') };`);
    ok(['mm', 'cm', 'm', 'in', 'ft'].indexOf(r.units) >= 0,
      'it falls back to a real unit, got ' + r.units);
    ok(r.fmt.indexOf('NaN') < 0, 'and measurement still works: ' + r.fmt);
    ok(isFinite(r.parse), 'both ways: ' + r.parse);
  });

  t('the units a file legitimately carries are kept', () => {
    const r = R(`${SETUP}
      const out = [];
      for (const u of ['mm', 'cm', 'm', 'in', 'ft']) {
        const d = doc(); d.units = u;
        loadNative(JSON.stringify(d));
        out.push(DOC.units);
      }
      return { out };`);
    eq(r.out.join(','), 'mm,cm,m,in,ft', 'each one survives');
  });

  group('a file that is trying to run something');

  /* The audit found DOC.units. The same sweep finds three more: a wall type
     name, an entity's layer and an entity's name all reach an HTML string. */
  t('HTML in the units never reaches a dialog as HTML', () => {
    const r = R(`${SETUP}
      const d = doc();
      d.units = '"><img src=x onerror=BAD>';
      loadNative(JSON.stringify(d));
      openTypeManager();
      const html = (document.getElementById('card') || {}).innerHTML || '';
      return { html, raw: html.indexOf('<img src=x onerror=BAD>') >= 0 };`);
    eq(r.raw, false, 'no live tag in the dialog');
  });

  t('HTML in a component name is shown, not run', () => {
    const r = R(`${SETUP}
      const d = doc();
      d.wallTypes = [{ id: 'x1', name: '<img src=x onerror=BAD>', t: 100 }];
      loadNative(JSON.stringify(d));
      openTypeManager();
      const html = (document.getElementById('card') || {}).innerHTML || '';
      return { raw: html.indexOf('<img src=x onerror=BAD>') >= 0,
               shown: html.indexOf('&lt;img') >= 0 || html.indexOf('img src=x') >= 0 };`);
    eq(r.raw, false, 'the tag is not live');
  });

  t('HTML in a layer name does not reach the audit dialog as HTML', () => {
    const r = R(`${SETUP}
      const d = doc();
      const es = entsOf(d);
      es[0].layer = '<img src=x onerror=BAD>';
      loadNative(JSON.stringify(d));
      runAudit();
      const html = (document.getElementById('card') || {}).innerHTML || '';
      return { raw: html.indexOf('<img src=x onerror=BAD>') >= 0, len: html.length };`);
    eq(r.raw, false, 'the report about a bad file is not itself a way in');
  });

  t('every string a file carries is a string, whatever was in the file', () => {
    const r = R(`${SETUP}
      const d = doc();
      d.units = { toString() { return 'mm'; } };
      d.name = { evil: true };
      const es = entsOf(d);
      es[0].layer = ['not', 'a', 'string'];
      let threw = null;
      try { loadNative(JSON.stringify(d)); } catch (e) { threw = e.message; }
      const e0 = [...DOC.ents.values()][0];
      return { threw, units: typeof DOC.units,
               layer: e0 ? typeof e0.layer : 'none' };`);
    eq(r.threw, null, 'nothing throws');
    eq(r.units, 'string', 'units is a string');
    eq(r.layer, 'string', 'and so is a layer name');
  });
};
