'use strict';
/* ============================================================
   B7 — blocks: colour inside them, and attributes

   A block without attributes is a rubber stamp. With them it is
   a thing that carries information: one door block serving forty
   doors with forty numbers.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-DOOR'); DOC.layers.find(l => l.name === 'A-DOOR').color = '#ff0000';
  DOC.blocks = DOC.blocks || {};
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('a block keeps the colours of what is inside it');

  /* An insert flattened its contents into one shape list and drew the lot in
     the insert's colour, so a block could only ever be monochrome. */
  t('explicit, ByLayer and ByBlock are three different answers', () => {
    const r = R(`${SETUP}
      DOC.blocks.DOOR = { base: [0,0], ents: [
        { t:'line', a:[0,0], b:[1000,0], color:'#00ff00', layer:'0' },       /* explicit */
        { t:'line', a:[0,100], b:[1000,100], layer:'A-DOOR' },               /* ByLayer  */
        { t:'line', a:[0,200], b:[1000,200], color: BYBLOCK, layer:'0' },    /* ByBlock  */
      ] };
      begin();
      const ins = addEnt({ t:'insert', name:'DOOR', p:[0,0], rot:0, sx:1, sy:1,
                           color:'#0000ff', layer:'0' });
      commit('i');
      const sh = shapes(ins, 32);
      return { cols: sh.map(s => s.col || null), insertCol: entColor(ins) };`);
    eq(r.cols[0], '#00ff00', 'an explicit colour survives being inserted');
    eq(r.cols[1], '#ff0000', 'ByLayer takes the colour of its own layer');
    eq(r.cols[2], null, 'ByBlock carries none, so it inherits the insert');
    eq(r.insertCol, '#0000ff', 'and the insert is the colour it inherits');
  });

  t('the same definition inserted twice gives two ByBlock colours', () => {
    const r = R(`${SETUP}
      DOC.blocks.TAG = { base: [0,0], ents: [
        { t:'line', a:[0,0], b:[100,0], color: BYBLOCK, layer:'0' } ] };
      begin();
      const a = addEnt({ t:'insert', name:'TAG', p:[0,0], color:'#111111', layer:'0' });
      const b = addEnt({ t:'insert', name:'TAG', p:[500,0], color:'#222222', layer:'0' });
      commit('i');
      return { a: entColor(a), b: entColor(b),
               aShape: shapes(a, 32)[0].col || null, bShape: shapes(b, 32)[0].col || null };`);
    eq(r.aShape, null); eq(r.bShape, null, 'neither carries its own colour');
    eq(r.a, '#111111'); eq(r.b, '#222222',
      'so one definition draws in two colours, which is what ByBlock is for');
  });

  group('attributes');

  t('an attribute draws its value in the insert, its tag on its own', () => {
    const r = R(`${SETUP}
      DOC.blocks.DOORTAG = { base: [0,0], ents: [
        { t:'line', a:[0,0], b:[600,0], layer:'0' },
        { t:'attdef', p:[100,100], tag:'NUMBER', prompt:'Door number', val:'00',
          h:200, rot:0, anchor:'l', layer:'0' } ] };
      begin();
      const ins = addEnt({ t:'insert', name:'DOORTAG', p:[0,0], layer:'0' });
      commit('i');
      const before = shapes(ins, 32).filter(s => s.text != null).map(s => s.text);
      /* give this one a value */
      begin(); mut(ins); ins.att = { NUMBER: 'D-14' }; commit('att');
      const after = shapes(ins, 32).filter(s => s.text != null).map(s => s.text);
      /* a second insert keeps its own */
      begin();
      const two = addEnt({ t:'insert', name:'DOORTAG', p:[2000,0], layer:'0', att:{ NUMBER:'D-15' } });
      commit('i2');
      return { before, after,
               two: shapes(two, 32).filter(s => s.text != null).map(s => s.text),
               defs: blockAttdefs('DOORTAG').map(d => d.tag) };`);
    eq(r.defs.join(','), 'NUMBER', 'the definition declares the tag');
    eq(r.before.join(','), '00', 'with no value the default is drawn, not the tag');
    eq(r.after.join(','), 'D-14', 'and a value replaces it');
    eq(r.two.join(','), 'D-15', 'one definition, two inserts, two values');
  });

  t('a hidden attribute carries data without drawing', () => {
    const r = R(`${SETUP}
      DOC.blocks.ROOMTAG = { base: [0,0], ents: [
        { t:'attdef', p:[0,0], tag:'NAME', val:'ROOM', h:200, layer:'0' },
        { t:'attdef', p:[0,-300], tag:'COST', val:'0', h:200, hidden:true, layer:'0' } ] };
      begin();
      const ins = addEnt({ t:'insert', name:'ROOMTAG', p:[0,0], layer:'0',
                           att: { NAME:'KITCHEN', COST:'12500' } });
      commit('i');
      const drawn = shapes(ins, 32).filter(s => s.text != null).map(s => s.text);
      const defs = blockAttdefs('ROOMTAG');
      return { drawn, cost: attValue(ins, defs.find(d => d.tag === 'COST')) };`);
    eq(r.drawn.join(','), 'KITCHEN', 'only the visible one is drawn');
    eq(r.cost, '12500', 'but the hidden value is still there to be read');
  });

  t('EATTEDIT writes values onto the insert, not the definition', () => {
    const r = R(`${SETUP}
      DOC.blocks.T = { base: [0,0], ents: [
        { t:'attdef', p:[0,0], tag:'N', prompt:'Number', val:'x', h:200, layer:'0' } ] };
      begin();
      const a = addEnt({ t:'insert', name:'T', p:[0,0], layer:'0' });
      const b = addEnt({ t:'insert', name:'T', p:[3000,0], layer:'0' });
      commit('i');
      /* driven through the extracted function: the stub cannot materialise a
         modal's fields, and a block's data should not depend on one anyway */
      setAttValues(a, { N: 'A-1' });
      return { a: a.att && a.att.N, b: (b.att && b.att.N) || null,
               defUnchanged: DOC.blocks.T.ents[0].val };`);
    eq(r.a, 'A-1', 'the picked insert takes the value');
    eq(r.b, null, 'the other one is untouched');
    eq(r.defUnchanged, 'x', 'and the definition keeps its default');
  });

  t('an attdef on its own is a real object: drawn, boxed and pickable', () => {
    const r = R(`${SETUP}
      begin();
      const d = addEnt({ t:'attdef', p:[0,0], tag:'NUMBER', val:'', h:200,
                         rot:0, anchor:'l', layer:'0' });
      commit('d');
      const b = bbox(d).map(Math.round);
      const hit = pickAt([(b[0]+b[2])/2, (b[1]+b[3])/2], 5);
      begin(); xf(d, T.move([500, 500])); commit('mv');
      return { w: b[2]-b[0] > 0, h: b[3]-b[1] > 0,
               picked: !!hit && hit.id === d.id, moved: d.p.map(Math.round) };`);
    eq(r.w, true); eq(r.h, true, 'it has a box, so it can be selected and fitted');
    eq(r.picked, true, 'and clicking it picks it');
    eq(r.moved.join(','), '500,500', 'and it moves like anything else');
  });

  /* Attribute text was built from the DEFINITION's coordinates rather than
     from the transformed copy, so every insert drew its number on top of the
     first one. Three tags, one legible. Nothing failed: the values were right,
     only the places were wrong, and no test looked at where. */
  t('each insert draws its attribute at its own position', () => {
    const r = R(`${SETUP}
      DOC.blocks.TAG = { base: [0,0], ents: [
        { t:'circle', c:[0,0], r:400, layer:'0' },
        { t:'attdef', p:[-200,-100], tag:'N', val:'00', h:300, rot:0, anchor:'l', layer:'0' } ] };
      begin();
      const a = addEnt({ t:'insert', name:'TAG', p:[0,0],    layer:'0', att:{N:'D-01'} });
      const b = addEnt({ t:'insert', name:'TAG', p:[2000,0], layer:'0', att:{N:'D-02'} });
      const c = addEnt({ t:'insert', name:'TAG', p:[4000,500], layer:'0' });
      commit('i');
      const at = ins => { const s = shapes(ins, 32).find(x => x.text != null);
                          return s ? { t: s.text, x: Math.round(s.p[0]), y: Math.round(s.p[1]) } : null; };
      /* and a rotated, scaled insert must carry its text round with it */
      begin();
      const d = addEnt({ t:'insert', name:'TAG', p:[0,4000], layer:'0',
                         rot: Math.PI/2, sx:2, sy:2, att:{N:'D-04'} });
      commit('i2');
      return { a: at(a), b: at(b), c: at(c), d: at(d) };`);
    eq(r.a.x, -200, 'the first sits where the definition put it');
    eq(r.b.x, 1800, 'the second is offset by its insert, got ' + r.b.x);
    eq(r.c.x, 3800, 'and so is the third');
    eq(r.c.y, 400, 'in both axes');
    eq(r.a.t, 'D-01'); eq(r.b.t, 'D-02'); eq(r.c.t, '00');
    eq(r.d.t, 'D-04');
    ok(r.d.x !== r.a.x || r.d.y !== r.a.y,
      'a rotated and scaled insert carries its text with it, got ' + JSON.stringify(r.d));
    eq(r.d.y, 3600, 'turned a quarter turn and doubled, got ' + r.d.y);
  });
};
