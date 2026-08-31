'use strict';
/* ============================================================
   9.2 — where a room's shape came from

   An automatic room is a seed point and a walk round whatever
   encloses it. The walk knows exactly which walls it followed
   and then throws that away, which costs three things:

     · the drawing cannot say what bounds a room, so a room the
       wrong shape is a mystery rather than a list of walls to
       go and look at
     · every room has to be re-traced whenever anything at all
       changes, because nothing knows which rooms cared
     · a room that fails to close cannot say what it was
       following when it ran out

   Keeping the ids costs one array per room.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL'); ensureLayer('A-AREA');
  const box = (x0, y0, x1, y1) => {
    const w = [];
    w.push(addEnt({t:'wall', a:[x0,y0], b:[x1,y0], wt:'gen100', layer:'A-WALL'}));
    w.push(addEnt({t:'wall', a:[x1,y0], b:[x1,y1], wt:'gen100', layer:'A-WALL'}));
    w.push(addEnt({t:'wall', a:[x1,y1], b:[x0,y1], wt:'gen100', layer:'A-WALL'}));
    w.push(addEnt({t:'wall', a:[x0,y1], b:[x0,y0], wt:'gen100', layer:'A-WALL'}));
    return w;
  };
  const plan = () => {
    begin();
    const a = box(0, 0, 6000, 4000);
    /* a second room, far enough away to share nothing with the first */
    const b = box(20000, 0, 26000, 4000);
    const r1 = addEnt({t:'room', auto:1, seed:[3000,2000], name:'ONE', layer:'A-AREA'});
    const r2 = addEnt({t:'room', auto:1, seed:[23000,2000], name:'TWO', layer:'A-AREA'});
    commit('p');
    return { a, b, r1, r2 };
  };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('what bounds a room');

  t('a traced room knows which objects it walked round', () => {
    const r = R(`${SETUP}
      const { a, r1 } = plan();
      roomBoundary(r1);
      const src = roomSources(r1);
      const ids = a.map(w => w.id);
      return { n: src.length, all: src.every(i => ids.indexOf(i) >= 0),
               got: src, want: ids };`);
    eq(r.n, 4, 'four walls make this room, got ' + r.got.length);
    eq(r.all, true, 'and they are the four that are actually there: ' +
      r.got.join(',') + ' vs ' + r.want.join(','));
  });

  t('a room drawn as a polygon has no sources, and says so', () => {
    const r = R(`${SETUP}
      begin();
      const r0 = addEnt({t:'room', pts:[[0,0],[4000,0],[4000,3000],[0,3000]], name:'DRAWN', layer:'A-AREA'});
      commit('r');
      return { src: roomSources(r0) };`);
    eq(r.src.length, 0, 'nothing traced it, so nothing is claimed');
  });

  t('a column standing in the room is part of what bounds it', () => {
    const r = R(`${SETUP}
      const { r1 } = plan();
      begin();
      const col = addEnt({t:'column', p:[3000,2000], w:400, h:400, layer:'A-WALL'});
      commit('c');
      roomBoundary(r1);
      return { has: roomSources(r1).indexOf(col.id) >= 0, n: roomSources(r1).length };`);
    eq(r.has, true, 'the column is in the list: ' + r.n + ' sources');
  });

  t('a wall that is deleted stops being listed', () => {
    const r = R(`${SETUP}
      const { a, r1 } = plan();
      roomBoundary(r1);
      const before = roomSources(r1).length;
      begin(); delEnt(a[0].id); commit('d');
      roomBoundary(r1);
      const after = roomSources(r1);
      return { before, has: after.indexOf(a[0].id) >= 0 };`);
    eq(r.before, 4);
    eq(r.has, false, 'a room cannot be bounded by a wall that is not there');
  });

  group('what it is for');

  /* Every room was re-traced whenever anything changed, because nothing knew
     which rooms cared. Now something does. */
  t('moving a wall re-traces the room it bounds and not the others', () => {
    const r = R(`${SETUP}
      const { a, r1, r2 } = plan();
      const A1 = Math.round(Math.abs(polyArea(roomBoundary(r1))));
      const A2 = Math.round(Math.abs(polyArea(roomBoundary(r2))));
      const n0 = ROOM_TRACES;
      /* Shorten the first room's top wall and move the two sides in with it,
         so the room stays properly enclosed — a wall left dangling would open
         the room instead of resizing it, and then nothing re-traces at all. */
      begin();
      for (const w of a) {
        mut(w);
        if (w.a[1] === 4000) w.a = [w.a[0], 3000];
        if (w.b[1] === 4000) w.b = [w.b[0], 3000];
      }
      commit('m');
      const B1 = Math.round(Math.abs(polyArea(roomBoundary(r1))));
      const B2 = Math.round(Math.abs(polyArea(roomBoundary(r2))));
      return { traces: ROOM_TRACES - n0, A1, A2, B1, B2 };`);
    ok(r.B1 < r.A1, 'the first room really did change shape: ' + r.A1 + ' -> ' + r.B1);
    eq(r.B2, r.A2, 'and the far one did not');
    eq(r.traces, 1, 'so only one room needed re-tracing: ' + r.traces);
  });

  t('an edit that touches no wall re-traces nothing at all', () => {
    const r = R(`${SETUP}
      const { r1, r2 } = plan();
      roomBoundary(r1); roomBoundary(r2);
      const n0 = ROOM_TRACES;
      begin();
      addEnt({t:'text', p:[100000,100000], s:'NOTE', h:200, layer:'TEXT'});
      commit('t');
      roomBoundary(r1); roomBoundary(r2);
      return { traces: ROOM_TRACES - n0 };`);
    eq(r.traces, 0, 'a note in the corner of the sheet is not a room boundary');
  });

  t('a new wall through a room still re-traces it, provenance or not', () => {
    const r = R(`${SETUP}
      const { r1 } = plan();
      const before = Math.round(Math.abs(polyArea(roomBoundary(r1))));
      begin();
      addEnt({t:'wall', a:[3000,0], b:[3000,4000], wt:'gen100', layer:'A-WALL'});
      commit('w');
      const after = Math.round(Math.abs(polyArea(roomBoundary(r1))));
      return { before, after };`);
    ok(r.before > 20000000, 'the whole room to start: ' + r.before);
    ok(r.after < r.before * 0.7,
      'and half of it once a wall is put through the middle: ' + r.after);
  });

  t('the drawing can say what bounds a room, in words', () => {
    const r = R(`${SETUP}
      const { r1 } = plan();
      roomBoundary(r1);
      const s = roomSourceText(r1);
      return { s };`);
    ok(/4/.test(r.s) && /wall/i.test(r.s),
      'it names them: ' + r.s);
  });

  t('provenance is derived, so undo cannot leave it stale', () => {
    const r = R(`${SETUP}
      const { a, r1 } = plan();
      roomBoundary(r1);
      begin(); delEnt(a[0].id); commit('d');
      roomBoundary(r1);
      const broken = roomSources(r1).length;
      undo();
      roomBoundary(r1);
      return { broken, back: roomSources(r1).length };`);
    eq(r.back, 4, 'after undo the room is bounded by its four walls again');
  });
  t('and says it in the properties panel, where someone will read it', () => {
    const r = R(`${SETUP}
      const { r1 } = plan();
      SEL.clear(); SEL.add(r1.id);
      buildProps();
      const rows = (document.getElementById('props').children || [])
        .map(x => (x.textContent || '') + ' ' +
          (x.children || []).map(k => k.textContent || '').join(' '));
      return { text: rows.join(' | ') };`);
    ok(/enclosed by/i.test(r.text), 'the panel names it: ' + r.text.slice(0, 200));
    ok(/wall/i.test(r.text), 'and says what: ' + r.text.slice(0, 200));
  });
};
