#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path');
const { loadApp } = require('./load.js');
const { runSuites } = require('./extra.js');

let pass = 0, fail = 0, only = process.argv[2];
const groupsSeen = [];
function group(n) { if (!groupsSeen.includes(n)) { groupsSeen.push(n); console.log('\n\x1b[1m' + n + '\x1b[0m'); } }
function t(name, fn) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) return;
  try { fn(); pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  catch (e) { fail++; console.log('  \x1b[31m✗ ' + name + '\x1b[0m\n      ' + (e && e.message ? e.message : e)); }
}
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || 'not equal') + `: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
function close(a, b, tol, m) { if (!(Math.abs(a - b) <= (tol == null ? 1e-6 : tol))) throw new Error((m || 'not close') + `: got ${a}, want ${b}`); }

const { run, bootApp } = loadApp();
const R = code => run(code);

/* ============================================================ */
group('units and coordinate entry');
t('millimetre round trip', () => {
  eq(R(`return parseLen('250')`), 250);
  eq(R(`DOC.units='m'; const v=parseLen('2.5'); DOC.units='mm'; return v`), 2500);
});
t('imperial feet-inches parse', () => {
  close(R(`return parseLen("4'-6\\"")`), 4 * 12 * 25.4 + 6 * 25.4, 1e-9);
  close(R(`return parseLen("4'-6 1/2\\"")`), (54.5) * 25.4, 1e-9);
  close(R(`return parseLen('2.5m')`), 2500);
  close(R(`return parseLen('12in')`), 304.8);
});
t('feet-inch formatting is reversible', () => {
  const v = R(`DOC.units='ft'; const s=fmt(1234.4); const back=parseLen(s); DOC.units='mm'; return [s,back]`);
  close(v[1], 1234.4, 1.6, 'ft format ' + v[0]);
});
t('negative feet formatting keeps the sign', () => {
  eq(R(`DOC.units='ft'; const s=fmt(-304.8); DOC.units='mm'; return s`), `-1'-0"`);
});
t('absolute, relative and polar coordinates', () => {
  const a = R(`return parseCoord('1200,600', null, null)`);
  eq(a[0], 1200); eq(a[1], 600);
  const b = R(`return parseCoord('@0,-450', [100,100], null)`);
  eq(b[0], 100); eq(b[1], -350);
  const c = R(`return parseCoord('@800<30', [0,0], null)`);
  close(c[0], 800 * Math.cos(Math.PI / 6), 1e-9); close(c[1], 400, 1e-9);
});

/* ============================================================ */
group('geometry solvers');
t('line/line and line/circle intersection', () => {
  const n = R(`return intersect({t:'line',a:[0,0],b:[10,0]},{t:'line',a:[5,-5],b:[5,5]},false).length`);
  eq(n, 1);
  const c = R(`return intersect({t:'line',a:[-10,0],b:[10,0]},{t:'circle',c:[0,0],r:5},false).length`);
  eq(c, 2);
});
t('trim removes only the clicked piece', () => {
  const r = R(`
    const e={t:'line',a:[0,0],b:[100,0],id:1};
    const cut={t:'line',a:[50,-10],b:[50,10],id:2};
    const parts=trimAt(e,[25,0],[cut]);
    return parts.map(p=>[p.a[0],p.b[0]]);`);
  eq(r.length, 1); close(r[0][0], 50); close(r[0][1], 100);
});
t('trim between two cutters keeps both ends', () => {
  const r = R(`
    const e={t:'line',a:[0,0],b:[100,0],id:1};
    const c1={t:'line',a:[30,-9],b:[30,9],id:2}, c2={t:'line',a:[70,-9],b:[70,9],id:3};
    return trimAt(e,[50,0],[c1,c2]).map(p=>[p.a[0],p.b[0]]);`);
  eq(r.length, 2); close(r[0][1], 30); close(r[1][0], 70);
});
t('extend reaches the boundary', () => {
  const r = R(`
    const e={t:'line',a:[0,0],b:[50,0],id:1};
    const b={t:'line',a:[80,-10],b:[80,10],id:2};
    const n=extendTo(e,[49,0],[b]); return n && n.b[0];`);
  close(r, 80);
});
t('fillet of two lines is tangent to both', () => {
  const r = R(`
    const l1={t:'line',a:[0,0],b:[100,0]}, l2={t:'line',a:[0,0],b:[0,100]};
    const f=filletCurves(l1,[50,0],l2,[0,50],20);
    if(!f) return null;
    return [f.arc.r, segDist(f.arc.c,l1.a,l1.b), segDist(f.arc.c,l2.a,l2.b), f.t1, f.t2];`);
  ok(r, 'no fillet found');
  close(r[0], 20); close(r[1], 20, 1e-6, 'distance to line 1');
  close(r[2], 20, 1e-6, 'distance to line 2');
});
t('fillet works between a line and an arc', () => {
  const r = R(`
    const l={t:'line',a:[-100,0],b:[100,0]};
    const a={t:'arc',c:[0,50],r:40,a0:0,a1:Math.PI*2-1e-9};
    const f=filletCurves(l,[30,0],a,[30,20],10);
    if(!f) return null;
    return [Math.abs(f.arc.c[1])-10, Math.abs(dist(f.arc.c,a.c)-a.r)-10];`);
  ok(r, 'no line/arc fillet found');
  close(r[0], 0, 1e-6, 'tangent to the line');
  close(r[1], 0, 1e-6, 'tangent to the arc');
});
t('offset of a closed polyline stays closed', () => {
  const r = R(`
    const e={t:'pline',pts:[[0,0],[100,0],[100,100],[0,100]],closed:true};
    const n=offsetEnt(e,10,1);
    return n && [n.pts.length, n.closed===true, polyArea(n.pts)];`);
  ok(r); eq(r[0], 4); eq(r[1], true);
});
t('polygon inscribed vs circumscribed radius', () => {
  const r = R(`
    const i=polyGon([0,0],100,6,0,true), c=polyGon([0,0],100,6,0,false);
    return [dist([0,0],i.pts[0]), dist([0,0],c.pts[0])];`);
  close(r[0], 100); ok(r[1] > 100, 'circumscribed should be larger');
});
t('NURBS evaluation honours the knot vector', () => {
  const r = R(`
    const cp=[[0,0],[50,100],[100,0]];
    const knots=[0,0,0,1,1,1];
    const pts=nurbs(cp,2,knots,null,false);
    return [pts.length, pts[0], pts[pts.length-1]];`);
  ok(r[0] > 10);
  close(r[1][0], 0, 1e-6); close(r[2][0], 100, 1e-3);
});

/* ============================================================ */
group('history — journalled undo/redo');
const HISTORY_SETUP = `
  resetDoc();
  const sig = () => JSON.stringify([...DOC.ents.values()].sort((a,b)=>a.id-b.id))
    + '|' + JSON.stringify(DOC.layers) + '|' + DOC.cur + '|' + UID;
`;
t('undo and redo reproduce every intermediate state', () => {
  const r = R(HISTORY_SETUP + `
    const sigs=[sig()];
    let rnd=12345; const rand=()=>((rnd=(rnd*1103515245+12345)&0x7fffffff)/0x7fffffff);
    for(let i=0;i<60;i++){
      begin();
      const k=Math.floor(rand()*6);
      const list=[...DOC.ents.values()];
      if(k===0||!list.length) addEnt({t:'line',a:[rand()*100,rand()*100],b:[rand()*100,rand()*100]});
      else if(k===1) addEnt({t:'circle',c:[rand()*100,rand()*100],r:1+rand()*20});
      else if(k===2){ const e=list[Math.floor(rand()*list.length)]; xf(e,T.move([rand()*10,rand()*10])); }
      else if(k===3){ const e=list[Math.floor(rand()*list.length)]; mut(e); e.layer=DOC.layers[Math.floor(rand()*DOC.layers.length)].name; }
      else if(k===4){ const e=list[Math.floor(rand()*list.length)]; delEnt(e.id); }
      else { touchLayers(); DOC.layers.push(newLayer('L'+i,'#ffffff')); }
      commit('op'+i);
      sigs.push(sig());
    }
    const steps=HIST.past.length;
    const errs=[];
    for(let i=steps;i>0;i--){ undo(); if(sig()!==sigs[i-1]) errs.push('undo to '+(i-1)); }
    for(let i=0;i<steps;i++){ redo(); if(sig()!==sigs[i+1]) errs.push('redo to '+(i+1)); }
    return {steps, errs:errs.slice(0,4), finalMatch: sig()===sigs[sigs.length-1]};`);
  ok(r.steps > 40, 'expected plenty of undo steps, got ' + r.steps);
  eq(r.errs.length, 0, 'state mismatches: ' + r.errs.join(', '));
  eq(r.finalMatch, true, 'final state after redoing everything');
});
t('a patch stores only what changed, not the whole document', () => {
  const r = R(`
    resetDoc();
    for(let i=0;i<4000;i++) addEnt({t:'line',a:[i,0],b:[i,10]});
    HIST.past.length=0;
    begin();
    const e=[...DOC.ents.values()][10];
    xf(e,T.move([5,5]));
    commit('one move');
    const p=HIST.past[HIST.past.length-1];
    return {chg:p.chg.length, add:p.add.length, del:p.del.length,
            bytes:JSON.stringify(p).length, docBytes:JSON.stringify([...DOC.ents.values()]).length};`);
  eq(r.chg, 1, 'exactly one entity changed');
  eq(r.add, 0); eq(r.del, 0);
  ok(r.bytes < r.docBytes / 100,
    `patch is ${r.bytes} bytes against a ${r.docBytes} byte document — should be far smaller`);
});
t('adding then deleting inside one operation is a no-op', () => {
  const r = R(`
    resetDoc(); HIST.past.length=0;
    begin(); const e=addEnt({t:'line',a:[0,0],b:[1,1]}); delEnt(e.id); commit('x');
    return {steps:HIST.past.length, ents:DOC.ents.size};`);
  eq(r.ents, 0);
});
t('rollback abandons an in-flight edit', () => {
  const r = R(`
    resetDoc();
    const e=addEnt({t:'circle',c:[0,0],r:10});
    HIST.past.length=0;
    begin(); mut(e); e.r=999; addEnt({t:'line',a:[0,0],b:[1,1]}); rollback();
    return [DOC.ents.get(e.id).r, DOC.ents.size];`);
  eq(r[0], 10, 'radius restored'); eq(r[1], 1, 'added entity removed');
});
t('undo restores a deleted wall together with its openings', () => {
  const r = R(`
    resetDoc();
    const w=addEnt({t:'wall',a:[0,0],b:[5000,0],wt:'brk230',layer:'A-WALL'});
    const d=addOpening('door',w,2000,'sgl900');
    HIST.past.length=0;
    begin(); delWallCascade(w.id); commit('erase');
    const gone=DOC.ents.size;
    undo();
    return {gone, back:DOC.ents.size, hostOk: !!hostOf(DOC.ents.get(d.id))};`);
  eq(r.gone, 0, 'wall and door both removed');
  eq(r.back, 2, 'both come back');
  eq(r.hostOk, true, 'the door is hosted again');
});

