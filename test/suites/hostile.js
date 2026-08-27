'use strict';
/* ============================================================
   Hostile input

   Three faults found by probing rather than by using the program
   normally, which is how they survived this long.

   The serious one: opening a corrupt file destroyed the drawing
   that was already open. Not "failed to open" — the current
   document was half-replaced on the way to throwing, so the work
   on screen was gone AND the program could no longer paint a
   frame. That is the exact failure this project already refuses
   to accept from a corrupt autosave.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
  const realDrawing = () => { begin();
    for (let i = 0; i < 5; i++)
      addEnt({t:'wall', a:[i*1000,0], b:[i*1000+800,0], wt:'cav300', layer:'A-WALL'});
    addEnt({t:'text', p:[0,900], s:'MY DRAWING', h:250, rot:0, anchor:'l', layer:'0'});
    commit('w'); DOC.name = 'important.ocad'; };
`;
/* every shape of broken file worth surviving */
const BAD = [
  ['empty', '""'],
  ['not json', "'not json at all'"],
  ['null', "'null'"],
  ['a bare array', "'[]'"],
  ['ents not an array', '\'{"ents":null}\''],
  ['an entity missing its geometry', '\'{"ents":[{"t":"wall"}]}\''],
  ['numbers where entities go', '\'{"ents":[1,2,3]}\''],
  ['layers not an array', '\'{"layers":"not an array","ents":[]}\''],
  ['an insert of a block that is not there', '\'{"ents":[{"t":"insert","name":"MISSING","p":[0,0]}]}\''],
  ['coordinates that are not numbers', '\'{"ents":[{"t":"line","a":["x","y"],"b":[1,2]}]}\''],
];
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('opening a file that is not a drawing');

  t('never destroys the drawing already open', () => {
    const cases = BAD.map(([name, lit]) => {
      const r = R(`${SETUP}
        realDrawing();
        const before = { ents: DOC.ents.size, layers: DOC.layers.length, name: DOC.name };
        let threw = null, took = null;
        try { took = loadNative(${lit}); } catch (e) { threw = e.message; }
        let painted = 'ok';
        try { paint(); } catch (e) { painted = 'THREW ' + e.message; }
        return { before, took, threw,
                 after: { ents: DOC.ents.size,
                          layers: Array.isArray(DOC.layers) ? DOC.layers.length : 'BROKEN',
                          name: DOC.name },
                 painted };`);
      return { name, r };
    });
    const lost = cases.filter(c => c.r.after.ents !== c.r.before.ents ||
                                   c.r.after.layers !== c.r.before.layers);
    const broke = cases.filter(c => c.r.painted !== 'ok');
    eq(lost.length, 0, 'these took the drawing with them: ' +
      lost.map(c => c.name + ' (' + c.r.before.ents + '→' + c.r.after.ents + ' objects)').join('; '));
    eq(broke.length, 0, 'and these left it unable to draw a frame: ' +
      broke.map(c => c.name).join('; '));
  });

  t('says no rather than throwing into whatever called it', () => {
    const cases = BAD.map(([name, lit]) => {
      const r = R(`${SETUP}
        realDrawing();
        let threw = null, took = null;
        try { took = loadNative(${lit}); } catch (e) { threw = e.message; }
        return { took, threw };`);
      return { name, r };
    });
    const threw = cases.filter(c => c.r.threw);
    eq(threw.length, 0, 'these threw: ' + threw.map(c => c.name + ' — ' + c.r.threw).join('; '));
    const claimed = cases.filter(c => c.r.took === true);
    eq(claimed.length, 0,
      'and none of them claimed to have loaded: ' + claimed.map(c => c.name).join('; '));
  });

  /* The good path has to keep working, or the guard is just a wall. */
  t('a real file still opens, with everything in it', () => {
    const r = R(`${SETUP}
      realDrawing();
      const saved = saveNative();
      const before = DOC.ents.size;
      resetDoc();
      const took = loadNative(saved);
      return { took, before, after: DOC.ents.size,
               walls: [...DOC.ents.values()].filter(e => e.t === 'wall').length,
               text: [...DOC.ents.values()].filter(e => e.t === 'text').length };`);
    ok(r.took !== false, 'it loaded');
    eq(r.after, r.before, 'with every object');
    eq(r.walls, 5, 'the walls');
    eq(r.text, 1, 'and the note');
  });

  t('a file with one broken object in it is refused whole, not half-applied', () => {
    const r = R(`${SETUP}
      realDrawing();
      const good = JSON.parse(saveNative());
      good.ents.push({ t: 'wall' });                 /* no a, no b */
      const before = DOC.ents.size;
      let threw = null;
      try { loadNative(JSON.stringify(good)); } catch (e) { threw = e.message; }
      let painted = 'ok';
      try { paint(); } catch (e) { painted = 'THREW ' + e.message; }
      return { before, after: DOC.ents.size, threw, painted };`);
    eq(r.threw, null, 'no throw');
    eq(r.after, r.before, 'the drawing on screen is untouched, not partly overwritten');
    eq(r.painted, 'ok', 'and still draws');
  });

  /* An object of a type this build does not know is most likely a file from a
     later one. Dropping it loses it on the next save; keeping it quietly shows
     a drawing with content missing and no sign of that. */
  t('an object of an unknown type is kept and reported, not dropped in silence', () => {
    const r = R(`${SETUP}
      realDrawing();
      const good = JSON.parse(saveNative());
      good.ents.push({ t:'from_the_future', a:[0,0], b:[1000,1000], layer:'0' });
      const said = [];
      const real = cliPrint;
      globalThis.cliPrint = (m) => { said.push(String(m)); };
      const took = loadNative(JSON.stringify(good));
      globalThis.cliPrint = real;
      const kept = [...DOC.ents.values()].filter(e => e.t === 'from_the_future');
      /* and it survives being saved again, rather than being lost on the way out */
      const again = JSON.parse(saveNative()).ents.filter(e => e.t === 'from_the_future');
      let painted = 'ok';
      try { paint(); } catch (e) { painted = 'THREW ' + e.message; }
      return { took, kept: kept.length, again: again.length,
               told: said.filter(m => /does not know/.test(m)).length,
               msg: said.join(' | '), painted };`);
    ok(r.took !== false, 'the file opens');
    eq(r.kept, 1, 'the object is kept');
    eq(r.again, 1, 'and survives being saved again, rather than being lost on the way out');
    eq(r.told, 1, 'and the person is told: ' + r.msg);
    eq(r.painted, 'ok', 'while the drawing still paints');
  });

  group('degenerate objects');

  /* Found by adding one of everything at zero size. A polyline of one point is
     what a polyline looks like halfway through being drawn. */
  t('nothing throws when measured, drawn or bounded at zero size', () => {
    const r = R(`${SETUP}
      const specs = [
        {t:'line', a:[0,0], b:[0,0]},
        {t:'circle', c:[0,0], r:0},
        {t:'arc', c:[0,0], r:100, a0:1, a1:1},
        {t:'pline', pts:[], closed:true},
        {t:'pline', pts:[[0,0]], closed:true},
        {t:'spline', pts:[[0,0]], closed:false},
        {t:'ellipse', c:[0,0], rx:0, ry:0, rot:0, a0:0, a1:Math.PI*2},
        {t:'wall', a:[0,0], b:[0,0], wt:'gen100'},
        {t:'room', pts:[[0,0],[1,0]]},
        {t:'floor', pts:[[0,0],[1,0]], th:200},
        {t:'stair', a:[0,0], b:[0,0], w:1000, kind:'straight'},
        {t:'stair', a:[0,0], b:[4000,0], w:0, kind:'U'},
        {t:'column', p:[0,0], w:0, d:0},
        {t:'hatch', loops:[[]], pattern:'line', sp:0},
        {t:'text', p:[0,0], s:'x', h:0, rot:0, anchor:'l'},
        {t:'dim', k:'horizontal', p1:[0,0], p2:[0,0], off:0},
        {t:'dim', k:'angular', p3:[0,0], p1:[0,0], p2:[0,0], off:0},
        {t:'dim', k:'arclen', p3:[0,0], p1:[0,0], p2:[0,0], off:0},
        {t:'dim', k:'ordinate', p1:[0,0], p2:[0,0]},
        {t:'insert', name:'NOT_A_BLOCK', p:[0,0], rot:0, sx:1, sy:1},
      ];
      const bad = [];
      for (const spec of specs) {
        let e;
        try { begin(); e = addEnt(Object.assign({layer:'A-WALL'}, spec)); commit('d'); }
        catch (err) { bad.push(spec.t + ' add: ' + err.message); continue; }
        const label = spec.t + (spec.k ? '/' + spec.k : '');
        try { shapes(e, 32); } catch (err) { bad.push(label + ' shapes: ' + err.message); }
        try { bbox(e); } catch (err) { bad.push(label + ' bbox: ' + err.message); }
        try { entDist([10,10], e); } catch (err) { bad.push(label + ' dist: ' + err.message); }
        try { entArea(e); entLength(e); } catch (err) { bad.push(label + ' measure: ' + err.message); }
        try { gripsOf(e); } catch (err) { bad.push(label + ' grips: ' + err.message); }
      }
      let painted = 'ok';
      try { paint(); } catch (err) { painted = 'THREW ' + err.message; }
      let exported = 'ok';
      try { exportDXF(); exportSVG(); } catch (err) { exported = 'THREW ' + err.message; }
      return { bad, painted, exported, n: DOC.ents.size };`);
    eq(r.bad.length, 0, 'these threw: ' + r.bad.join(' | '));
    eq(r.painted, 'ok', 'the drawing still paints');
    eq(r.exported, 'ok', 'and still exports');
  });

  group('sizes that are not sizes');

  /* A negative thickness draws as though it were positive, so it looks right
     and every measurement taken from it is wrong. */
  t('a negative wall thickness is not treated as a thickness', () => {
    const r = R(`${SETUP}
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[5000,0], th:-300, wt:'gen100', layer:'A-WALL'});
      commit('w');
      return { t: wallT(w), area: Math.round(Math.abs(polyArea(wallOutline(w)))) };`);
    ok(r.t > 0, 'the thickness is positive, got ' + r.t);
    ok(r.area > 0, 'and it encloses a real area, got ' + r.area);
  });

  t('a negative slab or text size does not come back as one', () => {
    const r = R(`${SETUP}
      begin();
      const f = addEnt({t:'floor', pts:[[0,0],[9000,0],[9000,9000],[0,9000]], th:-100, layer:'A-WALL'});
      const tx = addEnt({t:'text', p:[0,0], s:'A', h:-250, rot:0, anchor:'l', layer:'0'});
      commit('d');
      const sh = shapes(tx, 32).find(s => s.text != null);
      return { slab: slabThick(f), text: sh && sh.h };`);
    ok(r.slab > 0, 'a slab has a positive thickness, got ' + r.slab);
    ok(r.text > 0, 'and text a positive height, got ' + r.text);
  });
};
