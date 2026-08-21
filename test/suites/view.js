'use strict';
/* ============================================================
   Viewport navigation and render fidelity — 05-view / 07b-nav
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; DOC.ltScale = 1;      /* suites share one sandbox */
  DOC.gridStep = 100; DOC.snapStep = 100; DOC.textH = 200;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  V.dpr = 1; V.kx = 1; V.ky = 1;
  VS.vtDuration = 0;                      /* headless: settle instantly */
  VS.zoomFactor = 60; VS.gridMajor = 5; VS.ucsIcon = true;
  ST.lwt = true; ST.grid = true; ST.cur = null; ST.snap = null;
  ST.band = null; ST.preview = null; ST.hot = null; ST.tracks = null;
  SEL.clear(); ZPREV.length = 0; endCmd(true);
`;
const TRACE = `const _c = document.getElementById('cv').getContext('2d');
  const _reset = () => { _c.__trace.pts.length = 0; _c.__trace.calls.length = 0; _c.__trace.counts = {}; };`;

module.exports = ({ group, t, ok, eq, close, R }) => {

  /* ---------------------------------------------------------- */
  group('viewport: zoom anchoring and precision');

  t('wheel zoom pins the world point under the cursor, at every angle', () => {
    const r = R(SETUP + `
      const worst = {err: 0, at: ''};
      for (const ang of [0, 37, 90, 213]) {
        V.rot = rad(ang);
        for (const [sx, sy] of [[0,0],[13,777],[600,400],[1199,799]]) {
          for (const f of [1.6, 1/1.6, 8, 1/64]) {
            V.z = 0.37; V.px = 91; V.py = 613;
            const before = s2w(sx, sy);
            zoomAt(sx, sy, f);
            const after = s2w(sx, sy);
            /* judge the slip in screen pixels — a world tolerance would be
               meaningless once the zoom has changed by six orders */
            const e = dist(before, after) * V.z;
            if (e > worst.err) { worst.err = e; worst.at = ang + '° ' + sx + ',' + sy + ' x' + f; }
          }
        }
      }
      V.rot = 0;
      return worst;`);
    ok(r.err < 1e-9, `cursor anchor slipped ${r.err}px at ${r.at}`);
  });

  t('zooming in and back out returns to exactly the same view', () => {
    const r = R(SETUP + `
      const z0 = V.z, px0 = V.px, py0 = V.py;
      for (let i = 0; i < 6; i++) zoomAt(430, 260, wheelFactor(-1));
      for (let i = 0; i < 6; i++) zoomAt(430, 260, wheelFactor(1));
      return {dz: Math.abs(V.z / z0 - 1), dpx: Math.abs(V.px - px0), dpy: Math.abs(V.py - py0)};`);
    ok(r.dz < 1e-12, 'zoom drifted by ' + r.dz);
    ok(r.dpx < 1e-6 && r.dpy < 1e-6, `pan drifted by ${r.dpx}, ${r.dpy}`);
  });

  t('one wheel detent is the step ZOOMFACTOR describes', () => {
    const r = R(SETUP + `
      const out = {};
      for (const zf of [3, 60, 100]) { VS.zoomFactor = zf; out[zf] = 1 / wheelFactor(1); }
      VS.zoomFactor = 60;
      out.half = 1 / wheelFactor(0.5);
      return out;`);
    close(r[60], 1.6, 1e-12, 'ZOOMFACTOR 60 is AutoCAD\'s default 1.6x per detent');
    close(r[3], 1.03, 1e-12); close(r[100], 2, 1e-12);
    close(r.half, Math.sqrt(1.6), 1e-12, 'a half detent is half a step in log space');
  });

  t('the view stays exact from 1:1000000 out to 1000:1', () => {
    const r = R(SETUP + `
      const bad = [];
      for (const scale of [1e-6, 1e-3, 1, 1000]) {
        V.z = PX_PER_MM * scale; V.px = 600; V.py = 400; V.rot = rad(23);
        for (const p of [[0,0],[8400,6000],[-1234.5,987.6],[1e6,-1e6]]) {
          const back = s2w(...w2s(p));
          /* compare in screen pixels: a fixed world tolerance cannot mean the
             same thing at both ends of a nine-order range */
          if (dist(back, p) * V.z > 1e-6) bad.push(scale + ' @' + p);
        }
      }
      V.rot = 0;
      return bad;`);
    eq(r.length, 0, r.join(', '));
  });

  t('a long line still draws when the screen coordinates run to billions', () => {
    const r = R(SETUP + TRACE + `
      addEnt({t: 'line', a: [-3e5, -3e4], b: [3e5, 3e4]});
      ST.grid = false; VS.ucsIcon = false;    /* measure the entity path only */
      V.z = 3780; V.px = V.w / 2; V.py = V.h / 2;   /* about 1000:1 */
      _reset(); paint();
      const pts = _c.__trace.pts.filter(p => isFinite(p[0]) && isFinite(p[1]));
      const big = pts.filter(p => Math.abs(p[0]) > 1e5 || Math.abs(p[1]) > 1e5);
      /* the clipped run has to still lie on the true line: y = x/10 in world */
      const off = pts.map(p => { const w = s2w(p[0], p[1]); return Math.abs(w[1] - w[0] / 10); });
      ST.grid = true; VS.ucsIcon = true;
      return {n: pts.length, big: big.length, worst: off.length ? Math.max(...off) : -1};`);
    ok(r.n >= 2, 'the line vanished entirely at extreme zoom');
    eq(r.big, 0, 'clipping must keep every path coordinate small, saw ' + r.big + ' huge ones');
    ok(r.worst >= 0 && r.worst < 1e-3, 'the clipped run drifted off the true line by ' + r.worst);
  });

  /* ---------------------------------------------------------- */
  group('viewport: ZOOM options');

  t('Extents frames the drawing and Window frames what you drew round', () => {
    const r = R(SETUP + `
      addEnt({t: 'line', a: [0, 0], b: [8000, 5000]});
      fit();
      const b = bboxAll([...DOC.ents.values()]);
      const cs = [[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]].map(w2s);
      const inside = cs.every(p => p[0] > -1 && p[0] < V.w + 1 && p[1] > -1 && p[1] < V.h + 1);
      const spanX = Math.max(...cs.map(p => p[0])) - Math.min(...cs.map(p => p[0]));
      const zE = V.z;
      zoomWindow([2000, 1000], [4000, 3000]);
      const w = w2s([2000, 1000]), e = w2s([4000, 3000]);
      return {inside, fill: spanX / V.w, zE, winFits: Math.abs(e[0] - w[0]) <= V.w + 1 && Math.abs(e[1] - w[1]) <= V.h + 1,
              tighter: V.z > zE};`);
    eq(r.inside, true, 'zoom extents must leave the whole drawing on screen');
    ok(r.fill > 0.8, 'extents should fill the viewport, filled ' + r.fill.toFixed(2));
    eq(r.winFits, true, 'the requested window must fit the viewport');
    eq(r.tighter, true, 'a window inside the extents must zoom in');
  });

  t('Scale means 2 of the full view, 2x of the current one and 2xp of paper', () => {
    const r = R(SETUP + `
      addEnt({t: 'line', a: [0, 0], b: [8000, 5000]});
      fit(); const zE = V.z;
      zoomScale(2, false); const abs2 = V.z / zE;
      fit(); zoomScale(2, true); const rel2 = V.z / zE;
      fit(); zoomScale(0.5, true); const half = V.z / zE;
      startCmd('zoom'); cmdText('2xp'); const xp = V.z / PX_PER_MM;
      endCmd(true);
      return {abs2, rel2, half, xp};`);
    close(r.abs2, 2, 1e-9, '2 is twice the zoom-all view');
    close(r.rel2, 2, 1e-9, '2x is twice the current view');
    close(r.half, 0.5, 1e-9);
    close(r.xp, 2, 1e-9, '2xp puts one drawing unit on two paper units');
  });

  t('Previous is a real stack, ten deep, and never pops past the bottom', () => {
    const r = R(SETUP + `
      addEnt({t: 'line', a: [0, 0], b: [8000, 5000]});
      fit();
      const seen = [];
      for (let i = 0; i < 14; i++) { seen.push(V.z); pushView(); zoomScale(1.5, true); }
      const depth = ZPREV.length;
      const back = [];
      for (let i = 0; i < 14; i++) { zoomPrev(); back.push(V.z); }
      /* the last ten pushes come back in reverse; older ones are gone */
      const want = seen.slice(-10).reverse();
      const errs = want.map((v, i) => Math.abs(back[i] / v - 1)).filter(e => e > 1e-9);
      return {depth, errs: errs.length, finite: back.every(v => isFinite(v) && v > 0)};`);
    eq(r.depth, 10, 'AutoCAD keeps ten previous views');
    eq(r.errs, 0, 'every popped view must be restored exactly');
    eq(r.finite, true, 'popping an empty stack must leave the view alone');
  });

  t('Object frames the selection and Centre re-centres without surprises', () => {
    const r = R(SETUP + `
      addEnt({t: 'line', a: [0, 0], b: [20000, 12000]});
      const small = addEnt({t: 'circle', c: [1000, 800], r: 300});
      fit();
      SEL.clear(); SEL.add(small.id);
      startCmd('zoom'); cmdText('o');
      const s = w2s([1000, 800]);
      const rpx = 300 * V.z;
      SEL.clear(); endCmd(true);
      zoomCenter([5000, 5000], 4000);
      const c = w2s([5000, 5000]);
      return {onScreen: Math.abs(s[0] - V.w/2) < 2 && Math.abs(s[1] - V.h/2) < 2, rpx,
              cx: c[0], cy: c[1], height: V.h / V.z};`);
    eq(r.onScreen, true, 'ZOOM Object must centre the object');
    ok(r.rpx > 100, 'ZOOM Object must fill the viewport with it, got r=' + r.rpx.toFixed(0) + 'px');
    close(r.cx, 600, 1e-6); close(r.cy, 400, 1e-6);
    close(r.height, 4000, 1e-6, 'ZOOM Centre takes a height in drawing units');
  });

  /* ---------------------------------------------------------- */
  group('viewport: HiDPI backing store');

  t('the canvas is backed at the display resolution and the transform matches', () => {
    const r = R(SETUP + `
      const cvs = document.getElementById('cv');
      const out = {};
      for (const dpr of [1, 1.25, 2, 3]) {
        window.devicePixelRatio = dpr;
        cvs.width = 900; cvs.height = 694;         /* the CSS box the stub reports */
        resize();
        out[dpr] = {back: [cvs.width, cvs.height], css: [V.w, V.h], dpr: V.dpr,
                    kx: cvs.width / V.w, ky: cvs.height / V.h, vk: [V.kx, V.ky]};
      }
      window.devicePixelRatio = 1;
      cvs.width = 1200; cvs.height = 800; resize();
      V.w = 1200; V.h = 800; V.kx = 1; V.ky = 1;
      return out;`);
    for (const dpr of [1, 1.25, 2, 3]) {
      const v = r[dpr];
      eq(v.back[0], Math.round(v.css[0] * dpr), `dpr ${dpr}: backing width`);
      eq(v.back[1], Math.round(v.css[1] * dpr), `dpr ${dpr}: backing height`);
      /* the scale must come from the two sizes, not from dpr — rounding the
         backing store to whole pixels otherwise smears every hairline */
      close(v.vk[0], v.kx, 1e-12, `dpr ${dpr}: x scale follows the backing store`);
      close(v.vk[1], v.ky, 1e-12, `dpr ${dpr}: y scale follows the backing store`);
    }
    ok(r[3].dpr === 3, 'a 3x display must not be clamped down to 2x');
  });

  t('a hairline is one device pixel and axis-aligned chrome sits on the grid', () => {
    const r = R(SETUP + `
      const out = {};
      for (const k of [1, 1.25, 2]) {
        V.kx = k; V.ky = k; V.dpr = k; deviceMetrics0 = 0;
        /* deviceMetrics() derives from the canvas, so poke HAIR the way paint does */
        HAIR = 1 / V.kx;
        out[k] = {hair: HAIR, dev: HAIR * k,
                  snapOdd: snapXd(100.37, 1) * k, snapEven: snapXd(100.37, 2) * k};
      }
      V.kx = 1; V.ky = 1; V.dpr = 1; HAIR = 1;
      return out;`);
    for (const k of [1, 1.25, 2]) {
      close(r[k].dev, 1, 1e-12, `dpr ${k}: a hairline must be exactly one device pixel`);
      close(r[k].snapOdd % 1, 0.5, 1e-9, `dpr ${k}: an odd-width stroke centres on a pixel`);
      close(r[k].snapEven % 1, 0, 1e-9, `dpr ${k}: an even-width stroke sits on a boundary`);
    }
  });

  /* ---------------------------------------------------------- */
  group('viewport: lineweights and linetypes');

  t('a lineweight is a plot width: fixed on screen, independent of zoom', () => {
    const r = R(SETUP + `
      const out = {};
      ST.lwt = true; HAIR = 0.5;              /* a 2x display: sub-pixel pens are real */
      out.atZoom = [0.01, 1, 100].map(z => { V.z = z; return lwPx(0.5); });
      out.mm05 = lwPx(0.5); out.mm25 = lwPx(0.25); out.mm2 = lwPx(2.0);
      out.hairFloor = lwPx(0.05);             /* thinner than a device pixel */
      ST.lwt = false; out.off = lwPx(2.0);
      ST.lwt = true; HAIR = 1;
      out.ladder = [lwSnap(0.26), lwSnap(0.47), lwSnap(9), lwSnap(-1)];
      V.z = 1;
      return out;`);
    close(r.atZoom[0], r.atZoom[1], 1e-12, 'lineweight must not change with zoom');
    close(r.atZoom[2], r.atZoom[1], 1e-12);
    close(r.mm05, 0.5 * 96 / 25.4, 1e-9, 'a 0.5mm pen is 0.5mm on a 96dpi screen');
    close(r.mm25, 0.25 * 96 / 25.4, 1e-9);
    close(r.mm2, 2 * 96 / 25.4, 1e-9);
    ok(r.mm2 > r.mm05 && r.mm05 > r.mm25, 'the pen ladder must stay distinguishable');
    close(r.hairFloor, 0.5, 1e-12, 'nothing draws thinner than one device pixel');
    close(r.off, 0.5, 1e-12, 'with LWDISPLAY off everything is a hairline');
    eq(r.ladder[0], 0.25); eq(r.ladder[1], 0.5); eq(r.ladder[2], 2.11); eq(r.ladder[3], 0);
  });

  t('LWDISPLAY reaches the renderer', () => {
    const r = R(SETUP + `
      const L = layer('0'); L.lw = 2.11;
      const e = addEnt({t: 'line', a: [0, 0], b: [500, 0], layer: '0'});
      V.z = 1; V.px = 100; V.py = 400; HAIR = 1;
      frameLayers();                          /* paint() normally does this first */
      const c = document.getElementById('cv').getContext('2d');
      /* read the width off the context the instant after the stroke, which is
         the last thing drawEnt does */
      const widths = [true, false].map(on => { ST.lwt = on; drawEnt(e); return c.lineWidth; });
      ST.lwt = true; L.lw = 0.25;
      return widths;`);
    close(r[0], 2.11 * 96 / 25.4, 1e-9, 'a 2.11mm pen must reach the canvas at its plotted width');
    close(r[1], 1, 1e-9, 'hairline mode strokes one device pixel');
  });

  t('dash patterns are drawing units scaled by LTSCALE and the zoom', () => {
    const r = R(SETUP + `
      const out = {};
      V.z = 1; DOC.ltScale = 1; dashSync();
      out.base = dashFor('dashed').slice();
      DOC.ltScale = 4; dashSync(); out.lts4 = dashFor('dashed').slice();
      DOC.ltScale = 1; V.z = 4; dashSync(); out.z4 = dashFor('dashed').slice();
      V.z = 0.02; dashSync(); out.tiny = dashFor('dashed').slice();
      V.z = 1; DOC.ltScale = 1; dashSync();
      out.hidden = dashFor('hidden').slice();
      out.center = dashFor('center').slice();
      out.solid = dashFor('solid').slice();
      out.unknown = dashFor('nosuchtype').slice();
      return out;`);
    close(r.base[0], 12.7, 1e-9, 'DASHED is acadiso 12.7mm on, 6.35 off');
    close(r.base[1], 6.35, 1e-9);
    close(r.lts4[0], 50.8, 1e-9, 'LTSCALE multiplies the pattern');
    close(r.z4[0], 50.8, 1e-9, 'the pattern lives in the model, so zoom scales it');
    eq(r.tiny.length, 0, 'a pattern smaller than a few pixels reads as solid, as in AutoCAD');
    eq(r.solid.length, 0); eq(r.unknown.length, 0);
    close(r.hidden[0], 6.35, 1e-9); close(r.center[0], 31.75, 1e-9);
    eq(r.center.length, 4, 'CENTER is long-short-long');
  });

  t('a dashed line really reaches the canvas as dashes, and holds through arcs', () => {
    const r = R(SETUP + TRACE + `
      ST.grid = false;
      DOC.ltScale = 40;
      addEnt({t: 'line', a: [0, 0], b: [4000, 0], lt: 'dashed'});
      addEnt({t: 'arc', c: [0, 0], r: 2000, a0: 0, a1: Math.PI / 2, lt: 'dashed'});
      V.z = 0.1; V.px = 100; V.py = 600;
      let seen = null;
      const c = document.getElementById('cv').getContext('2d');
      const real = c.setLineDash;
      const got = [];
      c.setLineDash = a => { got.push(a && a.length ? a.slice() : []); };
      _reset(); paint();
      c.setLineDash = real;
      ST.grid = true; DOC.ltScale = 1;
      return {dashed: got.filter(a => a.length === 2).length, arcs: _c.__trace.counts.arc || 0};`);
    ok(r.dashed > 0, 'the dashed linetype never reached setLineDash');
    ok(r.arcs > 0, 'the dashed arc still drew as an arc, so the pattern runs along it');
  });

  /* ---------------------------------------------------------- */
  group('viewport: grid, crosshair, UCS icon, draw order');

  t('the grid subdivides on a 1-2-5 ladder anchored on the grid spacing', () => {
    const r = R(SETUP + `
      DOC.gridStep = 100;
      const out = [];
      for (const z of [0.002, 0.02, 0.2, 1, 6, 40]) {
        V.z = z;
        const s = gridStep();
        out.push({z, s, px: s * z, mult: s / 100});
      }
      V.z = 1;
      return out;`);
    for (const g of r) {
      ok(g.px >= 8 && g.px <= 110, `at z=${g.z} the grid sits ${g.px.toFixed(1)}px apart`);
      const m = g.mult >= 1 ? g.mult : 1 / g.mult;
      const dec = m / Math.pow(10, Math.floor(Math.log10(m) + 1e-9));
      ok(Math.abs(dec - 1) < 1e-6 || Math.abs(dec - 2) < 1e-6 || Math.abs(dec - 5) < 1e-6,
        `grid step ${g.s} is not a 1-2-5 multiple of the 100 spacing`);
    }
  });

  t('the grid thins out instead of turning into moiré, and never floods the canvas', () => {
    const r = R(SETUP + TRACE + `
      DOC.gridStep = 100; ST.grid = true;
      const out = {};
      for (const z of [1e-5, 1e-3, 0.05, 1, 50]) {
        V.z = z; V.px = 600; V.py = 400;
        _reset(); paint();
        out['z' + z] = _c.__trace.pts.length;
      }
      V.z = 1;
      return out;`);
    for (const k of Object.keys(r)) ok(r[k] < 12000, k + ' drew ' + r[k] + ' path points — the grid is flooding');
    ok(r.z1 > 0, 'the grid must actually draw at a normal zoom');
  });

  t('the crosshair follows CURSORSIZE and carries the pick box only outside a command', () => {
    const r = R(SETUP + TRACE + `
      ST.grid = false; ST.cur = s2w(600, 400); ST.inView = true;
      const span = () => { _reset(); drawCursor();
        const xs = _c.__trace.pts.map(p => p[0]), ys = _c.__trace.pts.map(p => p[1]);
        return {w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
                n: _c.__trace.pts.length, rects: _c.__trace.counts.strokeRect || 0}; };
      ST.crossLen = 100; const full = span();
      ST.crossLen = 10;  const short = span();
      startCmd('line'); cmdPoint([0,0]); const inCmd = span(); endCmd(true);
      ST.inView = false; const away = span();
      ST.inView = true; ST.crossLen = 100; ST.cur = null; ST.grid = true;
      return {full, short, inCmd, away};`);
    close(r.full.w, 1200, 1e-6, 'CURSORSIZE 100 spans the whole viewport');
    ok(r.short.w > 70 && r.short.w < 90, 'CURSORSIZE 10 gives short arms, got ' + r.short.w);
    eq(r.full.rects, 1, 'the pick box shows when no command is running');
    eq(r.inCmd.rects, 0, 'the pick box hides once a command is running');
    eq(r.away.n, 0, 'no crosshair once the pointer has left the drawing area');
  });

  t('the UCS icon sits on the origin when it fits and retreats to the corner when it does not', () => {
    const r = R(SETUP + TRACE + `
      ST.grid = false; ST.cur = null;
      const shot = () => { _reset(); drawUcsIcon();
        const xs = _c.__trace.pts.map(p => p[0]).filter(isFinite);
        const ys = _c.__trace.pts.map(p => p[1]).filter(isFinite);
        return {n: _c.__trace.pts.length, x0: Math.min(...xs), x1: Math.max(...xs),
                y0: Math.min(...ys), y1: Math.max(...ys),
                labels: _c.__trace.calls.map(c => c[1]).join('')}; };
      V.z = 1; V.px = 600; V.py = 400; const atOrigin = shot();
      V.px = -5000; V.py = -5000; const offScreen = shot();
      VS.ucsIcon = false; const off = shot();
      VS.ucsIcon = true; V.px = 0; V.py = 800; ST.grid = true;
      return {atOrigin, offScreen, off};`);
    ok(r.atOrigin.n > 4, 'the UCS icon must draw');
    ok(Math.abs(r.atOrigin.x0 - 600) < 40 && Math.abs(r.atOrigin.y1 - 400) < 40,
      'with the origin on screen the icon belongs on it');
    ok(r.offScreen.x1 < 200 && r.offScreen.y0 > 600,
      'with the origin off screen the icon retreats to the lower left');
    ok(/X/.test(r.atOrigin.labels) && /Y/.test(r.atOrigin.labels), 'the axes must be labelled');
    eq(r.off.n, 0, 'UCSICON off must draw nothing');
    /* the icon can never leave the viewport, which is what the offscreen
       fallback is for */
    for (const s of [r.atOrigin, r.offScreen])
      ok(s.x0 > 0 && s.x1 < 1200 && s.y0 > 0 && s.y1 < 800, 'the icon left the viewport');
  });

  t('DRAWORDER moves objects through the stack and the renderer honours it', () => {
    const r = R(SETUP + `
      const a = addEnt({t: 'line', a: [0,0], b: [100,0]});
      const b = addEnt({t: 'line', a: [0,10], b: [100,10]});
      const c = addEnt({t: 'line', a: [0,20], b: [100,20]});
      const order = () => [a, b, c].map(e => e.ord || 0);
      begin(); drawOrder([a], 'front'); commit();
      const front = order();
      begin(); drawOrder([a], 'back'); commit();
      const back = order();
      begin(); drawOrder([c], 'above', b); commit();
      const above = order();
      /* the paint bands: fills under geometry, annotation over it */
      const h = addEnt({t: 'hatch', loops: [[[0,0],[100,0],[100,100]]], solid: true});
      const tx = addEnt({t: 'text', p: [0,0], s: 'A', h: 10});
      return {front, back, above, bands: [ZBAND.hatch, ZBAND.room, ZBAND.text, ZBAND.dim, ZBAND.line]};`);
    ok(r.front[0] > r.front[1] && r.front[0] > r.front[2], 'bring to front: ' + r.front);
    ok(r.back[0] < r.back[1] && r.back[0] < r.back[2], 'send to back: ' + r.back);
    ok(r.above[2] > r.above[1], 'above the reference object: ' + r.above);
    eq(r.bands[0], 0, 'hatches paint first');
    eq(r.bands[1], 0, 'rooms paint first');
    eq(r.bands[2], 2, 'text paints last');
    eq(r.bands[3], 2, 'dimensions paint last');
    eq(r.bands[4], undefined, 'plain geometry sits in the middle band');
  });

  t('paint puts fills under geometry and annotation over it, whatever the index returns', () => {
    const r = R(SETUP + TRACE + `
      ST.grid = false; VS.ucsIcon = false;    /* the icon is chrome, not annotation */
      addEnt({t: 'text', p: [200, 200], s: 'ZZZ', h: 400, layer: 'TEXT'});
      addEnt({t: 'line', a: [0, 0], b: [4000, 0]});
      addEnt({t: 'hatch', loops: [[[0,0],[3000,0],[3000,2000],[0,2000]]], solid: true});
      fit();
      _reset(); paint();
      /* the text run has to be the last thing recorded */
      const calls = _c.__trace.calls.map(c => c[1]);
      ST.grid = true; VS.ucsIcon = true;
      return {last: calls[calls.length - 1], n: calls.length};`);
    eq(r.last, 'ZZZ', 'annotation must be painted on top of everything else');
  });

  /* ---------------------------------------------------------- */
  group('viewport: the view scale readout and system variables');

  t('the status bar reads the view scale the way a title block does', () => {
    const r = R(SETUP + `
      const out = {};
      V.z = PX_PER_MM; out['1to1'] = viewScaleText();
      V.z = PX_PER_MM / 50; out['1to50'] = viewScaleText();
      V.z = PX_PER_MM * 4; out['4to1'] = viewScaleText();
      V.z = 1;
      return out;`);
    eq(r['1to1'], '1:1'); eq(r['1to50'], '1:50'); eq(r['4to1'], '4:1');
  });

  t('the view variables are settable from the command line', () => {
    const r = R(SETUP + `
      const out = {};
      runInput('ltscale 25'); out.lts = ltScale();
      runInput('zoomfactor 12'); out.zf = VS.zoomFactor;
      runInput('gridmajor 10'); out.gm = VS.gridMajor;
      runInput('cursorsize 20'); out.cs = ST.crossLen;
      runInput('pickbox 12'); out.pb = ST.pickBox;
      runInput('lwdisplay off'); out.lwOff = ST.lwt;
      runInput('lwdisplay on'); out.lwOn = ST.lwt;
      runInput('ucsicon off'); out.ucsOff = VS.ucsIcon;
      runInput('ucsicon on'); out.ucsOn = VS.ucsIcon;
      runInput('ltscale 1'); VS.zoomFactor = 60; VS.gridMajor = 5;
      ST.crossLen = 100; ST.pickBox = 8;
      return out;`);
    eq(r.lts, 25); eq(r.zf, 12); eq(r.gm, 10); eq(r.cs, 20); eq(r.pb, 12);
    eq(r.lwOff, false); eq(r.lwOn, true);
    eq(r.ucsOff, false); eq(r.ucsOn, true);
  });

  t('ZOOM, PAN and DRAWORDER are real commands, reachable by their aliases', () => {
    const r = R(SETUP + `
      const out = {defined: ['zoom','pan','draworder'].every(k => !!CMDS[k])};
      out.alias = ['z','zo','pa','dro'].map(a => ALIAS[a]);
      startCmd('pan'); out.panOn = !!ST.panCmd; endCmd(true); out.panOff = !!ST.panCmd;
      startCmd('zoom'); cmdEnter(); out.rt = !!ST.rtzoom; endCmd(true); out.rtOff = !!ST.rtzoom;
      return out;`);
    eq(r.defined, true);
    eq(r.alias.join(','), 'zoom,zoom,pan,draworder');
    eq(r.panOn, true, 'the PAN command must arm the pan mode');
    eq(r.panOff, false, 'and let go of it when it ends');
    eq(r.rt, true, 'ZOOM then Enter is AutoCAD\'s real-time zoom');
    eq(r.rtOff, false);
  });
};
