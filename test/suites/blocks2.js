'use strict';
/* ============================================================
   B7 — managing a block once it exists

   A block could be made, inserted and given attributes, and after
   that it was frozen. Changing what it looked like meant erasing
   every insert and starting again; renaming an attribute was not
   possible at all; and one door type in four swings meant four
   blocks with four names.

   BATTMAN edits the attributes, REFEDIT edits the drawing inside
   the block in place, and visibility states let one block be
   several things.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; DOC.textH = 250;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  /* a block with a line, a circle and two attributes */
  const mkBlock = () => {
    DOC.blocks.WIDGET = { base: [0, 0], ents: [
      { t:'line', a:[0,0], b:[1000,0], layer:'0' },
      { t:'circle', c:[500,0], r:200, layer:'0' },
      { t:'attdef', tag:'REF', prompt:'Reference', val:'W-00', p:[0,400], h:250,
        rot:0, anchor:'l', layer:'0' },
      { t:'attdef', tag:'NOTE', prompt:'Note', val:'', p:[0,-400], h:250,
        rot:0, anchor:'l', layer:'0' },
    ] };
  };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('BATTMAN — the attributes of a block');

  t('lists what a block carries, in order', () => {
    const r = R(`${SETUP}
      mkBlock();
      const defs = blockAttdefs('WIDGET');
      return { tags: defs.map(d => d.tag), prompts: defs.map(d => d.prompt) };`);
    eq(r.tags.join(','), 'REF,NOTE', 'both attributes, in the order declared');
    eq(r.prompts.join(','), 'Reference,Note', 'each with its prompt');
  });

  /* The whole reason this is not just an edit: an insert stores its values
     against the TAG. Rename the tag naively and every insert in the drawing
     silently loses the value it was carrying. */
  t('renaming a tag carries the value on every insert across with it', () => {
    const r = R(`${SETUP}
      mkBlock();
      begin();
      const a = addEnt({t:'insert', name:'WIDGET', p:[0,0], rot:0, sx:1, sy:1,
                        att:{REF:'W-01', NOTE:'left'}, layer:'0'});
      const b = addEnt({t:'insert', name:'WIDGET', p:[5000,0], rot:0, sx:1, sy:1,
                        att:{REF:'W-02'}, layer:'0'});
      commit('i');
      attRename('WIDGET', 'REF', 'MARK');
      return { tags: blockAttdefs('WIDGET').map(d => d.tag),
               a: a.att, b: b.att,
               shown: shapes(a, 32).filter(s => s.text != null).map(s => s.text) };`);
    eq(r.tags.join(','), 'MARK,NOTE', 'the definition was renamed');
    eq(r.a.MARK, 'W-01', 'and the first insert kept its value under the new tag');
    eq(r.b.MARK, 'W-02', 'and so did the second');
    eq(r.a.REF, undefined, 'with nothing left behind under the old one');
    ok(r.shown.includes('W-01'), 'and it still draws: ' + r.shown.join(' | '));
  });

  t('the prompt and default can be changed, and the default reaches new inserts', () => {
    const r = R(`${SETUP}
      mkBlock();
      attEditDef('WIDGET', 'NOTE', { prompt: 'Site note', val: 'TBC' });
      begin();
      const n = addEnt({t:'insert', name:'WIDGET', p:[0,0], rot:0, sx:1, sy:1, layer:'0'});
      commit('i');
      const d = blockAttdefs('WIDGET').find(x => x.tag === 'NOTE');
      return { prompt: d.prompt, val: d.val, shows: attValue(n, d) };`);
    eq(r.prompt, 'Site note');
    eq(r.val, 'TBC');
    eq(r.shows, 'TBC', 'an insert with no value of its own shows the new default');
  });

  t('removing an attribute takes it off every insert too', () => {
    const r = R(`${SETUP}
      mkBlock();
      begin();
      const a = addEnt({t:'insert', name:'WIDGET', p:[0,0], rot:0, sx:1, sy:1,
                        att:{REF:'W-01', NOTE:'left'}, layer:'0'});
      commit('i');
      attRemove('WIDGET', 'NOTE');
      return { tags: blockAttdefs('WIDGET').map(d => d.tag), att: a.att };`);
    eq(r.tags.join(','), 'REF', 'gone from the definition');
    eq(r.att.NOTE, undefined, 'and from what the insert was carrying');
    eq(r.att.REF, 'W-01', 'while the other one is untouched');
  });

  t('a rename onto a tag that already exists is refused', () => {
    const r = R(`${SETUP}
      mkBlock();
      const okOne = attRename('WIDGET', 'REF', 'NOTE');
      return { okOne, tags: blockAttdefs('WIDGET').map(d => d.tag) };`);
    eq(r.okOne, false, 'two attributes cannot share a tag');
    eq(r.tags.join(','), 'REF,NOTE', 'and nothing was changed');
  });

  group('REFEDIT — editing the block where it sits');

  t('opens an insert into the drawing, at the size and place it sits', () => {
    const r = R(`${SETUP}
      mkBlock();
      begin();
      const ins = addEnt({t:'insert', name:'WIDGET', p:[4000,2000], rot:0, sx:2, sy:2, layer:'0'});
      commit('i');
      const n = refeditOpen(ins);
      const ln = [...DOC.ents.values()].find(e => e.t === 'line' && e.__ref);
      const out = { opened: n, line: ln && [ln.a, ln.b],
                    insertGone: ![...DOC.ents.values()].some(e => e.t === 'insert'),
                    editing: refeditName() };
      refeditCancel();
      return out;`);
    ok(r.opened > 0, 'the contents came out, got ' + r.opened);
    eq(r.editing, 'WIDGET', 'and it knows what it is editing');
    eq(r.insertGone, true, 'the insert is out of the way while you work on it');
    eq(r.line[0].join(','), '4000,2000', 'the line is where the insert put it');
    eq(r.line[1].join(','), '6000,2000', 'scaled by 2, as the insert was');
  });

  /* Opening and closing without touching anything must leave the definition
     exactly as it was, or every REFEDIT quietly degrades the block. */
  t('closing with no edits leaves the definition untouched', () => {
    const r = R(`${SETUP}
      mkBlock();
      begin();
      const ins = addEnt({t:'insert', name:'WIDGET', p:[4000,2000], rot:rad(30), sx:2, sy:2, layer:'0'});
      commit('i');
      const before = clone(DOC.blocks.WIDGET);
      refeditOpen(ins);
      refeditSave();
      const after = DOC.blocks.WIDGET;
      /* every number, in order, from both — so a coordinate that moved shows
         up wherever in the structure it lives */
      const nums = (o, out) => { out = out || [];
        if (typeof o === 'number') out.push(o);
        else if (Array.isArray(o)) o.forEach(x => nums(x, out));
        else if (o && typeof o === 'object') Object.keys(o).sort().forEach(k => nums(o[k], out));
        return out; };
      const keys = (b) => b.ents.map(e => Object.keys(e).sort().join('+')).join(' / ');
      const A = nums(before), B = nums(after);
      const drift = A.length === B.length
        ? Math.max(...A.map((v, i) => Math.abs(v - B[i])), 0) : Infinity;
      return { drift, count: A.length === B.length,
               keysBefore: keys(before), keysAfter: keys(after) };`);
    eq(r.count, true, 'the same numbers came back');
    ok(r.drift < 1e-6, 'none of them moved, worst drift ' + r.drift);
    eq(r.keysAfter, r.keysBefore,
      'and the definition gained nothing: ' + r.keysAfter + '  vs  ' + r.keysBefore);
  });

  t('an edit reaches the definition, and therefore every other insert', () => {
    const r = R(`${SETUP}
      mkBlock();
      begin();
      const a = addEnt({t:'insert', name:'WIDGET', p:[0,0], rot:0, sx:1, sy:1, layer:'0'});
      const b = addEnt({t:'insert', name:'WIDGET', p:[9000,0], rot:0, sx:1, sy:1, layer:'0'});
      commit('i');
      const otherBefore = insertEnts(b).filter(e => e.t === 'circle').length;
      refeditOpen(a);
      /* delete the circle while it is open */
      const c = [...DOC.ents.values()].find(e => e.t === 'circle' && e.__ref);
      begin(); eraseEnt(c.id); commit('x');
      refeditSave();
      const bb = [...DOC.ents.values()].find(e => e.t === 'insert' && e.p[0] === 9000);
      return { otherBefore, defCircles: DOC.blocks.WIDGET.ents.filter(e => e.t === 'circle').length,
               otherAfter: insertEnts(bb).filter(e => e.t === 'circle').length,
               inserts: [...DOC.ents.values()].filter(e => e.t === 'insert').length };`);
    eq(r.otherBefore, 1, 'the other insert had the circle');
    eq(r.defCircles, 0, 'the circle is out of the definition');
    eq(r.otherAfter, 0, 'so it is gone from the other insert as well');
    eq(r.inserts, 2, 'and both inserts are back in the drawing');
  });

  t('cancelling throws the edit away and puts the insert back', () => {
    const r = R(`${SETUP}
      mkBlock();
      begin();
      const ins = addEnt({t:'insert', name:'WIDGET', p:[0,0], rot:0, sx:1, sy:1, layer:'0'});
      commit('i');
      refeditOpen(ins);
      const c = [...DOC.ents.values()].find(e => e.t === 'circle' && e.__ref);
      begin(); eraseEnt(c.id); commit('x');
      refeditCancel();
      return { defCircles: DOC.blocks.WIDGET.ents.filter(e => e.t === 'circle').length,
               inserts: [...DOC.ents.values()].filter(e => e.t === 'insert').length,
               leftovers: [...DOC.ents.values()].filter(e => e.__ref).length,
               editing: refeditName() };`);
    eq(r.defCircles, 1, 'the definition still has its circle');
    eq(r.inserts, 1, 'the insert is back');
    eq(r.leftovers, 0, 'and nothing was left lying in the drawing');
    eq(r.editing, null, 'and nothing is being edited any more');
  });

  t('two reference edits at once are refused rather than tangled', () => {
    const r = R(`${SETUP}
      mkBlock();
      begin();
      const a = addEnt({t:'insert', name:'WIDGET', p:[0,0], rot:0, sx:1, sy:1, layer:'0'});
      const b = addEnt({t:'insert', name:'WIDGET', p:[9000,0], rot:0, sx:1, sy:1, layer:'0'});
      commit('i');
      refeditOpen(a);
      const second = refeditOpen(b);
      refeditCancel();
      return { second };`);
    eq(r.second, 0, 'the second one is refused');
  });

  /* A reference edit belongs to the drawing it was opened in. Left standing
     across a new drawing, closing it would write the old block's contents
     into the new document. */
  t('opening a new drawing abandons any edit in the old one', () => {
    const r = R(`${SETUP}
      mkBlock();
      begin();
      const ins = addEnt({t:'insert', name:'WIDGET', p:[0,0], rot:0, sx:1, sy:1, layer:'0'});
      commit('i');
      refeditOpen(ins);
      const during = refeditName();
      resetDoc();
      return { during, after: refeditName() };`);
    eq(r.during, 'WIDGET', 'an edit was open');
    eq(r.after, null, 'and a new drawing is not still in it');
  });

  group('visibility states — one block being several things');

  t('an entity can belong to some states and not others', () => {
    const r = R(`${SETUP}
      mkBlock();
      const B = DOC.blocks.WIDGET;
      B.states = ['Plain', 'Ringed'];
      B.ents.find(e => e.t === 'circle').vis = ['Ringed'];
      begin();
      const plain = addEnt({t:'insert', name:'WIDGET', p:[0,0], state:'Plain', layer:'0'});
      const ring = addEnt({t:'insert', name:'WIDGET', p:[9000,0], state:'Ringed', layer:'0'});
      const none = addEnt({t:'insert', name:'WIDGET', p:[18000,0], layer:'0'});
      commit('i');
      const circles = (e) => insertEnts(e).filter(x => x.t === 'circle').length;
      const lines = (e) => insertEnts(e).filter(x => x.t === 'line').length;
      return { plain: circles(plain), ring: circles(ring), none: circles(none),
               plainLines: lines(plain) };`);
    eq(r.ring, 1, 'the ringed state shows the circle');
    eq(r.plain, 0, 'the plain one does not');
    eq(r.plainLines, 1, 'while what belongs to no state in particular is always there');
    eq(r.none, 1, 'and an insert with no state chosen shows everything');
  });

  t('the state is a property of the insert, so two can differ side by side', () => {
    const r = R(`${SETUP}
      mkBlock();
      const B = DOC.blocks.WIDGET;
      B.states = ['Plain', 'Ringed'];
      B.ents.find(e => e.t === 'circle').vis = ['Ringed'];
      begin();
      const a = addEnt({t:'insert', name:'WIDGET', p:[0,0], state:'Plain', layer:'0'});
      commit('i');
      const before = insertEnts(a).filter(x => x.t === 'circle').length;
      begin(); mut(a); a.state = 'Ringed'; commit('s');
      return { before, after: insertEnts(a).filter(x => x.t === 'circle').length };`);
    eq(r.before, 0);
    eq(r.after, 1, 'switching the state switches what is drawn');
  });

  t('a state nobody defined shows the block rather than nothing at all', () => {
    const r = R(`${SETUP}
      mkBlock();
      const B = DOC.blocks.WIDGET;
      B.states = ['Plain', 'Ringed'];
      B.ents.find(e => e.t === 'circle').vis = ['Ringed'];
      begin();
      const a = addEnt({t:'insert', name:'WIDGET', p:[0,0], state:'Nonsense', layer:'0'});
      commit('i');
      return { n: insertEnts(a).length };`);
    ok(r.n >= 3, 'an unknown state is not a reason to draw nothing, got ' + r.n);
  });

  t('BVSTATE names a state and puts the selection in it', () => {
    const r = R(`${SETUP}
      mkBlock();
      begin();
      const ins = addEnt({t:'insert', name:'WIDGET', p:[0,0], rot:0, sx:1, sy:1, layer:'0'});
      commit('i');
      refeditOpen(ins);
      const c = [...DOC.ents.values()].find(e => e.t === 'circle' && e.__ref);
      SEL.clear(); SEL.add(c.id);
      blockStateAssign('Ringed');
      refeditSave();
      const B = DOC.blocks.WIDGET;
      return { states: (B.states || []).join(','),
               circleVis: (B.ents.find(e => e.t === 'circle').vis || []).join(','),
               lineVis: B.ents.find(e => e.t === 'line').vis || null };`);
    eq(r.states, 'Ringed', 'the state exists on the block now');
    eq(r.circleVis, 'Ringed', 'and the selected object belongs to it');
    eq(r.lineVis, null, 'while everything else still belongs to the block itself');
  });

  t('the properties panel lets an insert choose its state', () => {
    const r = R(`${SETUP}
      mkBlock();
      DOC.blocks.WIDGET.states = ['Plain', 'Ringed'];
      begin();
      const a = addEnt({t:'insert', name:'WIDGET', p:[0,0], state:'Plain', layer:'0'});
      const plainBlock = addEnt({t:'insert', name:'WIDGET', p:[9000,0], layer:'0'});
      commit('i');
      const rowsFor = (e) => { SEL.clear(); SEL.add(e.id); buildProps();
        return [...document.querySelectorAll('#props .row')].map(x => x.innerHTML || '').join(' '); };
      const withStates = rowsFor(a);
      DOC.blocks.WIDGET.states = [];
      const without = rowsFor(plainBlock);
      return { withStates: /state/i.test(withStates), without: /state/i.test(without) };`);
    eq(r.withStates, true, 'a block with states offers them');
    eq(r.without, false, 'and one without does not offer an empty list');
  });

  t('states and attribute values survive a save and reopen', () => {
    const r = R(`${SETUP}
      mkBlock();
      const B = DOC.blocks.WIDGET;
      B.states = ['Plain', 'Ringed'];
      B.ents.find(e => e.t === 'circle').vis = ['Ringed'];
      begin();
      addEnt({t:'insert', name:'WIDGET', p:[0,0], state:'Ringed',
              att:{REF:'W-09'}, layer:'0'});
      commit('i');
      loadNative(saveNative());
      const a = [...DOC.ents.values()].find(e => e.t === 'insert');
      return { states: (DOC.blocks.WIDGET.states || []).join(','),
               vis: (DOC.blocks.WIDGET.ents.find(e => e.t === 'circle').vis || []).join(','),
               state: a.state, ref: a.att && a.att.REF,
               circles: insertEnts(a).filter(x => x.t === 'circle').length };`);
    eq(r.states, 'Plain,Ringed', 'the states came back');
    eq(r.vis, 'Ringed', 'and which entity belongs to which');
    eq(r.state, 'Ringed', 'the insert kept its state');
    eq(r.ref, 'W-09', 'and its attribute value');
    eq(r.circles, 1, 'and still draws the right thing');
  });
};