/* ============================================================ */
group('spatial index');
t('agrees with brute force on a normal drawing', () => {
  const r = R(`
    resetDoc();
    let rnd=7; const rand=()=>((rnd=(rnd*1103515245+12345)&0x7fffffff)/0x7fffffff);
    for(let i=0;i<1500;i++){ const x=rand()*10000,y=rand()*10000; addEnt({t:'line',a:[x,y],b:[x+rand()*200,y+rand()*200]}); }
    const box=[3000,3000,4200,4200];
    const fast=new Set(query(...box).map(e=>e.id));
    let missed=0;
    for(const e of DOC.ents.values()){
      const b=bbox(e);
      if(bboxHit(b,...box) && !fast.has(e.id)) missed++;
    }
    return {missed, returned:fast.size, total:DOC.ents.size};`);
  eq(r.missed, 0, 'index dropped entities the box overlaps');
  ok(r.returned < r.total, 'index should narrow the candidate set');
});
t('one far-away entity no longer collapses the grid', () => {
  const r = R(`
    resetDoc();
    for(let i=0;i<1200;i++) addEnt({t:'line',a:[i%40*10,Math.floor(i/40)*10],b:[i%40*10+8,Math.floor(i/40)*10+8]});
    addEnt({t:'point',p:[5e8,5e8]});
    const got=query(0,0,20,20);
    return {returned:got.length, total:DOC.ents.size};`);
  ok(r.returned < r.total * 0.2,
    `query returned ${r.returned} of ${r.total} — the outlier is still collapsing the grid`);
});
t('index stays correct across add, move and delete', () => {
  const r = R(`
    resetDoc();
    for(let i=0;i<600;i++) addEnt({t:'circle',c:[i*10,0],r:3});
    query(0,0,10,10);
    const e=addEnt({t:'circle',c:[99999,99999],r:5});
    const found1=query(99990,99990,100010,100010).some(x=>x.id===e.id);
    mut(e); e.c=[0,0]; idxFlush();
    const found2=query(-10,-10,10,10).some(x=>x.id===e.id);
    const stale=query(99990,99990,100010,100010).some(x=>x.id===e.id);
    delEnt(e.id);
    const gone=!query(-10,-10,10,10).some(x=>x.id===e.id);
    return {found1,found2,stale,gone};`);
  eq(r.found1, true, 'newly added entity is indexed');
  eq(r.found2, true, 'moved entity found at its new home');
  eq(r.stale, false, 'moved entity no longer at its old home');
  eq(r.gone, true, 'deleted entity is out of the index');
});

/* ============================================================ */
group('walls');
t('an L corner mitres both faces', () => {
  const r = R(`
    resetDoc();
    const a=addEnt({t:'wall',a:[0,0],b:[5000,0],wt:'gen100',layer:'A-WALL'});
    const b=addEnt({t:'wall',a:[5000,0],b:[5000,4000],wt:'gen100',layer:'A-WALL'});
    const E=wallEndPoints(a,1);
    const out=wallOutline(a);
    /* outline is [leftStart, leftEnd, rightEnd, rightStart] */
    return {capped:E.capped, leftEnd:out[1], rightEnd:out[2], area:polyArea(out)};`);
  eq(r.capped, false, 'a mitred end should not be capped');
  /* thickness 100: inner corner pulls back to 4950, outer runs out to 5050 */
  close(r.leftEnd[0], 4950, 1e-6, 'inner face mitres back');
  close(r.leftEnd[1], 50, 1e-6);
  close(r.rightEnd[0], 5050, 1e-6, 'outer face mitres forward');
  close(r.rightEnd[1], -50, 1e-6);
  close(r.area, 5000 * 100, 1e-6, 'mitre keeps the plan area honest');
});

t('a straight run through a shared node leaves the faces continuous', () => {
  const r = R(`
    resetDoc();
    const a=addEnt({t:'wall',a:[0,0],b:[3000,0],wt:'gen100',layer:'A-WALL'});
    const b=addEnt({t:'wall',a:[3000,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
    const out=wallOutline(a);
    return {leftEnd:out[1], rightEnd:out[2], capped:wallEndPoints(a,1).capped};`);
  close(r.leftEnd[1], 50, 1e-6, 'left face stays at +t/2');
  close(r.rightEnd[1], -50, 1e-6, 'right face stays at -t/2');
  close(r.leftEnd[0], 3000, 1e-6, 'no overshoot at a straight join');
  eq(r.capped, false);
});

t('a T-junction butts the stem and breaks the host face', () => {
  const r = R(`
    resetDoc();
    const host=addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
    const stem=addEnt({t:'wall',a:[3000,0],b:[3000,4000],wt:'gen100',layer:'A-WALL'});
    const E=wallEndPoints(stem,0);
    const breaks=wallBreaks(host,1);
    const faces=wallShapes(host).filter(s=>s.role==='face');
    return {stemY:[E.plus[1],E.minus[1]], capped:E.capped, breaks, leftFaceSegs:faces.length};`);
  eq(r.capped, false, 'the stem should butt, not cap');
  close(Math.abs(r.stemY[0]), 50, 1e-6, 'stem trimmed back to the host face');
  eq(r.breaks.length, 1, 'host face gets exactly one break');
  close(r.breaks[0][0], 2950, 1e-6); close(r.breaks[0][1], 3050, 1e-6);
  ok(r.leftFaceSegs >= 3, 'host should be split into extra face runs, got ' + r.leftFaceSegs);
});
t('justification shifts the faces the right way', () => {
  const r = R(`
    resetDoc();
    const w=addEnt({t:'wall',a:[0,0],b:[1000,0],th:200,just:'left',layer:'A-WALL'});
    const L=wallFace(w,1), Rf=wallFace(w,-1);
    mut(w); w.just='right';
    const L2=wallFace(w,1), R2=wallFace(w,-1);
    return [L.a[1],Rf.a[1],L2.a[1],R2.a[1]];`);
  close(r[0], 0); close(r[1], -200);
  close(r[2], 200); close(r[3], 0);
});
t('an opening cuts the wall face and adds jambs', () => {
  const r = R(`
    resetDoc();
    const w=addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
    const before=wallShapes(w);
    addOpening('door',w,3000,'sgl900');
    const after=wallShapes(w);
    const count=k=>after.filter(s=>s.role===k).length;
    return {beforeFaces:before.filter(s=>s.role==='face').length,
            afterFaces:count('face'), jambs:count('jamb')};`);
  eq(r.beforeFaces, 2, 'a plain wall has two face runs');
  eq(r.afterFaces, 4, 'a door splits each face into two');
  eq(r.jambs, 2, 'two jamb lines');
});
t('moving a wall carries its openings', () => {
  const r = R(`
    resetDoc();
    const w=addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
    const d=addOpening('door',w,3000,'sgl900');
    const c0=openFrame(d).c.slice();
    xf(w,T.move([1000,500]));
    const c1=openFrame(d).c.slice();
    return [c1[0]-c0[0], c1[1]-c0[1], d.pos];`);
  close(r[0], 1000, 1e-6); close(r[1], 500, 1e-6);
  close(r[2], 3000, 1e-6, 'position along the wall is unchanged');
});
t('shortening a wall pulls its opening back inside', () => {
  const r = R(`
    resetDoc();
    const w=addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
    const d=addOpening('door',w,5000,'sgl900');
    mut(w); w.b=[3000,0]; wallReclampOpenings(w);
    return [d.pos, wallLen(w), openW(d)];`);
  ok(r[0] + r[2] / 2 <= r[1] + 1e-6, `door runs past the end: pos ${r[0]} width ${r[2]} wall ${r[1]}`);
});
t('splitting a wall re-homes the openings past the cut', () => {
  const r = R(`
    resetDoc();
    const w=addEnt({t:'wall',a:[0,0],b:[8000,0],wt:'gen100',layer:'A-WALL'});
    const d1=addOpening('door',w,1000,'sgl900');
    const d2=addOpening('door',w,6000,'sgl900');
    const cmd={};
    CMDS.wallsplit.point(cmd,[4000,0]);
    return {d1host:d1.host===w.id, d2moved:d2.host!==w.id, d2pos:d2.pos, walls:[...DOC.ents.values()].filter(e=>e.t==='wall').length};`);
  eq(r.walls, 2, 'wall becomes two');
  eq(r.d1host, true, 'first door stays put');
  eq(r.d2moved, true, 'second door moves to the new wall');
  close(r.d2pos, 2000, 1e-6);
});
t('erasing a wall takes its openings with it', () => {
  const r = R(`
    resetDoc();
    const w=addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
    addOpening('door',w,2000,'sgl900'); addOpening('window',w,4000,'w1212');
    delWallCascade(w.id);
    return DOC.ents.size;`);
  eq(r, 0);
});
t('wall type change updates the drawn thickness', () => {
  const r = R(`
    resetDoc();
    const w=addEnt({t:'wall',a:[0,0],b:[1000,0],wt:'part90',layer:'A-WALL'});
    const t1=wallT(w);
    mut(w); w.wt='cav300'; w.th=null;
    return [t1, wallT(w), polyArea(wallOutline(w))];`);
  eq(r[0], 90); eq(r[1], 300);
  close(r[2], 1000 * 300, 1e-6);
});

