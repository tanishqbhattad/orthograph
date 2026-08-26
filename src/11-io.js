/* ============================================================
   ORTHOGRAPH — 11 SVG, PNG and the native project file
   ============================================================ */
/* The entity layer of an SVG, in world millimetres with y already negated.
   Shared by the model-space export and by every viewport on a sheet, so a
   plotted sheet and an exported drawing can never drift apart.

   lwMul scales the stroke widths. Inside a viewport the whole group is scaled
   by the drawing scale, and a lineweight is a *plot* width — 0.35mm of ink on
   the paper whether the drawing is 1:50 or 1:500 — so the widths are divided
   by the scale here in order to survive being multiplied by it there. */
function svgEntityBody(lwMul) {
  const K = lwMul || 1;
  const out = [];
  const T2 = p => `${(+p[0].toFixed(4))},${(+(-p[1]).toFixed(4))}`;
  const dashMap = { dashed: '4,2.5', hidden: '2.5,1.8', center: '8,2,2,2', dashdot: '6,2,1,2' };
  const ink = c => (c.toLowerCase() === '#ffffff' || c.toLowerCase() === '#d7dee8' || c.toLowerCase() === '#e8e8e8') ? '#111111' : c;
  const strokeOf = (col, lw, lt) =>
    `stroke="${col}" stroke-width="${Math.max(lw, 0.13)}" fill="none" stroke-linecap="round" stroke-linejoin="round"` +
    (dashMap[lt] ? ` stroke-dasharray="${dashMap[lt]}"` : '');

  const emitShape = (s, col, lw, baseLt) => {
    const lt = s.lt || baseLt;
    const st = strokeOf(col, lw * (ROLE_W[s.role] || 1), lt);
    if (s.text != null) {
      out.push(`<text x="${s.p[0]}" y="${-s.p[1]}" font-family="Inter,Helvetica,sans-serif" font-size="${s.h}" fill="${col}" text-anchor="${s.anchor === 'c' ? 'middle' : s.anchor === 'r' ? 'end' : 'start'}" transform="rotate(${-deg(s.rot || 0)} ${s.p[0]} ${-s.p[1]})">${esc(s.text)}</text>`);
    } else if (s.pts) {
      if (s.pts.length < 2) return;
      out.push(`<path d="M${s.pts.map(T2).join('L')}${s.closed ? 'Z' : ''}" ${st}${s.role === 'arrowhead' ? ` fill="${col}"` : ''}/>`);
    } else if (s.r != null && s.a0 != null) {
      out.push(`<path d="M${arcPts(s, 64).map(T2).join('L')}" ${st}/>`);
    } else if (s.r != null) {
      out.push(`<circle cx="${s.c[0]}" cy="${-s.c[1]}" r="${s.r}" ${st}/>`);
    }
  };
  /* what goes on paper, which is not the same as what is on screen */
  const ordered = [...DOC.ents.values()].filter(plottable);
  ordered.sort((a, x) => ((a.t === 'hatch' || a.t === 'room') ? 0 : 1) - ((x.t === 'hatch' || x.t === 'room') ? 0 : 1));
  for (const e of ordered) {
    const col = ink(entColor(e));
    const lw = Math.max(entLw(e), 0.13) * K;
    const lt = entLt(e);
    if (e.t === 'hatch') {
      /* One path with a subpath per loop and an even-odd rule, so an island is
         SUBTRACTED. Drawing each loop as its own filled path paints the hole
         in again, which on a plan means hatching straight over the column the
         hole was there to protect. The canvas has always clipped evenodd; the
         export did not, so the screen and the paper disagreed. */
      const d = (e.loops || []).map(L => 'M' + L.map(T2).join('L') + 'Z').join(' ');
      if (d) out.push(`<path d="${d}" fill-rule="evenodd" fill="${e.solid ? col + '55' : 'none'}" stroke="${col}" stroke-width="${lw}"/>`);
      continue;
    }
    if (e.t === 'dim') {
      const g = dimGeom(e);
      for (const [a, bb] of g.lines) out.push(`<line x1="${a[0]}" y1="${-a[1]}" x2="${bb[0]}" y2="${-bb[1]}" ${strokeOf(col, lw, '')}/>`);
      for (const ar of g.arrows) out.push(`<path d="M${arrowPoly(ar.p, ar.a, g.S.arrow).map(T2).join('L')}Z" fill="${col}" stroke="none"/>`);
      out.push(`<text x="${g.tp[0]}" y="${-g.tp[1]}" font-family="Inter,sans-serif" font-size="${g.S.txt}" fill="${col}" text-anchor="middle" transform="rotate(${-deg(g.tr)} ${g.tp[0]} ${-g.tp[1]})">${esc(g.txt)}</text>`);
      continue;
    }
    if (e.t === 'text') { emitShape({ text: e.s, p: e.p, h: e.h, rot: e.rot, anchor: e.anchor }, col, lw, lt); continue; }
    if (e.t === 'point') {
      const r = DOC.textH * 0.4;
      out.push(`<path d="M${e.p[0] - r},${-e.p[1]}L${e.p[0] + r},${-e.p[1]}M${e.p[0]},${-e.p[1] - r}L${e.p[0]},${-e.p[1] + r}" ${strokeOf(col, lw, '')}/>`);
      continue;
    }
    for (const s of shapes(e, 96)) emitShape(s, col, lw, lt);
  }
  return out;
}
function exportSVG() {
  const b = bboxAll([...DOC.ents.values()].filter(visible)) || [0, 0, 100, 100];
  const pad = Math.max((b[2] - b[0]), (b[3] - b[1])) * .04 + 5;
  const x0 = b[0] - pad, y0 = b[1] - pad, w = b[2] - b[0] + pad * 2, h = b[3] - b[1] + pad * 2;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(+x0.toFixed(3))} ${(+(-(y0 + h)).toFixed(3))} ${(+w.toFixed(3))} ${(+h.toFixed(3))}" width="${Math.round(w)}" height="${Math.round(h)}">`,
    `<rect x="${x0}" y="${-(y0 + h)}" width="${w}" height="${h}" fill="#ffffff"/>`,
  ];
  out.push(...svgEntityBody(1));
  out.push('</svg>');
  return out.join('\n');
}

