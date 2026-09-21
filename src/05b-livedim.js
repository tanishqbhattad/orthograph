'use strict';
/* ============================================================
   ORTHOGRAPH — live dimensions
   ------------------------------------------------------------
   Pick a wall in Revit and the distances that PLACE it appear:
   the gap to the wall opposite, its own run, and for an opening
   the distance along the wall and the angle the leaf swings
   through. Type over one and the thing moves. AutoCAD makes you
   draw a dimension to find the number out and then erase it
   again.

   Nothing here is an entity. These are not added to the drawing,
   not plotted, not saved, and they are gone the moment the
   selection is. What they are is an EDITOR: every number can be
   typed into, and typing DRIVES the geometry rather than
   reporting on it.

   Two shapes of thing are published:

     linear  { p, q, push, value, set }  — p and q are the world
             points being measured; push is the direction the
             dimension line is lifted off them.
     angular { c, r, a0, a1, value, set }

   and one that carries no number at all — the dashed centreline
   through an opening, which is a guide and not a measurement.
   ============================================================ */

const LDIM_OFF = 30;      /* dimension line, screen px clear of what it measures */
const LDIM_EXT = 5;       /* witness line runs this far past the dimension line  */
const LDIM_TICK = 4;      /* the tick at each end                                */
const LDIM_MIN = 26;      /* under this on screen there is no room to show it    */
const LDIM_PAR = 0.02;    /* |cross| below this counts as parallel, about 1.1°   */

/** LIVEDIM. On by default: the numbers are the point of picking the wall. */
function liveDimOn() { return ST.liveDim !== false; }

/* The screen boxes the values were last drawn in. Immediate mode — the
   picture IS the hit target — so this is rebuilt on every paint and read by
   the pointer code. Stale entries cannot outlive a frame. */
let LDIM_BOXES = [];

/** every live dimension for the current selection, in world coordinates */
function liveDims() {
  if (!liveDimOn() || SEL.size !== 1) return [];
  const e = DOC.ents.get([...SEL][0]);
  if (!e || !fvis(e)) return [];
  if (typeof curSheet === 'function' && curSheet()) return [];  /* paper, not model */
  try {
    if (e.t === 'wall') return wallLiveDims(e);
    if (e.t === 'door' || e.t === 'window') return openingLiveDims(e);
  } catch (err) { return []; }
  return [];
}

/* ---------------- walls ---------------- */

/** do two walls face each other at all, or merely happen to be parallel? */
function wallsOverlapAlong(w, v, u) {
  const L = wallLen(w);
  const s = dot(sub(v.a, w.a), u), e = dot(sub(v.b, w.a), u);
  return Math.min(s, e) < L && Math.max(s, e) > 0;
}

/** The nearest wall face looking at this one from `side` (+1 along the normal,
    -1 against it), as a distance along the normal from the wall's centreline. */
function nearestParallelWall(w, side) {
  const u = wallU(w), n = perp(u), off = wallOffsets(w);
  const mine = side > 0 ? off[0] : off[1];
  let best = null;
  for (const v of allWalls()) {
    if (v === w || (v.lvl || 0) !== (w.lvl || 0) || !fvis(v)) continue;
    const vu = wallU(v);
    if (Math.abs(cross(u, vu)) > LDIM_PAR) continue;
    if (!wallsOverlapAlong(w, v, u)) continue;
    const d = dot(sub(v.a, w.a), n);
    const vo = wallOffsets(v);
    /* v's own normal may point the other way, which would put its faces on
       the wrong side of it */
    const k = dot(perp(vu), n) >= 0 ? 1 : -1;
    const f0 = d + k * vo[0], f1 = d + k * vo[1];
    const face = side > 0 ? Math.min(f0, f1) : Math.max(f0, f1);
    if (side > 0 ? !(face > mine + 1) : !(face < mine - 1)) continue;
    const gap = Math.abs(face - mine);
    if (!best || gap < best.gap) best = { v, face, gap };
  }
  return best;
}

function wallLiveDims(w) {
  const L = wallLen(w);
  if (!(L > EPS)) return [];
  const u = wallU(w), n = perp(u), off = wallOffsets(w);
  const out = [];
  for (const side of [1, -1]) {
    const near = nearestParallelWall(w, side);
    if (!near) continue;
    const mine = side > 0 ? off[0] : off[1];
    /* taken at the far end and lifted past it, which is where there is room:
       across the middle it would be drawn over both walls */
    const at = add(w.a, mul(u, L));
    out.push({
      k: 'gap',
      p: add(at, mul(n, mine)), q: add(at, mul(n, near.face)),
      push: u, value: near.gap,
      /* Revit moves what you PICKED. The number is about the selected wall,
         so the selected wall is what answers for it. */
      set(v) {
        if (!(v >= 0) || !isFinite(v)) return false;
        const d = (v - near.gap) * (side > 0 ? -1 : 1);
        if (!d) return false;
        begin(); mut(w);
        w.a = add(w.a, mul(n, d)); w.b = add(w.b, mul(n, d));
        commit('Move wall');
        return true;
      },
    });
  }
  /* its own run — the number most often wanted, and the only one a wall with
     nothing parallel to it would otherwise show */
  out.push({
    k: 'len',
    p: add(w.a, mul(n, off[0])), q: add(w.b, mul(n, off[0])),
    push: n, value: L,
    set(v) {
      if (!(v > WALL_MIN_T) || !isFinite(v)) return false;
      begin(); mut(w);
      w.b = add(w.a, mul(u, v));
      wallReclampOpenings(w);
      commit('Wall length');
      return true;
    },
  });
  return out;
}

