'use strict';
/* ============================================================
   Driving the real program in real Chromium — shared by the
   browser suite and by anyone inspecting a build by hand.

     const H = require('<repo>/test/harness.js');
     const app = await H.open({ root: '<a checkout>', port: 8201 });
     await app.page.evaluate(() => OG.reset());
     const file = await app.shot('after-trim');   // a PNG you can look at
     await app.close();

   `root` is the checkout whose build is served — any worktree,
   not only this one — so the program under inspection is always
   the one that was actually built there, never a description of
   it. Playwright resolves from wherever THIS file lives, so a
   worktree without its own node_modules can still be driven.
   ============================================================ */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');

function waitFor(url, tries) {
  return new Promise((res, rej) => {
    const go = (n) => http.get(url, r => { r.resume(); res(); })
      .on('error', () => n <= 0 ? rej(new Error('server never came up at ' + url)) : setTimeout(() => go(n - 1), 120));
    go(tries || 80);
  });
}

/* ---------------- what the page can be asked ----------------
   Injected once per page. Everything here is about REACHING the
   program, never about deciding whether it is right — the
   judgement stays on the caller's side of the wire. */
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

/** serve a checkout's build on a port; returns { base, kill } */
async function startServer(root, port) {
  root = root || REPO;
  const serve = path.join(root, 'tools', 'serve.js');
  if (!fs.existsSync(serve)) throw new Error('no tools/serve.js under ' + root);
  const proc = spawn(process.execPath, [serve, String(port)], { cwd: root, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}/`;
  await waitFor(base);
  return { base, kill: () => { try { proc.kill(); } catch (_) { } } };
}

/** open a fresh page on a served build, wait for the program, inject OG */
async function newPage(browser, base, opts) {
  const ctx = await browser.newContext(Object.assign(
    { acceptDownloads: true, viewport: { width: 1440, height: 900 } }, opts || {}));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base, { waitUntil: 'load' });
  /* DOC and V are top-level const, which live in the global LEXICAL scope
     rather than on window — reachable by name, not as window.DOC. Waiting on
     the latter waits forever. */
  await page.waitForFunction(() => typeof draw === 'function' && typeof DOC === 'object');
  await page.addScriptTag({ content: PAGE_HELPERS });
  return { ctx, page, errors };
}

/** everything at once: a server, a browser, a page, and somewhere to put pictures */
async function open(o) {
  o = o || {};
  const port = o.port || 8201;
  const srv = await startServer(o.root, port);
  const browser = await chromium.launch({ headless: !o.headed });
  const { ctx, page, errors } = await newPage(browser, srv.base, o.context);
  const shots = o.shots || path.join(require('os').tmpdir(), 'og-shots-' + port);
  fs.mkdirSync(shots, { recursive: true });
  let n = 0;
  return {
    browser, ctx, page, errors, base: srv.base,
    /** screenshot the whole window (or a clip) to a PNG and return its path */
    async shot(name, clip) {
      const f = path.join(shots, String(++n).padStart(2, '0') + '-' + String(name || 'shot').replace(/[^a-z0-9_-]+/gi, '-') + '.png');
      await page.screenshot(clip ? { path: f, clip } : { path: f });
      return f;
    },
    async close() {
      await ctx.close().catch(() => { });
      await browser.close().catch(() => { });
      srv.kill();
    },
  };
}

module.exports = { open, startServer, newPage, waitFor, PAGE_HELPERS, hex, REPO };