group('other components');
t('door swing arc spans the leaf width', () => {
  const r = R(`
    resetDoc();
    const w=addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
    const d=addOpening('door',w,3000,'sgl900');
    const sh=doorShapes(d);
    const arc=sh.find(s=>s.role==='swing');
    return arc && [arc.r, Math.abs(wrap(arc.a1-arc.a0))];`);
  ok(r, 'no swing arc'); close(r[0], 900, 1e-6);
  close(r[1], Math.PI / 2, 1e-6, 'default swing is 90°');
});
t('window glazing sits inside the wall faces', () => {
  const r = R(`
    resetDoc();
    const w=addEnt({t:'wall',a:[0,0],b:[6000,0],th:300,layer:'A-WALL'});
    const n=addOpening('window',w,3000,'w1212');
    const g=windowShapes(n).filter(s=>s.role==='glaz');
    return g.map(s=>s.pts[0][1]);`);
  ok(r.length >= 2);
  for (const y of r) ok(Math.abs(y) < 150, 'glazing at ' + y + ' is outside the wall');
});
t('stair riser and going arithmetic', () => {
  const r = R(`
    resetDoc();
    const s=addEnt({t:'stair',a:[0,0],b:[3000,0],w:1000,risers:16,rise:187,layer:'A-FLOR-STRS'});
    const C=stairCalc(s);
    return [C.risers,C.treads,C.tread,C.run];`);
  eq(r[0], 16); eq(r[1], 15); close(r[2], 200); close(r[3], 3000);
});
t('room area and centroid', () => {
  const r = R(`
    resetDoc();
    const rm=addEnt({t:'room',pts:[[0,0],[4000,0],[4000,3000],[0,3000]],name:'TEST',layer:'A-AREA'});
    return [entArea(rm), roomCentroid(rm)];`);
  close(r[0], 12e6); close(r[1][0], 2000, 1e-6); close(r[1][1], 1500, 1e-6);
});
t('room auto-trace finds the space inside four walls', () => {
  const r = R(`
    resetDoc();
    const c=[[0,0],[6000,0],[6000,4000],[0,4000]];
    for(let i=0;i<4;i++) addEnt({t:'wall',a:c[i],b:c[(i+1)%4],wt:'gen100',layer:'A-WALL'});
    const ring=roomTrace([3000,2000], 0);
    return ring && [polyArea(ring), ring.length];`);
  ok(r, 'no room traced');
  close(r[0], 5900 * 3900, 1, 'inner face area');
});
t('column area for both shapes', () => {
  const r = R(`
    resetDoc();
    const a=addEnt({t:'column',p:[0,0],w:400,d:300,shape:'rect',layer:'A-COLS'});
    const b=addEnt({t:'column',p:[0,0],w:400,shape:'round',layer:'A-COLS'});
    return [entArea(a),entArea(b)];`);
  close(r[0], 120000); close(r[1], Math.PI * 200 * 200, 1e-6);
});

/* ============================================================ */
group('commands smoke test');
t('every command starts and cancels without throwing', () => {
  const r = R(`
    resetDoc();
    addEnt({t:'line',a:[0,0],b:[1000,0]});
    addEnt({t:'circle',c:[500,500],r:200});
    addEnt({t:'wall',a:[0,2000],b:[4000,2000],wt:'gen100',layer:'A-WALL'});
    const bad=[];
    for(const k of Object.keys(CMDS)){
      try{
        SEL.clear();
        for(const e of DOC.ents.values()) SEL.add(e.id);
        startCmd(k);
        if(CMD && CMD.phase==='run'){
          if(CMD.def.preview) CMD.def.preview(CMD,[100,100]);
        }
        endCmd(true);
      }catch(e){ bad.push(k+': '+e.message); }
    }
    return bad;`);
  eq(r.length, 0, 'commands threw: ' + r.slice(0, 6).join(' | '));
});
t('drawing commands actually create entities', () => {
  const r = R(`
    resetDoc();
    const out={};
    const seq=[
      ['line',[[0,0],[1000,0]]],
      ['pline',[[0,0],[500,0],[500,500]]],
      ['rect',[[0,0],[800,600]]],
      ['circle',[[0,0],[300,0]]],
      ['arc',[[0,0],[100,100],[200,0]]],
      ['ellipse',[[0,0],[400,0],[0,200]]],
      ['polygon',[[0,0],[300,0]]],
      ['point',[[10,10]]],
      ['donut',null],
      ['xline',[[0,0],[100,100]]],
      ['spline',[[0,0],[100,200],[300,0],[500,300]]],
    ];
    for(const [k,pts] of seq){
      resetDoc();
      startCmd(k);
      if(k==='donut'){ cmdText('100'); cmdText('200'); cmdPoint([0,0]); }
      else { for(const p of pts) cmdPoint(p); }
      if(CMD && CMD.def.enter) cmdEnter(); else endCmd(true);
      out[k]=DOC.ents.size;
    }
    return out;`);
  for (const k in r) ok(r[k] > 0, k + ' created nothing');
});
t('modify commands change the drawing', () => {
  const r = R(`
    resetDoc();
    const e=addEnt({t:'line',a:[0,0],b:[1000,0]});
    SEL.clear(); SEL.add(e.id);
    startCmd('move'); cmdPoint([0,0]); cmdPoint([500,300]);
    const moved=[e.a[0],e.a[1]];
    SEL.clear(); SEL.add(e.id);
    startCmd('copy'); cmdPoint([0,0]); cmdPoint([0,1000]); endCmd(true);
    const afterCopy=DOC.ents.size;
    SEL.clear(); SEL.add(e.id);
    startCmd('rotate'); cmdPoint([500,300]); cmdText('90');
    const rotated=Math.abs(dist(e.a,e.b)-1000)<1e-6;
    return {moved, afterCopy, rotated};`);
  close(r.moved[0], 500); close(r.moved[1], 300);
  eq(r.afterCopy, 2); eq(r.rotated, true, 'rotate must preserve length');
});
t('scale keeps proportions and honours a typed factor', () => {
  const r = R(`
    resetDoc();
    const e=addEnt({t:'circle',c:[100,0],r:50});
    SEL.clear(); SEL.add(e.id);
    startCmd('scale'); cmdPoint([0,0]); cmdText('2');
    return [e.r, e.c[0]];`);
  close(r[0], 100); close(r[1], 200);
});
t('stretch moves only the grips inside the crossing box', () => {
  const r = R(`
    resetDoc();
    const e=addEnt({t:'line',a:[0,0],b:[1000,0]});
    SEL.clear(); SEL.add(e.id);
    ST.lastBand=[900,-50,1100,50];
    startCmd('stretch'); cmdPoint([1000,0]); cmdPoint([1000,400]);
    return [e.a,e.b];`);
  close(r[0][1], 0, 1e-6, 'start point must not move');
  close(r[1][1], 400, 1e-6, 'end point moves');
});
t('align moves and rotates onto the destination', () => {
  const r = R(`
    resetDoc();
    const e=addEnt({t:'line',a:[0,0],b:[100,0]});
    SEL.clear(); SEL.add(e.id);
    startCmd('align');
    cmdPoint([0,0]); cmdPoint([500,500]); cmdPoint([100,0]); cmdPoint([500,600]);
    return [e.a,e.b];`);
  close(r[0][0], 500, 1e-6); close(r[0][1], 500, 1e-6);
  close(r[1][0], 500, 1e-6); close(r[1][1], 600, 1e-6);
});
t('join links segments into one polyline', () => {
  const r = R(`
    resetDoc();
    addEnt({t:'line',a:[0,0],b:[100,0]});
    addEnt({t:'line',a:[100,0],b:[100,100]});
    addEnt({t:'line',a:[100,100],b:[0,100]});
    SEL.clear(); for(const e of DOC.ents.values()) SEL.add(e.id);
    startCmd('join');
    const pls=[...DOC.ents.values()].filter(e=>e.t==='pline');
    return [DOC.ents.size, pls.length, pls[0] && pls[0].pts.length];`);
  eq(r[0], 1); eq(r[1], 1); eq(r[2], 4);
});
t('explode turns a wall into plain geometry', () => {
  const r = R(`
    resetDoc();
    const w=addEnt({t:'wall',a:[0,0],b:[4000,0],wt:'gen100',layer:'A-WALL'});
    addOpening('door',w,2000,'sgl900');
    SEL.clear(); SEL.add(w.id);
    startCmd('explode');
    const kinds=new Set([...DOC.ents.values()].map(e=>e.t));
    return {n:DOC.ents.size, kinds:[...kinds], walls:[...DOC.ents.values()].filter(e=>e.t==='wall').length};`);
  ok(r.n > 4, 'expected several primitives, got ' + r.n);
  eq(r.walls, 0, 'no wall should survive');
  ok(!r.kinds.includes('door'), 'the hosted door must go too');
});
t('divide and measure place the right number of points', () => {
  const r = R(`
    resetDoc();
    const e=addEnt({t:'line',a:[0,0],b:[1000,0]});
    startCmd('divide'); cmdPoint([500,0]); cmdText('5');
    const afterDiv=[...DOC.ents.values()].filter(x=>x.t==='point').length;
    resetDoc();
    const e2=addEnt({t:'line',a:[0,0],b:[1000,0]});
    startCmd('measure'); cmdPoint([500,0]); cmdText('250');
    const afterMeas=[...DOC.ents.values()].filter(x=>x.t==='point').length;
    return [afterDiv, afterMeas];`);
  eq(r[0], 4, 'divide into 5 leaves 4 points');
  eq(r[1], 4, 'measure at 250 along 1000 leaves 4 points');
});
t('array produces the expected counts', () => {
  const r = R(`
    resetDoc();
    const e=addEnt({t:'circle',c:[0,0],r:10});
    const src=[clone(e)];
    document.getElementById('ac').value='4'; document.getElementById('ar').value='3';
    document.getElementById('acs').value='100'; document.getElementById('ars').value='100';
    document.getElementById('aang').value='0';
    begin(); arrayRect(src); commit();
    return DOC.ents.size;`);
  eq(r, 12, '4×3 grid');
});
t('blocks insert and explode back', () => {
  const r = R(`
    resetDoc();
    DOC.blocks={ TESTB:{ base:[0,0], ents:[{t:'line',a:[0,0],b:[100,0],layer:'0'},{t:'circle',c:[50,0],r:20,layer:'0'}] } };
    const ins=addEnt({t:'insert',name:'TESTB',p:[500,500],rot:Math.PI/2,sx:2,sy:2});
    const sh=shapes(ins,32);
    SEL.clear(); SEL.add(ins.id);
    startCmd('explode');
    return {shapes:sh.length, after:DOC.ents.size, types:[...new Set([...DOC.ents.values()].map(e=>e.t))].sort()};`);
  eq(r.shapes, 2, 'block draws both children');
  eq(r.after, 2, 'explode yields two entities');
  eq(r.types.join(','), 'circle,line');
});
t('hatch from a closed shape covers its area', () => {
  const r = R(`
    resetDoc();
    const p=addEnt({t:'pline',pts:[[0,0],[1000,0],[1000,1000],[0,1000]],closed:true});
    const found=findEnclosing([500,500]);
    const h=addEnt({t:'hatch',loops:[p.pts],pattern:'line',sp:100,hatchAng:45});
    return [found.length, entArea(h), entDist([500,500],h)];`);
  eq(r[0], 1, 'boundary detected'); close(r[1], 1e6); eq(r[2], 0);
});
t('quick select filters by type and layer', () => {
  const r = R(`
    resetDoc();
    addEnt({t:'line',a:[0,0],b:[1,1],layer:'0'});
    addEnt({t:'circle',c:[0,0],r:5,layer:'0'});
    addEnt({t:'circle',c:[9,9],r:5,layer:'TEXT'});
    SEL.clear();
    let n=0;
    for(const e of DOC.ents.values()) if(e.t==='circle' && e.layer==='0'){ SEL.add(e.id); n++; }
    return n;`);
  eq(r, 1);
});

