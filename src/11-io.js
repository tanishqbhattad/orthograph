/* ============================================================
   ORTHOGRAPH — 11 SVG, PNG and the native project file
   ============================================================ */
function exportSVG() {
  const b = bboxAll([...DOC.ents.values()].filter(visible)) || [0, 0, 100, 100];
  const pad = Math.max((b[2] - b[0]), (b[3] - b[1])) * .04 + 5;
  const x0 = b[0] - pad, y0 = b[1] - pad, w = b[2] - b[0] + pad * 2, h = b[3] - b[1] + pad * 2;
  const T2 = p => `${(+p[0].toFixed(4))},${(+(-p[1]).toFixed(4))}`;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(+x0.toFixed(3))} ${(+(-(y0 + h)).toFixed(3))} ${(+w.toFixed(3))} ${(+h.toFixed(3))}" width="${Math.round(w)}" height="${Math.round(h)}">`,
    `<rect x="${x0}" y="${-(y0 + h)}" width="${w}" height="${h}" fill="#ffffff"/>`,
  ];
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
  const ordered = [...DOC.ents.values()].filter(visible);
  ordered.sort((a, x) => ((a.t === 'hatch' || a.t === 'room') ? 0 : 1) - ((x.t === 'hatch' || x.t === 'room') ? 0 : 1));
  for (const e of ordered) {
    const col = ink(entColor(e));
    const lw = Math.max(entLw(e), 0.13);
    const lt = entLt(e);
    if (e.t === 'hatch') {
      for (const L of (e.loops || [])) {
        out.push(`<path d="M${L.map(T2).join('L')}Z" fill="${e.solid ? col + '55' : 'none'}" stroke="${col}" stroke-width="${lw}"/>`);
      }
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
  out.push('</svg>');
  return out.join('\n');
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
function saveNative() {
  return JSON.stringify({
    app: 'orthograph', v: FILE_VERSION, units: DOC.units, textH: DOC.textH,
    gridStep: DOC.gridStep, snapStep: DOC.snapStep, dimStyle: DOC.dimStyle || null,
    layers: DOC.layers, cur: DOC.cur, blocks: DOC.blocks || {},
    wallTypes: DOC.wallTypes, doorTypes: DOC.doorTypes, winTypes: DOC.winTypes,
    levels: DOC.levels, curLevel: DOC.curLevel,
    ents: [...DOC.ents.values()],
  });
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
  DOC.ents.clear(); SEL.clear(); UID = 1;
  idxInvalidate();
  (d.ents || []).forEach(e => addEnt(e));
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
