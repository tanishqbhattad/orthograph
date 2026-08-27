'use strict';
/* ============================================================
   Settings that have to survive being saved

   A field the program accepts, stores and acts on, and then does
   not write to the file, is a setting that quietly reverts every
   time the drawing is reopened — with nothing to say it happened.

   Two of these changed NUMBERS rather than appearance. An
   ordinate dimension measures from a datum; lose the datum and
   every one of them reports a different figure on a setting-out
   drawing. Annotative text is sized by the annotation scale; lose
   the scale and every note on the sheet changes size.

   The list below is deliberately an allow-list of what may be
   forgotten, so a setting added later without being persisted
   fails here rather than being discovered by somebody whose
   drawing came back wrong.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
`;
/* Session state, not drawing state: correct to leave out of the file. */
const MAY_BE_FORGOTTEN = ['savedSeq'];

module.exports = ({ group, t, ok, eq, close, R }) => {

  group('what the project file keeps');

  t('every document setting is written, or is on the list of ones that need not be', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[1,1], layer:'0'}); commit('x');
      const written = Object.keys(JSON.parse(saveNative()));
      const live = Object.keys(DOC).filter(k => k !== 'ents');
      return { missing: live.filter(k => written.indexOf(k) < 0).sort() };`);
    const unexpected = r.missing.filter(k => MAY_BE_FORGOTTEN.indexOf(k) < 0);
    eq(unexpected.length, 0,
      'these are set on the document and never saved: ' + unexpected.join(', '));
  });

  /* The round trip, not just the presence of a key: a setting can be written
     under one name and read under another, which looks fine until you reopen. */
  t('and comes back with the value it went in with', () => {
    const r = R(`${SETUP}
      DOC.ltScale = 2.5;
      DOC.annoScale = 1 / 75;
      DOC.ordDatum = [1200, 400];
      DOC.wallHatch = false;
      DOC.areaUnits = 'm2';
      DOC.altArea = true;
      DOC.filletR = 275; DOC.chamD = 125;
      begin(); addEnt({t:'line', a:[0,0], b:[1,1], layer:'0'}); commit('x');
      loadNative(saveNative());
      return { ltScale: DOC.ltScale, annoScale: DOC.annoScale, ordDatum: DOC.ordDatum,
               wallHatch: DOC.wallHatch, areaUnits: DOC.areaUnits, altArea: DOC.altArea,
               filletR: DOC.filletR, chamD: DOC.chamD };`);
    close(r.ltScale, 2.5, 1e-9, 'LTSCALE');
    close(r.annoScale, 1 / 75, 1e-9, 'the annotation scale');
    eq(String(r.ordDatum), '1200,400', 'the ordinate datum');
    eq(r.wallHatch, false, 'the wall poche setting');
    eq(r.areaUnits, 'm2', 'the area units');
    eq(r.altArea, true, 'the second area unit');
    close(r.filletR, 275, 1e-9, 'the fillet radius');
    close(r.chamD, 125, 1e-9, 'the chamfer distance');
  });

  /* The two that change numbers rather than appearance. */
  t('an ordinate dimension measures the same after a reopen', () => {
    const r = R(`${SETUP}
      DOC.ordDatum = [1200, 400];
      begin();
      addEnt({t:'dim', k:'ordinate', axis:'x', p1:[3200,1500], p2:[3200,4000],
              datum: DOC.ordDatum, layer:'DIMENSIONS'});
      commit('d');
      const before = dimGeom([...DOC.ents.values()][0]).val;
      loadNative(saveNative());
      const after = dimGeom([...DOC.ents.values()][0]).val;
      return { before, after };`);
    close(r.before, 2000, 0.01, '3200 from a datum at 1200 is 2000');
    close(r.after, r.before, 0.01,
      'and still is once reopened, got ' + r.after);
  });

  t('an annotative note is the same size after a reopen', () => {
    const r = R(`${SETUP}
      DOC.annoScale = 1 / 50;
      begin();
      addEnt({t:'text', p:[0,0], s:'NOTE', h:2.5, rot:0, anchor:'l', anno:true, layer:'0'});
      commit('t');
      const h = () => { const e = [...DOC.ents.values()].find(x => x.t === 'text');
        const s = shapes(e, 32).find(x => x.text != null); return s && s.h; };
      const before = h();
      loadNative(saveNative());
      return { before, after: h(), scale: DOC.annoScale };`);
    close(r.before, 125, 0.01, '2.5mm of paper at 1:50 is 125');
    close(r.after, r.before, 0.01, 'and the same after reopening, got ' + r.after);
  });

  t('a drawing saved before these existed still opens', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[5000,0], layer:'0'}); commit('l');
      const old = JSON.parse(saveNative());
      for (const k of ['ltScale', 'annoScale', 'ordDatum', 'wallHatch',
                       'areaUnits', 'altArea', 'filletR', 'chamD']) delete old[k];
      const took = loadNative(JSON.stringify(old));
      let painted = 'ok';
      try { paint(); } catch (e) { painted = 'THREW ' + e.message; }
      return { took, ents: DOC.ents.size, painted,
               scale: annoScale(), datum: DOC.ordDatum || null };`);
    ok(r.took !== false, 'an older file still opens');
    eq(r.ents, 1, 'with its drawing');
    eq(r.painted, 'ok', 'and draws');
    ok(r.scale > 0, 'falling back to a usable annotation scale');
  });
};
