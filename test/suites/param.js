'use strict';
/* ============================================================
   10 — dimensions that drive the drawing

   Every dimension here reports. A driving dimension is the
   other way round: type 5000 into it and the wall becomes 5000
   long. It is the difference between a drawing you measure and
   a drawing you specify, and it is the one thing a parametric
   modeller does that a drafting program does not.

   The mechanism is a small solver. Each driving dimension is a
   residual — measured minus wanted — and every point that can
   move is also pulled, gently, towards where it already is. The
   gentle pull is what makes the answer unique and predictable:
   without it, "make this 5000" has infinitely many solutions
   and a solver will happily pick a startling one.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
  const wallOf = (a, b) => addEnt({t:'wall', a, b, wt:'gen100', layer:'A-WALL'});
  /* a dimension attached to two ends of things, the way DIM makes one */
  const dimOn = (h1, at1, h2, at2, k) => addEnt({
    t:'dim', k: k || 'aligned',
    p1: refPointOf(h1, at1), p2: refPointOf(h2, at2),
    r1: { id: h1.id, at: at1 }, r2: { id: h2.id, at: at2 },
    off: 900, layer:'DIMENSIONS' });
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('one dimension, one wall');

  t('typing a length into a driving dimension makes the wall that length', () => {
    const r = R(`${SETUP}
      begin();
      const w = wallOf([0,0], [4000,0]);
      const d = dimOn(w, 'a', w, 'b');
      commit('w');
      const ok1 = dimDrive(d, true);
      const res = dimSetValue(d, 5000);
      return { ok1, ok2: res.ok, len: Math.round(wallLen(w)),
               a: w.a.map(Math.round), b: w.b.map(Math.round) };`);
    eq(r.ok1, true, 'it can be made driving');
    eq(r.ok2, true, 'and the solve succeeds');
    eq(r.len, 5000, 'the wall is now the length that was typed');
    eq(r.a.join(','), '0,0', 'the first end stays where it is');
    eq(r.b.join(','), '5000,0', 'and the drawing grows away from it');
  });

  t('shortening works the same way as lengthening', () => {
    const r = R(`${SETUP}
      begin();
      const w = wallOf([0,0], [4000,0]);
      const d = dimOn(w, 'a', w, 'b');
      commit('w');
      dimDrive(d, true); dimSetValue(d, 2500);
      return { len: Math.round(wallLen(w)) };`);
    eq(r.len, 2500);
  });

  t('a horizontal dimension constrains the horizontal distance and nothing else', () => {
    const r = R(`${SETUP}
      begin();
      const w = wallOf([0,0], [4000,1000]);
      const d = dimOn(w, 'a', w, 'b', 'horizontal');
      commit('w');
      dimDrive(d, true); dimSetValue(d, 6000);
      return { dx: Math.round(w.b[0] - w.a[0]), dy: Math.round(w.b[1] - w.a[1]) };`);
    eq(r.dx, 6000, 'the horizontal distance is what was asked for');
    eq(r.dy, 1000, 'and the vertical one is left alone');
  });

  group('more than one at a time');

  t('two dimensions on a rectangle both come true', () => {
    const r = R(`${SETUP}
      begin();
      const bottom = wallOf([0,0], [4000,0]);
      const left = wallOf([0,0], [0,3000]);
      const dw = dimOn(bottom, 'a', bottom, 'b', 'horizontal');
      const dh = dimOn(left, 'a', left, 'b', 'vertical');
      commit('w');
      dimDrive(dw, true); dimDrive(dh, true);
      dimSetValue(dw, 6000);
      const res = dimSetValue(dh, 4500);
      return { ok: res.ok, w: Math.round(bottom.b[0] - bottom.a[0]),
               h: Math.round(left.b[1] - left.a[1]) };`);
    eq(r.ok, true);
    eq(r.w, 6000, 'the width');
    eq(r.h, 4500, 'and the height, at the same time');
  });

  t('a chain of two dimensions holds at both ends', () => {
    const r = R(`${SETUP}
      begin();
      const a = wallOf([0,0], [3000,0]);
      const b = wallOf([3000,0], [5000,0]);
      const d1 = dimOn(a, 'a', a, 'b', 'horizontal');
      const d2 = dimOn(b, 'a', b, 'b', 'horizontal');
      commit('w');
      dimDrive(d1, true); dimDrive(d2, true);
      dimSetValue(d1, 4000);
      const res = dimSetValue(d2, 2500);
      return { ok: res.ok,
               one: Math.round(a.b[0] - a.a[0]),
               two: Math.round(b.b[0] - b.a[0]) };`);
    eq(r.ok, true);
    eq(r.one, 4000, 'the first');
    eq(r.two, 2500, 'and the second');
  });

  t('two dimensions that contradict each other are refused, not fudged', () => {
    const r = R(`${SETUP}
      begin();
      const w = wallOf([0,0], [4000,0]);
      const d1 = dimOn(w, 'a', w, 'b', 'horizontal');
      const d2 = dimOn(w, 'a', w, 'b', 'horizontal');
      commit('w');
      dimDrive(d1, true); dimDrive(d2, true);
      dimSetValue(d1, 5000);
      const before = Math.round(wallLen(w));
      const res = dimSetValue(d2, 9000);
      return { ok: res.ok, why: res.why, before, after: Math.round(wallLen(w)) };`);
    eq(r.ok, false, 'it says no');
    ok(/cannot|conflict|both/i.test(r.why || ''), 'and says why: ' + r.why);
    eq(r.after, r.before, 'and the drawing is left exactly as it was');
  });

  group('behaving like the rest of the program');

  t('a solve is one undo step', () => {
    const r = R(`${SETUP}
      begin();
      const w = wallOf([0,0], [4000,0]);
      const d = dimOn(w, 'a', w, 'b');
      commit('w');
      dimDrive(d, true); dimSetValue(d, 5000);
      const after = Math.round(wallLen(w));
      undo();
      const w2 = [...DOC.ents.values()].find(e => e.t === 'wall');
      return { after, back: Math.round(wallLen(w2)) };`);
    eq(r.after, 5000);
    eq(r.back, 4000, 'one undo puts the wall back');
  });

  t('openings stay inside the wall they are in', () => {
    const r = R(`${SETUP}
      begin();
      const w = wallOf([0,0], [4000,0]);
      const dr = addEnt({t:'door', host:w.id, pos:3500, dt:'sgl900', layer:'A-DOOR'});
      const d = dimOn(w, 'a', w, 'b');
      commit('w');
      dimDrive(d, true); dimSetValue(d, 2000);
      return { len: Math.round(wallLen(w)), pos: Math.round(dr.pos),
               inside: dr.pos <= wallLen(w) };`);
    eq(r.len, 2000, 'the wall is shorter than the door was along it');
    eq(r.inside, true, 'and the door has been pulled back inside: ' + r.pos);
  });

  t('a dimension attached to nothing cannot drive anything', () => {
    const r = R(`${SETUP}
      begin();
      const d = addEnt({t:'dim', k:'aligned', p1:[0,0], p2:[4000,0], off:900, layer:'DIMENSIONS'});
      commit('d');
      const ok1 = dimDrive(d, true);
      return { ok1, drive: !!d.drive };`);
    eq(r.ok1, false, 'there is nothing on the other end of it to move');
    eq(r.drive, false, 'so it is not marked as driving');
  });

  t('driving is a property of the dimension, and it is saved', () => {
    const r = R(`${SETUP}
      begin();
      const w = wallOf([0,0], [4000,0]);
      const d = dimOn(w, 'a', w, 'b');
      commit('w');
      dimDrive(d, true);
      loadNative(saveNative());
      const back = [...DOC.ents.values()].find(e => e.t === 'dim');
      return { drive: !!(back && back.drive) };`);
    eq(r.drive, true);
  });

  t('a driving dimension is drawn so you can tell it is one', () => {
    const r = R(`${SETUP}
      begin();
      const w = wallOf([0,0], [4000,0]);
      const d = dimOn(w, 'a', w, 'b');
      commit('w');
      const plain = shapes(d).length;
      dimDrive(d, true);
      const driven = shapes(d).filter(x => x.text).map(x => x.text).join(' ');
      return { plain, driven };`);
    ok(/4000/.test(r.driven), 'it still says the measurement: ' + r.driven);
    ok(r.driven !== '4000', 'and is marked as driving it: ' + r.driven);
  });

  group('the command');

  t('DIMDRIVE turns the selection into driving dimensions', () => {
    const r = R(`${SETUP}
      begin();
      const w = wallOf([0,0], [4000,0]);
      const d = dimOn(w, 'a', w, 'b');
      commit('w');
      SEL.clear(); SEL.add(d.id);
      cancelCmd(); startCmd('dimdrive'); endCmd(true);
      return { drive: !!d.drive };`);
    eq(r.drive, true);
  });

  t('DIMVALUE types a new size straight into the selected dimension', () => {
    const r = R(`${SETUP}
      begin();
      const w = wallOf([0,0], [4000,0]);
      const d = dimOn(w, 'a', w, 'b');
      commit('w');
      dimDrive(d, true);
      SEL.clear(); SEL.add(d.id);
      cancelCmd(); startCmd('dimvalue'); cmdText('7500');
      return { len: Math.round(wallLen(w)) };`);
    eq(r.len, 7500);
  });
  t('the panel is where a size is typed, and it says which way round it works', () => {
    const r = R(`${SETUP}
      begin();
      const w = wallOf([0,0], [4000,0]);
      const d = dimOn(w, 'a', w, 'b');
      commit('w');
      dimDrive(d, true);
      SEL.clear(); SEL.add(d.id);
      buildProps();
      const rows = (document.getElementById('props').children || []);
      const text = rows.map(x => (x.textContent || '') + ' ' +
        (x.children || []).map(k => k.textContent || '').join(' ')).join(' | ');
      /* the field that sets the size, not the one that fakes the text */
      const size = rows.map(x => (x.children || []).find(k => k.id === 'dimdrv')).find(Boolean);
      size.value = '5500'; size.onchange();
      return { text, len: Math.round(wallLen(w)) };`);
    ok(/driv/i.test(r.text), 'the panel says it drives: ' + r.text.slice(0, 200));
    eq(r.len, 5500, 'and typing a size into it resizes the wall');
  });
};
