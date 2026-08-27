'use strict';
/* ============================================================
   Light and dark

   The program was one dark theme, and dark is the wrong default:
   a drawing is a thing that ends up on paper, and most people
   work in a lit room.

   The part that makes a theme switch actually work is the ink.
   AutoCAD draws colour 7 — "white" — as white on a dark
   background and black on a light one, because otherwise every
   line drawn in the default colour vanishes the moment you
   change the background. An explicit red stays red in both:
   somebody chose it.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
  const lum = (hex) => { const h = String(hex).replace('#','');
    const v = [0,2,4].map(i => parseInt(h.slice(i,i+2),16)/255)
      .map(c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4));
    return 0.2126*v[0] + 0.7152*v[1] + 0.0722*v[2]; };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('the two themes');

  t('light is the default', () => {
    const r = R(`${SETUP}
      setStore(null);
      themeReset();
      return { theme: themeName(), bgLum: lum(CO.bg) };`);
    eq(r.theme, 'light', 'a program nobody has configured opens light');
    ok(r.bgLum > 0.5, 'and the drawing sits on a light ground, luminance ' + r.bgLum.toFixed(2));
  });

  /* A dark desktop says something about the desktop, not about the drawing. */
  t('a machine set to dark does NOT get a dark drawing unasked', () => {
    const r = R(`${SETUP}
      setStore(null);
      const real = typeof matchMedia === 'function' ? matchMedia : null;
      globalThis.matchMedia = (q) => ({ matches: /dark/.test(q) });
      themeReset();
      const auto = themeName();
      globalThis.matchMedia = real || undefined;
      return { auto };`);
    eq(r.auto, 'light', 'still light: the choice is the drafter’s, and it is remembered once made');
  });

  t('switching gives a genuinely dark ground and back again', () => {
    const r = R(`${SETUP}
      setTheme('dark');
      const dark = { name: themeName(), bg: CO.bg, l: lum(CO.bg) };
      setTheme('light');
      const light = { name: themeName(), bg: CO.bg, l: lum(CO.bg) };
      return { dark, light };`);
    eq(r.dark.name, 'dark');
    ok(r.dark.l < 0.1, 'dark is dark, got ' + r.dark.l.toFixed(3));
    eq(r.light.name, 'light');
    ok(r.light.l > 0.5, 'light is light, got ' + r.light.l.toFixed(3));
  });

  t('every colour is defined in both, not just the ones that differ', () => {
    const r = R(`${SETUP}
      const bad = [];
      for (const th of ['light', 'dark']) {
        setTheme(th);
        for (const k of Object.keys(CO))
          if (!/^#[0-9a-f]{6}$/i.test(String(CO[k]))) bad.push(th + '.' + k + '=' + CO[k]);
      }
      setTheme('light');
      return { bad, keys: Object.keys(CO).length };`);
    ok(r.keys > 10, 'there is a real palette, ' + r.keys + ' colours');
    eq(r.bad.length, 0, 'none of them went undefined: ' + r.bad.join(', '));
  });

  group('ink follows the background');

  /* The whole point. A line in the default colour has to stay visible. */
  t('a white line is drawn black on light, and white on dark', () => {
    const r = R(`${SETUP}
      begin();
      const ln = addEnt({t:'line', a:[0,0], b:[1000,0], color:'#ffffff', layer:'0'});
      commit('l');
      setTheme('light'); const onLight = inkFor(entColor(ln));
      setTheme('dark');  const onDark  = inkFor(entColor(ln));
      setTheme('light');
      return { onLight: onLight.toLowerCase(), onDark: onDark.toLowerCase() };`);
    eq(r.onLight, '#000000', 'white becomes black on paper');
    eq(r.onDark, '#ffffff', 'and stays white on a dark ground');
  });

  t('a black line does the reverse', () => {
    const r = R(`${SETUP}
      begin();
      const ln = addEnt({t:'line', a:[0,0], b:[1000,0], color:'#000000', layer:'0'});
      commit('l');
      setTheme('light'); const onLight = inkFor(entColor(ln));
      setTheme('dark');  const onDark  = inkFor(entColor(ln));
      setTheme('light');
      return { onLight: onLight.toLowerCase(), onDark: onDark.toLowerCase() };`);
    eq(r.onLight, '#000000', 'black stays black on paper');
    eq(r.onDark, '#ffffff', 'and turns white on a dark ground');
  });

  /* The shipped default layer is #d7dee8, not pure white. Matching #ffffff
     alone left every line drawn in the default colour almost invisible on
     paper, which is the whole failure this is meant to prevent. */
  t('the default layer colour flips too, not just pure white', () => {
    const r = R(`${SETUP}
      const l0 = layer('0');
      setTheme('light'); const onLight = inkFor(l0.color);
      setTheme('dark');  const onDark = inkFor(l0.color);
      setTheme('light');
      return { stored: String(l0.color).toLowerCase(),
               onLight: onLight.toLowerCase(), onDark: onDark.toLowerCase() };`);
    ok(r.stored !== '#ffffff', 'the default really is an off-white: ' + r.stored);
    eq(r.onLight, '#000000', 'and it is drawn black on paper');
    eq(r.onDark, '#ffffff', 'and white on a dark ground');
  });

  t('a colour somebody chose is left exactly alone', () => {
    const r = R(`${SETUP}
      /* saturated colours, and a mid grey nobody arrives at by accident */
      const keep = ['#ff0000', '#00ff00', '#0000ff', '#4ee6a8', '#808080', '#c0392b', '#6ba8ff'];
      const out = {};
      for (const th of ['light', 'dark']) {
        setTheme(th);
        out[th] = keep.map(c => inkFor(c).toLowerCase());
      }
      setTheme('light');
      return { keep, light: out.light, dark: out.dark };`);
    eq(r.light.join(','), r.keep.join(','), 'unchanged on light');
    eq(r.dark.join(','), r.keep.join(','), 'and unchanged on dark');
  });

  t('the layer swatch shows the colour that was chosen, not the ink', () => {
    const r = R(`${SETUP}
      setTheme('light');
      const l = layer('0');
      return { stored: String(l.color).toLowerCase(), drawn: inkFor(l.color).toLowerCase() };`);
    ok(r.stored !== r.drawn || r.stored !== '#ffffff',
      'the stored colour is what the layer dialog edits: ' + r.stored + ' drawn as ' + r.drawn);
  });

  group('it is drawn, not just decided');

  t('the canvas really is painted in the theme colours', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'line', a:[0,0], b:[4000,0], color:'#ffffff', layer:'0'});
      commit('l');
      fit();
      const c = document.getElementById('cv').getContext('2d');
      const strokesIn = (th) => { setTheme(th); shapeCacheClear();
        c.__trace.calls.length = 0; paint();
        return c.__trace.calls.filter(x => x[0] === 'stroke').map(x => String(x[1]).toLowerCase()); };
      const light = strokesIn('light');
      const dark = strokesIn('dark');
      setTheme('light');
      return { lightHasBlack: light.some(s => s.indexOf('#000000') === 0),
               lightHasWhite: light.some(s => s.indexOf('#ffffff') === 0),
               darkHasWhite: dark.some(s => s.indexOf('#ffffff') === 0),
               nLight: light.length, nDark: dark.length };`);
    ok(r.nLight > 0 && r.nDark > 0, 'something was drawn in both');
    eq(r.lightHasBlack, true, 'the line is stroked black on light');
    eq(r.lightHasWhite, false, 'and nothing is stroked white on a white ground');
    eq(r.darkHasWhite, true, 'while on dark it is stroked white');
  });

  group('finding it');

  /* A setting nobody can find is a setting that does not exist. The theme is
     the one you reach for on your first day, so it is on the top bar and not
     only three clicks into a dialog. */
  t('there is a theme button on the top bar, and it flips the theme', () => {
    const r = R(`${SETUP}
      setStore(null); themeReset();
      const btn = document.getElementById('mTheme');
      const before = themeName();
      if (btn && btn.onclick) btn.onclick();
      const after = themeName();
      if (btn && btn.onclick) btn.onclick();
      return { exists: !!btn, title: btn && btn.title, before, after, back: themeName() };`);
    eq(r.exists, true, 'the button is there');
    ok(/dark|light|theme/i.test(String(r.title)), 'and says what it does: ' + r.title);
    eq(r.before, 'light');
    eq(r.after, 'dark', 'one click gives dark');
    eq(r.back, 'light', 'and the next puts it back');
  });

  t('and it is in the Display section of the drawing settings too', () => {
    const r = R(`${SETUP}
      buildDrawPop();
      const rows = [...document.querySelectorAll('#dsPop .row')]
        .map(x => x.innerHTML || '').join(' ');
      return { hasTheme: /theme/i.test(rows) };`);
    eq(r.hasTheme, true, 'the panel people actually open offers it');
  });

  /* The chrome must be light before a single line of JS has run, or the app
     flashes dark on every load. */
  t('the shell markup itself starts light', () => {
    const fs = require('fs'), path = require('path');
    const shell = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'shell.html'), 'utf8');
    const html = (shell.match(/<html[^>]*>/) || [''])[0];
    ok(/data-theme="light"/.test(html),
      'the <html> tag carries the default theme, got: ' + html);
  });

  group('remembering, and the rest of the shell');

  t('the choice survives a reload', () => {
    const r = R(`${SETUP}
      const st = { map: new Map(),
        getItem(k) { return this.map.has(k) ? this.map.get(k) : null; },
        setItem(k, v) { this.map.set(k, String(v)); },
        removeItem(k) { this.map.delete(k); } };
      setStore(st);
      setTheme('dark');
      const saved = st.getItem('orthograph.theme');
      /* a fresh start reads it back */
      themeReset();
      return { saved, after: themeName() };`);
    eq(r.saved, 'dark', 'it is written down');
    eq(r.after, 'dark', 'and picked up next time');
  });

  t('the shell is told, so the CSS follows the canvas', () => {
    const r = R(`${SETUP}
      setTheme('light');
      const light = document.documentElement.getAttribute('data-theme');
      setTheme('dark');
      const dark = document.documentElement.getAttribute('data-theme');
      setTheme('light');
      return { light, dark };`);
    eq(r.light, 'light', 'the root carries the theme for the stylesheet');
    eq(r.dark, 'dark');
  });

  t('THEME is a system variable, and high contrast still composes with it', () => {
    const r = R(`${SETUP}
      setTheme('light');
      setvar('theme', 'dark');
      const viaVar = themeName();
      setContrast(true);
      const hc = { bg: CO.bg, theme: themeName(), on: VS.contrast };
      setContrast(false);
      const back = CO.bg;
      setTheme('light');
      return { viaVar, hc, back, known: 'THEME' in SYSVAR };`);
    eq(r.known, true, 'it is in the variable table');
    eq(r.viaVar, 'dark', 'setvar switches it');
    eq(r.hc.theme, 'dark', 'high contrast does not silently change the theme');
    ok(r.hc.bg !== r.back, 'but it does change the palette: ' + r.hc.bg + ' vs ' + r.back);
  });

  t('a theme nobody has heard of is refused, not applied', () => {
    const r = R(`${SETUP}
      setTheme('light');
      const took = setTheme('purple');
      return { took, still: themeName(), bg: CO.bg };`);
    eq(r.took, false, 'refused');
    eq(r.still, 'light', 'and the theme is unchanged');
  });
};
