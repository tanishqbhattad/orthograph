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

  group('a hatch pattern somebody else chose');

  /* The reader forced pattern:'line' and threw the name away; the writer
     emitted ANSI31 regardless. So a consultant's drawing came back with its
     brickwork, concrete and insulation all rewritten to the same diagonal
     hatch — we were editing their drawing without being asked. Rendering the
     pattern is a separate job; keeping the name is not optional. */
  t('an imported pattern keeps its name, even one we cannot draw yet', () => {
    const r = R(`${SETUP}
      const NL = String.fromCharCode(10);
      const dxf = ['0','SECTION','2','ENTITIES',
        '0','HATCH','8','0','2','AR-CONC','70','0','71','0',
        '91','1','92','3','72','0','73','1','93','4',
        '10','0','20','0','10','1000','20','0',
        '10','1000','20','1000','10','0','20','1000',
        '97','0','75','0','76','1','52','0','41','1','空','',
        '0','ENDSEC','0','EOF'].filter(x => x !== '空' && x !== '').join(NL);
      importDXF(dxf);
      const h = [...DOC.ents.values()].find(e => e.t === 'hatch');
      return { found: !!h, pattern: h && h.pattern };`);
    eq(r.found, true, 'the hatch imported');
    eq(r.pattern, 'AR-CONC', 'carrying the pattern that was actually in the file');
  });

  t('and writes that name back out, not a substitute', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'hatch', loops:[[[0,0],[1000,0],[1000,1000],[0,1000]]],
              pattern:'AR-CONC', sp:150, hatchAng:0, layer:'0'});
      commit('h');
      const dxf = exportDXF();
      const NL = String.fromCharCode(10);
      const names = dxf.split(NL).map(l => l.trim());
      return { hasName: names.indexOf('AR-CONC') >= 0,
               hasSubstitute: names.indexOf('ANSI31') >= 0 };`);
    eq(r.hasName, true, 'the name we were given is the name we write');
    eq(r.hasSubstitute, false, 'and nothing was swapped in for it');
  });

  t('the round trip is stable, so nobody else’s drawing is rewritten', () => {
    const r = R(`${SETUP}
      begin();
      for (const p of ['AR-CONC', 'AR-BRSTD', 'INSUL', 'line', 'cross'])
        addEnt({t:'hatch', loops:[[[0,0],[1000,0],[1000,1000],[0,1000]]],
                pattern:p, sp:150, hatchAng:0, layer:'0'});
      addEnt({t:'hatch', loops:[[[0,0],[900,0],[900,900],[0,900]]],
              solid:true, pattern:'solid', layer:'0'});
      commit('h');
      const before = [...DOC.ents.values()].filter(e => e.t === 'hatch').map(e => e.pattern);
      const dxf = exportDXF();
      resetDoc();
      importDXF(dxf);
      const after = [...DOC.ents.values()].filter(e => e.t === 'hatch').map(e => e.pattern);
      return { before: before.join(','), after: after.join(',') };`);
    eq(r.after, r.before,
      'every pattern came back as itself: ' + r.after + ' vs ' + r.before);
  });

  t('a solid fill is still a solid fill', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'hatch', loops:[[[0,0],[1000,0],[1000,1000],[0,1000]]],
              solid:true, pattern:'solid', layer:'0'});
      commit('h');
      const dxf = exportDXF();
      resetDoc(); importDXF(dxf);
      const h = [...DOC.ents.values()].find(e => e.t === 'hatch');
      return { solid: h && !!h.solid, pattern: h && h.pattern };`);
    eq(r.solid, true, 'solidity survives');
  });

  /* A HATCH carries an elevation point in group 10/20 BEFORE its boundary
     vertices. The reader sliced the whole point list by the vertex counts
     without accounting for it, so every loop was shifted by one: the
     elevation point became the first vertex and the real last one fell off
     the end. Our own 4x3 metre hatch came back as 6 square metres instead of
     12, on a file we wrote ourselves. */
  t('a hatch keeps its shape and its area through a DXF', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'hatch', loops:[[[0,0],[4000,0],[4000,3000],[0,3000]]],
              pattern:'line', sp:150, hatchAng:0, layer:'0'});
      commit('h');
      const before = { area: Math.round(entArea([...DOC.ents.values()][0])),
                       pts: [...DOC.ents.values()][0].loops[0].length };
      const dxf = exportDXF();
      resetDoc(); importDXF(dxf);
      const h = [...DOC.ents.values()].find(e => e.t === 'hatch');
      return { before, after: { area: Math.round(entArea(h)), pts: h.loops[0].length },
               loop: h.loops[0].map(q => q.map(Math.round)) };`);
    eq(r.before.area, 12000000, 'a 4 by 3 metre hatch is 12 square metres');
    eq(r.after.area, r.before.area,
      'and still is after a round trip, got ' + r.after.area);
    eq(r.after.pts, r.before.pts, 'with the same number of vertices');
    ok(r.loop[0].join(',') !== r.loop[1].join(','),
      'and no duplicated first vertex: ' + JSON.stringify(r.loop));
  });

  t('a hatch with a hole keeps both loops through a DXF', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'hatch', loops:[
        [[0,0],[4000,0],[4000,4000],[0,4000]],
        [[1000,1000],[2000,1000],[2000,2000],[1000,2000]]],
        pattern:'line', sp:150, hatchAng:0, layer:'0'});
      commit('h');
      const before = Math.round(entArea([...DOC.ents.values()][0]));
      const dxf = exportDXF();
      resetDoc(); importDXF(dxf);
      const h = [...DOC.ents.values()].find(e => e.t === 'hatch');
      return { before, after: Math.round(entArea(h)), loops: h.loops.length,
               sizes: h.loops.map(L => L.length) };`);
    eq(r.loops, 2, 'both loops came back');
    eq(r.sizes.join(','), '4,4', 'with four vertices each');
    eq(r.after, r.before, '16 square metres less the 1, got ' + r.after / 1e6);
  });

  /* Our own files put the outer loop first. A file from anywhere else need
     not, and subtracting in file order then gives a negative area. */
  t('the outer loop is found by size, not by being first in the file', () => {
    const r = R(`${SETUP}
      begin();
      const a = addEnt({t:'hatch', loops:[
        [[0,0],[4000,0],[4000,4000],[0,4000]],
        [[1000,1000],[2000,1000],[2000,2000],[1000,2000]]], pattern:'line', layer:'0'});
      /* the same thing with the loops the other way round */
      const b = addEnt({t:'hatch', loops:[
        [[1000,1000],[2000,1000],[2000,2000],[1000,2000]],
        [[0,0],[4000,0],[4000,4000],[0,4000]]], pattern:'line', layer:'0'});
      commit('h');
      return { outerFirst: Math.round(entArea(a)), holeFirst: Math.round(entArea(b)) };`);
    eq(r.outerFirst, 15000000, '16 square metres less 1');
    eq(r.holeFirst, r.outerFirst,
      'and the same when the file lists the hole first, got ' + r.holeFirst);
  });

  /* An old-style POLYLINE carries its bulge on each VERTEX entity. */
  t('an old-style POLYLINE keeps its bulges too', () => {
    const r = R(`${SETUP}
      const NL = String.fromCharCode(10);
      const dxf = ['0','SECTION','2','ENTITIES',
        '0','POLYLINE','8','0','66','1','70','0',
        '0','VERTEX','8','0','10','0','20','0',
        '0','VERTEX','8','0','10','1000','20','0','42','0.5',
        '0','VERTEX','8','0','10','1000','20','1000',
        '0','SEQEND',
        '0','ENDSEC','0','EOF'].join(NL);
      importDXF(dxf);
      const e = [...DOC.ents.values()].find(x => x.t === 'pline');
      return { found: !!e, bulges: e && e.bulges, curved: e && hasBulge(e) };`);
    eq(r.found, true, 'the polyline imported');
    eq(r.curved, true, 'and it curves: ' + JSON.stringify(r.bulges));
    close(r.bulges[1], 0.5, 1e-9, 'with the bulge on the middle vertex');
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

  group('a schedule that is out of date is worse than no schedule');

  /* SCHEDULEUPDATE filtered kind === 'rooms', so a door or window schedule
     placed on a drawing was never refreshed by anything. Draw one more door
     and the table on the sheet is silently wrong — which is the exact failure
     a schedule exists to prevent. */
  const SCH = `
    resetDoc(); ensureLayer('A-WALL');
    const plan = () => { begin();
      const w = addEnt({t:'wall', a:[0,0], b:[16000,0], wt:'cav300', layer:'A-WALL'});
      addEnt({t:'door', host:w.id, pos:2000, dt:'sgl900', layer:'A-DOOR'});
      addEnt({t:'window', host:w.id, pos:6000, w:1200, h:1200, sill:900, layer:'A-GLAZ'});
      addEnt({t:'room', pts:[[0,0],[8000,0],[8000,6000],[0,6000]], name:'HALL', layer:'A-AREA'});
      commit('p'); markOpenings('door'); markOpenings('window'); return w; };
    const place = (cmd) => { cancelCmd(); startCmd(cmd); cmdPoint([20000, 6000]); endCmd(true); };
    const rowsOf = (kind) => { const t = [...DOC.ents.values()].find(e => e.t === 'table' && e.kind === kind);
      return t ? t.rows.length : 0; };
  `;

  t('every schedule refreshes, not only the room one', () => {
    const r = R(`${SCH}
      const w = plan();
      place('doorschedule'); place('windowschedule'); place('schedule');
      const before = { doors: rowsOf('doors'), windows: rowsOf('windows'), rooms: rowsOf('rooms') };
      begin();
      addEnt({t:'door', host:w.id, pos:10000, dt:'dbl1500', layer:'A-DOOR'});
      addEnt({t:'window', host:w.id, pos:13000, w:1800, h:1500, sill:750, layer:'A-GLAZ'});
      addEnt({t:'room', pts:[[9000,0],[16000,0],[16000,6000],[9000,6000]], name:'STORE', layer:'A-AREA'});
      commit('more');
      markOpenings('door'); markOpenings('window');
      scheduleUpdate();
      return { before, after: { doors: rowsOf('doors'), windows: rowsOf('windows'), rooms: rowsOf('rooms') } };`);
    eq(r.before.doors, 2, 'one door to start');
    eq(r.after.doors, 3, 'and two after, got ' + r.after.doors);
    eq(r.after.windows, 3, 'the window schedule too, got ' + r.after.windows);
    ok(r.after.rooms > r.before.rooms, 'and the room one still works');
  });

  t('it says what it did rather than refusing when only doors are placed', () => {
    const r = R(`${SCH}
      plan();
      place('doorschedule');
      const said = [];
      const real = cliPrint, realEcho = echo;
      globalThis.cliPrint = m => said.push(String(m));
      globalThis.echo = m => said.push(String(m));
      scheduleUpdate();
      globalThis.cliPrint = real; globalThis.echo = realEcho;
      return { said: said.join(' | ') };`);
    ok(!/No room schedule/.test(r.said),
      'it does not claim there is no schedule when there is one: ' + r.said);
    ok(/1 schedule|Updated/.test(r.said), 'it reports what it updated: ' + r.said);
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
