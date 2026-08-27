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
    if (e.t === 'leader') {
      const g = leaderGeom(e);
      if (g) {
        out.push(`<path d="M${g.spine.map(T2).join('L')}" fill="none" ${strokeOf(col, lw, '')}/>`);
        out.push(`<path d="M${g.head.map(T2).join('L')}Z" fill="${col}" stroke="none"/>`);
        if (g.text) emitShape({ text: g.text, p: g.tp, h: g.h, rot: 0, anchor: g.anchor }, col, lw, lt);
      }
      continue;
    }
    if (e.t === 'mtext') {
      for (const r of mtextLines(e))
        emitShape({ text: r.text, p: r.p, h: r.h, rot: r.rot, anchor: r.anchor }, col, lw, lt);
      continue;
    }
    if (e.t === 'point') {
      const r = DOC.textH * 0.4;
      out.push(`<path d="M${e.p[0] - r},${-e.p[1]}L${e.p[0] + r},${-e.p[1]}M${e.p[0]},${-e.p[1] - r}L${e.p[0]},${-e.p[1] + r}" ${strokeOf(col, lw, '')}/>`);
      continue;
    }
    for (const s of shapes(e, 96)) emitShape(s, ink(s.col || entColor(e)), lw, lt);
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
    textStyles: textStyles(), curTextStyle: DOC.curTextStyle || 'Standard',
    levelUid: DOC.levelUid || 0,
    ...docSettings(),
    ents: [...DOC.ents.values()].map(roomForSave),
  });
}
/* A project file is untrusted input like any other. Only the properties panel
   guarded wall thickness, so a hand-edited or corrupted .ocad could put a
   negative th into the document, where it survives every later edit and makes
   faces cross over each other. Nothing here rejects a file — a drawing that
   opens with one bad number repaired is worth far more than a refusal — but a
   value that cannot mean anything is dropped so the type default takes over. */
/** Types this build can draw. Anything else is carried but not understood. */
function knownType(t) {
  if (GEOM[t]) return true;
  return ['line', 'pline', 'spline', 'circle', 'arc', 'ellipse', 'point',
          'ray', 'xline', 'text', 'mtext', 'attdef', 'leader', 'dim',
          'cloud', 'donut'].indexOf(t) >= 0;
}
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
  /* Present-and-valid is not the same as present. The checks above pass an
     entity that simply has no geometry at all — {"t":"wall"} went straight
     through and then threw the first time anything measured it. */
  const NEEDS = {
    line: ['a', 'b'], wall: ['a', 'b'], stair: ['a', 'b'], section: ['a', 'b'],
    circle: ['c', 'r'], arc: ['c', 'r'], ellipse: ['c'],
    text: ['p'], mtext: ['p'], attdef: ['p'], point: ['p'], column: ['p'],
    insert: ['p'], table: ['p'], grid: ['a', 'b'],
    pline: ['pts'], spline: ['pts'], room: [], floor: ['pts'], roof: ['pts'],
    door: ['host'], window: ['host'], dim: ['p1', 'p2'], leader: ['pts'],
    hatch: ['loops'],
  };
  const need = NEEDS[e.t];
  if (need) for (const k of need) if (e[k] == null) return null;
  /* an insert of a block the file does not contain is a reference to nothing:
     it draws nothing, measures nothing, and cannot be repaired by hand */
  if (e.t === 'insert' && !((DOC.blocks || {})[e.name])) return null;
  /* a room is either traced from a seed or drawn as a polygon; one that is
     neither describes no space at all */
  if (e.t === 'room' && !okPt(e.seed) && !(Array.isArray(e.pts) && e.pts.length > 2)) return null;
  return e;
}
/* A snapshot of the whole document, deep enough to put back. Restoring is
   done by emptying and refilling what is there rather than by replacing DOC
   or DOC.ents, because plenty of code holds a reference to both. */
function docSnapshot() {
  const keys = {};
  for (const k of Object.keys(DOC)) { if (k !== 'ents') keys[k] = clone(DOC[k]); }
  const ents = [];
  for (const [id, e] of DOC.ents) ents.push([id, clone(e)]);
  return { keys, ents, uid: UID, sel: [...SEL] };
}
function docRestore(s) {
  if (JN && JN.on) { try { rollback(); } catch (e) { JN.on = false; } }
  for (const k of Object.keys(DOC)) if (k !== 'ents') delete DOC[k];
  for (const k of Object.keys(s.keys)) DOC[k] = s.keys[k];
  DOC.ents.clear();
  for (const [id, e] of s.ents) DOC.ents.set(id, e);
  UID = s.uid;
  SEL.clear(); for (const id of s.sel) SEL.add(id);
  idxInvalidate();
  if (typeof shapeCacheClear === 'function') shapeCacheClear();
}
/** Open a project file. Returns true when it opened, false when it did not.

    A file that is not a drawing must not take the drawing that IS open with
    it. This used to write straight into DOC as it parsed, so anything that
    threw partway left the document half-replaced — the work on screen gone
    AND the program unable to paint another frame, which is precisely the
    failure this project already refuses to accept from a corrupt autosave. */
