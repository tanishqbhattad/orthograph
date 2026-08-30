'use strict';
/* ============================================================
   8.5 — detail views

   A callout on a plan says "this bit is drawn bigger, over
   there". Two halves that must agree: a bubble on the parent
   drawing carrying a number and the sheet the detail sits on,
   and an enlarged view of exactly that region.

   The half that rots in every drawing set ever issued is the
   reference. Someone moves the detail to another sheet and the
   bubble goes on naming the old one. So the bubble does not
   store a sheet name — it names whichever sheet is holding the
   viewport it points at, resolved when it is drawn. It cannot
   be wrong, because there is nothing to keep in step.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  const plan = () => {
    ensureLayer('A-WALL');
    begin();
    addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'gen100', layer:'A-WALL'});
    addEnt({t:'wall', a:[6000,0], b:[6000,4000], wt:'gen100', layer:'A-WALL'});
    commit('m');
    const sh = newSheet('A-301', 'A3', true);
    sh.viewports.push(newViewport(sh, [3000,2000], 1/100));
    DOC.sheets.push(sh); DOC.curSheet = sh.id;
    return sh;
  };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('placing a detail');

  t('DETAIL leaves a callout on the drawing and a view on the sheet', () => {
    const r = R(`${SETUP}
      const sh = plan();
      const before = sh.viewports.length;
      cancelCmd(); startCmd('detail');
      cmdPoint([6000, 0]); cmdPoint([6800, 0]);      /* centre, then radius */
      cmdText('10');                                  /* 1:10 */
      const co = [...DOC.ents.values()].find(e => e.t === 'callout');
      const vps = curSheet().viewports;
      const det = vps[vps.length - 1];
      return { made: !!co, r: co && Math.round(co.r), key: co && co.key,
               added: vps.length - before,
               scale: det && Math.round(1 / det.scale),
               centre: det && det.centre.map(Math.round),
               linked: !!(co && det && co.vp === det.id) };`);
    eq(r.made, true, 'a callout is placed');
    eq(r.r, 800, 'of the radius you drew');
    eq(r.added, 1, 'and one detail viewport appears on the sheet');
    eq(r.scale, 10, 'at the scale asked for');
    eq(r.centre.join(','), '6000,0', 'looking at what the callout circled');
    eq(r.linked, true, 'and the two know about each other');
  });

  t('details number themselves 1, 2, 3', () => {
    const r = R(`${SETUP}
      plan();
      const place = (x) => { cancelCmd(); startCmd('detail');
        cmdPoint([x, 0]); cmdPoint([x + 500, 0]); cmdText('10'); };
      place(0); place(2000); place(4000);
      return { keys: [...DOC.ents.values()].filter(e => e.t === 'callout').map(e => e.key) };`);
    eq(r.keys.join(','), '1,2,3', 'got ' + r.keys.join(','));
  });

  group('the reference cannot go stale');

  t('the bubble names whichever sheet is holding the detail', () => {
    const r = R(`${SETUP}
      const sh = plan();
      cancelCmd(); startCmd('detail');
      cmdPoint([6000,0]); cmdPoint([6800,0]); cmdText('10');
      const co = [...DOC.ents.values()].find(e => e.t === 'callout');
      const first = calloutSheet(co);
      /* the thing that happens on every real job: the detail is moved to
         another sheet a week later */
      const s2 = newSheet('A-302', 'A3', true);
      DOC.sheets.push(s2);
      const vps = curSheet().viewports;
      s2.viewports.push(vps.pop());
      const second = calloutSheet(co);
      const txt = shapes(co).filter(x => x.text).map(x => x.text);
      return { first, second, txt };`);
    eq(r.first, 'A-301', 'the sheet it was placed on');
    eq(r.second, 'A-302', 'and the one it was moved to, with nothing to update');
    ok(r.txt.indexOf('A-302') >= 0,
      'which is what the bubble draws: ' + r.txt.join(' / '));
  });

  t('a detail whose view has been deleted says so instead of lying', () => {
    const r = R(`${SETUP}
      const sh = plan();
      cancelCmd(); startCmd('detail');
      cmdPoint([6000,0]); cmdPoint([6800,0]); cmdText('10');
      const co = [...DOC.ents.values()].find(e => e.t === 'callout');
      curSheet().viewports.pop();
      let threw = null; let txt = [];
      try { txt = shapes(co).filter(x => x.text).map(x => x.text); }
      catch (e) { threw = e.message; }
      return { threw, sheet: calloutSheet(co), txt };`);
    eq(r.threw, null, 'no throw');
    eq(r.sheet, null, 'and no sheet claimed');
    ok(r.txt.join('').indexOf('A-301') < 0, 'the bubble does not name a sheet it is not on');
  });

  group('the view itself');

  t('a detail viewport is clipped round, not square', () => {
    const r = R(`${SETUP}
      const sh = plan();
      cancelCmd(); startCmd('detail');
      cmdPoint([6000,0]); cmdPoint([6800,0]); cmdText('10');
      const det = curSheet().viewports[curSheet().viewports.length - 1];
      const svg = sheetSVG(curSheet());
      return { round: !!det.round, w: Math.round(det.w), h: Math.round(det.h),
               svgCirc: /<clipPath[^>]*><circle/.test(svg) };`);
    eq(r.round, true, 'the viewport knows it is a round one');
    eq(r.w, r.h, 'and is square on the paper, so the circle fits it');
    eq(r.svgCirc, true, 'the plot clips it to the circle too');
  });

  t('what it shows is the region the callout circled, at the detail scale', () => {
    const r = R(`${SETUP}
      const sh = plan();
      cancelCmd(); startCmd('detail');
      cmdPoint([6000,0]); cmdPoint([6800,0]); cmdText('10');
      const det = curSheet().viewports[curSheet().viewports.length - 1];
      /* 800mm of model at 1:10 is 80mm of paper, so the window must be at
         least that across or the callout is showing less than it circled */
      return { across: Math.round(det.w), need: Math.round(800 * 2 * det.scale) };`);
    ok(r.across >= r.need,
      'the window fits what was circled: ' + r.across + 'mm for ' + r.need + 'mm');
  });

  t('moving the callout moves the view with it', () => {
    const r = R(`${SETUP}
      const sh = plan();
      cancelCmd(); startCmd('detail');
      cmdPoint([6000,0]); cmdPoint([6800,0]); cmdText('10');
      const co = [...DOC.ents.values()].find(e => e.t === 'callout');
      begin(); mut(co); GEOM.callout.xf(co, p => [p[0] - 3000, p[1] + 1000]); commit('mv');
      const det = curSheet().viewports[curSheet().viewports.length - 1];
      return { c: co.c.map(Math.round), centre: det.centre.map(Math.round) };`);
    eq(r.c.join(','), '3000,1000', 'the callout moved');
    eq(r.centre.join(','), '3000,1000', 'and the detail is looking at where it went');
  });

  group('it is an object like any other');

  t('it draws, measures and can be picked', () => {
    const r = R(`${SETUP}
      plan();
      cancelCmd(); startCmd('detail');
      cmdPoint([6000,0]); cmdPoint([6800,0]); cmdText('10');
      const co = [...DOC.ents.values()].find(e => e.t === 'callout');
      const b = bbox(co);
      return { shapes: shapes(co).length,
               wide: Math.round(b[2] - b[0]),
               onEdge: Math.round(entDist([6800, 0], co)),
               offCentre: Math.round(entDist([6000, 0], co)) };`);
    ok(r.shapes >= 2, 'a circle and a bubble at least: ' + r.shapes);
    ok(r.wide >= 1600, 'its extents cover the circle: ' + r.wide);
    eq(r.onEdge, 0, 'picking on the circle finds it');
    ok(r.offCentre > 100, 'and the middle of it is not the object');
  });

  t('it survives the project file, still pointing at its view', () => {
    const r = R(`${SETUP}
      plan();
      cancelCmd(); startCmd('detail');
      cmdPoint([6000,0]); cmdPoint([6800,0]); cmdText('10');
      loadNative(saveNative());
      const co = [...DOC.ents.values()].find(e => e.t === 'callout');
      return { there: !!co, key: co && co.key, sheet: co && calloutSheet(co),
               r: co && Math.round(co.r) };`);
    eq(r.there, true, 'the callout is in the file');
    eq(r.key, '1');
    eq(r.r, 800);
    eq(r.sheet, 'A-301', 'and still finds its detail');
  });

  t('DETAIL without a sheet still marks the drawing', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'gen100', layer:'A-WALL'}); commit('m');
      DOC.curSheet = null;
      cancelCmd(); startCmd('detail');
      cmdPoint([3000,0]); cmdPoint([3500,0]);
      const co = [...DOC.ents.values()].find(e => e.t === 'callout');
      return { made: !!co, vp: co && co.vp, sheet: co && calloutSheet(co) };`);
    eq(r.made, true, 'the callout is placed anyway');
    eq(r.vp, null, 'with nothing to point at yet');
    eq(r.sheet, null, 'and it does not claim a sheet');
  });
  /* A callout ring drawn across the middle of its own enlargement is the
     mark of a drawing set nobody checked. */
  t('the detail does not show the callout that called it', () => {
    const r = R(`${SETUP}
      const sh = plan();
      cancelCmd(); startCmd('detail');
      cmdPoint([6000,0]); cmdPoint([6800,0]); cmdText('10');
      const co = [...DOC.ents.values()].find(e => e.t === 'callout');
      const det = curSheet().viewports[curSheet().viewports.length - 1];
      return { frozen: vpFrozen(det, co.layer),
               plan: vpFrozen(curSheet().viewports[0], co.layer) };`);
    eq(r.frozen, true, 'the callout layer is frozen in the detail view');
    eq(r.plan, false, 'and shown on the plan, which is where it belongs');
  });
};
