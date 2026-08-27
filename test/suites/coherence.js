'use strict';
/* ============================================================
   Phase 5 — coherence

   Eleven features were added between the last review and this
   one, each of them correct on its own. This suite is about
   whether they agree with each other and with the parts of the
   program that were already here.

   It sweeps rather than lists: a new entity type is covered the
   moment it is added, so the next one cannot be quietly left out
   of the exporter the way mtext, leader and attdef were.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL'); ensureLayer('A-SECT'); ensureLayer('A-FLOR');
  DOC.blocks.T = { base:[0,0], ents:[{t:'line', a:[0,0], b:[100,0], layer:'0'}] };
  const RING = [[0,0],[3000,0],[3000,2000],[0,2000]];
  /* one of everything this program can draw */
  const SAMPLES = {
    line:   {t:'line', a:[0,0], b:[1000,0]},
    pline:  {t:'pline', pts:RING, closed:true},
    circle: {t:'circle', c:[0,0], r:500},
    arc:    {t:'arc', c:[0,0], r:500, a0:0, a1:1.5},
    ellipse:{t:'ellipse', c:[0,0], rx:600, ry:300, rot:0},
    text:   {t:'text', s:'ZQXJ', p:[0,0], h:200, rot:0, anchor:'l'},
    mtext:  {t:'mtext', s:'ZQXJ here', p:[0,0], h:200, w:1000, rot:0, anchor:'l'},
    leader: {t:'leader', pts:[[0,0],[500,500]], s:'ZQXJ', h:200},
    attdef: {t:'attdef', p:[0,0], tag:'ZQXJ', val:'', h:200, rot:0, anchor:'l'},
    dim:    {t:'dim', k:'horizontal', p1:[0,0], p2:[1000,0], off:300},
    hatch:  {t:'hatch', loops:[RING], solid:true, pattern:'solid'},
    table:  {t:'table', p:[0,0], h:200, rows:[['ZQXJ','b']], colW:[600,600]},
    wall:   {t:'wall', a:[0,0], b:[3000,0], wt:'cav300'},
    room:   {t:'room', pts:RING, name:'ZQXJ'},
    floor:  {t:'floor', pts:RING, th:200, top:0},
    roof:   {t:'roof', pts:RING, th:250, top:3000, pitch:0.4, dir:0, eaves:[0,0]},
    section:{t:'section', a:[0,0], b:[3000,0], dir:1, label:'A'},
    insert: {t:'insert', name:'T', p:[0,0], rot:0, sx:1, sy:1},
    column: {t:'column', p:[0,0], w:300, d:300},
    grid:   {t:'grid', a:[0,0], b:[3000,0], label:'1'},
  };
  const fresh = () => { resetDoc();
    ensureLayer('A-WALL'); ensureLayer('A-SECT'); ensureLayer('A-FLOR');
    DOC.blocks.T = { base:[0,0], ents:[{t:'line', a:[0,0], b:[100,0], layer:'0'}] }; };
  const make = (spec) => { begin(); const e = addEnt(Object.assign({layer:'0'}, spec));
    commit('x'); return e; };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('every entity type is a complete citizen');

  t('each one has a box, a distance, geometry and a transform', () => {
    const r = R(`${SETUP}
      const bad = [];
      for (const [k, spec] of Object.entries(SAMPLES)) {
        fresh();
        let e; try { e = make(spec); } catch (err) { bad.push(k + ': add ' + err.message); continue; }
        try { const b = bbox(e);
          if (!isFinite(b[0]) || !isFinite(b[2])) bad.push(k + ': bbox not finite');
        } catch (err) { bad.push(k + ': bbox threw'); }
        try { if (!isFinite(entDist([50, 50], e))) bad.push(k + ': dist not finite'); }
        catch (err) { bad.push(k + ': dist threw'); }
        try { const c = clone(e); xf(c, T.move([10, 10])); }
        catch (err) { bad.push(k + ': xf threw'); }
        try { gripsOf(e); } catch (err) { bad.push(k + ': grips threw'); }
      }
      return { bad, n: Object.keys(SAMPLES).length };`);
    ok(r.n >= 18, 'the sweep covers the drawing types, got ' + r.n);
    eq(r.bad.length, 0, r.bad.join('; '));
  });

  /* shapes() is the road every exporter, EXPLODE and the DXF writer travel.
     A type that answers empty there is invisible to all of them at once —
     which is exactly what happened to mtext, leader and attdef. */
  t('nothing that draws something answers empty to shapes()', () => {
    const r = R(`${SETUP}
      const empty = [];
      for (const [k, spec] of Object.entries(SAMPLES)) {
        fresh();
        const e = make(spec);
        let sh = [];
        try { sh = shapes(e, 32) || []; } catch (err) { empty.push(k + ' (threw)'); continue; }
        if (!sh.length) empty.push(k);
      }
      return { empty };`);
    eq(r.empty.length, 0, 'these produce no geometry at all: ' + r.empty.join(', '));
  });

  t('every type survives being saved and loaded', () => {
    const r = R(`${SETUP}
      const bad = [];
      for (const [k, spec] of Object.entries(SAMPLES)) {
        fresh();
        make(spec);
        const n0 = DOC.ents.size;
        let txt; try { txt = saveNative(); } catch (err) { bad.push(k + ': save threw'); continue; }
        try { loadNative(txt); } catch (err) { bad.push(k + ': load threw'); continue; }
        if (DOC.ents.size !== n0) bad.push(k + ': ' + n0 + ' out, ' + DOC.ents.size + ' back');
        const back = [...DOC.ents.values()].find(x => x.t === spec.t);
        if (!back) bad.push(k + ': came back as something else');
      }
      return { bad };`);
    eq(r.bad.length, 0, r.bad.join('; '));
  });

  group('what is drawn is what is exported');

  /* A drawing sent to a consultant that silently arrives without its
     paragraphs, leader notes and attributes is worse than one that fails to
     export at all, because nobody is told. */
  t('every type reaches the DXF, not only the ones the writer knows', () => {
    const r = R(`${SETUP}
      const missing = [];
      for (const [k, spec] of Object.entries(SAMPLES)) {
        fresh();
        make(spec);
        let dxf = '';
        try { dxf = exportDXF(); } catch (err) { missing.push(k + ' (threw)'); continue; }
        /* a marker the type carries, or any geometry record at all */
        const hasMark = /ZQXJ/.test(dxf);
        const hasGeom = /\\bLINE\\b|LWPOLYLINE|POLYLINE|CIRCLE|ARC|TEXT|HATCH|INSERT/.test(dxf);
        if (!(hasMark || hasGeom)) missing.push(k);
      }
      return { missing };`);
    eq(r.missing.length, 0, 'dropped from the DXF: ' + r.missing.join(', '));
  });

  t('a type carrying text puts that text in the file', () => {
    const r = R(`${SETUP}
      const lost = [];
      for (const k of ['text', 'mtext', 'leader', 'attdef', 'table', 'room']) {
        fresh();
        make(SAMPLES[k]);
        const dxf = exportDXF();
        const svg = exportSVG();
        if (!/ZQXJ/.test(dxf)) lost.push(k + ' (dxf)');
        if (!/ZQXJ/.test(svg)) lost.push(k + ' (svg)');
      }
      return { lost };`);
    eq(r.lost.length, 0, 'the words vanished from: ' + r.lost.join(', '));
  });

  group('one rule, one answer');

  /* Duplicated rules drift. Both of these have already drifted once: fvis
     missed freeze when B6 added it, then missed levels when C3 did. */
  t('the draw path and visible() never disagree', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'wall', a:[0,0], b:[3000,0], wt:'gen100', layer:'A-WALL'});
      addEnt({t:'line', a:[0,500], b:[3000,500], layer:'0'});
      commit('x');
      gotoLevel(1);
      begin(); addEnt({t:'line', a:[0,900], b:[3000,900], layer:'0'}); commit('up');
      const bad = [];
      for (const on of [true, false]) for (const frozen of [true, false])
        for (const lvl of [0, 1]) for (const under of [0, 1]) {
          for (const l of DOC.layers) { l.on = on; l.frozen = frozen; }
          DOC.curLevel = lvl; VS.underlay = under;
          frameLayers();
          for (const e of DOC.ents.values())
            if (visible(e) !== fvis(e))
              bad.push('on=' + on + ' frozen=' + frozen + ' lvl=' + lvl + ' under=' + under);
        }
      VS.underlay = 0;
      return { bad: [...new Set(bad)] };`);
    eq(r.bad.length, 0, 'they disagreed under: ' + r.bad.slice(0, 4).join('; '));
  });

  t('a section cuts the building, whatever the plan is showing', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'wall', a:[0,-2000], b:[0,2000], wt:'cav300', lvl:0, layer:'A-WALL'});
      addEnt({t:'wall', a:[3000,-2000], b:[3000,2000], wt:'cav300', lvl:1, layer:'A-WALL'});
      const s = addEnt({t:'section', a:[-1000,0], b:[5000,0], dir:1, label:'A', layer:'A-SECT'});
      commit('x');
      const seen = [];
      for (const lvl of [0, 1]) { DOC.curLevel = lvl; seen.push(sectionGeometry(s).cuts); }
      return { seen };`);
    eq(r.seen.join(','), '2,2',
      'both storeys are cut from either plan, got ' + r.seen.join(','));
  });

  group('the document carries what it is made of');

  /* Everything added to DOC since Wave 1 has to survive a save, or a feature
     works until the file is reopened. */
  t('the document-level tables all round-trip', () => {
    const r = R(`${SETUP}
      /* set one of each thing a feature added to DOC */
      DOC.dimStyles.push({ name: 'Detail', txt: 5 });
      DOC.curDim = 'Detail';
      saveLayerState('Structure');
      addLevel('Upper');
      DOC.sheets.push(newSheet('A-101', 'A3', true));
      DOC.curSheet = DOC.sheets[0].id;
      const before = {
        dimStyles: DOC.dimStyles.length, curDim: DOC.curDim,
        layerStates: (DOC.layerStates || []).length,
        levels: DOC.levels.length, levelUid: DOC.levelUid,
        sheets: DOC.sheets.length, curSheet: DOC.curSheet,
      };
      const txt = saveNative();
      resetDoc();
      loadNative(txt);
      const after = {
        dimStyles: dimStyles().length, curDim: DOC.curDim,
        layerStates: (DOC.layerStates || []).length,
        levels: DOC.levels.length, levelUid: DOC.levelUid,
        sheets: DOC.sheets.length, curSheet: DOC.curSheet,
      };
      const bad = Object.keys(before).filter(k => String(before[k]) !== String(after[k]))
        .map(k => k + ': ' + before[k] + ' -> ' + after[k]);
      return { bad, before, after };`);
    eq(r.bad.length, 0, 'lost on the round trip: ' + r.bad.join('; '));
  });

  group('nothing is built and left unreachable');

  /* A feature nobody can switch on is not a feature. All four of these were
     read by the code and settable by nobody: they lived in VS and were never
     registered, so typing their names did nothing. UNDERLAY was the worst —
     the storey-below view was built, drawn and tested, and there was no way
     for a person to turn it on. */
  t('every system variable the code reads can be typed', () => {
    const r = R(`${SETUP}
      /* the flags the newer features answer to */
      const names = ['MIRRTEXT', 'TRIMMODE', 'UNDERLAY', 'TAGS'];
      const bad = [];
      for (const n of names) {
        const w = resolveWord(n);
        if (!w || w.kind !== 'var') { bad.push(n + ': unreachable'); continue; }
        cancelCmd();
        dispatch(n + ' 1'); const on = VS[n.toLowerCase()];
        dispatch(n + ' 0'); const off = VS[n.toLowerCase()];
        if (!on || off) bad.push(n + ': set to ' + on + ' then ' + off);
      }
      return { bad, n: names.length };`);
    eq(r.bad.length, 0, r.bad.join('; '));
    eq(r.n, 4);
  });

  /* Typing a command's name is the one way in that always exists. A command
     that cannot be resolved is one nobody can run however it is spelled. */
  t('every command added since Wave 1 answers to its name', () => {
    const r = R(`${SETUP}
      const added = ['layout','mview','vpscale','pagesetup','plot','pspace','mspace',
        'layoff','layfrz','laymcur','layon','laythw','layiso','layuniso','layerstate',
        'dimstyle','dimbase','schedule','scheduleupdate','attdef','eattedit',
        'section','sectioncut','sectionflip','floor','roof',
        'markdoors','markwindows','doorschedule','windowschedule',
        'level','levelup','leveldown'];
      return { added: added.length, unreachable: added.filter(n => !resolveWord(n)) };`);
    ok(r.added > 30, 'the sweep covers what was added, got ' + r.added);
    eq(r.unreachable.length, 0, 'cannot be typed: ' + r.unreachable.join(', '));
  });

  /* Typing a name is the way in that always exists; the rail is the way in
     you find without being told one. Something a person DRAWS belongs there —
     floor, roof and the section pair were reachable only by knowing the word. */
  t('everything a person draws is findable in the rail', () => {
    const r = R(`${SETUP}
      const inRail = new Set();
      for (const mode of Object.keys(RAILS))
        for (const [, tools] of RAILS[mode])
          for (const [k] of tools) inRail.add(k);
      const drawing = ['line','pline','circle','arc','text','mtext','leader','dim',
                       'hatch','table','attdef','wall','door','window','column','stair',
                       'room','grid','floor','roof','section','sectioncut','schedule'];
      return { railSize: inRail.size, missing: drawing.filter(k => !inRail.has(k)) };`);
    ok(r.railSize > 50, 'the rail is populated, got ' + r.railSize);
    eq(r.missing.length, 0, 'reachable only by typing: ' + r.missing.join(', '));
  });

  /* A tool button with no icon is a blank square: it exists, it works, and
     nobody can tell what it is. */
  t('no tool button renders empty', () => {
    const r = R(`${SETUP}
      const blank = [];
      const was = MODE;
      for (const mode of Object.keys(RAILS)) {
        MODE = mode; buildRail();
        for (const b of document.querySelectorAll('.tool')) {
          const html = b.innerHTML || '';
          if (!/<(path|rect|circle|ellipse|line|polygon|polyline)/.test(html))
            blank.push(mode + ':' + b.dataset.tool);
        }
      }
      MODE = was; buildRail();
      return { blank };`);
    eq(r.blank.length, 0, 'blank buttons: ' + r.blank.join(', '));
  });
};