/* ---------------- plotting a sheet ----------------
   The output is an SVG whose width and height are declared in MILLIMETRES and
   whose viewBox is the paper in the same units. That pairing is what makes a
   plot true to scale: one user unit is one millimetre of paper, so a viewport
   scaled by 1/50 puts a 5000mm wall down as exactly 100mm of ink. Anything
   that reasons in pixels instead will be close and wrong, which on a drawing
   an architect issues is worse than being obviously broken. */
function sheetSVG(sh) {
  if (!sh) return '';
  const R4 = n => +(+n).toFixed(4);
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sh.w}mm" height="${sh.h}mm" ` +
      `viewBox="0 0 ${sh.w} ${sh.h}">`,
    `<rect x="0" y="0" width="${sh.w}" height="${sh.h}" fill="#ffffff"/>`,
  ];
  const vps = sh.viewports || [];
  if (vps.length) {
    out.push('<defs>');
    for (const vp of vps)
      out.push(`<clipPath id="vpc${vp.id}"><rect x="${R4(vp.x)}" y="${R4(vp.y)}" ` +
               `width="${R4(vp.w)}" height="${R4(vp.h)}"/></clipPath>`);
    out.push('</defs>');
  }
  for (const vp of vps) {
    const sc = vp.scale || 1;
    const cx = vp.x + vp.w / 2, cy = vp.y + vp.h / 2;
    /* body coordinates are (wx, -wy); this lands them on the paper. The order
       reads backwards: the rightmost transform applies first. */
    const xf = `translate(${R4(cx)} ${R4(cy)})` +
               (vp.rot ? ` rotate(${R4(-deg(vp.rot))})` : '') +
               ` scale(${R4(sc)}) translate(${R4(-vp.centre[0])} ${R4(vp.centre[1])})`;
    out.push(`<g clip-path="url(#vpc${vp.id})"><g transform="${xf}">`);
    /* the viewport border is deliberately not drawn: in AutoCAD it lives on a
       non-plotting layer, and a box printed round every view looks amateur */
    out.push(...svgEntityBody(1 / sc));
    out.push('</g></g>');
  }
  out.push(...titleBlockSVG(sh));
  out.push('</svg>');
  return out.join('\n');
}
/* The title block. Bottom-right, inside the margin, which is where every
   drawing office in the world looks for it. */
