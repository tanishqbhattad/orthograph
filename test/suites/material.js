'use strict';
/* ============================================================
   9.3 — materials, and what a drawing can work out from them

   A wall type already said what its layers are made of —
   'brick', 'insulation', 'block' — and nothing anywhere knew
   what those words meant. They picked a hatch pattern and
   stopped.

   Give each one the two numbers every material has, density and
   thermal conductivity, and the drawing can answer two
   questions it could not ask before: what does this weigh, and
   what is its U-value. Both fall straight out of layers the
   wall type already carries, which is the point — nothing new
   has to be drawn or typed.

   The numbers here are the standard published ones for these
   materials. A drawing office replaces them with the ones from
   its own specification, which is why they are a table and not
   a formula.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
  const wallOf = (wt, len) => { begin();
    const w = addEnt({t:'wall', a:[0,0], b:[len || 6000,0], wt, layer:'A-WALL'});
    commit('w'); return w; };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('the table');

  t('every material a wall type mentions is a material that exists', () => {
    const r = R(`${SETUP}
      const missing = [];
      for (const wt of DOC.wallTypes)
        for (const L of (wt.layers || []))
          if (L.fill && !material(L.fill)) missing.push(wt.id + ': ' + L.fill);
      return { missing, n: materials().length };`);
    eq(r.missing.length, 0, 'nothing is named that is not defined: ' + r.missing.join(', '));
    ok(r.n >= 8, 'and there is a real library of them: ' + r.n);
  });

  t('each one carries the two numbers that make it a material', () => {
    const r = R(`${SETUP}
      const bad = [];
      for (const n of materials()) {
        const m = material(n);
        if (!(m.rho >= 0)) bad.push(n + ': density');
        if (!(m.k >= 0)) bad.push(n + ': conductivity');
        if (!m.name) bad.push(n + ': name');
      }
      return { bad, brick: material('brick'), air: material('cavity') };`);
    eq(r.bad.length, 0, 'all sound: ' + r.bad.join(' | '));
    ok(r.brick.rho > 1000 && r.brick.rho < 2500, 'brickwork has a real density: ' + r.brick.rho);
    ok(r.brick.k > 0.3 && r.brick.k < 1.5, 'and a real conductivity: ' + r.brick.k);
  });

  t('the hatch pattern for a material comes from the same table as everything else', () => {
    const r = R(`${SETUP}
      return { brick: materialPattern('brick'), insul: materialPattern('insulation'),
               fromTable: material('brick').pattern, cavity: materialPattern('cavity') };`);
    eq(r.brick, r.fromTable, 'one table, not two');
    ok(r.brick !== r.insul, 'and they are still told apart');
    eq(r.cavity, null, 'a cavity is drawn as nothing, because it is nothing');
  });

  group('what a wall weighs');

  t('a wall has a mass, worked out from its layers and its storey height', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300', 6000);
      const m = wallMass(w);
      /* 6m x 3m of 102.5 brick at 1750, 85 insulation at 30, 100 block at 1400,
         12.5 plaster at 1300 — roughly 5.9 tonnes */
      return { kg: Math.round(m), h: levelOf(w).h };`);
    eq(r.h, 3000, 'a storey high');
    ok(r.kg > 4000 && r.kg < 8000, 'about six tonnes of wall: ' + r.kg + ' kg');
  });

  t('a wall type with no layers still weighs something', () => {
    const r = R(`${SETUP}
      const w = wallOf('con200', 4000);
      return { kg: Math.round(wallMass(w)) };`);
    ok(r.kg > 0, 'concrete has a density whether or not the type lists layers: ' + r.kg);
  });

  t('the mass follows the numbers, not a constant somebody typed', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300', 6000);
      const a = wallMass(w);
      const m = material('brick');
      const was = m.rho; m.rho = was * 2;
      const b = wallMass(w);
      m.rho = was;
      return { a: Math.round(a), b: Math.round(b) };`);
    ok(r.b > r.a, 'doubling the density of the brick makes the wall heavier: ' +
      r.a + ' -> ' + r.b);
  });

  group('what a wall keeps the heat in with');

  /* A cavity wall with 85mm of insulation is about 0.3 W/m2K, which is what
     anyone who has filled in a building regulations form would expect. */
  t('a compound wall has a U-value, and it is a believable one', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300');
      return { u: +wallUValue(w).toFixed(3) };`);
    ok(r.u > 0.15 && r.u < 0.6,
      'a filled cavity wall is around a third of a watt: ' + r.u);
  });

  t('more insulation is a lower U-value, and no insulation is a much higher one', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300');
      const before = wallUValue(w);
      const wt = wallType('cav300');
      const ins = wt.layers.find(L => L.fill === 'insulation');
      const was = ins.fill; ins.fill = 'cavity';
      const after = wallUValue(w);
      ins.fill = was;
      const solid = wallUValue(wallOf('brk230'));
      return { before: +before.toFixed(3), after: +after.toFixed(3),
               solid: +solid.toFixed(2) };`);
    ok(r.after > r.before * 2,
      'taking the insulation out at least doubles it: ' + r.before + ' -> ' + r.after);
    ok(r.solid > 1.5, 'and a solid brick wall is a bad wall: ' + r.solid);
  });

  t('a wall nobody has given a material is not given a made-up U-value', () => {
    const r = R(`${SETUP}
      const wt = wallType('gen100');
      const w = wallOf('gen100');
      return { u: wallUValue(w), t: wt.t };`);
    ok(r.u == null || r.u > 0,
      'either it says it cannot say, or it says something real: ' + r.u);
  });

  group('classification');

  t('anything can carry a classification code, and it is saved', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300');
      begin(); mut(w); w.code = 'Ss_25_10_30'; commit('c');
      loadNative(saveNative());
      const back = [...DOC.ents.values()].find(e => e.t === 'wall');
      return { code: back && back.code };`);
    eq(r.code, 'Ss_25_10_30', 'the code the office uses, whatever standard it is from');
  });

  t('a schedule can report material, code and mass', () => {
    const r = R(`${SETUP}
      wallOf('cav300', 6000);
      wallOf('cav300', 4000);
      const rows = schedRows({ of: 'wall', cols: ['wallType', 'material', 'mass'],
                               group: true, total: true });
      const head = rows[0].join(' | ');
      const total = rows[rows.length - 1];
      return { head, total, n: rows.length };`);
    ok(/material/i.test(r.head), 'material is a column: ' + r.head);
    ok(/mass|kg/i.test(r.head), 'and mass: ' + r.head);
    ok(/[0-9]/.test(r.total.join('')), 'the total is a number: ' + r.total.join(' | '));
  });

  t('MATERIAL lists what is defined and puts one on the selection', () => {
    const r = R(`${SETUP}
      const w = wallOf('con200');
      SEL.clear(); SEL.add(w.id);
      cancelCmd(); startCmd('material'); cmdText('steel');
      return { mat: w.mat, mass: Math.round(wallMass(w)) };`);
    eq(r.mat, 'steel', 'the material is on the object');
    ok(r.mass > 10000, 'and a steel wall weighs what steel weighs: ' + r.mass);
  });
  group('one height, not two');

  /* The properties panel writes a wall's height to `h`. wallHeight() read
     `hgt`. So a wall given a height in the panel was still a storey tall
     everywhere it mattered: the section, the elevation area, the mass. */
  t('a wall height set in the panel is the height everything else uses', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300', 6000);
      const storey = wallHeight(w);
      const kg0 = wallMass(w);
      begin(); mut(w); w.h = 6000; commit('h');
      return { storey, tall: wallHeight(w), kg0: Math.round(kg0),
               kg1: Math.round(wallMass(w)) };`);
    eq(r.storey, 3000, 'a storey to begin with');
    eq(r.tall, 6000, 'and what the panel set once it is set');
    ok(r.kg1 > r.kg0 * 1.9, 'twice as tall is twice the wall: ' + r.kg0 + ' -> ' + r.kg1);
  });

  t('the panel says what the wall is and what it does', () => {
    const r = R(`${SETUP}
      const w = wallOf('cav300', 6000);
      SEL.clear(); SEL.add(w.id);
      buildProps();
      const rows = (document.getElementById('props').children || [])
        .map(x => (x.textContent || '') + ' ' +
          (x.children || []).map(k => k.textContent || '').join(' '));
      return { text: rows.join(' | ') };`);
    ok(/U.?value|W\/m/i.test(r.text), 'the U-value is on it: ' + r.text.slice(0, 240));
    ok(/mass|kg/i.test(r.text), 'and what it weighs');
  });
};
