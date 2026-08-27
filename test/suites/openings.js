'use strict';
/* ============================================================
   C2 — marks, tags and opening schedules

   A door on a drawing is not "a door", it is D-04: a number that
   a schedule, an order and a person on site all refer to. Doors
   and windows knew their size and their host and had no way to
   be referred to at all.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  VS.tags = 1;
  const plan = () => {
    begin();
    const S = addEnt({t:'wall', a:[0,0], b:[10000,0], wt:'cav300', layer:'A-WALL'});
    const E = addEnt({t:'wall', a:[10000,0], b:[10000,6000], wt:'cav300', layer:'A-WALL'});
    const N = addEnt({t:'wall', a:[10000,6000], b:[0,6000], wt:'cav300', layer:'A-WALL'});
    const W = addEnt({t:'wall', a:[0,6000], b:[0,0], wt:'cav300', layer:'A-WALL'});
    const P = addEnt({t:'wall', a:[5000,0], b:[5000,6000], wt:'part140', layer:'A-WALL'});
    commit('walls');
    return { S, E, N, W, P };
  };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('marks');

  t('marking numbers every opening of a kind, in reading order', () => {
    const r = R(`${SETUP}
      const w = plan();
      begin();
      addEnt({t:'door', host:w.P.id, pos:3000, dt:'sgl900', layer:'A-DOOR'});
      addEnt({t:'door', host:w.S.id, pos:2000, dt:'dbl1500', layer:'A-DOOR'});
      addEnt({t:'window', host:w.W.id, pos:3000, w:1200, h:1200, sill:900, layer:'A-GLAZ'});
      commit('o');
      const dn = markOpenings('door'), wn = markOpenings('window');
      const marks = [...DOC.ents.values()].filter(e => e.t === 'door' || e.t === 'window')
        .map(e => e.t[0] + ':' + e.mark).sort();
      return { dn, wn, marks };`);
    eq(r.dn, 2, 'both doors are marked');
    eq(r.wn, 1, 'and the window separately');
    eq(r.marks.join(','), 'd:D-01,d:D-02,w:W-01',
      'doors and windows are numbered in their own series, got ' + r.marks.join(','));
  });

  /* A mark that moves when someone adds a door is worse than no mark, because
     the schedule, the order and the drawing stop agreeing. */
  t('adding a door later does not renumber the ones already marked', () => {
    const r = R(`${SETUP}
      const w = plan();
      begin();
      addEnt({t:'door', host:w.P.id, pos:3000, dt:'sgl900', layer:'A-DOOR'});
      addEnt({t:'door', host:w.S.id, pos:8000, dt:'sgl900', layer:'A-DOOR'});
      commit('o');
      markOpenings('door');
      const before = [...DOC.ents.values()].filter(e => e.t === 'door')
        .map(e => e.pos + '=' + e.mark).sort().join(',');
      /* a new door that would sort FIRST in reading order */
      begin(); addEnt({t:'door', host:w.N.id, pos:5000, dt:'sgl900', layer:'A-DOOR'}); commit('n');
      const given = markOpenings('door');
      const after = [...DOC.ents.values()].filter(e => e.t === 'door')
        .map(e => e.pos + '=' + e.mark).sort().join(',');
      return { before, after, given };`);
    eq(r.given, 1, 'only the new one needed a mark');
    ok(r.after.indexOf(r.before.split(',')[0]) >= 0,
      'and the existing marks are untouched: ' + r.after);
  });

  t('a tag is drawn beside the opening, and rides with it', () => {
    const r = R(`${SETUP}
      const w = plan();
      begin();
      const d = addEnt({t:'door', host:w.P.id, pos:3000, dt:'sgl900', layer:'A-DOOR'});
      commit('o');
      markOpenings('door');
      const withTag = shapes(d, 32).filter(s => s.role === 'tag' || s.text != null);
      VS.tags = 0;
      const without = shapes(d, 32).filter(s => s.role === 'tag' || s.text != null);
      VS.tags = 1;
      return { withTag: withTag.length, text: (withTag.find(s => s.text) || {}).text,
               without: without.length };`);
    ok(r.withTag >= 2, 'a ring and its mark');
    eq(r.text, 'D-01', 'showing the mark');
    eq(r.without, 0, 'and TAGS off draws neither');
  });

  group('schedules');

  t('a door schedule lists mark, type, size and host wall', () => {
    const r = R(`${SETUP}
      const w = plan();
      begin();
      addEnt({t:'door', host:w.P.id, pos:3000, dt:'sgl900', layer:'A-DOOR'});
      addEnt({t:'door', host:w.S.id, pos:2000, dt:'dbl1500', layer:'A-DOOR'});
      commit('o');
      markOpenings('door');
      const rows = openingScheduleRows('door', 0);
      return { header: rows[0], rows: rows.slice(1).map(x => x.join('|')) };`);
    eq(r.header.join(','), 'Mark,Door,W,H,Wall');
    ok(r.rows.some(x => /D-01\|Single 900\|900\|2100\|Stud partition 140/.test(x)),
      'the partition door reads right: ' + r.rows.join('  //  '));
    ok(r.rows.some(x => /Double 1500\|1500\|2100\|Cavity 300/.test(x)),
      'and the external one: ' + r.rows.join('  //  '));
  });

  /* doorType() and winType() fall back to the FIRST entry in the library when
     an opening has no type of its own, so an 1800x1500 window with its size
     set directly was reported as "Window 600x600". The size columns were right
     and the name was a lie — the worst way round to be wrong on a schedule
     somebody orders from. */
  t('an opening with its own size is not named after a type it is not', () => {
    const r = R(`${SETUP}
      const w = plan();
      begin();
      addEnt({t:'window', host:w.W.id, pos:3000, w:1200, h:1200, sill:900, layer:'A-GLAZ'});
      addEnt({t:'window', host:w.E.id, pos:4000, w:1800, h:1500, sill:750, layer:'A-GLAZ'});
      commit('o');
      markOpenings('window');
      const rows = openingScheduleRows('window', 0).slice(1);
      return { names: rows.map(x => x[1]), sizes: rows.map(x => x[2] + 'x' + x[3]),
               libFirst: DOC.winTypes[0].name };`);
    ok(r.names.every((n, i) => n.indexOf(r.sizes[i].split('x')[0]) >= 0),
      'the name carries the real size: ' + r.names.join(', '));
    ok(!r.names.includes(r.libFirst),
      'and nothing is named after the library default "' + r.libFirst + '"');
  });

  t('a real type is still named for its type', () => {
    const r = R(`${SETUP}
      const w = plan();
      begin();
      addEnt({t:'door', host:w.P.id, pos:3000, dt:'sgl800', layer:'A-DOOR'});
      commit('o');
      markOpenings('door');
      return { name: openingScheduleRows('door', 0)[1][1] };`);
    eq(r.name, 'Single 800', 'an opening that really is of a type keeps its name');
  });

  t('the schedule is placed as a table and counts only this level', () => {
    const r = R(`${SETUP}
      const w = plan();
      begin();
      addEnt({t:'door', host:w.P.id, pos:3000, dt:'sgl900', layer:'A-DOOR'});
      commit('o');
      markOpenings('door');
      cancelCmd(); startCmd('doorschedule'); cmdPoint([12000, 6000]); endCmd(true);
      const tb = [...DOC.ents.values()].find(e => e.t === 'table');
      gotoLevel(1);
      const upstairs = openingScheduleRows('door', DOC.curLevel).length - 1;
      return { kind: tb && tb.kind, rows: tb && tb.rows.length, upstairs };`);
    eq(r.kind, 'doors', 'it knows what kind of schedule it is');
    eq(r.rows, 2, 'a header and one door');
    eq(r.upstairs, 0, 'and the empty storey above schedules nothing');
  });
};
