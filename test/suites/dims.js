'use strict';
/* ============================================================
   B3 — associative dimensions

   A dimension that keeps a copy of two coordinates starts lying
   the moment the wall it measures is moved, and a drawing full
   of confidently wrong numbers is worse than one with none.
   ============================================================ */
/* A clean board. Snap MODES leak between suites — ST.osnap alone is not
   enough, because another suite can leave the endpoint bit off and then every
   snap here quietly returns a different kind with no geometry attached to it.
   That cost me five failing tests that passed perfectly in isolation. */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; DOC.gridStep = 100; DOC.snapStep = 100;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ST.osnap = true; ST.ortho = false; ST.polar = false; ST.snapgrid = false;
  ST.otrack = false; ST.snapCycle = 0; ST.snapScr = null;
  ST.aperture = 10; ST.snapCands = null; ST.snap = null;
  ST.trackPts.length = 0; ST.extPts.length = 0; ST.parRefs.length = 0;
  ST.tracks = null; ST.osnapOne = null; ST.osnapOneShot = false;
  ST.ptMod = null; ST.fromBase = null;
  toggleSnap('all');
`;
/* dimension a line by snapping to each end, the way a person does */
const DIMIT = `
  const dimBySnap = (ln) => {
    cancelCmd();
    startCmd('dim');
    const s1 = w2s(ln.a); snapPoint(s1[0] + 2, s1[1] + 2, null);
    cmdPoint(ST.snap ? ST.snap.p : ln.a);
    const s2 = w2s(ln.b); snapPoint(s2[0] + 2, s2[1] + 2, null);
    cmdPoint(ST.snap ? ST.snap.p : ln.b);
    cmdPoint([mid(ln.a, ln.b)[0], -600]);
    endCmd(true);
    return [...DOC.ents.values()].find(e => e.t === 'dim');
  };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('a dimension stays attached to what it measures');

  t('snapping to geometry attaches the dimension to it', () => {
    const r = R(`${SETUP}${DIMIT}
      begin(); addEnt({t:'line', a:[0,0], b:[3000,0], layer:'0'}); commit('l');
      const ln = [...DOC.ents.values()][0];
      const d = dimBySnap(ln);
      return { made: !!d, r1: d && d.r1, r2: d && d.r2,
               assoc: d && dimAssoc(d), val: d && Math.round(dimGeom(d).val) };`);
    eq(r.made, true, 'a dimension is created');
    ok(r.r1 && r.r1.id != null, 'and the first end knows what it is attached to');
    ok(r.r2 && r.r2.id != null, 'and so does the second');
    eq(r.assoc, true);
    eq(r.val, 3000, 'measuring the line it was snapped to');
  });

  t('stretching the geometry changes what the dimension reads', () => {
    const r = R(`${SETUP}${DIMIT}
      begin(); addEnt({t:'line', a:[0,0], b:[3000,0], layer:'0'}); commit('l');
      const ln = [...DOC.ents.values()][0];
      const d = dimBySnap(ln);
      const before = Math.round(dimGeom(d).val);
      begin(); mut(ln); ln.b = [4200, 0]; commit('stretch');
      const after = Math.round(dimGeom(d).val);
      const text = dimGeom(d).txt;
      /* moving the whole line must not change the LENGTH it reports */
      begin(); xf(ln, T.move([500, 900])); commit('move');
      const moved = Math.round(dimGeom(d).val);
      return { before, after, text, moved };`);
    eq(r.before, 3000);
    eq(r.after, 4200, 'the dimension follows the geometry, got ' + r.after);
    eq(r.text, '4200', 'and says so');
    eq(r.moved, 4200, 'moving the line leaves its length alone');
  });

  /* The stored coordinates are only ever a fallback. What is drawn resolves
     live, so a dimension cannot go stale between an edit and a redraw. */
  t('what is drawn is resolved live, not read from the stored copy', () => {
    const r = R(`${SETUP}${DIMIT}
      begin(); addEnt({t:'line', a:[0,0], b:[3000,0], layer:'0'}); commit('l');
      const ln = [...DOC.ents.values()][0];
      const d = dimBySnap(ln);
      begin(); mut(ln); ln.b = [4200, 0]; commit('stretch');
      /* deliberately NOT saving: the stored copy is still the old one */
      return { stored: d.p2.slice(), drawn: Math.round(dimGeom(d).val) };`);
    eq(r.stored.join(','), '3000,0', 'the stored copy is still the old point');
    eq(r.drawn, 4200, 'and yet the dimension reads the new length');
  });

  t('saving brings the stored fallback up to date', () => {
    const r = R(`${SETUP}${DIMIT}
      begin(); addEnt({t:'line', a:[0,0], b:[3000,0], layer:'0'}); commit('l');
      const ln = [...DOC.ents.values()][0];
      const d = dimBySnap(ln);
      begin(); mut(ln); ln.b = [4200, 0]; commit('stretch');
      const txt = saveNative();
      const afterSave = d.p2.slice();
      /* and it survives the round trip still attached */
      loadNative(txt);
      const d2 = [...DOC.ents.values()].find(e => e.t === 'dim');
      const ln2 = [...DOC.ents.values()].find(e => e.t === 'line');
      begin(); mut(ln2); ln2.b = [5000, 0]; commit('stretch again');
      return { afterSave, reloaded: Math.round(dimGeom(d2).val),
               stillAssoc: dimAssoc(d2) };`);
    eq(r.afterSave.join(','), '4200,0', 'saving refreshes the fallback');
    eq(r.stillAssoc, true, 'the attachment survives a save and load');
    eq(r.reloaded, 5000, 'and still follows the geometry afterwards');
  });

  /* Losing the host must not delete work. AutoCAD keeps the dimension and
     simply stops updating it, which is also the only answer that does not
     silently throw away something a person drew. */
  t('deleting the geometry leaves the dimension with its last value', () => {
    const r = R(`${SETUP}${DIMIT}
      begin(); addEnt({t:'line', a:[0,0], b:[3000,0], layer:'0'}); commit('l');
      const ln = [...DOC.ents.values()][0];
      const d = dimBySnap(ln);
      begin(); delEnt(ln.id); commit('del');
      const after = { val: Math.round(dimGeom(d).val), assoc: dimAssoc(d),
                      exists: !!DOC.ents.get(d.id) };
      /* and undoing the delete reattaches it */
      undo();
      return { after, back: Math.round(dimGeom(d).val), assocBack: dimAssoc(d) };`);
    eq(r.after.exists, true, 'the dimension is not deleted with its host');
    eq(r.after.val, 3000, 'it keeps the last length it knew');
    eq(r.after.assoc, false, 'and reports that it is no longer attached');
    eq(r.assocBack, true, 'undoing the delete attaches it again');
    eq(r.back, 3000);
  });

  t('a dimension picked in open space is not attached to anything', () => {
    const r = R(`${SETUP}
      cancelCmd();
      ST.osnap = false;                    /* nothing to snap to, nothing to attach */
      startCmd('dim');
      cmdPoint([0, 0]); cmdPoint([2500, 0]); cmdPoint([1250, -600]);
      endCmd(true);
      const d = [...DOC.ents.values()].find(e => e.t === 'dim');
      return { made: !!d, r1: d && d.r1 || null, r2: d && d.r2 || null,
               assoc: d && dimAssoc(d), val: d && Math.round(dimGeom(d).val) };`);
    eq(r.made, true);
    eq(r.r1, null, 'a plain dimension stays a plain object');
    eq(r.r2, null);
    eq(r.assoc, false);
    eq(r.val, 2500, 'and still measures what it was given');
  });

  group('walls, which is what a plan is actually made of');

  /* My first pass tested only lines and passed. Walls snap through a different
     producer entirely — wallSnaps, not the generic entity branch — so nothing
     was attached on the one entity type an architectural drawing is made of.
     The browser found that in one try; the suite never would have. */
  t('a dimension attaches to a wall and follows it', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'wall', a:[0,0], b:[4000,0], wt:'brk230', layer:'A-WALL'}); commit('w');
      const w = [...DOC.ents.values()].find(e => e.t === 'wall');
      cancelCmd();
      startCmd('dim');
      const s1 = w2s(w.a); snapPoint(s1[0] + 2, s1[1] + 2, null);
      const meta = ST.snap && ST.snap.meta;
      cmdPoint(ST.snap ? ST.snap.p : w.a);
      const s2 = w2s(w.b); snapPoint(s2[0] + 2, s2[1] + 2, null);
      cmdPoint(ST.snap ? ST.snap.p : w.b);
      cmdPoint([2000, -1200]);
      endCmd(true);
      const d = [...DOC.ents.values()].find(e => e.t === 'dim');
      const before = d && Math.round(dimGeom(d).val);
      begin(); mut(w); w.b = [6500, 0]; commit('stretch');
      const stretched = Math.round(dimGeom(d).val);
      begin(); xf(w, T.rot([0,0], rad(30))); commit('rot');
      const rotated = Math.round(dimGeom(d).val);
      begin(); xf(w, T.move([1000, 500])); commit('move');
      const moved = Math.round(dimGeom(d).val);
      return { meta, attached: !!(d && d.r1 && d.r2), before, stretched, rotated, moved };`);
    ok(r.meta && r.meta.id != null, 'the wall snap must say which wall it came from');
    eq(r.attached, true, 'so the dimension attaches to it');
    eq(r.before, 4000);
    eq(r.stretched, 6500, 'stretching the wall changes the dimension, got ' + r.stretched);
    eq(r.rotated, 6500, 'turning it does not change its length');
    eq(r.moved, 6500, 'nor does moving it');
  });

  /* A wall FACE corner is not a point the wall is defined by — it comes from
     the centreline and the thickness. Recording it as an offset in the wall's
     own frame is what lets it survive the wall being turned. */
  t('a face corner follows the wall through a rotation', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'wall', a:[0,0], b:[4000,0], wt:'brk230', layer:'A-WALL'}); commit('w');
      const w = [...DOC.ents.values()].find(e => e.t === 'wall');
      /* a point on the face at the start end, half the thickness off the line */
      const face = [0, 115];
      const ref = defPointRef(w, face);
      const at0 = refPointOf(w, ref && ref.at, ref);
      begin(); xf(w, T.rot([0,0], rad(90))); commit('rot');
      const at1 = refPointOf(w, ref && ref.at, ref);
      return { ref, at0, at1 };`);
    ok(r.ref && r.ref.at === 'a', 'it attaches to the near end');
    ok(Math.abs(r.at0[0] - 0) < 1e-6 && Math.abs(r.at0[1] - 115) < 1e-6,
      'and resolves back to itself, got ' + r.at0.join(','));
    /* turned 90 degrees about the origin, a point 115 to the left of the wall
       direction ends up 115 along -x */
    ok(Math.abs(r.at1[0] + 115) < 1e-6 && Math.abs(r.at1[1]) < 1e-6,
      'and turns with the wall, got ' + r.at1.map(n => +n.toFixed(3)).join(','));
  });

  group('named dimension styles');

  /* A drawing needs plan dimensions at one size and detail dimensions at
     another on the same sheet, which is why one global set of settings stops
     being enough almost immediately. */
  t('a dimension can name its own style, and falls back to the current one', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[3000,0], layer:'0'}); commit('l');
      cancelCmd();
      startCmd('dim'); cmdPoint([0,0]); cmdPoint([3000,0]); cmdPoint([1500,-600]);
      endCmd(true);
      const d = [...DOC.ents.values()].find(e => e.t === 'dim');
      const asStandard = dimStyle(d).txt;
      /* a bigger style for details */
      dimStyles().push({ name: 'Detail', txt: 5 });
      const stillStandard = dimStyle(d).txt;
      d.style = 'Detail';
      const asDetail = dimStyle(d).txt;
      /* an override on the dimension itself beats its style */
      d.ovr = { txt: 9 };
      const asOverride = dimStyle(d).txt;
      /* and the current style is what a dimension with no style of its own gets */
      DOC.curDim = 'Detail';
      const plain = dimStyle({ t: 'dim' }).txt;
      return { asStandard, stillStandard, asDetail, asOverride, plain,
               names: dimStyles().map(x => x.name) };`);
    eq(r.stillStandard, r.asStandard, 'adding a style changes nothing on its own');
    eq(r.asDetail, 5, 'naming a style uses it, got ' + r.asDetail);
    eq(r.asOverride, 9, 'and the dimension’s own override beats the style');
    eq(r.plain, 5, 'a dimension with no style of its own follows the current one');
    eq(r.names.join(','), 'Standard,Detail');
  });

  t('DIMSTYLE saves, sets current, and applies to a selection', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[3000,0], layer:'0'}); commit('l');
      cancelCmd();
      startCmd('dim'); cmdPoint([0,0]); cmdPoint([3000,0]); cmdPoint([1500,-600]);
      endCmd(true);
      const d = [...DOC.ents.values()].find(e => e.t === 'dim');
      /* save the current settings under a new name */
      startCmd('dimstyle'); dispatch('S'); dispatch('Detail'); endCmd(true);
      const afterSave = { names: dimStyles().map(x => x.name), cur: DOC.curDim };
      /* set back to Standard */
      startCmd('dimstyle'); dispatch('R'); dispatch('Standard'); endCmd(true);
      const afterSet = DOC.curDim;
      /* apply Detail to the selected dimension */
      SEL.clear(); SEL.add(d.id);
      startCmd('dimstyle'); dispatch('A'); dispatch('Detail'); endCmd(true);
      const applied = d.style;
      /* a name that does not exist changes nothing */
      startCmd('dimstyle'); dispatch('R'); dispatch('Nope'); endCmd(true);
      return { afterSave, afterSet, applied, curAfterBad: DOC.curDim };`);
    eq(r.afterSave.names.join(','), 'Standard,Detail');
    eq(r.afterSave.cur, 'Detail', 'saving makes the new style current');
    eq(r.afterSet, 'Standard', 'and it can be set back');
    eq(r.applied, 'Detail', 'applying tags the selected dimension');
    eq(r.curAfterBad, 'Standard', 'an unknown style is refused, not guessed at');
  });

  t('styles travel with the drawing, and an old file keeps its settings', () => {
    const r = R(`${SETUP}
      dimStyles().push({ name: 'Detail', txt: 5 });
      DOC.curDim = 'Detail';
      const txt = saveNative();
      resetDoc();
      loadNative(txt);
      const back = { names: dimStyles().map(x => x.name), cur: DOC.curDim,
                     txt: dimStyle().txt };
      /* a document written before styles existed carried DOC.dimStyle */
      resetDoc();
      const old = JSON.stringify({ app:'orthograph', v:2, units:'mm',
        layers:[newLayer('0')], cur:'0', ents:[],
        dimStyle: { txt: 7, prec: 2 } });
      loadNative(old);
      return { back, migrated: dimStyle().txt, prec: dimStyle().prec,
               styleCount: dimStyles().length };`);
    eq(r.back.names.join(','), 'Standard,Detail', 'styles come back with the file');
    eq(r.back.cur, 'Detail'); eq(r.back.txt, 5);
    eq(r.migrated, 7, 'an old global dimStyle becomes Standard rather than being lost');
    eq(r.prec, 2); eq(r.styleCount, 1);
  });

  t('DIMBASELINE stacks from the first extension line, not the last', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[6000,0], layer:'0'}); commit('l');
      cancelCmd();
      startCmd('dim'); cmdPoint([0,0]); cmdPoint([2000,0]); cmdPoint([1000,-600]);
      endCmd(true);
      const first = [...DOC.ents.values()].find(e => e.t === 'dim');
      startCmd('dimbase');
      cmdPoint([4000, 0]);
      cmdPoint([6000, 0]);
      endCmd(true);
      const dims = [...DOC.ents.values()].filter(e => e.t === 'dim');
      return { n: dims.length,
               starts: dims.map(d => Math.round(dimEnd(d, 1)[0])),
               ends: dims.map(d => Math.round(dimEnd(d, 2)[0])),
               offs: dims.map(d => Math.round(Math.abs(d.off))) };`);
    eq(r.n, 3, 'two more dimensions are stacked on the first');
    eq(r.starts.join(','), '0,0,0', 'every one starts at the FIRST extension line');
    eq(r.ends.join(','), '2000,4000,6000', 'and ends where it was picked');
    ok(r.offs[1] > r.offs[0] && r.offs[2] > r.offs[1],
      'each sits further out so they do not overlap, got ' + r.offs.join(','));
  });
};
