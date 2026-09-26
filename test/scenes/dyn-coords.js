'use strict';
/* A coordinate typed with dynamic input on is a coordinate, not a length.

   Dynamic input is on by default, and with it on a typed digit goes into the
   field at the cursor. That field took whatever was typed as a LENGTH: the
   comma of 500,900 was read as a decimal point (a 500.9 segment), and
   anything with @, < or # was refused, so the command just sat there.
   Typing coordinates is how an AutoCAD user draws. AutoCAD reads them as
   relative to the last point while dynamic input is on, # for absolute. */
module.exports = ({ scene, ok, eq }) => {
  const segs = (page) => page.evaluate(() => [...DOC.ents.values()].filter(e => e.t === 'line')
    .map(e => [e.a, e.b].map(p => p.map(v => Math.round(v * 1000) / 1000).join(',')).join('>')).join(' | '));

  scene('a coordinate typed with dynamic input on is a coordinate, not a length', async (page) => {
    const c = await page.evaluate(() => {
      OG.reset();
      ST.dyn = true; ST.osnap = false; ST.otrack = false; ST.polar = false; ST.ortho = false;
      OG.stage(600, 700, 0.3);
      return OG.at(600, 700);
    });
    await page.mouse.move(c.x, c.y);
    await page.click('#cmd');
    await page.keyboard.type('line');
    await page.keyboard.press('Enter');
    /* back on the drawing, the way a person carries on after naming a command */
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    let k = 0;
    for (const s of ['100,100', '500,900', '500<90', '#1000,0']) {
      await page.mouse.move(c.x + 40 + (k++ % 2) * 6, c.y + 25, { steps: 2 });
      await page.keyboard.type(s);
      await page.keyboard.press('Enter');
      await page.evaluate(() => OG.settle());
    }
    await page.keyboard.press('Escape');
    eq('each typed point lands where AutoCAD puts it — relative by default, # for absolute',
      await segs(page), '100,100>600,1000 | 600,1000>600,1500 | 600,1500>1000,0');
  });
};
