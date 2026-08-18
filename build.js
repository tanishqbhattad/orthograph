#!/usr/bin/env node
/* Concatenate src/*.js into the shell to make one self-contained HTML file.
   Usage: node build.js [outfile]                                        */
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, 'src');
const ORDER = [
  '00-core.js', '01-doc.js', '02-geom.js', '03-solve.js',
  '04a-wall.js', '04b-openings.js', '04c-components.js', '04d-area.js',
  '05-view.js', '06-snap.js', '07-cmd.js', '08-modify.js', '09-archcmd.js',
  '10-dxf.js', '11-io.js', '12-dwg.js', '13-ui.js', '14-events.js',
];
function bundle() {
  return ORDER.map(f => {
    const p = path.join(SRC, f);
    if (!fs.existsSync(p)) throw new Error('missing module: ' + f);
    return `/* ===== ${f} ===== */\n` + fs.readFileSync(p, 'utf8').replace(/^'use strict';\n/m, '');
  }).join('\n');
}
function build(out) {
  const shell = fs.readFileSync(path.join(SRC, 'shell.html'), 'utf8');
  const js = "'use strict';\n" + bundle();
  const html = shell.replace('/*__ORTHOGRAPH_BUNDLE__*/', () => js);
  fs.writeFileSync(out, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`built ${path.relative(process.cwd(), out)} — ${kb} KB, ${html.split('\n').length} lines`);
  return html;
}
module.exports = { bundle, build, ORDER, SRC };
if (require.main === module) build(process.argv[2] || path.join(__dirname, 'orthograph.html'));
