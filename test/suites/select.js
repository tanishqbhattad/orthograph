'use strict';
/* Selection and grip editing.
   These are the parts of a CAD program that are pure interaction, so the
   tests go after the two things that interaction hides: the inclusion rule
   (fully enclosed vs merely touched) and the exact geometry an edit leaves
   behind. Counts are asserted only where a count is the point; everything
   that moves is asserted as coordinates. */

module.exports = ({ group, t, ok, eq, close, run, R, bootApp }) => {
  bootApp();

  /* Every test starts from the same board. Suites share one sandbox, so the
     view has to be pinned too: half of what is under test is a screen
     gesture, and a stray zoom from another suite would change the answer. */
  const SETUP = `
    resetDoc();
    DOC.units = 'mm'; DOC.gridStep = 100; DOC.snapStep = 100; DOC.textH = 200;
    V.w = 1200; V.h = 800; V.z = 0.1; V.px = 600; V.py = 400; V.rot = 0;
    ST.pickBox = 8; ST.gripSize = 5; ST.gripsOn = 1; ST.gripObjLimit = 100;
    ST.selCycling = 2; ST.lassoOn = 1; ST.selMode = 'add'; ST.band = null;
    ST.bandPreview = null; ST.cycleList = null; ST.cycleIdx = 0;
    ST.gripHot = []; ST.gripHover = null; ST.gripMenu = null; ST.cur = null;
    ST.ortho = false; ST.polar = false; ST.osnap = false; ST.snapgrid = false;
    SEL.clear(); SELHIST.length = 0; SELPREV.length = 0;
    endCmd(true); HIST.past.length = 0; HIST.future.length = 0;
    hideCycleList(); hideGripMenu(); hideQuickProps(); QPmuted = null;
  `;
  const S = code => R(SETUP + code);

  /* a dragged rectangle, given in WORLD points, driven through the real
     gesture: bandBegin/bandMove/bandCommit take screen pixels, which is the
     whole point — the sense of the drag is a screen fact, not a world one */
  const DRAG = `
    function dragBox(wa, wb, opts) {
      const a = w2s(wa), b = w2s(wb);
      bandBegin([a[0], a[1]], (opts && opts.kind) || 'rect', opts && opts.sense);
      if (opts && opts.live) ST.band.live = true;
      bandMove([b[0], b[1]]);
      return bandCommit(opts && opts.remove);
    }
    const ids = () => [...SEL].sort((x, y) => x - y);
  `;

  /* ------------------------------------------------------------------ */
  group('selection — window and crossing');

  t('a window takes only what is completely inside it', () => {
    const r = S(DRAG + `
      const inside  = addEnt({t:'line', a:[0,0],    b:[1000,0],  layer:'0'});
      const astride = addEnt({t:'line', a:[900,0],  b:[3000,0],  layer:'0'});
      const outside = addEnt({t:'line', a:[4000,0], b:[5000,0],  layer:'0'});
      const n = dragBox([-500,-500], [2000,500]);       /* left -> right */
      return {n, sel: ids(), inside: inside.id, astride: astride.id, outside: outside.id};`);
    eq(r.n, 1, 'a window should have found exactly one object');
    eq(JSON.stringify(r.sel), JSON.stringify([r.inside]),
      'a window must reject the line that pokes out of it');
  });

  t('a crossing takes anything it touches', () => {
    const r = S(DRAG + `
      const inside  = addEnt({t:'line', a:[0,0],    b:[1000,0], layer:'0'});
      const astride = addEnt({t:'line', a:[900,0],  b:[3000,0], layer:'0'});
      const outside = addEnt({t:'line', a:[4000,0], b:[5000,0], layer:'0'});
      const n = dragBox([2000,500], [-500,-500]);       /* right -> left */
      return {n, sel: ids(), inside: inside.id, astride: astride.id, outside: outside.id};`);
    eq(r.n, 2, 'a crossing should have found the enclosed line and the one it clips');
    eq(JSON.stringify(r.sel), JSON.stringify([r.inside, r.astride].sort((a, b) => a - b)));
  });

  t('the sense of the drag is decided on screen, not in the world', () => {
    const r = S(DRAG + `
      addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      const a = w2s([-500,-500]), b = w2s([2000,500]);
      bandBegin([a[0], a[1]], 'rect'); bandMove([b[0], b[1]]);
      const ltr = ST.band.sense;
      bandCancel();
      bandBegin([b[0], b[1]], 'rect'); bandMove([a[0], a[1]]);
      const rtl = ST.band.sense;
      bandCancel();
      return {ltr, rtl};`);
    eq(r.ltr, 'window', 'left to right is a window');
    eq(r.rtl, 'crossing', 'right to left is a crossing');
  });

  t('a crossing catches an object that swallows the whole box', () => {
    const r = S(DRAG + `
      const big = addEnt({t:'pline', pts:[[-5000,-5000],[5000,-5000],[5000,5000],[-5000,5000]], closed:true, layer:'0'});
      const n = dragBox([200,200], [-200,-200]);     /* right -> left, deep inside */
      return {n, sel: ids(), big: big.id};`);
    eq(r.n, 1, 'a crossing drawn inside a closed shape still selects it');
    eq(r.sel[0], r.big);
  });

  /* ------------------------------------------------------------------ */
  group('selection — with the view rotated');

  /* This codebase has already shipped a bug where a band selected things that
     were visibly outside it once the view was rotated: the gesture was judged
     in world coordinates, so the axis-aligned world box and the rotated
     screen box stopped agreeing. Both rules are re-asserted under rotation. */

  t('a rotated window still takes only what is inside the drawn box', () => {
    const r = S(DRAG + `
      V.rot = rad(30);
      const inside  = addEnt({t:'line', a:[0,0],    b:[600,0],  layer:'0'});
      const astride = addEnt({t:'line', a:[500,0],  b:[3000,0], layer:'0'});
      const n = dragBox([-400,-400], [1400,400]);
      return {n, sel: ids(), inside: inside.id, astride: astride.id};`);
    eq(r.n, 1, 'rotated window found ' + r.n);
    eq(r.sel[0], r.inside, 'the rotated window must still reject the line poking out');
  });

  t('a rotated band never reaches outside the box it drew', () => {
    /* the classic failure: an object sitting in the world-space bounding box
       of the rotated screen rectangle, but not inside the rectangle itself */
    const r = S(DRAG + `
      V.rot = rad(30);
      const corner = addEnt({t:'point', p:[0,0], layer:'0'});
      /* screen-space box, then a point placed just outside one of its corners
         but well within its world-space AABB */
      const a = [300, 300], b = [700, 500];
      const P = [s2w(a[0],a[1]), s2w(b[0],a[1]), s2w(b[0],b[1]), s2w(a[0],b[1])];
      const xs = P.map(q=>q[0]), ys = P.map(q=>q[1]);
      const cornerPt = [Math.min(...xs) + 1, Math.min(...ys) + 1];  /* in the AABB */
      const stray = addEnt({t:'point', p: cornerPt, layer:'0'});
      const strayInside = pointInPoly(cornerPt, P);
      SEL.clear();
      bandBegin(a, 'rect'); bandMove(b);
      const n = bandCommit();
      return {n, sel: ids(), stray: stray.id, corner: corner.id, strayInside};`);
    eq(r.strayInside, false, 'the probe point must lie outside the drawn box (test setup)');
    ok(!r.sel.includes(r.stray),
      'the band picked a point that was outside the box it drew — the rotation bug is back');
  });

  t('a rotated crossing still catches what it clips', () => {
    const r = S(DRAG + `
      V.rot = rad(-42);
      const astride = addEnt({t:'line', a:[500,0], b:[3000,0], layer:'0'});
      const far     = addEnt({t:'line', a:[9000,9000], b:[9500,9500], layer:'0'});
      const n = dragBox([1400,400], [-400,-400]);
      return {n, sel: ids(), astride: astride.id, far: far.id};`);
    eq(r.n, 1);
    eq(r.sel[0], r.astride, 'a rotated crossing must still clip the line running through it');
  });

  /* ------------------------------------------------------------------ */
  group('selection — lasso, polygon and fence');

  t('a lasso is a polygon, not its bounding box', () => {
    /* a C-shaped lasso whose bbox contains the bait, but whose interior
       does not. A bbox test would take the bait; a polygon test must not. */
    const r = S(`
      const bait  = addEnt({t:'point', p:[0,0], layer:'0'});
      const catch1 = addEnt({t:'point', p:[-800,0], layer:'0'});
      const C = [[-1200,-1000],[1200,-1000],[1200,-700],[-500,-700],[-500,700],[1200,700],[1200,1000],[-1200,1000]];
      const scr = C.map(p => w2s(p));
      bandBegin(scr[0], 'lasso'); ST.band.live = true;
      for (let i = 1; i < scr.length; i++) ST.band.path.push(scr[i]);
      ST.band.cur = scr[scr.length-1];
      ST.band.sense = 'crossing'; ST.band.locked = true;
      const n = bandCommit();
      return {n, sel: [...SEL], bait: bait.id, catch1: catch1.id};`);
    ok(!r.sel.includes(r.bait), 'the lasso swallowed a point that sits in the notch of the C');
    ok(r.sel.includes(r.catch1), 'the lasso missed a point inside its own outline');
  });

  t('a lasso keeps the sense the hand set off with', () => {
    const r = S(`
      addEnt({t:'line', a:[0,0], b:[100,0], layer:'0'});
      bandBegin([400,400], 'lasso'); ST.band.live = true;
      bandMove([340,420]);                    /* set off leftwards -> crossing */
      const early = ST.band.sense;
      bandMove([900,500]);                    /* and wander back right again  */
      const late = ST.band.sense;
      bandCancel();
      return {early, late};`);
    eq(r.early, 'crossing');
    eq(r.late, 'crossing', 'the lasso fill must not strobe as the loop wanders back');
  });

  t('window polygon and crossing polygon differ only in the inclusion rule', () => {
    const r = S(`
      const inside  = addEnt({t:'line', a:[0,0],   b:[400,0],  layer:'0'});
      const astride = addEnt({t:'line', a:[300,0], b:[4000,0], layer:'0'});
      const P = [[-600,-600],[900,-600],[900,600],[-600,600]];
      const out = {};
      for (const kind of ['wpoly','cpoly']) {
        SEL.clear();
        const scr = P.map(p => w2s(p));
        bandBegin(scr[0], kind);
        for (let i = 1; i < scr.length; i++) bandPush(scr[i]);
        out[kind] = {n: bandCommit(), sel: [...SEL].sort((a,b)=>a-b)};
      }
      return Object.assign(out, {inside: inside.id, astride: astride.id});`);
    eq(r.wpoly.n, 1, 'WP should take only the enclosed line');
    eq(r.wpoly.sel[0], r.inside);
    eq(r.cpoly.n, 2, 'CP should take both');
  });

  t('a fence selects everything its line crosses and nothing it merely passes', () => {
    const r = S(`
      const a = addEnt({t:'line', a:[0,-500],   b:[0,500],   layer:'0'});
      const b = addEnt({t:'line', a:[800,-500], b:[800,500],  layer:'0'});
      const miss = addEnt({t:'line', a:[1600,2000], b:[1600,3000], layer:'0'});
      const F = [[-400,0],[1200,0]];
      const scr = F.map(p => w2s(p));
      bandBegin(scr[0], 'fence');
      bandPush(scr[1]);
      const n = bandCommit();
      return {n, sel: [...SEL].sort((x,y)=>x-y), a: a.id, b: b.id, miss: miss.id};`);
    eq(r.n, 2, 'the fence should have crossed exactly two lines');
    ok(r.sel.includes(r.a) && r.sel.includes(r.b));
    ok(!r.sel.includes(r.miss), 'the fence took a line it never crossed');
  });

  t('a preview of the in-flight window matches what committing it gives', () => {
    const r = S(`
      addEnt({t:'line', a:[0,0], b:[400,0], layer:'0'});
      addEnt({t:'line', a:[300,0], b:[4000,0], layer:'0'});
      const a = w2s([-600,-600]), b = w2s([900,600]);
      bandBegin([a[0],a[1]], 'rect'); bandMove([b[0],b[1]]);
      const preview = [...(ST.bandPreview || [])].sort((x,y)=>x-y);
      const shrunk = w2s([200,600]);
      bandMove([shrunk[0], shrunk[1]]);
      const preview2 = [...(ST.bandPreview || [])].sort((x,y)=>x-y);
      const n = bandCommit();
      return {preview, preview2, n, sel: [...SEL].sort((x,y)=>x-y)};`);
    eq(r.preview.length, 1, 'the preview should light the one enclosed line');
    eq(r.preview2.length, 0, 'shrinking the box must drop it from the preview live');
    eq(r.n, 0, 'and committing the shrunken box takes nothing');
  });

  /* ------------------------------------------------------------------ */
  group('selection — the set, and the prompt options');

  t('picks accumulate and Shift takes one back out (PICKADD)', () => {
    const r = S(`
      const a = addEnt({t:'line', a:[0,0], b:[100,0], layer:'0'});
      const b = addEnt({t:'line', a:[0,500], b:[100,500], layer:'0'});
      selApply([a.id]);
      const one = SEL.size;
      selApply([b.id]);
      const two = SEL.size;
      selApply([b.id], true);
      return {one, two, after: SEL.size, left: [...SEL]};`);
    eq(r.one, 1);
    eq(r.two, 2, 'a second pick must ADD — replacing the set is the classic clone tell');
    eq(r.after, 1);
  });

  t('U takes back the last pick step, one step at a time', () => {
    const r = S(`
      const a = addEnt({t:'line', a:[0,0], b:[100,0], layer:'0'});
      const b = addEnt({t:'line', a:[0,500], b:[100,500], layer:'0'});
      const c = addEnt({t:'line', a:[0,900], b:[100,900], layer:'0'});
      selApply([a.id]); selApply([b.id, c.id]);
      const three = SEL.size;
      selOption('u');
      const back = SEL.size;
      selOption('U');
      return {three, back, none: SEL.size};`);
    eq(r.three, 3);
    eq(r.back, 1, 'U must undo the whole step, not one id of it');
    eq(r.none, 0);
  });

  t('ALL, Last and Previous each mean what AutoCAD means', () => {
    const r = S(`
      const a = addEnt({t:'line', a:[0,0], b:[100,0], layer:'0'});
      const b = addEnt({t:'line', a:[0,500], b:[100,500], layer:'0'});
      ensureLayer('LOCKED', '#888'); layer('LOCKED').lock = true;
      const locked = addEnt({t:'line', a:[0,900], b:[100,900], layer:'LOCKED'});
      selOption('all');
      const all = [...SEL].sort((x,y)=>x-y);
      selRemember();                       /* a command consumes the set */
      SEL.clear();
      selOption('l');
      const last = [...SEL];
      SEL.clear();
      selOption('p');
      const prev = [...SEL].sort((x,y)=>x-y);
      return {all, last, prev, a:a.id, b:b.id, locked: locked.id};`);
    eq(JSON.stringify(r.all), JSON.stringify([r.a, r.b]),
      'ALL must skip a locked layer');
    eq(JSON.stringify(r.last), JSON.stringify([r.b]),
      'Last is the newest object that can still be picked');
    eq(JSON.stringify(r.prev), JSON.stringify([r.a, r.b]), 'Previous restores the last used set');
  });

  t('R switches to removing and A switches back', () => {
    const r = S(`
      const a = addEnt({t:'line', a:[0,0], b:[100,0], layer:'0'});
      const b = addEnt({t:'line', a:[0,500], b:[100,500], layer:'0'});
      selOption('all');
      selOption('r');
      const mode = ST.selMode;
      selApply([a.id], ST.selMode === 'remove');
      const afterR = [...SEL];
      selOption('a');
      selApply([a.id], ST.selMode === 'remove');
      return {mode, afterR, back: ST.selMode, afterA: SEL.size};`);
    eq(r.mode, 'remove');
    eq(r.afterR.length, 1, 'R + a pick must take that object out');
    eq(r.back, 'add');
    eq(r.afterA, 2, 'A must start adding again');
  });

  t('W, C, WP, CP and F all arm a gesture rather than running a command', () => {
    const r = S(`
      const out = {};
      for (const key of ['w','c','wp','cp','f']) {
        ST.pendOption = null; ST.band = null;
        out[key] = {took: selOption(key), armed: ST.pendOption && ST.pendOption.kind,
                    sense: ST.pendOption && ST.pendOption.sense || null};
      }
      out.junk = selOption('zzz');
      return out;`);
    eq(r.w.took, true); eq(r.w.armed, 'rect'); eq(r.w.sense, 'window');
    eq(r.c.armed, 'rect'); eq(r.c.sense, 'crossing');
    eq(r.wp.armed, 'wpoly'); eq(r.cp.armed, 'cpoly'); eq(r.f.armed, 'fence');
    eq(r.junk, false, 'an unknown keyword must fall through to the command line');
  });

  t('a selection keyword typed at a Select objects prompt beats the command of the same name', () => {
    const r = S(`
      addEnt({t:'line', a:[0,0], b:[100,0], layer:'0'});
      startCmd('move');                       /* nothing selected -> sel phase */
      const phase = CMD && CMD.phase;
      const took = cmdText('w');              /* W is Window here, not WALL */
      const armed = ST.pendOption && ST.pendOption.kind;
      const cmd = CMD && CMD.def.key;
      endCmd();
      return {phase, took, armed, cmd};`);
    eq(r.phase, 'sel');
    eq(r.took, true, 'the selection grammar must answer first');
    eq(r.armed, 'rect');
    eq(r.cmd, 'move', 'typing W must not have started the WALL command');
  });

  /* ------------------------------------------------------------------ */
  group('selection — rollover and cycling');

  t('candidates under the pick box come back nearest first, newest breaking ties', () => {
    const r = S(`
      const older = addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      const newer = addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      const near  = addEnt({t:'line', a:[0,20], b:[1000,20], layer:'0'});
      const at = pickCandidates([500,0], 8).map(e => e.id);
      const off = pickCandidates([500,20], 8).map(e => e.id);
      return {at, off, older: older.id, newer: newer.id, near: near.id};`);
    eq(r.at[0], r.newer, 'two coincident objects: the newest is on top');
    eq(r.at[1], r.older);
    eq(r.off[0], r.near, 'a nearer object always wins over a coincident pair');
  });

  t('cycling walks the stack and wraps, and resets when the stack changes', () => {
    const r = S(`
      addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      const first = pickHover([500,0], 8).map(e => e.id);
      const seq = [ST.hot];
      cyclePick(1); seq.push(ST.hot);
      cyclePick(1); seq.push(ST.hot);
      cyclePick(1); seq.push(ST.hot);          /* wraps */
      const listLen = ST.cycleList.length;
      cyclePick(1);
      pickHover([9000,9000], 8);               /* empty ground */
      return {first, seq, listLen, idxAfterMove: ST.cycleIdx,
              listAfterMove: ST.cycleList, hot: ST.hot};`);
    eq(r.listLen, 3);
    eq(JSON.stringify(r.seq), JSON.stringify([r.first[0], r.first[1], r.first[2], r.first[0]]),
      'cycling must be a deterministic walk of the candidate order');
    eq(r.listAfterMove, null, 'moving to empty ground clears the stack');
    eq(r.idxAfterMove, 0, 'and resets the cycle index');
    eq(r.hot, null);
  });

  t('the cycling list offers every candidate and picking one selects it', () => {
    const r = S(`
      const a = addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      const b = addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      const cands = pickCandidates([500,0], 8);
      const ui = showCycleList([200,200], cands, false);
      const rows = ui.children.slice(1);
      const labels = rows.map(x => x.dataset.id);
      rows[1].onclick({stopPropagation(){}});
      const after = [...SEL];
      const gone = !CYCLEUI;
      hideCycleList();
      return {n: rows.length, labels, after, gone, a: a.id, b: b.id};`);
    eq(r.n, 2, 'the list must offer both objects');
    eq(r.gone, true, 'picking a row closes the list');
    eq(r.after.length, 1);
    eq(String(r.after[0]), r.labels[1], 'the row that was clicked is the object that got selected');
  });

  /* ------------------------------------------------------------------ */
  group('grips — hit testing and state');

  t('the grip aperture follows GRIPSIZE, right at its boundary', () => {
    const r = S(`
      const e = addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      SEL.clear(); SEL.add(e.id);
      ST.gripSize = 5;
      const reach = px(5 * 1.4);              /* what gripAt allows */
      const inside  = gripAt([1000 - reach * 0.8, 0]);
      const outside = gripAt([1000 - reach * 1.2, 0]);
      ST.gripSize = 15;
      const bigger = gripAt([1000 - reach * 1.2, 0]);
      ST.gripSize = 5;
      ST.gripsOn = 0;
      const off = gripAt([1000, 0]);
      ST.gripsOn = 1;
      return {inside: inside && inside.k, outside, bigger: bigger && bigger.k, off};`);
    eq(r.inside, 'b', 'a grip just inside the aperture must be grabbable');
    eq(r.outside, null, 'and one just outside it must not be');
    eq(r.bigger, 'b', 'raising GRIPSIZE must actually widen the aperture, not just the drawing');
    eq(r.off, null, 'GRIPS 0 turns grips off entirely');
  });

  t('Shift makes several grips hot together and clicking one alone resets them', () => {
    const r = S(`
      const e = addEnt({t:'pline', pts:[[0,0],[1000,0],[1000,1000]], layer:'0'});
      SEL.clear(); SEL.add(e.id);
      gripSetHot({id:e.id, k:'p0', p:[0,0]}, false);
      const one = ST.gripHot.length;
      gripSetHot({id:e.id, k:'p1', p:[1000,0]}, true);
      const two = ST.gripHot.length;
      gripSetHot({id:e.id, k:'p1', p:[1000,0]}, true);   /* Shift again removes */
      const back = ST.gripHot.length;
      gripSetHot({id:e.id, k:'p2', p:[1000,1000]}, false);
      return {one, two, back, alone: ST.gripHot.length, k: ST.gripHot[0].k};`);
    eq(r.one, 1); eq(r.two, 2);
    eq(r.back, 1, 'Shift on an already hot grip takes it back out');
    eq(r.alone, 1, 'a plain click on another grip replaces the hot set');
    eq(r.k, 'p2');
  });

  t('a polyline gets a grip per vertex and per segment midpoint', () => {
    const r = S(`
      const e = addEnt({t:'pline', pts:[[0,0],[1000,0],[1000,1000]], layer:'0'});
      const cl = addEnt({t:'pline', pts:[[0,0],[100,0],[100,100]], closed:true, layer:'0'});
      return {open: gripsOf(e).map(g=>g.k), openPts: gripsOf(e).map(g=>g.p),
              closed: gripsOf(cl).map(g=>g.k)};`);
    eq(JSON.stringify(r.open), JSON.stringify(['p0', 'p1', 'p2', 's0', 's1']));
    eq(JSON.stringify(r.openPts[3]), JSON.stringify([500, 0]), 'the segment grip sits at the midpoint');
    eq(JSON.stringify(r.closed), JSON.stringify(['p0', 'p1', 'p2', 's0', 's1', 's2']),
      'a closed polyline gets a midpoint grip for the closing segment too');
  });

  t('a multifunctional grip offers alternatives and Ctrl steps them', () => {
    const r = S(`
      const e = addEnt({t:'pline', pts:[[0,0],[1000,0],[1000,1000]], layer:'0'});
      SEL.clear(); SEL.add(e.id);
      const vertex = (gripMenuItems(e, 'p1') || []).map(i => i.id);
      const seg    = (gripMenuItems(e, 's0') || []).map(i => i.id);
      const line = addEnt({t:'line', a:[0,0], b:[100,0], layer:'0'});
      const lineEnd = (gripMenuItems(line, 'b') || []).map(i => i.id);
      const lineMid = gripMenuItems(line, 'm');
      gripMenuOpen({id:e.id, k:'p1', p:[1000,0]});
      const opened = ST.gripMenu && ST.gripMenu.items.length;
      const steps = [ST.gripMenu.idx];
      gripMenuCycle(1); steps.push(ST.gripMenu.idx);
      gripMenuCycle(1); steps.push(ST.gripMenu.idx);
      gripMenuCycle(1); steps.push(ST.gripMenu.idx);
      return {vertex, seg, lineEnd, lineMid, opened, steps};`);
    eq(JSON.stringify(r.vertex), JSON.stringify(['stretch', 'addv', 'delv']));
    eq(JSON.stringify(r.seg), JSON.stringify(['stretch', 'addv']));
    eq(JSON.stringify(r.lineEnd), JSON.stringify(['stretch', 'lengthen']));
    eq(r.lineMid, null, 'a grip with one job must not raise a menu');
    eq(r.opened, 3);
    eq(JSON.stringify(r.steps), JSON.stringify([0, 1, 2, 0]), 'Ctrl wraps through the menu');
  });

  t('Add Vertex and Remove Vertex really change the polyline', () => {
    const r = S(`
      const e = addEnt({t:'pline', pts:[[0,0],[1000,0],[1000,1000]], layer:'0'});
      begin();
      const k = gripDo(e, 'p0', 'addv');
      commit('add');
      const added = e.pts.map(p => p.slice());
      begin();
      const gone = gripDo(DOC.ents.get(e.id), 'p1', 'delv');
      commit('del');
      const after = DOC.ents.get(e.id).pts.map(p => p.slice());
      undo(); undo();
      return {k, added, gone, after, back: DOC.ents.get(e.id).pts.length};`);
    eq(r.k, 'p1', 'the new vertex becomes the grip you carry on dragging');
    eq(JSON.stringify(r.added), JSON.stringify([[0, 0], [500, 0], [1000, 0], [1000, 1000]]));
    eq(r.gone, null, 'removing a vertex leaves nothing to drag');
    eq(JSON.stringify(r.after), JSON.stringify([[0, 0], [1000, 0], [1000, 1000]]));
    eq(r.back, 3, 'both steps undo');
  });

  /* ------------------------------------------------------------------ */
  group('grips — the five modes, by coordinate');

  /* Each mode is driven through the real command: make a grip hot, start
     gripedit, cycle to the mode with Enter, then place the point. */
  const MODE = `
    function hotGrip(e, k) {
      SEL.clear(); SEL.add(e.id);
      const g = gripsOf(e).find(x => x.k === k);
      gripSetHot({id: e.id, k, p: g.p.slice()}, false);
      ST.gripBase = g.p.slice(); ST.gripAction = 'stretch';
      startCmd('gripedit');
      return g;
    }
    function toMode(m) { while (CMD && CMD.mode !== m) cmdEnter(); }
    const rnd = p => p.map(v => Math.round(v * 1e6) / 1e6);
  `;

  t('STRETCH moves only the hot grip', () => {
    const r = S(MODE + `
      const e = addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      hotGrip(e, 'b');
      cmdPoint([1000, 400]);
      const live = DOC.ents.get(e.id);
      const out = {a: rnd(live.a), b: rnd(live.b), cmd: !!CMD, label: HIST.past.length};
      undo();
      out.back = rnd(DOC.ents.get(e.id).b);
      return out;`);
    eq(JSON.stringify(r.a), JSON.stringify([0, 0]), 'the far end must not move');
    eq(JSON.stringify(r.b), JSON.stringify([1000, 400]));
    eq(r.cmd, false, 'placing the point ends the grip edit');
    eq(r.label, 1, 'a whole grip stretch is one undo step');
    eq(JSON.stringify(r.back), JSON.stringify([1000, 0]));
  });

  t('two hot grips stretch together by the same delta', () => {
    const r = S(MODE + `
      const e = addEnt({t:'pline', pts:[[0,0],[1000,0],[1000,1000]], layer:'0'});
      SEL.clear(); SEL.add(e.id);
      gripSetHot({id:e.id, k:'p1', p:[1000,0]}, false);
      gripSetHot({id:e.id, k:'p2', p:[1000,1000]}, true);
      ST.gripBase = [1000,0]; ST.gripAction = 'stretch';
      startCmd('gripedit');
      cmdPoint([1300, -200]);                       /* delta = (300,-200) */
      const pts = DOC.ents.get(e.id).pts.map(p => rnd(p));
      undo();
      return {pts};`);
    eq(JSON.stringify(r.pts), JSON.stringify([[0, 0], [1300, -200], [1300, 800]]),
      'both hot vertices must move by exactly the drag delta, and no others');
  });

  t('Esc during a stretch puts the object back where it was', () => {
    const r = S(MODE + `
      const e = addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      hotGrip(e, 'b');
      cmdPreview(CMD, [1000, 900]);            /* live drag */
      const during = rnd(DOC.ents.get(e.id).b);
      endCmd();                                 /* what Esc does */
      const after = rnd(DOC.ents.get(e.id).b);
      return {during, after, undos: HIST.past.length, hot: ST.gripHot.length};`);
    eq(JSON.stringify(r.during), JSON.stringify([1000, 900]),
      'the object itself moves during a stretch — AutoCAD does not ghost it');
    eq(JSON.stringify(r.after), JSON.stringify([1000, 0]), 'and Esc rolls it back');
    eq(r.undos, 0, 'an abandoned stretch leaves no undo step behind');
    eq(r.hot, 0, 'and no grip stays hot');
  });

  t('Enter cycles STRETCH, MOVE, ROTATE, SCALE, MIRROR and round again', () => {
    const r = S(MODE + `
      const e = addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      hotGrip(e, 'b');
      const seq = [CMD.mode];
      for (let i = 0; i < 5; i++) { cmdEnter(); seq.push(CMD.mode); }
      endCmd();
      return {seq};`);
    eq(JSON.stringify(r.seq),
      JSON.stringify(['stretch', 'move', 'rotate', 'scale', 'mirror', 'stretch']));
  });

  t('MOVE takes the whole object, not the grip', () => {
    const r = S(MODE + `
      const e = addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      hotGrip(e, 'b'); toMode('move');
      cmdPoint([1250, 300]);                    /* base was (1000,0) */
      const live = DOC.ents.get(e.id);
      return {a: rnd(live.a), b: rnd(live.b)};`);
    eq(JSON.stringify(r.a), JSON.stringify([250, 300]));
    eq(JSON.stringify(r.b), JSON.stringify([1250, 300]));
  });

  t('ROTATE turns the selection about the base point', () => {
    const r = S(MODE + `
      const e = addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      hotGrip(e, 'a'); toMode('rotate');        /* base (0,0) */
      cmdText('90');
      const live = DOC.ents.get(e.id);
      return {a: rnd(live.a), b: rnd(live.b)};`);
    eq(JSON.stringify(r.a), JSON.stringify([0, 0]));
    eq(JSON.stringify(r.b), JSON.stringify([0, 1000]), 'a typed 90 must land exactly on the axis');
  });

  t('SCALE takes a typed factor about the base point', () => {
    const r = S(MODE + `
      const e = addEnt({t:'line', a:[200,0], b:[1000,0], layer:'0'});
      hotGrip(e, 'a'); toMode('scale');          /* base (200,0) */
      cmdText('2');
      const live = DOC.ents.get(e.id);
      return {a: rnd(live.a), b: rnd(live.b)};`);
    eq(JSON.stringify(r.a), JSON.stringify([200, 0]), 'the base point is a fixed point of the scale');
    eq(JSON.stringify(r.b), JSON.stringify([1800, 0]));
  });

  t('MIRROR flips the selection across base -> point and consumes the original', () => {
    const r = S(MODE + `
      const e = addEnt({t:'line', a:[0,200], b:[1000,200], layer:'0'});
      hotGrip(e, 'a'); toMode('mirror');         /* base (0,200) */
      cmdPoint([1000, 200]);                      /* mirror line y = 200 */
      const live = DOC.ents.get(e.id);
      return {a: rnd(live.a), b: rnd(live.b), count: DOC.ents.size};`);
    eq(r.count, 1, 'MIRROR without Copy must not leave a duplicate behind');
    eq(JSON.stringify(r.a), JSON.stringify([0, 200]));
    eq(JSON.stringify(r.b), JSON.stringify([1000, 200]),
      'a mirror along the object itself is a no-op, which is the exact-coordinate check');
  });

  t('MIRROR across a perpendicular line lands on the reflected coordinates', () => {
    const r = S(MODE + `
      const e = addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      hotGrip(e, 'a'); toMode('mirror');          /* base (0,0) */
      cmdPoint([0, 1000]);                         /* mirror line x = 0 */
      const live = DOC.ents.get(e.id);
      return {a: rnd(live.a), b: rnd(live.b)};`);
    eq(JSON.stringify(r.a), JSON.stringify([0, 0]));
    eq(JSON.stringify(r.b), JSON.stringify([-1000, 0]));
  });

  t('Copy leaves the original and places a copy, and the mode stays live', () => {
    const r = S(MODE + `
      const e = addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      hotGrip(e, 'b'); toMode('move');
      cmdText('c');                                /* Copy on */
      cmdPoint([1000, 500]);
      const stillRunning = !!CMD && CMD.def.key === 'gripedit';
      const src = DOC.ents.get(e.id);
      const made = [...DOC.ents.values()].filter(x => x.id !== e.id);
      const out = {stillRunning, count: DOC.ents.size,
                   src: rnd(src.b), copy: made.length ? rnd(made[0].b) : null};
      endCmd();
      return out;`);
    eq(r.count, 2, 'Copy must add an object, not move one');
    eq(r.stillRunning, true, 'Copy keeps placing until you exit');
    eq(JSON.stringify(r.src), JSON.stringify([1000, 0]), 'the original stays put');
    eq(JSON.stringify(r.copy), JSON.stringify([1000, 500]));
  });

  t('Base point moves the reference the drag is measured from', () => {
    const r = S(MODE + `
      const e = addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      hotGrip(e, 'b'); toMode('move');
      cmdText('b'); cmdPoint([0, 0]);              /* base is now the far end */
      cmdPoint([0, 700]);
      const live = DOC.ents.get(e.id);
      return {a: rnd(live.a), b: rnd(live.b)};`);
    eq(JSON.stringify(r.a), JSON.stringify([0, 700]));
    eq(JSON.stringify(r.b), JSON.stringify([1000, 700]));
  });

  t('X exits and the selection survives the edit', () => {
    const r = S(MODE + `
      const e = addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      hotGrip(e, 'b');
      cmdText('x');
      return {cmd: !!CMD, sel: SEL.size, hot: ST.gripHot.length};`);
    eq(r.cmd, false);
    eq(r.sel, 1, 'grips go cold but the object stays selected');
    eq(r.hot, 0);
  });

  t('an arc grip refits through three points instead of swimming under the cursor', () => {
    const r = S(`
      const e = addEnt({t:'arc', c:[0,0], r:1000, a0:0, a1:Math.PI/2, layer:'0'});
      const orig = clone(e);
      const target = [0, 1400];
      begin();
      applyGrip(e, 'r', target, orig);
      const once = {c: e.c.slice(), r: e.r};
      applyGrip(e, 'r', target, orig);          /* the same drag frame again */
      const twice = {c: e.c.slice(), r: e.r};
      rollback();
      return {once, twice,
              onArc: Math.abs(dist(once.c, target) - once.r)};`);
    close(r.onArc, 0, 1e-6, 'the refitted arc must pass through the dragged point');
    eq(JSON.stringify(r.once), JSON.stringify(r.twice),
      're-applying the same drag frame must be idempotent, or the arc drifts away');
  });

  /* ------------------------------------------------------------------ */
  group('selection — the panel that reports it');

  t('a multi-selection card says how many and shows only common properties', () => {
    const r = S(`
      const a = addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      ensureLayer('WALLS', '#888');
      const b = addEnt({t:'circle', c:[0,0], r:500, layer:'WALLS'});
      SEL.clear(); SEL.add(a.id); SEL.add(b.id);
      buildProps();
      const card = QP;
      const head = card ? card.children[0].children.map(x => x.innerHTML || x.textContent).join(' ') : '';
      const rows = card ? card.children[1].children.length : 0;
      const body = card ? card.children[1].children.map(x =>
        (x.children[0] && (x.children[0].textContent || x.children[0].innerHTML)) || '').join('|') : '';
      SEL.clear(); buildProps();
      return {shown: !!card, head, rows, body, gone: !QP};`);
    eq(r.shown, true, 'two selected objects must still raise the quick card');
    ok(/2 objects selected/.test(r.head), 'card header: ' + r.head);
    ok(r.rows >= 2 && r.rows <= 4, 'common fields: ' + r.rows);
    ok(!/Radius|Thickness/.test(r.body),
      'a mixed selection must not offer a property only one of them has: ' + r.body);
    eq(r.gone, true, 'clearing the selection takes the card away');
  });

  t('the quick card opens beside the cursor, not at the far end of the object', () => {
    const r = S(`
      const e = addEnt({t:'line', a:[-40000,0], b:[40000,0], layer:'0'});
      ST.cur = [-38000, 0];
      SEL.clear(); SEL.add(e.id); QPmuted = null; buildProps();
      const near = parseFloat(QP.style.left);
      const s = w2s(ST.cur);
      SEL.clear(); buildProps();
      return {near, cursor: s[0], mid: w2s([0,0])[0]};`);
    close(r.near, r.cursor + 22, 1, 'the card should sit just off the cursor');
    ok(Math.abs(r.near - r.mid) > 40, 'it must not fall back to the bbox centre');
  });
};
