'use strict';
/* ============================================================
   A2 — object snaps, driven by a real mouse and keyboard.
   The scene is set up through page.evaluate; everything a
   drafter does — typing the override, moving, clicking — goes
   through page.keyboard and page.mouse.
   ============================================================ */
module.exports = ({ scene, ok, eq }) => {
  /* a known board: two lines and two circles, 1 world unit per px */
  const board = async (page) => {
    await page.evaluate(() => {
      OG.reset();
      begin();
      addEnt({ t: 'line', a: [0, 0], b: [400, 0] });
      addEnt({ t: 'circle', c: [0, 300], r: 100 });
      addEnt({ t: 'circle', c: [700, 300], r: 200 });
      commit('board');
      OG.stage(350, 150, 1);
      ST.polar = false; ST.otrack = false;
    });
    await page.evaluate(() => OG.settle());
  };
  /* Starting a command grows the command panel and shrinks the canvas, and
     the resize lands a frame or two later. So the aim is taken, the pointer
     moved, and the aim taken again once the frame has settled — a move
     measured against the old canvas is a move to the wrong place. */
  const moveTo = async (page, x, y, dx = 0, dy = 0) => {
    let a = null;
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => OG.settle());
      const b = await page.evaluate(([x, y]) => OG.at(x, y), [x, y]);
      if (!b.on) throw new Error('off the canvas: ' + x + ',' + y);
      await page.mouse.move(b.x + dx + 6, b.y + dy + 4);
      await page.mouse.move(b.x + dx, b.y + dy);
      const stable = a && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
      a = b;
      if (stable) break;
    }
    await page.evaluate(() => OG.settle());
    return a;
  };
  const clickAt = async (page, x, y, dx = 0, dy = 0) => {
    const a = await moveTo(page, x, y, dx, dy);
    await page.mouse.click(a.x + dx, a.y + dy);
  };
  const type = async (page, s) => {
    await page.click('#cmd');
    await page.keyboard.type(s);
    await page.keyboard.press('Enter');
    await page.evaluate(() => OG.settle());
  };

  scene('END, then a click near the end you want, takes that end', async (page) => {
    await board(page);
    await type(page, 'line');
    await type(page, 'end');
    const said = await page.evaluate(() => ({ hist: CLI.lines[CLI.lines.length - 1].t, base: PROMPT.base }));
    eq('the history line says "end of"', said.hist, 'Specify first point: end of');
    eq('and the prompt is "of"', said.base, 'of');
    await clickAt(page, 300, 0, 0, -2);           /* on the line, a quarter from its end */
    const p = await page.evaluate(() => CMD && CMD.pts[0]);
    eq('the point is the end of the line, exactly', p, [400, 0]);
    await page.keyboard.press('Escape');
  });

  scene('an override that finds nothing is refused, as AutoCAD refuses it', async (page) => {
    await board(page);
    await type(page, 'line');
    await type(page, 'mid');
    await clickAt(page, 300, 150);                /* empty paper */
    const r = await page.evaluate(() => ({ n: CMD ? CMD.pts.length : -1, msg: CLI.lines[CLI.lines.length - 1].t }));
    eq('no point was taken', r.n, 0);
    eq('and it says why', r.msg, 'No Midpoint found for specified point.');
    await clickAt(page, 80, 0, 0, 2);             /* then on the line, far from its middle */
    const p = await page.evaluate(() => CMD && CMD.pts[0]);
    eq('with running snaps the next click still works', !!p, true);
    await page.keyboard.press('Escape');
  });

  scene('running END and MID: the marker jumps to the segment\'s own points', async (page) => {
    await board(page);
    await page.evaluate(() => { toggleSnap('none'); ST.osnapOn.end = 1; ST.osnapOn.mid = 1; });
    await type(page, 'line');
    await moveTo(page, 70, 0, 0, -2);
    const a = await page.evaluate(() => ({ k: ST.snap && ST.snap.k, p: ST.snap && ST.snap.p, tip: ST.snapTip }));
    await moveTo(page, 170, 0, 0, -2);
    const b = await page.evaluate(() => ({ k: ST.snap && ST.snap.k, p: ST.snap && ST.snap.p, tip: ST.snapTip }));
    eq('a fifth of the way along it is the end', [a.k, a.p, a.tip], ['end', [0, 0], 'Endpoint']);
    eq('nearer the middle it is the midpoint', [b.k, b.p, b.tip], ['mid', [200, 0], 'Midpoint']);
    await page.keyboard.press('Escape');
    await page.evaluate(() => setOsmode(4133 | 2 | 8 | 16 | 128 | 131072 | 262144));
  });

  /* With no command running, a click on the rim of a big circle snapped to
     its CENTRE — and then looked for something to select there, where there
     is nothing — so the circle could not be picked by clicking on it. */
  scene('clicking the rim of a big circle with no command selects the circle', async (page) => {
    await page.evaluate(() => {
      OG.reset();
      begin(); addEnt({ t: 'circle', c: [0, 0], r: 300 }); commit('c');
      OG.stage(0, 0, 1);
    });
    await page.evaluate(() => OG.settle());
    const q = 300 * Math.SQRT1_2;
    await moveTo(page, q, q, 1, 0);
    const cur = await page.evaluate(() => ST.cur);
    ok('the crosshair stays on the rim', Math.hypot(cur[0], cur[1]) > 250, JSON.stringify(cur));
    await clickAt(page, q, q, 1, 0);
    const sel = await page.evaluate(() => [...SEL].map(id => DOC.ents.get(id).t));
    eq('and the click selects the circle', sel, ['circle']);
    await page.evaluate(() => { SEL.clear(); draw(); });
  });

  /* The tooltip says "Extension: 500 < 0°" and 500 has to mean 500 from the
     END, along the path — typed at the cursor (the dynamic input) or on the
     command line. It meant 500 from the last point toward the cursor. */
  scene('a distance typed on an Extension or tracking path runs along the path', async (page) => {
    const setup = async (modes, otrack) => {
      await page.evaluate(([modes, otrack]) => {
        OG.reset();
        begin(); addEnt({ t: 'line', a: [0, 0], b: [1000, 0] }); commit('l');
        OG.stage(900, 300, 0.3);
        ST.polar = false; ST.otrack = otrack; ST.dyn = true;
        toggleSnap('none'); for (const k of modes) ST.osnapOn[k] = 1;
      }, [modes, otrack]);
      await page.evaluate(() => OG.settle());
      await type(page, 'line');
      await clickAt(page, 300, 800);               /* on empty paper: focus stays on the drawing */
    };
    const slide = async () => {
      await moveTo(page, 1000, 0, -3, 2);           /* pause over the end */
      await new Promise(r => setTimeout(r, 400));
      await moveTo(page, 1000, 0, -2, 2);
      await moveTo(page, 1500, 0, 0, 2);            /* and slide out along the path */
      return page.evaluate(() => ST.snapTip);
    };
    const last = () => page.evaluate(() => { const l = [...DOC.ents.values()].filter(e => e.t === 'line').pop(); return [l.a, l.b.map(v => +v.toFixed(9))]; });

    await setup(['ext', 'end'], false);
    eq('the Extension tooltip', await slide(), 'Extension: 500 < 0°');
    await page.keyboard.type('500');               /* at the cursor: the dynamic input */
    await page.keyboard.press('Enter');
    await page.evaluate(() => OG.settle());
    eq('typed at the cursor, it ends 500 past the end', await last(), [[300, 800], [1500, 0]]);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

    await setup(['ext', 'end'], false);
    await slide();
    await type(page, '500');                       /* on the command line */
    eq('typed on the command line, the same', await last(), [[300, 800], [1500, 0]]);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

    await setup(['end'], true);
    eq('the tracking tooltip', await slide(), 'Endpoint: 500 < 0°');
    await page.keyboard.type('500');
    await page.keyboard.press('Enter');
    await page.evaluate(() => OG.settle());
    eq('along a tracking path, the same', await last(), [[300, 800], [1500, 0]]);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.evaluate(() => { ST.otrack = true; setOsmode(4133 | 2 | 8 | 16 | 128 | 131072 | 262144); });
  });

  scene('LINE, TAN, TAN draws the tangent common to two circles', async (page) => {
    await board(page);
    await type(page, 'line');
    await type(page, 'tan');
    await moveTo(page, 0, 400, 0, 1);
    const tip = await page.evaluate(() => ST.snapTip);
    eq('the first pick is a Deferred Tangent', tip, 'Deferred Tangent');
    const a = await page.evaluate(() => OG.at(0, 400));
    await page.mouse.click(a.x, a.y + 1);
    await type(page, 'tan');
    await clickAt(page, 700, 500, 0, 1);
    await page.keyboard.press('Escape');
    const L = await page.evaluate(() => {
      const l = [...DOC.ents.values()].filter(e => e.t === 'line').pop();
      return l ? { a: l.a, b: l.b } : null;
    });
    ok('a line was drawn', !!L);
    const d = (p, a, b) => Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    ok('it touches the first circle', Math.abs(d([0, 300], L.a, L.b) - 100) < 1e-9, JSON.stringify(L));
    ok('and the second', Math.abs(d([700, 300], L.a, L.b) - 200) < 1e-9, JSON.stringify(L));
  });
};
