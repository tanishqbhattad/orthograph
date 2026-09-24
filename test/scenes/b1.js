'use strict';
/* ============================================================
   B1 — the editing commands, driven with a real mouse and keyboard

   The headless suite calls cmdPoint(); these press real buttons.
   TRIM's freehand fence is a press-drag-release, which nothing
   headless can perform, and its preview is pixels on a canvas.
   ============================================================ */
module.exports = ({ scene, ok, eq }) => {
  /* a grid: four posts through one rail, the stubs above it to go */
  const grid = () => {
    OG.reset();
    begin();
    for (let i = 0; i < 4; i++) addEnt({ t: 'line', a: [i * 1000, -500], b: [i * 1000, 2500] });
    addEnt({ t: 'line', a: [-500, 2000], b: [3500, 2000] });
    commit('grid');
    VS.trimextendmode = 1;
    OG.stage(1500, 1000, 0.15);
  };
  const tops = () => [...DOC.ents.values()]
    .filter(e => e.t === 'line' && Math.abs(e.a[0] - e.b[0]) < 1e-9)
    .map(e => Math.round(Math.max(e.a[1], e.b[1]))).sort((a, b) => a - b);
  const command = async (page, word) => {
    await page.evaluate(() => { const c = document.getElementById('cmd'); c && c.focus(); });
    await page.keyboard.type(word);
    await page.keyboard.press('Enter');
  };
  const at = (page, x, y) => page.evaluate(([x, y]) => OG.at(x, y), [x, y]);

  scene('TRIM: a freehand drag through the stubs takes every one of them', async (page) => {
    await page.evaluate(grid);
    await command(page, 'TR');
    const a = await at(page, -300, 2300), b = await at(page, 1500, 2150), c = await at(page, 3300, 2350);
    if (!a.on || !c.on) throw new Error('the drag would start off the canvas');
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.move(c.x, c.y, { steps: 8 });
    const mid = await page.evaluate(() => ({ prev: (ST.preview || []).length, stage: CMD && CMD.stage }));
    ok('while dragging, the path and what it will take are shown', mid.prev > 0, JSON.stringify(mid));
    await page.mouse.up();
    const r = await page.evaluate(tops);
    eq('all four stubs above the rail are gone', r, [2000, 2000, 2000, 2000]);
    const still = await page.evaluate(() => !!CMD && CMD.def.key === 'trim');
    ok('and TRIM is still running for the next one', still);
    await page.keyboard.press('Escape');
  });

  scene('TRIM: two clicks in empty space make a straight fence', async (page) => {
    await page.evaluate(grid);
    await command(page, 'TR');
    const a = await at(page, -300, 2300), c = await at(page, 1700, 2300);
    await page.mouse.click(a.x, a.y);
    await page.mouse.move(c.x, c.y, { steps: 4 });
    await page.mouse.click(c.x, c.y);
    const r = await page.evaluate(tops);
    eq('the two stubs the fence crossed are gone, the others stay', r, [2000, 2000, 2500, 2500]);
    await page.keyboard.press('Escape');
  });

  scene('TRIM: hovering shows the piece a click would take, with a pick box and no snap', async (page) => {
    await page.evaluate(grid);
    await command(page, 'TR');
    /* right beside the stub's top endpoint: a point prompt would snap to it */
    const h = await at(page, 1000, 2480);
    await page.mouse.move(h.x + 3, h.y, { steps: 3 });
    await page.evaluate(() => OG.settle());
    const r = await page.evaluate(() => {
      const P = ST.preview || [];
      let lo = Infinity, hi = -Infinity, x = null;
      for (const e of P) for (const p of [e.a, e.b]) if (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); x = p[0]; }
      return { n: P.length, lo, hi, x, snap: !!ST.snap, box: showPickBox() };
    });
    ok('a preview is drawn', r.n > 0, JSON.stringify(r));
    eq('it is the stub from the rail to the top, on that post',
      [Math.round(r.x), Math.round(r.lo), Math.round(r.hi)], [1000, 2000, 2500]);
    eq('no object snap is offered at an object prompt', r.snap, false);
    eq('the cursor is the pick box', r.box, true);
    /* and the preview is really on the canvas, in the preview colour */
    const px = await page.evaluate(() => {
      const hexOf = p => OG.hex(p);
      const found = [];
      for (let y = 2050; y < 2450; y += 10) found.push(hexOf(OG.px(1000, y)));
      return { found, bg: hexOf(OG.px(1300, 2300)) };
    });
    ok('dashes in a colour other than the line and the paper are painted along it',
      new Set(px.found.filter(c => c !== px.bg)).size >= 2, JSON.stringify(px));
    await page.mouse.click(h.x + 3, h.y);
    const t = await page.evaluate(tops);
    eq('and the click takes exactly that piece', t, [2000, 2500, 2500, 2500]);
    await page.keyboard.press('Escape');
  });
};
