'use strict';
/* ============================================================
   ORTHOGRAPH — 09i driving dimensions

   (It belongs beside dimGeom in 03, and cannot live there: the
   two commands at the foot of this file call defc() as the file
   loads, and CMDS does not exist until 07. Every module here
   shares one scope, so the functions are visible from anywhere
   regardless — only the load order matters.)

   Every dimension in this program reports: it measures what is
   there and prints it. A driving dimension is the other way
   round. Type 5000 into it and the wall becomes 5000 long. That
   is the difference between a drawing you measure and a drawing
   you specify, and it is the one thing a parametric modeller
   does that a drafting program does not.

   The machinery is a small solver, and the whole design is in
   two decisions.

   First, what can move. An associative dimension already knows
   which object and which point each of its ends is attached to,
   so those points — and only those — are the variables. Nothing
   else in the drawing can be disturbed by a solve, which is
   what makes this safe to use on a real drawing rather than a
   sketch.

   Second, which answer to pick. "Make this 5000" has infinitely
   many solutions: both ends could move, one could, they could
   rotate about each other. So every point is also pulled gently
   towards where it already is, and one point — the datum — is
   pulled hard. The result is the answer a person expects: the
   first end stays put and the drawing grows away from it. The
   gentle pull is also what keeps the system solvable when the
   dimensions do not fully determine the geometry, which on a
   real drawing they never do.
   ============================================================ */

const PARAM_TOL = 1e-3;          /* mm — how close counts as satisfied */
/* How firmly every point is held where it is. This weight has to be small
   against the dimension residuals, not merely smaller: the anchor pulls
   against the constraint, so the solution settles a little short of what was
   asked, by roughly the weight squared times the distance moved. At 1e-3 that
   was two microns on a metre — invisible, and larger than the tolerance the
   answer is checked against, so correct solves were being rejected as
   impossible. At 1e-5 the bias is a ten-millionth of a millimetre and the
   anchor still does its only job, which is choosing between answers. */
const PARAM_ANCHOR = 1e-5;
const PARAM_DATUM = 1e3;         /* and how firmly the datum is */
const PARAM_STEPS = 60;

/** the reference at one end of a dimension */
function dimRef(e, which) { return which === 1 ? e.r1 : e.r2; }
/** Which stored coordinates a reference actually depends on. A point in the
    middle of a wall depends on both ends of it; a point recorded as an offset
    in the wall's own frame does too. */
function refVars(ref) {
  if (!ref) return null;
  const h = DOC.ents.get(ref.id);
  if (!h) return null;
  const at = ref.at;
  const framed = !!(ref.du || ref.dv);
  if (at === 'mid' || framed) {
    if (!h.a || !h.b) return null;
    return [{ id: ref.id, at: 'a' }, { id: ref.id, at: 'b' }];
  }
  if (at === 'a' || at === 'b' || at === 'c' || at === 'p')
    return h[at] ? [{ id: ref.id, at }] : null;
  if (typeof at === 'number' && Array.isArray(h.pts) && h.pts[at])
    return [{ id: ref.id, at }];
  return null;
}
/** can this dimension drive anything? both ends have to be attached to
    geometry that still exists and that has a point the solver can move */
function dimCanDrive(e) {
  if (!e || e.t !== 'dim') return false;
  if (e.k === 'radius' || e.k === 'diameter' || e.k === 'angular' ||
      e.k === 'arclen' || e.k === 'ordinate') return false;
  return !!(refVars(dimRef(e, 1)) && refVars(dimRef(e, 2)));
}
/** what a dimension between these two points measures, by its own rule */
function dimMeasureAt(e, P1, P2) {
  if (!P1 || !P2) return NaN;
  if (e.k === 'horizontal') return Math.abs(P2[0] - P1[0]);
  if (e.k === 'vertical') return Math.abs(P2[1] - P1[1]);
  return dist(P1, P2);
}
/** every driving dimension in the document that can still drive */
function drivingDims() {
  const out = [];
  for (const e of DOC.ents.values())
    if (e.t === 'dim' && e.drive && dimCanDrive(e)) out.push(e);
  return out;
}
/** turn driving on or off. Turning it on records what it measures now, so a
    dimension starts by asking for exactly what is already there. */