function loadNative(txt) {
  let d = null;
  try { d = JSON.parse(txt); } catch (e) { return loadRefused('That file is not a drawing.'); }
  if (!d || typeof d !== 'object' || Array.isArray(d))
    return loadRefused('That file is not a drawing.');
  if ('ents' in d && d.ents !== undefined && !Array.isArray(d.ents))
    return loadRefused('That file is not a drawing.');
  if ('layers' in d && d.layers !== undefined && !Array.isArray(d.layers))
    return loadRefused('That file is not a drawing.');
  const undoAll = docSnapshot();
  try {
    loadNativeInto(d);
    return true;
  } catch (err) {
    docRestore(undoAll);
    if (typeof draw === 'function') draw();
    return loadRefused('That file could not be read. The drawing is unchanged.');
  }
}
function loadRefused(msg) {
  if (typeof cliPrint === 'function') cliPrint(msg, 'err');
  else if (typeof echo === 'function') echo(msg);
  return false;
}
function loadNativeInto(d) {
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
  DOC.textStyles = Array.isArray(d.textStyles) && d.textStyles.length ? d.textStyles : null;
  DOC.curTextStyle = d.curTextStyle || 'Standard';
  DOC.levelUid = d.levelUid || 0;
  applyDocSettings(d);
  DOC.sheets = Array.isArray(d.sheets) ? d.sheets.filter(sh => sh && sh.w > 0 && sh.h > 0) : [];
  DOC.curSheet = DOC.sheets.some(sh => sh.id === d.curSheet) ? d.curSheet : null;
  SHEET_UID = Math.max(1, ...DOC.sheets.map(sh => (sh.id || 0) + 1),
    ...DOC.sheets.flatMap(sh => (sh.viewports || []).map(v => (v.id || 0) + 1)));
  DOC.ents.clear(); SEL.clear(); UID = 1;
  idxInvalidate();
  const offered = Array.isArray(d.ents) ? d.ents.length : 0;
  let unknown = 0;
  (d.ents || []).forEach(e => {
    const c = sanitiseEnt(e);
    if (!c) return;
    if (!knownType(c.t)) unknown++;
    addEnt(c);
  });
  /* An object of a type this build does not know is most likely a file from a
     later one. Dropping it would lose it on the next save; keeping it quietly
     would show a drawing with content missing and no sign of it. So it is kept
     — it rides through a save intact — and said out loud. */
  if (unknown && typeof cliPrint === 'function')
    cliPrint(unknown + (unknown === 1 ? ' object is' : ' objects are') +
             ' of a type this version does not know. They are kept, but not drawn.', 'err');
  /* A file with no objects in it is an empty drawing and opens fine. A file
     that OFFERED objects and had none of them survive is a corrupt file, and
     opening it would replace the drawing on screen with nothing — which is
     the same loss as the crash, arrived at politely. */
  if (offered && DOC.ents.size === 0)
    throw new Error('nothing in that file could be read');
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

/* ---------------- the overflow store ----------------
   localStorage is kept as the primary store for one reason: it is
   synchronous, and the most valuable autosave anybody gets is the one written
   during beforeunload, where there is nothing to wait for.

   A drawing can outgrow it — about 25,000 objects — and used to be told so and
   left unsaved. IndexedDB has no practical cap, but it answers through events,
   so it can only be counted on for the timed writes. It therefore sits
   UNDERNEATH localStorage rather than replacing it, and what localStorage
   keeps in that case is a pointer of a few hundred bytes, which will always
   fit and can always be written on the way out.

   Callbacks rather than promises: that is IndexedDB's own shape, and the rest
   of this program has none. A callback is always called — with null or false
   on failure — because recovery that never hears back would hang the start of
   the program, which is the worst moment to hang. */
const BIGDB = { name: 'orthograph', store: 'autosave', ver: 1 };
function idbOpen(cb) {
  const F = (typeof indexedDB !== 'undefined') ? indexedDB : null;
  if (!F) return cb(null);
  let rq;
  try { rq = F.open(BIGDB.name, BIGDB.ver); } catch (e) { return cb(null); }
  rq.onupgradeneeded = () => {
    try {
      const db = rq.result;
      if (!db.objectStoreNames.contains(BIGDB.store)) db.createObjectStore(BIGDB.store);
    } catch (e) { /* the error path below reports it */ }
  };
  rq.onsuccess = () => cb(rq.result || null);
  rq.onerror = () => cb(null);
  rq.onblocked = () => cb(null);
}
/** One transaction, wrapped so that no failure of it can reach the caller.
    cb(ok, value): whether the transaction completed is reported SEPARATELY
    from what it read. A put returns no value, so a successful one and a failed
    one are indistinguishable by value alone — reading success out of the value
    made every successful write look like a refusal. */
function idbDo(mode, fn, cb) {
  idbOpen(db => {
    if (!db) return cb(false, null);
    let tx, st;
    try {
      tx = db.transaction(BIGDB.store, mode);
      st = tx.objectStore(BIGDB.store);
    } catch (e) { return cb(false, null); }
    let out = null, done = false;
    const finish = (ok) => { if (!done) { done = true; cb(ok, ok ? out : null); } };
    try { fn(st, v => { out = v; }); } catch (e) { return finish(false); }
    tx.oncomplete = () => finish(true);
    tx.onerror = () => finish(false);
    tx.onabort = () => finish(false);
  });
}
const IDB_STORE = {
  put(k, v, cb) { idbDo('readwrite', (st) => st.put(v, k), ok => cb && cb(ok)); },
  get(k, cb) { idbDo('readonly', (st, set) => { const rq = st.get(k); rq.onsuccess = () => set(rq.result == null ? null : String(rq.result)); }, (ok, v) => cb(ok ? v : null)); },
  del(k, cb) { idbDo('readwrite', (st) => st.delete(k), ok => cb && cb(ok)); },
};
let BIGSTORE = (typeof indexedDB !== 'undefined') ? IDB_STORE : null;
function setBigStore(s) { BIGSTORE = s; }

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
  /* Small enough for localStorage is the good case: synchronous, and therefore
     the only one that can be relied on during beforeunload. */
  if (payload.length <= AUTOSAVE.limit) {
    try {
      STORE.setItem(AUTOSAVE.key, payload);
      AUTOSAVE.last = Date.now();
      AUTOSAVE.bytes = payload.length;
      AUTOSAVE.failed = false;
      AUTOSAVE.big = false;
      /* An earlier session may have overflowed. Two copies and no way to tell
         which session either came from is worse than one. */
      if (BIGSTORE) { try { BIGSTORE.del(AUTOSAVE.key); } catch (e) { /* best effort */ } }
      return true;
    } catch (e) { /* out of room after all: fall through to the overflow tier */ }
  }
  return autosaveOverflow(payload);
}
/** Too big for localStorage, or localStorage refused it. Put the drawing in
    the overflow store and leave a pointer to it where recovery will look. */
