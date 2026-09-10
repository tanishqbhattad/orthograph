#!/usr/bin/env node
'use strict';
/* ============================================================
   ORTHOGRAPH — the tests that need a real browser

   test/run.js is fast because it runs the program against a
   stub: a canvas that records calls, a localStorage that is a
   Map, an IndexedDB that answers immediately. That stub is why
   the suite is worth having, and it is also the reason three
   real faults shipped:

     · autosave wrote its recovery pointer before the drawing
       reached IndexedDB. The fake store called back
       synchronously, so the window where a crash loses the work
       did not exist in the tests.
     · press-drag drew a lasso rather than a window. Nothing
       ever performed a drag, so nothing noticed that a quick
       one selects nothing.
     · a junction of three walls left a hole in the drawing.
       The stub records that a fill happened, not what the
       canvas looks like afterwards.

   So this file drives the actual program in actual Chromium:
   real pointer events, real keyboard, real storage, real
   downloads, and pixels read back off the canvas. It is slower
   and it is the only thing that can see any of the above.

       node test/browser.js            [--headed] [--only=name]
   ============================================================ */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = +(process.env.PORT || 8123);
const BASE = `http://127.0.0.1:${PORT}/`;
const HEADED = process.argv.includes('--headed');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);

/* ---------------- the little harness ---------------- */
const C = process.stdout.isTTY
  ? { g: '\x1b[32m', r: '\x1b[31m', d: '\x1b[2m', y: '\x1b[33m', x: '\x1b[0m' }
  : { g: '', r: '', d: '', y: '', x: '' };