function dimDrive(e, on) {
  if (!e || e.t !== 'dim') return false;
  if (on && !dimCanDrive(e)) {
    if (typeof whyFail === 'function')
      whyFail('That dimension is not attached to anything, so there is nothing for it to drive.');
    return false;
  }
  begin(); mut(e);
  if (on) { e.drive = true; e.drv = dimMeasureAt(e, dimEnd(e, 1), dimEnd(e, 2)); }
  else { delete e.drive; delete e.drv; }
  commit(on ? 'Dimension drives the drawing' : 'Dimension only reports');
  if (typeof draw === 'function') draw();
  return true;
}

/* ---------------- the solve ----------------
   Levenberg–Marquardt on a handful of variables. The Jacobian is worked out
   numerically: the residuals are cheap, there are rarely more than a few dozen
   variables, and a hand-derived Jacobian for every kind of dimension is a large
   surface for a subtle sign error to hide on. */
function paramSolve(dims, targets) {
  /* the variables, in a stable order so the datum is always the same one */
  const keys = [], seen = new Map();
  const want = (v) => {
    const k = v.id + '/' + v.at;
    if (seen.has(k)) return seen.get(k);
    const h = DOC.ents.get(v.id);
    const p = (typeof v.at === 'number') ? h.pts[v.at] : h[v.at];
    const i = keys.length;
    keys.push({ id: v.id, at: v.at, x0: p[0], y0: p[1] });
    seen.set(k, i);
    return i;
  };
  for (const d of dims)
    for (const w of [1, 2]) {
      const vs = refVars(dimRef(d, w));
      if (!vs) return { ok: false, why: 'A dimension has come away from what it was measuring.' };
      for (const v of vs) want(v);
    }
  if (!keys.length) return { ok: false, why: 'There is nothing for these dimensions to move.' };
  keys.sort((a, b) => (a.id - b.id) || String(a.at).localeCompare(String(b.at)));
  seen.clear();
  keys.forEach((k, i) => seen.set(k.id + '/' + k.at, i));

  const n = keys.length * 2;
  const X = new Float64Array(n);
  for (let i = 0; i < keys.length; i++) { X[i * 2] = keys[i].x0; X[i * 2 + 1] = keys[i].y0; }

  const at = (X, id, a) => {
    const i = seen.get(id + '/' + a);
    return i == null ? null : [X[i * 2], X[i * 2 + 1]];
  };
  /* where a reference sits, given a candidate set of variable values */
  const pointOf = (ref, X) => {
    const h = DOC.ents.get(ref.id);
    if (!h) return null;
    const A = at(X, ref.id, 'a') || h.a, B = at(X, ref.id, 'b') || h.b;
    let base;
    if (ref.at === 'mid') base = (A && B) ? mid(A, B) : null;
    else base = at(X, ref.id, ref.at) || refPointOf(h, ref.at, null);
    if (!base) return null;
    if ((ref.du || ref.dv) && A && B) {
      const L = dist(A, B);
      if (L < 1e-9) return base;
      const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L;
      return [base[0] + ux * (ref.du || 0) - uy * (ref.dv || 0),
              base[1] + uy * (ref.du || 0) + ux * (ref.dv || 0)];
    }
    return base;
  };
  const m = dims.length + n;
  const resid = (X, out) => {
    for (let i = 0; i < dims.length; i++) {
      const d = dims[i];
      const v = dimMeasureAt(d, pointOf(dimRef(d, 1), X), pointOf(dimRef(d, 2), X));
      out[i] = isFinite(v) ? v - targets[i] : 0;
    }
    /* the gentle pull towards where everything already is, and the hard one on
       the datum: between them they choose which of the infinitely many answers
       to a loose set of dimensions is the expected one */
    for (let i = 0; i < keys.length; i++) {
      const w = i === 0 ? PARAM_DATUM : PARAM_ANCHOR;
      out[dims.length + i * 2] = w * (X[i * 2] - keys[i].x0);
      out[dims.length + i * 2 + 1] = w * (X[i * 2 + 1] - keys[i].y0);
    }
  };

  const r = new Float64Array(m), r2 = new Float64Array(m), rt = new Float64Array(m);
  const J = [];
  for (let i = 0; i < m; i++) J.push(new Float64Array(n));
  const XT = new Float64Array(n);
  let lam = 1e-3;
  resid(X, r);
  let cost = 0; for (let i = 0; i < m; i++) cost += r[i] * r[i];

  for (let step = 0; step < PARAM_STEPS && cost > PARAM_TOL * PARAM_TOL * 1e-3; step++) {
    /* numeric Jacobian, central differences */
    for (let j = 0; j < n; j++) {
      const h = Math.max(1e-4, Math.abs(X[j]) * 1e-7);
      XT.set(X); XT[j] = X[j] + h; resid(XT, r2);
      XT[j] = X[j] - h; resid(XT, rt);
      for (let i = 0; i < m; i++) J[i][j] = (r2[i] - rt[i]) / (2 * h);
    }
    /* normal equations, built once per step and never edited in place: the
       elimination destroys whatever it is given, so every damping attempt gets
       a fresh copy. Damping the same matrix twice and eliminating it twice is
       how a retry loop ends up solving noise. */
    const N = [], g = new Float64Array(n);
    for (let a = 0; a < n; a++) {
      N.push(new Float64Array(n));
      for (let b = 0; b < n; b++) {
        let s = 0; for (let i = 0; i < m; i++) s += J[i][a] * J[i][b];
        N[a][b] = s;
      }
      let s = 0; for (let i = 0; i < m; i++) s += J[i][a] * r[i];
      g[a] = s;
    }
    let improved = false;
    for (let tryN = 0; tryN < 12 && !improved; tryN++) {
      const A = [];
      for (let a = 0; a < n; a++) {
        const row = new Float64Array(n + 1);
        row.set(N[a]);
        row[a] += lam * (1 + Math.abs(N[a][a]));
        row[n] = -g[a];
        A.push(row);
      }
      const dx = gaussSolve(A, n);
      if (!dx) { lam *= 10; continue; }
      for (let j = 0; j < n; j++) XT[j] = X[j] + dx[j];
      resid(XT, r2);
      let c2 = 0; for (let i = 0; i < m; i++) c2 += r2[i] * r2[i];
      if (c2 < cost) { X.set(XT); r.set(r2); cost = c2; lam = Math.max(lam * 0.3, 1e-9); improved = true; }
      else lam *= 10;
    }
    if (!improved) break;
  }

  /* did it actually satisfy what was asked, or merely get as close as it could? */
  let worst = 0;
  for (let i = 0; i < dims.length; i++) {
    const v = dimMeasureAt(dims[i], pointOf(dimRef(dims[i], 1), X), pointOf(dimRef(dims[i], 2), X));
    worst = Math.max(worst, Math.abs(v - targets[i]));
  }
  if (!(worst <= PARAM_TOL)) {
    return { ok: false, worst,
      why: 'Those dimensions cannot both be true at once — off by ' +
           fmt(worst, DOC.units, 3) + '.' };
  }
  return { ok: true, keys, X, worst };
}
/** Gaussian elimination with partial pivoting on an n x (n+1) augmented
    matrix. Returns null for a singular system, which the caller answers by
    damping harder rather than by guessing. */
