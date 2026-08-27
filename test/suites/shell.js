'use strict';
/* ============================================================
   The shell as it opens

   Three things that were only wrong once you actually sat in
   front of it: a full-width crosshair and a fat pick box as the
   defaults, a command history tall enough to sit over the panels
   behind it, and a shortcut letter stamped into the corner of
   every icon in the rail.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const SHELL = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'shell.html'), 'utf8');

const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('what the cursor is on the first run');

  /* Read from the source and from the accessors rather than from live ST:
     the suites share one sandbox, so by the time this runs another test has
     long since dragged the pick box somewhere else. */
  t('the crosshair is short and the pick box is 10', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', '00-core.js'), 'utf8');
    const cross = +(src.match(/const CROSS_PCT = (\d+)/) || [0, 0])[1];
    const pick = +(src.match(/const PICK_PX = (\d+)/) || [0, 0])[1];
    eq(cross, 20, 'a 20% crosshair, not one across the whole viewport');
    eq(pick, 10, 'and a 10px pick box');
    const snap = fs.readFileSync(path.join(__dirname, '..', '..', 'src', '06-snap.js'), 'utf8');
    ok(/crossLen:\s*CROSS_PCT/.test(snap), 'and ST is initialised from them, not from a copy');
    ok(/pickBox:\s*PICK_PX/.test(snap), 'both of them');
  });

  /* A default written in one place and defaulted-to differently in another is
     the same bug twice: clear the value and the drawing quietly reverts to a
     number nobody chose. */
  t('nothing falls back to a different number than the default', () => {
    const r = R(`${SETUP}
      /* what the renderer and the picker use when the value is missing */
      ST.crossLen = null; ST.pickBox = null;
      const cross = crosshairPct();
      const pick = pickBoxPx();
      ST.crossLen = 20; ST.pickBox = 10;
      return { cross, pick };`);
    eq(r.cross, 20, 'the crosshair falls back to the default it was given');
    eq(r.pick, 10, 'and so does the pick box');
  });

  t('they are still adjustable, and clamped to something usable', () => {
    const r = R(`${SETUP}
      ST.crossLen = 100; const full = crosshairPct();
      ST.pickBox = 40; const fat = pickBoxPx();
      ST.crossLen = 20; ST.pickBox = 10;
      return { full, fat };`);
    eq(r.full, 100, 'a full-width crosshair is still available');
    eq(r.fat, 40, 'and a large pick box');
  });

  group('the command history');

  /* Four lines of history sat over the panels either side of it. */
  t('shows two lines when it is not opened', () => {
    const rule = (SHELL.match(/#cmdhist\{[^}]*\}/) || [''])[0];
    const maxH = +(rule.match(/max-height:(\d+)px/) || [0, 0])[1];
    const fs2 = +(rule.match(/font-size:([\d.]+)px/) || [0, 11])[1];
    const lh = +(rule.match(/line-height:([\d.]+)/) || [0, 1.55])[1];
    const pad = +(rule.match(/padding:(\d+)px/) || [0, 0])[1];
    const lines = (maxH - pad) / (fs2 * lh);
    ok(maxH > 0, 'the collapsed history has a height: ' + rule);
    close(lines, 2, 0.35, 'about two lines, got ' + lines.toFixed(2));
  });

  t('and still opens to a proper pane when it is asked to', () => {
    const open = (SHELL.match(/#cmdhist\.open\{[^}]*\}/) || [''])[0];
    ok(/max-height:\s*\d+vh/.test(open),
      'the opened history is still sized against the viewport: ' + open);
  });

  group('the tool rail');

  /* The shortcut was stamped into the corner of all forty icons, which is
     forty pieces of 6.5px text competing with the glyphs. */
  t('no icon carries its shortcut as a caption', () => {
    ok(!/\.tool\[data-k\]::after\s*\{\s*content/.test(SHELL),
      'the caption rule is gone from the stylesheet');
  });

  /* Removing it must not remove the information. */
  t('but every tool still says its shortcut where it counts', () => {
    const r = R(`${SETUP}
      buildRail();
      const tools = [...document.querySelectorAll('.tool')];
      const withKey = tools.filter(b => b.dataset.k);
      const named = withKey.filter(b => {
        const a = (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '');
        return a.toUpperCase().indexOf(String(b.dataset.k).toUpperCase()) >= 0;
      });
      return { tools: tools.length, withKey: withKey.length, named: named.length,
               sample: withKey.length ? withKey[0].getAttribute('aria-label') : '' };`);
    ok(r.tools > 20, 'the rail is full of icons, ' + r.tools);
    ok(r.withKey > 10, 'and most of them have a shortcut, ' + r.withKey);
    eq(r.named, r.withKey,
      'every one of those still announces it: e.g. ' + r.sample);
  });
};
