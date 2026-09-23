#!/usr/bin/env node
/* Write a DWG from Orthograph to a file, so a real reader can be asked what
   it makes of it. The only verification available here is another program's
   importer: this program's own reader proves self-consistency and nothing
   about whether AutoCAD will open the file.

   Usage: node tools/make_dwg.js [outfile]                                  */
const { loadApp } = require('../test/load.js');
const fs = require('fs'), path = require('path');
const out = process.argv[2] || path.join(__dirname, '..', 'test', 'out', 'probe.dwg');
const { run } = loadApp();
const bytes = run(`
  resetDoc(); ensureLayer('A-WALL');
  begin();
  addEnt({t:'line', a:[0,0], b:[5000,0], layer:'A-WALL'});
  addEnt({t:'circle', c:[2500,2000], r:800, layer:'A-WALL'});
  commit('probe');
  return Array.from(new Uint8Array(exportDWG()));
`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(bytes));
const b = Buffer.from(bytes);
console.log(`${path.relative(process.cwd(), out)} — ${b.length} bytes, ${b.slice(0, 6).toString('ascii')}`);