/* ============================================================ */
group('snapping');
t('endpoint snap beats nearest', () => {
  const r = R(`
    resetDoc();
    V.z=1; V.px=0; V.py=800;
    addEnt({t:'line',a:[100,100],b:[300,100]});
    const s=snapPoint(100+3, 800-100-3, null);
    return [ST.snap && ST.snap.k, s];`);
  eq(r[0], 'end');
  close(r[1][0], 100, 1e-6); close(r[1][1], 100, 1e-6);
});
t('midpoint snap', () => {
  const r = R(`
    resetDoc(); V.z=1; V.px=0; V.py=800;
    addEnt({t:'line',a:[0,0],b:[200,0]});
    snapPoint(100+2, 800-2, null);
    return ST.snap && [ST.snap.k, ST.snap.p];`);
  eq(r[0], 'mid'); close(r[1][0], 100, 1e-6);
});
t('intersection snap', () => {
  const r = R(`
    resetDoc(); V.z=1; V.px=0; V.py=800;
    addEnt({t:'line',a:[0,0],b:[200,0]});
    addEnt({t:'line',a:[100,-100],b:[100,100]});
    snapPoint(100+2, 800-2, null);
    return ST.snap && ST.snap.k;`);
  ok(r === 'int' || r === 'mid', 'got ' + r);
});
t('ortho constrains to the nearest axis', () => {
  const r = R(`
    resetDoc(); V.z=1; V.px=0; V.py=800;
    ST.ortho=true; ST.osnap=false;
    const p=snapPoint(300, 800-40, [0,0]);
    ST.ortho=false; ST.osnap=true;
    return p;`);
  close(r[1], 0, 1e-9, 'y should be locked to the reference');
});

