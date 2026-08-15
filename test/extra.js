'use strict';
/* Auto-loads every test/suites/*.js so parallel work can add tests without
   fighting over one file. Each suite exports (ctx) => void and uses the
   helpers handed to it. */
const fs = require('fs'), path = require('path');
function runSuites(ctx) {
  const dir = path.join(__dirname, 'suites');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js')).sort()) {
    try {
      require(path.join(dir, f))(ctx);
    } catch (e) {
      ctx.group('suite ' + f);
      ctx.t('suite loads', () => { throw e; });
    }
  }
}
module.exports = { runSuites };