/* ---------------- doors and windows ---------------- */

function openingLiveDims(o) {
  const F = openFrame(o);
  if (!F) return [];
  const { w, u, n, c, oL, wd } = F;
  const L = wallLen(w);
  const out = [];

  /* Measured from the end it is nearer to, which is the end a person is
     thinking in terms of when they place a door "600 off the corner". */
  const fromB = o.pos > L / 2;
  const base = fromB ? w.b : w.a;
  const value = fromB ? L - o.pos : o.pos;
  out.push({
    k: 'pos',
    p: add(base, mul(n, oL)), q: add(c, mul(n, oL)),
    push: n, value,
    set(v) {
      if (!isFinite(v)) return false;
      const want = fromB ? L - v : v;
      const lo = wd / 2, hi = Math.max(lo, L - wd / 2);
      begin(); mut(o);
      o.pos = clamp(want, lo, hi);
      commit('Move opening');
      return true;
    },
  });

  /* The centreline, which is a guide and carries no number. It runs well
     clear of the wall on both sides or it is just a tick inside the opening
     and says nothing about what it lines up with. */
  const clr = wallT(w) / 2 + wd * 0.8;
  out.push({ k: 'cl', p: add(c, mul(n, clr)), q: add(c, mul(n, -clr)) });

  /* the swing, for the kinds of door that have one */
  if (o.t === 'door') {
    const sw = (doorShapes(o) || []).find(s => s.role === 'swing');
    if (sw && sw.r > EPS) {
      out.push({
        k: 'angle', c: sw.c, r: sw.r, a0: sw.a0, a1: sw.a1,
        value: o.swing != null ? o.swing : 90,
        set(v) {
          if (!isFinite(v)) return false;
          begin(); mut(o);
          o.swing = clamp(v, 5, 180);
          commit('Door swing');
          return true;
        },
      });
    }
  }
  return out;
}

/* ---------------- drawing ----------------
   All of it in screen space. A dimension that scaled with the drawing would
   be unreadable at one zoom and cover the building at another, which is the
   whole reason these are drawn rather than added as entities. */

/** the screen direction of a world vector, as a unit vector */
function ldimDir(at, v) {
  const a = w2s(at), b = w2s(add(at, v));
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const m = Math.hypot(dx, dy);
  return m > 1e-9 ? [dx / m, dy / m] : [1, 0];
}

function ldimText(d) {
  return d.k === 'angle' ? (Math.round(d.value * 100) / 100).toFixed(2) + '°' : fmt(d.value);
}

/** the value, in a box that can be clicked. Records where it landed. */
function ldimLabel(d, x, y) {
  const t = ldimText(d);
  ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const tw = Math.ceil(ctx.measureText(t).width);
  const bw = tw + 10, bh = 15;
  const bx = Math.round(x - bw / 2), by = Math.round(y - bh / 2);
  ctx.fillStyle = CO.bg; ctx.globalAlpha = 0.92;
  ctx.fillRect(bx, by, bw, bh);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = CO.grip; ctx.lineWidth = 1; ctx.setLineDash(DASH_SOLID);
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  ctx.fillStyle = CO.grip;
  ctx.fillText(t, bx + 5, by + bh - 4);
  if (d.set) LDIM_BOXES.push({ x: bx, y: by, w: bw, h: bh, dim: d });
}

