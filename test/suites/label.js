'use strict';
/* ============================================================
   9.4 — labels that read the object they point at

   A note saying "CAVITY WALL 300" is a claim someone typed
   once. Change the wall to a 215 solid and the note goes on
   saying 300 until somebody notices, which on a real drawing
   set is at the worst possible moment.

   The schedule engine already names every property an object
   has. A label can pull from exactly the same vocabulary, so
   "300" stops being typed and starts being read — and a label
   pointing at nothing says so rather than keeping the last
   answer it had.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
  const wallOf = (wt) => { begin();
    const w = addEnt({t:'wall', a:[0,0], b:[6000,0], wt: wt || 'cav300', layer:'A-WALL'});
    commit('w'); return w; };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('pulling a property by name');

  t('any property a schedule can put in a column, a label can print', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300');
      return {
        type: resolveFields('%<prop:' + w.id + '.wallType>%'),
        thk:  resolveFields('%<prop:' + w.id + '.thickness>%'),
        len:  resolveFields('%<prop:' + w.id + '.length>%'),
        mat:  resolveFields('%<prop:' + w.id + '.material>%'),
        u:    resolveFields('%<prop:' + w.id + '.uvalue>%') };`);
    eq(r.type, 'Cavity 300', 'the wall type');
    eq(r.thk, '300', 'its thickness');
    eq(r.len, '6000', 'its length');
    ok(/brick|compound/i.test(r.mat), 'what it is made of: ' + r.mat);
    ok(parseFloat(r.u) > 0, 'and its U-value: ' + r.u);
  });

  t('a property nobody has defined prints the same #### as any other empty field', () => {
    const r = R(`${SETUP}
      const w = wallOf();
      return { bad: resolveFields('%<prop:' + w.id + '.unicorn>%'),
               gone: resolveFields('%<prop:9999.length>%') };`);
    eq(r.bad, '####', 'a made-up property');
    eq(r.gone, '####', 'and an object that is not there');
  });

  t('a label can mix what it reads with what someone wrote', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300');
      return { s: resolveFields('WALL TYPE %<prop:' + w.id + '.wallType>% — %<prop:' + w.id + '.thickness>% THK') };`);
    eq(r.s, 'WALL TYPE Cavity 300 — 300 THK');
  });

  group('a label attached to what it points at');

  t('LABEL places a leader that reads the object under the arrow', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300');
      cancelCmd(); startCmd('label');
      cmdPoint([3000, 0]);            /* what to label */
      cmdPoint([3000, 4000]);         /* where the note goes */
      const lab = [...DOC.ents.values()].find(e => e.t === 'leader');
      return { made: !!lab, ref: lab && lab.ref, wall: w.id,
               text: lab && lab.s,
               shown: lab && shapes(lab).filter(x => x.text).map(x => x.text).join(' ') };`);
    eq(r.made, true, 'a leader is placed');
    eq(r.ref, r.wall, 'attached to the wall it points at');
    ok(/%</.test(r.text), 'and it stores the field, not the answer: ' + r.text);
    ok(/Cavity 300/.test(r.shown), 'while showing the answer: ' + r.shown);
  });

  t('an attached label needs no id — it reads whatever it is attached to', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300');
      begin();
      const lab = addEnt({t:'leader', pts:[[3000,0],[3000,3000]], ref:w.id,
                          s:'%<prop:.wallType>%', layer:'TEXT'});
      commit('l');
      return { shown: shapes(lab).filter(x => x.text).map(x => x.text).join(' ') };`);
    ok(/Cavity 300/.test(r.shown), 'it reads its own object: ' + r.shown);
  });

  /* The whole point: the note cannot be left saying the old thing. */
  t('changing the wall changes the label, with nobody retyping anything', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300');
      begin();
      const lab = addEnt({t:'leader', pts:[[3000,0],[3000,3000]], ref:w.id,
                          s:'%<prop:.wallType>% / %<prop:.thickness>%', layer:'TEXT'});
      commit('l');
      const before = shapes(lab).filter(x => x.text).map(x => x.text).join(' ');
      begin(); mut(w); w.wt = 'brk230'; w.th = null; commit('t');
      const after = shapes(lab).filter(x => x.text).map(x => x.text).join(' ');
      return { before, after };`);
    ok(/Cavity 300/.test(r.before) && /300/.test(r.before), 'before: ' + r.before);
    ok(/Brick 230/.test(r.after) && /230/.test(r.after), 'after: ' + r.after);
  });

  t('a label whose object has been erased says so rather than keeping the answer', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300');
      begin();
      const lab = addEnt({t:'leader', pts:[[3000,0],[3000,3000]], ref:w.id,
                          s:'%<prop:.wallType>%', layer:'TEXT'});
      commit('l');
      begin(); delEnt(w.id); commit('d');
      let threw = null; let shown = '';
      try { shown = shapes(lab).filter(x => x.text).map(x => x.text).join(' '); }
      catch (e) { threw = e.message; }
      return { threw, shown };`);
    eq(r.threw, null, 'no throw');
    eq(r.shown.trim(), '####', 'and no stale claim: ' + r.shown);
  });

  t('the attachment survives the project file', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300');
      begin();
      addEnt({t:'leader', pts:[[3000,0],[3000,3000]], ref:w.id,
              s:'%<prop:.wallType>%', layer:'TEXT'});
      commit('l');
      loadNative(saveNative());
      const lab = [...DOC.ents.values()].find(e => e.t === 'leader');
      return { ref: lab && lab.ref,
               shown: lab && shapes(lab).filter(x => x.text).map(x => x.text).join(' ') };`);
    ok(r.ref > 0, 'the reference is saved');
    ok(/Cavity 300/.test(r.shown), 'and still reads: ' + r.shown);
  });

  group('leaving the building');

  t('a plot carries the answer, not the field code', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300');
      begin();
      addEnt({t:'leader', pts:[[3000,0],[3000,3000]], ref:w.id,
              s:'%<prop:.wallType>%', layer:'TEXT'});
      commit('l');
      const sh = newSheet('A-101', 'A3', true);
      sh.viewports.push(newViewport(sh, [3000,1500], 1/100));
      DOC.sheets.push(sh); DOC.curSheet = sh.id;
      const svg = sheetSVG(sh);
      return { answer: svg.indexOf('Cavity 300') >= 0, code: /%&lt;|%</.test(svg) };`);
    eq(r.answer, true, 'the paper says what it means');
    eq(r.code, false, 'and not how it worked it out');
  });

  t('a DXF carries the answer too, because the receiving program has no fields', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300');
      begin();
      addEnt({t:'leader', pts:[[3000,0],[3000,3000]], ref:w.id,
              s:'%<prop:.wallType>%', layer:'TEXT'});
      commit('l');
      const dxf = exportDXF();
      return { answer: dxf.indexOf('Cavity 300') >= 0, code: dxf.indexOf('%<prop') >= 0 };`);
    eq(r.answer, true, 'the value is in the file');
    eq(r.code, false, 'and the field code is not');
  });
};
