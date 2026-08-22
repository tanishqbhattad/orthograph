/* Minimal DOM good enough to load the bundle headlessly.
   Deliberately dependency-free so `node test/run.js` always works. */
'use strict';
function makeCtx() {
  const trace = { calls: [], pts: [], counts: {} };
  const rec = (name, args) => {
    trace.counts[name] = (trace.counts[name] || 0) + 1;
    if (name === 'moveTo' || name === 'lineTo') trace.pts.push([args[0], args[1]]);
    if (name === 'arc' || name === 'ellipse') trace.pts.push([args[0], args[1]]);
    if (name === 'fillText' || name === 'strokeText') trace.calls.push([name, args[0]]);
  };
  const store = {
    __trace: trace,
    canvas: null,
    measureText: t => ({ width: String(t).length * 6 }),
    getImageData: () => ({ data: [] }),
    createLinearGradient: () => ({ addColorStop: () => { } }),
    createPattern: () => null,
  };
  return new Proxy(store, {
    get: (t, k) => {
      if (k in t) return t[k];
      return (...args) => rec(k, args);
    },
    set: (t, k, v) => { t[k] = v; return true; },
    has: () => true,
  });
}
class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = []; this.style = {}; this.dataset = {};
    this._cls = new Set(); this.innerHTML = ''; this.textContent = ''; this.value = '';
    this._listeners = {};
    this.classList = {
      add: (...c) => c.forEach(x => this._cls.add(x)),
      remove: (...c) => c.forEach(x => this._cls.delete(x)),
      toggle: (c, f) => { const on = f === undefined ? !this._cls.has(c) : !!f; on ? this._cls.add(c) : this._cls.delete(c); },
      contains: c => this._cls.has(c),
    };
  }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  append(...cs) { cs.forEach(c => this.appendChild(c)); }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(t, f) { (this._listeners[t] || (this._listeners[t] = [])).push(f); }
  removeEventListener() { }
  dispatch(t, ev) { (this._listeners[t] || []).forEach(f => f(ev)); }
  /* the standard spelling, so tests can send real Event objects */
  dispatchEvent(ev) {
    /* the DOM sets target on dispatch; handlers here read ev.target.closest */
    if (ev && ev.target == null) ev.target = this;
    (this._listeners[ev && ev.type] || []).slice().forEach(f => f(ev));
    return !(ev && ev.defaultPrevented);
  }
  setPointerCapture() { } releasePointerCapture() { }
  getBoundingClientRect() { return { left: 0, top: 0, right: this.width || 1200, bottom: this.height || 800, width: this.width || 1200, height: this.height || 800 }; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  focus() { } select() { } blur() { } click() { }
  /* a real context knows its canvas, and the renderer derives its device
     scale from that pair — so the stub has to link them the same way */
  getContext() { if (!this._ctx) { this._ctx = makeCtx(); this._ctx.canvas = this; } return this._ctx; }
  toBlob(cb) { cb({}); }
  contains() { return false; }
}
function install(g) {
  const byId = new Map();
  const doc = {
    body: new El('body'),
    createElement: t => new El(t),
    getElementById: id => { if (!byId.has(id)) { const e = new El('div'); e.id = id; byId.set(id, e); } return byId.get(id); },
    querySelector: s => (s && s[0] === '#') ? doc.getElementById(s.slice(1)) : new El('div'),
    querySelectorAll: () => [],
    addEventListener: () => { },
    activeElement: null,
  };
  const cv = doc.getElementById('cv');
  cv.width = 1200; cv.height = 800;
  g.document = doc;
  /* Window events are real here, not swallowed. They used to be a no-op, which
     meant every window-level key handler in the app was unregistered under
     test — so none of the keyboard behaviour was reachable headlessly, and a
     whole class of bug (a toggle that is dead while a field has focus) could
     only ever be found by driving a browser. */
  const winListeners = Object.create(null);
  g.window = {
    innerWidth: 1400, innerHeight: 900, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: f => 0,
    addEventListener(t, f) { (winListeners[t] || (winListeners[t] = [])).push(f); },
    removeEventListener(t, f) {
      const a = winListeners[t]; if (!a) return;
      const i = a.indexOf(f); if (i >= 0) a.splice(i, 1);
    },
    dispatchEvent(ev) {
      for (const f of (winListeners[ev.type] || []).slice()) f(ev);
      return !ev.defaultPrevented;
    },
  };
  /* and enough of PointerEvent, so pointer-driven behaviour (panning, band
     selection, grip drags) is reachable headlessly instead of only in a
     browser */
  g.PointerEvent = class PointerEvent {
    constructor(type, o) {
      o = o || {};
      this.type = type; this.button = o.button == null ? 0 : o.button;
      this.buttons = o.buttons == null ? 1 : o.buttons;
      this.clientX = o.clientX || 0; this.clientY = o.clientY || 0;
      this.pointerId = o.pointerId == null ? 1 : o.pointerId;
      this.altKey = !!o.altKey; this.shiftKey = !!o.shiftKey;
      this.ctrlKey = !!o.ctrlKey; this.metaKey = !!o.metaKey;
      this.bubbles = !!o.bubbles; this.cancelable = o.cancelable !== false;
      this.defaultPrevented = false;
    }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    stopPropagation() { }
  };
  /* enough of the KeyboardEvent shape for the app's handlers to read */
  g.KeyboardEvent = class KeyboardEvent {
    constructor(type, o) {
      o = o || {};
      this.type = type; this.key = o.key || '';
      this.ctrlKey = !!o.ctrlKey; this.metaKey = !!o.metaKey;
      this.shiftKey = !!o.shiftKey; this.altKey = !!o.altKey;
      this.repeat = !!o.repeat; this.bubbles = !!o.bubbles;
      this.cancelable = !!o.cancelable; this.defaultPrevented = false;
      this.target = doc.activeElement || doc.body;
    }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    stopPropagation() { }
  };
  g.navigator = { maxTouchPoints: 0 };
  g.requestAnimationFrame = f => 0;
  g.cancelAnimationFrame = () => { };
  g.matchMedia = g.window.matchMedia;
  g.ResizeObserver = class { observe() { } disconnect() { } };
  g.Blob = class { constructor(p) { this.parts = p; } };
  g.URL = { createObjectURL: () => 'blob:', revokeObjectURL: () => { } };
  g.FileReader = class { readAsText() { } };
  g.setTimeout = setTimeout; g.clearTimeout = clearTimeout;
  g.console = console;
  g.ORTHO_HEADLESS = true;
  return g;
}
module.exports = { install, El };
