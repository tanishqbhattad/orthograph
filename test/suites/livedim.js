'use strict';
/* ============================================================
   Live dimensions — 05b

   The numbers that PLACE what is selected, rather than a report
   of where it ended up. Two things have to hold or they are
   decoration:

     · the number must be the one a draughtsman would measure —
       face to face between walls, not centreline to centreline,
       because a wall is built to its faces
     · typing into it must DRIVE the geometry, undoably, and the
       thing that moves must be the thing that was picked

   And they are not entities. Nothing is added to the drawing,
   nothing is saved, nothing is plotted.
   ============================================================ */
const SETUP = `
  resetDoc(); ensureLayer('A-WALL');
  DOC.gridStep = 100; DOC.snapStep = 100; DOC.textH = 200;
  V.w = 1200; V.h = 800; V.z = 0.1; V.px = 100; V.py = 700; V.rot = 0;
  ST.liveDim = true;
  SEL.clear(); endCmd(true);
`;
/* two walls facing each other across a room, 230 thick, centres 4100 apart:
   the gap between the faces they show each other is 4100 - 115 - 115 = 3870 */
const ROOM = `
  begin();
  const left  = addEnt({t:'wall', a:[0,0],    b:[0,4000],    wt:'brk230', layer:'A-WALL'});
  const right = addEnt({t:'wall', a:[4100,0], b:[4100,4000], wt:'brk230', layer:'A-WALL'});
  commit('room');
`;
const of = (ds, k) => ds.filter(d => d.k === k);

