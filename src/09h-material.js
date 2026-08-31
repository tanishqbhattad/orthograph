'use strict';
/* ============================================================
   ORTHOGRAPH — 09h materials

   A wall type already said what its layers are made of —
   'brick', 'insulation', 'block' — and nothing anywhere knew
   what those words meant. They picked a hatch pattern and
   stopped there.

   Give each one the two numbers every material has — density
   and thermal conductivity — and the drawing can answer two
   questions it could not ask before: what does this weigh, and
   what is its U-value. Both fall out of layers the wall type
   already carries, so nothing new has to be drawn or typed. A
   cavity wall on the screen becomes a line on a take-off and a
   number on a building regulations form.

   The values are the standard published ones for these
   materials, which is what makes them a table rather than a
   formula: a drawing office replaces them with the figures from
   its own specification, and everything downstream follows.
   ============================================================ */
const MATERIALS = {
  brick:      { name: 'Brickwork',    rho: 1750, k: 0.77,  fire: 'A1', pattern: 'AR-BRSTD' },
  block:      { name: 'Blockwork',    rho: 1400, k: 0.51,  fire: 'A1', pattern: 'AR-B816' },
  concrete:   { name: 'Concrete',     rho: 2400, k: 1.75,  fire: 'A1', pattern: 'AR-CONC' },
  structural: { name: 'Concrete',     rho: 2400, k: 1.75,  fire: 'A1', pattern: 'AR-CONC' },
  insulation: { name: 'Insulation',   rho:   30, k: 0.032, fire: 'E',  pattern: 'INSUL' },
  timber:     { name: 'Timber',       rho:  500, k: 0.13,  fire: 'D',  pattern: 'TIMBER' },
  steel:      { name: 'Steel',        rho: 7850, k: 50,    fire: 'A1', pattern: 'STEEL' },
  finish:     { name: 'Plaster',      rho: 1300, k: 0.57,  fire: 'A1', pattern: 'PLAST' },
  glass:      { name: 'Glass',        rho: 2500, k: 1.0,   fire: 'A1', pattern: null },
  earth:      { name: 'Earth',        rho: 1800, k: 1.5,   fire: '—',  pattern: 'EARTH' },
  /* A cavity is not a material and pretending otherwise is how a U-value
     comes out wrong: it weighs nothing, and it resists heat by convection
     rather than by conduction, so it carries a resistance directly. */
  cavity:     { name: 'Cavity',       rho:    0, k: 0,     fire: '—',  pattern: null, R: 0.18 },
};
function materials() { return Object.keys(MATERIALS); }
function material(n) {
  if (!n) return null;
  return MATERIALS[String(n).toLowerCase()] || null;
}
/** the pattern a material is drawn with — one table, not two */
function materialPattern(mat) {
  const m = material(mat);
  return (m && m.pattern) || null;
}
/** What an object is made of when nothing more specific is said: its own
    material, then the one its type implies. */
function matOf(e) {
  if (!e) return null;
  if (e.mat) return String(e.mat).toLowerCase();
  if (e.t === 'wall') {
    const wt = wallType(e.wt) || {};
    if (wt.layers && wt.layers.length) return null;   /* it is made of several */
    return wt.fn === 'structural' ? 'concrete'
         : /brick/i.test(wt.name || '') ? 'brick'
         : /block/i.test(wt.name || '') ? 'block'
         : /stud|partition/i.test(wt.name || '') ? 'timber'
         : /concrete|retaining/i.test(wt.name || '') ? 'concrete'
         : null;
  }
  return null;
}
/** the layers of a wall as {t, fill} in millimetres, whether the type lists
    them or is a single thickness of one thing */
function wallLayers(w) {
  const wt = wallType(w && w.wt) || {};
  if (wt.layers && wt.layers.length) return wt.layers.map(L => ({ t: L.t, fill: L.fill }));
  return [{ t: wallT(w), fill: matOf(w) }];
}
/** the storey a thing belongs to */
function levelOf(e) {
  const id = entLevel(e);
  return (DOC.levels || []).find(l => l.id === id) || (DOC.levels || [])[0] ||
         { id: 0, name: 'Level 0', elev: 0, h: 3000 };
}
/* how tall a wall is: wallHeight() in 09c already answers that, and one
   answer is the point */
/** Kilograms. Length x height x each layer's thickness x its density, which is
    the take-off a quantity surveyor does by hand. Openings are deducted: a
    wall that is half window does not weigh what a solid one weighs. */
function wallMass(w) {
  if (!w || w.t !== 'wall') return 0;
  const len = wallLen(w) / 1000;                     /* metres */
  let h = wallHeight(w) / 1000;
  if (!(len > 0) || !(h > 0)) return 0;
  let openM2 = 0;
  if (typeof openingsOn === 'function') {
    for (const o of (openingsOn(w) || []))
      openM2 += (openW(o) / 1000) * (openH(o) / 1000);
  }
  const face = Math.max(len * h - openM2, 0);
  let kg = 0;
  for (const L of wallLayers(w)) {
    const m = material(L.fill);
    if (!m || !(m.rho > 0) || !(L.t > 0)) continue;
    kg += face * (L.t / 1000) * m.rho;
  }
  return kg;
}
/* Surface resistances, W/m2K, the standard indoor and outdoor figures for a
   wall. They are why a U-value is not simply the reciprocal of the sum of the
   layers, and leaving them out is how a hand calculation comes out high. */
const R_SI = 0.13, R_SE = 0.04;
/** W/m2K, or null when nothing in the wall has a conductivity to work from.
    NOT wallU — that name was taken years ago by the wall's unit direction
    vector, and every module here shares one scope, so shadowing it handed the
    renderer a number where it expected a vector and every wall vanished. */
function wallUValue(w) {
  if (!w || w.t !== 'wall') return null;
  let R = R_SI + R_SE, known = false;
  for (const L of wallLayers(w)) {
    const m = material(L.fill);
    if (!m) continue;
    if (m.R > 0) { R += m.R; known = true; continue; }  /* a cavity, not a solid */
    if (!(m.k > 0) || !(L.t > 0)) continue;
    R += (L.t / 1000) / m.k;
    known = true;
  }
  if (!known || !(R > 0)) return null;
  return 1 / R;
}
/** the same in words, for a panel */
function wallUText(w) {
  const u = wallUValue(w);
  return u == null ? 'not known — no material set' : (+u.toFixed(2)) + ' W/m²K';
}

defc('material', {
  key: 'material', group: 'arch', needSel: true,
  hint: 'Material for the selection — ' ,
  init(c) {
    cliPrint('Materials: ' + materials().join(', ') + '.');
    if (!SEL.size) { cliPrint('Select something first.', 'err'); endCmd(true); return; }
    hint('Which material?');
  },
  text(c, s) {
    const k = String(s).trim().toLowerCase();
    if (!material(k)) {
      cliPrint('No material called "' + s + '". Try: ' + materials().join(', ') + '.', 'err');
      return true;
    }
    const es = selEnts();
    begin();
    for (const e of es) { mut(e); e.mat = k; }
    commit(es.length + ' set to ' + material(k).name);
    cliPrint(es.length + ' object' + (es.length === 1 ? '' : 's') + ' made of ' + material(k).name + '.');
    shapeCacheClear(); draw(); syncUI(); endCmd(true);
    return true;
  },
});