function gaussSolve(A, n) {
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-14) return null;
    if (piv !== c) { const t = A[piv]; A[piv] = A[c]; A[c] = t; }
    const d = A[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / d;
      if (!f) continue;
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = A[r][n];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  for (let i = 0; i < n; i++) if (!isFinite(x[i])) return null;
  return x;
}

/** Ask a driving dimension for a different size. Every driving dimension in
    the drawing is solved together — the others are constraints that must still
    hold afterwards, or setting one size would quietly break the last one. */
function dimSetValue(e, value) {
  if (!e || e.t !== 'dim') return { ok: false, why: 'That is not a dimension.' };
  if (!(isFinite(value) && value > 0)) return { ok: false, why: 'A dimension has to be a positive length.' };
  if (!e.drive) return { ok: false, why: 'That dimension reports; it does not drive. Use DIMDRIVE first.' };
  const dims = drivingDims();
  if (dims.indexOf(e) < 0) return { ok: false, why: 'That dimension has come away from what it was measuring.' };
  const targets = dims.map(d => d === e ? value
    : (typeof d.drv === 'number' && isFinite(d.drv) ? d.drv
       : dimMeasureAt(d, dimEnd(d, 1), dimEnd(d, 2))));
  const res = paramSolve(dims, targets);
  if (!res.ok) {
    if (typeof whyFail === 'function') whyFail(res.why);
    return res;
  }
  /* Nothing has been touched until here, which is the point: a solve that
     cannot be satisfied leaves the drawing exactly as it was rather than
     part-moved. */
  begin();
  const walls = new Set();
  for (let i = 0; i < res.keys.length; i++) {
    const k = res.keys[i];
    const h = DOC.ents.get(k.id);
    if (!h) continue;
    const nx = res.X[i * 2], ny = res.X[i * 2 + 1];
    if (Math.abs(nx - k.x0) < 1e-12 && Math.abs(ny - k.y0) < 1e-12) continue;
    mut(h);
    if (typeof k.at === 'number') h.pts[k.at] = [nx, ny];
    else h[k.at] = [nx, ny];
    if (h.t === 'wall') walls.add(h);
  }
  /* an opening measured along a wall that has just got shorter has to come
     back inside it */
  if (typeof wallReclampOpenings === 'function')
    for (const w of walls) wallReclampOpenings(w);
  for (let i = 0; i < dims.length; i++) {
    const d = dims[i];
    mut(d);
    d.drv = targets[i];
    /* the stored fallback coordinates follow the geometry, so a dimension that
       later loses its host does not fall back to where things used to be */
    const P1 = dimEnd(d, 1), P2 = dimEnd(d, 2);
    if (P1) d.p1 = P1.slice();
    if (P2) d.p2 = P2.slice();
  }
  commit('Dimension ' + fmt(value));
  if (typeof shapeCacheClear === 'function') shapeCacheClear();
  if (typeof draw === 'function') draw();
  if (typeof syncUI === 'function') syncUI();
  return { ok: true };
}

