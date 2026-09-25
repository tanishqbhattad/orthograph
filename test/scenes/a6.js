'use strict';
/* ============================================================
   A6 — the drawing commands and the command grammar, driven
   the way a draughtsman drives them: hands on the keyboard with
   the pointer over the drawing, nothing clicked into first.

   Every scene types at the canvas exactly as a person would. The
   command line takes focus on the first letter, AutoComplete
   runs, dynamic input catches the digits — all the machinery
   between the key and the command is in the path, because that
   machinery is where L-Enter used to become LABEL.
   ============================================================ */
module.exports = ({ scene, ok, eq }) => {
  /* A drawing with nothing in it, framed so model (0,0) is mid-canvas, the
     pointer resting over it and nothing holding focus — where a person's hands
     are between commands. */
  const fresh = async (page, cx, cy, z) => {
    await page.evaluate(([cx, cy, z]) => {
      OG.reset();
      OG.stage(cx, cy, z);
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }, [cx || 0, cy || 0, z || 0.1]);
    const c = await page.evaluate(() => OG.at(0, 0));
    await page.mouse.move(c.x + 40, c.y - 30);
  };
  /* type a line and press Enter, as at the keyboard */
  const enter = async (page, s) => {
    if (s) await page.keyboard.type(s);
    await page.keyboard.press('Enter');
  };
  const cmdKey = (page) => page.evaluate(() => CMD ? CMD.def.key : null);

  /* ---------------------------------------------------------------
     aliases: the letters in every AutoCAD user's fingers
     --------------------------------------------------------------- */
  scene('A6: L then Enter at the canvas starts LINE, not LABEL', async (page) => {
    const want = { l: 'line', pl: 'pline', c: 'circle', a: 'arc', rec: 'rect',
                   pol: 'polygon', el: 'ellipse', spl: 'spline', xl: 'xline', do: 'donut' };
    for (const [alias, key] of Object.entries(want)) {
      await fresh(page);
      await enter(page, alias);
      eq(alias.toUpperCase() + ' + Enter runs ' + key.toUpperCase(), await cmdKey(page), key);
      await page.keyboard.press('Escape');
    }
  });
};
