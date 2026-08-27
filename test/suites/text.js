'use strict';
/* ============================================================
   B4 — mtext is one object with a width

   MTEXT used to add one `text` entity per line and forget they
   belonged together: editing meant editing each line, moving one
   left the rest behind, and there was no width to wrap to.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  VS.mirrtext = 0;
  const MT = (o) => addEnt(Object.assign({ t:'mtext', p:[0,0], h:200, w:2000,
    rot:0, anchor:'l', layer:'0', s:'The quick brown fox jumps over the lazy dog' }, o || {}));
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('one paragraph, one entity');

  t('a wrapped paragraph is a single object', () => {
    const r = R(`${SETUP}
      begin(); const m = MT(); commit('m');
      const lines = mtextLines(m).map(x => x.text);
      return { ents: DOC.ents.size, lines, n: lines.length };`);
    eq(r.ents, 1, 'one entity, not one per line');
    eq(r.n, 3, 'wrapped to the column, got ' + r.n + ' lines');
    eq(r.lines[0], 'The quick brown');
    ok(r.lines.every(l => l.length <= 16), 'no line overruns the column: ' + r.lines.join(' | '));
  });

  t('moving it takes the whole paragraph', () => {
    const r = R(`${SETUP}
      begin(); const m = MT(); commit('m');
      begin(); xf(m, T.move([1000, 500])); commit('mv');
      const rows = mtextLines(m);
      return { ents: DOC.ents.size, first: rows[0].p.map(Math.round),
               spacingKept: Math.round(rows[0].p[1] - rows[1].p[1]) };`);
    eq(r.ents, 1);
    eq(r.first.join(','), '1000,500', 'the insertion point moved');
    eq(r.spacingKept, 310, 'and the lines kept their spacing');
  });

  t('scaling scales the column, so the wrap survives', () => {
    const r = R(`${SETUP}
      begin(); const m = MT(); commit('m');
      const before = mtextLines(m).length;
      begin(); xf(m, T.scale([0,0], 2)); commit('sc');
      return { before, after: mtextLines(m).length, h: m.h, w: m.w };`);
    eq(r.h, 400, 'the text doubles');
    eq(r.w, 4000, 'and so does the column');
    eq(r.after, r.before, 'so it still breaks in the same places');
  });

  t('no width means no wrapping', () => {
    const r = R(`${SETUP}
      begin(); const m = MT({ w: 0 }); commit('m');
      return { lines: mtextLines(m).map(x => x.text) };`);
    eq(r.lines.length, 1, 'one line');
    eq(r.lines[0], 'The quick brown fox jumps over the lazy dog');
  });

  t('typed line breaks are kept, and blank lines with them', () => {
    const r = R(`${SETUP}
      begin();
      const m = MT({ w: 0, s: 'GENERAL NOTES' + String.fromCharCode(10) +
                              String.fromCharCode(10) + 'Do not scale.' });
      commit('m');
      return { lines: mtextLines(m).map(x => x.text) };`);
    eq(r.lines.length, 3, 'the blank line is a line');
    eq(r.lines[0], 'GENERAL NOTES');
    eq(r.lines[1], '');
    eq(r.lines[2], 'Do not scale.');
  });

  /* A word longer than the column has to go somewhere. Letting it overflow the
     box silently is worse than breaking it, because the box is what the person
     drew to say where the text may go. */
  t('a word too long for the column is broken, not left to overflow', () => {
    const r = R(`${SETUP}
      begin(); const m = MT({ w: 1000, s: 'Antidisestablishmentarianism' }); commit('m');
      const lines = mtextLines(m).map(x => x.text);
      return { lines, longest: Math.max(...lines.map(l => l.length)),
               per: Math.floor(1000 / (200 * 0.62)),
               rejoined: lines.join('') };`);
    ok(r.lines.length > 1, 'it is broken across lines');
    ok(r.longest <= r.per, 'and no piece is wider than the column');
    eq(r.rejoined, 'Antidisestablishmentarianism', 'without losing a letter');
  });

  group('mtext behaves like the rest of the drawing');

  t('it has a bounding box, so it fits and selects', () => {
    const r = R(`${SETUP}
      begin(); const m = MT(); commit('m');
      const b = bbox(m).map(Math.round);
      return { b, w: b[2] - b[0], tall: b[3] - b[1] > 200 };`);
    eq(r.w, 2000, 'as wide as its column');
    eq(r.tall, true, 'and taller than one line');
  });

  t('mirroring keeps it readable, like single-line text', () => {
    const r = R(`${SETUP}
      begin(); const m = MT({ w: 0, s: 'KITCHEN' }); commit('m');
      const c = xf(clone(m), T.mirror([3000,0],[3000,1000]));
      return { deg: deg(c.rot), anchor: c.anchor, x: Math.round(c.p[0]), w: c.w };`);
    close(r.deg, 0, 1e-9, 'still the right way up, got ' + r.deg);
    eq(r.anchor, 'r', 'with the anchor flipped so it sits where it did');
    eq(r.x, 6000);
  });

  t('it exports one text element per wrapped line', () => {
    const r = R(`${SETUP}
      begin(); MT(); commit('m');
      const svg = exportSVG();
      const texts = (svg.match(/<text[^>]*>/g) || []).length;
      return { texts, hasFox: /fox/.test(svg) };`);
    eq(r.texts, 3, 'three lines, three elements');
    eq(r.hasFox, true, 'and the words are actually in the file');
  });

  /* It drew perfectly and could not be selected: text is picked by its BOX,
     and mtext was falling through to a distance test that only knew about its
     insertion point. A paragraph you cannot click on is not an object. */
  t('a paragraph can be clicked anywhere inside it', () => {
    const r = R(`${SETUP}
      begin(); const m = MT(); commit('m');
      const b = bbox(m);
      const mid = [(b[0]+b[2])/2, (b[1]+b[3])/2];
      const inside = pickAt(mid, 5);
      const onLastLine = pickAt([b[0] + 50, b[1] + 50], 5);
      const wellOutside = pickAt([b[2] + 5000, b[3] + 5000], 5);
      return { inside: !!inside && inside.id === m.id,
               last: !!onLastLine && onLastLine.id === m.id,
               outside: wellOutside === null,
               dInside: entDist(mid, m),
               dOutside: Math.round(entDist([b[2] + 1000, (b[1]+b[3])/2], m)) };`);
    eq(r.inside, true, 'clicking in the middle of the paragraph selects it');
    eq(r.last, true, 'and so does clicking on the last line');
    eq(r.outside, true, 'clicking well away from it selects nothing');
    eq(r.dInside, 0, 'inside the box is distance zero');
    eq(r.dOutside, 1000, 'and outside it measures to the box, got ' + r.dOutside);
  });

  t('a window selection judges it by its box, not one corner', () => {
    const r = R(`${SETUP}
      begin(); const m = MT(); commit('m');
      const b = bbox(m);
      /* a window that only just clips the top-left corner must NOT take it */
      const clip = entInPoly(m, [[b[0]-10,b[1+2]-10],[b[0]+10,b[3]-10],
                                 [b[0]+10,b[3]+10],[b[0]-10,b[3]+10]]);
      /* one that contains the whole box must */
      const whole = entInPoly(m, [[b[0]-10,b[1]-10],[b[2]+10,b[1]-10],
                                  [b[2]+10,b[3]+10],[b[0]-10,b[3]+10]]);
      return { clip, whole };`);
    eq(r.clip, false, 'clipping a corner is not enclosing the paragraph');
    eq(r.whole, true, 'enclosing the whole box is');
  });

  group('a leader is one object too');

  /* LEADER used to add a polyline, a filled arrowhead and a text as three
     unrelated entities: move the note and the arrow stayed pointing at
     nothing, erase the arrow and the leader still looked finished. */
  t('drawing a leader makes one entity, not three', () => {
    const r = R(`${SETUP}
      cancelCmd();
      startCmd('leader');
      cmdPoint([1000, 1000]);
      cmdPoint([3000, 2500]);
      dispatch('SEE DETAIL 3');
      endCmd(true);
      const es = [...DOC.ents.values()];
      const L = es[0];
      const g = L && leaderGeom(L);
      return { n: es.length, t: L && L.t, s: L && L.s,
               spine: g && g.spine.length, head: g && g.head.length > 2 };`);
    eq(r.n, 1, 'one entity');
    eq(r.t, 'leader'); eq(r.s, 'SEE DETAIL 3');
    eq(r.spine, 3, 'the elbow and the landing tail come out of its points');
    eq(r.head, true, 'and so does the arrowhead');
  });

  t('moving a leader takes the arrow and the note with it', () => {
    const r = R(`${SETUP}
      begin();
      const L = addEnt({t:'leader', pts:[[1000,1000],[3000,2500]], s:'NOTE', h:200, layer:'0'});
      commit('l');
      const before = leaderGeom(L);
      begin(); xf(L, T.move([500, -700])); commit('mv');
      const after = leaderGeom(L);
      return { n: DOC.ents.size,
               tip: after.spine[0].map(Math.round),
               textMoved: Math.round(after.tp[0] - before.tp[0]),
               headMoved: Math.round(after.head[0][0] - before.head[0][0]) };`);
    eq(r.n, 1);
    eq(r.tip.join(','), '1500,300', 'the arrow tip moved');
    eq(r.textMoved, 500, 'the note moved with it');
    eq(r.headMoved, 500, 'and so did the arrowhead');
  });

  t('a leader is picked along its line and on its note', () => {
    const r = R(`${SETUP}
      begin();
      const L = addEnt({t:'leader', pts:[[0,0],[2000,2000]], s:'NOTE', h:200, layer:'0'});
      commit('l');
      const onLine = pickAt([1000, 1000], 10);
      const away = pickAt([0, 5000], 10);
      return { onLine: !!onLine && onLine.id === L.id, away: away === null };`);
    eq(r.onLine, true, 'clicking the leader line selects it');
    eq(r.away, true, 'and clicking nowhere near it selects nothing');
  });

  t('a leader exports its line, its head and its note', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'leader', pts:[[0,0],[2000,2000]], s:'SEE DETAIL', h:200, layer:'0'});
      commit('l');
      const svg = exportSVG();
      return { paths: (svg.match(/<path/g) || []).length,
               filled: /fill="#[0-9a-f]{6}" stroke="none"/i.test(svg),
               text: /SEE DETAIL/.test(svg) };`);
    ok(r.paths >= 2, 'the spine and the head are both drawn');
    eq(r.filled, true, 'the arrowhead is filled');
    eq(r.text, true, 'and the note is in the file');
  });

  group('B4 — named text styles');

  /* There was one text height on the document and nothing else: no font, no
     width factor, no oblique, and no way to say "all the room names look like
     this". */
  t('a piece of text can name a style, and falls back to the current one', () => {
    const r = R(`${SETUP}
      textStyles().push({ name: 'Notes', font: 'Georgia', wf: 0.85, oblique: 12 });
      begin();
      const a = addEnt({t:'text', s:'A', p:[0,0], h:200, rot:0, anchor:'l', layer:'0'});
      commit('a');
      const std = textStyle(a);
      a.style = 'Notes';
      const named = textStyle(a);
      a.ovr = { wf: 2 };
      const over = textStyle(a);
      DOC.curTextStyle = 'Notes';
      const plain = textStyle({ t:'text' });
      DOC.curTextStyle = 'Standard';
      return { std: std.font + '/' + std.wf,
               named: named.font + '/' + named.wf + '/' + named.oblique,
               over: over.wf, plain: plain.font };`);
    eq(r.std, 'Inter/1', 'the default style is Inter at full width');
    eq(r.named, 'Georgia/0.85/12', 'naming a style uses all of it');
    eq(r.over, 2, 'and the text’s own override beats the style');
    eq(r.plain, 'Georgia', 'text with no style of its own follows the current one');
  });

  t('STYLE saves, sets current and applies to a selection', () => {
    const r = R(`${SETUP}
      begin();
      const a = addEnt({t:'text', s:'A', p:[0,0], h:200, rot:0, anchor:'l', layer:'0'});
      commit('a');
      cancelCmd();
      startCmd('style'); dispatch('F'); dispatch('Georgia'); endCmd(true);
      startCmd('style'); dispatch('W'); dispatch('0.8'); endCmd(true);
      startCmd('style'); dispatch('S'); dispatch('Notes'); endCmd(true);
      const saved = textStyles().map(x => x.name);
      const cur = DOC.curTextStyle;
      startCmd('style'); dispatch('R'); dispatch('Standard'); endCmd(true);
      SEL.clear(); SEL.add(a.id);
      startCmd('style'); dispatch('A'); dispatch('Notes'); endCmd(true);
      /* nonsense is refused rather than quietly setting something */
      startCmd('style'); dispatch('W'); dispatch('-3'); endCmd(true);
      return { saved, cur, back: DOC.curTextStyle, applied: a.style,
               wf: textStyleRec('Notes').wf };`);
    eq(r.saved.join(','), 'Standard,Notes');
    eq(r.cur, 'Notes', 'saving makes it current');
    eq(r.back, 'Standard', 'and it can be set back');
    eq(r.applied, 'Notes', 'applying tags the selected text');
    eq(r.wf, 0.8, 'a negative width factor is refused, leaving 0.8');
  });

  t('text styles travel with the drawing', () => {
    const r = R(`${SETUP}
      textStyles().push({ name: 'Notes', font: 'Georgia', wf: 0.85, oblique: 12 });
      DOC.curTextStyle = 'Notes';
      const txt = saveNative();
      resetDoc();
      const fresh = textStyles().length;
      loadNative(txt);
      return { fresh, names: textStyles().map(x => x.name), cur: DOC.curTextStyle,
               font: textStyle(null).font };`);
    eq(r.fresh, 1, 'a new document has only Standard');
    eq(r.names.join(','), 'Standard,Notes', 'and they come back with the file');
    eq(r.cur, 'Notes'); eq(r.font, 'Georgia');
  });
};
