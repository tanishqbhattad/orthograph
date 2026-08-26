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
};