function titleBlockSVG(sh) {
  const T = sh.title;
  if (!T || T.show === false) return [];
  const m = sh.margin, w = T.w, h = T.h;
  const x = sh.w - m - w, y = sh.h - m - h;
  const ink = '#111111', hair = 0.18, rule = 0.35;
  const o = [`<g font-family="Inter,Helvetica,sans-serif" fill="${ink}">`,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${ink}" stroke-width="${rule}"/>`];
  /* the scale a sheet is drawn at is a property of its viewports, so it is
     reported rather than typed — a title block that can disagree with the
     drawing is a liability */
  const scales = [...new Set((sh.viewports || []).map(v => scaleLabel(v.scale)))];
  const rows = [
    ['PROJECT', T.project || ''],
    ['DRAWING', T.drawing || ''],
    ['SCALE', scales.length === 1 ? scales[0] : (scales.length ? 'As shown' : '—')],
    ['DATE', T.date || ''],
  ];
  const rh = h / (rows.length + 1);
  rows.forEach((r, i) => {
    const ry = y + i * rh;
    if (i) o.push(`<line x1="${x}" y1="${ry}" x2="${x + w}" y2="${ry}" stroke="${ink}" stroke-width="${hair}"/>`);
    o.push(`<text x="${x + 2.5}" y="${ry + rh * 0.42}" font-size="2.1" letter-spacing="0.35" fill="#555555">${esc(r[0])}</text>`);
    o.push(`<text x="${x + 2.5}" y="${ry + rh * 0.85}" font-size="3.4">${esc(r[1])}</text>`);
  });
  /* the sheet number gets its own cell, big, at the corner */
  const ny = y + rows.length * rh;
  o.push(`<line x1="${x}" y1="${ny}" x2="${x + w}" y2="${ny}" stroke="${ink}" stroke-width="${hair}"/>`);
  o.push(`<text x="${x + 2.5}" y="${ny + rh * 0.42}" font-size="2.1" letter-spacing="0.35" fill="#555555">SHEET</text>`);
  o.push(`<text x="${x + 2.5}" y="${ny + rh * 0.9}" font-size="5.2" font-weight="600">${esc(T.number || sh.name || '')}</text>`);
  if (T.rev) o.push(`<text x="${x + w - 2.5}" y="${ny + rh * 0.9}" font-size="4" text-anchor="end">${esc('Rev ' + T.rev)}</text>`);
  o.push('</g>');
  return o;
}
/** hand the sheet to the browser's print pipeline, which is how a page becomes
    a PDF without carrying a PDF writer around */
function plotSheet(sh) {
  const svg = sheetSVG(sh || curSheet());
  if (!svg) return null;
  const html = `<!doctype html><meta charset="utf-8"><title>${esc((sh || curSheet()).name)}</title>` +
    `<style>@page{size:${sh.w}mm ${sh.h}mm;margin:0}html,body{margin:0;padding:0}` +
    `svg{display:block}</style>${svg}`;
  if (typeof window !== 'undefined' && window.open) {
    const w = window.open('', '_blank');
    if (w && w.document) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
  }
  return html;
}

function exportPNG(maxPx) {
  const b = bboxAll([...DOC.ents.values()].filter(visible)) || [0, 0, 100, 100];
  const pad = Math.max(b[2] - b[0], b[3] - b[1]) * .05 + 4;
  const w = (b[2] - b[0] + pad * 2), h = (b[3] - b[1] + pad * 2);
  const k = clamp((maxPx || 2400) / Math.max(w, h), .001, 400);
  const c2 = document.createElement('canvas');
  c2.width = Math.round(w * k); c2.height = Math.round(h * k);
  const realCtx = ctx, old = Object.assign({}, V);
  const keep = {
    grid: ST.grid, cur: ST.cur, prev: ST.preview, snap: ST.snap, band: ST.band, hot: ST.hot,
    tracks: ST.tracks, sel: new Set(SEL),
  };
  V.z = k; V.px = -(b[0] - pad) * k; V.py = (b[3] + pad) * k;
  V.w = c2.width; V.h = c2.height; V.dpr = 1;
  ST.grid = false; ST.cur = null; ST.preview = null; ST.snap = null; ST.band = null; ST.hot = null; ST.tracks = null;
  SEL.clear();
  ctx = c2.getContext('2d');
  paint();
  ctx = realCtx;
  Object.assign(V, old);
  Object.assign(ST, { grid: keep.grid, cur: keep.cur, preview: keep.prev, snap: keep.snap, band: keep.band, hot: keep.hot, tracks: keep.tracks });
  keep.sel.forEach(i => SEL.add(i));
  draw();
  return c2;
}

/* ---------------- native project file ---------------- */
const FILE_VERSION = 2;
/* An automatic room stores a seed, not a polygon — roomBoundary() derives the
   shape on demand and caches it outside the entity, so r.pts on a live auto
   room may be stale or absent. Materialise it here, on a copy, so the file
   carries a usable outline for anything that reads it without this app's
   tracer. Copying rather than writing through is the point: the document must
   not change because it was saved. */
function roomForSave(e) {
  if (e.t !== 'room' || !e.auto || !e.seed) return e;
  const pts = roomBoundary(e);
  if (!pts || pts === e.pts) return e;
  return Object.assign({}, e, { pts: pts.map(p => p.slice()) });
}
/** Bring every associative dimension's stored coordinates up to date with the
    geometry it is attached to. Those coordinates are only ever a fallback —
    what is drawn is resolved live — but they are what a file carries, and what
    is left if the host is later deleted. Refreshing them here rather than
    during a redraw keeps the write outside the hot path and, more importantly,
    out of the journal, where an unjournalled mutation has cost this program
    data before. */
function syncDimCache() {
  for (const e of DOC.ents.values()) {
    if (e.t !== 'dim' || (!e.r1 && !e.r2)) continue;
    const P1 = dimEnd(e, 1), P2 = dimEnd(e, 2);
    if (P1 && P1 !== e.p1) e.p1 = P1.slice();
    if (P2 && P2 !== e.p2) e.p2 = P2.slice();
  }
}
function saveNative() {
  syncDimCache();
  return JSON.stringify({
    app: 'orthograph', v: FILE_VERSION, units: DOC.units, textH: DOC.textH,
    gridStep: DOC.gridStep, snapStep: DOC.snapStep, dimStyle: DOC.dimStyle || null,
    layers: DOC.layers, cur: DOC.cur, blocks: DOC.blocks || {},
    wallTypes: DOC.wallTypes, doorTypes: DOC.doorTypes, winTypes: DOC.winTypes,
    levels: DOC.levels, curLevel: DOC.curLevel,
    sheets: DOC.sheets || [], curSheet: DOC.curSheet,
    layerStates: DOC.layerStates || [],
    dimStyles: dimStyles(), curDim: DOC.curDim || 'Standard',
    ents: [...DOC.ents.values()].map(roomForSave),
  });
}
/* A project file is untrusted input like any other. Only the properties panel
   guarded wall thickness, so a hand-edited or corrupted .ocad could put a
   negative th into the document, where it survives every later edit and makes
   faces cross over each other. Nothing here rejects a file — a drawing that
   opens with one bad number repaired is worth far more than a refusal — but a
   value that cannot mean anything is dropped so the type default takes over. */
function sanitiseEnt(e) {
  if (!e || typeof e !== 'object' || !e.t) return null;
  const num = (v, min) => (typeof v === 'number' && isFinite(v) && v > (min || 0));
  /* thickness, height and sill are all strictly positive when present at all;
     null and undefined are meaningful (fall back to the type) and are kept */
  for (const k of ['th', 'h', 'w']) if (e[k] != null && !num(e[k])) delete e[k];
  if (e.sill != null && !(typeof e.sill === 'number' && isFinite(e.sill))) delete e.sill;
  /* a point that is not finite poisons every bbox and index it reaches */
  /* typeof is not redundant: isFinite(null) is true, and JSON cannot carry
     Infinity, so a file written from a poisoned document arrives with nulls
     where the bad numbers were. */
  const okN = v => typeof v === 'number' && isFinite(v);
  const okPt = p => Array.isArray(p) && p.length >= 2 && okN(p[0]) && okN(p[1]);
  for (const k of ['a', 'b', 'c', 'p', 'seed']) if (e[k] != null && !okPt(e[k])) return null;
  if (Array.isArray(e.pts)) {
    e.pts = e.pts.filter(okPt);
    if (e.pts.length < 2 && (e.t === 'pline' || e.t === 'spline')) return null;
  }
  if (e.r != null && !num(e.r)) return null;
  return e;
}
function loadNative(txt) {
  const d = JSON.parse(txt);
  begin();
  DOC.layers = d.layers && d.layers.length ? d.layers : [newLayer('0')];
  DOC.cur = d.cur || '0';
  DOC.units = d.units || 'mm';
  DOC.textH = d.textH || 2.5;
  DOC.gridStep = d.gridStep || 100;
  DOC.snapStep = d.snapStep || 100;
  DOC.dimStyle = d.dimStyle || {};
  DOC.blocks = d.blocks || {};
  DOC.wallTypes = d.wallTypes || stdWallTypes();
  DOC.doorTypes = d.doorTypes || stdDoorTypes();
  DOC.winTypes = d.winTypes || stdWinTypes();
  DOC.levels = d.levels || stdLevels();
  DOC.curLevel = d.curLevel || 0;
  /* Sheets postdate version 2, so an older file simply has none — that is a
     document with no paper space, not a broken one. */
  DOC.layerStates = Array.isArray(d.layerStates) ? d.layerStates : [];
  DOC.dimStyles = Array.isArray(d.dimStyles) && d.dimStyles.length ? d.dimStyles : null;
  DOC.curDim = d.curDim || 'Standard';
  DOC.sheets = Array.isArray(d.sheets) ? d.sheets.filter(sh => sh && sh.w > 0 && sh.h > 0) : [];
  DOC.curSheet = DOC.sheets.some(sh => sh.id === d.curSheet) ? d.curSheet : null;
  SHEET_UID = Math.max(1, ...DOC.sheets.map(sh => (sh.id || 0) + 1),
    ...DOC.sheets.flatMap(sh => (sh.viewports || []).map(v => (v.id || 0) + 1)));
  DOC.ents.clear(); SEL.clear(); UID = 1;
  idxInvalidate();
  (d.ents || []).forEach(e => { const c = sanitiseEnt(e); if (c) addEnt(c); });
  for (const [n, c] of ARCH_LAYERS) if (!hasLayer(n) && [...DOC.ents.values()].some(e => e.layer === n)) ensureLayer(n, c);
  const u = $('#unit'); if (u) u.value = DOC.units;
  commit('Opened project');
  fit(); syncUI();
}

function download(name, text, mime) {
  const blob = text instanceof Blob ? text : new Blob([text], { type: mime || 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ============================================================
   Autosave and crash recovery
   ------------------------------------------------------------
   Until now this program had none: no autosave, no recovery,
   not even a warning on closing the tab. A browser CAD app that
   can produce an issuable drawing and then lose it to a stray
   Ctrl-W is not one anybody should trust with real work.

   The store is behind an indirection so it can be tested without
   a browser, and so a machine with storage disabled degrades to
   "autosave is off" rather than to an exception on every edit.
   ============================================================ */
const AUTOSAVE = {
  key: 'orthograph.autosave.v1',
  every: 20000,          /* ms between attempts; only writes when dirty      */
  on: true,
  last: 0,
  failed: false,
  timer: null,
  bytes: 0,
  limit: 4 * 1024 * 1024, /* stay under the usual 5MB localStorage ceiling   */
};
/** the backing store, swappable so tests need no browser */
let STORE = (typeof localStorage !== 'undefined') ? localStorage : null;
function setStore(s) { STORE = s; }

/** Unsaved work is simply "the journal has moved since the last save". The
    sequence number was already being kept for undo, so this costs nothing. */
function docDirty() { return HIST.seq !== (DOC.savedSeq | 0); }
function markSaved() { DOC.savedSeq = HIST.seq; autosaveClear(); }

function autosaveNow(reason) {
  if (!AUTOSAVE.on || !STORE) return false;
  if (!docDirty()) return false;
  let payload;
  try {
    payload = JSON.stringify({
      v: 1, at: Date.now(), seq: HIST.seq,
      name: DOC.name || '', reason: reason || 'timer',
      doc: saveNative(),
    });
  } catch (e) { return false; }
  /* A drawing too big for the store is a real situation, not an error to
     swallow: say so once and stop trying, rather than throwing on every edit
     or silently pretending the work is safe. */
  if (payload.length > AUTOSAVE.limit) {
    if (!AUTOSAVE.failed) {
      AUTOSAVE.failed = true;
      if (typeof cliPrint === 'function')
        cliPrint('This drawing is too large to autosave. Save it to a file.', 'err');
    }
    return false;
  }
  try {
    STORE.setItem(AUTOSAVE.key, payload);
    AUTOSAVE.last = Date.now();
    AUTOSAVE.bytes = payload.length;
    AUTOSAVE.failed = false;
    return true;
  } catch (e) {
    if (!AUTOSAVE.failed) {
      AUTOSAVE.failed = true;
      if (typeof cliPrint === 'function')
        cliPrint('Autosave failed — browser storage is full or blocked. Save manually.', 'err');
    }
    return false;
  }
}
function autosaveClear() {
  if (!STORE) return;
  try { STORE.removeItem(AUTOSAVE.key); } catch (e) { /* nothing to do */ }
  AUTOSAVE.bytes = 0;
}
/** what is sitting in the store, or null. Never throws: a corrupt autosave
    must not stop the program from starting, which is the one moment it would
    do the most damage. */
function autosaveFound() {
  if (!STORE) return null;
  let raw;
  try { raw = STORE.getItem(AUTOSAVE.key); } catch (e) { return null; }
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o.doc !== 'string') return null;
    return o;
  } catch (e) {
    try { STORE.removeItem(AUTOSAVE.key); } catch (e2) { /* ignore */ }
    return null;
  }
}
/** how long ago, in words a person reads without doing arithmetic */
function agoText(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + (s === 1 ? ' second ago' : ' seconds ago');
  const m = Math.round(s / 60);
  if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
  const h = Math.round(m / 60);
  return h + (h === 1 ? ' hour ago' : ' hours ago');
}
/** restore an autosave. Returns true when the drawing actually came back. */
function autosaveRestore(rec) {
  const o = rec || autosaveFound();
  if (!o) return false;
  try {
    loadNative(o.doc);
    /* the restored drawing is unsaved by definition: it never reached a file */
    DOC.savedSeq = -1;
    if (typeof syncUI === 'function') syncUI();
    if (typeof draw === 'function') draw();
    return true;
  } catch (e) { return false; }
}
function autosaveStart() {
  if (AUTOSAVE.timer || typeof setInterval !== 'function') return;
  AUTOSAVE.timer = setInterval(() => autosaveNow('timer'), AUTOSAVE.every);
}
function autosaveStop() {
  if (AUTOSAVE.timer) { clearInterval(AUTOSAVE.timer); AUTOSAVE.timer = null; }
}
