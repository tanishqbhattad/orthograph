'use strict';
/* ============================================================
   Dynamic input and command workflow — 07-cmd / 14-events
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm';                       /* suites share one sandbox */
  DOC.gridStep = 100; DOC.snapStep = 100; DOC.textH = 200;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ST.dyn = true; ST.osnap = false; ST.ortho = false; ST.polar = false;
  ST.cur = [0,0]; dynKill();
`;
module.exports = ({ group, t, ok, eq, close, R }) => {
  const F = (id) => `document.getElementById('${id}')`;

  group('dynamic input: always live');

  t('it appears before the first point, showing absolute X and Y', () => {
    const r = R(SETUP + `
      startCmd('line');
      ST.cur = [1234, 5678];
      syncDyn();
      return {mode: dynMode, x: ${F('dF1')}.value, y: ${F('dF2')}.value, shown: !!dynEl};`);
    eq(r.shown, true, 'dynamic input must not wait for the first click');
    eq(r.mode, 'abs');
    eq(r.x, '1234'); eq(r.y, '5678');
  });

  t('it switches to length and angle once there is a reference point', () => {
    const r = R(SETUP + `
      startCmd('line');
      cmdPoint([0,0]);
      ST.cur = [300, 0];
      syncDyn();
      return {mode: dynMode, len: ${F('dF1')}.value, ang: ${F('dF2')}.value};`);
    eq(r.mode, 'polar');
    eq(r.len, '300'); eq(r.ang, '0.0');
  });

  t('the live fields keep tracking the cursor — they never freeze', () => {
    const r = R(SETUP + `
      startCmd('line'); cmdPoint([0,0]);
      const seen = [];
      for (const p of [[100,0],[250,0],[400,0]]) { ST.cur = p; syncDyn(); seen.push(${F('dF1')}.value); }
      return seen;`);
    eq(r.join(','), '100,250,400', 'the length field must follow the cursor');
  });

  group('dynamic input: locking a field');

  t('typing a length locks it and the mouse drives only the angle', () => {
    const r = R(SETUP + `
      startCmd('line'); cmdPoint([0,0]);
      ST.cur = [100, 0]; syncDyn();
      const f1 = ${F('dF1')};
      f1.value = '2000';
      f1._listeners.input.forEach(fn => fn());
      ST.cur = [100, 100]; syncDyn();
      const applied = dynApply(ST.cur);
      return {locked: dynLock.f1, kept: f1.value, applied,
              len: dist([0,0], applied), ang: deg(ang([0,0], applied))};`);
    eq(r.locked, true, 'typing must lock the field');
    eq(r.kept, '2000', 'and the typed value must survive a mouse move');
    close(r.len, 2000, 1e-6, 'the locked length is honoured');
    close(r.ang, 45, 1e-6, 'while the mouse still steers the angle');
  });

  t('a locked angle lets the mouse drive the length', () => {
    const r = R(SETUP + `
      startCmd('line'); cmdPoint([0,0]);
      ST.cur = [100, 0]; syncDyn();
      const f2 = ${F('dF2')};
      f2.value = '90';
      f2._listeners.input.forEach(fn => fn());
      ST.cur = [0, 750]; syncDyn();
      const applied = dynApply(ST.cur);
      return {applied, len: dist([0,0], applied), ang: deg(ang([0,0], applied))};`);
    close(r.ang, 90, 1e-6, 'the locked angle holds');
    close(r.len, 750, 1e-6, 'and the length follows the cursor');
  });

  t('Escape releases the locks instead of killing the command', () => {
    const r = R(SETUP + `
      startCmd('line'); cmdPoint([0,0]);
      ST.cur = [100,0]; syncDyn();
      const f1 = ${F('dF1')};
      f1.value = '500'; f1._listeners.input.forEach(fn => fn());
      const lockedBefore = dynLocked();
      dynRelease();
      ST.cur = [321,0]; syncDyn();
      return {lockedBefore, lockedAfter: dynLocked(), live: f1.value, cmdAlive: !!CMD};`);
    eq(r.lockedBefore, true);
    eq(r.lockedAfter, false, 'releasing must unlock');
    eq(r.live, '321', 'and the field goes live again');
    eq(r.cmdAlive, true, 'without cancelling the command');
  });

  t('committing a point clears the lock so the next segment is free', () => {
    const r = R(SETUP + `
      startCmd('line'); cmdPoint([0,0]);
      ST.cur = [100,0]; syncDyn();
      const f1 = ${F('dF1')};
      f1.value = '1000'; f1._listeners.input.forEach(fn => fn());
      dynCommit();
      const e = [...DOC.ents.values()][0];
      return {locked: dynLocked(), b: e && e.b};`);
    eq(r.locked, false, 'a committed point must release the lock');
    close(r.b[0], 1000, 1e-6, 'and the typed length is what got drawn');
  });

  t('the mouse honours a locked field when you click', () => {
    const r = R(SETUP + `
      startCmd('line'); cmdPoint([0,0]);
      ST.cur = [50,0]; syncDyn();
      const f1 = ${F('dF1')};
      f1.value = '3000'; f1._listeners.input.forEach(fn => fn());
      ST.cur = [10,10];
      const eff = dynApply(ST.cur);
      dynRelease(); cmdPoint(eff);
      const e = [...DOC.ents.values()][0];
      return dist(e.a, e.b);`);
    close(r, 3000, 1e-6, 'clicking uses the locked length, not the raw cursor');
  });

  t('absolute X can be locked while Y follows the mouse', () => {
    const r = R(SETUP + `
      startCmd('line');
      ST.cur = [10, 10]; syncDyn();
      const f1 = ${F('dF1')};
      f1.value = '2500'; f1._listeners.input.forEach(fn => fn());
      ST.cur = [10, 900];
      return dynApply(ST.cur);`);
    close(r[0], 2500, 1e-6); close(r[1], 900, 1e-6);
  });

  group('workflow');

  t('Space repeats the last command even when nothing was typed', () => {
    const r = R(SETUP + `
      startCmd('circle'); endCmd(true);
      const remembered = ST.lastCmd;
      startCmd(ST.lastCmd);
      const again = CMD && CMD.def.key;
      endCmd(true);
      return {remembered, again};`);
    eq(r.remembered, 'circle');
    eq(r.again, 'circle', 'Space must bring the same tool back');
  });

  t('a tool that needs a selection waits for one, then runs', () => {
    const r = R(SETUP + `
      addEnt({t:'line',a:[0,0],b:[100,0]});
      SEL.clear();
      startCmd('move');
      const waited = CMD.phase;
      SEL.add([...DOC.ents.values()][0].id);
      cmdEnter();
      const phase = CMD && CMD.phase;
      endCmd(true);
      return {waited, phase};`);
    eq(r.waited, 'sel', 'tool-first: it asks for a selection');
    eq(r.phase, 'run', 'and starts once Enter confirms it');
  });

  t('selecting first then invoking the tool skips the selection step', () => {
    const r = R(SETUP + `
      const e = addEnt({t:'line',a:[0,0],b:[100,0]});
      SEL.clear(); SEL.add(e.id);
      startCmd('move');
      const phase = CMD.phase;
      cmdPoint([0,0]); cmdPoint([500,0]);
      return {phase, moved: e.a[0]};`);
    eq(r.phase, 'run', 'selection-first goes straight to work');
    close(r.moved, 500, 1e-6);
  });

  t('Escape cancels cleanly and leaves nothing behind', () => {
    const r = R(SETUP + `
      const before = DOC.ents.size;
      startCmd('wall'); cmdPoint([0,0]);
      ST.cur = [1000,0]; syncDyn();
      endCmd();
      return {before, after: DOC.ents.size, cmd: CMD, dyn: !!dynEl};`);
    eq(r.after, r.before, 'a cancelled command draws nothing');
    eq(r.cmd, null); eq(r.dyn, false, 'and the dynamic input goes with it');
  });

  t('every command that takes points shows dynamic input', () => {
    const r = R(SETUP + `
      const miss = [];
      for (const k of ['line','pline','rect','circle','arc','wall','stair','grid','dim']) {
        dynKill(); SEL.clear();
        startCmd(k);
        if (CMD && CMD.phase === 'sel') cmdEnter();
        ST.cur = [500,500];
        syncDyn();
        if (!dynEl) miss.push(k);
        endCmd(true);
      }
      return miss;`);
    eq(r.length, 0, 'no dynamic input for: ' + r.join(', '));
  });
};