/* ============================================================ */
group('DXF');
t('writer emits a well-formed AC1015 skeleton', () => {
  const s = R(`
    resetDoc();
    addEnt({t:'line',a:[0,0],b:[1000,0]});
    return exportDXF();`);
  ok(s.includes('AC1015'), 'version marker');
  for (const sec of ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']) ok(s.includes(sec), 'missing ' + sec);
  for (const tb of ['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'VIEW', 'UCS', 'APPID', 'DIMSTYLE', 'BLOCK_RECORD'])
    ok(s.includes('\r\n' + tb + '\r\n'), 'missing table ' + tb);
  ok(s.trim().endsWith('EOF'));
  ok(/\r\n/.test(s), 'DXF should use CRLF');
});
t('ellipse survives a DXF round trip', () => {
  const r = R(`
    resetDoc();
    addEnt({t:'ellipse',c:[100,200],rx:400,ry:150,rot:rad(30),a0:0,a1:Math.PI*2});
    const txt=exportDXF();
    const res=dxfParse(txt);
    const back=dxfToEnts(res,res.ents,null,0);
    const e=back.find(x=>x.t==='ellipse');
    return e && [e.c,e.rx,e.ry,deg(e.rot)];`);
  ok(r, 'ellipse came back as something else');
  close(r[0][0], 100, 1e-6); close(r[1], 400, 1e-6); close(r[2], 150, 1e-6);
  close(r[3], 30, 1e-6);
});
t('spline survives as a real SPLINE entity', () => {
  const r = R(`
    resetDoc();
    const fit=[[0,0],[300,400],[700,-200],[1000,100]];
    addEnt({t:'spline',pts:fitSpline(fit,false),fit,deg:3});
    const txt=exportDXF();
    const hasSpline=txt.includes('AcDbSpline');
    const res=dxfParse(txt);
    const back=dxfToEnts(res,res.ents,null,0);
    const e=back.find(x=>x.t==='spline');
    return {hasSpline, found:!!e, pts:e?e.pts.length:0, first:e&&e.pts[0], last:e&&e.pts[e.pts.length-1]};`);
  eq(r.hasSpline, true, 'must write a SPLINE, not a polyline');
  eq(r.found, true);
  ok(r.pts > 10);
  close(r.first[0], 0, 1, 'spline starts at the first fit point');
  close(r.last[0], 1000, 1, 'spline ends at the last fit point');
});
t('dimension survives as a real DIMENSION entity', () => {
  const r = R(`
    resetDoc();
    addEnt({t:'dim',k:'horizontal',p1:[0,0],p2:[5000,0],off:-800,layer:'0'});
    const txt=exportDXF();
    const res=dxfParse(txt);
    const back=dxfToEnts(res,res.ents,null,0);
    const d=back.find(x=>x.t==='dim');
    return {hasDim:txt.includes('AcDbDimension'), hasRot:txt.includes('AcDbRotatedDimension'),
            found:!!d, k:d&&d.k, p1:d&&d.p1, p2:d&&d.p2, off:d&&d.off};`);
  eq(r.hasDim, true, 'no DIMENSION entity written');
  eq(r.found, true, 'dimension did not come back as a dimension');
  eq(r.k, 'horizontal');
  close(r.p1[0], 0, 1e-6); close(r.p2[0], 5000, 1e-6);
  close(r.off, -800, 1e-6);
});
t('arcs, circles, text and polylines round trip', () => {
  const r = R(`
    resetDoc();
    addEnt({t:'line',a:[0,0],b:[100,50]});
    addEnt({t:'circle',c:[200,200],r:75});
    addEnt({t:'arc',c:[0,0],r:50,a0:0,a1:Math.PI/2});
    addEnt({t:'pline',pts:[[0,0],[100,0],[100,100]],closed:true});
    addEnt({t:'text',p:[10,20],s:'HELLO',h:25,rot:rad(15),anchor:'c'});
    addEnt({t:'point',p:[5,5]});
    const txt=exportDXF();
    const res=dxfParse(txt);
    const back=dxfToEnts(res,res.ents,null,0);
    const by=t=>back.find(x=>x.t===t);
    return {
      n:back.length,
      circle:by('circle')&&by('circle').r,
      arc:by('arc')&&[deg(by('arc').a0),deg(by('arc').a1)],
      pline:by('pline')&&[by('pline').pts.length,by('pline').closed],
      text:by('text')&&[by('text').s,by('text').h,Math.round(deg(by('text').rot)),by('text').anchor],
      point:!!by('point'),
    };`);
  eq(r.n, 6, 'entity count');
  close(r.circle, 75);
  close(r.arc[0], 0, 1e-6); close(r.arc[1], 90, 1e-6);
  eq(r.pline[0], 3); eq(r.pline[1], true);
  eq(r.text[0], 'HELLO'); close(r.text[1], 25); eq(r.text[2], 15); eq(r.text[3], 'c');
  eq(r.point, true);
});
t('layers, colours and linetypes round trip', () => {
  const r = R(`
    resetDoc();
    ensureLayer('MYLAYER','#ff5f5f','dashed');
    addEnt({t:'line',a:[0,0],b:[10,0],layer:'MYLAYER'});
    addEnt({t:'line',a:[0,5],b:[10,5],layer:'0',color:'#4ee6a8',lt:'center'});
    const txt=exportDXF();
    const res=dxfParse(txt);
    const back=dxfToEnts(res,res.ents,null,0);
    return {layers:Object.keys(res.layers), l0:back[0].layer, col:back[1].color, lt:back[1].lt};`);
  ok(r.layers.includes('MYLAYER'), 'layer table');
  eq(r.l0, 'MYLAYER');
  eq(r.col, '#4ee6a8', 'true colour preserved');
  eq(r.lt, 'center');
});
t('architecture flattens to primitives on export, not to nothing', () => {
  const r = R(`
    resetDoc();
    const w=addEnt({t:'wall',a:[0,0],b:[4000,0],wt:'brk230',layer:'A-WALL'});
    addOpening('door',w,2000,'sgl900');
    addEnt({t:'stair',a:[0,3000],b:[3000,3000],w:1000,risers:16,layer:'A-FLOR-STRS'});
    const txt=exportDXF();
    const res=dxfParse(txt);
    const back=dxfToEnts(res,res.ents,null,0);
    return {n:back.length, layers:[...new Set(back.map(e=>e.layer))].sort(),
            hasArc:back.some(e=>e.t==='arc')};`);
  ok(r.n > 15, 'expected the plan geometry, got ' + r.n + ' entities');
  ok(r.layers.includes('A-WALL'), 'wall layer preserved');
  eq(r.hasArc, true, 'the door swing should export as a real arc');
});
t('hatch round trips as a HATCH entity', () => {
  const r = R(`
    resetDoc();
    addEnt({t:'hatch',loops:[[[0,0],[1000,0],[1000,1000],[0,1000]]],pattern:'line',sp:100,hatchAng:45});
    const txt=exportDXF();
    const res=dxfParse(txt);
    const back=dxfToEnts(res,res.ents,null,0);
    const h=back.find(x=>x.t==='hatch');
    return {written:txt.includes('AcDbHatch'), found:!!h, loops:h&&h.loops.length, pts:h&&h.loops[0].length};`);
  eq(r.written, true); eq(r.found, true); eq(r.loops, 1); eq(r.pts, 4);
});
t('block insert round trips through BLOCKS', () => {
  const r = R(`
    resetDoc();
    DOC.blocks={ B1:{ base:[0,0], ents:[{t:'circle',c:[0,0],r:100,layer:'0'}] } };
    addEnt({t:'insert',name:'B1',p:[1000,500],rot:0,sx:1,sy:1});
    const txt=exportDXF();
    const res=dxfParse(txt);
    const back=dxfToEnts(res,res.ents,null,0);
    const c=back.find(x=>x.t==='circle');
    return {blockInFile:!!res.blocks.B1, found:!!c, at:c&&c.c, r:c&&c.r};`);
  eq(r.blockInFile, true); eq(r.found, true);
  close(r.at[0], 1000, 1e-6); close(r.r, 100, 1e-6);
});
t('imported MTEXT formatting codes are stripped', () => {
  eq(R(`return mtextPlain('{\\\\fArial|b0;Hello} \\\\P World')`), 'Hello \n World'.replace(' \n', ' \n'));
});
t('imports a hard R2018 file made by ezdxf', () => {
  const hard = path.join(__dirname, 'out', 'hard.dxf');
  if (!fs.existsSync(hard)) { console.log('      (skipped — run tools/make_hard_dxf.py first)'); return; }
  const TXT = fs.readFileSync(hard, 'utf8');
  const r = run(`const TXT=${JSON.stringify(TXT)};` + `
    const res=dxfParse(TXT);
    const ents=dxfToEnts(res,res.ents,null,0);
    const counts={};
    for(const e of ents) counts[e.t]=(counts[e.t]||0)+1;
    return {ver:res.header['$ACADVER'], n:ents.length, counts,
            dims:ents.filter(e=>e.t==='dim').map(e=>e.k).sort(),
            texts:ents.filter(e=>e.t==='text').map(e=>e.s),
            colours:[...new Set(ents.map(e=>e.color).filter(Boolean))],
            finite:ents.every(e=>bbox(e).every(v=>isFinite(v)))};`);
  eq(r.ver, 'AC1032', 'should read an R2018 file');
  ok(r.n > 25, 'expected the whole drawing, got ' + r.n);
  eq(r.finite, true, 'every imported entity must have finite extents');
  for (const k of ['line', 'circle', 'arc', 'pline', 'ellipse', 'spline', 'text', 'point', 'dim', 'hatch'])
    ok(r.counts[k] > 0, 'nothing imported for ' + k);
  eq(r.dims.join(','), 'aligned,angular,diameter,horizontal,radius', 'all five dimension flavours rebuilt');
  ok(r.texts.includes('PLAIN TEXT') && r.texts.includes('CENTRED'), 'TEXT entities');
  ok(r.texts.some(t => t === 'Line two with colour and big text'), 'MTEXT formatting codes stripped');
  ok(r.colours.includes('#4ee6a8'), 'true colour preserved');
  eq(r.counts.circle, 6, 'nested block INSERTs expanded with scale and rotation');
});
t('end-to-end import rebuilds layers with their state', () => {
  const hard = path.join(__dirname, 'out', 'hard.dxf');
  if (!fs.existsSync(hard)) return;
  const TXT = fs.readFileSync(hard, 'utf8');
  const r = run(`const TXT=${JSON.stringify(TXT)};` + `
    importDXF(TXT);
    const byName={}; for(const l of DOC.layers) byName[l.name]=l;
    return {n:DOC.ents.size, names:DOC.layers.map(l=>l.name),
            awkwardLt:byName.AWKWARD && byName.AWKWARD.lt,
            off:byName.OFFLAYER && byName.OFFLAYER.on,
            locked:byName.LOCKED && byName.LOCKED.lock};`);
  ok(r.names.includes('AWKWARD'), 'layers imported');
  eq(r.awkwardLt, 'dashed', 'layer linetype');
  eq(r.off, false, 'an off layer stays off');
  eq(r.locked, true, 'a locked layer stays locked');
  ok(r.n > 25);
});
t('reader survives an R12 file', () => {
  const r = R(`
    const r12 = ['0','SECTION','2','ENTITIES',
      '0','LINE','8','0','10','0','20','0','30','0','11','100','21','50','31','0',
      '0','CIRCLE','8','0','10','5','20','5','30','0','40','25',
      '0','POLYLINE','8','0','66','1','70','1',
      '0','VERTEX','8','0','10','0','20','0',
      '0','VERTEX','8','0','10','10','20','0',
      '0','VERTEX','8','0','10','10','20','10',
      '0','SEQEND','8','0',
      '0','ENDSEC','0','EOF'].join('\\r\\n');
    const res=dxfParse(r12);
    const back=dxfToEnts(res,res.ents,null,0);
    return back.map(e=>e.t);`);
  eq(r.join(','), 'line,circle,pline');
});

/* ============================================================ */
group('project file');
t('native save/load preserves architecture', () => {
  const r = R(`
    resetDoc();
    const w=addEnt({t:'wall',a:[0,0],b:[5000,0],wt:'cav300',just:'left',layer:'A-WALL'});
    const d=addOpening('door',w,2000,'dbl1500');
    mut(d); d.flip=true; d.swing=45;
    addEnt({t:'room',pts:[[0,0],[1000,0],[1000,1000]],name:'X',layer:'A-AREA'});
    const txt=saveNative();
    resetDoc();
    loadNative(txt);
    const w2=[...DOC.ents.values()].find(e=>e.t==='wall');
    const d2=[...DOC.ents.values()].find(e=>e.t==='door');
    return {n:DOC.ents.size, wt:w2.wt, just:w2.just, flip:d2.flip, swing:d2.swing,
            hosted:!!hostOf(d2), types:DOC.wallTypes.length};`);
  eq(r.n, 3); eq(r.wt, 'cav300'); eq(r.just, 'left');
  eq(r.flip, true); eq(r.swing, 45);
  eq(r.hosted, true, 'the door must still find its wall');
  ok(r.types > 5, 'wall type library travels with the file');
});
t('custom component types are saved', () => {
  const r = R(`
    resetDoc();
    DOC.wallTypes.push({id:'custom1',name:'My wall',t:275});
    const txt=saveNative();
    resetDoc(); loadNative(txt);
    return !!DOC.wallTypes.find(t=>t.id==='custom1');`);
  eq(r, true);
});

/* ============================================================ */
group('SVG');
t('SVG export includes every visible entity kind', () => {
  const r = R(`
    resetDoc();
    const w=addEnt({t:'wall',a:[0,0],b:[4000,0],wt:'gen100',layer:'A-WALL'});
    addOpening('door',w,2000,'sgl900');
    addEnt({t:'circle',c:[0,2000],r:300});
    addEnt({t:'text',p:[0,3000],s:'PLAN',h:200,layer:'TEXT'});
    addEnt({t:'dim',k:'horizontal',p1:[0,0],p2:[4000,0],off:-600,layer:'DIMENSIONS'});
    const s=exportSVG();
    return {svg:s.startsWith('<svg'), path:(s.match(/<path/g)||[]).length,
            text:(s.match(/<text/g)||[]).length, circle:(s.match(/<circle/g)||[]).length,
            closed:s.trim().endsWith('</svg>')};`);
  eq(r.svg, true); eq(r.closed, true);
  ok(r.path > 5, 'geometry paths'); ok(r.text >= 2, 'text and dim label'); ok(r.circle >= 1);
});

/* ============================================================ */
group('DWG reader');
t('rejects a non-DWG file cleanly', () => {
  const r = R(`
    const b=new Uint8Array(200); b.set([0x50,0x4b,0x03,0x04]);
    const res=dwgParse(b.buffer);
    return [res.ok, res.error];`);
  eq(r[0], false); ok(/Not a DWG/.test(r[1]), r[1]);
});
t('names the version and refuses R2004+ instead of guessing', () => {
  const r = R(`
    const enc=s=>{const b=new Uint8Array(400); for(let i=0;i<6;i++) b[i]=s.charCodeAt(i); return b;};
    const b=enc('AC1032');
    const res=dwgParse(b.buffer);
    return [res.release, res.ok, res.error];`);
  eq(r[0], 'R2018'); eq(r[1], false);
  ok(/compressed section container/.test(r[2]), r[2]);
});
t('bit reader primitives match the specification', () => {
  const r = R(`
    const b=new Uint8Array([0b10110010, 0xFF, 0x00, 0x40, 0x00]);
    const br=new BitReader(b,0);
    const out=[br.B(),br.B(),br.BB(),br.bits(4)];
    const br2=new BitReader(new Uint8Array([0x00,0x00,0x80,0x3F]),0);
    const f=br2.RL();
    const br3=new BitReader(new Uint8Array([0x4A,0x80]),0);
    const bs=br3.BS();
    return {out, f, bs};`);
  eq(r.out.join(','), '1,0,3,0b0010'.replace('0b0010', String(0b0010)));
  eq(r.bs, 42, 'BS code 01 reads one byte');
});
t('modular char decodes sign and continuation', () => {
  const r = R(`
    const mk=arr=>new BitReader(new Uint8Array(arr),0);
    return [ mk([0x0A]).MC(), mk([0x4A]).MC(), mk([0x8A,0x01]).MC() ];`);
  eq(r[0], 10, 'plain');
  eq(r[1], -10, 'sign bit 0x40');
  eq(r[2], 138, 'two-byte continuation');
});
t('handle references decode code and value', () => {
  const r = R(`
    const br=new BitReader(new Uint8Array([0x52,0x01,0x2C]),0);
    const h=br.H();
    return [h.code,h.value];`);
  eq(r[0], 5); eq(r[1], 300);
});
t('bit double with default patches the low bytes', () => {
  const r = R(`
    const t=new Uint8Array(8); new DataView(t.buffer).setFloat64(0, 1234.5, true);
    const br=new BitReader(new Uint8Array([0b00000000]),0);
    const same=br.DD(1234.5);
    return same;`);
  close(r, 1234.5);
});

/* ============================================================ */
group('DWG writer round trip');
t('bit writer and bit reader agree on every primitive', () => {
  const r = R(`
    const w=new BitWriter();
    w.B(1); w.BB(2); w.RC(200); w.RS(40000); w.RL(3000000000);   /* RL is unsigned */
    w.RD(1234.5678); w.BS(0); w.BS(42); w.BS(-7); w.BS(256);
    w.BL(0); w.BL(200); w.BL(70000); w.BD(0); w.BD(1); w.BD(-3.5);
    w.MC(10); w.MC(-10); w.MC(138); w.MS(5); w.MS(40000);
    w.H(5, 300); w.TV('HELLO');
    const buf=w.flush();
    const b=new BitReader(buf,0);
    const out=[b.B(),b.BB(),b.RC(),b.RS(),b.RL(),b.RD(),
      b.BS(),b.BS(),b.BS(),b.BS(),
      b.BL(),b.BL(),b.BL(),b.BD(),b.BD(),b.BD(),
      b.MC(),b.MC(),b.MC(),b.MS(),b.MS()];
    const h=b.H(); const s=b.TV();
    return {out, h:[h.code,h.value], s};`);
  const want = [1, 2, 200, 40000, 3000000000, 1234.5678, 0, 42, -7, 256, 0, 200, 70000, 0, 1, -3.5, 10, -10, 138, 5, 40000];
  for (let i = 0; i < want.length; i++) close(r.out[i], want[i], 1e-9, 'primitive ' + i);
  eq(r.h[0], 5); eq(r.h[1], 300); eq(r.s, 'HELLO');
});
t('modular integers survive a round trip across the whole range', () => {
  const r = R(`
    const bad=[];
    const vals=[];
    for(let v=0;v<600;v++) vals.push(v,-v);
    for(let k=6;k<28;k++) vals.push(1<<k,(1<<k)-1,(1<<k)+1,-(1<<k),-((1<<k)+63));
    for(const v of vals){
      const w=new BitWriter(); w.MC(v); const back=new BitReader(w.flush(),0).MC();
      if(back!==v) bad.push('MC '+v+' -> '+back);
    }
    for(const v of vals.filter(x=>x>=0)){
      const w=new BitWriter(); w.MS(v); const back=new BitReader(w.flush(),0).MS();
      if(back!==v) bad.push('MS '+v+' -> '+back);
    }
    for(const v of [-32768,-300,-1,0,1,42,255,256,300,32767]){
      const w=new BitWriter(); w.BS(v); const back=new BitReader(w.flush(),0).BS();
      if(back!==v) bad.push('BS '+v+' -> '+back);
    }
    /* BL is a signed 32-bit type, so the range is int32 by definition */
    for(const v of [0,1,200,255,256,70000,2147483647,-2147483648,-5]){
      const w=new BitWriter(); w.BL(v); const back=new BitReader(w.flush(),0).BL();
      if(back!==v) bad.push('BL '+v+' -> '+back);
    }
    return bad.slice(0,8);`);
  eq(r.length, 0, r.join(' | '));
});
t('writer produces a file its own reader accepts', () => {
  const r = R(`
    resetDoc();
    addEnt({t:'line',a:[0,0],b:[5000,1000]});
    addEnt({t:'circle',c:[2000,2000],r:750});
    addEnt({t:'arc',c:[0,0],r:400,a0:0,a1:Math.PI/2});
    addEnt({t:'point',p:[123,456]});
    addEnt({t:'pline',pts:[[0,0],[100,0],[100,100],[0,100]],closed:true});
    addEnt({t:'ellipse',c:[3000,0],rx:600,ry:300,rot:rad(15),a0:0,a1:Math.PI*2});
    addEnt({t:'text',p:[10,20],s:'DWGTEST',h:100,rot:0,anchor:'l'});
    const buf=exportDWG();
    const res=dwgParse(buf);
    const counts={};
    for(const e of res.entities) counts[e.t]=(counts[e.t]||0)+1;
    return {ok:res.ok, version:res.version, release:res.release, n:res.entities.length,
            counts, skipped:res.skipped, notes:res.notes,
            layers:Object.keys(res.layers).length, bytes:buf.byteLength,
            line:res.entities.find(e=>e.t==='line'),
            circle:res.entities.find(e=>e.t==='circle'),
            text:res.entities.find(e=>e.t==='text')};`);
  eq(r.version, 'AC1015');
  eq(r.notes.length, 0, 'structural warnings: ' + r.notes.join(' | '));
  eq(r.ok, true, 'reader rejected our own file');
  eq(r.skipped, 0, r.skipped + ' objects failed to decode');
  eq(r.n, 7, 'entity count through the round trip');
  close(r.line.b[0], 5000, 1e-6); close(r.line.b[1], 1000, 1e-6);
  close(r.circle.r, 750, 1e-6);
  eq(r.text.s, 'DWGTEST');
  console.log(`      ${r.bytes} bytes · ${r.n} entities · ${r.layers} layers · 0 skipped`);
});
t('object map CRCs verify', () => {
  const r = R(`
    resetDoc();
    for(let i=0;i<300;i++) addEnt({t:'line',a:[i,0],b:[i,10]});
    const buf=exportDWG();
    const res=dwgParse(buf);
    return {notes:res.notes, n:res.entities.length, objects:res.objectCount};`);
  eq(r.notes.length, 0, 'CRC or layout complaints: ' + r.notes.join(' | '));
  eq(r.n, 300);
});
t('a corrupted byte is caught by the CRC rather than silently misread', () => {
  const r = R(`
    resetDoc();
    for(let i=0;i<50;i++) addEnt({t:'line',a:[i*10,0],b:[i*10,100]});
    const buf=exportDWG();
    const u=new Uint8Array(buf);
    const dv=new DataView(buf);
    const mapAddr=dv.getUint32(0x19+1+9*2,true);
    u[mapAddr+4]^=0xff;                      /* flip a byte inside the object map page */
    const res=dwgParse(buf);
    return res.notes.join(' | ');`);
  ok(/CRC mismatch/.test(r), 'expected a CRC complaint, got: ' + (r || '(silence)'));
});

group('boot and rendering');
t('boot() runs the real startup path without throwing', () => {
  bootApp();
  const r = run(`
    const kinds={};
    for(const e of DOC.ents.values()) kinds[e.t]=(kinds[e.t]||0)+1;
    return {n:DOC.ents.size, kinds, layers:DOC.layers.length, mode:MODE,
            rail:document.getElementById('rail').children.length,
            undoSteps:HIST.past.length};`);
  ok(r.n > 15, 'the sample plan should be seeded, got ' + r.n);
  for (const k of ['wall', 'door', 'window', 'room', 'stair', 'column', 'dim'])
    ok(r.kinds[k] > 0, 'seed is missing ' + k);
  ok(r.rail > 30, 'tool rail built with ' + r.rail + ' items');
  eq(r.undoSteps, 0, 'startup should not leave undo history');
});
t('paint draws the seeded plan and the geometry lands where the model says', () => {
  const r = run(`
    const ctx2 = document.getElementById('cv').getContext('2d');
    ctx2.__trace.pts.length = 0; ctx2.__trace.counts = {}; ctx2.__trace.calls.length = 0;
    const g = ST.grid; ST.grid = false;             /* measure entity geometry only */
    fit();
    paint();
    ST.grid = g;
    const tr = ctx2.__trace;
    const xs = tr.pts.map(p=>p[0]).filter(isFinite);
    const ys = tr.pts.map(p=>p[1]).filter(isFinite);
    return {points: tr.pts.length, counts: tr.counts,
            texts: tr.calls.map(c=>c[1]),
            xr:[Math.min(...xs),Math.max(...xs)], yr:[Math.min(...ys),Math.max(...ys)],
            w:V.w, h:V.h};`);
  ok(r.points > 250, 'expected a busy plan, got ' + r.points + ' path points');
  ok(r.counts.stroke > 40, 'strokes: ' + r.counts.stroke);
  ok(r.counts.arc > 0, 'door swings and circles should produce arcs');
  ok(r.counts.fill > 0, 'dimension arrowheads should be filled');
  /* everything must land inside the viewport after a zoom-to-extents */
  ok(r.xr[0] > 0 && r.xr[1] < r.w, `x range ${r.xr} should sit inside the canvas 0..${r.w}`);
  ok(r.yr[0] > 0 && r.yr[1] < r.h, `y range ${r.yr} should sit inside the canvas 0..${r.h}`);
  ok(r.texts.some(t => /LIVING|KITCHEN|BEDROOM/.test(t)), 'room labels drawn: ' + r.texts.slice(0, 6));
  ok(r.texts.some(t => /\d/.test(t)), 'dimension values drawn');
  console.log(`      ${r.points} path points · ${r.counts.stroke} strokes · ${r.counts.arc} arcs · ${r.texts.length} text runs`);
});
t('the seeded plan exports cleanly to every format', () => {
  const r = run(`
    const dxf=exportDXF(), svg=exportSVG(), oc=saveNative();
    const res=dxfParse(dxf);
    const back=dxfToEnts(res,res.ents,null,0);
    return {dxfKB:Math.round(dxf.length/1024), svgKB:Math.round(svg.length/1024),
            reimported:back.length, svgOk:svg.startsWith('<svg')&&svg.trim().endsWith('</svg>'),
            ocadOk:JSON.parse(oc).app==='orthograph'};`);
  ok(r.reimported > 40, 'round-tripped ' + r.reimported + ' entities');
  eq(r.svgOk, true); eq(r.ocadOk, true);
  console.log(`      DXF ${r.dxfKB}KB · SVG ${r.svgKB}KB · ${r.reimported} entities back`);
});
t('switching modes rebuilds the rail and keeps the drawing', () => {
  const r = run(`
    const before=DOC.ents.size;
    setMode('arch');
    const archRail=document.getElementById('rail').children.length;
    setMode('drafting');
    const draftRail=document.getElementById('rail').children.length;
    return {before, after:DOC.ents.size, archRail, draftRail, mode:MODE};`);
  eq(r.before, r.after, 'the drawing must survive a mode switch');
  ok(r.archRail > 15 && r.draftRail > 30, `rails: arch ${r.archRail}, draft ${r.draftRail}`);
  ok(r.draftRail > r.archRail, 'drafting has more tools than architecture');
});
t('the properties panel builds for every entity type in the plan', () => {
  const r = run(`
    const bad=[];
    for(const e of [...DOC.ents.values()]){
      SEL.clear(); SEL.add(e.id);
      try{ buildProps(); }catch(err){ bad.push(e.t+': '+err.message); }
    }
    SEL.clear();
    for(const e of [...DOC.ents.values()].slice(0,5)) SEL.add(e.id);
    try{ buildProps(); }catch(err){ bad.push('multi: '+err.message); }
    SEL.clear(); try{ buildProps(); }catch(err){ bad.push('empty: '+err.message); }
    return bad;`);
  eq(r.length, 0, r.slice(0, 5).join(' | '));
});

group('performance');
t('6000 entities: index build, query and paint stay responsive', () => {
  const r = R(`
    resetDoc();
    const t0=Date.now();
    for(let i=0;i<6000;i++){
      const x=(i%80)*300, y=Math.floor(i/80)*300;
      if(i%3===0) addEnt({t:'line',a:[x,y],b:[x+250,y+250]});
      else if(i%3===1) addEnt({t:'circle',c:[x+120,y+120],r:90});
      else addEnt({t:'pline',pts:[[x,y],[x+250,y],[x+250,y+250]],closed:false});
    }
    const tAdd=Date.now()-t0;
    const t1=Date.now(); query(0,0,3000,3000); const tFirst=Date.now()-t1;
    const t2=Date.now(); for(let i=0;i<200;i++) query(i*30,i*30,i*30+2000,i*30+2000); const tQ=Date.now()-t2;
    const t3=Date.now(); paint(); const tPaint=Date.now()-t3;
    const t4=Date.now();
    begin(); const e=[...DOC.ents.values()][3000]; xf(e,T.move([1,1])); commit();
    const tEdit=Date.now()-t4;
    return {tAdd,tFirst,tQ,tPaint,tEdit,n:DOC.ents.size};`);
  ok(r.tAdd < 4000, 'adding 6000 entities took ' + r.tAdd + 'ms');
  ok(r.tFirst < 1500, 'first indexed query took ' + r.tFirst + 'ms');
  ok(r.tQ < 1500, '200 queries took ' + r.tQ + 'ms');
  ok(r.tPaint < 2000, 'paint took ' + r.tPaint + 'ms');
  ok(r.tEdit < 120, 'a single edit + commit took ' + r.tEdit + 'ms — the old code serialised the whole document here');
  console.log(`      add ${r.tAdd}ms · first query ${r.tFirst}ms · 200 queries ${r.tQ}ms · paint ${r.tPaint}ms · edit ${r.tEdit}ms`);
});
t('200 undo levels on a large drawing stay small in memory', () => {
  const r = R(`
    resetDoc();
    for(let i=0;i<5000;i++) addEnt({t:'line',a:[i,0],b:[i,10]});
    HIST.past.length=0;
    const list=[...DOC.ents.values()];
    for(let i=0;i<200;i++){ begin(); xf(list[i],T.move([1,1])); commit(); }
    const bytes=HIST.past.reduce((a,p)=>a+JSON.stringify(p).length,0);
    const docBytes=JSON.stringify([...DOC.ents.values()]).length;
    return {bytes, docBytes, steps:HIST.past.length};`);
  eq(r.steps, 200);
  ok(r.bytes < r.docBytes,
    `200 undo steps cost ${(r.bytes / 1024).toFixed(0)}KB against a ${(r.docBytes / 1024).toFixed(0)}KB document`);
  console.log(`      200 undo steps: ${(r.bytes / 1024).toFixed(0)}KB · document ${(r.docBytes / 1024).toFixed(0)}KB`);
});
t('wall-heavy plan draws in reasonable time', () => {
  const r = R(`
    resetDoc();
    for(let i=0;i<60;i++){
      addEnt({t:'wall',a:[0,i*3000],b:[30000,i*3000],wt:'gen100',layer:'A-WALL'});
      addEnt({t:'wall',a:[i*500,0],b:[i*500,180000],wt:'part90',layer:'A-WALL'});
    }
    const t0=Date.now();
    for(const w of allWalls()) wallShapes(w);
    return {ms:Date.now()-t0, walls:allWalls().length};`);
  ok(r.ms < 6000, r.walls + ' walls took ' + r.ms + 'ms to resolve');
  console.log(`      ${r.walls} intersecting walls resolved in ${r.ms}ms`);
});

/* ============================================================ */
group('audit and edge cases');
t('audit finds orphaned openings and missing layers', () => {
  const r = R(`
    resetDoc();
    const w=addEnt({t:'wall',a:[0,0],b:[1000,0],layer:'A-WALL'});
    const d=addOpening('door',w,500,'sgl900');
    DOC.ents.delete(w.id);
    addEnt({t:'line',a:[0,0],b:[1,1],layer:'NOPE'});
    let problems=0;
    for(const e of DOC.ents.values()){
      if(!hasLayer(e.layer)) problems++;
      if((e.t==='door'||e.t==='window') && !DOC.ents.has(e.host)) problems++;
    }
    return problems;`);
  eq(r, 2);
});
t('zero-length and degenerate input does not throw', () => {
  const r = R(`
    resetDoc();
    const bad=[];
    const tries=[
      {t:'line',a:[0,0],b:[0,0]},
      {t:'circle',c:[0,0],r:0},
      {t:'arc',c:[0,0],r:0,a0:0,a1:0},
      {t:'pline',pts:[[0,0]],closed:true},
      {t:'wall',a:[0,0],b:[0,0],wt:'gen100'},
      {t:'room',pts:[[0,0],[0,0],[0,0]]},
      {t:'stair',a:[0,0],b:[0,0],w:0,risers:2},
      {t:'grid',a:[0,0],b:[0,0],label:'A'},
    ];
    for(const e of tries){
      try{ const x=addEnt(clone(e)); bbox(x); shapes(x,24); entDist([1,1],x); entLength(x); entArea(x); gripsOf(x); }
      catch(err){ bad.push(e.t+': '+err.message); }
    }
    try{ paint(); }catch(err){ bad.push('paint: '+err.message); }
    try{ exportDXF(); }catch(err){ bad.push('dxf: '+err.message); }
    try{ exportSVG(); }catch(err){ bad.push('svg: '+err.message); }
    return bad;`);
  eq(r.length, 0, r.join(' | '));
});
t('very large coordinates stay finite everywhere', () => {
  const r = R(`
    resetDoc();
    addEnt({t:'line',a:[-1e9,-1e9],b:[1e9,1e9]});
    addEnt({t:'circle',c:[1e9,1e9],r:1e6});
    const b=bboxAll([...DOC.ents.values()]);
    query(-1e9,-1e9,1e9,1e9);
    return b.every(v=>isFinite(v));`);
  eq(r, true);
});
t('layer visibility and lock are respected', () => {
  const r = R(`
    resetDoc();
    ensureLayer('HID','#ffffff');
    const e=addEnt({t:'line',a:[0,0],b:[100,0],layer:'HID'});
    layer('HID').on=false;
    const vis=visible(e), pick=pickable(e);
    layer('HID').on=true; layer('HID').lock=true;
    return [vis,pick,visible(e),pickable(e)];`);
  eq(r[0], false); eq(r[1], false); eq(r[2], true); eq(r[3], false);
});

/* ---- suites contributed by parallel work, test/suites/*.js ---- */
runSuites({ group, t, ok, eq, close, run, bootApp, R, fs, path, __dirname });

/* ============================================================ */
/* emit fixtures for the external ezdxf check */
const fixtures = R(`
  resetDoc();
  DOC.textH=200;
  addEnt({t:'line',a:[0,0],b:[5000,0]});
  addEnt({t:'circle',c:[2500,2000],r:800});
  addEnt({t:'arc',c:[0,2000],r:600,a0:0,a1:Math.PI/2});
  addEnt({t:'ellipse',c:[6000,1000],rx:900,ry:400,rot:rad(20),a0:0,a1:Math.PI*2});
  const fit=[[0,4000],[1000,5000],[2500,3500],[4000,4500]];
  addEnt({t:'spline',pts:fitSpline(fit,false),fit,deg:3});
  addEnt({t:'pline',pts:[[0,-1000],[2000,-1000],[2000,-2500]],closed:true});
  addEnt({t:'text',p:[100,600],s:'ORTHOGRAPH',h:250,rot:0,anchor:'l',layer:'TEXT'});
  addEnt({t:'point',p:[500,500]});
  addEnt({t:'dim',k:'horizontal',p1:[0,0],p2:[5000,0],off:-900,layer:'DIMENSIONS'});
  addEnt({t:'dim',k:'aligned',p1:[0,0],p2:[3000,2000],off:400,layer:'DIMENSIONS'});
  addEnt({t:'dim',k:'radius',p1:[2500,2000],p2:[3300,2000],layer:'DIMENSIONS'});
  addEnt({t:'dim',k:'diameter',p1:[2500,2000],p2:[2500,2800],layer:'DIMENSIONS'});
  addEnt({t:'dim',k:'angular',p3:[0,0],p1:[1000,0],p2:[0,1000],off:300,layer:'DIMENSIONS'});
  /* the two kinds added last: an ordinate has a real R2000 type and must
     survive a strict read, an arc length has none and is flattened */
  addEnt({t:'dim',k:'ordinate',axis:'x',p1:[3200,1500],p2:[3200,4000],layer:'DIMENSIONS'});
  addEnt({t:'dim',k:'arclen',p3:[0,0],p1:[2000,0],p2:[0,2000],off:300,layer:'DIMENSIONS'});
  addEnt({t:'hatch',loops:[[[6000,3000],[8000,3000],[8000,5000],[6000,5000]]],pattern:'line',sp:150,hatchAng:45});
  addEnt({t:'xline',a:[0,0],d:[0.7071,0.7071],lt:'dashdot'});
  DOC.blocks={ TREE:{ base:[0,0], ents:[{t:'circle',c:[0,0],r:400,layer:'0'},{t:'line',a:[0,-400],b:[0,-900],layer:'0'}] } };
  addEnt({t:'insert',name:'TREE',p:[9000,0],rot:0,sx:1,sy:1});
  const w=addEnt({t:'wall',a:[0,-4000],b:[6000,-4000],wt:'brk230',layer:'A-WALL'});
  const w2=addEnt({t:'wall',a:[6000,-4000],b:[6000,-8000],wt:'brk230',layer:'A-WALL'});
  addOpening('door',w,2000,'sgl900');
  addOpening('window',w,4200,'w1512');
  addEnt({t:'stair',a:[500,-7000],b:[3500,-7000],w:1000,risers:16,rise:187,layer:'A-FLOR-STRS'});
  addEnt({t:'room',pts:[[200,-7800],[5800,-7800],[5800,-4200],[200,-4200]],name:'HALL',showArea:true,h:250,layer:'A-AREA'});
  addEnt({t:'grid',a:[-1000,-9000],b:[-1000,1000],label:'A',br:400,layer:'A-GRID'});
  ensureLayer('MYLAYER','#ff5f5f','dashed');
  addEnt({t:'line',a:[0,6000],b:[4000,6000],layer:'MYLAYER'});
  addEnt({t:'line',a:[0,6400],b:[4000,6400],color:'#4ee6a8',lt:'center'});
  /* Everything added after Wave 1. The fixture is what ezdxf validates in CI,
     so a type missing from here is a type nobody is checking — which is how
     mtext, leader and attdef went on being dropped from the DXF unnoticed. */
  const RING2 = [[12000,0],[18000,0],[18000,4000],[12000,4000]];
  addEnt({t:'mtext', p:[12000,-2000], w:5000, h:250, rot:0, anchor:'l', layer:'TEXT',
          s:'GENERAL NOTES' + String.fromCharCode(10) + String.fromCharCode(10) +
            'Do not scale from this drawing. Dimensions to be checked on site.'});
  addEnt({t:'leader', pts:[[9000,-6000],[10500,-5200]], s:'SEE DETAIL 3', h:250, layer:'DIMENSIONS'});
  addEnt({t:'attdef', p:[12000,-4000], tag:'DOORNO', prompt:'Door number', val:'00',
          h:250, rot:0, anchor:'l', layer:'TEXT'});
  addEnt({t:'table', p:[20000,4000], h:250, layer:'TEXT',
          rows:[['Mark','Room','Area'],['01','HALL','20.16 m2']],
          colW:[900,1600,1600], align:['l','l','r']});
  addEnt({t:'floor', pts:RING2, th:200, top:0, lvl:0, layer:'A-FLOR'});
  addEnt({t:'roof',  pts:RING2, th:250, top:3000, lvl:0, pitch:rad(20), dir:0,
          eaves:[12000,0], layer:'A-ROOF'});
  addEnt({t:'section', a:[11000,2000], b:[19000,2000], dir:1, label:'A', layer:'A-SECT'});
  /* a hatch with an island, so the even-odd path is in the file too */
  addEnt({t:'hatch', layer:'0', solid:true, pattern:'solid',
          loops:[RING2, [[14000,1500],[15000,1500],[15000,2500],[14000,2500]]]});
  return {dxf:exportDXF(), svg:exportSVG(), ocad:saveNative(), n:DOC.ents.size};
`);
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'fixture.dxf'), fixtures.dxf);
fs.writeFileSync(path.join(outDir, 'fixture.svg'), fixtures.svg);
fs.writeFileSync(path.join(outDir, 'fixture.ocad'), fixtures.ocad);

console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m`);
console.log(`fixture written: test/out/fixture.dxf (${fixtures.n} entities, ${(fixtures.dxf.length / 1024).toFixed(0)} KB)`);
process.exit(fail ? 1 : 0);
