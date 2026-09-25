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
    /* a command that prints a line grows the command line and shrinks the
       canvas under it: let that land before turning world points into pixels */
    await page.evaluate(() => OG.settle());
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

  scene('OFFSET: the prompt offers its default, and the side is shown before it is clicked', async (page) => {
    await page.evaluate(() => {
      OG.reset(); MODSET.offDist = -1;
      begin();
      addEnt({ t: 'pline', pts: [[0, 0], [2000, 0], [3000, 1000], [3000, 3000]], bulges: [0, Math.tan(Math.PI / 8), 0] });
      commit('p');
      OG.stage(1500, 1500, 0.15);
    });
    await command(page, 'O');
    const shown = await page.evaluate(() => document.getElementById('hint').textContent);
    eq('the command line reads as AutoCAD\'s does', shown, 'Specify offset distance or [Through/Erase/Layer] <Through>:');
    await page.keyboard.type('200');
    await page.keyboard.press('Enter');
    await page.evaluate(() => OG.settle());
    const on = await at(page, 1000, 0);
    await page.mouse.click(on.x, on.y);
    const side = await at(page, 1000, 600);
    await page.mouse.move(side.x, side.y, { steps: 4 });
    const pv = await page.evaluate(() => (ST.preview || []).map(e => e.t + ':' + (e.pts || []).length));
    eq('the offset is previewed on the side the cursor is on', pv, ['pline:4']);
    await page.mouse.click(side.x, side.y);
    const r = await page.evaluate(() => {
      const o = [...DOC.ents.values()][1];
      return o && { n: o.pts.length, y: Math.round(o.pts[0][1]), b: +o.bulges[1].toFixed(9) };
    });
    eq('and the click makes it: the arc still an arc', r, { n: 4, y: 200, b: +Math.tan(Math.PI / 8).toFixed(9) });
    await page.keyboard.press('Escape');
  });

  scene('FILLET: the arc is previewed on the second object, and made by the click', async (page) => {
    await page.evaluate(() => {
      OG.reset(); VS.trimmode = 1; DOC.filletR = 0;
      begin();
      addEnt({ t: 'line', a: [0, 0], b: [2000, 0] });
      addEnt({ t: 'line', a: [2500, 500], b: [2500, 2500] });
      commit('corner');
      OG.stage(1250, 1250, 0.15);
    });
    await command(page, 'F');
    await page.keyboard.type('R'); await page.keyboard.press('Enter');
    await page.keyboard.type('400'); await page.keyboard.press('Enter');
    await page.evaluate(() => OG.settle());
    const p1 = await at(page, 1000, 0), p2 = await at(page, 2500, 1500);
    await page.mouse.click(p1.x, p1.y);
    await page.mouse.move(p2.x, p2.y, { steps: 5 });
    const pv = await page.evaluate(() => (ST.preview || []).map(e => e.t).sort());
    eq('hovering the second line previews both trimmed lines and the arc', pv, ['arc', 'line', 'line']);
    await page.mouse.click(p2.x, p2.y);
    const r = await page.evaluate(() => {
      const arc = [...DOC.ents.values()].find(e => e.t === 'arc');
      return { arc: arc && [Math.round(arc.c[0]), Math.round(arc.c[1]), arc.r], running: !!CMD };
    });
    eq('the fillet fills the corner the lines were run on to', r.arc, [2100, 400, 400]);
    eq('and without Multiple the command is done', r.running, false);
  });

  scene('STRETCH: a crossing window dragged right to left moves the ends inside it', async (page) => {
    await page.evaluate(() => {
      OG.reset();
      begin();
      addEnt({ t: 'pline', pts: [[0, 0], [3000, 0], [3000, 2000], [0, 2000]], closed: true });
      commit('box');
      OG.stage(1800, 1000, 0.12);
    });
    await command(page, 'S');
    /* right to left over the right-hand side: a crossing */
    const a = await at(page, 3600, 2500), b = await at(page, 2500, -500);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.press('Enter');
    await page.evaluate(() => OG.settle());
    const shown = await page.evaluate(() => PROMPT.text);
    eq('it asks for the base point, offering Displacement', shown, 'Specify base point or [Displacement] <Displacement>:');
    const p1 = await at(page, 3000, 1000), p2 = await at(page, 4000, 1000);
    await page.mouse.click(p1.x, p1.y);
    await page.mouse.move(p2.x, p2.y, { steps: 4 });
    await page.mouse.click(p2.x, p2.y);
    const pts = await page.evaluate(() => [...DOC.ents.values()][0].pts.map(p => p.map(Math.round)));
    eq('the right-hand corners moved a metre; the left ones stayed', pts, [[0, 0], [4000, 0], [4000, 2000], [0, 2000]]);
  });

  scene('BREAK: the pick is the first point, the next click the second', async (page) => {
    await page.evaluate(() => {
      OG.reset();
      begin(); addEnt({ t: 'line', a: [0, 0], b: [4000, 0] }); commit('l');
      OG.stage(2000, 0, 0.15);
    });
    await command(page, 'BR');
    const p1 = await at(page, 1000, 0), p2 = await at(page, 2500, 0);
    await page.mouse.click(p1.x, p1.y);
    await page.mouse.move(p2.x, p2.y, { steps: 4 });
    const pv = await page.evaluate(() => (ST.preview || []).length);
    ok('the gap about to open is previewed', pv > 0, String(pv));
    await page.mouse.click(p2.x, p2.y);
    const r = await page.evaluate(() => [...DOC.ents.values()].map(e => [Math.round(e.a[0]), Math.round(e.b[0])]));
    eq('two pieces either side of the gap', r, [[0, 1000], [2500, 4000]]);
  });

  /* Round-1 critic: FILLET Polyline stored four true arcs and the screen drew
     four chamfers. The solid-line path stroked a polyline through its vertices
     and never looked at its bulges. Sample the canvas ON the arc and ON the
     chord it used to draw. */
  scene('a filleted polyline corner is DRAWN as its arc, not as the chord', async (page) => {
    await page.evaluate(() => { OG.reset(); OG.stage(2000, 1500, 0.15); });
    await command(page, 'RECTANG');
    await page.keyboard.type('0,0'); await page.keyboard.press('Enter');
    await page.keyboard.type('4000,3000'); await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');                 /* RECTANG waits for another */
    await command(page, 'FILLET');
    await page.keyboard.type('R'); await page.keyboard.press('Enter');
    await page.keyboard.type('300'); await page.keyboard.press('Enter');
    await page.keyboard.type('P'); await page.keyboard.press('Enter');
    await page.evaluate(() => OG.settle());
    const e = await at(page, 2000, 0);
    await page.mouse.click(e.x, e.y);
    await page.evaluate(() => { cancelCmd(); SEL.clear(); OG.stage(3800, 200, 1.0); });
    await page.evaluate(() => OG.settle());
    const r = await page.evaluate(() => {
      /* the darkest pixel within two of a world point: a hairline is
         antialiased, so one exact pixel can miss it */
      const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
      const ink = (x, y) => {
        const s = w2s([x, y]), kx = cv.width / V.w, ky = cv.height / V.h;
        const d = ctx.getImageData(Math.round(s[0] * kx) - 2, Math.round(s[1] * ky) - 2, 5, 5).data;
        let lo = 255;
        for (let i = 0; i < d.length; i += 4) lo = Math.min(lo, (d[i] + d[i + 1] + d[i + 2]) / 3);
        return Math.round(lo);
      };
      const k = Math.SQRT1_2;
      return {
        arc: ink(3700 + 300 * k, 300 - 300 * k),     /* on the true arc, mid-sweep   */
        chord: ink(3850, 150),                       /* on the chord's midpoint      */
        paper: ink(3600, 150),                       /* inside, clear of both        */
        bulges: [...DOC.ents.values()][0].bulges.filter(Boolean).length,
      };
    });
    eq('four arcs are stored', r.bulges, 4);
    ok('ink on the true arc', r.arc < r.paper - 60, JSON.stringify(r));
    ok('and none on the chord it used to draw', r.chord > r.paper - 10, JSON.stringify(r));
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
