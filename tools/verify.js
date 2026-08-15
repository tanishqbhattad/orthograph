#!/usr/bin/env node
'use strict';
/* ============================================================
   Behavioural spot-checks that sit outside the unit suite.
   These are the probes that caught the blockers in review:
   view rotation, room tracing accuracy, drag latency and the
   Command panel. Run after any change to geometry or rendering.

     node tools/verify.js
   ============================================================ */
const { loadApp } = require('../test/load.js');
const { run, bootApp } = loadApp();

let fail = 0;
const ok = (name, cond, detail) => {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${detail ? '  \x1b[2m' + detail + '\x1b[0m' : ''}`);
  if (!cond) fail++;
};
const group = n => console.log('\n\x1b[1m' + n + '\x1b[0m');

/* ---- view rotation ---- */
group('view rotation');
{
  const r = run(`
    const errs=[];
    for(const a of [0,30,90,137,180,270]){
      V.rot=rad(a); fit();
      for(const p of [[0,0],[8400,6000],[-1234.5,987.6]]){
        const back=s2w(...w2s(p));
        if(dist(back,p)>1e-6) errs.push('roundtrip @'+a);
      }
      const c=document.getElementById('cv').getContext('2d');
      c.__trace.pts.length=0; const g=ST.grid; ST.grid=false; paint(); ST.grid=g;
      const xs=c.__trace.pts.map(p=>p[0]).filter(isFinite);
      if(xs.length && !(Math.min(...xs)>0 && Math.max(...xs)<V.w)) errs.push('offscreen @'+a);
    }
    V.rot=0; fit();
    return errs;`);
  ok('screen/world round-trips and fits at 0/30/90/137/180/270°', r.length === 0, r.join(', '));
}

/* ---- room tracing ---- */
group('room tracing');
{
  const r = run(`
    let bad=0,tot=0,worst=0;
    for(const wt of ['gen100','brk230','cav300'])
      for(let W=4000;W<=7000;W+=500) for(let H=3000;H<=6000;H+=500){
        resetDoc();
        const c=[[0,0],[W,0],[W,H],[0,H]];
        for(let i=0;i<4;i++) addEnt({t:'wall',a:c[i],b:c[(i+1)%4],wt,layer:'A-WALL'});
        const t=wallT([...DOC.ents.values()][0]);
        const ring=roomTrace([W/2,H/2],0); tot++;
        if(!ring){bad++;continue;}
        const err=Math.abs(polyArea(ring)-(W-t)*(H-t))/((W-t)*(H-t))*100;
        if(err>worst) worst=err;
        if(ring.length!==4||err>1e-9) bad++;
      }
    return {tot,bad,worst};`);
  ok(`${r.tot} rectangles trace exactly`, r.bad === 0, `worst error ${r.worst}%`);

  const a = run(`
    resetDoc();
    const P=[[0,0],[6000,0],[6000,3000],[3000,6000],[0,6000]];
    for(let i=0;i<P.length;i++) addEnt({t:'wall',a:P[i],b:P[(i+1)%P.length],wt:'gen100',layer:'A-WALL'});
    const r=roomTrace([2000,2000],0);
    return r?r.length:0;`);
  ok('a room with a 45° wall traces to real corners', a === 5, a + ' vertices');

  const g = run(`
    resetDoc();
    const c=[[0,0],[6000,0],[6000,4000],[0,4000]];
    for(let i=0;i<4;i++) addEnt({t:'wall',a:c[i],b:c[(i+1)%4],wt:'gen100',layer:'A-WALL'});
    const ws=[...DOC.ents.values()]; delEnt(ws[2].id);
    return roomTrace([3000,2000],0);`);
  ok('an unenclosed space is refused, not guessed', g === null);
}

/* ---- wall alignment ---- */
group('wall placement');
{
  const r = run(`
    const out={};
    for(const mode of ['centre','inner','outer']){
      resetDoc(); ARCH.jmode=mode; ARCH.wallTh=null; ARCH.wt='gen100';
      startCmd('wall'); CMD.jmode=mode;
      cmdPoint([0,0]); cmdPoint([6000,0]); cmdPoint([6000,4000]); cmdPoint([0,4000]);
      CMDS.wall.text(CMD,'c');
      const ring=roomTrace([3000,2000],0);
      endCmd(true);
      out[mode]=ring?Math.round(polyArea(ring)):null;
    }
    return out;`);
  ok('inner face: the line you draw IS the inside', r.inner === 6000 * 4000, r.inner);
  ok('centreline: half a thickness each way', r.centre === 5900 * 3900, r.centre);
  ok('outer face: a full thickness each way', r.outer === 5800 * 3800, r.outer);
}

/* ---- Command panel ---- */
group('command panel');
{
  bootApp();
  const r = run(`
    SEL.clear(); endCmd(true); setMode('arch'); startCmd('wall');
    const w=document.getElementById('props');
    const labels=[];
    const walk=n=>{ if(!n) return;
      if(n.innerHTML && /<label>/.test(n.innerHTML)) labels.push(n.innerHTML.replace(/<[^>]+>/g,' ').trim().split(/\\s{2,}/)[0]);
      (n.children||[]).forEach(walk); };
    (w.children||[]).forEach(walk);
    const r={labels, hasPanel:(w.children||[]).length>3};
    endCmd(true); return r;`);
  ok('activating a tool populates the panel', r.hasPanel, r.labels.join(', '));
  ok('it offers layer, type, thickness and alignment',
    ['Active layer', 'Type', 'Thickness', 'Alignment'].every(l => r.labels.includes(l)));

  const t = run(`
    resetDoc(); ARCH.wallTh=null;
    startCmd('wall'); CMD.th=333;
    cmdPoint([0,0]); cmdPoint([4000,0]);
    const w=[...DOC.ents.values()].find(e=>e.t==='wall');
    endCmd(true);
    return {stored:w.th, effective:wallT(w)};`);
  ok('a thickness override reaches the placed wall', t.effective === 333, 'th=' + t.stored);

  const e = run(`
    resetDoc(); ARCH.wt='gen100'; ARCH.wallTh=null;
    addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'cav300',th:321,h:2700,layer:'A-WALL'});
    startCmd('wall'); matchStyleFrom('wall',CMD);
    const consumed=takeStyleFrom([3000,0]);
    const r={consumed, wt:CMD.wt, th:CMD.th, cleared:!ST.styleTarget};
    endCmd(true); return r;`);
  ok('the eyedropper lifts settings off an existing wall',
    e.consumed && e.wt === 'cav300' && e.th === 321 && e.cleared);
}

/* ---- latency ---- */
group('latency');
{
  const r = run(`
    resetDoc();
    let n=0;
    for(let row=0;row<15;row++) for(let col=0;col<10;col++){
      const x=col*5000,y=row*4000;
      const P=[[x,y],[x+4500,y],[x+4500,y+3500],[x,y+3500]];
      for(let i=0;i<4&&n<600;i++,n++) addEnt({t:'wall',a:P[i],b:P[(i+1)%4],wt:'gen100',layer:'A-WALL'});
    }
    V.w=1200;V.h=800; fit(); paint();
    const list=allWalls();
    const t0=Date.now();
    for(let f=0;f<5;f++){ mut(list[f%list.length]); paint(); }
    const ms=(Date.now()-t0)/5;
    const t1=Date.now(); for(let i=0;i<30;i++) snapPoint(600+i,400,null);
    return {walls:list.length, drag:+ms.toFixed(1), snap:+((Date.now()-t1)/30).toFixed(2)};`);
  ok('600 walls stay interactive while dragging', r.drag < 80,
    `${r.drag}ms/frame (~${Math.round(1000 / r.drag)}fps), snap ${r.snap}ms`);
}

console.log(fail ? `\n\x1b[31m${fail} check(s) failed\x1b[0m\n` : '\n\x1b[32mall checks passed\x1b[0m\n');
process.exit(fail ? 1 : 0);
