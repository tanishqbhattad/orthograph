'use strict';
/* ============================================================
   C4 — tables and the room schedule

   A schedule is not a picture of a table. It is the drawing
   telling you what it contains: rooms already know their names
   and areas, so a schedule reads them and cannot disagree with
   the plan it came from.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; DOC.areaUnits = 'm2';
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  /* a box split in two by a partition */
  const build = () => {
    begin();
    addEnt({t:'wall', a:[0,0], b:[9000,0], wt:'cav300', layer:'A-WALL'});
    addEnt({t:'wall', a:[9000,0], b:[9000,6000], wt:'cav300', layer:'A-WALL'});
    addEnt({t:'wall', a:[9000,6000], b:[0,6000], wt:'cav300', layer:'A-WALL'});
    addEnt({t:'wall', a:[0,6000], b:[0,0], wt:'cav300', layer:'A-WALL'});
    const part = addEnt({t:'wall', a:[5000,0], b:[5000,6000], wt:'part140', layer:'A-WALL'});
    commit('walls');
    return part;
  };
  /* rooms must be AUTO to follow their walls: roomBoundary only re-traces when
     auto and seed are both set, which cost me a confusing probe */
  const mk = (seed, name) => addEnt({ t:'room', pts: roomTrace(seed, 0),
    seed: seed.slice(), auto: true, name, showArea: true,
    h: DOC.textH * 1.4, layer:'A-AREA' });
  const areaOf = r => Math.abs(polyArea(roomBoundary(r) || r.pts));
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('the schedule reads the drawing');

  t('it lists every room on the level, with its own area', () => {
    const r = R(`${SETUP}
      build();
      begin(); mk([2000,3000],'LIVING'); mk([7000,3000],'KITCHEN'); commit('r');
      const rows = roomScheduleRows();
      const rooms = [...DOC.ents.values()].filter(e => e.t === 'room');
      return { rows, header: rows[0], n: rows.length - 1,
               areas: rooms.map(x => +areaOf(x).toFixed(2)) };`);
    eq(r.header.join(','), 'No.,Room,Area');
    eq(r.n, 2, 'two rooms, two rows');
    eq(r.rows[1][1], 'LIVING'); eq(r.rows[2][1], 'KITCHEN');
    ok(/m/.test(r.rows[1][2]), 'and the area is written the way the plan writes it');
  });

  /* The point of reading rather than copying. */
  t('moving a wall changes the rooms, and re-running changes the schedule', () => {
    const r = R(`${SETUP}
      const part = build();
      begin(); mk([2000,3000],'LIVING'); mk([7000,3000],'KITCHEN'); commit('r');
      cancelCmd(); startCmd('schedule'); cmdPoint([10500, 6000]); endCmd(true);
      const tb = [...DOC.ents.values()].find(e => e.t === 'table');
      const before = tb.rows.map(x => x[2]);
      begin(); mut(part); part.a = [6500,0]; part.b = [6500,6000]; commit('mv');
      const rooms = [...DOC.ents.values()].filter(e => e.t === 'room')
        .map(x => +areaOf(x).toFixed(2));
      const stale = tb.rows.map(x => x[2]);
      META.scheduleupdate.fn();
      const after = tb.rows.map(x => x[2]);
      return { before, rooms, stale, after };`);
    ok(r.rooms[0] > r.rooms[1], 'the living room grew and the kitchen shrank');
    eq(r.stale.join('|'), r.before.join('|'),
      'the table does not change on its own — it is not a live view');
    ok(r.after.join('|') !== r.before.join('|'),
      'but re-running it picks up the new areas, got ' + r.after.join('|'));
  });

  t('a schedule only counts the level it belongs to', () => {
    const r = R(`${SETUP}
      build();
      begin(); mk([2000,3000],'LIVING'); mk([7000,3000],'KITCHEN'); commit('r');
      const ground = roomScheduleRows(0).length - 1;
      gotoLevel(1);
      const first = roomScheduleRows().length - 1;
      return { ground, first, cur: DOC.curLevel };`);
    eq(r.ground, 2, 'the ground floor has two rooms');
    eq(r.first, 0, 'and the empty storey above has none');
  });

  t('rooms are numbered up the page then across, the way a plan is read', () => {
    const r = R(`${SETUP}
      begin();
      /* three rooms drawn out of order: bottom-right, top-left, bottom-left */
      addEnt({t:'room', pts:[[6000,0],[9000,0],[9000,2000],[6000,2000]], name:'C', layer:'A-AREA'});
      addEnt({t:'room', pts:[[0,4000],[3000,4000],[3000,6000],[0,6000]], name:'A', layer:'A-AREA'});
      addEnt({t:'room', pts:[[0,0],[3000,0],[3000,2000],[0,2000]], name:'B', layer:'A-AREA'});
      commit('r');
      return { order: roomScheduleRows().slice(1).map(x => x[1]),
               nums: roomScheduleRows().slice(1).map(x => x[0]) };`);
    eq(r.order.join(','), 'A,B,C', 'highest first, then left to right, got ' + r.order.join(','));
    eq(r.nums.join(','), '01,02,03', 'numbered in that order');
  });

  group('the table itself');

  t('a table draws its grid and one text per cell', () => {
    const r = R(`${SETUP}
      begin();
      const tb = addEnt({ t:'table', p:[0,0], h:200,
        rows: [['No.','Room','Area'], ['01','LIVING','27 m2']],
        colW: fitColumns([['No.','Room','Area'], ['01','LIVING','27 m2']], 200),
        align: ['l','l','r'], layer:'0' });
      commit('t');
      const sh = shapes(tb, 32);
      const texts = sh.filter(s => s.text != null).map(s => s.text);
      const lines = sh.filter(s => s.pts).length;
      const b = bbox(tb);
      return { texts, lines, w: Math.round(b[2] - b[0]), h: Math.round(b[3] - b[1]),
               picked: !!pickAt([(b[0]+b[2])/2, (b[1]+b[3])/2], 5) };`);
    eq(r.texts.join(','), 'No.,Room,Area,01,LIVING,27 m2', 'every cell is drawn');
    /* 2 rows -> 3 horizontals, 3 columns -> 4 verticals */
    eq(r.lines, 7, 'the grid is drawn once per boundary, got ' + r.lines);
    ok(r.w > 0 && r.h > 0, 'it has a size');
    eq(r.picked, true, 'and can be clicked anywhere inside it');
  });

  t('columns are wide enough for their widest cell', () => {
    const r = R(`${SETUP}
      const rows = [['No.','Room'], ['01','A VERY LONG ROOM NAME']];
      const w = fitColumns(rows, 200);
      return { w: w.map(x => Math.round(x)),
               need: Math.round(('A VERY LONG ROOM NAME'.length + 2) * 200 * MT_CHAR) };`);
    eq(r.w[1], r.need, 'the second column fits its longest entry');
    ok(r.w[1] > r.w[0], 'and is wider than the narrow one');
  });

  t('a table moves and scales as one object', () => {
    const r = R(`${SETUP}
      begin();
      const tb = addEnt({ t:'table', p:[0,0], h:200, rows:[['a','b']],
        colW:[1000,1000], layer:'0' });
      commit('t');
      begin(); xf(tb, T.move([500,-300])); commit('mv');
      const moved = tb.p.map(Math.round);
      begin(); xf(tb, T.scale([0,0], 2)); commit('sc');
      return { moved, h: tb.h, cols: tb.colW, p: tb.p.map(Math.round) };`);
    eq(r.moved.join(','), '500,-300');
    eq(r.h, 400, 'the text scales');
    eq(r.cols.join(','), '2000,2000', 'and the columns with it');
    eq(r.p.join(','), '1000,-600');
  });
};
