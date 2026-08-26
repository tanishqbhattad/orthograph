'use strict';
/* ============================================================
   B1 — modify command semantics

   The commands all existed; what was missing was the options a
   draughtsman actually reaches for, and one default that was
   quietly producing wrong drawings.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; DOC.gridStep = 100; DOC.snapStep = 100;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  VS.mirrtext = 0;
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('MIRROR keeps text readable');

  /* Mirroring half a plan used to turn every room name into mirror writing:
     the text came back rotated 180 degrees. AutoCAD calls this MIRRTEXT and
     has defaulted it to "keep it readable" since 2000. */
  t('a mirrored label stays the right way up', () => {
    const r = R(`${SETUP}
      addEnt({t:'text', s:'KITCHEN', p:[1000,1000], h:200, rot:0, anchor:'l', layer:'0'});
      const txt = [...DOC.ents.values()][0];
      const m = xf(clone(txt), T.mirror([3000,0],[3000,1000]));
      return { p: m.p, rot: m.rot, deg: deg(m.rot), anchor: m.anchor, s: m.s };`);
    close(r.p[0], 5000, 1e-9, 'the insertion point still mirrors');
    close(r.deg, 0, 1e-9, 'but the text reads the right way up, got ' + r.deg + ' degrees');
    eq(r.anchor, 'r', 'and the anchor follows, so it sits on the same side as before');
    eq(r.s, 'KITCHEN');
  });

  t('mirroring about a horizontal line leaves it upright too', () => {
    const r = R(`${SETUP}
      addEnt({t:'text', s:'HALL', p:[1000,1000], h:200, rot:0, anchor:'l', layer:'0'});
      const txt = [...DOC.ents.values()][0];
      const m = xf(clone(txt), T.mirror([0,0],[1000,0]));
      return { p: m.p, deg: deg(m.rot), anchor: m.anchor };`);
    close(r.p[1], -1000, 1e-9, 'the point mirrors vertically');
    close(r.deg, 0, 1e-9, 'and the text is still upright, got ' + r.deg);
    eq(r.anchor, 'l', 'a vertical flip does not reverse the run, so the anchor stays');
  });

  t('text at an angle comes back readable, not backwards', () => {
    const r = R(`${SETUP}
      addEnt({t:'text', s:'ROOF', p:[0,0], h:200, rot:rad(45), anchor:'l', layer:'0'});
      const txt = [...DOC.ents.values()][0];
      const m = xf(clone(txt), T.mirror([1000,0],[1000,1000]));
      return { deg: deg(m.rot) };`);
    ok(Math.cos(r.deg * Math.PI / 180) > 0,
      'a readable angle reads left to right, got ' + r.deg + ' degrees');
    close(Math.abs(r.deg), 45, 1e-9, 'and it is the mirrored 45, got ' + r.deg);
  });

  /* MIRRTEXT 1 is the old behaviour and some offices still want it. */
  t('MIRRTEXT 1 mirrors the text as well', () => {
    const r = R(`${SETUP}
      VS.mirrtext = 1;
      addEnt({t:'text', s:'KITCHEN', p:[1000,1000], h:200, rot:0, anchor:'l', layer:'0'});
      const txt = [...DOC.ents.values()][0];
      const m = xf(clone(txt), T.mirror([3000,0],[3000,1000]));
      return { deg: deg(m.rot), anchor: m.anchor };`);
    close(Math.abs(r.deg), 180, 1e-9, 'the legacy behaviour turns it right round');
    eq(r.anchor, 'l', 'and leaves the anchor alone');
  });

  /* The reflection is detected from handedness, not from being told, so a
     deliberate half turn must survive untouched. */
  t('a deliberate ROTATE of 180 degrees is not "corrected"', () => {
    const r = R(`${SETUP}
      addEnt({t:'text', s:'UPSIDE', p:[1000,0], h:200, rot:0, anchor:'l', layer:'0'});
      const txt = [...DOC.ents.values()][0];
      const m = xf(clone(txt), T.rot([0,0], Math.PI));
      return { deg: deg(m.rot), anchor: m.anchor, p: m.p };`);
    close(Math.abs(r.deg), 180, 1e-9,
      'a rotation preserves handedness, so it must stay at 180, got ' + r.deg);
    eq(r.anchor, 'l', 'and the anchor must not be meddled with');
    close(r.p[0], -1000, 1e-9);
  });

  group('ROTATE and SCALE can work on a copy');

  t('ROTATE Copy leaves the original and selects the new one', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[1000,0], b:[2000,0], layer:'0'});
      const src = [...DOC.ents.values()][0];
      SEL.clear(); SEL.add(src.id);
      cancelCmd();
      startCmd('rotate');
      dispatch('C');
      cmdPoint([0,0]);
      dispatch('90');
      const all = [...DOC.ents.values()];
      const orig = DOC.ents.get(src.id);
      const made = all.find(e => e.id !== src.id);
      return { n: all.length,
               originalKept: !!orig && Math.abs(orig.a[0] - 1000) < 1e-9,
               turned: made ? [made.a[0], made.a[1]] : null,
               selectedIsCopy: SEL.size === 1 && made && SEL.has(made.id) };`);
    eq(r.n, 2, 'a copy is made, so there are two');
    eq(r.originalKept, true, 'and the original has not moved');
    ok(Math.abs(r.turned[0]) < 1e-9 && Math.abs(r.turned[1] - 1000) < 1e-9,
      'the copy is the one that turned, got ' + JSON.stringify(r.turned));
    eq(r.selectedIsCopy, true, 'and the copy is what is selected afterwards');
  });

  t('SCALE Copy does the same', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[1000,0], b:[2000,0], layer:'0'});
      const src = [...DOC.ents.values()][0];
      SEL.clear(); SEL.add(src.id);
      cancelCmd();
      startCmd('scale');
      dispatch('C');
      cmdPoint([0,0]);
      dispatch('2');
      const all = [...DOC.ents.values()];
      const orig = DOC.ents.get(src.id);
      const made = all.find(e => e.id !== src.id);
      return { n: all.length,
               originalLen: orig ? dist(orig.a, orig.b) : null,
               copyLen: made ? dist(made.a, made.b) : null,
               copyStart: made ? made.a[0] : null };`);
    eq(r.n, 2);
    close(r.originalLen, 1000, 1e-9, 'the original keeps its size');
    close(r.copyLen, 2000, 1e-9, 'and the copy is doubled');
    close(r.copyStart, 2000, 1e-9, 'scaled about the base point, not in place');
  });

  t('without Copy they still move the original, and make nothing new', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[1000,0], b:[2000,0], layer:'0'});
      const src = [...DOC.ents.values()][0];
      SEL.clear(); SEL.add(src.id);
      cancelCmd();
      startCmd('rotate'); cmdPoint([0,0]); dispatch('90');
      const afterRot = { n: DOC.ents.size, a: DOC.ents.get(src.id).a.slice() };
      SEL.clear(); SEL.add(src.id);
      startCmd('scale'); cmdPoint([0,0]); dispatch('2');
      return { afterRot, n: DOC.ents.size,
               len: dist(DOC.ents.get(src.id).a, DOC.ents.get(src.id).b) };`);
    eq(r.afterRot.n, 1, 'plain ROTATE must not leave a copy behind');
    ok(Math.abs(r.afterRot.a[1] - 1000) < 1e-9, 'and it really rotated');
    eq(r.n, 1, 'plain SCALE must not either');
    close(r.len, 2000, 1e-9);
  });

  group('OFFSET has the options it is actually used with');

  /* Multiple is how a run of parallel lines gets drawn: each click steps out
     again from the object just made, not from the original. */
  t('OFFSET Multiple steps out from the last one each time', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'});
      cancelCmd();
      startCmd('offset');
      dispatch('500'); dispatch('M');
      cmdPoint([2500, 0]);
      cmdPoint([2500, 200]);
      cmdPoint([2500, 700]);
      cmdPoint([2500, 1200]);
      const running = !!CMD;
      endCmd(true);
      return { ys: [...DOC.ents.values()].map(e => e.a[1]).sort((a,b) => a-b), running };`);
    eq(r.ys.join(','), '0,500,1000,1500', 'got ' + r.ys.join(','));
    eq(r.running, true, 'and the command stays up for the next one');
  });

  t('OFFSET without Multiple goes back to picking a fresh object', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'});
      cancelCmd();
      startCmd('offset');
      dispatch('500');
      cmdPoint([2500, 0]);
      cmdPoint([2500, 200]);
      /* the same two clicks again would chain in Multiple; here they must
         offset the ORIGINAL a second time, landing on top of the first */
      cmdPoint([2500, 0]);
      cmdPoint([2500, 200]);
      endCmd(true);
      return { ys: [...DOC.ents.values()].map(e => e.a[1]).sort((a,b) => a-b) };`);
    eq(r.ys.join(','), '0,500,500', 'each offset is taken from the object picked');
  });

  t('OFFSET Erase removes the source, Layer chooses where it lands', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'});
      const srcId = [...DOC.ents.values()][0].id;
      cancelCmd();
      startCmd('offset'); dispatch('300'); dispatch('E');
      cmdPoint([2500,0]); cmdPoint([2500,100]);
      endCmd(true);
      const erased = { n: DOC.ents.size, gone: !DOC.ents.get(srcId) };

      resetDoc();
      DOC.layers.push(newLayer('A-WALL'));
      addEnt({t:'line', a:[0,0], b:[5000,0], layer:'A-WALL'});
      DOC.cur = '0';
      cancelCmd();
      startCmd('offset'); dispatch('300'); dispatch('L');
      cmdPoint([2500,0]); cmdPoint([2500,100]);
      endCmd(true);
      const onCur = [...DOC.ents.values()].find(e => e.a[1] !== 0);

      resetDoc();
      DOC.layers.push(newLayer('A-WALL'));
      addEnt({t:'line', a:[0,0], b:[5000,0], layer:'A-WALL'});
      DOC.cur = '0';
      cancelCmd();
      startCmd('offset'); dispatch('300');
      cmdPoint([2500,0]); cmdPoint([2500,100]);
      endCmd(true);
      const onSrc = [...DOC.ents.values()].find(e => e.a[1] !== 0);

      return { erased, cur: onCur && onCur.layer, src: onSrc && onSrc.layer };`);
    eq(r.erased.n, 1, 'Erase leaves only the offset');
    eq(r.erased.gone, true, 'and the source is really gone');
    eq(r.cur, '0', 'Layer puts the offset on the current layer');
    eq(r.src, 'A-WALL', 'and by default it keeps the source layer');
  });

  group('MOVE and COPY take a displacement');

  t('MOVE D takes a vector rather than two points', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[1000,1000], b:[2000,1000], layer:'0'});
      const e = [...DOC.ents.values()][0];
      SEL.clear(); SEL.add(e.id);
      cancelCmd();
      startCmd('move'); dispatch('D'); cmdPoint([0, -1200]);
      const m = DOC.ents.get(e.id);
      return { n: DOC.ents.size, a: m.a.slice(), b: m.b.slice() };`);
    eq(r.n, 1, 'MOVE must not leave a copy');
    eq(r.a.join(','), '1000,-200', 'the whole displacement is applied, got ' + r.a.join(','));
    eq(r.b.join(','), '2000,-200');
  });

  t('COPY D leaves the original and places one copy', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      const e = [...DOC.ents.values()][0];
      SEL.clear(); SEL.add(e.id);
      cancelCmd();
      startCmd('copy'); dispatch('D'); cmdPoint([0, 2500]);
      const orig = DOC.ents.get(e.id);
      const made = [...DOC.ents.values()].find(x => x.id !== e.id);
      return { n: DOC.ents.size, origY: orig.a[1], copyY: made && made.a[1] };`);
    eq(r.n, 2, 'one copy, not a run of them');
    eq(r.origY, 0, 'the original stays put');
    eq(r.copyY, 2500, 'and the copy lands at the displacement');
  });

  group('B2 — TRIM and EXTEND at more than one object a time');

  /* Clicking one object at a time is fine for a stray line and hopeless for a
     grid of them. This is the case the Fence option exists for. */
  t('a fence trims every object it crosses, in one step', () => {
    const r = R(`${SETUP}
      for (let i = 0; i < 5; i++)
        addEnt({t:'line', a:[i*1000, -500], b:[i*1000, 2500], layer:'0'});
      addEnt({t:'line', a:[-500,0], b:[4500,0], layer:'0'});
      addEnt({t:'line', a:[-500,2000], b:[4500,2000], layer:'0'});
      cancelCmd();
      startCmd('trim');
      dispatch('F');
      cmdPoint([-200, 2300]);
      cmdPoint([4200, 2300]);
      cmdEnter();
      const verts = [...DOC.ents.values()].filter(e => Math.abs(e.a[0]-e.b[0]) < 1e-9);
      const tops = verts.map(e => Math.max(e.a[1], e.b[1]));
      endCmd(true);
      return { n: verts.length, tops, maxTop: Math.max(...tops) };`);
    eq(r.n, 5, 'all five verticals survive as single pieces');
    close(r.maxTop, 2000, 1e-9,
      'and every stub above the boundary is gone, highest end at ' + r.maxTop);
  });

  t('one fence stroke is a single undo step', () => {
    const r = R(`${SETUP}
      for (let i = 0; i < 4; i++)
        addEnt({t:'line', a:[i*1000, -500], b:[i*1000, 2500], layer:'0'});
      addEnt({t:'line', a:[-500,2000], b:[3500,2000], layer:'0'});
      cancelCmd();
      const before = [...DOC.ents.values()].filter(e => Math.abs(e.a[0]-e.b[0]) < 1e-9)
                        .map(e => Math.max(e.a[1], e.b[1]));
      startCmd('trim'); dispatch('F');
      cmdPoint([-200, 2300]); cmdPoint([3200, 2300]); cmdEnter();
      endCmd(true);
      const cut = [...DOC.ents.values()].filter(e => Math.abs(e.a[0]-e.b[0]) < 1e-9)
                     .map(e => Math.max(e.a[1], e.b[1]));
      undo();
      const back = [...DOC.ents.values()].filter(e => Math.abs(e.a[0]-e.b[0]) < 1e-9)
                      .map(e => Math.max(e.a[1], e.b[1])).sort((a,b)=>a-b);
      return { before: before.sort((a,b)=>a-b), cutMax: Math.max(...cut), back };`);
    close(r.cutMax, 2000, 1e-9, 'the fence cut them');
    eq(r.back.join(','), r.before.join(','),
      'and ONE undo brings all four back, not four undos');
  });

  t('a crossing window trims what it crosses', () => {
    const r = R(`${SETUP}
      for (let i = 0; i < 4; i++)
        addEnt({t:'line', a:[i*1000, -500], b:[i*1000, 2500], layer:'0'});
      addEnt({t:'line', a:[-500,2000], b:[3500,2000], layer:'0'});
      cancelCmd();
      startCmd('trim');
      dispatch('C');
      cmdPoint([-200, 2200]);
      cmdPoint([3200, 2400]);
      const verts = [...DOC.ents.values()].filter(e => Math.abs(e.a[0]-e.b[0]) < 1e-9);
      endCmd(true);
      return { n: verts.length, maxTop: Math.max(...verts.map(e => Math.max(e.a[1], e.b[1]))) };`);
    eq(r.n, 4);
    close(r.maxTop, 2000, 1e-9, 'the window cut the stubs, highest end ' + r.maxTop);
  });

  /* EXTEND is the same command with the sense reversed, built from one
     definition so the two cannot drift apart. */
  t('a fence extends every object it crosses', () => {
    const r = R(`${SETUP}
      /* three short verticals, all stopping short of a boundary at y = 2000 */
      for (let i = 0; i < 3; i++)
        addEnt({t:'line', a:[i*1000, 0], b:[i*1000, 1200], layer:'0'});
      addEnt({t:'line', a:[-500,2000], b:[2500,2000], layer:'0'});
      cancelCmd();
      startCmd('extend');
      dispatch('F');
      cmdPoint([-200, 1100]);
      cmdPoint([2200, 1100]);
      cmdEnter();
      const verts = [...DOC.ents.values()].filter(e => Math.abs(e.a[0]-e.b[0]) < 1e-9);
      const tops = verts.map(e => Math.max(e.a[1], e.b[1]));
      endCmd(true);
      return { n: verts.length, tops };`);
    eq(r.n, 3, 'extending must not create or destroy objects');
    ok(r.tops.every(v => Math.abs(v - 2000) < 1e-9),
      'all three reach the boundary, got ' + r.tops.join(','));
  });

  t('Undo inside TRIM takes back the last cut without leaving the command', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,-500], b:[0,2500], layer:'0'});
      addEnt({t:'line', a:[-500,2000], b:[500,2000], layer:'0'});
      cancelCmd();
      startCmd('trim');
      cmdPoint([0, 2300]);
      const v1 = [...DOC.ents.values()].filter(e => Math.abs(e.a[0]-e.b[0]) < 1e-9)[0];
      const cutTop = Math.max(v1.a[1], v1.b[1]);
      dispatch('U');
      const v2 = [...DOC.ents.values()].filter(e => Math.abs(e.a[0]-e.b[0]) < 1e-9)[0];
      const backTop = Math.max(v2.a[1], v2.b[1]);
      const running = !!CMD;
      endCmd(true);
      return { cutTop, backTop, running };`);
    close(r.cutTop, 2000, 1e-9, 'the cut happened');
    close(r.backTop, 2500, 1e-9, 'and U put it back, got ' + r.backTop);
    eq(r.running, true, 'without dropping out of TRIM');
  });

  group('B2 — FILLET and CHAMFER modes');

  const CORNER = `
    addEnt({t:'line', a:[0,0], b:[2000,0], layer:'0'});
    addEnt({t:'line', a:[2000,0], b:[2000,2000], layer:'0'});
    cancelCmd();
  `;

  t('a fillet trims both objects back to the arc', () => {
    const r = R(`${SETUP}${CORNER}
      VS.trimmode = 1;
      startCmd('fillet'); dispatch('300');
      cmdPoint([1000,0]); cmdPoint([2000,1000]);
      const lines = [...DOC.ents.values()].filter(e => e.t === 'line');
      const arcs = [...DOC.ents.values()].filter(e => e.t === 'arc');
      endCmd(true);
      return { lens: lines.map(e => +dist(e.a,e.b).toFixed(6)).sort((a,b)=>a-b),
               arcs: arcs.length, r: arcs[0] && +arcs[0].r.toFixed(6) };`);
    eq(r.arcs, 1, 'one arc is added');
    close(r.r, 300, 1e-6, 'of the radius asked for');
    eq(r.lens.join(','), '1700,1700', 'and both lines stop at the tangent points');
  });

  /* TRIMMODE 0 is how you fillet something whose full length you still need. */
  t('TRIMMODE off adds the arc and leaves the lines alone', () => {
    const r = R(`${SETUP}${CORNER}
      VS.trimmode = 1;
      startCmd('fillet'); dispatch('300'); dispatch('T');
      const mode = VS.trimmode;
      cmdPoint([1000,0]); cmdPoint([2000,1000]);
      const lines = [...DOC.ents.values()].filter(e => e.t === 'line');
      const arcs = [...DOC.ents.values()].filter(e => e.t === 'arc');
      endCmd(true);
      VS.trimmode = 1;
      return { mode, lens: lines.map(e => +dist(e.a,e.b).toFixed(6)).sort((a,b)=>a-b),
               arcs: arcs.length };`);
    eq(r.mode, 0, 'T turns trimming off');
    eq(r.arcs, 1, 'the arc is still made');
    eq(r.lens.join(','), '2000,2000', 'but neither line is cut');
  });

  t('a fillet of radius zero makes a sharp corner and no arc', () => {
    const r = R(`${SETUP}
      VS.trimmode = 1;
      addEnt({t:'line', a:[0,0], b:[1500,0], layer:'0'});
      addEnt({t:'line', a:[2000,500], b:[2000,2000], layer:'0'});
      cancelCmd();
      startCmd('fillet'); dispatch('0');
      cmdPoint([700,0]); cmdPoint([2000,1200]);
      const lines = [...DOC.ents.values()].filter(e => e.t === 'line');
      const arcs = [...DOC.ents.values()].filter(e => e.t === 'arc');
      endCmd(true);
      /* both should now reach the corner at 2000,0 */
      const reach = lines.map(e =>
        Math.min(dist(e.a, [2000,0]), dist(e.b, [2000,0]))).sort((a,b)=>a-b);
      return { arcs: arcs.length, reach };`);
    eq(r.arcs, 0, 'radius zero is a corner, not an arc');
    ok(r.reach.every(v => v < 1e-6),
      'and both lines are taken to the corner, nearest ends at ' + r.reach.join(','));
  });

  /* A chamfer is dimensioned as a distance and an angle more often than as two
     distances, and the Angle method simply was not there. */
  t('CHAMFER by the angle method uses distance and angle', () => {
    const r = R(`${SETUP}${CORNER}
      VS.trimmode = 1;
      startCmd('chamfer'); dispatch('A'); dispatch('400'); dispatch('30');
      cmdPoint([1000,0]); cmdPoint([2000,1000]);
      const lines = [...DOC.ents.values()].filter(e => e.t === 'line');
      const diag = lines.find(e =>
        Math.abs(e.a[0]-e.b[0]) > 1 && Math.abs(e.a[1]-e.b[1]) > 1);
      endCmd(true);
      return { diag: diag ? +dist(diag.a, diag.b).toFixed(6) : null,
               want: +Math.hypot(400, 400*Math.tan(rad(30))).toFixed(6),
               n: lines.length };`);
    eq(r.n, 3, 'two lines and the chamfer between them');
    close(r.diag, r.want, 1e-6,
      'the chamfer is hypot(d, d tan a), got ' + r.diag + ' want ' + r.want);
  });

  t('an angle outside 0 to 90 is refused without changing anything', () => {
    const r = R(`${SETUP}${CORNER}
      startCmd('chamfer'); dispatch('A'); dispatch('400');
      const before = DOC.chamD;
      dispatch('120');
      const after = DOC.chamD;
      endCmd(true);
      return { before, after, same: before === after };`);
    eq(r.same, true, 'a nonsense angle must not quietly set a chamfer');
  });
};
