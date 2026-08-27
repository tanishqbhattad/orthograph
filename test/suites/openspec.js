'use strict';
/* ============================================================
   C2 — what an opening has to be, not just how big it is

   A door schedule that lists mark, size and host wall is a
   schedule you cannot order from and cannot get past building
   control. A door is specified by its fire rating, its acoustic
   rating and its finish at least as much as by being 900 wide,
   and none of those could be recorded anywhere.

   They belong to the TYPE, because that is what gets specified
   once and used forty times — with a per-opening override, because
   the one door onto the stair is always different.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
  const plan = () => { begin();
    const w = addEnt({t:'wall', a:[0,0], b:[12000,0], wt:'cav300', layer:'A-WALL'});
    commit('w'); return w; };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('the specification of an opening');

  t('is taken from its type', () => {
    const r = R(`${SETUP}
      const w = plan();
      const ty = doorType('sgl900');
      ty.fire = 30; ty.acoustic = 32; ty.finish = 'Painted hardwood';
      begin();
      const d = addEnt({t:'door', host:w.id, pos:2000, dt:'sgl900', layer:'A-DOOR'});
      commit('d');
      const s = openingSpec(d);
      return { fire: s.fire, acoustic: s.acoustic, finish: s.finish };`);
    eq(r.fire, 30, 'the fire rating comes off the type');
    eq(r.acoustic, 32, 'and the acoustic rating');
    eq(r.finish, 'Painted hardwood', 'and the finish');
  });

  /* One door in a run is always different — the one onto the protected stair. */
  t('and can be overridden on the one door that differs', () => {
    const r = R(`${SETUP}
      const w = plan();
      const ty = doorType('sgl900');
      ty.fire = 30; ty.acoustic = 32; ty.finish = 'Painted hardwood';
      begin();
      const normal = addEnt({t:'door', host:w.id, pos:2000, dt:'sgl900', layer:'A-DOOR'});
      const stair = addEnt({t:'door', host:w.id, pos:6000, dt:'sgl900', fire:60,
                            finish:'Veneered oak', layer:'A-DOOR'});
      commit('d');
      const a = openingSpec(normal), b = openingSpec(stair);
      return { a: [a.fire, a.acoustic, a.finish], b: [b.fire, b.acoustic, b.finish] };`);
    eq(r.a.join('|'), '30|32|Painted hardwood', 'the ordinary door follows its type');
    eq(r.b.join('|'), '60|32|Veneered oak',
      'the overridden one takes its own fire and finish, and keeps the type acoustic: ' + r.b.join('|'));
  });

  t('an opening whose type says nothing reports nothing rather than guessing', () => {
    const r = R(`${SETUP}
      const w = plan();
      begin();
      const d = addEnt({t:'door', host:w.id, pos:2000, dt:'sgl800', layer:'A-DOOR'});
      commit('d');
      const s = openingSpec(d);
      return { fire: s.fire, acoustic: s.acoustic, finish: s.finish };`);
    eq(r.fire, null, 'no fire rating is invented');
    eq(r.acoustic, null, 'nor an acoustic one');
    eq(r.finish, null, 'nor a finish');
  });

  /* A fire rating is what a drawing is checked against; a plausible default
     would be a number nobody chose, in a document somebody signs. */
  t('the shipped library claims no fire ratings, because a size does not have one', () => {
    const r = R(`${SETUP}
      const bad = (DOC.doorTypes || []).filter(x => x.fire != null || x.acoustic != null);
      return { types: (DOC.doorTypes || []).length, bad: bad.map(x => x.id) };`);
    ok(r.types > 5, 'there is a library to check');
    eq(r.bad.length, 0, 'and nothing in it claims a rating it cannot know: ' + r.bad.join(', '));
  });

  group('the schedule carries them');

  t('a door schedule has fire, acoustic and finish columns', () => {
    const r = R(`${SETUP}
      const w = plan();
      const ty = doorType('sgl900');
      ty.fire = 30; ty.acoustic = 32; ty.finish = 'Painted hardwood';
      begin();
      addEnt({t:'door', host:w.id, pos:2000, dt:'sgl900', layer:'A-DOOR'});
      addEnt({t:'door', host:w.id, pos:6000, dt:'sgl800', layer:'A-DOOR'});
      commit('d');
      markOpenings('door');
      const rows = openingScheduleRows('door', 0);
      return { header: rows[0], rated: rows.find(x => /Painted/.test(x.join('|'))),
               unrated: rows.slice(1).find(x => !/Painted/.test(x.join('|'))) };`);
    ok(/Fire/i.test(r.header.join(',')), 'a Fire column: ' + r.header.join(', '));
    ok(/Acoustic|Rw/i.test(r.header.join(',')), 'an Acoustic column');
    ok(/Finish/i.test(r.header.join(',')), 'a Finish column');
    ok(/FD30/.test(r.rated.join('|')),
      'the rated door reads as FD30: ' + r.rated.join(' | '));
    ok(/32/.test(r.rated.join('|')), 'with its acoustic rating');
    ok(/—/.test(r.unrated.join('|')),
      'and the unrated one says so rather than being left blank: ' + r.unrated.join(' | '));
  });

  t('a window schedule carries the same, minus the ones a window has no business with', () => {
    const r = R(`${SETUP}
      const w = plan();
      begin();
      addEnt({t:'window', host:w.id, pos:4000, w:1200, h:1200, sill:900,
              acoustic:38, finish:'Powder-coated aluminium', layer:'A-GLAZ'});
      commit('d');
      markOpenings('window');
      const rows = openingScheduleRows('window', 0);
      return { header: rows[0].join(','), row: rows[1].join('|') };`);
    ok(/Acoustic|Rw/i.test(r.header), 'acoustic matters for a window: ' + r.header);
    ok(/Finish/i.test(r.header), 'and so does the finish');
    ok(/38/.test(r.row) && /Powder/.test(r.row), 'both reach the row: ' + r.row);
  });

  t('the columns come out in the CSV too', () => {
    const r = R(`${SETUP}
      const w = plan();
      const ty = doorType('sgl900'); ty.fire = 60; ty.finish = 'Veneered oak';
      begin();
      addEnt({t:'door', host:w.id, pos:2000, dt:'sgl900', layer:'A-DOOR'});
      commit('d');
      markOpenings('door');
      cancelCmd(); startCmd('doorschedule'); cmdPoint([15000, 6000]); endCmd(true);
      const tb = [...DOC.ents.values()].find(e => e.t === 'table');
      const csv = tableCSV(tb);
      return { csv, hasFD: /FD60/.test(csv), hasFinish: /Veneered oak/.test(csv) };`);
    eq(r.hasFD, true, 'the fire rating is in the file');
    eq(r.hasFinish, true, 'and the finish');
  });

  group('editing them');

  t('the properties panel offers all three for a door', () => {
    const r = R(`${SETUP}
      const w = plan();
      begin();
      const d = addEnt({t:'door', host:w.id, pos:2000, dt:'sgl900', layer:'A-DOOR'});
      commit('d');
      SEL.clear(); SEL.add(d.id); buildProps();
      const rows = [...document.querySelectorAll('#props .row')]
        .map(x => x.innerHTML || '').join(' ');
      return { fire: /fire/i.test(rows), ac: /acoustic|rw/i.test(rows), fin: /finish/i.test(rows) };`);
    eq(r.fire, true, 'Fire');
    eq(r.ac, true, 'Acoustic');
    eq(r.fin, true, 'Finish');
  });

  t('they survive a save and reopen, on the type and on the override', () => {
    const r = R(`${SETUP}
      const w = plan();
      const ty = doorType('sgl900'); ty.fire = 30; ty.acoustic = 32;
      begin();
      addEnt({t:'door', host:w.id, pos:2000, dt:'sgl900', fire:60,
              finish:'Veneered oak', layer:'A-DOOR'});
      commit('d');
      loadNative(saveNative());
      const d = [...DOC.ents.values()].find(e => e.t === 'door');
      const s = openingSpec(d);
      return { typeFire: doorType('sgl900').fire, typeAc: doorType('sgl900').acoustic,
               fire: s.fire, acoustic: s.acoustic, finish: s.finish };`);
    eq(r.typeFire, 30, 'the type kept its rating');
    eq(r.typeAc, 32, 'and its acoustic rating');
    eq(r.fire, 60, 'the override came back too');
    eq(r.acoustic, 32, 'still falling through to the type for what it did not override');
    eq(r.finish, 'Veneered oak', 'and its finish');
  });
};
