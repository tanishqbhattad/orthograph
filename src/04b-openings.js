/* ============================================================
   ORTHOGRAPH — 04b architecture: doors and windows
   ============================================================ */
/* ---------------- openings: doors and windows ---------------- */
function hostOf(o) { const w = DOC.ents.get(o.host); return w && w.t === 'wall' ? w : null; }
/** frame of an opening: origin at the opening centre on the wall centreline */
function openFrame(o) {
  const w = hostOf(o); if (!w) return null;
  const u = wallU(w), n = perp(u);
  const c = add(w.a, mul(u, o.pos));
  const off = wallOffsets(w);
  return { w, u, n, c, t: wallT(w), oL: off[0], oR: off[1], wd: openW(o) };
}
function doorShapes(o) {
  const F = openFrame(o); if (!F) return [];
  const { u, n, c, oL, oR, wd } = F;
  const T = doorType(o.dt) || {};
  const kind = o.k || T.k || 'single';
  const hw = wd / 2;
  const side = o.flip ? -1 : 1;                    /* face the leaf swings toward */
  const hand = o.hand === -1 ? -1 : 1;             /* hinge at the start or end jamb */
  const sweep = o.swing != null ? rad(clamp(o.swing, 5, 180)) : Math.PI / 2;
  const au = Math.atan2(u[1], u[0]);
  const at = (d, off) => add(add(c, mul(u, d)), mul(n, off || 0));
  const out = [];
  /* reveals */
  out.push({ pts: [at(-hw, oL), at(-hw, oR)], role: 'jamb' });
  out.push({ pts: [at(hw, oL), at(hw, oR)], role: 'jamb' });
  if (kind === 'opening') return out;

  if (kind === 'slide' || kind === 'pocket') {
    const inset = (side > 0 ? oL : oR) * 0.5;
    out.push({ pts: [at(-hw * 0.98, inset), at(hw * 0.02, inset)], role: 'leaf' });
    const pocket = kind === 'pocket';
    out.push({ pts: [at(hw * 0.02, inset), at(hw * 0.98, inset)], role: 'leaf', lt: pocket ? 'dashed' : 'solid' });
    if (!pocket) out.push({ pts: [at(-hw, inset * 1.9), at(hw, inset * 1.9)], role: 'leaf', lt: 'dashed' });
    return out;
  }
  if (kind === 'double') {
    const leaf = hw;
    for (const s of [-1, 1]) {
      const hinge = at(s * hw, 0);
      const a0 = s < 0 ? au : au + Math.PI;        /* closed leaf points into the opening */
      const a1 = a0 + (s < 0 ? 1 : -1) * side * sweep;
      out.push({ pts: [hinge, polarPt(hinge, leaf, a1)], role: 'leaf' });
      out.push(arcRec(hinge, leaf, a0, a1));
    }
    return out;
  }
  if (kind === 'bifold') {
    const hingeD = hand > 0 ? -hw : hw;
    const p0 = at(hingeD, 0);
    const p2 = at(hingeD + hand * wd, 0);
    const midp = at(hingeD + hand * wd / 2, 0);
    const apex = add(midp, mul(n, side * Math.sqrt(Math.max(0, (wd / 2) ** 2 - (wd / 4) ** 2))));
    out.push({ pts: [p0, apex], role: 'leaf' });
    out.push({ pts: [apex, p2], role: 'leaf' });
    return out;
  }
  /* single swing */
  const hingeD = hand > 0 ? -hw : hw;
  const hinge = at(hingeD, 0);
  const a0 = hand > 0 ? au : au + Math.PI;
  const a1 = a0 + hand * side * sweep;
  out.push({ pts: [hinge, polarPt(hinge, wd, a1)], role: 'leaf' });
  out.push(arcRec(hinge, wd, a0, a1));
  return out;
}
const polarPt = (c, r, a) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
const rotv = (v, t) => [v[0] * Math.cos(t) - v[1] * Math.sin(t), v[0] * Math.sin(t) + v[1] * Math.cos(t)];
/* arcs are stored CCW from a0 to a1; swap when the swing runs clockwise */
function arcRec(c, r, a0, a1) {
  const ccw = wrapS(a1 - a0) >= 0;
  return { c, r, a0: ccw ? a0 : a1, a1: ccw ? a1 : a0, role: 'swing' };
}
function windowShapes(o) {
  const F = openFrame(o); if (!F) return [];
  const { u, n, c, oL, oR, wd } = F;
  const T = winType(o.wtp) || {};
  const kind = o.k || T.k || 'casement';
  const hw = wd / 2;
  const at = (d, off) => add(add(c, mul(u, d)), mul(n, off));
  const out = [];
  out.push({ pts: [at(-hw, oL), at(-hw, oR)], role: 'jamb' });
  out.push({ pts: [at(hw, oL), at(hw, oR)], role: 'jamb' });
  /* glazing: two lines set in from each face */
  const g = (oL - oR) * 0.22;
  out.push({ pts: [at(-hw, oL - g), at(hw, oL - g)], role: 'glaz' });
  out.push({ pts: [at(-hw, oR + g), at(hw, oR + g)], role: 'glaz' });
  if (kind === 'sliding') out.push({ pts: [at(0, oL - g), at(0, oR + g)], role: 'glaz' });
  if (kind === 'bay') {
    const proj = wd * 0.28;
    out.push({ pts: [at(-hw, oL), at(-hw * 0.5, oL + proj), at(hw * 0.5, oL + proj), at(hw, oL)], role: 'glaz' });
  }
  return out;
}
function openingBBoxPad(o) { return o.t === 'door' ? openW(o) * 1.1 : 0; }
const openingGeom = mk => ({
  shapes: mk,
  bbox(o) {
    const F = openFrame(o);
    if (!F) return [0, 0, 0, 0];
    const pad = openingBBoxPad(o) + F.t;
    return [F.c[0] - openW(o) / 2 - pad, F.c[1] - openW(o) / 2 - pad,
      F.c[0] + openW(o) / 2 + pad, F.c[1] + openW(o) / 2 + pad];
  },
  grips(o) {
    const F = openFrame(o); if (!F) return [];
    const hw = openW(o) / 2;
    const g = [{ p: F.c, k: 'c' },
      { p: add(F.c, mul(F.u, -hw)), k: 's' },
      { p: add(F.c, mul(F.u, hw)), k: 'e' }];
    /* Revit's two flip controls. Facing sits off the face the leaf opens to;
       hand sits just past the hinge jamb. Drag either across its axis to flip —
       the same gesture as clicking the arrows, but it needs no new event path. */
    const off = Math.max(F.t, 200) * 1.15;
    const side = o.flip ? -1 : 1;
    g.push({ p: add(F.c, mul(F.n, side * off)), k: 'facing' });
    if (o.t === 'door' && flipHandApplies(o)) {
      const hand = o.hand === -1 ? -1 : 1;
      g.push({ p: add(F.c, mul(F.u, hand * (hw + off * 0.55))), k: 'hand' });
    }
    return g;
  },
  grip(o, k, p) {
    const F = openFrame(o); if (!F) return;
    const w = F.w, L = wallLen(w);
    if (k === 'facing') { o.flip = dot(sub(p, F.c), F.n) < 0; return; }
    if (k === 'hand') { o.hand = dot(sub(p, F.c), F.u) < 0 ? -1 : 1; return; }
    const d = clamp(dot(sub(p, w.a), F.u), openW(o) / 2, Math.max(openW(o) / 2, L - openW(o) / 2));
    if (k === 'c') o.pos = d;
    else {
      const other = k === 's' ? o.pos + openW(o) / 2 : o.pos - openW(o) / 2;
      const nw = clamp(Math.abs(other - d), 100, L);
      o.w = nw; o.pos = clamp((other + d) / 2, nw / 2, Math.max(nw / 2, L - nw / 2));
    }
  },
  /** an opening is carried by its wall — a transform re-hosts it */
  xf(o, fn) {
    const F = openFrame(o); if (!F) return;
    const p2 = fn(F.c);
    const w = F.w;
    o.pos = clamp(dot(sub(p2, w.a), wallU(w)), 0, wallLen(w));
  },
});
GEOM.door = openingGeom(doorShapes);
GEOM.window = openingGeom(windowShapes);

