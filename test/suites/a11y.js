'use strict';
/* ============================================================
   D4 — the shell is operable without a mouse or a screen

   Every tool in this program is an icon. An icon button with no
   accessible name is an unlabelled button to a screen reader,
   and this rail was forty of them — the custom tooltip is a
   hover affordance and reaches nobody who is not using a mouse.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('every control says what it is');

  t('no tool button is left unnamed', () => {
    const r = R(`${SETUP}
      buildRail();
      const tools = [...document.querySelectorAll('.tool')];
      const unnamed = tools.filter(b => !(b.getAttribute('aria-label') || '').trim());
      return { n: tools.length, unnamed: unnamed.map(b => b.dataset.tool),
               sample: tools.slice(0, 3).map(b => b.getAttribute('aria-label')) };`);
    ok(r.n > 20, 'the rail really is full of icons, got ' + r.n);
    eq(r.unnamed.length, 0, 'unnamed: ' + r.unnamed.join(', '));
    ok(r.sample.every(x => x && x.length > 1), 'and the names are words: ' + r.sample.join(' / '));
  });

  t('a tool name carries its keyboard shortcut', () => {
    const r = R(`${SETUP}
      buildRail();
      const b = [...document.querySelectorAll('.tool')].find(x => x.dataset.tool === 'line');
      return { label: b && b.getAttribute('aria-label'), title: b && b.getAttribute('title') };`);
    ok(/line/i.test(r.label), 'it is called what it is: ' + r.label);
    ok(/\(|—/.test(r.label + r.title), 'and offers the shortcut: ' + r.label);
  });

  /* Colour alone says which tool is running to people who can see colour. */
  t('the running tool is announced as pressed', () => {
    const r = R(`${SETUP}
      buildRail();
      cancelCmd(); syncTools();
      const idle = [...document.querySelectorAll('.tool')]
        .filter(b => b.getAttribute('aria-pressed') === 'true').length;
      startCmd('line'); syncTools();
      const on = [...document.querySelectorAll('.tool')]
        .filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.tool);
      endCmd(true); syncTools();
      const after = [...document.querySelectorAll('.tool')]
        .filter(b => b.getAttribute('aria-pressed') === 'true').length;
      return { idle, on, after };`);
    eq(r.idle, 0, 'nothing is pressed when no command is running');
    eq(r.on.join(','), 'line', 'the running one is pressed');
    eq(r.after, 0, 'and released when it ends');
  });

  group('the panels are operable from the keyboard');

  t('a layer toggle is a switch, reachable and named with its state', () => {
    const r = R(`${SETUP}
      buildLayers();
      const rows = [...document.querySelectorAll('#layers .lay')];
      const icons = rows.length ? [...rows[0].querySelectorAll('.ic')] : [];
      return { rows: rows.length,
               roles: icons.map(i => i.getAttribute('role')),
               tabs: icons.map(i => i.getAttribute('tabindex')),
               named: icons.every(i => (i.getAttribute('aria-label') || '').length > 3),
               states: icons.map(i => i.getAttribute('aria-checked')),
               sample: icons[0] && icons[0].getAttribute('aria-label') };`);
    ok(r.rows > 0, 'there are layers to check');
    ok(r.roles.every(x => x === 'switch'), 'each icon is a switch, got ' + r.roles.join(','));
    ok(r.tabs.every(x => x === '0'), 'and can be tabbed to');
    eq(r.named, true, 'each one is named');
    ok(r.states.every(x => x === 'true' || x === 'false'), 'with its state said out loud');
    ok(/visible|hidden/.test(r.sample), 'e.g. "' + r.sample + '"');
  });

  t('a layer toggle works from the keyboard, not only the mouse', () => {
    const r = R(`${SETUP}
      buildLayers();
      const row = [...document.querySelectorAll('#layers .lay')]
        .find(x => x.textContent.indexOf('A-WALL') >= 0);
      const eye = row && [...row.querySelectorAll('.ic')][0];
      const before = DOC.layers.find(l => l.name === 'A-WALL').on;
      eye.onkeydown({ key: 'Enter', preventDefault() {}, stopPropagation() {} });
      const afterEnter = DOC.layers.find(l => l.name === 'A-WALL').on;
      buildLayers();
      const row2 = [...document.querySelectorAll('#layers .lay')]
        .find(x => x.textContent.indexOf('A-WALL') >= 0);
      [...row2.querySelectorAll('.ic')][0].onkeydown({ key: ' ', preventDefault() {}, stopPropagation() {} });
      const afterSpace = DOC.layers.find(l => l.name === 'A-WALL').on;
      return { before, afterEnter, afterSpace };`);
    eq(r.before, true);
    eq(r.afterEnter, false, 'Enter operates it');
    eq(r.afterSpace, true, 'and Space operates it back');
  });

  t('a level row is a selectable option, and Enter chooses it', () => {
    const r = R(`${SETUP}
      buildLevels();
      const rows = [...document.querySelectorAll('#levels .lvl')];
      const roles = rows.map(x => x.getAttribute('role'));
      const sel = rows.map(x => x.getAttribute('aria-selected'));
      const before = DOC.curLevel;
      /* the row that is NOT current */
      const other = rows.find(x => x.getAttribute('aria-selected') === 'false');
      other.onkeydown({ key: 'Enter', preventDefault() {} });
      return { roles, sel, before, after: DOC.curLevel,
               labelled: rows.every(x => (x.getAttribute('aria-label') || '').length > 3) };`);
    ok(r.roles.every(x => x === 'option'), 'each level is an option');
    eq(r.sel.filter(x => x === 'true').length, 1, 'exactly one is current');
    eq(r.labelled, true, 'and each says its name and elevation');
    ok(r.after !== r.before, 'Enter moves to that storey');
  });

  group('motion');

  /* A view that slides while someone is trying to read it is a problem for
     everyone, and for some people it is the reason they turned it off. */
  t('an animated view goes straight there when motion is not wanted', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[9000,4000], layer:'0'}); commit('l');
      const realMM = typeof matchMedia === 'function' ? matchMedia : null;
      /* pretend the machine asked for reduced motion */
      globalThis.matchMedia = (q) => ({ matches: /reduce/.test(q) });
      V.z = 1; V.px = 0; V.py = 800;
      fit(null, 400);
      const straight = { z: +V.z.toFixed(6), px: Math.round(V.px) };
      const target = viewForBox(bboxAll([...DOC.ents.values()]));
      globalThis.matchMedia = realMM || undefined;
      return { straight, want: { z: +target.z.toFixed(6), px: Math.round(target.px) },
               ok: motionOK() };`);
    eq(r.straight.z, r.want.z, 'it arrives at the target zoom immediately');
    eq(r.straight.px, r.want.px, 'and the target position');
  });

  t('motionOK says yes when nothing has asked otherwise', () => {
    const r = R(`${SETUP}
      const real = typeof matchMedia === 'function' ? matchMedia : null;
      globalThis.matchMedia = (q) => ({ matches: false });
      const yes = motionOK();
      globalThis.matchMedia = undefined;
      const noApi = motionOK();
      globalThis.matchMedia = real || undefined;
      return { yes, noApi };`);
    eq(r.yes, true, 'a machine that has not asked gets animation');
    eq(r.noApi, true, 'and one that cannot be asked is not assumed to object');
  });
};
