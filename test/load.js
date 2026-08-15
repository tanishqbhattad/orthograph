'use strict';
/* Top-level let/const inside a vm script live in the context's lexical scope,
   so test code has to run *inside* the context rather than poking at it from
   outside. `run` does exactly that. */
const vm = require('vm');
const { bundle } = require('../build.js');
const { install } = require('./dom-stub.js');

function loadApp() {
  const sandbox = install({});
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(bundle(), sandbox, { filename: 'orthograph-bundle.js' });
  const run = (code) => vm.runInContext(`(function(){${code}})()`, sandbox, { filename: 'test-snippet.js' });
  /* full boot, exactly as the browser would do it */
  const bootApp = () => vm.runInContext('boot()', sandbox, { filename: 'boot.js' });
  run(`
    resetDoc();
    DOC.gridStep = 100; DOC.snapStep = 100; DOC.textH = 200;
    V.w = 1200; V.h = 800; V.z = 0.1; V.px = 100; V.py = 700;
  `);
  return { run, sandbox, bootApp };
}
module.exports = { loadApp };
