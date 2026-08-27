'use strict';
/* ============================================================
   Snap engine — 06-snap.js
   Every test drives snapPoint() through real screen coordinates
   and asserts the exact world point that comes back, because a
   snap that is "about right" is a snap that is wrong.
   ============================================================ */

/* a clean board: identity-ish view, every snap kind on, no tracking history */
const SETUP = `
  resetDoc();
  DOC.gridStep = 100; DOC.snapStep = 100;
  V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ST.osnap = true; ST.ortho = false; ST.polar = true; ST.snapgrid = false;
  ST.otrack = true; ST.trackPolar = true; ST.polarRel = false; ST.polarExtra.length = 0;
  ST.polarInc = 45; ST.snapCycle = 0; ST.snapScr = null;
  ST.aperture = 10; ST.markerSize = 6; ST.apBox = false;
  ST.trackPts.length = 0; ST.parRefs.length = 0; ST.snapCands = null; ST.snap = null;
  /* extPts leaks between suites exactly like trackPts does — the app's own
     clearTracks() resets all three together, so pinning two of them was a
     latent bug. It stayed invisible while arbitration was priority-first,
     because perpx (46) outranked a stray ext (20) however close the ext was. */
  ST.extPts.length = 0; ST.tracks = null;
  ST.osnapOne = null; ST.osnapOneShot = false; ST.ptMod = null; ST.fromBase = null;
  toggleSnap('all');
`;
/* snap at a world point (converted through w2s, so it works at any view angle) */
const AT = (wx, wy, ref) =>
  `const _s = w2s([${wx}, ${wy}]);
   const _p = snapPoint(_s[0], _s[1], ${ref || 'null'});
   return { k: ST.snap && ST.snap.k, p: _p, n: (ST.snapCands || []).length,
            kinds: (ST.snapCands || []).map(c => c.k) };`;

