'use strict';
/* ============================================================
   B4 — fields, and stacked fractions

   A field is text that reads the drawing instead of being typed
   into it. The title block already works this way for scale, on
   the principle that a title block able to disagree with the
   drawing it labels is a liability. Everything else typed onto a
   drawing — the sheet name, the date, a room's area — was a
   number somebody keyed in and nobody updated.

   A stacked fraction is how a dimension in feet and inches, a
   tolerance or a scale is written. Flat "1/2" is a different mark
   on the page from a stacked one, and imperial drawings are full
   of them.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; DOC.textH = 250;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
  const say = (e) => shapes(e, 32).filter(s => s.text != null).map(s => s.text).join(' ');
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('fields read the drawing');

  t('a drawing name field says what the drawing is called', () => {
    const r = R(`${SETUP}
      DOC.name = 'Ground floor plan';
      begin();
      const tx = addEnt({t:'text', p:[0,0], s:'%<drawing>%', h:250, rot:0, anchor:'l', layer:'0'});
      commit('t');
      const before = say(tx);
      DOC.name = 'First floor plan';
      return { before, after: say(tx), stored: tx.s };`);
    eq(r.before, 'Ground floor plan', 'it reads the name');
    eq(r.after, 'First floor plan', 'and follows it when it changes');
    eq(r.stored, '%<drawing>%', 'while the text itself still holds the field');
  });

  t('a scale field agrees with the scale in force', () => {
    const r = R(`${SETUP}
      DOC.annoScale = 1 / 100;
      begin();
      const tx = addEnt({t:'text', p:[0,0], s:'SCALE %<scale>%', h:250, rot:0, anchor:'l', layer:'0'});
      commit('t');
      const at100 = say(tx);
      annoPush(1 / 50); const at50 = say(tx); annoPop();
      return { at100, at50 };`);
    eq(r.at100, 'SCALE 1:100', 'in model space it is the drawing scale');
    eq(r.at50, 'SCALE 1:50', 'and through a viewport it is the scale of that viewport');
  });

  t('an area field measures the object it names, and follows it', () => {
    const r = R(`${SETUP}
      begin();
      const rm = addEnt({t:'room', pts:[[0,0],[4000,0],[4000,3000],[0,3000]], layer:'A-AREA'});
      const tx = addEnt({t:'text', p:[0,-1000], s:'%<area:' + rm.id + '>%', h:250,
                         rot:0, anchor:'l', layer:'0'});
      commit('t');
      const before = say(tx);
      begin(); mut(rm); rm.pts = [[0,0],[8000,0],[8000,3000],[0,3000]]; commit('bigger');
      return { before, after: say(tx) };`);
    ok(/12/.test(r.before), 'a 4x3 room is 12 square metres: ' + r.before);
    ok(/24/.test(r.after), 'and 24 once it is doubled: ' + r.after);
  });

  t('a count field counts what is actually there', () => {
    const r = R(`${SETUP}
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[12000,0], wt:'cav300', layer:'A-WALL'});
      addEnt({t:'door', host:w.id, pos:2000, dt:'sgl900', layer:'A-DOOR'});
      addEnt({t:'door', host:w.id, pos:6000, dt:'sgl900', layer:'A-DOOR'});
      const tx = addEnt({t:'text', p:[0,-1000], s:'%<count:door>% doors', h:250,
                         rot:0, anchor:'l', layer:'0'});
      commit('t');
      const two = say(tx);
      begin(); addEnt({t:'door', host:w.id, pos:9000, dt:'sgl900', layer:'A-DOOR'}); commit('third');
      return { two, three: say(tx) };`);
    eq(r.two, '2 doors');
    eq(r.three, '3 doors', 'it counts again rather than remembering');
  });

  /* AutoCAD shows #### for a field it cannot work out. A field that silently
     resolves to nothing leaves a gap nobody can explain. */
  t('a field nobody can resolve says so rather than vanishing', () => {
    const r = R(`${SETUP}
      begin();
      const a = addEnt({t:'text', p:[0,0], s:'%<nonsense>%', h:250, rot:0, anchor:'l', layer:'0'});
      const b = addEnt({t:'text', p:[0,900], s:'%<area:99999>%', h:250, rot:0, anchor:'l', layer:'0'});
      commit('t');
      return { unknown: say(a), missing: say(b) };`);
    eq(r.unknown, '####', 'an unknown field name');
    eq(r.missing, '####', 'and one pointing at an object that is gone');
  });

  t('text with no field in it is left completely alone', () => {
    const r = R(`${SETUP}
      begin();
      const tx = addEnt({t:'text', p:[0,0], s:'100% COTTON < > %', h:250,
                         rot:0, anchor:'l', layer:'0'});
      commit('t');
      return { out: say(tx) };`);
    eq(r.out, '100% COTTON < > %', 'percent signs are not fields');
  });

  t('fields work in a paragraph too', () => {
    const r = R(`${SETUP}
      DOC.name = 'Site plan';
      begin();
      const tx = addEnt({t:'mtext', p:[0,0], s:'DRAWING: %<drawing>%', h:250, w:20000,
                         rot:0, anchor:'l', layer:'0'});
      commit('t');
      return { out: say(tx) };`);
    ok(/Site plan/.test(r.out), 'got ' + r.out);
  });

  /* A field's value depends on other objects, so it cannot be cached against
     its own id the way a fixed string can. */
  t('a field is not served stale from the shape cache', () => {
    const r = R(`${SETUP}
      begin();
      const rm = addEnt({t:'room', pts:[[0,0],[4000,0],[4000,3000],[0,3000]], layer:'A-AREA'});
      const tx = addEnt({t:'text', p:[0,-1000], s:'%<area:' + rm.id + '>%', h:250,
                         rot:0, anchor:'l', layer:'0'});
      commit('t');
      shapeCacheClear();
      const read = () => entShapes(tx).filter(s => s.text != null).map(s => s.text).join('');
      const before = read();
      begin(); mut(rm); rm.pts = [[0,0],[8000,0],[8000,3000],[0,3000]]; commit('bigger');
      return { before, after: read() };`);
    ok(/12/.test(r.before), 'first read: ' + r.before);
    ok(/24/.test(r.after), 'and the cache did not hand back the old one: ' + r.after);
  });

  group('stacked fractions');

  t('a stacked fraction is drawn as two numbers and a bar', () => {
    const r = R(`${SETUP}
      begin();
      const tx = addEnt({t:'mtext', p:[0,0], s:'1 \\\\S1/2; INCH', h:250, w:20000,
                         rot:0, anchor:'l', layer:'0'});
      commit('t');
      const sh = shapes(tx, 32);
      const texts = sh.filter(s => s.text != null).map(s => s.text);
      const bars = sh.filter(s => s.pts && s.pts.length === 2);
      return { texts, bars: bars.length,
               heights: sh.filter(s => s.text != null).map(s => Math.round(s.h)) };`);
    ok(r.texts.includes('1'), 'the numerator is its own piece: ' + r.texts.join(' | '));
    ok(r.texts.includes('2'), 'and the denominator');
    ok(r.bars >= 1, 'with a bar between them, got ' + r.bars);
    ok(r.heights.some(h => h < 250), 'and both set smaller than the line: ' + r.heights.join(', '));
  });

  t('the numerator sits above the denominator', () => {
    const r = R(`${SETUP}
      begin();
      const tx = addEnt({t:'mtext', p:[0,0], s:'\\\\S3/4;', h:250, w:20000,
                         rot:0, anchor:'l', layer:'0'});
      commit('t');
      const sh = shapes(tx, 32).filter(s => s.text != null);
      const num = sh.find(s => s.text === '3'), den = sh.find(s => s.text === '4');
      return { num: num && num.p[1], den: den && den.p[1] };`);
    ok(r.num > r.den, 'the 3 is above the 4: ' + r.num + ' vs ' + r.den);
  });

  /* A tolerance stacks without a bar — that is what the caret means. */
  t('a caret stacks the two without drawing a bar', () => {
    const r = R(`${SETUP}
      begin();
      const bar = addEnt({t:'mtext', p:[0,0], s:'\\\\S1/2;', h:250, w:20000, rot:0, anchor:'l', layer:'0'});
      const tol = addEnt({t:'mtext', p:[0,3000], s:'\\\\S+0.5^-0.2;', h:250, w:20000, rot:0, anchor:'l', layer:'0'});
      commit('t');
      const barsIn = (e) => shapes(e, 32).filter(s => s.pts && s.pts.length === 2).length;
      const textsIn = (e) => shapes(e, 32).filter(s => s.text != null).map(s => s.text);
      return { withBar: barsIn(bar), noBar: barsIn(tol), tol: textsIn(tol) };`);
    ok(r.withBar >= 1, 'a slash draws a bar');
    eq(r.noBar, 0, 'a caret does not');
    ok(r.tol.includes('+0.5') && r.tol.includes('-0.2'),
      'both halves are still there: ' + r.tol.join(' | '));
  });

  t('text either side of the fraction stays on the line', () => {
    const r = R(`${SETUP}
      begin();
      const tx = addEnt({t:'mtext', p:[0,0], s:'A \\\\S1/2; B', h:250, w:20000,
                         rot:0, anchor:'l', layer:'0'});
      commit('t');
      const sh = shapes(tx, 32).filter(s => s.text != null);
      const a = sh.find(s => s.text.indexOf('A') >= 0);
      const b = sh.find(s => s.text.indexOf('B') >= 0);
      return { a: a && [Math.round(a.p[0]), Math.round(a.p[1])],
               b: b && [Math.round(b.p[0]), Math.round(b.p[1])],
               texts: sh.map(s => s.text) };`);
    ok(r.a && r.b, 'both survive: ' + r.texts.join(' | '));
    eq(r.a[1], r.b[1], 'and sit on the same baseline');
    ok(r.b[0] > r.a[0], 'with B after A, not on top of it');
  });

  t('an unstacked slash is still just a slash', () => {
    const r = R(`${SETUP}
      begin();
      const tx = addEnt({t:'mtext', p:[0,0], s:'AC/DC 1/2', h:250, w:20000,
                         rot:0, anchor:'l', layer:'0'});
      commit('t');
      const sh = shapes(tx, 32);
      return { texts: sh.filter(s => s.text != null).map(s => s.text),
               bars: sh.filter(s => s.pts && s.pts.length === 2).length };`);
    eq(r.bars, 0, 'nothing was stacked without being asked');
    eq(r.texts.join(''), 'AC/DC 1/2', 'and the text came through as typed');
  });
};