module.exports = ({ group, t, ok, eq, close, R }) => {

  group('what a selected wall says about itself');

  t('the gap to the wall opposite is measured face to face, not centre to centre', () => {
    const r = R(SETUP + ROOM + `
      SEL.clear(); SEL.add(right.id);
      const ds = liveDims();
      return { kinds: ds.map(d => d.k).join(','),
               gaps: ds.filter(d => d.k === 'gap').map(d => Math.round(d.value)),
               len: (ds.find(d => d.k === 'len') || {}).value };`);
    eq(r.gaps.join(','), '3870', 'a 4100 centre spacing on 230 walls: ' + r.gaps.join(','));
    eq(r.len, 4000, 'and the wall publishes its own run too');
  });

  t('a wall with nothing parallel to it still says how long it is', () => {
    const r = R(SETUP + `
      begin();
      const only = addEnt({t:'wall', a:[0,0], b:[3000,0], wt:'gen100', layer:'A-WALL'});
      commit('one');
      SEL.clear(); SEL.add(only.id);
      const ds = liveDims();
      return { kinds: ds.map(d => d.k).join(','), n: ds.length,
               len: (ds.find(d => d.k === 'len') || {}).value };`);
    eq(r.kinds, 'len', 'nothing to measure against, so nothing is invented');
    eq(r.len, 3000);
  });

  /* Parallel is not the same as facing. Two walls on the same line, a hundred
     metres apart end to end, are parallel and have nothing to say to one
     another. */
  t('a wall that does not face this one is not measured to', () => {
    const r = R(SETUP + `
      begin();
      const a = addEnt({t:'wall', a:[0,0], b:[3000,0], wt:'gen100', layer:'A-WALL'});
      const b = addEnt({t:'wall', a:[9000,400], b:[12000,400], wt:'gen100', layer:'A-WALL'});
      commit('two');
      SEL.clear(); SEL.add(a.id);
      return { kinds: liveDims().map(d => d.k).join(',') };`);
    eq(r.kinds, 'len', 'they overlap in neither direction: ' + r.kinds);
  });

  group('typing into one moves the drawing');

  t('a new gap moves the wall that was picked, and lands exactly on the number', () => {
    const r = R(SETUP + ROOM + `
      SEL.clear(); SEL.add(right.id);
      const before = { right: right.a[0], left: left.a[0] };
      const took = liveDims().find(d => d.k === 'gap').set(2000);
      SEL.clear(); SEL.add(right.id);
      const now = Math.round(liveDims().find(d => d.k === 'gap').value);
      return { took, before, after: { right: right.a[0], left: left.a[0] }, now };`);
    eq(r.took, true, 'the edit is accepted');
    eq(r.now, 2000, 'and the gap becomes what was typed');
    eq(r.after.left, r.before.left, 'the wall that was NOT picked does not move');
    eq(r.after.right, 2230, 'the picked one does: 4100 - (3870 - 2000)');
  });

  t('and it is one undo', () => {
    const r = R(SETUP + ROOM + `
      SEL.clear(); SEL.add(right.id);
      const x0 = right.a[0];
      liveDims().find(d => d.k === 'gap').set(2000);
      const moved = DOC.ents.get(right.id).a[0];
      undoStep();
      return { x0, moved, back: DOC.ents.get(right.id).a[0] };`);
    ok(r.moved !== r.x0, 'it moved');
    eq(r.back, r.x0, 'and one step puts it back');
  });

  t('a new length re-runs the wall from the end it started at', () => {
    const r = R(SETUP + `
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[3000,0], wt:'gen100', layer:'A-WALL'});
      commit('one');
      SEL.clear(); SEL.add(w.id);
      const took = liveDims().find(d => d.k === 'len').set(5000);
      return { took, a: DOC.ents.get(w.id).a.slice(), b: DOC.ents.get(w.id).b.slice(),
               len: Math.round(wallLen(DOC.ents.get(w.id))) };`);
    eq(r.took, true);
    eq(r.len, 5000, 'the wall is the length that was typed');
    eq(r.a.join(','), '0,0', 'measured from the end it was drawn from');
  });

  t('nonsense is refused rather than applied', () => {
    const r = R(SETUP + ROOM + `
      SEL.clear(); SEL.add(right.id);
      const d = liveDims();
      const out = [d.find(x => x.k === 'len').set(0),
                   d.find(x => x.k === 'len').set(NaN),
                   d.find(x => x.k === 'gap').set(-500)];
      return { out, still: Math.round(wallLen(DOC.ents.get(right.id))) };`);
    eq(r.out.join(','), 'false,false,false', 'all three refused');
    eq(r.still, 4000, 'and the wall is untouched');
  });

  group('what a selected opening says');

  t('a door gives its distance along the wall and the angle it swings through', () => {
    const r = R(SETUP + `
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[8000,0], wt:'gen100', layer:'A-WALL'});
      const d = addOpening('door', w, 2200, 'sgl900');
      commit('door');
      SEL.clear(); SEL.add(d.id);
      const ds = liveDims();
      return { kinds: ds.map(x => x.k).sort().join(','),
               pos: (ds.find(x => x.k === 'pos') || {}).value,
               ang: (ds.find(x => x.k === 'angle') || {}).value };`);
    eq(r.kinds, 'angle,cl,pos', 'a distance, a swing and a centreline');
    eq(r.pos, 2200, 'measured from the end it is nearer to');
    eq(r.ang, 90, 'and the swing');
  });

  t('past the middle of the wall it measures from the other end, which is the near one', () => {
    const r = R(SETUP + `
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[8000,0], wt:'gen100', layer:'A-WALL'});
      const d = addOpening('door', w, 7000, 'sgl900');
      commit('door');
      SEL.clear(); SEL.add(d.id);
      const dim = liveDims().find(x => x.k === 'pos');
      const took = dim.set(500);
      return { shown: dim.value, took, pos: DOC.ents.get(d.id).pos };`);
    eq(r.shown, 1000, '8000 - 7000, from the far end');
    eq(r.pos, 7500, 'and typing 500 puts it 500 off THAT end');
  });

  t('an opening cannot be typed out of its own wall', () => {
    const r = R(SETUP + `
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[4000,0], wt:'gen100', layer:'A-WALL'});
      const d = addOpening('door', w, 1000, 'sgl900');
      commit('door');
      SEL.clear(); SEL.add(d.id);
      liveDims().find(x => x.k === 'pos').set(99999);
      const far = DOC.ents.get(d.id).pos;
      liveDims().find(x => x.k === 'pos').set(-500);
      const near = DOC.ents.get(d.id).pos;
      return { far, near };`);
    ok(r.far <= 4000 - 450 + 1e-6, 'the far jamb stays on the wall: ' + r.far);
    ok(r.near >= 450 - 1e-6, 'and so does the near one: ' + r.near);
  });

  t('the swing angle drives the arc that is drawn', () => {
    const r = R(SETUP + `
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[8000,0], wt:'gen100', layer:'A-WALL'});
      const d = addOpening('door', w, 2200, 'sgl900');
      commit('door');
      SEL.clear(); SEL.add(d.id);
      const arc0 = doorShapes(d).find(s => s.role === 'swing');
      const span0 = Math.abs(arc0.a1 - arc0.a0);
      liveDims().find(x => x.k === 'angle').set(45);
      const arc1 = doorShapes(DOC.ents.get(d.id)).find(s => s.role === 'swing');
      return { swing: DOC.ents.get(d.id).swing,
               span0: Math.round(deg(span0)), span1: Math.round(deg(Math.abs(arc1.a1 - arc1.a0))) };`);
    eq(r.swing, 45, 'the door records it');
    eq(r.span0, 90, 'the arc was a right angle');
    eq(r.span1, 45, 'and is now what was typed');
  });

  group('they are not part of the drawing');

  t('nothing is added, whatever is selected or typed', () => {
    const r = R(SETUP + ROOM + `
      const n0 = DOC.ents.size;
      SEL.clear(); SEL.add(right.id);
      liveDims();
      liveDims().find(d => d.k === 'gap').set(2500);
      SEL.clear();
      return { n0, n1: DOC.ents.size,
               kinds: [...DOC.ents.values()].map(e => e.t).sort().join(',') };`);
    eq(r.n1, r.n0, 'the count does not move');
    eq(r.kinds, 'wall,wall', 'and there is no dimension object in there');
  });

  t('nothing is published for a selection that is not one thing', () => {
    const r = R(SETUP + ROOM + `
      SEL.clear(); const none = liveDims().length;
      SEL.add(left.id); SEL.add(right.id); const both = liveDims().length;
      SEL.clear();
      return { none, both };`);
    eq(r.none, 0, 'nothing selected, nothing to place');
    eq(r.both, 0, 'two things selected: which one would the number move?');
  });

  t('LIVEDIM off turns them off', () => {
    const r = R(SETUP + ROOM + `
      SEL.clear(); SEL.add(right.id);
      const on = liveDims().length;
      ST.liveDim = false; const off = liveDims().length;
      ST.liveDim = true;
      SEL.clear();
      return { on, off };`);
    ok(r.on > 0, 'on by default');
    eq(r.off, 0, 'and off when asked');
  });

  /* The value box is a screen target. It is rebuilt on every paint so that a
     box can never outlive the frame that drew it — a stale one would swallow
     a click meant for the drawing underneath. */
  t('the value boxes are rebuilt by the paint that draws them', () => {
    const r = R(SETUP + ROOM + `
      SEL.clear(); SEL.add(right.id);
      fit(); drawLiveDims();
      const drawn = LDIM_BOXES.length;
      const hit = drawn ? !!liveDimAt(LDIM_BOXES[0].x + 2, LDIM_BOXES[0].y + 2) : false;
      const miss = !liveDimAt(-50, -50);
      SEL.clear(); drawLiveDims();
      const after = LDIM_BOXES.length;
      return { drawn, hit, miss, after };`);
    ok(r.drawn >= 2, 'the gap and the run both got a box, got ' + r.drawn);
    eq(r.hit, true, 'a point inside one finds it');
    eq(r.miss, true, 'a point outside finds nothing');
    eq(r.after, 0, 'and deselecting clears them on the next paint');
  });
};
