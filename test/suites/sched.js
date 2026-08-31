'use strict';
/* ============================================================
   9.1 — a schedule of anything

   There were three schedules: rooms, doors, windows. Each was a
   function that knew how to build its own table, so a fourth
   one — walls by type with a total length, columns by size,
   furniture by block name with a count — meant writing a fourth
   function, and nobody ever does.

   A schedule is really three decisions: what to count, which
   properties to put in the columns, and whether to group the
   identical ones together and total them. Once those are named
   rather than hard-coded, a schedule of anything is a sentence
   instead of a source change — and the three that already exist
   become three sentences in the same language.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  const build = () => {
    ensureLayer('A-WALL');
    begin();
    const w1 = addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'gen100', layer:'A-WALL'});
    const w2 = addEnt({t:'wall', a:[6000,0], b:[6000,4000], wt:'gen100', layer:'A-WALL'});
    const w3 = addEnt({t:'wall', a:[6000,4000], b:[0,4000], wt:'cav300', layer:'A-WALL'});
    const w4 = addEnt({t:'wall', a:[0,4000], b:[0,0], wt:'cav300', layer:'A-WALL'});
    addEnt({t:'door', host:w1.id, at:0.4, w:900, layer:'A-DOOR'});
    addEnt({t:'door', host:w2.id, at:0.5, w:900, layer:'A-DOOR'});
    addEnt({t:'window', host:w3.id, at:0.5, w:1200, h:1200, sill:900, layer:'A-GLAZ'});
    commit('m');
    return { w1, w2, w3, w4 };
  };
  const rowsOf = (spec) => schedRows(spec);
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('what to count');

  t('anything with a type can be scheduled', () => {
    const r = R(`${SETUP}
      build();
      const walls = rowsOf({ of: 'wall', cols: ['mark', 'wallType', 'length'] });
      const doors = rowsOf({ of: 'door', cols: ['mark', 'width'] });
      return { walls: walls.length, doors: doors.length,
               head: walls[0], kinds: schedKinds().length };`);
    eq(r.walls, 5, 'four walls and a heading');
    eq(r.doors, 3, 'two doors and a heading');
    eq(r.head.length, 3, 'one heading per column');
    ok(r.kinds >= 5, 'and there is a list of what can be scheduled: ' + r.kinds);
  });

  t('a column is a named property, not a position', () => {
    const r = R(`${SETUP}
      build();
      const a = rowsOf({ of: 'wall', cols: ['wallType', 'length'] });
      const b = rowsOf({ of: 'wall', cols: ['length', 'wallType'] });
      return { a: a[0], b: b[0], a1: a[1], b1: b[1] };`);
    eq(r.a[0], r.b[1], 'the same column, wherever it is asked for');
    eq(r.a1[0], r.b1[1], 'and the same values under it');
  });

  t('a field nobody has defined is refused, not printed as undefined', () => {
    const r = R(`${SETUP}
      build();
      let threw = null;
      let rows = null;
      try { rows = rowsOf({ of: 'wall', cols: ['wallType', 'unicorn'] }); }
      catch (e) { threw = e.message; }
      return { threw, rows: rows && rows[0] };`);
    ok(r.threw == null, 'it does not throw');
    ok(!r.rows || r.rows.indexOf('unicorn') < 0,
      'and the made-up column is dropped: ' + JSON.stringify(r.rows));
  });

  group('grouping and totals');

  t('identical things collapse to one row with a count', () => {
    const r = R(`${SETUP}
      build();
      const flat = rowsOf({ of: 'wall', cols: ['wallType', 'length'] });
      const grp  = rowsOf({ of: 'wall', cols: ['wallType', 'length'], group: true });
      return { flat: flat.length, grp: grp.length, head: grp[0], rows: grp.slice(1) };`);
    eq(r.flat, 5, 'ungrouped, one row each');
    eq(r.grp, 3, 'grouped, one row per wall type');
    ok(r.head.indexOf('Qty') >= 0, 'and a quantity column appears: ' + r.head.join(' | '));
  });

  t('a grouped number is the sum, not the first one it saw', () => {
    const r = R(`${SETUP}
      build();
      const grp = rowsOf({ of: 'wall', cols: ['wallType', 'length'], group: true });
      const gen = grp.find(row => /gen/i.test(String(row[0])));
      return { gen, all: grp };`);
    ok(r.gen, 'the general walls are one row: ' + JSON.stringify(r.all));
    ok(/10000|10\.0|10 m/.test(r.gen.join(' ')),
      '6000 and 4000 make 10000: ' + r.gen.join(' | '));
  });

  t('a total row is asked for, and adds up what it says it does', () => {
    const r = R(`${SETUP}
      build();
      const rows = rowsOf({ of: 'wall', cols: ['wallType', 'length'], total: true });
      const last = rows[rows.length - 1];
      return { last, n: rows.length };`);
    ok(/total/i.test(String(r.last[0])), 'the last row is the total: ' + r.last.join(' | '));
    ok(/20000|20\.0|20 m/.test(r.last.join(' ')),
      '6+4+6+4 metres of wall: ' + r.last.join(' | '));
  });

  group('the schedules that already existed');

  t('rooms, doors and windows are now three sentences in the same language', () => {
    const r = R(`${SETUP}
      build();
      const d = SCHED_PRESET.doors, w = SCHED_PRESET.windows, m = SCHED_PRESET.rooms;
      return { door: d && d.of, win: w && w.of, room: m && m.of,
               doorCols: d && d.cols.length };`);
    eq(r.door, 'door');
    eq(r.win, 'window');
    eq(r.room, 'room');
    ok(r.doorCols >= 4, 'and a door schedule still has its columns: ' + r.doorCols);
  });

  t('a door schedule still carries what building control asks for', () => {
    const r = R(`${SETUP}
      build();
      const rows = schedRows(SCHED_PRESET.doors);
      const head = rows[0].join(' | ');
      return { head, n: rows.length };`);
    eq(r.n, 3, 'two doors');
    ok(/fire/i.test(r.head), 'fire rating is a column: ' + r.head);
    ok(/acoustic/i.test(r.head), 'and acoustic');
  });

  group('placing one');

  t('SCHEDULE asks what to schedule and places it', () => {
    const r = R(`${SETUP}
      build();
      cancelCmd(); startCmd('schedule'); cmdText('walls'); cmdPoint([0, 8000]);
      const tb = [...DOC.ents.values()].find(e => e.t === 'table');
      return { made: !!tb, kind: tb && tb.kind, of: tb && tb.spec && tb.spec.of,
               rows: tb && tb.rows.length };`);
    eq(r.made, true, 'a table is placed');
    eq(r.of, 'wall', 'of the thing asked for');
    eq(r.rows, 5, 'with a row per wall');
  });

  t('the spec is saved, so the table can be re-read later', () => {
    const r = R(`${SETUP}
      build();
      cancelCmd(); startCmd('schedule'); cmdText('walls'); cmdPoint([0, 8000]);
      loadNative(saveNative());
      const tb = [...DOC.ents.values()].find(e => e.t === 'table');
      return { of: tb && tb.spec && tb.spec.of, cols: tb && tb.spec && tb.spec.cols.length };`);
    eq(r.of, 'wall', 'the specification survives the file');
    ok(r.cols >= 2, 'columns and all');
  });

  /* The failure a schedule exists to prevent: draw one more door and the
     table is silently wrong. */
  t('SCHEDULEUPDATE re-reads every schedule, whatever it is of', () => {
    const r = R(`${SETUP}
      const { w4 } = build();
      cancelCmd(); startCmd('schedule'); cmdText('walls'); cmdPoint([0, 8000]);
      const tb = [...DOC.ents.values()].find(e => e.t === 'table');
      const before = tb.rows.length;
      begin(); addEnt({t:'wall', a:[0,0], b:[0,-3000], wt:'gen100', layer:'A-WALL'}); commit('w');
      scheduleUpdate();
      const after = [...DOC.ents.values()].find(e => e.t === 'table').rows.length;
      return { before, after };`);
    eq(r.before, 5);
    eq(r.after, 6, 'the new wall is in the table');
  });

  t('a schedule of something with none of them says so rather than lying', () => {
    const r = R(`${SETUP}
      build();
      const rows = schedRows({ of: 'stair', cols: ['mark'] });
      return { n: rows.length, head: rows[0] };`);
    eq(r.n, 1, 'the heading and nothing under it');
    ok(r.head.length >= 1, 'the columns are still named');
  });
  /* Two 100mm walls are not a 200mm wall. A number being a number does not
     make it an amount of something. */
  t('only quantities are added up — a thickness is not one', () => {
    const r = R(`${SETUP}
      build();
      const rows = rowsOf({ of: 'wall', cols: ['wallType', 'thickness', 'length'],
                            group: true, total: true });
      const gen = rows.find(x => /gen/i.test(String(x[0])));
      const tot = rows[rows.length - 1];
      return { gen, tot };`);
    ok(/^100/.test(r.gen[1]),
      'two 100mm walls are still 100mm thick: ' + r.gen.join(' | '));
    ok(/10000|10\.0|10 m/.test(r.gen[2]), 'while their lengths do add: ' + r.gen[2]);
    eq(r.tot[1], '', 'and there is no total thickness, because there is no such thing');
    ok(/20000|20\.0|20 m/.test(r.tot[2]), 'the total length is a real total: ' + r.tot[2]);
  });

  t('a door schedule grouped by type counts them without adding their widths', () => {
    const r = R(`${SETUP}
      build();
      const rows = rowsOf({ of: 'door', cols: ['opening', 'width'], group: true });
      const row = rows[1];
      return { row, n: rows.length };`);
    eq(r.n, 2, 'two identical doors are one line item');
    ok(/^900/.test(r.row[1]), 'each 900 wide, not 1800: ' + r.row.join(' | '));
    eq(r.row[2], '2', 'and there are two of them');
  });
};
