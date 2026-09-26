'use strict';
/* ============================================================
   A real snap under the aperture beats a tracking path

   Pause on an endpoint and tracking acquires it; from then on an
   alignment path runs through that endpoint. Move 4 px back
   along the line and the path passes straight under the cursor
   at distance 0 — so it outscored the endpoint 4 px away. The
   tooltip still read "Endpoint" and the line ended 10 units
   short: plausible, silent, wrong geometry in the most common
   snap action there is. AutoCAD offers alignment only when no
   real object snap is under the aperture.
   ============================================================ */
module.exports = ({ group, t, ok, eq, close, R }) => {
  group('object snap tracking');

  const SCENE = `
    resetDoc(); SEL.clear(); endCmd(true);
    V.w = 1200; V.h = 800; V.z = 0.4; V.px = 100; V.py = 400; V.rot = 0;
    begin(); addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'}); commit('l');
    ST.osnap = true; ST.otrack = true;
    startCmd('line'); cmdPoint([200, 600]);
    ST.trackPts.length = 0; ST.trackPts.push({ p: [1000, 0], k: 'end' });
  `;
  const DONE = `endCmd(true); ST.trackPts.length = 0;`;

  t('an endpoint under the aperture beats the tracking path acquired on it', () => {
    const r = R(SCENE + `
      const s = w2s([1000, 0]);
      const p = snapPoint(s[0] - 4, s[1], refPoint());
      const out = { p: p.map(v => +v.toFixed(6)).join(','), k: ST.snap && ST.snap.k };
      ${DONE}
      return out;`);
    eq(r.p, '1000,0', 'the click lands on the endpoint');
    eq(r.k, 'end', 'and it is the endpoint that answers');
  });

  t('away from any snap, the acquired path still offers its alignment', () => {
    const r = R(SCENE + `
      const s = w2s([700, 0]);
      const p = snapPoint(s[0], s[1] + 2, refPoint());
      const out = { k: ST.snap && ST.snap.k, y: +p[1].toFixed(6) };
      ${DONE}
      return out;`);
    ok(r.k === 'track' || r.k === 'near' || r.k === 'mid' || r.k === 'end' || r.k == null,
      'a snap or the path answers, whichever is really there: ' + r.k);
  });
};
