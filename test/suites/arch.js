'use strict';
/* ============================================================
   Openings, rooms and stairs — 04b / 04c
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.gridStep = 100; DOC.snapStep = 100; DOC.textH = 200;
  V.w = 1200; V.h = 800; V.z = 0.1; V.px = 100; V.py = 700; V.rot = 0;
`;
module.exports = ({ group, t, ok, eq, close, R }) => {
  const eqPt = (p, q, tol, m) => {
    ok(p, (m || 'point') + ': missing');
    close(p[0], q[0], tol == null ? 1e-6 : tol, (m || 'point') + ' x');
    close(p[1], q[1], tol == null ? 1e-6 : tol, (m || 'point') + ' y');
  };

  /* ============================================================ */
  group('openings: windows keep the wall visible');

  t('a door cuts the wall face, a window ghosts it instead', () => {
    const r = R(SETUP + `
      const w=addEnt({t:'wall',a:[0,0],b:[8000,0],wt:'gen100',layer:'A-WALL'});
      addOpening('door',w,2000,'sgl900');
      addOpening('window',w,5000,'w1512');
      const sh=wallShapes(w);
      const n=k=>sh.filter(s=>s.role===k).length;
      return {face:n('face'), faceGhost:n('faceGhost'), poche:n('poche'),
              pocheGhost:n('pocheGhost'), jamb:n('jamb')};`);
    ok(r.faceGhost >= 2, 'both faces must survive across the window, ghosted: ' + r.faceGhost);
    eq(r.pocheGhost, 1, 'the wall body under the window is drawn back');
    eq(r.poche, 1, 'the wall still has exactly one solid poche');
    eq(r.jamb, 4, 'two jambs each for the door and the window');
  });

  t('the ghosted run spans exactly the window and nothing more', () => {
    const r = R(SETUP + `
      const w=addEnt({t:'wall',a:[0,0],b:[8000,0],wt:'gen100',layer:'A-WALL'});
      const n=addOpening('window',w,5000,'w1512');
      const g=wallShapes(w).filter(s=>s.role==='faceGhost');
      const u=wallU(w);
      return g.map(s=>[dot(sub(s.pts[0],w.a),u), dot(sub(s.pts[1],w.a),u)].sort((a,b)=>a-b))
              .map(p=>[Math.round(p[0]),Math.round(p[1])]);`);
    const wd = 1500;
    for (const seg of r) {
      close(seg[0], 5000 - wd / 2, 1e-6, 'ghost starts at the window jamb');
      close(seg[1], 5000 + wd / 2, 1e-6, 'ghost ends at the far jamb');
    }
  });

  t('turning the poche off removes the fill but keeps the outline', () => {
    const r = R(SETUP + `
      const w=addEnt({t:'wall',a:[0,0],b:[4000,0],wt:'gen100',layer:'A-WALL'});
      const on=wallShapes(w)[0].hatch;
      mut(w); w.hatch=false;
      const off=wallShapes(w)[0];
      return {on, offHatch:off.hatch, stillPoche:off.role==='poche', pts:off.pts.length};`);
    eq(r.on, true); eq(r.offHatch, false);
    eq(r.stillPoche, true, 'the outline is still published so the renderer can stroke it');
  });

  /* ============================================================ */
  group('openings: Revit flip controls');

  t('flip facing swaps the side the leaf opens to', () => {
    const r = R(SETUP + `
      const w=addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
      const d=addOpening('door',w,3000,'sgl900');
      const leafBefore=doorShapes(d).find(s=>s.role==='leaf').pts[1][1];
      flipFacing(d);
      const leafAfter=doorShapes(d).find(s=>s.role==='leaf').pts[1][1];
      return {before:leafBefore, after:leafAfter, flip:d.flip};`);
    eq(r.flip, true);
    ok(Math.sign(r.before) === -Math.sign(r.after) && Math.abs(r.before) > 1,
      `the leaf must cross the wall: ${r.before} -> ${r.after}`);
  });

  t('flip hand moves the hinge to the other jamb', () => {
    const r = R(SETUP + `
      const w=addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
      const d=addOpening('door',w,3000,'sgl900');
      const a=doorShapes(d).find(s=>s.role==='swing').c[0];
      flipHand(d);
      const b=doorShapes(d).find(s=>s.role==='swing').c[0];
      return {a,b,hand:d.hand};`);
    eq(r.hand, -1);
    close(r.a, 3000 - 450, 1e-6, 'hinge starts at the near jamb');
    close(r.b, 3000 + 450, 1e-6, 'and moves to the far jamb');
  });

  t('a double door has no hand to flip', () => {
    const r = R(SETUP + `
      const w=addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
      const d=addOpening('door',w,3000,'dbl1500');
      const before=d.hand;
      flipHand(d);
      return {applies:flipHandApplies(d), before, after:d.hand};`);
    eq(r.applies, false, 'symmetrical leaves have no hand');
    eq(r.before, r.after, 'and flipping it must do nothing');
  });

  t('flip grips sit off the wall and drive the flip when dragged', () => {
    const r = R(SETUP + `
      const w=addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
      const d=addOpening('door',w,3000,'sgl900');
      const g=gripsOf(d);
      const facing=g.find(x=>x.k==='facing'), hand=g.find(x=>x.k==='hand');
      applyGrip(d,'facing',[3000,-900]);
      const flipped=d.flip;
      applyGrip(d,'facing',[3000,900]);
      return {kinds:g.map(x=>x.k).sort(), facingOffWall:Math.abs(facing.p[1])>50,
              hasHand:!!hand, flipped, back:d.flip};`);
    eq(r.kinds.join(','), 'c,e,facing,hand,s');
    eq(r.facingOffWall, true, 'the facing grip must sit clear of the wall');
    eq(r.flipped, true, 'dragging it across flips the door');
    eq(r.back, false, 'and dragging it back flips it again');
  });

  /* ============================================================ */
  group('rooms: any shape, associative');

  const L_WALLS = `
    const P=[[0,0],[8000,0],[8000,4000],[4000,4000],[4000,8000],[0,8000]];
    for(let i=0;i<P.length;i++) addEnt({t:'wall',a:P[i],b:P[(i+1)%P.length],wt:'gen100',layer:'A-WALL'});`;

  t('an L-shaped room traces all six inner faces exactly', () => {
    const r = R(SETUP + L_WALLS + `
      const ring=roomTrace([1000,1000],0);
      return ring && {n:ring.length, area:polyArea(ring),
        pts:ring.map(p=>[Math.round(p[0]*1e6)/1e6,Math.round(p[1]*1e6)/1e6])};`);
    ok(r, 'the L-shaped space must trace');
    eq(r.n, 6, 'six corners, not a bounding rectangle');
    /* inner faces sit 50 inside each 100-thick centreline */
    const want = [[7950, 50], [7950, 3950], [3950, 3950], [3950, 7950], [50, 7950], [50, 50]];
    const got = r.pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const exp = want.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let i = 0; i < 6; i++) eqPt(got[i], exp[i], 1e-6, 'corner ' + i);
    close(r.area, 7900 * 3900 + 3900 * 4000, 1e-6, 'exact L area');
  });

  t('a rectangular room is exact to the inner faces', () => {
    const r = R(SETUP + `
      const c=[[0,0],[6000,0],[6000,4000],[0,4000]];
      for(let i=0;i<4;i++) addEnt({t:'wall',a:c[i],b:c[(i+1)%4],wt:'gen100',layer:'A-WALL'});
      const ring=roomTrace([3000,2000],0);
      return {n:ring.length, area:polyArea(ring)};`);
    eq(r.n, 4);
    close(r.area, 5900 * 3900, 1e-6);
  });

  t('moving a wall resizes the room and keeps it enclosed', () => {
    const r = R(SETUP + `
      const c=[[0,0],[6000,0],[6000,4000],[0,4000]];
      const ws=c.map((p,i)=>addEnt({t:'wall',a:p,b:c[(i+1)%4],wt:'gen100',layer:'A-WALL'}));
      const room=addEnt({t:'room',pts:roomTrace([3000,2000],0),seed:[3000,2000],auto:true,name:'A',layer:'A-AREA'});
      const before=entArea(room);
      mut(ws[0]); ws[0].b=[8000,0];
      mut(ws[1]); ws[1].a=[8000,0]; ws[1].b=[8000,4000];
      mut(ws[2]); ws[2].a=[8000,4000];
      const after=entArea(room);
      return {before, after, corners:(roomBoundary(room)||[]).length};`);
    close(r.before, 5900 * 3900, 1e-6, 'before the wall moved');
    close(r.after, 7900 * 3900, 1e-6, 'the room followed the wall');
    eq(r.corners, 4, 'and it is still a closed quadrilateral');
  });

  t('an open space is refused rather than guessed at', () => {
    const r = R(SETUP + `
      addEnt({t:'wall',a:[0,0],b:[6000,0],wt:'gen100',layer:'A-WALL'});
      addEnt({t:'wall',a:[0,4000],b:[6000,4000],wt:'gen100',layer:'A-WALL'});
      return roomTrace([3000,2000],0);`);
    eq(r, null, 'two parallel walls do not enclose anything');
  });

  t('a room keeps its last good shape when the walls open up', () => {
    const r = R(SETUP + `
      const c=[[0,0],[6000,0],[6000,4000],[0,4000]];
      const ws=c.map((p,i)=>addEnt({t:'wall',a:p,b:c[(i+1)%4],wt:'gen100',layer:'A-WALL'}));
      const room=addEnt({t:'room',pts:roomTrace([3000,2000],0),seed:[3000,2000],auto:true,layer:'A-AREA'});
      const before=entArea(room);
      delWallCascade(ws[2].id);
      const after=entArea(room);
      return {before, after};`);
    close(r.after, r.before, 1e-6, 'a broken enclosure must not collapse the room to zero');
  });

  t('a detached room stops following the walls', () => {
    const r = R(SETUP + `
      const c=[[0,0],[6000,0],[6000,4000],[0,4000]];
      const ws=c.map((p,i)=>addEnt({t:'wall',a:p,b:c[(i+1)%4],wt:'gen100',layer:'A-WALL'}));
      const room=addEnt({t:'room',pts:roomTrace([3000,2000],0),seed:[3000,2000],auto:false,layer:'A-AREA'});
      const before=entArea(room);
      mut(ws[1]); ws[1].a=[9000,0]; ws[1].b=[9000,4000];
      return {before, after:entArea(room)};`);
    close(r.after, r.before, 1e-6, 'a hand-drawn boundary is not associative');
  });

  t('room tags honour the chosen units and the alternate', () => {
    const r = R(SETUP + `
      const room=addEnt({t:'room',pts:[[0,0],[4000,0],[4000,3000],[0,3000]],
        name:'X', areaUnits:'m2', altUnits:'ft2', layer:'A-AREA'});
      const a=polyArea(room.pts);
      return {m2:roomAreaText(room,a), alt:roomAltText(room,a),
              sqmm:areaIn(a,'sqmm'), labels:roomShapes(room).filter(s=>s.text!=null).map(s=>s.text)};`);
    eq(r.m2, '12.00 m²');
    eq(r.alt, '(129.17 ft²)');
    eq(r.sqmm, '12000000 mm²');
    eq(r.labels.length, 3, 'name, area and alternate area');
    eq(r.labels[0], 'X');
  });

  /* ============================================================ */
  group('stairs: L and U with a landing');

  t('a straight flight is unchanged', () => {
    const r = R(SETUP + `
      const s=addEnt({t:'stair',a:[0,0],b:[3000,0],w:1000,risers:16,rise:187,layer:'A-FLOR-STRS'});
      const C=stairCalc(s), P=stairPath(s);
      return {kind:C.kind, legs:P.legs.length, treads:C.treads, tread:C.tread, area:entArea(s)};`);
    eq(r.kind, 'straight'); eq(r.legs, 1); eq(r.treads, 15);
    close(r.tread, 200, 1e-9); close(r.area, 3000 * 1000, 1e-6);
  });

  t('an L stair splits the risers either side of a landing', () => {
    const r = R(SETUP + `
      const s=addEnt({t:'stair',a:[0,0],b:[3000,0],w:1000,risers:16,rise:187,tread:280,
        kind:'L',landing:1000,turn:1,layer:'A-FLOR-STRS'});
      const C=stairCalc(s), P=stairPath(s);
      const sh=stairShapes(s);
      return {legs:P.legs.length, r1:C.r1, r2:C.r2, sum:C.r1+C.r2, risers:C.risers,
              landing:P.landing, plates:sh.filter(x=>x.closed&&x.role==='face').length,
              arrow:sh.find(x=>x.role==='arrow').pts.length};`);
    eq(r.legs, 2, 'two flights, joined by an explicit landing plate');
    eq(r.sum, r.risers, 'every riser is accounted for');
    eq(r.plates, 1, 'the landing draws as one closed plate');
    ok(r.arrow >= 3, 'the walking line turns with the stair');
  });

  t('the landing is a true rectangle, square to the flights', () => {
    const r = R(SETUP + `
      const out={};
      for (const kind of ['L','U']) {
        resetDoc();
        const s=addEnt({t:'stair',a:[0,0],b:[3000,0],w:1000,risers:16,tread:280,
          kind, landing:1000, turn:1, layer:'A-FLOR-STRS'});
        const L=stairPath(s).landing;
        out[kind]={
          diagonalsEqual: Math.abs(dist(L[0],L[2])-dist(L[1],L[3])),
          e0:dist(L[0],L[1]), e1:dist(L[1],L[2]), e2:dist(L[2],L[3]), e3:dist(L[3],L[0]),
        };
      }
      return out;`);
    /* a parallelogram has equal diagonals only when it is a rectangle — this is
       what caught the U landing being built across a diagonal */
    close(r.L.diagonalsEqual, 0, 1e-6, 'L landing must be rectangular');
    close(r.U.diagonalsEqual, 0, 1e-6, 'U landing must be rectangular');
    close(r.L.e0, 1000, 1e-6); close(r.L.e1, 1000, 1e-6, 'L landing is a square of the stair width');
    close(r.U.e1, 2000, 1e-6, 'U landing is two widths across to carry both flights');
  });

  t('the L corner closes: flight two leaves the landing centre', () => {
    const r = R(SETUP + `
      const s=addEnt({t:'stair',a:[0,0],b:[3000,0],w:1000,risers:16,tread:280,
        kind:'L',landing:1000,turn:1,layer:'A-FLOR-STRS'});
      const P=stairPath(s);
      return {start2:P.legs[1][0], centre:P.landCentre, end1:P.legs[0][1]};`);
    eqPt(r.start2, r.centre, 1e-9, 'flight two starts at the landing centre, not its far edge');
    close(r.end1[0], 3000, 1e-6, 'flight one ends where you dragged to');
  });

  t('the turn direction mirrors the second flight', () => {
    const r = R(SETUP + `
      const mk=turn=>{ resetDoc();
        const s=addEnt({t:'stair',a:[0,0],b:[3000,0],w:1000,risers:16,tread:280,
          kind:'L',landing:1000,turn,layer:'A-FLOR-STRS'});
        return stairPath(s).legs[1][1]; };
      return {left:mk(1), right:mk(-1)};`);
    close(r.left[0], r.right[0], 1e-6, 'both turns leave the same landing');
    ok(Math.sign(r.left[1]) === -Math.sign(r.right[1]) && Math.abs(r.left[1]) > 1,
      `left and right must go opposite ways: ${r.left[1]} vs ${r.right[1]}`);
  });

  t('a U stair returns alongside itself', () => {
    const r = R(SETUP + `
      const s=addEnt({t:'stair',a:[0,0],b:[3000,0],w:1200,risers:18,tread:280,
        kind:'U',landing:1200,turn:1,layer:'A-FLOR-STRS'});
      const P=stairPath(s);
      const first=P.legs[0], last=P.legs[1];
      const u1=norm(sub(first[1],first[0])), u2=norm(sub(last[1],last[0]));
      return {legs:P.legs.length, dotDir:dot(u1,u2), offset:Math.abs(last[0][1]-first[0][1])};`);
    eq(r.legs, 2);
    close(r.dotDir, -1, 1e-6, 'the second flight runs back the other way');
    close(r.offset, 1200, 1e-6, 'offset by the stair width');
  });

  t('the point you drag to sets the first flight', () => {
    const r = R(SETUP + `
      const mk=len=>{ resetDoc();
        const s=addEnt({t:'stair',a:[0,0],b:[len,0],w:1000,risers:16,tread:280,
          kind:'L',landing:1000,turn:1,layer:'A-FLOR-STRS'});
        return {run1:stairCalc(s).run1, end:stairPath(s).legs[0][1][0]}; };
      return {short:mk(2000), long:mk(6000)};`);
    close(r.short.run1, 2000, 1e-6); close(r.long.run1, 6000, 1e-6);
    close(r.short.end, 2000, 1e-6, 'flight one ends at the point you picked');
    close(r.long.end, 6000, 1e-6);
  });

  t('changing the shape does not lose the riser count', () => {
    const r = R(SETUP + `
      const s=addEnt({t:'stair',a:[0,0],b:[3000,0],w:1000,risers:17,tread:280,layer:'A-FLOR-STRS'});
      const out={};
      for(const k of ['straight','L','U']){ mut(s); s.kind=k; const C=stairCalc(s); out[k]=C.risers; }
      return out;`);
    eq(r.straight, 17); eq(r.L, 17); eq(r.U, 17);
  });

  t('every stair shape survives export and drawing', () => {
    const r = R(SETUP + `
      const bad=[];
      for(const k of ['straight','L','U']){
        resetDoc();
        addEnt({t:'stair',a:[0,0],b:[3000,0],w:1000,risers:16,tread:280,kind:k,landing:1000,turn:1,layer:'A-FLOR-STRS'});
        try{ paint(); exportDXF(); exportSVG(); bbox([...DOC.ents.values()][0]); }
        catch(e){ bad.push(k+': '+e.message); }
      }
      return bad;`);
    eq(r.length, 0, r.join(' | '));
  });

  /* ============================================================
     roomBoundary() must not mutate the document.

     It used to cache its traced polygon straight onto the entity
     "for save/export" — a write performed during a *read*, with no
     mut() and no journal entry. Undo therefore could not restore
     it, so immediately after an undo the room still carried the
     polygon for the wall positions that undo had just reverted,
     and a file written in that window persisted a state the user
     had never created and could not get back to.
     ============================================================ */
  group('rooms: reading a boundary never mutates the document');

  /* The exact sequence that produced a corrupt file: trace, edit, trace,
     undo, save. The saved polygon must describe the room as it stands
     after the undo, not as it was before. */
  t('a save straight after undo writes the post-undo room, not the pre-undo one', () => {
    const r = R(`${SETUP}
      const W = 6000, H = 4000;
      const c = [[0,0],[W,0],[W,H],[0,H]];
      for (let i = 0; i < 4; i++)
        addEnt({t:'wall', a:c[i], b:c[(i+1)%4], wt:'gen100', layer:'A-WALL'});
      const room = addEnt({t:'room', seed:[W/2,H/2], auto:true, layer:'A-AREA'});
      const before = polyArea(roomBoundary(room));

      /* Widen the room by 2000mm. Every vertex sitting on the right-hand edge
         moves together — dragging the right wall alone would just open a gap
         at both corners, and an unenclosed room traces to null, which measures
         nothing. */
      begin();
      for (const w of [...DOC.ents.values()].filter(e => e.t === 'wall')) {
        mut(w);
        if (w.a[0] === W) w.a = [W + 2000, w.a[1]];
        if (w.b[0] === W) w.b = [W + 2000, w.b[1]];
      }
      commit('widen');
      /* re-read while the wall is moved — this is the read that used to
         write the wider polygon onto the entity, outside the journal */
      const widened = polyArea(roomBoundary(room));

      undo();

      /* save WITHOUT re-reading the boundary first, exactly as a user
         hitting Ctrl+S straight after Ctrl+Z would */
      const saved = JSON.parse(saveNative()).ents.find(e => e.t === 'room');
      return { before, widened, savedArea: polyArea(saved.pts),
               liveArea: polyArea(roomBoundary(room)) };`);

    ok(r.widened > r.before * 1.2, 'the edit really did widen the room');
    close(r.liveArea, r.before, 1, 'after undo the live boundary is the original again');
    close(r.savedArea, r.before, 1,
      'the SAVED polygon must be the post-undo room — got ' + Math.round(r.savedArea) +
      ', expected ' + Math.round(r.before) + ' (pre-undo was ' + Math.round(r.widened) + ')');
  });

  /* The narrower invariant, stated on its own so a future refactor cannot
     quietly reintroduce the write: reading is not an edit. */
  t('reading a boundary bumps neither DOCV nor the undo stack', () => {
    const r = R(`${SETUP}
      const c = [[0,0],[6000,0],[6000,4000],[0,4000]];
      for (let i = 0; i < 4; i++)
        addEnt({t:'wall', a:c[i], b:c[(i+1)%4], wt:'gen100', layer:'A-WALL'});
      const room = addEnt({t:'room', seed:[3000,2000], auto:true, layer:'A-AREA'});
      roomBoundary(room);                     /* prime the cache */
      const v0 = DOCV, h0 = HIST.past.length, p0 = JSON.stringify(room.pts || null);
      for (let i = 0; i < 5; i++) roomBoundary(room);
      return { dv: DOCV - v0, dh: HIST.past.length - h0,
               entityChanged: JSON.stringify(room.pts || null) !== p0 };`);
    eq(r.dv, 0, 'DOCV must not move');
    eq(r.dh, 0, 'no undo step may be pushed');
    eq(r.entityChanged, false, 'the entity itself must be untouched by a read');
  });

  /* Materialising for the file is still required: an automatic room stores a
     seed, not a polygon, so a saved file must carry a usable outline. */
  t('the saved file still carries a real polygon for an automatic room', () => {
    const r = R(`${SETUP}
      const c = [[0,0],[6000,0],[6000,4000],[0,4000]];
      for (let i = 0; i < 4; i++)
        addEnt({t:'wall', a:c[i], b:c[(i+1)%4], wt:'gen100', layer:'A-WALL'});
      addEnt({t:'room', seed:[3000,2000], auto:true, layer:'A-AREA'});
      const saved = JSON.parse(saveNative()).ents.find(e => e.t === 'room');
      return { n: (saved.pts || []).length, area: polyArea(saved.pts || []),
               seedKept: !!saved.seed, stillAuto: saved.auto === true };`);
    eq(r.n, 4, 'four corners written to the file');
    close(r.area, 5900 * 3900, 1, 'and they describe the real traced room');
    ok(r.seedKept && r.stillAuto, 'it stays an automatic room on reload');
  });

  /* ============================================================
     Phase 2 debt: things the drawing knew and did not say, and
     input it trusted that it should not have.
     ============================================================ */
  group('rooms: an open room says so');

  /* An unenclosed room kept its last good area and drew it in exactly the same
     style as a measured one. In an AEC tool that number reaches schedules and
     printed drawings looking entirely legitimate. */
  t('a room whose walls open is drawn dashed and labelled', () => {
    const r = R(`${SETUP}
      const c = [[0,0],[6000,0],[6000,4000],[0,4000]];
      for (let i = 0; i < 4; i++)
        addEnt({t:'wall', a:c[i], b:c[(i+1)%4], wt:'gen100', layer:'A-WALL'});
      const room = addEnt({t:'room', seed:[3000,2000], auto:true, name:'LIVING', layer:'A-AREA'});
      const shut = { open: roomIsOpen(room),
                     lt: (roomShapes(room)[0] || {}).lt,
                     txt: roomShapes(room).filter(s => s.text != null).map(s => s.text) };
      /* knock a wall out: the seed is no longer enclosed */
      const w = [...DOC.ents.values()].find(e => e.t === 'wall');
      begin(); eraseEnt(w.id); commit('open it');
      const open = { open: roomIsOpen(room),
                     lt: (roomShapes(room)[0] || {}).lt,
                     txt: roomShapes(room).filter(s => s.text != null).map(s => s.text) };
      return { shut, open };`);
    eq(r.shut.open, false, 'a closed room is not flagged');
    ok(!r.shut.lt, 'and is drawn with the ordinary linetype');
    ok(!r.shut.txt.join(' ').includes('not enclosed'), 'and says nothing about enclosure');
    eq(r.open.open, true, 'once the walls open it must know');
    eq(r.open.lt, 'dashed', 'the outline must go dashed');
    ok(r.open.txt.join(' ').includes('not enclosed'),
      'and the tag must say so, got: ' + JSON.stringify(r.open.txt));
  });

  /* Reading a boundary still must not mutate — the flag lives beside the cache,
     not on the entity. */
  t('the open flag does not write to the entity', () => {
    const r = R(`${SETUP}
      addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'gen100', layer:'A-WALL'});
      const room = addEnt({t:'room', seed:[3000,2000], auto:true, layer:'A-AREA'});
      const before = JSON.stringify(room);
      const v0 = DOCV, h0 = HIST.past.length;
      for (let i = 0; i < 4; i++) roomIsOpen(room);
      return { changed: JSON.stringify(room) !== before,
               dv: DOCV - v0, dh: HIST.past.length - h0 };`);
    eq(r.changed, false, 'the entity must be untouched');
    eq(r.dv, 0); eq(r.dh, 0);
  });

  group('project file: untrusted input');

  /* Only the properties panel guarded wall thickness, so a hand-edited or
     corrupted .ocad could put a negative th into the document, where it
     survives every later edit and crosses the faces over each other. */
  t('a corrupt project file is repaired, not swallowed whole', () => {
    const r = R(`${SETUP}
      const bad = JSON.stringify({
        app:'orthograph', v:2, units:'mm', layers:[newLayer('0')], cur:'0',
        ents: [
          { id:1, t:'wall', a:[0,0], b:[4000,0], th:-230, wt:'gen100', layer:'0' },
          { id:2, t:'wall', a:[0,1000], b:[4000,1000], th:0, wt:'gen100', layer:'0' },
          { id:3, t:'line', a:[0,0], b:[Infinity,0], layer:'0' },
          { id:4, t:'circle', c:[0,0], r:-50, layer:'0' },
          { id:5, t:'wall', a:[0,2000], b:[4000,2000], th:230, wt:'gen100', layer:'0' },
        ],
      });
      loadNative(bad);
      const ents = [...DOC.ents.values()];
      const w1 = ents.find(e => e.id === 1), w5 = ents.find(e => e.id === 5);
      return { n: ents.length,
               negDropped: w1 ? w1.th == null : null,
               negEffective: w1 ? wallT(w1) : null,
               zeroDropped: (ents.find(e => e.id === 2) || {}).th == null,
               infiniteGone: !ents.some(e => e.id === 3),
               negRadiusGone: !ents.some(e => e.id === 4),
               goodKept: w5 ? w5.th : null };`);
    eq(r.negDropped, true, 'a negative thickness must not reach the document');
    ok(r.negEffective > 0, 'and the wall falls back to its type: ' + r.negEffective);
    eq(r.zeroDropped, true, 'nor a zero one');
    eq(r.infiniteGone, true, 'a non-finite point poisons every bbox it reaches');
    eq(r.negRadiusGone, true, 'a negative radius is not a circle');
    eq(r.goodKept, 230, 'and a legitimate thickness is left alone');
  });
};
