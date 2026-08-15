'use strict';
/* Walls: ortho and polar locks, placement/justification, corner solving,
   automatic cleanup, poche, grips and the wall utility commands.
   Corner geometry is asserted against exact coordinates, never "it ran". */

module.exports = ({ group, t, ok, eq, close, R }) => {

  /* every suite starts from a known input state: polar tracking is on by
     default and would otherwise quietly rotate the angled test points */
  const SETUP = `
    resetDoc();
    V.w=1200; V.h=800; V.z=0.1; V.px=100; V.py=700;
    ST.ortho=false; ST.polar=false; ST.osnap=false; ST.polarInc=45; ST.cur=null;
    ARCH.wt='gen100'; ARCH.jmode='centre'; ARCH.wallH=3000;
    SEL.clear(); HIST.past.length=0; HIST.future.length=0;
  `;
  const eqPt = (a, b, tol, m) => {
    close(a[0], b[0], tol == null ? 1e-9 : tol, (m || 'x'));
    close(a[1], b[1], tol == null ? 1e-9 : tol, (m || 'y'));
  };

  /* ============================================================ */
  group('walls: ortho and polar');

  t('ortho makes an angled wall impossible, even on an object snap', () => {
    const r = R(SETUP + `
      ST.ortho=true;
      /* something for an object snap to have landed on, three degrees off axis */
      addEnt({t:'line',a:[3000,157],b:[3000,900]});
      startCmd('wall');
      cmdPoint([0,0]);
      cmdPoint([3000,157]);
      endCmd(true); ST.ortho=false;
      const w=[...DOC.ents.values()].find(e=>e.t==='wall');
      return [w.a, w.b];`);
    eqPt(r[0], [0, 0]);
    eqPt(r[1], [3000, 0], 1e-9, 'the accepted point must be projected onto the axis');
  });

  t('ortho locks the axis the cursor is furthest along', () => {
    const r = R(SETUP + `
      ST.ortho=true;
      startCmd('wall'); cmdPoint([0,0]); cmdPoint([400,2500]);
      endCmd(true); ST.ortho=false;
      const w=[...DOC.ents.values()].find(e=>e.t==='wall');
      return w.b;`);
    eqPt(r, [0, 2500]);
  });

  t('a typed length under ortho runs along the lock, not the cursor', () => {
    const r = R(SETUP + `
      ST.ortho=true;
      startCmd('wall'); cmdPoint([0,0]);
      ST.cur=[2000,300];
      cmdText('5000');
      endCmd(true); ST.ortho=false;
      const w=[...DOC.ents.values()].find(e=>e.t==='wall');
      return [w.b, wallLen(w)];`);
    eqPt(r[0], [5000, 0]);
    close(r[1], 5000, 1e-9);
  });

  t('typed coordinates still override ortho', () => {
    const r = R(SETUP + `
      ST.ortho=true;
      startCmd('wall'); cmdPoint([0,0]);
      cmdText('@1000<30');
      endCmd(true); ST.ortho=false;
      const w=[...DOC.ents.values()].find(e=>e.t==='wall');
      return [w.b, deg(ang(w.a,w.b))];`);
    eqPt(r[0], [1000 * Math.cos(Math.PI / 6), 500], 1e-9);
    close(r[1], 30, 1e-9);
  });

  t('x,y entry is not mistaken for a length', () => {
    const r = R(SETUP + `
      startCmd('wall'); cmdPoint([0,0]);
      cmdText('1200,600');
      endCmd(true);
      const w=[...DOC.ents.values()].find(e=>e.t==='wall');
      return w.b;`);
    eqPt(r, [1200, 600]);
  });

  t('polar tracking snaps the accepted point onto the increment', () => {
    const r = R(SETUP + `
      ST.polar=true; ST.polarInc=45;
      startCmd('wall'); cmdPoint([0,0]); cmdPoint([1000,1010]);
      /* sample the tracking line while the command is still live — endCmd
         clears it, which is correct behaviour */
      const tracks = ST.tracks && ST.tracks.length;
      endCmd(true); ST.polar=false;
      const w=[...DOC.ents.values()].find(e=>e.t==='wall');
      return [w.b, deg(ang(w.a,w.b)), tracks];`);
    eqPt(r[0], [1005, 1005], 1e-9);
    close(r[1], 45, 1e-9);
    eq(r[2], 1, 'the polar tracking line should be published');
  });

  t('polar leaves a genuinely angled pick alone', () => {
    const r = R(SETUP + `
      ST.polar=true; ST.polarInc=45;
      startCmd('wall'); cmdPoint([0,0]); cmdPoint([1000,500]);
      endCmd(true); ST.polar=false;
      const w=[...DOC.ents.values()].find(e=>e.t==='wall');
      return w.b;`);
    eqPt(r, [1000, 500]);
  });

  /* ============================================================ */
  group('walls: placement and justification');

  t('centreline placement leaves the wall straddling the line', () => {
    const r = R(SETUP + `
      ARCH.jmode='centre';
      startCmd('wall'); cmdPoint([0,0]); cmdPoint([5000,0]); endCmd(true);
      const w=[...DOC.ents.values()].find(e=>e.t==='wall');
      return [w.just, wallFace(w,1).a[1], wallFace(w,-1).a[1]];`);
    eq(r[0], 'center');
    close(r[1], 50, 1e-9); close(r[2], -50, 1e-9);
  });

  t('inner face placement follows an anticlockwise chain', () => {
    const r = R(SETUP + `
      ARCH.jmode='inner';
      startCmd('wall');
      cmdPoint([0,0]); cmdPoint([6000,0]); cmdPoint([6000,4000]);
      endCmd(true);
      const ws=[...DOC.ents.values()].filter(e=>e.t==='wall');
      return {just:ws.map(w=>w.just), face:wallFace(ws[0],1).a[1], back:wallFace(ws[0],-1).a[1]};`);
    eq(r.just.join(','), 'left,left', 'anticlockwise encloses the left of every leg');
    close(r.face, 0, 1e-9, 'the inner face sits exactly on the drawn line');
    close(r.back, -100, 1e-9, 'the body grows away from the enclosure');
  });

  t('inner face flips for a clockwise chain, retrospectively', () => {
    const r = R(SETUP + `
      ARCH.jmode='inner';
      startCmd('wall');
      cmdPoint([0,0]); cmdPoint([6000,0]);
      const first=[...DOC.ents.values()].find(e=>e.t==='wall').just;
      cmdPoint([6000,-4000]);
      endCmd(true);
      const ws=[...DOC.ents.values()].filter(e=>e.t==='wall');
      return {first, after:ws.map(w=>w.just), face:wallFace(ws[0],-1).a[1], back:wallFace(ws[0],1).a[1]};`);
    eq(r.first, 'left', 'with one leg drawn the winding is still unknown');
    eq(r.after.join(','), 'right,right', 'the first wall is re-justified once the chain turns');
    close(r.face, 0, 1e-9, 'the inner face is still the drawn line');
    close(r.back, 100, 1e-9);
  });

  t('a room drawn clockwise on its inner face measures exactly right', () => {
    const r = R(SETUP + `
      ARCH.jmode='inner';
      startCmd('wall');
      cmdPoint([0,0]); cmdPoint([0,4000]); cmdPoint([6000,4000]); cmdPoint([6000,0]);
      cmdText('c');
      const ring=roomTrace([3000,2000], 0);
      return {n:[...DOC.ents.values()].length, area:ring&&polyArea(ring)};`);
    eq(r.n, 4, 'four walls');
    close(r.area, 6000 * 4000, 1e-6, 'inner faces enclose the drawn rectangle exactly');
  });

  t('the same room on its outer face loses one thickness each way', () => {
    const r = R(SETUP + `
      ARCH.jmode='outer';
      startCmd('wall');
      cmdPoint([0,0]); cmdPoint([0,4000]); cmdPoint([6000,4000]); cmdPoint([6000,0]);
      cmdText('c');
      const ring=roomTrace([3000,2000], 0);
      return ring && polyArea(ring);`);
    close(r, 5800 * 3800, 1e-6);
  });

  t('J cycles centreline, inner and outer and re-resolves the chain', () => {
    const r = R(SETUP + `
      ARCH.jmode='centre';
      startCmd('wall');
      cmdPoint([0,0]); cmdPoint([6000,0]); cmdPoint([6000,-4000]);
      const seen=[];
      for(let i=0;i<3;i++){
        cmdText('j');
        seen.push([CMD.jmode, [...DOC.ents.values()].filter(e=>e.t==='wall')[0].just]);
      }
      endCmd(true);
      return seen;`);
    eq(r[0][0], 'inner'); eq(r[0][1], 'right', 'inner of a clockwise ring is the right face');
    eq(r[1][0], 'outer'); eq(r[1][1], 'left');
    eq(r[2][0], 'centre'); eq(r[2][1], 'center');
  });

  /* ============================================================ */
  group('walls: corner joins');

  t('an L corner of two different thicknesses mitres both faces exactly', () => {
    const r = R(SETUP + `
      const a=addEnt({t:'wall',a:[0,0],b:[5000,0],th:200,layer:'A-WALL'});
      const b=addEnt({t:'wall',a:[5000,0],b:[5000,4000],th:100,layer:'A-WALL'});
      const EA=wallEndPoints(a,1), EB=wallEndPoints(b,0);
      return {outerA:EA.plus, innerA:EA.minus, innerB:EB.plus, outerB:EB.minus,
              capA:EA.capped, areaA:polyArea(wallOutline(a))};`);
    eqPt(r.outerA, [5050, -100], 1e-9, 'outer corner is the 200 wall face meeting the 100 wall face');
    eqPt(r.innerA, [4950, 100], 1e-9, 'inner corner');
    eqPt(r.innerB, [4950, 100], 1e-9, 'the second wall must land on the same inner corner');
    eqPt(r.outerB, [5050, -100], 1e-9, 'and the same outer corner');
    eq(r.capA, false);
    /* A mitred end turns the rectangle into a trapezoid: one face gains exactly
       what the other loses, so the area is the MEAN length times the thickness,
       not the outer length times the thickness. Here 5000 x 200. */
    close(r.areaA, 5000 * 200, 1e-6, 'mitre conserves area: mean length × thickness');
  });

  t('a continuous L chain has no gap and no overshoot', () => {
    const r = R(SETUP + `
      startCmd('wall');
      cmdPoint([0,0]); cmdPoint([5000,0]); cmdPoint([7000,4000]);
      endCmd(true);
      const [a,b]=[...DOC.ents.values()].filter(e=>e.t==='wall');
      const EA=wallEndPoints(a,1), EB=wallEndPoints(b,0);
      return {ap:EA.plus, am:EA.minus, bp:EB.plus, bm:EB.minus,
              shared:[EA.plus[0]===EB.minus[0] && EA.plus[1]===EB.minus[1],
                      EA.minus[0]===EB.plus[0] && EA.minus[1]===EB.plus[1]]};`);
    eq(r.shared[0], true, 'the outer corner must be one identical point, not two near ones');
    eq(r.shared[1], true, 'and so must the inner corner');
    /* 63.4349° leg: the mitre sits on the bisector at (t/2)/sin(half angle) */
    const half = (Math.PI - Math.atan2(4000, 2000)) / 2;
    close(Math.hypot(r.ap[0] - 5000, r.ap[1]), 50 / Math.sin(half), 1e-6);
    close(Math.hypot(r.am[0] - 5000, r.am[1]), 50 / Math.sin(half), 1e-6);
  });

  t('a very acute corner still closes on a single shared point', () => {
    const r = R(SETUP + `
      const a=addEnt({t:'wall',a:[0,0],b:[5000,0],wt:'gen100',layer:'A-WALL'});
      const th=rad(170);
      const b=addEnt({t:'wall',a:[5000,0],b:[5000+5000*Math.cos(th),5000*Math.sin(th)],
                      wt:'gen100',layer:'A-WALL'});
      const EA=wallEndPoints(a,1), EB=wallEndPoints(b,0);
      return {d1:dist(EA.plus,[5000,0]), d2:dist(EA.minus,[5000,0]),
              same1:dist(EA.plus,EB.minus), same2:dist(EA.minus,EB.plus)};`);
    close(r.d1, 50 / Math.sin(Math.PI / 36), 1e-6, 'exact 10° mitre, not a fudge');
    close(r.d2, 50 / Math.sin(Math.PI / 36), 1e-6);
    close(r.same1, 0, 0, 'both walls resolve the identical corner point');
    close(r.same2, 0, 0);
  });

  t('a spike is limited without opening a gap', () => {
    const r = R(SETUP + `
      const a=addEnt({t:'wall',a:[0,0],b:[5000,0],wt:'gen100',layer:'A-WALL'});
      const th=rad(178);
      const b=addEnt({t:'wall',a:[5000,0],b:[5000+5000*Math.cos(th),5000*Math.sin(th)],
                      wt:'gen100',layer:'A-WALL'});
      const EA=wallEndPoints(a,1), EB=wallEndPoints(b,0);
      return {unclamped:50/Math.sin(rad(1)), d:dist(EA.plus,[5000,0]),
              same:dist(EA.plus,EB.minus), faces:wallShapes(a).filter(s=>s.role==='face').length};`);
    ok(r.unclamped > 2800, 'a 2° corner really would spike');
    close(r.d, 1000, 1e-9, 'clamped to ten average thicknesses');
    close(r.same, 0, 0, 'the clamp is symmetric so the corner is still shut');
    ok(r.faces >= 1, 'the wall still draws');
  });

  t('a cross junction mitres all four quadrants', () => {
    const r = R(SETUP + `
      const mk=(x,y)=>addEnt({t:'wall',a:[0,0],b:[x,y],wt:'gen100',layer:'A-WALL'});
      const E=mk(4000,0), N=mk(0,4000), W=mk(-4000,0), S=mk(0,-4000);
      const g=w=>{const e=wallEndPoints(w,0); return [e.plus,e.minus,e.capped];};
      return {E:g(E), N:g(N), W:g(W), S:g(S), area:polyArea(wallOutline(E))};`);
    eqPt(r.E[0], [50, 50], 1e-9, 'east wall, north face');
    eqPt(r.E[1], [50, -50], 1e-9, 'east wall, south face');
    eqPt(r.N[0], [-50, 50], 1e-9);
    eqPt(r.N[1], [50, 50], 1e-9);
    eqPt(r.W[0], [-50, -50], 1e-9);
    eqPt(r.W[1], [-50, 50], 1e-9);
    eq(r.E[2], false, 'a cross must not cap the arms off square');
    close(r.area, 3950 * 100, 1e-6, 'the arm starts at the junction face');
  });

  t('a Y junction mitres each adjacent pair', () => {
    const r = R(SETUP + `
      const mk=d=>addEnt({t:'wall',a:[0,0],b:[4000*Math.cos(rad(d)),4000*Math.sin(rad(d))],
                          wt:'gen100',layer:'A-WALL'});
      const A=mk(90), B=mk(210), C=mk(330);
      const E=w=>wallEndPoints(w,0);
      return {ab:dist(E(A).plus,E(B).minus), bc:dist(E(B).plus,E(C).minus),
              ca:dist(E(C).plus,E(A).minus), r:dist(E(A).plus,[0,0]), capped:E(A).capped};`);
    close(r.ab, 0, 1e-9, 'A and B share their corner');
    close(r.bc, 0, 1e-9);
    close(r.ca, 0, 1e-9);
    close(r.r, 50 / Math.sin(Math.PI / 3), 1e-9, '120° apart: (t/2)/sin60');
    eq(r.capped, false);
  });

  t('a T built from three walls keeps the through faces continuous', () => {
    const r = R(SETUP + `
      const HL=addEnt({t:'wall',a:[0,0],b:[3000,0],wt:'gen100',layer:'A-WALL'});
      const HR=addEnt({t:'wall',a:[3000,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
      const S=addEnt({t:'wall',a:[3000,0],b:[3000,4000],wt:'gen100',layer:'A-WALL'});
      const L=wallEndPoints(HL,1), Rr=wallEndPoints(HR,0), St=wallEndPoints(S,0);
      return {Lp:L.plus, Lm:L.minus, Rp:Rr.plus, Rm:Rr.minus, Sp:St.plus, Sm:St.minus};`);
    eqPt(r.Lm, [2950, 50], 1e-9, 'left arm stops on the stem face');
    eqPt(r.Lp, [3000, -50], 1e-9, 'the through face carries straight on');
    eqPt(r.Rm, [3000, -50], 1e-9, 'and meets the right arm at the same point');
    eqPt(r.Rp, [3050, 50], 1e-9);
    eqPt(r.Sp, [2950, 50], 1e-9, 'the stem shares both corners');
    eqPt(r.Sm, [3050, 50], 1e-9);
  });

  t('T-junction and crossing face breaks still work', () => {
    const r = R(SETUP + `
      const host=addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
      const stem=addEnt({t:'wall',a:[3000,0],b:[3000,4000],wt:'gen100',layer:'A-WALL'});
      const cross=addEnt({t:'wall',a:[5000,-2000],b:[5000,2000],th:300,layer:'A-WALL'});
      return {t:wallBreaks(host,1), c:wallBreaks(host,-1),
              stemCap:wallEndPoints(stem,0).capped};`);
    eq(r.stemCap, false, 'the stem still butts the host');
    eq(r.t.length, 2, 'stem break plus crossing break on the upper face');
    eq(r.c.length, 1, 'only the crossing wall breaks the lower face');
    close(r.c[0][0], 4850, 1e-9); close(r.c[0][1], 5150, 1e-9);
  });

  /* ============================================================ */
  group('walls: automatic cleanup');

  t('a wall dropped near a node lands exactly on it', () => {
    const r = R(SETUP + `
      addEnt({t:'wall',a:[0,0],b:[5000,0],wt:'gen100',layer:'A-WALL'});
      startCmd('wall'); cmdPoint([5030,40]); cmdPoint([5000,4000]); endCmd(true);
      const w=[...DOC.ents.values()].filter(e=>e.t==='wall')[1];
      return {a:w.a, capped:wallEndPoints(w,0).capped};`);
    eqPt(r.a, [5000, 0], 1e-9, 'pulled onto the existing node');
    eq(r.capped, false, 'so the corner actually forms');
  });

  t('a wall dropped near a centreline lands on it and butts', () => {
    const r = R(SETUP + `
      addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
      startCmd('wall'); cmdPoint([3000,30]); cmdPoint([3000,4000]); endCmd(true);
      const w=[...DOC.ents.values()].filter(e=>e.t==='wall')[1];
      const E=wallEndPoints(w,0);
      return {a:w.a, capped:E.capped, y:[E.plus[1],E.minus[1]]};`);
    eqPt(r.a, [3000, 0], 1e-9);
    eq(r.capped, false, 'the stem butts the host face');
    close(Math.abs(r.y[0]), 50, 1e-9);
    close(Math.abs(r.y[1]), 50, 1e-9);
  });

  t('the cleanup tolerance scales with wall thickness', () => {
    const r = R(SETUP + `
      return [wallCleanTol(100), wallCleanTol(600), wallCleanTol(10),
              wallCleanPoint([5000,120],100,null,null)[1],
              wallCleanPoint([5000,120],600,null,null)[1]];`);
    close(r[0], 75); close(r[1], 450); close(r[2], 25, 1e-9, 'never below 25mm');
    /* with no walls in the drawing the point is returned untouched either way */
    close(r[3], 120); close(r[4], 120);
  });

  t('a far-away pick is left exactly where it was put', () => {
    const r = R(SETUP + `
      addEnt({t:'wall',a:[0,0],b:[5000,0],wt:'gen100',layer:'A-WALL'});
      startCmd('wall'); cmdPoint([5300,300]); cmdPoint([5300,4000]); endCmd(true);
      return [...DOC.ents.values()].filter(e=>e.t==='wall')[1].a;`);
    eqPt(r, [5300, 300]);
  });

  t('dragging a wall grip re-forms the join', () => {
    const r = R(SETUP + `
      const a=addEnt({t:'wall',a:[0,0],b:[5000,0],wt:'gen100',layer:'A-WALL'});
      const b=addEnt({t:'wall',a:[5400,600],b:[5400,4000],wt:'gen100',layer:'A-WALL'});
      const before=wallEndPoints(b,0).capped;
      begin(); applyGrip(b,'a',[5040,45]); commit('drag');
      return {before, a:b.a, capped:wallEndPoints(b,0).capped,
              corner:wallEndPoints(b,0).plus};`);
    eq(r.before, true, 'it started unjoined');
    eqPt(r.a, [5000, 0], 1e-9, 'the drag snapped onto the node');
    eq(r.capped, false, 'the join formed, so the end is no longer capped');
    /* Dragging only the start grip leaves the far end at (5400,4000), so the wall
       is now angled and the mitre is NOT at x=4950. Assert the property that
       actually matters: both walls' faces meet at one point. */
    const meet = R(SETUP + `
      const a=addEnt({t:'wall',a:[0,0],b:[5000,0],wt:'gen100',layer:'A-WALL'});
      const b=addEnt({t:'wall',a:[5400,600],b:[5400,4000],wt:'gen100',layer:'A-WALL'});
      begin(); applyGrip(b,'a',[5040,45]); commit('drag');
      const EA=wallEndPoints(a,1), EB=wallEndPoints(b,0);
      return {aPlus:EA.plus, aMinus:EA.minus, bPlus:EB.plus, bMinus:EB.minus};`);
    eqPt(meet.aMinus, meet.bPlus, 1e-6, 'wall A inner corner is wall B inner corner');
    eqPt(meet.aPlus, meet.bMinus, 1e-6, 'wall A outer corner is wall B outer corner');
  });

  t('ortho beats the cleanup snap', () => {
    const r = R(SETUP + `
      ST.ortho=true;
      addEnt({t:'wall',a:[0,0],b:[5000,0],wt:'gen100',layer:'A-WALL'});
      addEnt({t:'wall',a:[9000,40],b:[9000,4000],wt:'gen100',layer:'A-WALL'});
      startCmd('wall'); cmdPoint([9000,-3000]); cmdPoint([9010,45]);
      endCmd(true); ST.ortho=false;
      const w=[...DOC.ents.values()].filter(e=>e.t==='wall')[2];
      return {a:w.a, b:w.b};`);
    /* The nearby node sits at (9000,40) — directly on the ortho lock line — so
       taking it keeps the wall perfectly vertical AND forms the join. Ortho is
       not violated, so cleanup is allowed to win. What must never happen is an
       angled wall. */
    close(r.b[0] - r.a[0], 0, 1e-9, 'ortho on means a perfectly vertical wall');
    close(r.b[0], 9000, 1e-9);
  });

  t('ortho refuses a cleanup node that would angle the wall', () => {
    const r = R(SETUP + `
      ST.ortho=true;
      addEnt({t:'wall',a:[9040,40],b:[9040,4000],wt:'gen100',layer:'A-WALL'});
      startCmd('wall'); cmdPoint([9000,-3000]); cmdPoint([9010,45]);
      endCmd(true); ST.ortho=false;
      const w=[...DOC.ents.values()].filter(e=>e.t==='wall')[1];
      return {a:w.a, b:w.b};`);
    /* the node is 40mm off the lock line: snapping to it would tilt the wall,
       so ortho must win and the node must be ignored */
    close(r.b[0] - r.a[0], 0, 1e-9, 'an off-axis node must not tilt the wall');
    close(r.b[0], 9000, 1e-9);
  });

  /* ============================================================ */
  group('walls: poche and hatch');

  t('wallHatchOn honours the document flag and the per-wall override', () => {
    const r = R(SETUP + `
      const w=addEnt({t:'wall',a:[0,0],b:[1000,0],wt:'gen100',layer:'A-WALL'});
      const out=[DOC.wallHatch, wallHatchOn(w)];
      w.hatch=false; out.push(wallHatchOn(w));
      w.hatch=true;  out.push(wallHatchOn(w));
      w.hatch=null;  DOC.wallHatch=false; out.push(wallHatchOn(w));
      w.hatch=true;  out.push(wallHatchOn(w));
      DOC.wallHatch=true;
      return out;`);
    eq(r[0], true, 'DOC.wallHatch defaults to on');
    eq(r[1], true); eq(r[2], false); eq(r[3], true);
    eq(r[4], false, 'null means follow the document');
    eq(r[5], true, 'an explicit true overrides a document default of off');
  });

  t('wallShapes returns the poche outline first', () => {
    const r = R(SETUP + `
      const a=addEnt({t:'wall',a:[0,0],b:[5000,0],wt:'gen100',layer:'A-WALL'});
      addEnt({t:'wall',a:[5000,0],b:[5000,4000],wt:'gen100',layer:'A-WALL'});
      const s=wallShapes(a)[0];
      const o=wallOutline(a);
      return {role:s.role, closed:s.closed, hatch:s.hatch, n:s.pts.length,
              same:s.pts.every((p,i)=>p[0]===o[i][0]&&p[1]===o[i][1]),
              area:polyArea(s.pts)};`);
    eq(r.role, 'poche'); eq(r.closed, true); eq(r.hatch, true); eq(r.n, 4);
    eq(r.same, true, 'the poche must carry the joined outline, not the raw rectangle');
    /* trapezoid: mean length (5000) x thickness (100) — see the note above */
    close(r.area, 5000 * 100, 1e-6, 'mitred outline area');
  });

  /* ============================================================ */
  group('walls: grips');

  t('a face grip changes the thickness and pins the far face', () => {
    const r = R(SETUP + `
      const w=addEnt({t:'wall',a:[0,0],b:[1000,0],th:200,just:'center',layer:'A-WALL'});
      const gs=gripsOf(w).map(g=>g.k);
      const fL=gripsOf(w).find(g=>g.k==='fL').p;
      begin(); applyGrip(w,'fL',[500,300]); commit('thickness');
      return {gs, fL, t:wallT(w), left:wallFace(w,1).a[1], right:wallFace(w,-1).a[1],
              a:w.a, len:wallLen(w)};`);
    eq(r.gs.join(','), 'a,m,b,fL,fR', 'start, middle, end and one grip per face');
    eqPt(r.fL, [500, 100], 1e-9);
    close(r.t, 400, 1e-9, 'dragging the left face to +300 over a face at -100');
    close(r.left, 300, 1e-9, 'the dragged face follows the cursor');
    close(r.right, -100, 1e-9, 'the far face does not move');
    close(r.len, 1000, 1e-9, 'and the wall does not change length');
  });

  t('a face grip is idempotent and cannot invert the wall', () => {
    const r = R(SETUP + `
      const w=addEnt({t:'wall',a:[0,0],b:[1000,0],th:200,just:'center',layer:'A-WALL'});
      begin(); applyGrip(w,'fL',[500,300]); applyGrip(w,'fL',[500,300]); commit('x');
      const stable=[wallT(w), wallFace(w,-1).a[1]];
      applyGrip(w,'fR',[500,999]);
      return {stable, t:wallT(w)};`);
    close(r.stable[0], 400, 1e-9); close(r.stable[1], -100, 1e-9);
    ok(r.t >= 10, 'a face dragged through the other one clamps to a minimum, got ' + r.t);
  });

  t('stretching a wall from its start keeps openings where they are', () => {
    const r = R(SETUP + `
      const w=addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
      const d=addOpening('door',w,3000,'sgl900');
      const before=openFrame(d).c.slice();
      begin(); applyGrip(w,'a',[1000,0]); commit('stretch');
      const after=openFrame(d).c.slice();
      return {before, after, pos:d.pos, len:wallLen(w)};`);
    eqPt(r.before, [3000, 0], 1e-9);
    eqPt(r.after, [3000, 0], 1e-9, 'the door must not slide when the far end is stretched');
    close(r.pos, 2000, 1e-9, 'pos is measured from a, so it drops by the shift');
    close(r.len, 5000, 1e-9);
  });

  t('stretching from the end rotates the openings with the wall', () => {
    const r = R(SETUP + `
      const w=addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
      const d=addOpening('door',w,3000,'sgl900');
      begin(); applyGrip(w,'b',[0,6000]); commit('rotate');
      return {c:openFrame(d).c.slice(), pos:d.pos};`);
    close(r.pos, 3000, 1e-9, 'distance from the fixed end is unchanged');
    eqPt(r.c, [0, 3000], 1e-9);
  });

  t('moving a wall by its middle grip carries the openings', () => {
    const r = R(SETUP + `
      const w=addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
      const d=addOpening('door',w,3000,'sgl900');
      begin(); applyGrip(w,'m',[3000,1500]); commit('move');
      return [openFrame(d).c.slice(), d.pos];`);
    eqPt(r[0], [3000, 1500], 1e-9);
    close(r[1], 3000, 1e-9);
  });

  /* ============================================================ */
  group('walls: split and join commands');

  t('wallsplit asks for the split point when the click is at an end', () => {
    const r = R(SETUP + `
      const w=addEnt({t:'wall',a:[0,0],b:[8000,0],wt:'gen100',layer:'A-WALL'});
      startCmd('wallsplit');
      cmdPoint([5,0]);
      const after1=[...DOC.ents.values()].filter(e=>e.t==='wall').length;
      const picked=CMD.w && CMD.w.id===w.id;
      cmdPoint([3000,900]);
      const walls=[...DOC.ents.values()].filter(e=>e.t==='wall');
      const steps=HIST.past.length;
      endCmd(true);
      return {after1, picked, n:walls.length, a:walls[1].a, b:walls[0].b, steps, open:JN.on};`);
    eq(r.after1, 1, 'a click at the very end must not split');
    eq(r.picked, true, 'but it does choose the wall');
    eq(r.n, 2, 'the second click splits it');
    eqPt(r.a, [3000, 0], 1e-9, 'the point is projected onto the wall');
    eqPt(r.b, [3000, 0], 1e-9);
    eq(r.steps, 1, 'one undo step for the whole split');
    eq(r.open, false, 'no journal left open');
  });

  t('wallsplit still splits in one click when the click is sensible', () => {
    const r = R(SETUP + `
      const w=addEnt({t:'wall',a:[0,0],b:[8000,0],wt:'gen100',layer:'A-WALL'});
      const d=addOpening('door',w,6000,'sgl900');
      startCmd('wallsplit'); cmdPoint([4000,0]);
      const walls=[...DOC.ents.values()].filter(e=>e.t==='wall');
      endCmd(true);
      return {n:walls.length, host:d.host!==w.id, pos:d.pos, next:CMD?1:0};`);
    eq(r.n, 2); eq(r.host, true, 'the door moves to the new wall');
    close(r.pos, 2000, 1e-9);
  });

  t('Esc during a split leaves the drawing untouched', () => {
    const r = R(SETUP + `
      addEnt({t:'wall',a:[0,0],b:[8000,0],wt:'gen100',layer:'A-WALL'});
      startCmd('wallsplit'); cmdPoint([5,0]);
      endCmd();
      return {n:[...DOC.ents.values()].length, steps:HIST.past.length, open:JN.on, cmd:CMD};`);
    eq(r.n, 1); eq(r.steps, 0, 'nothing committed'); eq(r.open, false); eq(r.cmd, null);
  });

  t('walljoin solves the true corner of two picked walls', () => {
    const r = R(SETUP + `
      const A=addEnt({t:'wall',a:[0,0],b:[5000,0],wt:'gen100',layer:'A-WALL'});
      const B=addEnt({t:'wall',a:[4800,200],b:[4800,4000],wt:'gen100',layer:'A-WALL'});
      SEL.clear(); SEL.add(A.id);
      startCmd('walljoin');
      cmdPoint([4800,2000]);
      return {ab:A.b, ba:B.a, capped:wallEndPoints(A,1).capped, corner:wallEndPoints(A,1).minus};`);
    eqPt(r.ab, [4800, 0], 1e-9, 'the first wall trims back to the intersection');
    eqPt(r.ba, [4800, 0], 1e-9, 'the second extends down to it');
    eq(r.capped, false);
    eqPt(r.corner, [4750, 50], 1e-9, 'and the corner mitres');
  });

  t('walljoin cleans a whole selection onto solved intersections', () => {
    const r = R(SETUP + `
      const A=addEnt({t:'wall',a:[0,0],b:[5000,0],wt:'gen100',layer:'A-WALL'});
      const B=addEnt({t:'wall',a:[5060,60],b:[5060,4000],wt:'gen100',layer:'A-WALL'});
      SEL.clear(); SEL.add(A.id); SEL.add(B.id);
      startCmd('walljoin');
      return {ab:A.b, ba:B.a, steps:HIST.past.length, cmd:CMD};`);
    eqPt(r.ab, [5060, 0], 1e-9, 'exact intersection, not the midpoint of the gap');
    eqPt(r.ba, [5060, 0], 1e-9);
    eq(r.steps, 1);
    eq(r.cmd, null, 'the command finishes on its own');
  });

  t('walljoin keeps openings in place while it moves the ends', () => {
    const r = R(SETUP + `
      const A=addEnt({t:'wall',a:[0,0],b:[5000,0],wt:'gen100',layer:'A-WALL'});
      const B=addEnt({t:'wall',a:[4800,200],b:[4800,4000],wt:'gen100',layer:'A-WALL'});
      const d=addOpening('door',B,2000,'sgl900');
      const before=openFrame(d).c.slice();
      SEL.clear(); SEL.add(A.id);
      startCmd('walljoin'); cmdPoint([4800,2000]);
      return {before, after:openFrame(d).c.slice()};`);
    eqPt(r.before, [4800, 2200], 1e-9);
    eqPt(r.after, [4800, 2200], 1e-9, 'the door does not slide when a is extended');
  });
};
