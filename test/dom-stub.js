/* Minimal DOM good enough to load the bundle headlessly.
   Deliberately dependency-free so `node test/run.js` always works. */
'use strict';
/* Which tag each id in the shell actually is.

   Every element used to be invented as a <div>, so #cmd — a real <input> —
   answered DIV. That made "is a text field focused" untestable, which is the
   guard the whole of this program's key routing turns on: the arrows belong
   to the command line while it has focus and to the crosshair otherwise, and
   headlessly both halves looked identical. Read from the shell so the stub
   cannot drift from the markup it is standing in for. */
const TAG_OF = (() => {
  const map = {};
  try {
    const fs = require('fs'), path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'shell.html'), 'utf8');
    const re = /<([a-zA-Z][\w-]*)\b[^>]*?\bid="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) map[m[2]] = m[1].toLowerCase();
  } catch (e) { /* no shell to read: everything stays a div, as before */ }
  return map;
})();

function makeCtx() {
  /* `sets` records assignments to the drawing state — fillStyle, strokeStyle,
     lineWidth — because WHAT was painted is as much a rendering fact as
     whether anything was. Without it a test can see four fills and not that
     they were four different tones, which is the whole claim in a drawing
     that poches a wall by what each layer is made of. */
  const trace = { calls: [], pts: [], counts: {}, sets: [] };
  const rec = (name, args) => {
    trace.counts[name] = (trace.counts[name] || 0) + 1;
    if (name === 'moveTo' || name === 'lineTo') trace.pts.push([args[0], args[1]]);
    if (name === 'arc' || name === 'ellipse') trace.pts.push([args[0], args[1]]);
    if (name === 'fillText' || name === 'strokeText') trace.calls.push([name, args[0]]);
    /* a fill takes the fill style standing at that moment: pair them up here,
       or the order they were set in has to be reconstructed by the reader */
    if (name === 'fill' || name === 'stroke')
      trace.calls.push([name, name === 'fill' ? store.fillStyle : store.strokeStyle]);
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
    set: (t, k, v) => {
      if (k === 'fillStyle' || k === 'strokeStyle' || k === 'lineWidth' || k === 'globalAlpha') trace.sets.push([k, v]);
      t[k] = v; return true;
    },
    has: () => true,
  });
}
class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = []; this.style = {}; this.dataset = {};
    this._cls = new Set(); this._html = ''; this._text = ''; this._value = '';
    this._listeners = {};
    this._selStart = 0; this._selEnd = 0;
    this.classList = {
      add: (...c) => c.forEach(x => this._cls.add(x)),
      remove: (...c) => c.forEach(x => this._cls.delete(x)),
      toggle: (c, f) => { const on = f === undefined ? !this._cls.has(c) : !!f; on ? this._cls.add(c) : this._cls.delete(c); },
      contains: c => this._cls.has(c),
    };
  }
  /* A real element keeps innerHTML and textContent in step: set one and the
     other follows. The stub kept them as two unrelated strings, so anything
     built with el(tag, cls, html) — which is most of this UI — read back as
     having no text at all, and every assertion about what a control SAYS was
     silently unfalsifiable. */
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = v == null ? '' : String(v);
    this._text = this._html.replace(/<[^>]*>/g, '');
    this.children.length = 0;
  }
  get textContent() {
    if (this._text) return this._text;
    /* and a node with children reports their text, as the DOM does */
    return (this.children || []).map(c => c.textContent || '').join('');
  }
  set textContent(v) { this._text = v == null ? '' : String(v); this._html = this._text; }
  /* Attributes. Without these the stub could not carry aria-label, role,
     tabindex or aria-pressed at all — so nothing about whether a control is
     NAMED could be asserted, which is exactly the kind of thing that rots
     quietly because only a screen reader would notice. */
  setAttribute(k, v) {
    this._attrs = this._attrs || new Map();
    this._attrs.set(String(k), v == null ? '' : String(v));
    if (k === 'class') this.className = String(v == null ? '' : v);
    if (k === 'title') this.title = String(v == null ? '' : v);
  }
  getAttribute(k) {
    if (k === 'class') return this.className;
    if (k === 'title' && this.title != null && !(this._attrs && this._attrs.has('title')))
      return this.title;
    return this._attrs && this._attrs.has(String(k)) ? this._attrs.get(String(k)) : null;
  }
  hasAttribute(k) { return this.getAttribute(k) != null; }
  removeAttribute(k) { if (this._attrs) this._attrs.delete(String(k)); }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  /* A real input.value is a DOMString whatever you assign to it. The stub kept
     whatever type it was handed, so a formatter that started returning a string
     looked like a behaviour change here and like nothing at all in a browser. */
  get value() { return this._value; }
  set value(v) { this._value = v == null ? '' : String(v); this._selStart = this._selEnd = this._value.length; }
  get selectionStart() { return this._selStart; }
  get selectionEnd() { return this._selEnd; }
  setSelectionRange(a, b) { this._selStart = a | 0; this._selEnd = b | 0; }
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
    /* stopImmediatePropagation stops the listeners registered AFTER the one
       that called it. Ignoring it meant a handler that deliberately runs first
       and swallows the key — which is how the command line takes the arrows
       back from history recall — could not be tested at all. */
    for (const f of (this._listeners[ev && ev.type] || []).slice()) {
      if (ev && ev._stopped) break;
      f(ev);
    }
    return !(ev && ev.defaultPrevented);
  }
  setPointerCapture() { } releasePointerCapture() { }
  getBoundingClientRect() { return { left: 0, top: 0, right: this.width || 1200, bottom: this.height || 800, width: this.width || 1200, height: this.height || 800 }; }
  querySelector() { return null; }
  /* Scoped to this element's descendants. It returned [] unconditionally,
     which is worse than missing: a test that scopes a query to one row —
     "these four icons are named" — passed by finding nothing at all. The
     document-level version had exactly this bug and was fixed once; the
     element one was left behind. */
  querySelectorAll(sel) {
    const want = String(sel || '').trim().split(/\s*,\s*/).filter(Boolean);
    if (!want.length) return [];
    const hit = n => want.some(w => {
      const parts = w.split(/\s+/);
      const q = parts[parts.length - 1];
      if (q[0] === '.') return n._cls && n._cls.has(q.slice(1));
      if (q[0] === '#') return n.id === q.slice(1);
      return n.tagName === q.toUpperCase();
    });
    const out = [];
    const self = this;
    (function walk(n) {
      if (!n) return;
      if (n !== self && hit(n)) out.push(n);
      for (const c of (n.children || [])) walk(c);
    })(this);
    return out;
  }
  querySelector(sel) { const r = this.querySelectorAll(sel); return r.length ? r[0] : null; }
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
    /* the real <html> element: the app stamps the theme onto it so the
       stylesheet and the canvas cannot disagree about which one is on */
    documentElement: new El('html'),
    createElement: t => new El(t),
    getElementById: id => {
      if (!byId.has(id)) { const e = new El(TAG_OF[id] || 'div'); e.id = id; byId.set(id, e); }
      return byId.get(id);
    },
    querySelector: s => (s && s[0] === '#') ? doc.getElementById(s.slice(1)) : new El('div'),
    /* Walks the tree for #id, .class and tag selectors. It returned [] before,
       which quietly made every DOM-structure assertion vacuously true: a test
       could ask how many rows a dialog rendered, be told none, and pass. */
    querySelectorAll: sel => {
      const want = String(sel || '').trim().split(/\s*,\s*/).filter(Boolean);
      if (!want.length) return [];
      const hit = n => want.some(w => {
        const parts = w.split(/\s+/);            /* only the last term is matched */
        const q = parts[parts.length - 1];
        if (q[0] === '.') return n._cls && n._cls.has(q.slice(1));
        if (q[0] === '#') return n.id === q.slice(1);
        return n.tagName === q.toUpperCase();
      });
      const out = [];
      (function walk(n) {
        if (!n) return;
        if (n !== doc.body && hit(n)) out.push(n);
        for (const c of (n.children || [])) walk(c);
      })(doc.body);
      /* elements created but never attached to body are still reachable by id,
         so sweep those too rather than reporting a dialog as empty */
      for (const n of byId.values()) {
        (function walk(m) {
          if (!m || out.includes(m)) return;
          if (hit(m)) out.push(m);
          for (const c of (m.children || [])) walk(c);
        })(n);
      }
      return out;
    },
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
      for (const f of (winListeners[ev.type] || []).slice()) {
        if (ev._stopped) break;
        f(ev);
      }
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
    stopImmediatePropagation() { this._stopped = true; }
  };
  /* the base Event. Without it a test could send a key but not an input
     event, which is how half the command line is actually driven. */
  g.Event = class Event {
    constructor(type, o) {
      o = o || {};
      this.type = type; this.bubbles = !!o.bubbles;
      this.cancelable = !!o.cancelable; this.defaultPrevented = false;
      this.target = null;
    }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    stopPropagation() { }
    stopImmediatePropagation() { }
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
    stopImmediatePropagation() { this._stopped = true; }
  };
  /* a click, for the buttons the command line and the prompt now put on
     screen. `detail` and the coordinates are what a handler is allowed to
     read; nothing in this app reads more. */
  g.MouseEvent = class MouseEvent {
    constructor(type, o) {
      o = o || {};
      this.type = type; this.button = o.button == null ? 0 : o.button;
      this.clientX = o.clientX || 0; this.clientY = o.clientY || 0;
      this.shiftKey = !!o.shiftKey; this.ctrlKey = !!o.ctrlKey;
      this.altKey = !!o.altKey; this.metaKey = !!o.metaKey;
      this.bubbles = !!o.bubbles; this.cancelable = o.cancelable !== false;
      this.defaultPrevented = false;
    }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    stopPropagation() { }
    stopImmediatePropagation() { this._stopped = true; }
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
