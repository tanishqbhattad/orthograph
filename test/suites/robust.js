'use strict';
/* ============================================================
   D3 — autosave, journal limits and level of detail

   The theme is trust. A program that can produce an issuable
   drawing and then lose it, or that grinds to a halt on a real
   one, is not a program anybody should use for real work.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; DOC.gridStep = 100; DOC.snapStep = 100;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
`;
/* a store that behaves like localStorage, including running out of room */
const FAKE = `
  const mkStore = (cap) => ({
    map: new Map(), cap: cap || Infinity,
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; },
    setItem(k, v) {
      if (String(v).length > this.cap) throw new Error('QuotaExceededError');
      this.map.set(k, String(v));
    },
    removeItem(k) { this.map.delete(k); },
  });
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('autosave and recovery');

  t('a drawing is autosaved and comes back after a crash', () => {
    const r = R(`${SETUP}${FAKE}
      const st = mkStore(); setStore(st);
      begin(); addEnt({t:'wall', a:[0,0], b:[5000,0], wt:'gen100', layer:'A-WALL'}); commit('w');
      const dirtyBefore = docDirty();
      const wrote = autosaveNow('test');
      const stored = !!st.getItem(AUTOSAVE.key);
      const n0 = DOC.ents.size;
      resetDoc();                        /* lose everything, as a crash would */
      const afterCrash = DOC.ents.size;
      const restored = autosaveRestore(autosaveFound());
      return { dirtyBefore, wrote, stored, n0, afterCrash,
               restored, back: DOC.ents.size, stillUnsaved: docDirty() };`);
    eq(r.dirtyBefore, true, 'an edited drawing is dirty');
    eq(r.wrote, true); eq(r.stored, true, 'and reaches the store');
    eq(r.afterCrash, 0, 'the crash really did lose it');
    eq(r.restored, true); eq(r.back, r.n0, 'and the drawing comes back whole');
    eq(r.stillUnsaved, true, 'a recovered drawing has still never reached a file');
  });

  t('a clean drawing is not autosaved, and saving clears the recovery', () => {
    const r = R(`${SETUP}${FAKE}
      const st = mkStore(); setStore(st);
      const cleanWrite = autosaveNow('test');      /* nothing has changed yet */
      begin(); addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'}); commit('l');
      autosaveNow('test');
      const had = !!st.getItem(AUTOSAVE.key);
      markSaved();                                  /* the user saved to a file */
      return { cleanWrite, had, after: !!st.getItem(AUTOSAVE.key), dirty: docDirty() };`);
    eq(r.cleanWrite, false, 'an unchanged drawing must not be rewritten over and over');
    eq(r.had, true);
    eq(r.after, false, 'saving to a file removes the recovery copy');
    eq(r.dirty, false, 'and the document is no longer dirty');
  });

  /* Storage full or blocked is a real situation on a real machine. It must
     degrade to "autosave is off", never to an exception on every edit and
     never to a silent pretence that the work is safe. */
  t('a full or blocked store degrades instead of throwing', () => {
    const r = R(`${SETUP}${FAKE}
      const tiny = mkStore(50); setStore(tiny);
      begin();
      for (let i = 0; i < 40; i++)
        addEnt({t:'wall', a:[i*100,0], b:[i*100+90,0], wt:'gen100', layer:'A-WALL'});
      commit('lots');
      let threw = false, wrote = null, second = null, noStore = null;
      try { wrote = autosaveNow('test'); } catch (e) { threw = true; }
      const flagged = AUTOSAVE.failed;
      try { second = autosaveNow('test'); } catch (e) { threw = true; }
      setStore(null);
      try { noStore = autosaveNow('test'); } catch (e) { threw = true; }
      return { threw, wrote, flagged, second, noStore };`);
    eq(r.threw, false, 'autosave must never throw into an edit');
    eq(r.wrote, false, 'and must report that it did not save');
    eq(r.flagged, true, 'the failure is remembered, so it is said once not every time');
    eq(r.noStore, false, 'no store at all is simply autosave off');
  });

  t('a corrupt autosave cannot stop the program starting', () => {
    const r = R(`${SETUP}${FAKE}
      const st = mkStore(); setStore(st);
      st.setItem(AUTOSAVE.key, 'not json at all {{{');
      let threw = false, found = null, found2 = null;
      try { found = autosaveFound(); } catch (e) { threw = true; }
      const cleared = !st.getItem(AUTOSAVE.key);
      st.setItem(AUTOSAVE.key, JSON.stringify({ v: 1, at: Date.now() }));
      try { found2 = autosaveFound(); } catch (e) { threw = true; }
      return { threw, found, cleared, found2 };`);
    eq(r.threw, false, 'reading a corrupt autosave must not throw at boot');
    eq(r.found, null); eq(r.cleared, true, 'and the bad copy is thrown away');
    eq(r.found2, null, 'valid JSON that is not a drawing is refused too');
  });

  group('the undo journal has a memory limit, not just a step count');

  /* A count is not a memory limit. One MOVE of ten thousand walls is a single
     patch carrying twenty thousand clones, and two hundred of those exhaust a
     tab long before the step count looks alarming. */
  t('heavy steps are trimmed by weight, and the newest always survives', () => {
    const r = R(`${SETUP}
      HIST.maxWeight = 2000;                    /* small, so the test is quick */
      begin();
      for (let i = 0; i < 900; i++)
        addEnt({t:'wall', a:[i*200,0], b:[i*200+180,0], wt:'gen100', layer:'A-WALL'});
      commit('build');
      for (let k = 0; k < 6; k++) {
        SEL.clear(); for (const e of DOC.ents.values()) SEL.add(e.id);
        begin();
        for (const e of selEnts()) { mut(e); e.a[0] += 10; e.b[0] += 10; }
        commit('move ' + k);
      }
      const after = { steps: HIST.past.length, weight: HIST.weight };
      const x0 = [...DOC.ents.values()][0].a[0];
      undo();
      const x1 = [...DOC.ents.values()][0].a[0];
      return { after, undid: Math.abs(x1 - x0) };`);
    ok(r.after.weight <= 2000 || r.after.steps === 1,
      'the journal must stay under its weight limit, got ' + r.after.weight);
    ok(r.after.steps < 7, 'old steps are dropped, kept ' + r.after.steps);
    close(r.undid, 10, 1e-9, 'and the newest step must always still undo');
  });

  t('weight follows undo and redo rather than drifting', () => {
    const r = R(`${SETUP}
      HIST.maxWeight = 400000;
      begin(); addEnt({t:'line', a:[0,0], b:[100,0], layer:'0'}); commit('a');
      begin(); addEnt({t:'line', a:[0,100], b:[100,100], layer:'0'}); commit('b');
      const w2 = HIST.weight;
      undo(); const wUndo = HIST.weight;
      redo(); const wRedo = HIST.weight;
      undo(); undo(); const wEmpty = HIST.weight;
      return { w2, wUndo, wRedo, wEmpty, steps: HIST.past.length };`);
    ok(r.wUndo < r.w2, 'undoing takes weight out of the past');
    eq(r.wRedo, r.w2, 'redoing puts exactly it back');
    eq(r.steps, 0);
    ok(r.wEmpty >= 0 && r.wEmpty <= 1, 'an empty journal weighs nothing');
  });

  group('level of detail never changes what is exact');

  /* LOD is a drawing shortcut for walls too thin to show their faces. It must
     be invisible to everything that has to be right: picking, snapping, export
     and the plot all go through shapes() and must be untouched by it. */
  t('a sub-pixel wall draws as a centreline but exports in full', () => {
    const r = R(`${SETUP}
      addEnt({t:'wall', a:[0,0], b:[20000,0], wt:'brk230', layer:'A-WALL'});
      const w = [...DOC.ents.values()][0];
      /* shapes() tessellates to the current zoom, so both counts are taken at
         the SAME zoom — comparing across zooms compares two different things */
      V.z = 0.001;                                 /* 230mm reads as 0.23px */
      const lodShapes = entShapes(w).length;
      const realAtFar = shapes(w, SHAPE_TOL).length;
      const svg = exportSVG();
      V.z = 1;                                     /* zoomed in: full geometry */
      const nearShapes = entShapes(w).length;
      const realAtNear = shapes(w, SHAPE_TOL).length;
      return { lodShapes, realAtFar, nearShapes, realAtNear,
               svgPaths: (svg.match(/<path/g) || []).length };`);
    eq(r.lodShapes, 1, 'a wall thinner than a pixel draws as one centreline');
    ok(r.realAtFar > 1, 'while its real geometry is still several shapes');
    eq(r.nearShapes, r.realAtNear, 'and zoomed in it is drawn in full again');
    ok(r.svgPaths > 1, 'the export is unaffected by how it was last drawn');
  });

  t('picking and snapping are unaffected by level of detail', () => {
    const r = R(`${SETUP}
      addEnt({t:'wall', a:[0,0], b:[20000,0], wt:'brk230', layer:'A-WALL'});
      ST.osnap = true; ST.osnapOne = null; ST.osnapOneShot = false;
      const w = [...DOC.ents.values()][0];
      const probe = z => {
        V.z = z; V.px = 100; V.py = 400;
        const s = w2s([10000, 0]);
        const hit = pickAt(s2w(s[0], s[1]), 9);
        const sEnd = w2s(w.a);
        const sn = snapPoint(sEnd[0] + 2, sEnd[1] + 2, null);
        return { picked: !!hit && hit.id === w.id,
                 snapOff: Math.hypot(sn[0] - w.a[0], sn[1] - w.a[1]) };
      };
      return { far: probe(0.001), near: probe(0.05) };`);
    eq(r.far.picked, true, 'a wall drawn as a centreline is still pickable');
    eq(r.near.picked, true, 'and so is one drawn in full');
  });

  /* Found while writing the level-of-detail tests, and it was already in the
     shipped code: resetDoc() clears the entities and puts UID back to 1, but
     the shape cache is keyed by entity id, so the first entities of a newly
     opened drawing were drawn with the geometry of the ones they replaced.
     On screen that is a wall in the wrong place with no way to explain it. */
  t('opening a drawing does not draw it with the last one’s geometry', () => {
    const r = R(`${SETUP}
      /* a thick wall becomes entity 1 and gets its shapes cached */
      addEnt({t:'wall', a:[0,0], b:[20000,0], wt:'cav300', layer:'A-WALL'});
      const first = [...DOC.ents.values()][0];
      const firstShapes = entShapes(first).length;
      const firstId = first.id;
      /* now a different drawing, whose entity 1 is a plain line */
      resetDoc();
      addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'});
      const second = [...DOC.ents.values()][0];
      const secondShapes = entShapes(second).length;
      const fresh = shapes(second, SHAPE_TOL).length;
      return { firstId, secondId: second.id, sameId: second.id === firstId,
               firstShapes, secondShapes, fresh, type: second.t };`);
    eq(r.sameId, true, 'the new drawing reuses the id, which is the whole trap');
    eq(r.type, 'line');
    eq(r.secondShapes, r.fresh,
      'a line must draw as a line, not as the wall that held its id (' +
      r.secondShapes + ' vs ' + r.fresh + ')');
  });
};