let pass = 0, fail = 0;
const failures = [];
const cases = [];
function scene(name, fn) { cases.push({ name, fn }); }
function ok(what, cond, detail) {
  if (cond) { pass++; console.log(`  ${C.g}✓${C.x} ${what}`); return true; }
  fail++; failures.push(what + (detail ? ' — ' + detail : ''));
  console.log(`  ${C.r}✗${C.x} ${what}`);
  if (detail) console.log(`      ${C.d}${detail}${C.x}`);
  return false;
}
const eq = (what, got, want) =>
  ok(what, JSON.stringify(got) === JSON.stringify(want),
     `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* ---------------- the server under test ---------------- */
function waitFor(url, tries) {
  return new Promise((res, rej) => {
    const go = (n) => http.get(url, r => { r.resume(); res(); })
      .on('error', () => n <= 0 ? rej(new Error('server never came up')) : setTimeout(() => go(n - 1), 120));
    go(tries || 60);
  });
}

/* ---------------- what the page can be asked ----------------
   Injected once per page. Everything here is about REACHING the
   program, never about deciding whether it is right — the
   assertions stay on this side of the wire. */
const PAGE_HELPERS = `
window.OG = {
  /* a known starting point: no drawing, no recovery offer, light theme */
  reset() {
    if (typeof cancelCmd === 'function') cancelCmd();
    resetDoc(); SEL.clear();
    setTheme('light');
    autosaveClear && autosaveClear();
    fit(); draw();
    return DOC.ents.size;
  },
  /* Put a known point of the model in the middle of the canvas at a known
     zoom, with the grid and the axes off. A pixel test has to be able to say
     what it is looking at, and a grid line or the red X axis crossing the
     sample point answers a different question than the one being asked. */
  stage(cx, cy, z) {
    ST.grid = false; VS.ucsIcon = false;
    V.z = z; V.rot = 0;
    V.px = V.w / 2 - cx * z;
    V.py = V.h / 2 + cy * z;
    shapeCacheClear(); draw();
  },
  /* draw() schedules a frame; it does not paint one. Reading the canvas
     without waiting reads whatever was there before — which looks exactly
     like a drawing that failed to appear. */
  settle() {
    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  },
  /* world -> the pixel in the canvas backing store */
  px(x, y) {
    const cv = document.getElementById('cv');
    const ctx = cv.getContext('2d');
    const s = w2s([x, y]);
    const dx = cv.width / (V.w || cv.clientWidth || 1);
    const dy = cv.height / (V.h || cv.clientHeight || 1);
    const d = ctx.getImageData(Math.round(s[0] * dx), Math.round(s[1] * dy), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  },
  /* world -> a page coordinate the mouse can be sent to, and whether that
     coordinate is actually on the canvas: a drag that starts off the edge
     tests nothing and reports the same as a drag that does not work */
  at(x, y) {
    const cv = document.getElementById('cv');
    const b = cv.getBoundingClientRect();
    const s = w2s([x, y]);
    const px = b.left + s[0] * (b.width / (V.w || b.width));
    const py = b.top + s[1] * (b.height / (V.h || b.height));
    const on = px > b.left + 2 && px < b.right - 2 && py > b.top + 2 && py < b.bottom - 2;
    return { x: px, y: py, on };
  },
  hex(p) { return '#' + p.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join(''); },
};
`;

const hex = (p) => '#' + p.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');

/* ============================================================
   the scenes
   ============================================================ */

/* The gesture that was broken: press, drag, release. Left to right takes what
   is wholly inside; right to left takes anything it touches. Nothing in the
   headless suite performs a drag, which is how a lasso shipped as the default
   and made a quick selection do nothing at all. */
scene('press and drag selects, at the speed a person does it', async (page) => {
  await page.evaluate(() => {
    OG.reset();
    ensureLayer('A-WALL');
    begin();
    addEnt({ t: 'line', a: [0, 0], b: [4000, 0], layer: 'A-WALL' });
    addEnt({ t: 'line', a: [3000, 1000], b: [9000, 1000], layer: 'A-WALL' });
    commit('l');
    /* Not fit(). fit() frames the DRAWING, and the corner a selection box is
       dragged FROM is outside the drawing by definition — framed that way the
       press landed 69 pixels to the left of the canvas and never reached the
       program. A gesture that misses and a gesture that does not work report
       the same thing from here, so the view is set outright instead. */
    OG.stage(2000, 250, 0.12);
  });
  const drag = async (from, to) => {
    const [a, b] = await page.evaluate(([f, t]) => [OG.at(f[0], f[1]), OG.at(t[0], t[1])], [from, to]);
    if (!a.on || !b.on) throw new Error('the drag would start or end off the canvas: ' + JSON.stringify([a, b]));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 3 });   /* a flick, not a crawl */
    await page.mouse.up();
    return page.evaluate(() => SEL.size);
  };
  await page.evaluate(() => { cancelCmd(); SEL.clear(); });
  const win = await drag([-900, -900], [4900, 900]);
  eq('left to right takes only what is wholly inside', win, 1);
  await page.evaluate(() => { cancelCmd(); SEL.clear(); });
  /* a box that cuts both lines and wholly contains neither */
  const cross = await drag([4900, 1400], [2000, -500]);
  eq('right to left takes everything it touches', cross, 2);
  const kind = await page.evaluate(() => (ST.band && ST.band.kind) || 'none');
  ok('and it is a box, not a lasso', kind === 'none' || kind === 'rect', kind);
});

/* The stub records that a fill happened. It cannot say whether the drawing
   has a hole in it, which is exactly what three walls meeting produced. */
scene('three walls meeting leave no hole in the drawing', async (page) => {
  await page.evaluate(() => {
    OG.reset();
    ensureLayer('A-WALL');
    begin();
    addEnt({ t: 'wall', a: [-3000, 0], b: [0, 0], wt: 'brk230', layer: 'A-WALL' });
    addEnt({ t: 'wall', a: [0, 0], b: [3000, 0], wt: 'brk230', layer: 'A-WALL' });
    addEnt({ t: 'wall', a: [0, 0], b: [0, -3000], wt: 'brk230', layer: 'A-WALL' });
    commit('t');
    /* close enough that the junction is ~70 pixels across, and both the wall
       body and clear paper are still on the canvas to be compared against */
    OG.stage(0, 0, 0.3);
  });
  await page.evaluate(() => OG.settle());
  const r = await page.evaluate(() => ({
    node: OG.px(0, 0), inWall: OG.px(-800, 0), background: OG.px(-800, 600),
  }));
  ok('the junction itself is painted', hex(r.node) !== hex(r.background),
    `junction ${hex(r.node)}, background ${hex(r.background)}`);
  eq('and painted the same as the walls around it', hex(r.node), hex(r.inWall));
});

/* A door erased has to close the wall up on the CANVAS, not merely in the
   model — the fault was a stale cache, which only a repaint can show. */
scene('a door erased closes the wall up on screen', async (page) => {
  /* every reading waits for a frame: draw() asks for one, it does not paint
     one, and a pixel read before the frame arrives reports the LAST drawing */
  const read = async () => {
    await page.evaluate(() => OG.settle());
    return page.evaluate(() => OG.px(0, 0));
  };
  const made = await page.evaluate(() => {
    OG.reset();
    ensureLayer('A-WALL');
    begin();
    addEnt({ t: 'wall', a: [-3000, 0], b: [3000, 0], wt: 'brk230', layer: 'A-WALL' });
    commit('w');
    OG.stage(0, 0, 0.3);
    return DOC.ents.size;
  });
  eq('a wall to put a door in', made, 1);
  const solid = await read();
  const door = await page.evaluate(() => {
    const w = [...DOC.ents.values()].find(e => e.t === 'wall');
    begin();
    const d = addOpening('door', w, 3000, 'sgl900');   /* the middle of the wall */
    commit('door');
    draw();
    return d ? d.id : null;
  });
  ok('and a door in it', door != null);
  const opened = await read();
  ok('the door cuts the wall', hex(opened) !== hex(solid), `${hex(solid)} -> ${hex(opened)}`);
  /* deleted the way a person deletes: pick it, press the key */
  await page.evaluate((id) => {
    cancelCmd(); SEL.clear(); SEL.add(id);
    document.activeElement && document.activeElement.blur();
  }, door);
  await page.keyboard.press('Delete');
  const healed = await read();
  eq('and erasing it puts the wall back', hex(healed), hex(solid));
});

/* The one the fake store could not see: a pointer written before the drawing
   reached IndexedDB, and a reload that finds it. */
scene('autosave survives a real reload', async (page) => {
  await page.evaluate(async () => {
    OG.reset();
    ensureLayer('A-WALL');
    begin();
    for (let i = 0; i < 40; i++)
      addEnt({ t: 'wall', a: [0, i * 300], b: [6000, i * 300], wt: 'cav300', layer: 'A-WALL' });
    commit('big');
    autosaveNow('test');
  });
  await page.waitForTimeout(400);          /* let a real IndexedDB transaction land */
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const card = document.getElementById('card');
    const html = (card && card.innerHTML) || '';
    return { offered: /recover/i.test(html), shown: document.getElementById('modal').className };
  });
  ok('the drawing is offered back after a reload', r.offered, JSON.stringify(r));
  const n = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#card button')].find(x => /recover/i.test(x.textContent));
    if (b) b.click();
    return DOC.ents.size;
  });
  ok('and recovering it brings the walls back', n >= 40, `${n} objects`);
});

/* A pointer must never survive its drawing: recovery that offers work it
   cannot produce is worse than recovery that offers nothing. */
scene('recovery never offers a drawing it cannot produce', async (page) => {
  const r = await page.evaluate(async () => {
    OG.reset();
    /* a pointer to an overflow record that was never written */
    localStorage.setItem('orthograph.autosave', JSON.stringify({
      v: 1, at: Date.now(), seq: 99, name: 'ghost', reason: 'test', big: true, size: 999999,
    }));
    return new Promise(res => {
      autosaveFetch((okFlag, val) => res({ okFlag, got: val ? 'data' : 'nothing' }));
    });
  });
  eq('a dangling pointer produces nothing', r.got, 'nothing');
});

/* Save and open are the two ends of the promise a drawing program makes. */
scene('a drawing saves to a file and opens again', async (page) => {
  await page.evaluate(() => {
    OG.reset();
    ensureLayer('A-WALL');
    begin();
    addEnt({ t: 'wall', a: [0, 0], b: [6000, 0], wt: 'cav300', layer: 'A-WALL' });
    addEnt({ t: 'room', pts: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]], name: 'OFFICE', layer: 'A-AREA' });
    commit('w');
  });
  /* through the dialog and the button, not the function behind them: the
     function was never the part in doubt */
  await page.evaluate(() => doExport());
  const dl = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#eJson'),
  ]).then(([d]) => d).catch(() => null);
  if (!ok('the Project file button writes a file', !!dl, 'no download event')) return;
  eq('called what it is', path.extname(dl.suggestedFilename()), '.ocad');
  const file = path.join(os.tmpdir(), 'og-e2e-' + Date.now() + '.ocad');
  await dl.saveAs(file);
  const text = fs.readFileSync(file, 'utf8');
  ok('which is the project format', text.trim().startsWith('{') && /"ents"/.test(text),
    text.slice(0, 60));
  const back = await page.evaluate((t) => {
    OG.reset();
    const took = loadNative(t);
    return { took, n: DOC.ents.size, room: [...DOC.ents.values()].some(e => e.name === 'OFFICE') };
  }, text);
  ok('and opens again with the drawing in it', back.took !== false && back.n === 2, JSON.stringify(back));
  eq('including what things were called', back.room, true);
  fs.unlinkSync(file);
});

/* The export a consultant receives. The DXF gates check the text; this checks
   that pressing the button in a browser produces it at all. */
scene('Export DXF hands over a real file', async (page) => {
  await page.evaluate(() => {
    OG.reset();
    ensureLayer('A-WALL');
    begin();
    addEnt({ t: 'wall', a: [0, 0], b: [6000, 0], wt: 'gen100', layer: 'A-WALL' });
    addEnt({ t: 'dim', k: 'linear', p1: [0, 0], p2: [6000, 0], off: 900, layer: 'DIMENSIONS' });
    commit('w');
  });
  await page.evaluate(() => doExport());
  const dl = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#eDxf'),
  ]).then(([d]) => d).catch(() => null);
  if (!ok('the browser receives a download', !!dl)) return;
  const file = path.join(os.tmpdir(), 'og-e2e-' + Date.now() + '.dxf');
  await dl.saveAs(file);
  const text = fs.readFileSync(file, 'utf8');
  ok('it is a DXF', /^\s*0\r?\nSECTION/.test(text), text.slice(0, 40));
  ok('R2000', text.indexOf('AC1015') >= 0);
  ok('with the DIMSTYLE marker AutoCAD demands', text.indexOf('AcDbDimStyleTable') >= 0);
  fs.unlinkSync(file);
});

/* Typed at the command line, the way the program is meant to be driven. */
scene('the command line draws', async (page) => {
  const r = await page.evaluate(() => { OG.reset(); return DOC.ents.size; });
  eq('starting from nothing', r, 0);
  await page.click('#cmd');
  await page.keyboard.type('line');
  await page.keyboard.press('Enter');
  await page.keyboard.type('0,0');
  await page.keyboard.press('Enter');
  await page.keyboard.type('4000,0');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  const out = await page.evaluate(() => {
    const l = [...DOC.ents.values()].find(e => e.t === 'line');
    return { n: DOC.ents.size, a: l && l.a, b: l && l.b, cmd: CMD ? CMD.key : null };
  });
  ok('typing LINE and two points draws one', out.n === 1, JSON.stringify(out));
  eq('between the points that were typed', [out.a, out.b], [[0, 0], [4000, 0]]);
  eq('and Escape ends the command', out.cmd, null);
});

/* Stated outright by the person who uses it: it opens light, every time. */
scene('it opens in the light theme', async (page) => {
  const r = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    name: themeName(),
    canvas: getComputedStyle(document.body).backgroundColor,
  }));
  eq('the document says light', r.attr, 'light');
  eq('and so does the program', r.name, 'light');
});

/* A wall in the default colour, checked where it matters: on the canvas. */
scene('a wall is drawn in the poche, solid', async (page) => {
  await page.evaluate(() => {
    OG.reset();
    ensureLayer('A-WALL');
    begin();
    addEnt({ t: 'wall', a: [-3000, 0], b: [3000, 0], wt: 'brk230', layer: 'A-WALL' });
    commit('w');
    OG.stage(0, 0, 0.3);
  });
  await page.evaluate(() => OG.settle());
  const r = await page.evaluate(() => ({ body: OG.px(0, 0), paper: OG.px(0, 600) }));
  eq('the body is the poche grey', hex(r.body), '#525252');
  ok('with nothing showing through it', r.body[3] === 255, 'alpha ' + r.body[3]);
  ok('on paper white', hex(r.paper) !== '#525252', hex(r.paper));
});

/* ============================================================
   run them
   ============================================================ */
(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.js'), String(PORT)],
    { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ headless: !HEADED });
  let ctx = null;
  try {
    await waitFor(BASE);
    console.log(`\n${C.d}orthograph — in a real browser${C.x}\n`);
    for (const c of cases) {
      if (ONLY && c.name.indexOf(ONLY) < 0) continue;
      console.log(`${C.y}${c.name}${C.x}`);
      /* a context each: storage from one scene must not decide another */
      ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 860 } });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      await page.goto(BASE, { waitUntil: 'load' });
      /* DOC and V are top-level `const`, which lives in the global LEXICAL
         scope rather than on window — so they are reachable by name and not
         as window.DOC. Waiting on the latter waits forever. */
      await page.waitForFunction(() => typeof draw === 'function' && typeof DOC === 'object');
      await page.addScriptTag({ content: PAGE_HELPERS });
      try {
        await c.fn(page);
      } catch (e) {
        fail++; failures.push(c.name + ' — ' + e.message);
        console.log(`  ${C.r}✗${C.x} threw: ${e.message.split('\n')[0]}`);
      }
      if (errs.length) {
        fail++; failures.push(c.name + ' — page error: ' + errs[0]);
        console.log(`  ${C.r}✗${C.x} the page reported an error: ${errs[0].split('\n')[0]}`);
      }
      await ctx.close(); ctx = null;
      console.log('');
    }
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
    server.kill();
  }
  if (failures.length) {
    console.log(`${C.r}FAILURES${C.x}`);
    for (const f of failures) console.log('   - ' + f);
    console.log('');
  }
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