/* ---------------- the commands ---------------- */
defc('dimdrive', {
  key: 'dimdrive', group: 'annotate', needSel: true,
  hint: 'Make the selected dimensions drive the drawing · <em>Enter</em> when done',
  init(c) {
    const ds = selEnts().filter(x => x.t === 'dim');
    if (!ds.length) { cliPrint('Select a dimension first.', 'err'); return endCmd(true); }
    let n = 0;
    for (const d of ds) if (dimDrive(d, !d.drive)) n++;
    cliPrint(n + ' dimension' + (n === 1 ? '' : 's') + ' changed. A driving dimension is marked fx.');
    syncUI(); draw(); endCmd(true);
  },
});
defc('dimvalue', {
  key: 'dimvalue', group: 'annotate', needSel: true,
  hint: 'New size for the selected dimension',
  init(c) {
    const ds = selEnts().filter(x => x.t === 'dim');
    if (!ds.length) { cliPrint('Select a dimension first.', 'err'); c.done = true; return endCmd(true); }
    c.data = { d: ds[0] };
    if (!ds[0].drive && !dimDrive(ds[0], true)) { c.done = true; return endCmd(true); }
    cliPrint('It is ' + fmt(dimMeasureAt(ds[0], dimEnd(ds[0], 1), dimEnd(ds[0], 2))) + ' now. What should it be?');
  },
  text(c, s) {
    const v = parseLen(s);
    if (!(isFinite(v) && v > 0)) { cliPrint('A length, please.', 'err'); return true; }
    const res = dimSetValue(c.data.d, v);
    if (res.ok) cliPrint('Set to ' + fmt(v) + '.');
    endCmd(true);
    return true;
  },
});
