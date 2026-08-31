'use strict';
/* ============================================================
   Seven things that were wrong, reported from use

   Most of these are one-liners. Two are not, and both were
   mis-described in the report in a way worth recording, because
   the description was the reasonable reading of the symptom:

     · "selection is very slow — I have to click, wait, then
       drag". Nothing was slow. Press-drag drew a freehand
       LASSO, and a quick straight flick makes a lasso that is a
       sliver enclosing nothing. The gesture that worked was the
       other one — click, move, click — which is why waiting
       seemed to help.

     · "delete the door and the wall should join back". The wall
       was never split. Its shapes are cached per object, and
       nothing invalidated that cache when an opening was added
       to it or taken away, so whichever state was drawn first
       was the state that stayed.
   ============================================================ */
const SHELL = () => {
  const fs = require('fs'), path = require('path');
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'shell.html'), 'utf8');
};
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
  const wallOf = (wt) => { begin();
    const w = addEnt({t:'wall', a:[0,0], b:[6000,0], wt: wt || 'gen100', layer:'A-WALL'});
    commit('w'); return w; };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('press and drag selects, the way a drafting program does');

  /* Read from the source rather than from ST: the suites share one sandbox and
     an earlier one turns the lasso on to test it, so the live value says
     nothing about what the program ships with. */
  t('a press-drag rubber-bands a rectangle, not a lasso', () => {
    const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', '06-snap.js'), 'utf8');
    const m = /lassoOn:\s*([01])/.exec(src);
    ok(m, 'the setting exists');
    eq(m[1], '0', 'and ships off, so press-drag is a window');
  });

  t('the lasso is still there for anyone who wants it', () => {
    const r = R(`${SETUP}
      setvar('PICKAUTO', 1);
      const on = ST.lassoOn;
      setvar('PICKAUTO', 0);
      return { on: !!on, off: !!ST.lassoOn };`);
    eq(r.on, true, 'PICKAUTO turns it back on');
    eq(r.off, false);
  });

  /* left to right takes what is wholly inside, right to left takes anything it
     touches — the half of the gesture that has to survive the change */
  t('the box still means window one way and crossing the other', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'line', a:[0,0], b:[4000,0], layer:'0'});
      addEnt({t:'line', a:[3000,0], b:[9000,0], layer:'0'});
      commit('l');
      fit();
      const pick = (ax, ay, bx, by) => { SEL.clear();
        startBandGesture(w2s([ax,ay]), 'rect', null, false);
        ST.band.live = true; bandMove(w2s([bx,by]));
        const n = bandCommit(); bandCancel(); return n; };
      return { window: pick(-500, -500, 5000, 500),
               crossing: pick(5000, 500, -500, -500) };`);
    eq(r.window, 1, 'left to right takes only what is wholly inside');
    eq(r.crossing, 2, 'right to left takes everything it touches');
  });

  group('an opening cuts the wall, and stops cutting it');

  /* The wall is never split. What was wrong is that its shapes are cached per
     object and nothing invalidated the HOST when an opening was added to it or
     taken away — so whichever state was drawn first was the state that stayed. */
  t('adding a door cuts the wall that is already on screen', () => {
    const r = R(`${SETUP}
      const w = wallOf();
      const plain = entShapes(w).length;          /* warms the cache */
      begin();
      const d = addEnt({t:'door', host:w.id, pos:3000, dt:'sgl900', layer:'A-DOOR'});
      commit('d');
      shapeCacheSync();                           /* what the next frame does */
      return { plain, withDoor: entShapes(w).length, fresh: shapes(w, 32).length };`);
    ok(r.withDoor > r.plain, 'the opening appears: ' + r.plain + ' -> ' + r.withDoor);
    eq(r.withDoor, r.fresh, 'and the cached wall agrees with a freshly built one');
  });

  t('erasing the door closes the wall up again', () => {
    const r = R(`${SETUP}
      const w = wallOf();
      const plain = entShapes(w).length;
      begin();
      const d = addEnt({t:'door', host:w.id, pos:3000, dt:'sgl900', layer:'A-DOOR'});
      commit('d'); shapeCacheSync();
      const withDoor = entShapes(w).length;
      begin(); delEnt(d.id); commit('x'); shapeCacheSync();
      return { plain, withDoor, after: entShapes(w).length, fresh: shapes(w, 32).length };`);
    ok(r.withDoor > r.plain, 'it was cut');
    eq(r.after, r.plain, 'and is whole again once the door is gone');
    eq(r.after, r.fresh, 'with nothing stale left in the cache');
  });

  t('moving a door along the wall moves the opening with it', () => {
    const r = R(`${SETUP}
      const w = wallOf();
      begin();
      const d = addEnt({t:'door', host:w.id, pos:1500, dt:'sgl900', layer:'A-DOOR'});
      commit('d'); shapeCacheSync();
      const at1500 = JSON.stringify(entShapes(w).map(s => s.pts && s.pts[0]));
      begin(); mut(d); d.pos = 4500; commit('m'); shapeCacheSync();
      const at4500 = JSON.stringify(entShapes(w).map(s => s.pts && s.pts[0]));
      return { same: at1500 === at4500 };`);
    eq(r.same, false, 'the drawn wall follows the door along it');
  });

  group('what colour a wall is');

  t('a wall with nothing said about it is the wall ink, not pure black', () => {
    const r = R(`${SETUP}
      const w = wallOf();
      setTheme('light');
      const light = fcol(w);
      setTheme('dark');
      const dark = fcol(w);
      setTheme('light');
      return { light, dark };`);
    eq(r.light, '#525252', 'grey on paper, so a wall does not read as a border');
    eq(r.dark, '#ffffff', 'and white on the dark canvas');
  });

  t('a colour chosen for the wall is the colour it is drawn in', () => {
    const r = R(`${SETUP}
      const w = wallOf();
      begin(); mut(w); w.color = '#ff0000'; commit('c');
      const own = fcol(w);
      begin(); mut(w); w.color = null; commit('c');
      layer('A-WALL').color = '#2f6fd0';
      const byLayer = fcol(w);
      return { own, byLayer };`);
    eq(r.own, '#ff0000', 'the object wins');
    eq(r.byLayer, '#2f6fd0', 'and a layer colour someone chose wins over the default');
  });

  t('the wall ink is opaque — no alpha rides along with it', () => {
    const r = R(`${SETUP}
      const w = wallOf();
      return { light: fcol(w).length };`);
    eq(r.light, 7, 'a plain #rrggbb, with nothing appended');
  });

  group('the chrome');

  t('the status toggles sit with the settings, not away from them', () => {
    const all = SHELL();
    /* .grow is used elsewhere in the chrome, so look only inside the status bar */
    const s = all.slice(all.indexOf('<div id="status">'), all.indexOf('id="dsMore"'));
    const grow = s.indexOf('<div class="grow"></div>');
    const tgs = s.indexOf('<div class="tgs">');
    const dset = s.indexOf('id="dset"');
    ok(grow > 0 && tgs > 0 && dset > 0, 'the three parts are all there');
    ok(grow < tgs, 'the gap comes first, so the toggles are pushed across');
    ok(tgs < dset, 'and they end up beside the settings');
  });

  /* The report was about two of these — the dynamic input and a tooltip — but
     every piece of chrome that floats over the drawing had the same
     hard-coded near-black ground, and on the light theme they are all dark
     boxes with dark text in them. The scrims are the exception: a veil that
     dims the drawing behind a dialog is meant to be dark. */
  t('nothing that floats over the drawing is painted a hard-coded near-black', () => {
    const s = SHELL();
    const SCRIM = ['#drop', '#modal'];
    const bad = [];
    const re = /([^{}]*)\{[^}]*background:(#0[0-9a-f]{3,8})/g;
    let m;
    const flat = s.split('\n').map(x => x.trim()).join(' ');
    while ((m = re.exec(flat))) {
      const sel = m[1].split('}').pop().trim();
      if (SCRIM.some(x => sel.indexOf(x) >= 0)) continue;
      bad.push(sel + ' → ' + m[2]);
    }
    eq(bad.length, 0, 'they follow the theme instead: ' + bad.join(' | '));
  });

  t('the panels have a scrollbar of their own rather than the system one', () => {
    const s = SHELL();
    ok(/::-webkit-scrollbar\b/.test(s), 'a track is styled');
    ok(/::-webkit-scrollbar-thumb/.test(s), 'and a thumb');
    ok(/scrollbar-color/.test(s), 'and Firefox is told the same thing');
  });

  t('the dial reads as a compass with a page in the middle', () => {
    const s = SHELL();
    ok(/id="dialSquare"/.test(s), 'there is a square in the middle');
    for (const L of ['>N<', '>E<', '>S<', '>W<'])
      ok(s.indexOf(L) >= 0, 'the ring is lettered ' + L);
  });
};
