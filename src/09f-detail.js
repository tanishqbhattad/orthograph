'use strict';
/* ============================================================
   ORTHOGRAPH — 09f detail views

   A callout says "this bit is drawn bigger, over there". Two
   halves that have to agree: a bubble on the parent drawing
   carrying a number and a sheet, and an enlarged view of exactly
   the region the bubble circled.

   The half that rots in every drawing set ever issued is the
   reference. Someone moves the detail to another sheet in week
   three and the bubble goes on naming the old one, and the only
   defence is somebody remembering. So the bubble stores no sheet
   name at all: it names whichever sheet is holding the viewport
   it points at, resolved as it is drawn. There is nothing to
   keep in step, so nothing can fall out of step.

   The enlarged view is an ordinary viewport — the same three
   numbers every viewport has ever had — with two additions: it
   is clipped round rather than square, and it carries the key
   and scale under it as a title. Everything else about sheets
   already worked.
   ============================================================ */

/** the sheet and viewport a callout points at, or null if it points nowhere */
function calloutView(co) {
  if (!co || co.vp == null) return null;
  for (const s of (DOC.sheets || []))
    for (const v of (s.viewports || [])) if (v.id === co.vp) return { sheet: s, vp: v };
  return null;
}
/** the NAME of that sheet — what the bubble draws, and never stored */
function calloutSheet(co) {
  const h = calloutView(co);
  return h ? h.sheet.name : null;
}
/** Point the detail view back at whatever the callout now circles. Only ever
    called for a callout the document actually holds: a preview clone carries
    the same vp id, and letting one of those write to the sheet would move the
    real detail during a drag that has not happened yet. */
function calloutSync(co) {
  if (!co || co.id == null || DOC.ents.get(co.id) !== co) return false;
  const h = calloutView(co); if (!h) return false;
  touchSheets();
  const live = h.vp;
  live.centre = [co.c[0], co.c[1]];
  const side = detailSide(h.sheet, co.r, live.scale);
  live.w = side; live.h = side;
  return true;
}
/** the next unused number, as a string, so details read 1, 2, 3 */
function nextDetailKey() {
  let n = 0;
  for (const e of DOC.ents.values())
    if (e.t === 'callout') { const k = parseInt(e.key, 10); if (k > n) n = k; }
  return String(n + 1);
}

/* ---------------- placing the view on the paper ---------------- */
const DETAIL_PAD = 1.15;             /* the window is a shade bigger than the circle */
const DETAIL_GAP = 6;                /* mm kept clear between viewports */
/** how big on the paper a circle of this model radius is at this scale */
function detailSide(sh, r, scale) {
  const want = 2 * r * scale * DETAIL_PAD;
  const m = sh.margin, tb = sh.title && sh.title.show ? sh.title.h : 0;
  const room = Math.min(sh.w - m * 2, sh.h - m * 2 - tb);
  return Math.max(10, Math.min(want, room));
}
/** The first free spot on the sheet, scanning left to right and down — which
    is the order a person lays details out, and better than dropping every one
    of them on top of the last. */
function detailSpot(sh, side) {
  const m = sh.margin, tb = sh.title && sh.title.show ? sh.title.h : 0;
  const x1 = sh.w - m - side, y1 = sh.h - m - tb - side;
  const clash = (x, y) => (sh.viewports || []).some(v =>
    x < v.x + v.w + DETAIL_GAP && x + side + DETAIL_GAP > v.x &&
    y < v.y + v.h + DETAIL_GAP && y + side + DETAIL_GAP > v.y);
  for (let y = m; y <= y1 + 0.001; y += 5)
    for (let x = m; x <= x1 + 0.001; x += 5)
      if (!clash(x, y)) return [x, y];
  return [Math.max(m, x1), Math.max(m, y1)];       /* nowhere free: bottom right */
}
/** the enlarged view itself: an ordinary viewport, clipped round and titled */
function placeDetail(sh, co, scale) {
  const side = detailSide(sh, co.r, scale);
  const [x, y] = detailSpot(sh, side);
  const vp = newViewport(sh, [co.c[0], co.c[1]], scale);
  vp.x = x; vp.y = y; vp.w = side; vp.h = side;
  vp.round = true;                                 /* clipped to a circle */
  vp.det = { key: co.key };                        /* titled with the callout's number */
  /* A callout ring drawn across the middle of its own enlargement is the mark
     of a drawing set nobody checked, so the layer it lives on is frozen in the
     view it points at — and nowhere else. */
  vp.frz = [co.layer];
  sh.viewports.push(vp);
  return vp;
}