module.exports = ({ group, t, ok, eq, close, R }) => {
  if (process.env.NOSNAP) return;

  const pt = (r, x, y, tol, msg) => {
    ok(r.p, (msg || 'snap') + ': no point');
    close(r.p[0], x, tol == null ? 1e-9 : tol, (msg || 'snap') + ' x');
    close(r.p[1], y, tol == null ? 1e-9 : tol, (msg || 'snap') + ' y');
  };

  /* ============================================================ */
  group('snap: priority model');

  t('endpoint outranks nearest even when nearest is closer', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[200,0]});
      ${AT(4, 4)}`);
    eq(r.k, 'end'); pt(r, 0, 0);
    ok(r.kinds.includes('near'), 'nearest should still be offered for Tab');
  });

  /* Rewritten when arbitration became distance-first. The cursor here is
     2.83px from the midpoint and 6.32px from the intersection, so the midpoint
     is plainly what is being pointed at; the old assertion encoded priority
     dominance and handed back a point 6px from the crosshair. Priority still
     decides once the two are comparably close — the second half pins that, so
     this cannot be satisfied by ignoring priority altogether. */
  t('the closer of intersection and midpoint wins', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[200,0]});
      addEnt({t:'line',a:[108,-50],b:[108,50]});
      ${AT(102, 2)}`);
    eq(r.k, 'mid'); pt(r, 100, 0);
    ok(r.kinds.includes('int'), 'the intersection is still a candidate');

    /* same geometry, cursor moved beside the intersection instead */
    const x = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[200,0]});
      addEnt({t:'line',a:[108,-50],b:[108,50]});
      ${AT(107, 1)}`);
    eq(x.k, 'int'); pt(x, 108, 0);
  });

  t('midpoint outranks nearest and lands exactly halfway', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[300,400]});
      ${AT(152, 202)}`);
    eq(r.k, 'mid'); pt(r, 150, 200);
  });

  t('quadrant wins over a centre inferred from the rim', () => {
    const r = R(`${SETUP}
      addEnt({t:'circle',c:[0,0],r:100});
      ${AT(98, 4)}`);
    eq(r.k, 'quad'); pt(r, 100, 0);
  });

  t('hovering the rim away from a quadrant gives the centre', () => {
    const r = R(`${SETUP}
      addEnt({t:'circle',c:[0,0],r:100});
      const q = Math.SQRT1_2 * 100;
      const _s = w2s([q, q]);
      const _p = snapPoint(_s[0], _s[1], null);
      return { k: ST.snap && ST.snap.k, p: _p, kinds: (ST.snapCands||[]).map(c=>c.k) };`);
    eq(r.k, 'cen'); pt(r, 0, 0, 1e-9);
  });

  t('nearest is last resort: it only wins when nothing else is in reach', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[10000,0]});
      ${AT(4321, 5)}`);
    eq(r.k, 'near'); pt(r, 4321, 0);
  });

  t('node beats everything on a point entity', () => {
    const r = R(`${SETUP}
      addEnt({t:'point',p:[500,500]});
      addEnt({t:'line',a:[400,504],b:[600,504]});
      ${AT(503, 503)}`);
    eq(r.k, 'node'); pt(r, 500, 500);
  });

  t('osnap off returns the raw cursor point untouched', () => {
    const r = R(`${SETUP}
      ST.osnap = false;
      addEnt({t:'line',a:[0,0],b:[200,0]});
      ${AT(4, 4)}`);
    ok(!r.k, 'no snap kind is reported when osnap is off'); pt(r, 4, 4);
    eq(r.n, 0);
  });

  /* ============================================================ */
  group('snap: perpendicular');

  t('perpendicular foot on a segment is exact', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[200,0]});
      ${AT(52, 3, '[50,300]')}`);
    eq(r.k, 'perp'); pt(r, 50, 0);
  });

  t('deferred perpendicular reaches past the end of the segment', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[100,0]});
      ${AT(198, 4, '[200,300]')}`);
    /* the foot (200,0) lies past the segment end (100,0): still a valid
       perpendicular, but marked distinctly. The cursor must be near the FOOT —
       a snap that drags the point 130mm across the screen is a jump, not a snap. */
    eq(r.k, 'perpx', 'a foot beyond the end must be marked distinctly');
    pt(r, 200, 0);
  });

  t('perpendicular onto a polyline segment', () => {
    const r = R(`${SETUP}
      addEnt({t:'pline',pts:[[0,0],[400,0],[400,400]],closed:false});
      ${AT(404, 130, '[900,130]')}`);
    eq(r.k, 'perp'); pt(r, 400, 130);
  });

  t('perpendicular onto a circle is the near foot on the radius', () => {
    const r = R(`${SETUP}
      addEnt({t:'circle',c:[0,0],r:100});
      const q = Math.SQRT1_2 * 100;
      const _s = w2s([q + 2, q + 2]);
      const _p = snapPoint(_s[0], _s[1], [300,300]);
      return { k: ST.snap && ST.snap.k, p: _p };`);
    eq(r.k, 'perp');
    pt(r, Math.SQRT1_2 * 100, Math.SQRT1_2 * 100, 1e-9);
  });

  t('perpendicular off the sweep of an arc is deferred', () => {
    const r = R(`${SETUP}
      addEnt({t:'arc',c:[0,0],r:100,a0:0,a1:Math.PI/2});
      ${AT(-98, 6, '[-300,0]')}`);
    eq(r.k, 'perpx'); pt(r, -100, 0);
  });

  t('perpendicular onto a wall centreline', () => {
    const r = R(`${SETUP}
      toggleSnap('wface');
      addEnt({t:'wall',a:[0,0],b:[4000,0],wt:'brk230',just:'center',layer:'0'});
      ${AT(1200, 6, '[1200,900]')}`);
    eq(r.k, 'perp'); pt(r, 1200, 0);
  });

  t('perpendicular onto a wall face', () => {
    const r = R(`${SETUP}
      toggleSnap('wcen');
      addEnt({t:'wall',a:[0,0],b:[4000,0],wt:'brk230',just:'center',layer:'0'});
      ${AT(1200, 110, '[1200,900]')}`);
    eq(r.k, 'perp'); pt(r, 1200, 115, 1e-9, 'foot lands on the 115mm face');
  });

  /* ============================================================ */
  group('snap: walls');

  t('wall centreline endpoint, midpoint and nearest', () => {
    const S = `${SETUP}
      addEnt({t:'wall',a:[0,0],b:[4000,0],wt:'brk230',just:'center',layer:'0'});`;
    const e = R(`${S} ${AT(4, 3)}`);
    eq(e.k, 'end'); pt(e, 0, 0);
    const m = R(`${S} ${AT(2000, 5)}`);
    eq(m.k, 'mid'); pt(m, 2000, 0);
    const n = R(`${S} ${AT(1500, 8)}`);
    eq(n.k, 'wcen'); pt(n, 1500, 0);
  });

  t('wall face nearest lands on the 115mm face line', () => {
    const r = R(`${SETUP}
      addEnt({t:'wall',a:[0,0],b:[4000,0],wt:'brk230',just:'center',layer:'0'});
      ${AT(1500, 110)}`);
    eq(r.k, 'wface'); pt(r, 1500, 115);
  });

  t('wall face midpoint', () => {
    const r = R(`${SETUP}
      toggleSnap('wcen');
      addEnt({t:'wall',a:[0,0],b:[4000,0],wt:'brk230',just:'center',layer:'0'});
      ${AT(2000, 112)}`);
    eq(r.k, 'mid'); pt(r, 2000, 115);
  });

  t('a mitred corner snaps to the outer face point', () => {
    const r = R(`${SETUP}
      addEnt({t:'wall',a:[0,0],b:[4000,0],wt:'brk230',just:'center',layer:'0'});
      addEnt({t:'wall',a:[4000,0],b:[4000,3000],wt:'brk230',just:'center',layer:'0'});
      ${AT(4110, -113)}`);
    eq(r.k, 'end'); pt(r, 4115, -115);
  });

  t('crossing walls give a face intersection at the corner of the crossing', () => {
    const r = R(`${SETUP}
      toggleSnap('end'); toggleSnap('mid');
      addEnt({t:'wall',a:[0,0],b:[4000,0],wt:'brk230',just:'center',layer:'0'});
      addEnt({t:'wall',a:[2000,-1500],b:[2000,1500],wt:'brk230',just:'center',layer:'0'});
      ${AT(2112, -112)}`);
    eq(r.k, 'int'); pt(r, 2115, -115);
  });

  t('a T-junction offers no phantom point on the far face', () => {
    const r = R(`${SETUP}
      addEnt({t:'wall',a:[0,0],b:[4000,0],wt:'brk230',just:'center',layer:'0'});
      addEnt({t:'wall',a:[2000,0],b:[2000,3000],wt:'brk230',just:'center',layer:'0'});
      const _s = w2s([2112, -112]);
      snapPoint(_s[0], _s[1], null);
      return (ST.snapCands||[]).filter(c => c.k === 'int').length;`);
    eq(r, 0, 'the stem does not reach the far face, so nothing crosses there');
  });

  t('wall snaps switch off independently', () => {
    const r = R(`${SETUP}
      toggleSnap('wface'); toggleSnap('wcen');
      addEnt({t:'wall',a:[0,0],b:[4000,0],wt:'brk230',just:'center',layer:'0'});
      ${AT(1500, 8)}`);
    ok(r.k !== 'wcen' && r.k !== 'wface', 'got ' + r.k);
  });

  /* ============================================================ */
  group('snap: rotated view');

  t('endpoint resolves to the same world point at 30 degrees', () => {
    const flat = R(`${SETUP}
      addEnt({t:'line',a:[1234,-567],b:[3000,900]});
      ${AT(1238, -563)}`);
    const spun = R(`${SETUP}
      V.rot = rad(30);
      addEnt({t:'line',a:[1234,-567],b:[3000,900]});
      ${AT(1238, -563)}`);
    eq(flat.k, 'end'); eq(spun.k, 'end');
    pt(spun, 1234, -567, 1e-9, 'rotated endpoint');
    close(spun.p[0], flat.p[0], 1e-9); close(spun.p[1], flat.p[1], 1e-9);
  });

  t('midpoint and intersection survive a rotated view', () => {
    const r = R(`${SETUP}
      V.rot = rad(30);
      addEnt({t:'line',a:[0,0],b:[200,0]});
      ${AT(102, 2)}`);
    eq(r.k, 'mid'); pt(r, 100, 0);
    /* cursor sits beside the intersection rather than the midpoint, so this
       still exercises intersection-under-rotation now that the closer
       candidate wins rather than the higher-priority one */
    const x = R(`${SETUP}
      V.rot = rad(30);
      addEnt({t:'line',a:[0,0],b:[200,0]});
      addEnt({t:'line',a:[108,-50],b:[108,50]});
      ${AT(107, 1)}`);
    eq(x.k, 'int'); pt(x, 108, 0);
  });

  t('deferred perpendicular survives a rotated view', () => {
    const r = R(`${SETUP}
      V.rot = rad(-73.5);
      addEnt({t:'line',a:[0,0],b:[100,0]});
      ${AT(198, 4, '[200,300]')}`);
    eq(r.k, 'perpx'); pt(r, 200, 0);
  });

  t('wall face snap survives a rotated view', () => {
    const r = R(`${SETUP}
      V.rot = rad(30);
      addEnt({t:'wall',a:[0,0],b:[4000,0],wt:'brk230',just:'center',layer:'0'});
      ${AT(1500, 110)}`);
    eq(r.k, 'wface'); pt(r, 1500, 115);
  });

  /* ============================================================ */
  group('snap: Tab cycling');

  t('every candidate under the cursor is collected, best first', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[100,0]});
      addEnt({t:'line',a:[10,-100],b:[10,0]});
      ${AT(4, 3)}`);
    ok(r.n >= 3, 'expected several candidates, got ' + r.n);
    eq(r.kinds[0], 'end');
    const pri = R(`return (ST.snapCands||[]).map(c=>c.pri);`);
    for (let i = 1; i < pri.length; i++) ok(pri[i - 1] >= pri[i], 'candidates must be sorted by priority');
  });

  t('cycleSnap steps through the overlapping points and wraps', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[100,0]});
      addEnt({t:'line',a:[10,-100],b:[10,0]});
      const _s = w2s([4, 3]);
      snapPoint(_s[0], _s[1], null);
      const a = ST.snap.p.slice();
      const b = cycleSnap(1).p.slice();
      const n = (ST.snapCands||[]).length;
      for (let i = 1; i < n; i++) cycleSnap(1);
      const back = ST.snap.p.slice();
      return { a, b, n, back, idx: ST.snapCycle };`);
    close(r.a[0], 0, 1e-9); close(r.a[1], 0, 1e-9);
    close(r.b[0], 10, 1e-9); close(r.b[1], 0, 1e-9);
    eq(r.idx, 0, 'cycling all the way round comes back to the winner');
    close(r.back[0], 0, 1e-9);
  });

  t('snapPoint honours a non-zero cycle index while the cursor holds still', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[100,0]});
      addEnt({t:'line',a:[10,-100],b:[10,0]});
      const _s = w2s([4, 3]);
      snapPoint(_s[0], _s[1], null);
      cycleSnap(1);
      const held = snapPoint(_s[0] + 1, _s[1], null);
      const heldIdx = ST.snapCycle;
      const moved = snapPoint(_s[0] + 20, _s[1], null);
      return { held, heldIdx, movedIdx: ST.snapCycle, movedK: ST.snap && ST.snap.k };`);
    eq(r.heldIdx, 1, 'a 1px jitter must not drop the cycle');
    close(r.held[0], 10, 1e-9); close(r.held[1], 0, 1e-9);
    eq(r.movedIdx, 0, 'a real move resets the cycle');
  });

  t('cycleSnap is safe with nothing under the cursor', () => {
    const r = R(`${SETUP}
      const _s = w2s([9e5, 9e5]);
      snapPoint(_s[0], _s[1], null);
      return [ (ST.snapCands||[]).length, cycleSnap(1) ];`);
    eq(r[0], 0); eq(r[1], null);
  });

  /* ============================================================ */
  group('snap: tracking');

  t('acquired points radiate polar alignment paths', () => {
    const r = R(`${SETUP}
      acquireTrack([0,0],'end');
      ${AT(300, 5)}`);
    eq(r.k, 'track'); pt(r, 300, 0);
    const n = R(`return (ST.tracks||[]).length;`);
    eq(n, 1, 'one alignment path should be drawn');
  });

  t('two acquired points cross and the crossing wins', () => {
    const r = R(`${SETUP}
      acquireTrack([0,0],'end');
      acquireTrack([500,500],'end');
      ${AT(503, 4)}`);
    eq(r.k, 'trackx'); pt(r, 500, 0);
    const n = R(`return (ST.tracks||[]).length;`);
    eq(n, 2, 'both alignment paths should be drawn');
  });

  t('alignment follows the polar increment', () => {
    const r = R(`${SETUP}
      ST.polarInc = 45;
      acquireTrack([0,0],'end');
      ${AT(200, 204)}`);
    eq(r.k, 'track'); pt(r, 202, 202);
  });

  t('acquiring is idempotent, capped, and reversible', () => {
    const r = R(`${SETUP}
      acquireTrack([0,0],'end'); acquireTrack([0,0],'mid'); acquireTrack([0.2,0],'end');
      const one = ST.trackPts.length;
      for (let i = 1; i <= 12; i++) acquireTrack([i*1000, 0], 'end');
      const capped = ST.trackPts.length;
      const gone = releaseTrack(ST.trackPts[0].p.slice());
      return { one, capped, gone, after: ST.trackPts.length };`);
    eq(r.one, 1, 'the same point must not be acquired twice');
    eq(r.capped, 7, 'AutoCAD keeps seven acquired points');
    eq(r.gone, true); eq(r.after, 6);
  });

  t('hovering a snap point long enough acquires it', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[200,0]});
      const _s = w2s([4, 4]);
      snapPoint(_s[0], _s[1], null, 1000);
      const early = ST.trackPts.length;
      snapPoint(_s[0], _s[1], null, 1100);
      const mid = ST.trackPts.length;
      snapPoint(_s[0], _s[1], null, 1400);
      return { early, mid, late: ST.trackPts.length, p: ST.trackPts[0] && ST.trackPts[0].p, k: ST.trackPts[0] && ST.trackPts[0].k };`);
    eq(r.early, 0); eq(r.mid, 0, 'a brush past must not acquire');
    eq(r.late, 1);
    close(r.p[0], 0, 1e-9); close(r.p[1], 0, 1e-9);
    eq(r.k, 'end');
  });

  t('the end of a command drops every acquired point', () => {
    const r = R(`${SETUP}
      acquireTrack([0,0],'end'); acquireTrack([500,0],'end');
      const before = ST.trackPts.length;
      endCmd(true);
      return [before, ST.trackPts.length, ST.tracks];`);
    eq(r[0], 2); eq(r[1], 0); eq(r[2], null);
  });

  t('clearTracks wipes the acquired list', () => {
    const r = R(`${SETUP}
      acquireTrack([0,0],'end'); clearTracks(); return ST.trackPts.length;`);
    eq(r, 0);
  });

  /* ============================================================ */
  group('snap: right-click model');

  t('snapMenuItems lists every kind with a label and a state', () => {
    const r = R(`${SETUP} return snapMenuItems();`);
    /* the mode set grows; what must hold is that every listed mode is
       complete and switched on after toggleSnap('all') */
    ok(r.length >= 14, 'expected the full AutoCAD mode set, got ' + r.length);
    for (const it of r) {
      ok(typeof it.kind === 'string' && it.kind.length, 'kind');
      ok(typeof it.label === 'string' && it.label.length, 'label for ' + it.kind);
      eq(it.on, true);
    }
    ok(r.some(i => i.kind === 'wcen'), 'wall centreline is in the menu');
    ok(r.some(i => i.kind === 'wface'), 'wall face is in the menu');
  });

  t('toggleSnap flips one kind and the engine stops offering it', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[200,0]});
      const on = toggleSnap('end');
      const _s = w2s([4, 4]);
      snapPoint(_s[0], _s[1], null);
      return { on, state: ST.osnapOn.end, k: ST.snap && ST.snap.k,
               kinds: (ST.snapCands||[]).map(c=>c.k) };`);
    eq(r.on, false); eq(r.state, 0);
    ok(!r.kinds.includes('end'), 'endpoint candidates must be gone');
    eq(r.k, 'near');
  });

  t('toggleSnap all / none set every kind at once', () => {
    const r = R(`${SETUP}
      toggleSnap('none');
      const off = snapMenuItems().filter(i => i.on).length;
      toggleSnap('all');
      const on = snapMenuItems().filter(i => i.on).length;
      return [off, on, toggleSnap('nonsense'), snapMenuItems().length];`);
    eq(r[0], 0); eq(r[1], r[3]); eq(r[2], false);
  });

  t('with every snap off the cursor is never pulled anywhere', () => {
    const r = R(`${SETUP}
      toggleSnap('none');
      addEnt({t:'line',a:[0,0],b:[200,0]});
      ${AT(4, 4)}`);
    eq(r.n, 0); pt(r, 4, 4);
  });

  /* ============================================================ */
  group('snap: robustness and speed');

  t('the returned point is exactly the reported snap point — never a near miss', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[200,0]});
      addEnt({t:'circle',c:[500,500],r:120});
      addEnt({t:'arc',c:[-400,300],r:250,a0:0,a1:Math.PI});
      addEnt({t:'wall',a:[0,-2000],b:[3000,-2000],wt:'brk230',just:'center',layer:'0'});
      let worst = 0, n = 0;
      for (let sx = 0; sx < 1200; sx += 7) for (let sy = 0; sy < 800; sy += 11) {
        const p = snapPoint(sx, sy, [50, 50]);
        if (!isFinite(p[0]) || !isFinite(p[1])) throw new Error('non-finite at ' + sx + ',' + sy);
        if (ST.snap) { worst = Math.max(worst, dist(p, ST.snap.p)); n++; }
      }
      return [worst, n];`);
    close(r[0], 0, 1e-12, 'snapPoint must return the snap point verbatim');
    ok(r[1] > 100, 'the sweep should have hit plenty of snaps');
  });

  t('a snap never lands outside the aperture', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[200,0]});
      addEnt({t:'circle',c:[500,500],r:120});
      let bad = null;
      for (let sx = 0; sx < 1200; sx += 13) for (let sy = 0; sy < 800; sy += 13) {
        const raw = s2w(sx, sy);
        snapPoint(sx, sy, null);
        if (!ST.snap) continue;
        if (dist(raw, ST.snap.p) <= px(14) + 1e-9) continue;
        /* The one sanctioned exception, and it is AutoCAD's: hovering a
           circle's rim offers its centre. There is nothing to hover at the
           centre of a big circle, so the reach is the whole point. */
        if (ST.snap.k === 'cen') continue;
        bad = [sx, sy, ST.snap.k];
      }
      return bad;`);
    eq(r, null, 'a snap outside the aperture is a jump');
  });

  t('degenerate geometry does not throw', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[100,100],b:[100,100]});
      addEnt({t:'circle',c:[100,100],r:0});
      addEnt({t:'pline',pts:[[100,100]],closed:false});
      addEnt({t:'wall',a:[100,100],b:[100,100],wt:'brk230',layer:'0'});
      const _s = w2s([100,100]);
      const p = snapPoint(_s[0], _s[1], [100,100]);
      return isFinite(p[0]) && isFinite(p[1]);`);
    eq(r, true);
  });

  t('4000 entities: snapPoint stays interactive', () => {
    const r = R(`${SETUP}
      for (let i = 0; i < 4000; i++) {
        const x = (i % 80) * 500, y = Math.floor(i / 80) * 500;
        addEnt({t:'line',a:[x,y],b:[x+400,y+300]});
      }
      query(0,0,1,1);
      const t0 = Date.now();
      for (let i = 0; i < 240; i++) snapPoint(300 + (i % 40), 400 + (i % 27), [0,0]);
      const ms = Date.now() - t0;
      return [ms, DOC.ents.size];`);
    eq(r[1], 4000);
    ok(r[0] < 900, '240 snaps over 4000 entities took ' + r[0] + 'ms');
    if (process.env.VERBOSE) console.log('      240 snaps / 4000 entities: ' + r[0] + 'ms');
  });

  t('a 5000-vertex polyline does not stall the intersection scan', () => {
    const r = R(`${SETUP}
      const pts = [];
      for (let i = 0; i < 5000; i++) pts.push([i * 2, Math.sin(i / 40) * 60]);
      addEnt({t:'pline',pts,closed:false});
      addEnt({t:'line',a:[600,-500],b:[600,500]});
      const t0 = Date.now();
      for (let i = 0; i < 40; i++) snapPoint(600 + (i % 5), 800 - (i % 5), null);
      return Date.now() - t0;`);
    ok(r < 900, '40 snaps against a 5000-vertex polyline took ' + r + 'ms');
  });

  /* ============================================================
     The arbitration rule itself.

     Everything above tests which point a given snap kind returns.
     This group pins the rule that decides WHICH KIND WINS, because
     that rule is a single constant (SNAP_BIAS_PX) and a single sort,
     and getting it wrong is invisible to every other test in this
     file while making the app feel broken in real use.

     The rule: score = distance − priority × (SNAP_BIAS_PX / maxPri).
     Distance decides; priority only buys a bounded head start.
     ============================================================ */
  group('snap: arbitration');

  /* The defect this rule replaced, measured from the real app: the cursor sat
     0.29px from an apparent intersection and 5.7px from an endpoint, and the
     endpoint won because it outranked. Points 20x further away must not win. */
  t('a candidate under the crosshair beats a higher-priority one across the box', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[100,0]});
      addEnt({t:'line',a:[0,-40],b:[0,40]});
      ${AT(0.3, 0.3)}`);
    eq(r.k, 'end', 'an endpoint at 0.42px should win outright');

    /* now push the endpoint out and put a nearest right under the cursor */
    const x = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[100,0]});
      ${AT(9, 0)}`);
    eq(x.k, 'near', 'a nearest at 0px beats an endpoint 9px away');
    pt(x, 9, 0);
  });

  /* The converse, and the reason this is not simply "closest wins": within the
     head start, priority still decides. An endpoint slightly further from the
     cursor than a nearest is still what the drafter meant. */
  t('priority still wins inside the head-start band', () => {
    const r = R(`${SETUP}
      addEnt({t:'line',a:[0,0],b:[100,0]});
      ${AT(3, 0)}`);
    eq(r.k, 'end', 'an endpoint 3px out beats the nearest directly under the cursor');
    pt(r, 0, 0);
  });

  /* The head start is bounded in SCREEN space, so it must survive zoom: the
     same world geometry at a different zoom must arbitrate the same way when
     the cursor is the same number of *pixels* from each candidate. */
  t('the head start is measured in screen px, not world units', () => {
    const at = z => R(`${SETUP}
      V.z = ${z};
      addEnt({t:'line',a:[0,0],b:[${100 / z},0]});
      const _s = w2s([0,0]); const _p = snapPoint(_s[0] + 3, _s[1], null);
      return { k: ST.snap && ST.snap.k, p: _p };`);
    eq(at(1).k, 'end');
    eq(at(4).k, 'end', 'zoomed in 4x, 3px from the endpoint still resolves to it');
    eq(at(0.25).k, 'end', 'zoomed out 4x, 3px from the endpoint still resolves to it');
  });

  group('Shift+letter temporary overrides');

  /* The letter table, the apply, the release and the save-and-restore were all
     written and then called from nowhere: holding Shift+E for an endpoint did
     nothing at all. These drive the key handler, not the functions, because
     the functions were never the part that was broken. */
  const KEY = (key, shift) => ({ key, shiftKey: shift !== false, ctrlKey: false,
                                 altKey: false, preventDefault() {}, stopPropagation() {} });
  const fireDown = (k) => window.__keydown && window.__keydown(KEY(k));
  const fireUp = (k) => window.__keyup && window.__keyup(KEY(k));

  t('Shift+E forces an endpoint snap while it is held', () => {
    const r = R(`${SETUP}
      addEnt({t:'line', a:[0,0], b:[4000,0], layer:'0'});
      const before = ST.osnapOne;
      const o = tempOverrideDown('e');
      const during = ST.osnapOne;
      tempOverrideUp('e');
      return { before, during, after: ST.osnapOne, label: o && o.label };`);
    eq(r.before, null, 'nothing is overridden to start with');
    eq(r.during, 'end', 'holding E forces endpoints');
    eq(r.label, 'Endpoint');
    eq(r.after, null, 'and letting go puts it back');
  });

  t('an override never leaves the drafting settings altered', () => {
    const r = R(`${SETUP}
      ST.polar = true; ST.ortho = false; ST.otrack = true; ST.snapgrid = false;
      const snap = () => [ST.polar, ST.ortho, ST.otrack, ST.snapgrid, ST.osnap].join(',');
      const before = snap();
      const seen = [];
      for (const k of ['e','m','c','d','a','s','x','z']) {
        tempOverrideDown(k);
        seen.push(k + ':' + snap());
        tempOverrideUp(k);
        if (snap() !== before) return { bad: k, before, after: snap() };
      }
      return { bad: null, before, after: snap(), seen: seen.length };`);
    eq(r.bad, null, 'holding ' + r.bad + ' left the settings at ' + r.after);
    eq(r.after, r.before, 'every override restores exactly what it found');
    eq(r.seen, 8, 'all eight letters were exercised');
  });

  t('a second letter while one is held is ignored, not stacked', () => {
    const r = R(`${SETUP}
      tempOverrideDown('e');
      const first = ST.osnapOne;
      const second = tempOverrideDown('m');
      const still = ST.osnapOne;
      tempOverrideUp('e');
      return { first, second, still, after: ST.osnapOne };`);
    eq(r.first, 'end');
    eq(r.second, null, 'the second key is refused');
    eq(r.still, 'end', 'and the first override still stands');
    eq(r.after, null);
  });

  t('releasing Shift ends the override even if the letter is still down', () => {
    const r = R(`${SETUP}
      tempOverrideDown('c');
      const during = ST.osnapOne;
      const ended = tempOverrideUp('Shift');
      return { during, ended, after: ST.osnapOne };`);
    eq(r.during, 'cen');
    eq(r.ended, true, 'Shift alone releases it');
    eq(r.after, null, 'the chord is gone either way');
  });

  t('D disables snapping and tracking together, then restores both', () => {
    const r = R(`${SETUP}
      ST.otrack = true; ST.polar = true; ST.snapgrid = true; ST.ortho = false;
      tempOverrideDown('d');
      const during = { snap: ST.osnapOne, otrack: ST.otrack, polar: ST.polar,
                       grid: ST.snapgrid };
      tempOverrideUp('d');
      return { during, after: { otrack: ST.otrack, polar: ST.polar,
                                grid: ST.snapgrid, snap: ST.osnapOne } };`);
    eq(r.during.snap, 'none', 'D means no snapping at all');
    eq(r.during.otrack, false); eq(r.during.polar, false); eq(r.during.grid, false);
    eq(r.after.otrack, true, 'and all of it comes back');
    eq(r.after.polar, true); eq(r.after.grid, true); eq(r.after.snap, null);
  });
};
