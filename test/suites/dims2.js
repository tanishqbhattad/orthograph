'use strict';
/* ============================================================
   B3 — the two dimension kinds that were missing

   ORDINATE is how a setting-out drawing is dimensioned: not a
   chain of sizes between features, but each feature's distance
   from one datum, so an error in one does not walk down the
   whole run. There was no way to draw one.

   ARC LENGTH measures along a curve. An aligned dimension across
   the ends of an arc measures the CHORD, which for anything but
   a shallow arc is a different number — and the one you would
   have read off the drawing and built to.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; DOC.textH = 250; DOC.dimScale = 1;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('DIMENSIONS');
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('ordinate dimensions');

  t('an X ordinate reports how far along the feature is, not how far away', () => {
    const r = R(`${SETUP}
      begin();
      const d = addEnt({t:'dim', k:'ordinate', axis:'x', p1:[3200,1500], p2:[3200,4000],
                        layer:'DIMENSIONS'});
      commit('d');
      const g = dimGeom(d);
      return { val: g.val, txt: g.txt };`);
    close(r.val, 3200, 0.01, 'the X of the feature from the datum');
    ok(/3200/.test(r.txt), 'and says so: ' + r.txt);
  });

  t('a Y ordinate reports the other one', () => {
    const r = R(`${SETUP}
      begin();
      const d = addEnt({t:'dim', k:'ordinate', axis:'y', p1:[3200,1500], p2:[6000,1500],
                        layer:'DIMENSIONS'});
      commit('d');
      return { val: dimGeom(d).val };`);
    close(r.val, 1500, 0.01, 'the Y of the feature');
  });

  /* Setting out is always from a datum, and it is rarely the world origin. */
  t('the datum can be somewhere other than 0,0', () => {
    const r = R(`${SETUP}
      begin();
      const d = addEnt({t:'dim', k:'ordinate', axis:'x', p1:[3200,1500], p2:[3200,4000],
                        datum:[1200,400], layer:'DIMENSIONS'});
      commit('d');
      return { val: dimGeom(d).val };`);
    close(r.val, 2000, 0.01, '3200 measured from a datum at 1200 is 2000');
  });

  t('with no axis given it picks the one the leader is drawn along', () => {
    const r = R(`${SETUP}
      begin();
      /* leader runs mostly in Y, so the feature is being called out in X */
      const x = addEnt({t:'dim', k:'ordinate', p1:[3200,1500], p2:[3300,6000], layer:'DIMENSIONS'});
      /* leader runs mostly in X, so it is a Y ordinate */
      const y = addEnt({t:'dim', k:'ordinate', p1:[3200,1500], p2:[9000,1600], layer:'DIMENSIONS'});
      commit('d');
      return { x: dimGeom(x).val, y: dimGeom(y).val };`);
    close(r.x, 3200, 0.01, 'a leader pulled up calls out X, got ' + r.x);
    close(r.y, 1500, 0.01, 'a leader pulled across calls out Y, got ' + r.y);
  });

  t('it draws a jogged leader from the feature to the text, and no arrows', () => {
    const r = R(`${SETUP}
      begin();
      const d = addEnt({t:'dim', k:'ordinate', axis:'x', p1:[3200,1500], p2:[3200,4000],
                        layer:'DIMENSIONS'});
      commit('d');
      const g = dimGeom(d);
      const ends = g.lines.flat();
      const startsAtFeature = ends.some(p => Math.abs(p[0] - 3200) < 1 && Math.abs(p[1] - 1500) < 1);
      const endsAtText = ends.some(p => Math.abs(p[0] - 3200) < 1 && Math.abs(p[1] - 4000) < 1);
      return { lines: g.lines.length, arrows: g.arrows.length, startsAtFeature, endsAtText,
               tp: g.tp };`);
    ok(r.lines >= 1, 'there is a leader');
    eq(r.arrows.length !== undefined ? r.arrows : 0, 0,
      'an ordinate has no arrowheads — nothing is being spanned');
    eq(r.startsAtFeature, true, 'it starts at the feature');
    eq(r.endsAtText, true, 'and ends where the text is');
  });

  t('DIMORDINATE draws one from two picks', () => {
    const r = R(`${SETUP}
      cancelCmd(); startCmd('dimordinate');
      cmdPoint([3200, 1500]); cmdPoint([3200, 4000]);
      endCmd(true);
      const d = [...DOC.ents.values()].find(e => e.t === 'dim' && e.k === 'ordinate');
      return { made: !!d, val: d && Math.round(dimGeom(d).val) };`);
    eq(r.made, true, 'the command exists and draws one');
    eq(r.val, 3200, 'measuring the feature it was pointed at');
  });

  group('arc length dimensions');

  /* A quarter circle of radius 2000: the arc is 3141.6 long and the chord
     across its ends is 2828.4. Reading the chord off a drawing and cutting
     that length of handrail is the mistake this prevents. */
  t('it measures along the arc, not across it', () => {
    const r = R(`${SETUP}
      begin();
      const d = addEnt({t:'dim', k:'arclen', p3:[0,0], p1:[2000,0], p2:[0,2000],
                        off:300, layer:'DIMENSIONS'});
      commit('d');
      const g = dimGeom(d);
      return { val: g.val, chord: dist([2000,0],[0,2000]), txt: g.txt };`);
    close(r.val, Math.PI / 2 * 2000, 1, 'a quarter of a 2000 radius is 3141.6, got ' + Math.round(r.val));
    ok(Math.abs(r.val - r.chord) > 300, 'which is not the chord, ' + Math.round(r.chord));
  });

  t('the text is marked as an arc length so it cannot be read as a chord', () => {
    const r = R(`${SETUP}
      begin();
      const d = addEnt({t:'dim', k:'arclen', p3:[0,0], p1:[2000,0], p2:[0,2000],
                        off:300, layer:'DIMENSIONS'});
      commit('d');
      return { txt: dimGeom(d).txt };`);
    ok(/[⌒◠]/.test(r.txt) || /arc/i.test(r.txt),
      'it carries the arc-length symbol: ' + r.txt);
  });

  t('the offset moves the dimension line off the arc, not the measurement', () => {
    const r = R(`${SETUP}
      begin();
      const a = addEnt({t:'dim', k:'arclen', p3:[0,0], p1:[2000,0], p2:[0,2000],
                        off:300, layer:'DIMENSIONS'});
      const b = addEnt({t:'dim', k:'arclen', p3:[0,0], p1:[2000,0], p2:[0,2000],
                        off:1500, layer:'DIMENSIONS'});
      commit('d');
      const ga = dimGeom(a), gb = dimGeom(b);
      return { va: ga.val, vb: gb.val, ra: ga.arcR, rb: gb.arcR };`);
    close(r.va, r.vb, 0.01, 'the measurement is the arc, wherever the line is drawn');
    ok(r.rb > r.ra, 'but the line moves out: ' + Math.round(r.ra) + ' vs ' + Math.round(r.rb));
  });

  t('DIMARC picks an arc and measures it', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'arc', c:[0,0], r:2000, a0:0, a1:Math.PI/2, layer:'0'});
      commit('a');
      cancelCmd(); startCmd('dimarc');
      cmdPoint([1414, 1414]);      /* on the arc */
      endCmd(true);
      const d = [...DOC.ents.values()].find(e => e.t === 'dim' && e.k === 'arclen');
      return { made: !!d, val: d && Math.round(dimGeom(d).val) };`);
    eq(r.made, true, 'the command exists and draws one');
    close(r.val, Math.round(Math.PI / 2 * 2000), 2, 'measuring the arc it was pointed at');
  });

  group('they behave like the dimensions they are');

  t('both survive a save and reopen', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'dim', k:'ordinate', axis:'x', p1:[3200,1500], p2:[3200,4000], layer:'DIMENSIONS'});
      addEnt({t:'dim', k:'arclen', p3:[0,0], p1:[2000,0], p2:[0,2000], off:300, layer:'DIMENSIONS'});
      commit('d');
      loadNative(saveNative());
      const ds = [...DOC.ents.values()].filter(e => e.t === 'dim');
      return { kinds: ds.map(d => d.k).sort().join(','),
               vals: ds.map(d => Math.round(dimGeom(d).val)).sort((a,b) => a-b) };`);
    eq(r.kinds, 'arclen,ordinate', 'both came back');
    eq(r.vals.join(','), '3142,3200', 'still measuring what they measured');
  });

  /* R2000 has a real ordinate dimension and no arc-length one — ARC_DIMENSION
     arrives in AC1021. Writing the arc length as some other dimension type
     would be a file that says a measurement is something it is not. */
  t('an ordinate goes to DXF as a real ordinate dimension', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'dim', k:'ordinate', axis:'x', p1:[3200,1500], p2:[3200,4000], layer:'DIMENSIONS'});
      commit('d');
      const dxf = exportDXF();
      return { ordinate: dxf.indexOf('AcDbOrdinateDimension') >= 0,
               dims: dxf.split('AcDbDimension').length - 1,
               has3200: dxf.indexOf('3200') >= 0 };`);
    eq(r.ordinate, true, 'written as AcDbOrdinateDimension');
    eq(r.dims, 1, 'one dimension entity');
    ok(r.has3200, 'carrying the value it measured');
  });

  t('an arc length is flattened rather than written as a dimension it is not', () => {
    const r = R(`${SETUP}
      begin();
      const a = addEnt({t:'dim', k:'arclen', p3:[0,0], p1:[2000,0], p2:[0,2000],
                        off:300, layer:'DIMENSIONS'});
      commit('d');
      const dxf = exportDXF();
      return { direct: dxfDirect(a), flat: flattenToPrimitives(a).length,
               dims: dxf.split('AcDbDimension').length - 1,
               len: dxf.length };`);
    eq(r.direct, false, 'it has no R2000 equivalent, so it is not written as one');
    ok(r.flat > 10, 'it flattens to the geometry it draws, got ' + r.flat + ' primitives');
    eq(r.dims, 0, 'and no DIMENSION entity claims to be it');
    ok(r.len > 1000, 'the file is still written');
  });
};
