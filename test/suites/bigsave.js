'use strict';
/* ============================================================
   Autosave for a drawing that outgrew localStorage

   localStorage is about 5MB and synchronous. The synchronous
   part is the reason it is used at all: the last write anyone
   gets is the one during beforeunload, and there is nothing to
   await at that moment.

   So it stays the primary store, and IndexedDB sits underneath
   it as an overflow tier — no practical size cap, but delivered
   through events, so it can only be counted on for the timed
   writes. What localStorage keeps in the overflow case is a
   pointer small enough that it can always be written, including
   on the way out.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
`;
/* localStorage, including running out of room; plus an overflow store that
   answers immediately so the synchronous harness can watch it work */
const FAKE = `
  const mkStore = (cap) => ({
    map: new Map(), cap: cap || Infinity,
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; },
    setItem(k, v) {
      if (String(v).length > this.cap) throw new Error('QuotaExceededError');
      this.map.set(k, String(v));
    },
    removeItem(k) { this.map.delete(k); },
  });
  const mkBig = (broken) => ({
    map: new Map(), puts: 0, gets: 0, dels: 0,
    put(k, v, cb) { this.puts++;
      if (broken) return cb && cb(false);
      this.map.set(k, String(v)); if (cb) cb(true); },
    get(k, cb) { this.gets++;
      if (broken) return cb && cb(null);
      cb(this.map.has(k) ? this.map.get(k) : null); },
    del(k, cb) { this.dels++; this.map.delete(k); if (cb) cb(true); },
  });
  const draw2 = (n) => { begin();
    for (let i = 0; i < n; i++) addEnt({t:'wall', a:[i*6000,0], b:[i*6000+5000,0], wt:'cav300', layer:'A-WALL'});
    commit('w'); };
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('a drawing too big for localStorage');

  t('is autosaved to the overflow store instead of being abandoned', () => {
    const r = R(`${SETUP}${FAKE}
      const small = mkStore(2000);          /* room for a pointer, not a drawing */
      const big = mkBig(); setStore(small); setBigStore(big);
      draw2(60);
      const wrote = autosaveNow('test');
      const ptr = small.getItem(AUTOSAVE.key);
      const parsed = ptr ? JSON.parse(ptr) : null;
      setBigStore(null);
      return { wrote, puts: big.puts, ptrLen: ptr ? ptr.length : 0,
               ptrIsPointer: !!(parsed && parsed.big), ptrHasDoc: !!(parsed && parsed.doc),
               stored: big.map.size };`);
    eq(r.wrote, true, 'the work is saved somewhere');
    eq(r.puts, 1, 'the overflow store took it');
    eq(r.stored, 1, 'and is holding it');
    eq(r.ptrIsPointer, true, 'localStorage keeps a pointer to it');
    eq(r.ptrHasDoc, false, 'and not the drawing itself');
    ok(r.ptrLen < 2000, 'small enough to write on the way out, ' + r.ptrLen + ' bytes');
  });

  t('comes back from the overflow store', () => {
    const r = R(`${SETUP}${FAKE}
      const small = mkStore(2000); const big = mkBig();
      setStore(small); setBigStore(big);
      draw2(60);
      const before = DOC.ents.size;
      autosaveNow('test');
      resetDoc();
      const empty = DOC.ents.size;
      let got = null, restored = false;
      autosaveFetch(rec => { got = rec; restored = autosaveRestore(rec); });
      setBigStore(null);
      return { before, empty, after: DOC.ents.size, restored,
               gotDoc: !!(got && got.doc), gets: big.gets };`);
    ok(r.before > 50, 'a real drawing went in');
    eq(r.empty, 0, 'the document was cleared');
    eq(r.gets, 1, 'the overflow store was asked for it');
    eq(r.gotDoc, true, 'and handed back the drawing');
    eq(r.restored, true, 'which restored');
    eq(r.after, r.before, 'with everything in it');
  });

  /* A small drawing must not leave a large stale copy behind: recovery would
     then have two candidates and no way to tell which session they came from. */
  t('a small drawing goes to localStorage and clears any overflow copy', () => {
    const r = R(`${SETUP}${FAKE}
      const small = mkStore(); const big = mkBig();
      setStore(small); setBigStore(big);
      draw2(60); autosaveNow('fits');       /* fits: goes to localStorage */
      const firstPuts = big.puts;
      big.map.set(AUTOSAVE.key, 'stale');   /* pretend an earlier session overflowed */
      begin(); addEnt({t:'line', a:[0,0], b:[1,1], layer:'0'}); commit('l');
      autosaveNow('small');
      const rec = JSON.parse(small.getItem(AUTOSAVE.key));
      setBigStore(null);
      return { firstPuts, hasDoc: !!rec.doc, isPointer: !!rec.big, leftOver: big.map.size };`);
    eq(r.firstPuts, 0, 'a drawing that fits never touches the overflow store');
    eq(r.hasDoc, true, 'localStorage holds the whole drawing');
    eq(r.isPointer, false, 'not a pointer');
    eq(r.leftOver, 0, 'and the stale overflow copy is cleared');
  });

  t('saving to a file clears both stores', () => {
    const r = R(`${SETUP}${FAKE}
      const small = mkStore(2000); const big = mkBig();
      setStore(small); setBigStore(big);
      draw2(60); autosaveNow('test');
      markSaved();
      const left = { small: small.getItem(AUTOSAVE.key), big: big.map.size };
      setBigStore(null);
      return left;`);
    eq(r.small, null, 'the pointer is gone');
    eq(r.big, 0, 'and so is the drawing behind it');
  });

  t('a fetch with nothing stored hands back nothing, and still calls back', () => {
    const r = R(`${SETUP}${FAKE}
      setStore(mkStore()); setBigStore(mkBig());
      let called = 0, rec = 'untouched';
      autosaveFetch(x => { called++; rec = x; });
      setBigStore(null);
      return { called, rec };`);
    eq(r.called, 1, 'the callback always runs, or recovery would hang');
    eq(r.rec, null, 'with nothing to offer');
  });

  group('when there is no overflow store either');

  t('an unavailable IndexedDB degrades to the honest message, never a throw', () => {
    const r = R(`${SETUP}${FAKE}
      const small = mkStore(2000); const big = mkBig(true);   /* refuses everything */
      setStore(small); setBigStore(big);
      draw2(60);
      let threw = false, wrote = null;
      try { wrote = autosaveNow('test'); } catch (e) { threw = true; }
      setBigStore(null);
      return { threw, wrote };`);
    eq(r.threw, false, 'autosave must never throw into an edit');
    eq(r.wrote, false, 'and it does not claim to have saved');
  });

  t('no overflow store at all is simply the old behaviour', () => {
    const r = R(`${SETUP}${FAKE}
      const small = mkStore(2000);
      setStore(small); setBigStore(null);
      draw2(60);
      let threw = false, wrote = null;
      try { wrote = autosaveNow('test'); } catch (e) { threw = true; }
      return { threw, wrote };`);
    eq(r.threw, false, 'still no throw');
    eq(r.wrote, false, 'and still honest about it');
  });

  t('a pointer whose drawing has vanished is not offered as recoverable', () => {
    const r = R(`${SETUP}${FAKE}
      const small = mkStore(2000); const big = mkBig();
      setStore(small); setBigStore(big);
      draw2(60); autosaveNow('test');
      big.map.clear();                       /* the overflow store lost it */
      let rec = 'untouched';
      autosaveFetch(x => { rec = x; });
      setBigStore(null);
      return { rec };`);
    eq(r.rec, null, 'a pointer to nothing is nothing');
  });
};
