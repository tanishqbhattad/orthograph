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
  g.window = {
    addEventListener: () => { }, innerWidth: 1400, innerHeight: 900, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: f => 0,
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
