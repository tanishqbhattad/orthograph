'use strict';
/* ============================================================
   9.5 — failures that say why

   Two lines in the command layer caught every error a command
   could throw and printed "That did not work." That is the
   least useful sentence a program can say: it confirms what the
   person already knows and withholds the only thing they need.

   And the boundary tracer — the thing behind HATCH, behind an
   automatic room, behind area take-off — had four distinct ways
   to fail and one answer for all of them. "Nothing encloses
   that point" is true whether the walls have a gap in them, the
   pick is outside the building, or there is nothing drawn at
   all, and each of those is a different thing to go and do.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
  const said = () => (CLI.lines || []).map(l => (l && l.t) || '').join(' | ');
  const box = (x0, y0, x1, y1, gap) => { begin();
    addEnt({t:'wall', a:[x0,y0], b:[x1,y0], wt:'gen100', layer:'A-WALL'});
    addEnt({t:'wall', a:[x1,y0], b:[x1,y1], wt:'gen100', layer:'A-WALL'});
    addEnt({t:'wall', a:[x1,y1], b:[x0,y1], wt:'gen100', layer:'A-WALL'});
    if (!gap) addEnt({t:'wall', a:[x0,y1], b:[x0,y0], wt:'gen100', layer:'A-WALL'});
    commit('b'); };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('the sentence that says nothing');

  t('"That did not work" is not in the program any more', () => {
    const r = R(`${SETUP} return { ok: 1 };`);
    const fs = require('fs'), path = require('path');
    const src = path.join(__dirname, '..', '..', 'orthograph.html');
    const txt = fs.readFileSync(src, 'utf8');
    eq(/That did not work/.test(txt), false,
      'the least useful sentence a program can say');
  });

  t('a command that fails on purpose says its own reason', () => {
    const r = R(`${SETUP}
      cancelCmd(); CLI.lines.length = 0;
      startCmd('hatch');
      cmdPoint([50000, 50000]);        /* nothing anywhere near */
      return { said: said() };`);
    ok(!/did not work/i.test(r.said), 'not the useless one');
    ok(/nothing|no |empty/i.test(r.said), 'and something a person can act on: ' + r.said);
  });

  t('an unexpected error names the command and what went wrong', () => {
    const r = R(`${SETUP}
      cancelCmd(); CLI.lines.length = 0;
      /* a command whose point handler is broken, which is the case the old
         catch-all existed for */
      CMDS.__broken = { key: '__broken', group: 'draw', hint: 'x',
        point() { throw new Error('the widget was not frobbed'); } };
      startCmd('__broken');
      cmdPoint([0, 0]);
      delete CMDS.__broken;
      return { said: said() };`);
    ok(/broken/i.test(r.said), 'the command is named: ' + r.said);
    ok(/frobbed/.test(r.said), 'and so is the actual error: ' + r.said);
  });

  group('why the boundary did not close');

  t('an empty drawing says there is nothing there, not that it is not enclosed', () => {
    const r = R(`${SETUP}
      const got = traceBoundary([1000, 1000]);
      return { got, why: traceWhy() };`);
    eq(r.got, null);
    ok(/nothing (is )?drawn|no geometry|empty/i.test(r.why),
      'it says the drawing is empty: ' + r.why);
  });

  t('a gap in the walls is reported as a gap, not as a mystery', () => {
    const r = R(`${SETUP}
      box(0, 0, 6000, 4000, true);          /* one side missing */
      const got = traceBoundary([3000, 2000]);
      return { got: !!got, why: traceWhy() };`);
    eq(r.got, false, 'it cannot close');
    ok(/open|gap|not close/i.test(r.why),
      'and says the boundary is open: ' + r.why);
  });

  t('a pick outside the building says so', () => {
    const r = R(`${SETUP}
      box(0, 0, 6000, 4000);
      const got = traceBoundary([20000, 2000]);
      return { got: !!got, why: traceWhy() };`);
    eq(r.got, false);
    ok(/outside|nothing above|not inside/i.test(r.why),
      'it says the pick is not inside anything: ' + r.why);
  });

  t('a closed room traces, and the reason is cleared with it', () => {
    const r = R(`${SETUP}
      box(0, 0, 6000, 4000);
      const got = traceBoundary([3000, 2000]);
      return { got: !!got, why: traceWhy() };`);
    eq(r.got, true, 'it works');
    eq(r.why, null, 'and there is no stale complaint left behind');
  });

  t('HATCH passes the reason on rather than inventing its own', () => {
    const r = R(`${SETUP}
      box(0, 0, 6000, 4000, true);
      cancelCmd(); CLI.lines.length = 0;
      startCmd('hatch'); cmdPoint([3000, 2000]);
      return { said: said() };`);
    ok(/open|gap|not close/i.test(r.said),
      'the person is told to go and close the gap: ' + r.said);
  });

  t('an automatic room that cannot close says why in the panel', () => {
    const r = R(`${SETUP}
      box(0, 0, 6000, 4000, true);
      begin();
      const rm = addEnt({t:'room', auto:1, seed:[3000,2000], name:'X', layer:'A-AREA'});
      commit('r');
      roomBoundary(rm);
      return { why: roomWhy(rm) };`);
    ok(/open|gap|not close|not enclosed/i.test(r.why),
      'the room says what is wrong with it: ' + r.why);
  });
};
