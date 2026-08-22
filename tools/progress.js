#!/usr/bin/env node
'use strict';
/* ============================================================
   Renders .critic/state.json → progress.html

   The work loop only ever edits the small JSON; this turns it
   into the page the user watches. Page self-refreshes, so it
   stays live in a browser tab while agents run.

     node tools/progress.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STATE = path.join(ROOT, '.critic', 'state.json');
const OUT = path.join(ROOT, 'progress.html');

const S = JSON.parse(fs.readFileSync(STATE, 'utf8'));
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const STATUS = {
  queued:   { label: 'queued',        cls: 'q' },
  building: { label: 'builder at work', cls: 'b' },
  critic:   { label: 'under critique', cls: 'c' },
  rework:   { label: 'sent back',     cls: 'r' },
  passed:   { label: 'critic wowed',  cls: 'p' },
  blocked:  { label: 'blocked',       cls: 'x' },
};

const waves = {};
for (const p of S.pieces) (waves[p.wave] = waves[p.wave] || []).push(p);

const done = S.pieces.filter(p => p.status === 'passed').length;
const pct = S.pieces.length ? Math.round(done / S.pieces.length * 100) : 0;

const scoreBar = (p) => {
  if (p.score == null) return '<span class="muted">—</span>';
  const w = Math.max(0, Math.min(10, p.score)) * 10;
  const cls = p.score >= 9 ? 'sc-hi' : p.score >= 7 ? 'sc-mid' : 'sc-lo';
  return `<div class="score"><div class="score-fill ${cls}" style="width:${w}%"></div><span>${p.score}/10</span></div>`;
};

const pieceRow = p => `
  <tr class="st-${STATUS[p.status] ? STATUS[p.status].cls : 'q'}">
    <td class="id">${esc(p.id)}</td>
    <td>
      <div class="pname">${esc(p.name)}</div>
      ${p.gap ? `<div class="gap"><b>biggest gap →</b> ${esc(p.gap)}</div>` : ''}
      ${p.won ? `<div class="won">${esc(p.won)}</div>` : ''}
    </td>
    <td class="ctr"><span class="badge ${STATUS[p.status] ? STATUS[p.status].cls : 'q'}">${STATUS[p.status] ? STATUS[p.status].label : p.status}</span></td>
    <td class="ctr rounds">${p.round ? 'R' + p.round : '—'}</td>
    <td class="ctr">${scoreBar(p)}</td>
    <td class="ctr verdict">${p.blind ? `<span class="bl ${p.blind === 'orthograph' ? 'win' : p.blind === 'tie' ? 'tie' : 'lose'}">${esc(p.blind)}</span>` : '<span class="muted">—</span>'}</td>
  </tr>`;

const html = `<!doctype html>
<meta charset="utf-8">
<meta http-equiv="refresh" content="15">
<title>Orthograph — live progress</title>
<style>
  :root{
    --bg:#0e1116; --panel:#151a22; --line:#232b36; --ink:#e6edf3; --dim:#8b98a9;
    --acc:#f5b544; --ok:#3fb950; --warn:#d29922; --bad:#f85149; --info:#58a6ff; --violet:#a371f7;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
       font:14px/1.5 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;padding:28px 22px 60px}
  .wrap{max-width:1180px;margin:0 auto}
  h1{font-size:19px;margin:0 0 2px;letter-spacing:.2px}
  h1 span{color:var(--acc)}
  .sub{color:var(--dim);font-size:12.5px;margin-bottom:20px}
  .bar{height:8px;background:var(--panel);border-radius:99px;overflow:hidden;border:1px solid var(--line);margin:14px 0 6px}
  .bar-fill{height:100%;background:linear-gradient(90deg,var(--acc),var(--ok));transition:width .4s}
  .barlab{display:flex;justify-content:space-between;font-size:12px;color:var(--dim);margin-bottom:22px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px;margin-bottom:26px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:11px 13px}
  .card .k{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.6px}
  .card .v{font-size:20px;font-weight:600;margin-top:3px;font-variant-numeric:tabular-nums}
  .card .v.ok{color:var(--ok)} .card .v.bad{color:var(--bad)} .card .v.acc{color:var(--acc)}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.9px;color:var(--dim);
     margin:26px 0 9px;border-bottom:1px solid var(--line);padding-bottom:7px}
  table{width:100%;border-collapse:collapse;background:var(--panel);
        border:1px solid var(--line);border-radius:9px;overflow:hidden}
  th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--dim);
     padding:9px 11px;border-bottom:1px solid var(--line);font-weight:500}
  td{padding:10px 11px;border-bottom:1px solid var(--line);vertical-align:top}
  tr:last-child td{border-bottom:none}
  .id{font-family:ui-monospace,Consolas,monospace;color:var(--dim);font-size:12px;white-space:nowrap}
  .pname{font-weight:500}
  .gap{color:var(--warn);font-size:12.2px;margin-top:4px;max-width:52ch}
  .gap b{color:var(--bad);font-weight:600}
  .won{color:var(--ok);font-size:12.2px;margin-top:4px;max-width:52ch}
  .ctr{text-align:center;white-space:nowrap}
  .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;white-space:nowrap;
         border:1px solid currentColor}
  .badge.q{color:var(--dim)} .badge.b{color:var(--info)} .badge.c{color:var(--violet)}
  .badge.r{color:var(--warn)} .badge.p{color:var(--ok)} .badge.x{color:var(--bad)}
  .rounds{font-family:ui-monospace,Consolas,monospace;color:var(--dim);font-size:12px}
  .score{position:relative;width:78px;height:16px;background:#0c0f14;border-radius:4px;
         border:1px solid var(--line);margin:0 auto;overflow:hidden}
  .score-fill{position:absolute;inset:0 auto 0 0;opacity:.32}
  .sc-hi{background:var(--ok)} .sc-mid{background:var(--warn)} .sc-lo{background:var(--bad)}
  .score span{position:relative;display:block;text-align:center;font-size:11px;line-height:14px;
              font-variant-numeric:tabular-nums}
  .bl{font-size:11.5px;padding:2px 7px;border-radius:4px}
  .bl.win{background:rgba(63,185,80,.15);color:var(--ok)}
  .bl.tie{background:rgba(210,153,34,.15);color:var(--warn)}
  .bl.lose{background:rgba(248,81,73,.15);color:var(--bad)}
  .muted{color:var(--dim)}
  ol.log{list-style:none;padding:0;margin:0;font-size:12.6px}
  ol.log li{padding:7px 0;border-bottom:1px solid var(--line);color:var(--dim);display:flex;gap:11px}
  ol.log li:last-child{border-bottom:none}
  ol.log time{color:#5d6b7d;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;flex:none}
  ol.log b{color:var(--ink);font-weight:500}
  footer{margin-top:26px;color:#5d6b7d;font-size:11.5px;text-align:center}
</style>
<div class="wrap">
  <h1>Orthograph <span>— live progress</span></h1>
  <div class="sub">${esc(S.headline || '')}</div>

  <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
  <div class="barlab"><span>${done} of ${S.pieces.length} pieces cleared by their critic</span><span>${pct}%</span></div>

  <div class="cards">
    ${(S.metrics || []).map(m => `<div class="card"><div class="k">${esc(m.k)}</div><div class="v ${esc(m.tone || '')}">${esc(m.v)}</div></div>`).join('')}
  </div>

  ${Object.keys(waves).sort().map(w => `
    <h2>Wave ${esc(w)} — ${esc((S.waveNames || {})[w] || '')}</h2>
    <table>
      <tr><th>id</th><th>piece</th><th class="ctr">status</th><th class="ctr">round</th>
          <th class="ctr">critic score</th><th class="ctr">blind pick</th></tr>
      ${waves[w].map(pieceRow).join('')}
    </table>`).join('')}

  <h2>Activity</h2>
  <ol class="log">
    ${(S.log || []).slice(-40).reverse().map(e => `<li><time>${esc(e.t)}</time><span>${e.b ? '<b>' + esc(e.b) + '</b> ' : ''}${esc(e.msg)}</span></li>`).join('')}
  </ol>

  <footer>updated ${esc(S.updated)} · refreshes every 15s · blind pick = which app a fresh critic chose without being told which was which</footer>
</div>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`progress.html written — ${done}/${S.pieces.length} passed (${pct}%)`);
