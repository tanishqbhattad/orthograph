'use strict';
/* ============================================================
   Numbers the program states out loud

   Both faults here are the same shape, and it is the worst one:
   a plausible number, confidently given. Not a crash, not a
   blank — an answer that looks like an answer and is wrong.
   The same shape as entLength() once reporting 35m for a 5m
   wall.

   1. A hatch ADDED the area of its holes instead of subtracting
      them, while drawing them correctly with an even-odd clip.
      So the drawing showed a room with a column in it and the
      area said the column was floor.

   2. parseLen ran parseFloat over the whole string, which stops
      at the first character it does not understand and returns
      what it had. Typing 1200+225 at a distance prompt gave a
      1200 wall. Typing 1200mmm gave 1200. There was no error.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('an area with a hole in it');

  t('a hatch subtracts its holes rather than adding them', () => {
    const r = R(`${SETUP}
      begin();
      /* 5m x 4m, with a 1m x 1m column standing in it */
      const h = addEnt({t:'hatch', loops:[
          [[0,0],[5000,0],[5000,4000],[0,4000]],
          [[2000,1500],[3000,1500],[3000,2500],[2000,2500]]
        ], pattern:'line', sp:150, hatchAng:45, layer:'0'});
      const solid = addEnt({t:'hatch', loops:[[[0,0],[5000,0],[5000,4000],[0,4000]]],
                            pattern:'line', sp:150, hatchAng:45, layer:'0'});
      commit('h');
      return { withHole: entArea(h) / 1e6, solid: entArea(solid) / 1e6 };`);
    close(r.solid, 20, 0.001, 'the plain region is 20 square metres');
    close(r.withHole, 19, 0.001,
      'and 19 once a square metre is taken out of it, got ' + r.withHole);
  });

  t('two holes come off, and a hole inside a hole comes back on', () => {
    const r = R(`${SETUP}
      begin();
      const two = addEnt({t:'hatch', loops:[
          [[0,0],[10000,0],[10000,10000],[0,10000]],
          [[1000,1000],[3000,1000],[3000,3000],[1000,3000]],
          [[6000,6000],[8000,6000],[8000,8000],[6000,8000]]
        ], pattern:'line', sp:150, hatchAng:45, layer:'0'});
      commit('h');
      return { area: entArea(two) / 1e6 };`);
    close(r.area, 100 - 4 - 4, 0.001, 'a hundred less two four-metre voids, got ' + r.area);
  });

  /* The drawing and the number have to agree: the fill already excluded the
     hole with an even-odd clip, so only the arithmetic was wrong. */
  t('the number agrees with what is actually filled', () => {
    const r = R(`${SETUP}
      begin();
      const h = addEnt({t:'hatch', loops:[
          [[0,0],[4000,0],[4000,4000],[0,4000]],
          [[1000,1000],[3000,1000],[3000,3000],[1000,3000]]
        ], pattern:'line', sp:200, hatchAng:0, layer:'0'});
      commit('h');
      const sh = shapes(h, 32).find(s => s.role === 'poche' || s.holes);
      return { area: entArea(h) / 1e6,
               drawnWithHoles: !!(sh && sh.holes && sh.holes.length),
               loops: h.loops.length };`);
    close(r.area, 16 - 4, 0.001, 'four metres of void off sixteen');
  });

  group('a room, on the plan and in the schedule');

  /* A room is derived at draw time from the arrangement of the wall faces, so
     it depends on entities other than itself. The shape cache is keyed by
     entity id and only ever invalidated the thing that changed and its
     neighbouring WALLS — nothing told the rooms. So the canvas kept drawing
     the outline and area from before the wall moved, while the schedule and
     the %<area>% field, which call the geometry directly, were right.

     Two numbers for one room, on the same screen. */
  const ROOM = `
    resetDoc(); ensureLayer('A-WALL');
    V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
    const box = (top) => { begin();
      const b = addEnt({t:'wall', a:[0,0], b:[4000,0], wt:'gen100', layer:'A-WALL'});
      const r = addEnt({t:'wall', a:[4000,0], b:[4000,top], wt:'gen100', layer:'A-WALL'});
      const t = addEnt({t:'wall', a:[4000,top], b:[0,top], wt:'gen100', layer:'A-WALL'});
      const l = addEnt({t:'wall', a:[0,top], b:[0,0], wt:'gen100', layer:'A-WALL'});
      const rm = addEnt({t:'room', auto:true, seed:[2000,top/2], name:'R1', layer:'A-AREA'});
      commit('box'); return { b, r, t, l, rm }; };
    const drawnArea = (rm) => (entShapes(rm).find(s => /m²/.test(String(s.text))) || {}).text;
    const trueArea = (rm) => (shapes(rm, 32).find(s => /m²/.test(String(s.text))) || {}).text;
  `;

  t('the drawn area follows the walls when they move', () => {
    const r = R(`${ROOM}
      const w = box(3000);
      fit(); paint();
      const before = drawnArea(w.rm);
      begin();
      mut(w.r); w.r.b = [4000, 5000];
      mut(w.t); w.t.a = [4000, 5000]; w.t.b = [0, 5000];
      mut(w.l); w.l.a = [0, 5000];
      commit('grow');
      paint();
      return { before, drawn: drawnArea(w.rm), fresh: trueArea(w.rm) };`);
    ok(/11\.3/.test(r.before), 'a 4x3 box of 100mm walls starts at 11.31, got ' + r.before);
    eq(r.drawn, r.fresh,
      'the plan and the schedule agree: canvas ' + r.drawn + ' vs computed ' + r.fresh);
    ok(/19\.1/.test(r.drawn), 'and it followed the wall out, got ' + r.drawn);
  });

  t('and when a wall is deleted out from under it', () => {
    const r = R(`${ROOM}
      const w = box(3000);
      fit(); paint();
      const before = drawnArea(w.rm);
      begin(); eraseEnt(w.t.id); commit('open it');
      paint();
      return { before, drawn: drawnArea(w.rm), fresh: trueArea(w.rm) };`);
    eq(r.drawn, r.fresh,
      'an unenclosed room reads the same on the plan as in the schedule: ' +
      r.drawn + ' vs ' + r.fresh);
  });

  t('a column dropped into the room changes the drawn area too', () => {
    const r = R(`${ROOM}
      const w = box(3000);
      fit(); paint();
      const before = drawnArea(w.rm);
      begin(); addEnt({t:'column', p:[2000,1500], w:400, d:400, layer:'A-WALL'}); commit('col');
      paint();
      return { before, drawn: drawnArea(w.rm), fresh: trueArea(w.rm) };`);
    eq(r.drawn, r.fresh,
      'canvas ' + r.drawn + ' vs computed ' + r.fresh);
  });

  /* Deferring during a drag is only acceptable because it settles. If it did
     not, this would be the original bug with extra steps. */
  t('a live drag defers the re-trace, and releasing settles it', () => {
    const r = R(`${ROOM}
      const w = box(3000);
      fit(); paint();
      const before = drawnArea(w.rm);
      /* pretend a grip is being dragged */
      ST.dragGrip = { id: w.r.id, k: 'b', p: [4000, 5000] };
      begin();
      mut(w.r); w.r.b = [4000, 5000];
      mut(w.t); w.t.a = [4000, 5000]; w.t.b = [0, 5000];
      mut(w.l); w.l.a = [0, 5000];
      commit('drag');
      paint();
      const during = drawnArea(w.rm);
      ST.dragGrip = null;
      paint();
      const after = drawnArea(w.rm);
      return { before, during, after, fresh: trueArea(w.rm) };`);
    eq(r.during, r.before, 'mid-drag it keeps the outline it had, rather than re-tracing 60 times a second');
    eq(r.after, r.fresh, 'and on release it agrees with the schedule again: ' + r.after);
    ok(/19\.1/.test(r.after), 'having followed the wall, got ' + r.after);
  });

  group('what a typed dimension means');

  /* parseFloat stops at the first thing it does not understand and returns
     what it had. Every one of these was a silent wrong answer. */
  t('arithmetic is evaluated, not truncated', () => {
    const r = R(`${SETUP}
      const out = {};
      for (const s of ['1200+225', '3600/7', '2*450', '(1200+300)/2',
                       '1200-225', '900*2+150', '-(300+100)'])
        out[s] = parseLen(s);
      return out;`);
    close(r['1200+225'], 1425, 1e-9, '1200+225 is 1425, not 1200');
    close(r['3600/7'], 3600 / 7, 1e-6, '3600/7');
    close(r['2*450'], 900, 1e-9, '2*450');
    close(r['(1200+300)/2'], 750, 1e-9, 'parentheses');
    close(r['1200-225'], 975, 1e-9, 'subtraction');
    close(r['900*2+150'], 1950, 1e-9, 'precedence: times before plus');
    close(r['-(300+100)'], -400, 1e-9, 'unary minus on a group');
  });

  t('anything it cannot fully read is refused, not truncated', () => {
    const r = R(`${SETUP}
      const out = {};
      for (const s of ['1200abc', '1200 1200', '1200mmm', '1200.5.5', '1/0',
                       '((1200)', '+', '', 'wall'])
        out[s] = parseLen(s);
      return out;`);
    for (const [k, v] of Object.entries(r)) {
      ok(v === null || (typeof v === 'number' && isNaN(v)),
        JSON.stringify(k) + ' must not come back as a number, got ' + v);
    }
  });

  /* The whole existing grammar has to survive: this is the function every
     length, coordinate and dialog field in the program goes through. */
  t('every form that worked before still works', () => {
    const r = R(`${SETUP}
      const mm = {};
      for (const s of ['1200', '-450', '0', '1200.5', '12,00'])
        mm[s] = parseLen(s);
      const units = {};
      for (const s of ['3m', '30cm', '1200mm', '12in', '4ft', '6\\"', "4'"])
        units[s] = parseLen(s);
      DOC.units = 'ft';
      const imperial = {};
      for (const s of ['4\\'-6\\"', "4' 6\\"", '6 1/2\\"', "4'"])
        imperial[s] = parseLen(s);
      DOC.units = 'mm';
      return { mm, units, imperial };`);
    close(r.mm['1200'], 1200, 1e-9);
    close(r.mm['-450'], -450, 1e-9, 'negative');
    close(r.mm['12,00'], 12.00, 1e-9, 'a comma is a decimal point');
    close(r.units['3m'], 3000, 1e-9, 'metres');
    close(r.units['30cm'], 300, 1e-9, 'centimetres');
    close(r.units['12in'], 304.8, 1e-6, 'inches');
    close(r.units['4ft'], 1219.2, 1e-6, 'feet');
    close(r.imperial["4'-6\""], 1371.6, 1e-6, 'feet and inches');
    close(r.imperial['6 1/2"'], 165.1, 1e-6, 'inches and a fraction');
  });

  t('a unit can be written on each part of a sum', () => {
    const r = R(`${SETUP}
      return { a: parseLen('3m+150'), b: parseLen('2m+30cm'), c: parseLen('1m*3') };`);
    close(r.a, 3150, 1e-6, '3m+150 in a millimetre drawing');
    close(r.b, 2300, 1e-6, '2m+30cm');
    close(r.c, 3000, 1e-6, '1m*3');
  });

  t('it reaches the command line, so a coordinate can be worked out too', () => {
    const r = R(`${SETUP}
      const p = parseCoord('1200+300,450*2', [0,0], [0,0]);
      return { p };`);
    ok(r.p, 'the coordinate parsed');
    close(r.p[0], 1500, 1e-9, 'x');
    close(r.p[1], 900, 1e-9, 'y');
  });
};