function autosaveOverflow(payload) {
  if (!BIGSTORE) return autosaveGaveUp(
    'This drawing is too large to autosave. Save it to a file.');
  const FULL = 'Autosave failed - browser storage is full or blocked. Save manually.';
  /* Three states, not two. IndexedDB normally answers after this function has
     returned, and a write still in flight is not a write that failed — but a
     store that refuses immediately is a refusal we can report honestly now
     rather than claiming the work is safe. */
  let state = 'flight';
  try {
    BIGSTORE.put(AUTOSAVE.key, payload, r => {
      if (r !== false) { state = 'ok'; return; }
      state = 'failed';
      /* a pointer to a drawing that never landed: recovery ignores it, but the
         person still has to be told their work is not being kept */
      autosaveGaveUp(FULL);
      try { STORE.removeItem(AUTOSAVE.key); } catch (e) { /* nothing to do */ }
    });
  } catch (e) { return autosaveGaveUp(FULL); }
  if (state === 'failed') return false;
  let head;
  try {
    const o = JSON.parse(payload);
    head = JSON.stringify({ v: o.v, at: o.at, seq: o.seq, name: o.name,
                            reason: o.reason, big: true, size: payload.length });
  } catch (e) { return false; }
  try {
    STORE.setItem(AUTOSAVE.key, head);
  } catch (e) { return autosaveGaveUp(FULL); }
  AUTOSAVE.last = Date.now();
  AUTOSAVE.bytes = payload.length;
  AUTOSAVE.failed = false;
  AUTOSAVE.big = true;
  return true;
}
/** say it once, then stop saying it on every edit */
function autosaveGaveUp(msg) {
  if (!AUTOSAVE.failed) {
    AUTOSAVE.failed = true;
    if (typeof cliPrint === 'function') cliPrint(msg, 'err');
  }
  return false;
}
function autosaveClear() {
  if (BIGSTORE) { try { BIGSTORE.del(AUTOSAVE.key); } catch (e) { /* best effort */ } }
  AUTOSAVE.big = false;
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
    if (!o) return null;
    /* a pointer carries no drawing: autosaveFetch goes and gets it */
    if (o.big) return o;
    if (typeof o.doc !== 'string') return null;
    return o;
  } catch (e) {
    try { STORE.removeItem(AUTOSAVE.key); } catch (e2) { /* ignore */ }
    return null;
  }
}
/** The record with its drawing actually in it, whichever store that took.
    cb is always called, with null when there is nothing to recover — recovery
    that never hears back would hang the program at startup. */
function autosaveFetch(cb) {
  const rec = autosaveFound();
  if (!rec) return cb(null);
  if (!rec.big) return cb(rec);
  if (!BIGSTORE) return cb(null);
  let answered = false;
  const once = (v) => { if (answered) return; answered = true; cb(v); };
  try {
    BIGSTORE.get(AUTOSAVE.key, raw => {
      if (!raw) return once(null);
      try {
        const o = JSON.parse(raw);
        once(o && typeof o.doc === 'string' ? o : null);
      } catch (e) { once(null); }
    });
  } catch (e) { once(null); }
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