function ldimLinear(d) {
  const sp = w2s(d.p), sq = w2s(d.q);
  if (!isFinite(sp[0]) || !isFinite(sq[0])) return;
  const span = Math.hypot(sq[0] - sp[0], sq[1] - sp[1]);
  if (span < LDIM_MIN) return;                  /* no room: the number would lie on itself */
  const pu = ldimDir(d.p, d.push);
  const o = LDIM_OFF;
  const dp = [sp[0] + pu[0] * o, sp[1] + pu[1] * o];
  const dq = [sq[0] + pu[0] * o, sq[1] + pu[1] * o];
  ctx.strokeStyle = CO.grip; ctx.lineWidth = HAIR; ctx.setLineDash(DASH_SOLID);
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  /* witness lines, starting clear of the geometry so they do not blot it */
  ctx.moveTo(sp[0] + pu[0] * 3, sp[1] + pu[1] * 3);
  ctx.lineTo(dp[0] + pu[0] * LDIM_EXT, dp[1] + pu[1] * LDIM_EXT);
  ctx.moveTo(sq[0] + pu[0] * 3, sq[1] + pu[1] * 3);
  ctx.lineTo(dq[0] + pu[0] * LDIM_EXT, dq[1] + pu[1] * LDIM_EXT);
  ctx.moveTo(dp[0], dp[1]); ctx.lineTo(dq[0], dq[1]);
  /* ticks rather than arrowheads: at this size an arrow is a blob */
  const ax = (dq[0] - dp[0]) / span, ay = (dq[1] - dp[1]) / span;
  for (const e of [dp, dq]) {
    ctx.moveTo(e[0] - ay * LDIM_TICK, e[1] + ax * LDIM_TICK);
    ctx.lineTo(e[0] + ay * LDIM_TICK, e[1] - ax * LDIM_TICK);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ldimLabel(d, (dp[0] + dq[0]) / 2, (dp[1] + dq[1]) / 2);
}

function ldimGuide(d) {
  const sp = w2s(d.p), sq = w2s(d.q);
  if (!isFinite(sp[0]) || !isFinite(sq[0])) return;
  ctx.strokeStyle = CO.grip; ctx.lineWidth = HAIR;
  ctx.globalAlpha = 0.5; ctx.setLineDash([7, 4, 1.5, 4]);
  ctx.beginPath(); ctx.moveTo(sp[0], sp[1]); ctx.lineTo(sq[0], sq[1]); ctx.stroke();
  ctx.setLineDash(DASH_SOLID); ctx.globalAlpha = 1;
}

function ldimAngular(d) {
  const sc = w2s(d.c);
  if (!isFinite(sc[0])) return;
  const rpx = Math.hypot(w2s(add(d.c, [d.r, 0]))[0] - sc[0], w2s(add(d.c, [d.r, 0]))[1] - sc[1]);
  if (rpx < LDIM_MIN) return;
  /* the arc is already on screen as the swing; this sits just outside it so
     the two do not draw over each other */
  const R = rpx + 9;
  /* canvas y runs down, so a CCW world arc is CW here */
  const s0 = -d.a0 - (V.rot || 0), s1 = -d.a1 - (V.rot || 0);
  ctx.strokeStyle = CO.grip; ctx.lineWidth = HAIR; ctx.setLineDash(DASH_SOLID);
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(sc[0], sc[1], R, Math.min(s0, s1), Math.max(s0, s1));
  ctx.stroke();
  ctx.globalAlpha = 1;
  const mid = (s0 + s1) / 2;
  ldimLabel(d, sc[0] + Math.cos(mid) * (R + 13), sc[1] + Math.sin(mid) * (R + 13));
}

function drawLiveDims() {
  LDIM_BOXES = [];
  if (HALO) return;
  const ds = liveDims();
  if (!ds.length) return;
  ctx.save();
  for (const d of ds) {
    if (d.k === 'cl') ldimGuide(d);
    else if (d.k === 'angle') ldimAngular(d);
    else ldimLinear(d);
  }
  ctx.restore();
  ctx.setLineDash(DASH_SOLID); ctx.globalAlpha = 1;
}

/* ---------------- typing into one ---------------- */

/** the value box under a canvas-local point, if there is one */
function liveDimAt(sx, sy) {
  for (const b of LDIM_BOXES)
    if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) return b;
  return null;
}

let LDIM_EDIT = null;
function liveDimEditKill() {
  if (LDIM_EDIT) { LDIM_EDIT.remove(); LDIM_EDIT = null; }
}
/** Put an input over the value and let it be typed into. Enter applies and
    Escape abandons, which is what every other field in the program does. */
function liveDimEdit(box) {
  liveDimEditKill();
  const hud = $('#hud'); if (!hud) return false;
  const i = el('input', 'ldimf');
  i.value = box.dim.k === 'angle' ? String(box.dim.value) : fmt(box.dim.value);
  i.style.left = (box.x - 3) + 'px';
  i.style.top = (box.y - 2) + 'px';
  i.style.width = Math.max(box.w + 22, 62) + 'px';
  const done = (apply) => {
    const txt = i.value;
    liveDimEditKill();
    if (apply) {
      const v = box.dim.k === 'angle' ? parseFloat(txt) : parseLen(txt);
      if (isFinite(v) && box.dim.set(v)) { syncUI(); }
    }
    draw();
  };
  i.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); done(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); done(false); }
  });
  /* Closing on blur is right — clicking away abandons the edit — but not
     before the click that opened it has finished being a click. */
  let armed = false;
  i.addEventListener('blur', () => { if (armed) done(false); });
  setTimeout(() => { armed = true; }, 120);
  hud.appendChild(i);
  LDIM_EDIT = i;
  i.focus(); i.select();
  return true;
}