function addOpening(kind, w, d, typeId) {
  const wd = kind === 'door' ? (doorType(typeId) || {}).w : (winType(typeId) || {}).w;
  const L = wallLen(w);
  const pos = clamp(d, (wd || 900) / 2, Math.max((wd || 900) / 2, L - (wd || 900) / 2));
  const e = kind === 'door'
    ? { t: 'door', host: w.id, pos, dt: typeId, flip: false, hand: 1, swing: 90, lvl: w.lvl || 0, layer: 'A-DOOR' }
    : { t: 'window', host: w.id, pos, wtp: typeId, lvl: w.lvl || 0, layer: 'A-GLAZ' };
  return addEnt(e);
}


/* ---------------- Revit-style flip controls ----------------
   facing = which side of the wall the leaf opens to (Revit's vertical arrows)
   hand   = which jamb carries the hinge          (Revit's horizontal arrows) */
function flipHandApplies(o) {
  const k = o.k || (doorType(o.dt) || {}).k || 'single';
  return k !== 'double' && k !== 'opening';        /* symmetrical leaves have no hand */
}
function flipFacing(o) { if (!o) return; mut(o); o.flip = !o.flip; }
function flipHand(o) {
  if (!o || o.t !== 'door' || !flipHandApplies(o)) return;
  mut(o); o.hand = o.hand === -1 ? 1 : -1;
}
/** both at once — the mirror of the opening about the wall centreline */
function flipBoth(o) { flipFacing(o); flipHand(o); }
