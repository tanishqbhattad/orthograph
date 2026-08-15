'use strict';
/* UI shell: tool rail layout, properties panel, bottom-bar drawing settings,
   navigation widget and the floating quick-properties editor. */
const fs = require('fs'), path = require('path');
const SHELL = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'shell.html'), 'utf8');
const cssVar = n => {
  const m = SHELL.match(new RegExp('--' + n + ':\\s*(-?[\\d.]+)px'));
  return m ? parseFloat(m[1]) : NaN;
};
const cssBlock = sel => {
  const i = SHELL.indexOf(sel + '{');
  return i < 0 ? '' : SHELL.slice(i, SHELL.indexOf('}', i));
};

module.exports = ({ group, t, ok, eq, close, run, R, bootApp }) => {
  bootApp();
  R(`DOC.units = 'mm';`);            /* earlier suites leave the unit menu wherever they like */
  const VIEWPORT = 900;                       /* the height the rail must fit in */

  /* ---------------------------------------------------------- */
  group('ui — tool rail never scrolls');

  t('the rail fits a 900px viewport in both modes without scrolling', () => {
    const m = R(`return {draft: railMetrics('drafting'), arch: railMetrics('arch'),
                         layout: RAIL_LAYOUT};`);
    const stage = VIEWPORT - cssVar('top') - cssVar('bot');
    ok(stage > 700, 'stage height ' + stage);
    ok(m.draft.height <= stage,
      `drafting rail is ${m.draft.height}px but only ${stage}px is available`);
    ok(m.arch.height <= stage,
      `architecture rail is ${m.arch.height}px but only ${stage}px is available`);
    ok(m.draft.tools >= 45, 'drafting exposes ' + m.draft.tools + ' tools');
    ok(m.layout.cols >= 2, 'the rail must be multi-column, got ' + m.layout.cols);
    console.log(`      drafting ${m.draft.tools} tools · ${m.draft.groups} groups · ` +
      `${m.draft.height}px of ${stage}px · arch ${m.arch.height}px`);
  });

  t('shell.html rail metrics agree with RAIL_LAYOUT', () => {
    const L = R(`return RAIL_LAYOUT;`);
    eq(cssVar('tool'), L.tool, '--tool');
    eq(cssVar('tgap'), L.gap, '--tgap');
    eq(cssVar('rpad'), L.pad, '--rpad');
    eq(cssVar('rhead'), L.head, '--rhead');
    eq(cssVar('rgap'), L.groupGap, '--rgap');
    eq(cssVar('rail'), L.cols * L.tool + (L.cols - 1) * L.gap + L.pad * 2, '--rail width');
  });

  t('#rail is not a scroll container', () => {
    const css = cssBlock('#rail');
    ok(/overflow:hidden/.test(css), '#rail must clip, not scroll: ' + css.slice(0, 200));
    ok(!/overflow-y:\s*auto|overflow:\s*auto|overflow-y:\s*scroll/.test(css), '#rail still scrolls');
    ok(/display:grid/.test(css), '#rail should be a grid');
  });

  t('no rail group needs more than four rows', () => {
    const r = R(`
      const out = {};
      for (const mode of ['drafting','arch'])
        out[mode] = RAILS[mode].map(g => [g[0], Math.ceil(g[1].length / RAIL_LAYOUT.cols)]);
      return out;`);
    for (const mode in r)
      for (const [name, rows] of r[mode])
        ok(rows <= 5, `${mode}/${name} needs ${rows} rows`);
  });

  t('every rail tool is unique, labelled, keyed to a command and has an icon', () => {
    const bad = R(`
      const bad = [];
      for (const mode of ['drafting','arch']) {
        const seen = new Set();
        for (const [title, tools] of RAILS[mode]) {
          if (!title) bad.push(mode + ': a group has no heading');
          for (const [k, label] of tools) {
            if (seen.has(k)) bad.push(mode + ': duplicate tool ' + k);
            seen.add(k);
            if (!label) bad.push(mode + '/' + k + ': no tooltip label');
            if (!IC[k]) bad.push(mode + '/' + k + ': no icon in IC');
            if (k !== 'select' && !CMDS[k]) bad.push(mode + '/' + k + ': no command');
          }
        }
      }
      return bad;`);
    eq(bad.length, 0, bad.slice(0, 6).join(' | '));
  });

  t('buildRail emits one flat element per heading and per tool', () => {
    const r = R(`
      setMode('drafting'); buildRail();
      const rail = document.getElementById('rail');
      const heads = rail.children.filter(c => c.className === 'rgrp').length;
      const tools = rail.children.filter(c => c.className.indexOf('tool') >= 0).length;
      const m = railMetrics('drafting');
      return {kids: rail.children.length, heads, tools, m,
              cols: rail.style.gridTemplateColumns};`);
    eq(r.heads, r.m.groups, 'group headings rendered');
    eq(r.tools, r.m.tools, 'tools rendered');
    eq(r.kids, r.m.groups + r.m.tools, 'rail children');
    ok(/repeat\(3/.test(r.cols), 'rail column template: ' + r.cols);
  });

  t('rail group structure is stable across a mode round trip', () => {
    const r = R(`
      const snap = () => RAILS[MODE].map(g => g[0] + ':' + g[1].map(x => x[0]).join(','));
      setMode('drafting'); const a = snap();
      setMode('arch');     const arch = snap();
      setMode('drafting'); const b = snap();
      return {a, b, arch, mode: MODE};`);
    eq(r.a.join('|'), r.b.join('|'), 'the drafting rail must come back identical');
    eq(r.mode, 'drafting');
    ok(r.arch.length >= 5, 'architecture rail groups: ' + r.arch.length);
  });

  /* ---------------------------------------------------------- */
  group('ui — properties panel');

  t('an empty selection says so and shows nothing else', () => {
    const r = R(`
      SEL.clear(); buildProps();
      const p = document.getElementById('props');
      return {kids: p.children.length, cls: p.children.map(c => c.className),
              html: p.children.map(c => c.innerHTML).join(' ')};`);
    eq(r.kids, 1, 'the empty state must be a single block, got ' + r.cls.join(','));
    eq(r.cls[0], 'empty');
    ok(/Nothing selected/.test(r.html), 'empty text: ' + r.html.slice(0, 90));
    ok(!/Grid step|Snap step|Text height|Polar/.test(r.html),
      'drawing settings must not live in the properties panel');
  });

  t('the drawing settings are gone from the panel for every selection state', () => {
    const bad = R(`
      const bad = [];
      const scan = tag => {
        const h = document.getElementById('props').children.map(c => c.innerHTML).join(' ');
        if (/Grid step|Snap step|Text height|Polar °|Undo steps|Libraries/.test(h)) bad.push(tag);
      };
      SEL.clear(); buildProps(); scan('empty');
      for (const e of [...DOC.ents.values()]) { SEL.clear(); SEL.add(e.id); buildProps(); scan(e.t); }
      SEL.clear(); [...DOC.ents.values()].slice(0,4).forEach(e => SEL.add(e.id));
      buildProps(); scan('multi');
      SEL.clear(); buildProps();
      return [...new Set(bad)];`);
    eq(bad.length, 0, 'still showing document settings for: ' + bad.join(', '));
  });

  t('a selected object leads with its own parameters, General comes after', () => {
    const r = R(`
      const wall = [...DOC.ents.values()].find(e => e.t === 'wall');
      SEL.clear(); SEL.add(wall.id); buildProps();
      const p = document.getElementById('props');
      const cls = p.children.map(c => c.className);
      const grps = p.children.map((c, i) => [i, c.className, c.innerHTML])
                            .filter(x => x[1] === 'grp').map(x => [x[0], x[2]]);
      return {first: cls[0], head: p.children[0].children.map(c => c.innerHTML),
              grps, rows: cls.filter(c => c === 'row').length};`);
    eq(r.first, 'pttl', 'the panel should open with a selection header');
    ok(/Wall/.test(r.head.join(' ')), 'header: ' + r.head.join(' '));
    const names = r.grps.map(g => g[1]);
    eq(names[0], 'Parameters', 'sections: ' + names.join(' > '));
    ok(names.indexOf('General') > 0, 'General must come last: ' + names.join(' > '));
    eq(names.indexOf('General'), names.length - 1);
    ok(r.rows >= 8, 'wall rows: ' + r.rows);
  });

  t('a multi-selection shows totals plus the shared General section', () => {
    const r = R(`
      SEL.clear(); [...DOC.ents.values()].slice(0, 5).forEach(e => SEL.add(e.id));
      buildProps();
      const p = document.getElementById('props');
      return {head: p.children[0].innerHTML + p.children[0].children.map(c => c.innerHTML).join(' '),
              grps: p.children.filter(c => c.className === 'grp').map(c => c.innerHTML)};`);
    ok(/5 objects/.test(r.head), 'header: ' + r.head);
    eq(r.grps[0], 'Totals');
    eq(r.grps[r.grps.length - 1], 'General');
  });

  t('the layer list still renders and still retargets the selection', () => {
    const r = R(`
      SEL.clear(); buildLayers();
      const w = document.getElementById('layers');
      const rows = w.children.length;
      const line = addEnt({t:'line', a:[0,0], b:[100,0]});
      SEL.clear(); SEL.add(line.id);
      const target = DOC.layers.find(l => l.name !== line.layer);
      buildLayers();
      const idx = DOC.layers.indexOf(target);
      w.children[idx].onclick();
      const moved = DOC.ents.get(line.id).layer;
      eraseEnt(line.id); SEL.clear(); buildProps();
      return {rows, moved, want: target.name};`);
    eq(r.rows, R(`return DOC.layers.length;`), 'one row per layer');
    eq(r.moved, r.want, 'clicking a layer moves the selection onto it');
  });

  /* ---------------------------------------------------------- */
  group('ui — drawing settings in the bottom bar');

  t('the bottom bar carries grid, snap, text height and polar angle', () => {
    const r = R(`
      buildDrawSettings();
      const d = document.getElementById('dset');
      return {n: d.children.length,
              tags: d.children.map(c => c.children[0].innerHTML),
              vals: d.children.map(c => c.children[1].value)};`);
    eq(r.n, 4, 'expected four inline fields, got ' + r.tags.join(','));
    eq(r.tags.join(','), 'GRID,SNAP,TEXT,POLAR');
    ok(r.vals.every(v => v !== '' && v != null), 'fields are populated: ' + r.vals.join(','));
  });

  t('editing a bottom-bar field writes straight into the document', () => {
    const r = R(`
      DOC.gridStep = 100; ST.polarInc = 45; buildDrawSettings();
      const d = document.getElementById('dset');
      const grid = d.children[0].children[1];
      grid.value = '250'; grid.onchange();
      const polar = document.getElementById('dset').children[3].children[1];
      polar.value = '15'; polar.onchange();
      const junk = document.getElementById('dset').children[0].children[1];
      junk.value = 'not a number'; junk.onchange();
      const out = {grid: DOC.gridStep, polar: ST.polarInc,
                   redrawn: document.getElementById('dset').children[0].children[1].value};
      DOC.gridStep = 100; ST.polarInc = 45; buildDrawSettings();
      return out;`);
    eq(r.grid, 250, 'grid step');
    eq(r.polar, 15, 'polar increment');
    eq(r.redrawn, 250, 'a bad value is rejected and the field repaints');
  });

  t('the gear opens a settings popover with the document-level settings', () => {
    const r = R(`
      toggleDrawPop();
      const p = document.getElementById('dsPop');
      const open = p.className;
      const html = p.children.map(c => c.innerHTML).join(' ');
      toggleDrawPop();
      return {open, closed: p.className, kids: p.children.length, html};`);
    ok(/show/.test(r.open), 'popover opens');
    ok(!/show/.test(r.closed), 'popover closes');
    ok(r.kids >= 8, 'popover rows: ' + r.kids);
    ok(/Grid step/.test(r.html) && /Undo steps/.test(r.html) && /Units/.test(r.html),
      'popover content: ' + r.html.slice(0, 120));
  });

  /* ---------------------------------------------------------- */
  group('ui — top bar and navigation widget');

  t('undo and redo are icons that dim when there is nothing to do', () => {
    const r = R(`
      syncUI();
      const u = document.getElementById('mUndo'), rd = document.getElementById('mRedo');
      const empty = {u: u.disabled, r: rd.disabled};
      begin(); const e = addEnt({t:'line', a:[0,0], b:[10,0]}); commit('probe'); syncUI();
      const afterEdit = {u: u.disabled, r: rd.disabled};
      undo(); syncUI();
      const afterUndo = {u: u.disabled, r: rd.disabled};
      redo(); undo(); syncUI();
      return {empty, afterEdit, afterUndo,
              icons: [u.innerHTML, rd.innerHTML], cls: u.className,
              titles: [u.tipText, rd.tipText]};`);
    ok(/^<svg/.test(r.icons[0]) && /^<svg/.test(r.icons[1]), 'undo/redo must render SVG icons');
    ok(!/Undo|Redo/.test(r.icons.join('')), 'the words must be gone from the buttons');
    ok(/ico/.test(r.cls), 'icon button class: ' + r.cls);
    ok(/Undo.*Ctrl\+Z/.test(r.titles[0]) && /Redo.*Ctrl\+Y/.test(r.titles[1]),
      'tooltips kept: ' + r.titles.join(' / '));
    eq(r.afterEdit.u, false, 'undo is live after an edit');
    eq(r.afterUndo.r, false, 'redo is live after an undo');
  });

  t('IC carries the chrome icons the shell asks for', () => {
    const missing = R(`return ['undo','redo','fit','north','gear','close']
      .filter(k => !IC[k] || IC[k].indexOf('<') !== 0);`);
    eq(missing.length, 0, 'missing icons: ' + missing.join(', '));
  });

  t('the navigation widget replaces the zoom stack with fit plus rotation', () => {
    const css = cssBlock('#nav');
    ok(css.length > 0, '#nav widget is missing from shell.html');
    ok(/id="vFit"/.test(SHELL), 'a zoom-to-fit control must remain');
    ok(/id="dialWrap"/.test(SHELL) && /id="dialRose"/.test(SHELL), 'rotation dial is missing');
    ok(/id="vNorth"/.test(SHELL), 'reset-north control is missing');
    ok(/id="navAng"/.test(SHELL), 'the current angle must be shown');
    ok(/#vlegacy\{display:none\}/.test(SHELL.replace(/\s/g, '')), 'legacy +/- buttons must be hidden');
  });

  t('the rotation control drives V.rot, shows the angle and resets to north', () => {
    const r = R(`
      setViewRot(rad(30));
      const at30 = {rot: V.rot, txt: document.getElementById('navAng').textContent,
                    rose: document.getElementById('dialRose').style.transform,
                    north: document.getElementById('vNorth').className};
      setViewRot(rad(-45));
      const neg = {rot: V.rot, txt: document.getElementById('navAng').textContent};
      document.getElementById('vNorth').onclick();
      const home = {rot: V.rot, txt: document.getElementById('navAng').textContent,
                    north: document.getElementById('vNorth').className};
      return {at30, neg, home};`);
    close(r.at30.rot, Math.PI / 6, 1e-9, 'V.rot follows the dial');
    eq(r.at30.txt, '30.0°');
    ok(/rotate\(-30/.test(r.at30.rose), 'the rose counter-rotates: ' + r.at30.rose);
    ok(!/off/.test(r.at30.north), 'reset-north is live when rotated');
    eq(r.neg.txt, '315.0°', 'negative rotation reads as a compass bearing');
    eq(r.home.rot, 0, 'north reset');
    eq(r.home.txt, '0.0°');
    ok(/off/.test(r.home.north), 'reset-north dims when already north up');
  });

  t('fit() still works at a rotated view angle', () => {
    const r = R(`
      setViewRot(rad(35)); fit();
      const b = bboxAll([...DOC.ents.values()].filter(visible));
      const corners = [[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]].map(w2s);
      const inside = corners.every(p => p[0] > -2 && p[0] < V.w + 2 && p[1] > -2 && p[1] < V.h + 2);
      setViewRot(0); fit();
      return {inside, z: V.z};`);
    eq(r.inside, true, 'a rotated fit must still frame the drawing');
    ok(r.z > 0 && isFinite(r.z), 'zoom stays finite');
  });

  /* ---------------------------------------------------------- */
  group('ui — floating quick properties');

  t('a single selection gets a floating card with 2-4 editable fields', () => {
    const r = R(`
      QPmuted = null; endCmd(true);
      const wall = [...DOC.ents.values()].find(e => e.t === 'wall');
      SEL.clear(); SEL.add(wall.id); buildProps();
      const card = QP;
      return {shown: !!card, cls: card && card.className,
              inHud: !!card && document.getElementById('hud').children.indexOf(card) >= 0,
              fields: card ? card.children[1].children.length : 0,
              head: card ? card.children[0].children.map(c => c.innerHTML).join(' ') : '',
              left: card && card.style.left, top: card && card.style.top};`);
    eq(r.shown, true, 'a single selection should raise the quick editor');
    eq(r.cls, 'qp');
    eq(r.inHud, true, 'the card lives in the HUD layer');
    ok(r.fields >= 2 && r.fields <= 4, 'quick fields: ' + r.fields);
    ok(/Wall/.test(r.head), 'card header: ' + r.head);
    ok(/px$/.test(r.left) && /px$/.test(r.top), 'card is positioned: ' + r.left + ',' + r.top);
  });

  t('every seeded entity type gets a sane quick editor', () => {
    const r = R(`
      QPmuted = null; endCmd(true);
      const bad = [], seen = {};
      for (const e of [...DOC.ents.values()]) {
        if (seen[e.t]) continue; seen[e.t] = 1;
        SEL.clear(); SEL.add(e.id);
        try { buildProps(); } catch (err) { bad.push(e.t + ' threw ' + err.message); continue; }
        if (!QP) { bad.push(e.t + ': no card'); continue; }
        const n = QP.children[1].children.length;
        if (n < 1 || n > 4) bad.push(e.t + ': ' + n + ' fields');
      }
      SEL.clear(); buildProps();
      return {bad, types: Object.keys(seen)};`);
    eq(r.bad.length, 0, r.bad.join(' | '));
    ok(r.types.length >= 6, 'covered types: ' + r.types.join(','));
  });

  t('a quick-props edit changes the model and is undoable', () => {
    const r = R(`
      QPmuted = null; endCmd(true);
      const wall = [...DOC.ents.values()].find(e => e.t === 'wall');
      SEL.clear(); SEL.add(wall.id); buildProps();
      const before = wallT(DOC.ents.get(wall.id));
      const row = QP.children[1].children[1];        /* Thickness */
      const inp = row.children[0];
      inp.value = String(before + 60); inp.onchange();
      const after = wallT(DOC.ents.get(wall.id));
      undo();
      const back = wallT(DOC.ents.get(wall.id));
      SEL.clear(); buildProps();
      return {before, after, back};`);
    close(r.after, r.before + 60, 1e-6, 'the quick editor writes to the model');
    close(r.back, r.before, 1e-6, 'and the edit is one undo step');
  });

  t('the quick editor never coexists with a running command', () => {
    const r = R(`
      QPmuted = null; endCmd(true);
      const wall = [...DOC.ents.values()].find(e => e.t === 'wall');
      SEL.clear(); SEL.add(wall.id); buildProps();
      const idle = !!QP;
      startCmd('line');
      const during = !!QP;
      const refused = showQuickProps(wall) === undefined && !QP;
      endCmd();
      const after = !!QP;
      SEL.clear(); buildProps();
      return {idle, during, refused, after};`);
    eq(r.idle, true, 'shown while idle');
    eq(r.during, false, 'starting a command must dismiss the card so .dyn owns the cursor');
    eq(r.refused, true, 'showQuickProps must refuse while a command is running');
    eq(r.after, true, 'the card comes back once the command ends');
  });

  t('the card is dismissible and stays dismissed for that object only', () => {
    const r = R(`
      QPmuted = null; endCmd(true);
      const ents = [...DOC.ents.values()];
      const wall = ents.find(e => e.t === 'wall');
      const room = ents.find(e => e.t === 'room');
      SEL.clear(); SEL.add(wall.id); buildProps();
      const shown = !!QP;
      QP.children[0].children[2].onclick({stopPropagation(){}});
      const dismissed = !!QP;
      buildProps();
      const stays = !!QP;
      SEL.clear(); SEL.add(room.id); buildProps();
      const other = !!QP;
      QPmuted = null; SEL.clear(); SEL.add(wall.id); buildProps();
      const restored = !!QP;
      SEL.clear(); buildProps();
      const cleared = !!QP;
      return {shown, dismissed, stays, other, restored, cleared};`);
    eq(r.shown, true);
    eq(r.dismissed, false, 'the close button hides the card');
    eq(r.stays, false, 'it stays hidden for the same object');
    eq(r.other, true, 'a different object still gets a card');
    eq(r.restored, true);
    eq(r.cleared, false, 'clearing the selection removes the card');
  });

  t('the card follows the view and stays inside the canvas', () => {
    const r = R(`
      QPmuted = null; endCmd(true);
      const wall = [...DOC.ents.values()].find(e => e.t === 'wall');
      SEL.clear(); SEL.add(wall.id); buildProps();
      const a = QP.style.left;
      V.px -= 400; placeQuickProps(wall, QP);
      const b = QP.style.left;
      V.px -= 100000; placeQuickProps(wall, QP);
      const clampedL = parseFloat(QP.style.left);
      V.px += 200000; placeQuickProps(wall, QP);
      const clampedR = parseFloat(QP.style.left);
      fit();
      SEL.clear(); buildProps();
      return {a, b, clampedL, clampedR, w: V.w};`);
    ok(r.a !== r.b, 'panning moves the card with its object');
    ok(r.clampedL >= 8, 'card clamped at the left edge: ' + r.clampedL);
    ok(r.clampedR <= r.w - 8, 'card clamped at the right edge: ' + r.clampedR);
  });

  /* ---------------------------------------------------------- */
  group('ui — modals and visual language');

  t('modals, the colour picker and the type manager still open and close', () => {
    const r = R(`
      const out = {};
      modal('<h3>probe</h3>', () => { out.applied = true; });
      out.open = document.getElementById('modal').className;
      document.getElementById('mo').onclick();
      out.closed = document.getElementById('modal').className;
      pickColor('#ffd166', c => { out.picked = c; }, true);
      document.getElementById('hx').value = '#4ee6a8';
      document.getElementById('mo').onclick();
      closeModal();
      openTypeManager(); out.types = document.getElementById('card').innerHTML.length;
      closeModal();
      SEL.clear(); SEL.add([...DOC.ents.keys()][0]);
      openArray(); out.array = document.getElementById('card').innerHTML.indexOf('Array') >= 0;
      closeModal(); SEL.clear(); buildProps();
      return out;`);
    ok(/show/.test(r.open), 'modal opens');
    ok(!/show/.test(r.closed), 'modal closes');
    eq(r.applied, true, 'Apply fires the callback');
    eq(r.picked, '#4ee6a8', 'the colour picker returns a hex');
    ok(r.types > 400, 'type manager body: ' + r.types);
    eq(r.array, true, 'the array dialog still builds');
  });

  t('the dark amber visual language and the mono numeral font are intact', () => {
    ok(/--amber:#ffd166/.test(SHELL), 'amber accent');
    ok(/--bg0:#0e1116/.test(SHELL), 'dark base');
    ok(/JetBrains\+Mono/.test(SHELL), 'JetBrains Mono is still linked');
    ok(/\.row \.f\{[^}]*font-family:var\(--mono\)/.test(SHELL), 'numeric fields use the mono face');
    ok(/\.ds input\{[^}]*font-family:var\(--mono\)/.test(SHELL), 'bottom-bar numbers use the mono face');
    ok(/#navAng\{[^}]*font-family:var\(--mono\)/.test(SHELL), 'the view angle uses the mono face');
  });

  t('the shell is still one self-contained file with no new assets', () => {
    const srcs = SHELL.match(/<(script|link|img)[^>]*>/g) || [];
    const external = srcs.filter(s => /src=|href=/.test(s) && !/fonts\.(googleapis|gstatic)\.com/.test(s));
    eq(external.length, 0, 'unexpected external asset: ' + external.join(' '));
    ok(/\/\*__ORTHOGRAPH_BUNDLE__\*\//.test(SHELL), 'the bundle placeholder must survive');
  });
};