defc('detail', {
  key: 'detail', group: 'annotate',
  hint: 'Centre of the detail',
  init(c) { c.data = { c: null }; },
  point(c, p) {
    if (!c.data.c) { c.data.c = p; hint('How much to take in — drag out the circle'); return; }
    const r = dist(c.data.c, p);
    if (!(r > 0)) { echo('Drag the circle out from the middle'); return; }
    ensureLayer('A-ANNO-DETL', '#ff9f5c');
    begin();
    const co = addEnt({ t: 'callout', c: c.data.c.slice(), r, key: nextDetailKey(),
                        vp: null, layer: 'A-ANNO-DETL' });
    commit('Detail callout');
    c.data.co = co;
    /* On a sheet the enlargement is the point of the command, so ask what
       scale and make it. In model space there is nowhere to put one yet: the
       callout stands on its own until a sheet exists, and DETAILVIEW places
       the view later without asking for the circle again. */
    if (!curSheet()) {
      cliPrint('Detail ' + co.key + ' marked. Make a sheet and it will draw itself there.');
      draw(); endCmd(); return;
    }
    hint('Scale for the detail — <em>10</em> for 1:10');
    cliPrint('Detail ' + co.key + ' — what scale? (10 for 1:10)');
  },
  text(c, s) {
    const co = c.data.co;
    if (!co) return false;
    const raw = String(s).trim();
    let r = null;
    const m = /^1\s*[:/]\s*([0-9.]+)$/.exec(raw);
    if (!raw) r = 1 / 10;
    else if (m) r = 1 / parseFloat(m[1]);
    else if (/^[0-9.]+$/.test(raw)) { const n = parseFloat(raw); r = n > 1 ? 1 / n : n; }
    else { const hit = SCALES.find(x => x.label === raw); if (hit) r = hit.r; }
    if (!(r > 0)) { cliPrint('Type a scale like 10, 1:10 or 0.1.', 'err'); return true; }
    const sh = curSheet();
    begin(); touchSheets();
    const vp = placeDetail(sh, co, r);
    mut(co); co.vp = vp.id;
    commit('Detail ' + co.key);
    cliPrint('Detail ' + co.key + ' on ' + sh.name + ' at ' + scaleLabel(r) + '.');
    draw(); syncUI(); endCmd(true);
    return true;
  },
  enter(c) { if (c.data.co) return CMDS.detail.text(c, ''); },
  preview(c, p) {
    if (!c.data.c) return null;
    return [pv({ t: 'circle', c: c.data.c, r: Math.max(dist(c.data.c, p), 1e-6), lt: 'dashed' })];
  },
});

/** Place the view for a callout that has none — the other half of DETAIL when
    the sheet did not exist yet, and the way to put one back after it was
    deleted. */
defc('detailview', {
  key: 'detailview', group: 'annotate',
  hint: 'Pick the callout to draw',
  init(c) { c.data = {}; },
  point(c, p) {
    const co = pickAt(p, 12, e => e.t === 'callout');
    if (!co) { echo('Pick a detail callout'); return; }
    const sh = needSheet(); if (!sh) return endCmd(true);
    if (calloutView(co)) { echo('Detail ' + co.key + ' is already on ' + calloutSheet(co)); return; }
    c.data.co = co;
    hint('Scale for the detail — <em>10</em> for 1:10');
    cliPrint('Detail ' + co.key + ' — what scale?');
  },
  text(c, s) { return CMDS.detail.text(c, s); },
  enter(c) { if (c.data.co) return CMDS.detail.text(c, ''); },
});

/* ---------------- the callout as an object ----------------
   A circle round what is enlarged, a short leader off it, and the bubble every
   drawing office reads without being told: number over sheet. */
function calloutBits(co) {
  const t = (DOC.textH || 2.5) * 2.2;              /* the section marker's own text size */
  const bub = t * 1.4;
  const u = Math.SQRT1_2;                          /* the leader leaves at 45 degrees */
  const edge = [co.c[0] + co.r * u, co.c[1] + co.r * u];
  const cen = [edge[0] + (bub + t * 0.6) * u, edge[1] + (bub + t * 0.6) * u];
  return { t, bub, edge, cen };
}
GEOM.callout = {
  shapes(co) {
    const { t, bub, edge, cen } = calloutBits(co);
    const sheet = calloutSheet(co);
    const out = [
      { c: co.c, r: co.r, a0: 0, a1: TAU, lt: 'dashed' },
      { pts: [edge, cen] },
      { c: cen, r: bub, a0: 0, a1: TAU },
      { pts: [[cen[0] - bub, cen[1]], [cen[0] + bub, cen[1]]] },
      { text: String(co.key || '?'), h: t * 0.75, rot: 0, anchor: 'c',
        p: [cen[0], cen[1] + bub * 0.42] },
    ];
    /* the lower half names the sheet the enlargement is on, and is left empty
       rather than filled with a guess when there is not one yet */
    if (sheet)
      out.push({ text: sheet, h: t * 0.55, rot: 0, anchor: 'c',
                 p: [cen[0], cen[1] - bub * 0.62] });
    return out;
  },
  bbox(co) {
    const { bub, cen } = calloutBits(co);
    return [Math.min(co.c[0] - co.r, cen[0] - bub), Math.min(co.c[1] - co.r, cen[1] - bub),
            Math.max(co.c[0] + co.r, cen[0] + bub), Math.max(co.c[1] + co.r, cen[1] + bub)];
  },
  /* the circle itself is the object, the way a circle is: the middle of it is
     the drawing you are calling out, not the callout */
  dist(p, co) {
    const { bub, cen } = calloutBits(co);
    return Math.min(Math.abs(dist(p, co.c) - co.r), Math.max(0, dist(p, cen) - bub));
  },
  grips: co => [{ p: co.c, k: 'c' }, { p: [co.c[0] + co.r, co.c[1]], k: 'r' }],
  grip(co, k, p) {
    if (k === 'c') co.c = [p[0], p[1]];
    else { const r = dist(co.c, p); if (r > 1e-9) co.r = r; }
    calloutSync(co);
  },
  xf(co, fn) {
    const c0 = fn(co.c);
    /* a uniform scale takes the radius with it; anything else keeps it, because
       a callout circle that has become an ellipse is not a callout */
    const e = fn([co.c[0] + co.r, co.c[1]]);
    const r = dist(c0, e);
    co.c = c0;
    if (r > 1e-9) co.r = r;
    calloutSync(co);
  },
};
