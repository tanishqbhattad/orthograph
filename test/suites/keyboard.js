'use strict';
/* ============================================================
   D4 — driving the drawing without a mouse

   Coordinates could always be typed, so a keyboard user could
   draw precisely. What they could not do is AIM: move the
   crosshair to see what it snaps to, hover a wall to read it, or
   pick an object that exists. Those are mouse-only operations,
   and everything downstream of picking was therefore mouse-only
   too.

   And the palette is one dark theme. Someone who needs more
   contrast than 33/40/48 behind a grey grid had nothing to turn.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; DOC.gridStep = 100; DOC.snapStep = 100;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
  const key = (k, mod) => window.dispatchEvent(new KeyboardEvent('keydown',
    Object.assign({ key: k, bubbles: true, cancelable: true }, mod || {})));
  /* nothing focused, or the arrows belong to whatever is */
  const blur = () => { document.activeElement = document.body; };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('the crosshair moves from the keyboard');

  t('an arrow key moves it, and by the snap step', () => {
    const r = R(`${SETUP}
      blur();
      VS.snapgrid = 1; DOC.snapStep = 100;
      ST.cur = [1000, 1000];
      key('ArrowRight');
      const right = ST.cur.slice();
      key('ArrowUp');
      const up = ST.cur.slice();
      key('ArrowLeft'); key('ArrowDown');
      return { right, up, back: ST.cur.slice() };`);
    eq(r.right.join(','), '1100,1000', 'right by one snap step');
    eq(r.up.join(','), '1100,1100', 'up by one');
    eq(r.back.join(','), '1000,1000', 'and back again');
  });

  t('Shift moves it ten times as far, and Alt a tenth', () => {
    const r = R(`${SETUP}
      blur();
      VS.snapgrid = 1; DOC.snapStep = 100;
      ST.cur = [0, 0]; key('ArrowRight', { shiftKey: true });
      const big = ST.cur.slice();
      ST.cur = [0, 0]; key('ArrowRight', { altKey: true });
      const small = ST.cur.slice();
      return { big, small };`);
    eq(r.big.join(','), '1000,0', 'Shift is a coarse move');
    eq(r.small.join(','), '10,0', 'Alt is a fine one');
  });

  /* Typing a coordinate into the command line uses the arrows for the caret
     and the history. Stealing them would make the command line unusable. */
  t('the arrows belong to a text field when one has focus', () => {
    const r = R(`${SETUP}
      ST.cur = [500, 500];
      const inp = document.getElementById('cmd');
      document.activeElement = inp || { tagName: 'INPUT' };
      key('ArrowRight'); key('ArrowUp');
      const held = ST.cur.slice();
      blur();
      key('ArrowRight');
      return { held, freed: ST.cur.slice() };`);
    eq(r.held.join(','), '500,500', 'the field keeps them');
    ok(r.freed[0] > 500, 'and the drawing gets them back when it has focus');
  });

  t('with snap off it still moves, by something you can see', () => {
    const r = R(`${SETUP}
      blur();
      VS.snapgrid = 0;
      ST.cur = [0, 0];
      key('ArrowRight');
      return { moved: ST.cur[0], z: V.z };`);
    ok(r.moved > 0, 'it moved, got ' + r.moved);
    ok(r.moved < 1000, 'by a step, not a leap: ' + r.moved);
  });

  group('picking without a mouse');

  t('Ctrl+Enter picks the point the crosshair is on', () => {
    const r = R(`${SETUP}
      blur();
      cancelCmd(); startCmd('line');
      ST.cur = [0, 0]; key('Enter', { ctrlKey: true });
      ST.cur = [3000, 0]; key('Enter', { ctrlKey: true });
      endCmd(true);
      const ln = [...DOC.ents.values()].find(e => e.t === 'line');
      return { drawn: !!ln, a: ln && ln.a, b: ln && ln.b };`);
    eq(r.drawn, true, 'a line was drawn entirely from the keyboard');
    eq(r.a.join(','), '0,0', 'from where the crosshair was');
    eq(r.b.join(','), '3000,0', 'to where it went');
  });

  t('Ctrl+Enter with no command running selects what is under the crosshair', () => {
    const r = R(`${SETUP}
      begin(); const w = addEnt({t:'wall', a:[0,0], b:[5000,0], wt:'gen100', layer:'A-WALL'});
      commit('w');
      blur(); cancelCmd(); SEL.clear();
      ST.cur = [2500, 0];
      key('Enter', { ctrlKey: true });
      const onIt = SEL.size;
      SEL.clear(); ST.cur = [2500, 40000];
      key('Enter', { ctrlKey: true });
      return { onIt, away: SEL.size, id: w.id };`);
    eq(r.onIt, 1, 'the wall under the crosshair is selected');
    eq(r.away, 0, 'and empty space selects nothing');
  });

  /* Enter on its own repeats the last command. That is muscle memory older
     than this program and must not be taken for picking. */
  t('a plain Enter still means what it always meant', () => {
    const r = R(`${SETUP}
      blur(); cancelCmd(); SEL.clear();
      begin(); addEnt({t:'wall', a:[0,0], b:[5000,0], wt:'gen100', layer:'A-WALL'}); commit('w');
      ST.cur = [2500, 0];
      key('Enter');
      return { sel: SEL.size };`);
    eq(r.sel, 0, 'plain Enter does not pick');
  });

  group('high contrast');

  /* WCAG relative luminance: the honest way to say a palette is readable,
     rather than looking at it and deciding it seems fine. */
  const RATIO = `
    const lum = (hex) => {
      const h = hex.replace('#', '');
      const v = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
        .map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const ratio = (a, b) => { const A = lum(a), B = lum(b);
      return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
  `;

  t('it raises the contrast of the drawing against its background', () => {
    const r = R(`${SETUP}${RATIO}
      setContrast(false);
      const before = { bg: CO.bg, grid: CO.gridM, cross: CO.cross };
      setContrast(true);
      const after = { bg: CO.bg, grid: CO.gridM, cross: CO.cross };
      setContrast(false);
      return {
        gridBefore: ratio(before.bg, before.grid), gridAfter: ratio(after.bg, after.grid),
        crossBefore: ratio(before.bg, before.cross), crossAfter: ratio(after.bg, after.cross),
        restored: CO.bg === before.bg && CO.gridM === before.grid,
      };`);
    ok(r.gridAfter > r.gridBefore,
      'the grid comes up off the background: ' + r.gridBefore.toFixed(2) + ' → ' + r.gridAfter.toFixed(2));
    ok(r.gridAfter >= 3, 'to at least 3:1, got ' + r.gridAfter.toFixed(2));
    ok(r.crossAfter >= 7,
      'and the crosshair to AAA, got ' + r.crossAfter.toFixed(2));
    eq(r.restored, true, 'turning it off puts the palette back exactly');
  });

  t('every colour in the palette is still defined, not just the ones changed', () => {
    const r = R(`${SETUP}
      const keys = Object.keys(CO);
      setContrast(true);
      const bad = keys.filter(k => !/^#[0-9a-f]{6}$/i.test(String(CO[k])));
      setContrast(false);
      return { keys: keys.length, bad };`);
    ok(r.keys > 10, 'there is a real palette to check, ' + r.keys + ' colours');
    eq(r.bad.length, 0, 'and none went undefined: ' + r.bad.join(', '));
  });

  t('a machine that asks for more contrast gets it without being told twice', () => {
    const r = R(`${SETUP}
      const real = typeof matchMedia === 'function' ? matchMedia : null;
      globalThis.matchMedia = (q) => ({ matches: /prefers-contrast/.test(q) });
      const wanted = contrastWanted();
      globalThis.matchMedia = () => ({ matches: false });
      const not = contrastWanted();
      globalThis.matchMedia = undefined;
      const noApi = contrastWanted();
      globalThis.matchMedia = real || undefined;
      setContrast(false);
      return { wanted, not, noApi };`);
    eq(r.wanted, true, 'a machine asking for more contrast is heard');
    eq(r.not, false, 'one that is not asking is left alone');
    eq(r.noApi, false, 'and one that cannot be asked is not assumed to want it');
  });

  t('CONTRAST is a system variable like the rest, so it can be set and saved', () => {
    const r = R(`${SETUP}
      const was = VS.contrast;
      setvar('contrast', 1);
      const on = { vs: VS.contrast, bg: CO.bg };
      setvar('contrast', 0);
      const off = { vs: VS.contrast, bg: CO.bg };
      VS.contrast = was;
      return { on, off, known: 'contrast' in VS };`);
    eq(r.known, true, 'it is in the variable table');
    eq(r.on.vs, 1, 'setvar turns it on');
    ok(r.on.bg !== r.off.bg, 'and the palette follows: ' + r.on.bg + ' vs ' + r.off.bg);
  });
};
