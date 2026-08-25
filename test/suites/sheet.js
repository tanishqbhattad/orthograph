'use strict';
/* ============================================================
   Sheets, paper space and plotting — 01-doc / 11-io

   One assertion in here matters more than the rest of the file:
   a wall of a known length, seen through a viewport at a known
   scale, must measure exactly the right number of millimetres
   on the paper. A drawing that is nearly to scale is a drawing
   that cannot be issued, and it is the failure that looks
   perfectly fine on a screen and only shows up at the plotter.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; DOC.gridStep = 100; DOC.snapStep = 100;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('sheets: paper is measured in millimetres');

  t('paper sizes are the real ISO numbers, and orientation swaps them', () => {
    const r = R(`${SETUP}
      return { a3p: paperSize('A3', false), a3l: paperSize('A3', true),
               a1l: paperSize('A1', true), a4p: paperSize('A4', false),
               unknown: paperSize('NOPE', true) };`);
    eq(r.a3p.join('x'), '297x420', 'A3 portrait');
    eq(r.a3l.join('x'), '420x297', 'A3 landscape is the same paper turned round');
    eq(r.a1l.join('x'), '841x594', 'A1 landscape');
    eq(r.a4p.join('x'), '210x297', 'A4 portrait');
    eq(r.unknown.join('x'), '420x297', 'an unknown size falls back rather than throwing');
  });

  /* THE acceptance test for this whole feature. */
  t('a 5000mm wall at 1:50 measures exactly 100mm on the paper', () => {
    const r = R(`${SETUP}
      addEnt({t:'wall', a:[0,0], b:[5000,0], wt:'gen100', layer:'A-WALL'});
      const sh = newSheet('A-101', 'A3', true);
      const vp = newViewport(sh, [2500, 0], 1/50);
      sh.viewports.push(vp); DOC.sheets.push(sh); DOC.curSheet = sh.id;
      const p0 = vpToPaper(vp, 0, 0);
      const p1 = vpToPaper(vp, 5000, 0);
      /* and 3000mm the other way, to catch an axis that is scaled differently */
      const p2 = vpToPaper(vp, 0, 3000);
      return { onPaper: Math.hypot(p1[0]-p0[0], p1[1]-p0[1]),
               vertical: Math.hypot(p2[0]-p0[0], p2[1]-p0[1]),
               label: scaleLabel(vp.scale) };`);
    close(r.onPaper, 100, 1e-9, 'got ' + r.onPaper + 'mm — a plot that is not to scale cannot be issued');
    close(r.vertical, 60, 1e-9, '3000mm at 1:50 is 60mm, and both axes must agree');
    eq(r.label, '1:50', 'and the title block must be able to name it');
  });

  t('every standard scale lands exactly, not nearly', () => {
    const r = R(`${SETUP}
      const sh = newSheet('S', 'A1', true);
      const out = {};
      for (const s of SCALES) {
        const vp = newViewport(sh, [0,0], s.r);
        const a = vpToPaper(vp, 0, 0), b = vpToPaper(vp, 1000, 0);
        out[s.label] = +(Math.hypot(b[0]-a[0], b[1]-a[1])).toFixed(9);
      }
      return out;`);
    eq(r['1:1'], 1000, '1m at 1:1 is 1000mm of paper');
    eq(r['1:20'], 50); eq(r['1:50'], 20); eq(r['1:100'], 10);
    eq(r['1:200'], 5);  eq(r['1:1000'], 1, '1m at 1:1000 is 1mm');
  });

  t('paper and model coordinates round-trip exactly', () => {
    const r = R(`${SETUP}
      const sh = newSheet('S', 'A2', true);
      const vp = newViewport(sh, [12345.6, -7890.1], 1/75);
      let worst = 0;
      for (const p of [[0,0],[12345.6,-7890.1],[99999,-42],[-5000,5000]]) {
        const pap = vpToPaper(vp, p[0], p[1]);
        const back = vpToModel(vp, pap[0], pap[1]);
        worst = Math.max(worst, Math.hypot(back[0]-p[0], back[1]-p[1]));
      }
      return worst;`);
    ok(r < 1e-6, 'worst round-trip error ' + r + 'mm');
  });

  group('sheets: the plotted file');

  t('the SVG declares millimetres, so the plot is physically right', () => {
    const r = R(`${SETUP}
      addEnt({t:'wall', a:[0,0], b:[5000,0], wt:'gen100', layer:'A-WALL'});
      const sh = newSheet('A-101', 'A3', true);
      sh.viewports.push(newViewport(sh, [2500,0], 1/50));
      const svg = sheetSVG(sh);
      const head = svg.slice(0, svg.indexOf('>') + 1);
      return { head, hasClip: svg.includes('clipPath'),
               scaleXf: (/scale\(([-0-9.]+)\)/.exec(svg) || [])[1],
               len: svg.length };`);
    ok(/width="420mm"/.test(r.head), 'width in mm: ' + r.head);
    ok(/height="297mm"/.test(r.head), 'height in mm');
    ok(/viewBox="0 0 420 297"/.test(r.head), 'and a viewBox in the same units');
    ok(r.hasClip, 'a viewport must clip, or the model spills over the paper');
  });
};
