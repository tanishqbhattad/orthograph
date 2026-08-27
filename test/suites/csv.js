'use strict';
/* ============================================================
   Getting a schedule out of the drawing

   A door schedule is a thing somebody orders from. It could be
   placed in the drawing and looked at, and that was all — to get
   the numbers into an order, a cost plan or a spreadsheet you
   retyped them, which is how a schedule and a building stop
   agreeing with each other.
   ============================================================ */
const SETUP = `
  resetDoc();
  DOC.units = 'mm'; V.w = 1200; V.h = 800; V.z = 1; V.px = 0; V.py = 800; V.rot = 0;
  ensureLayer('A-WALL');
`;
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('a table becomes a csv');

  t('rows and columns come out in order', () => {
    const r = R(`${SETUP}
      const tb = { t:'table', rows: [['Mark','Door','W','H'],
                                     ['D-01','Single 900','900','2100'],
                                     ['D-02','Double 1500','1500','2100']] };
      return { csv: tableCSV(tb) };`);
    const lines = r.csv.split(/\r?\n/);
    eq(lines[0], 'Mark,Door,W,H', 'the header');
    eq(lines[1], 'D-01,Single 900,900,2100', 'and the rows under it');
    eq(lines.length, 3, 'three lines, no trailing blank');
  });

  /* A comma inside a cell that is not quoted moves every column after it one
     to the left, which is the classic way a schedule silently becomes wrong. */
  t('a comma in a cell does not become a new column', () => {
    const r = R(`${SETUP}
      const tb = { t:'table', rows: [['Room','Finish'],
                                     ['Hall','Oak, sealed'],
                                     ['Store','Vinyl']] };
      const csv = tableCSV(tb);
      return { csv, line: csv.split(/\\r?\\n/)[1] };`);
    eq(r.line, 'Hall,"Oak, sealed"',
      'only the cell that needs quoting gets it, got ' + r.line);
  });

  t('a quote in a cell is doubled, the way a csv reader expects', () => {
    const r = R(`${SETUP}
      const tb = { t:'table', rows: [['Note'], ['A 900 "clear" opening']] };
      return { line: tableCSV(tb).split(/\\r?\\n/)[1] };`);
    eq(r.line, '"A 900 ""clear"" opening"', 'got ' + r.line);
  });

  t('a newline inside a cell stays inside it', () => {
    const r = R(`${SETUP}
      const tb = { t:'table', rows: [['Note'], ['two' + String.fromCharCode(10) + 'lines']] };
      const csv = tableCSV(tb);
      return { csv, quoted: csv.indexOf('"two') >= 0 };`);
    eq(r.quoted, true, 'the cell is quoted so the line break is data, not a row: ' + r.csv);
  });

  t('an empty table is refused rather than written as nothing', () => {
    const r = R(`${SETUP}
      return { empty: tableCSV({ t:'table', rows: [] }), none: tableCSV(null) };`);
    eq(r.empty, '', 'nothing in, nothing out');
    eq(r.none, '', 'and no table at all is not a crash');
  });

  group('the command');

  t('TABLEEXPORT writes the selected schedule out', () => {
    const r = R(`${SETUP}
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[10000,0], wt:'cav300', layer:'A-WALL'});
      addEnt({t:'door', host:w.id, pos:2000, dt:'sgl900', layer:'A-DOOR'});
      addEnt({t:'door', host:w.id, pos:6000, dt:'dbl1500', layer:'A-DOOR'});
      commit('d');
      markOpenings('door');
      cancelCmd(); startCmd('doorschedule'); cmdPoint([12000, 6000]); endCmd(true);
      const tb = [...DOC.ents.values()].find(e => e.t === 'table');
      let got = null;
      const real = download;
      globalThis.download = (name, text, mime) => { got = { name, text, mime }; };
      SEL.clear(); SEL.add(tb.id);
      cancelCmd(); startCmd('tableexport'); endCmd(true);
      globalThis.download = real;
      return { name: got && got.name, mime: got && got.mime,
               lines: got ? got.text.split(/\\r?\\n/).length : 0,
               header: got ? got.text.split(/\\r?\\n/)[0] : '' };`);
    ok(r.name && /\.csv$/.test(r.name), 'it writes a .csv, got ' + r.name);
    ok(r.mime && /csv/.test(r.mime), 'with a csv mime type, got ' + r.mime);
    eq(r.header, 'Mark,Door,W,H,Wall,Fire,Acoustic Rw,Finish',
      'the schedule header survives, specification columns and all');
    eq(r.lines, 3, 'a header and two doors');
  });

  t('the schedule name goes on the file, so two of them are not both table.csv', () => {
    const r = R(`${SETUP}
      begin();
      const w = addEnt({t:'wall', a:[0,0], b:[10000,0], wt:'cav300', layer:'A-WALL'});
      addEnt({t:'window', host:w.id, pos:4000, w:1200, h:1200, sill:900, layer:'A-GLAZ'});
      commit('d');
      markOpenings('window');
      cancelCmd(); startCmd('windowschedule'); cmdPoint([12000, 6000]); endCmd(true);
      const tb = [...DOC.ents.values()].find(e => e.t === 'table');
      let got = null;
      const real = download;
      globalThis.download = (name, text) => { got = name; };
      SEL.clear(); SEL.add(tb.id);
      cancelCmd(); startCmd('tableexport'); endCmd(true);
      globalThis.download = real;
      return { got, kind: tb.kind };`);
    eq(r.kind, 'windows', 'it is a window schedule');
    ok(r.got && r.got.indexOf('window') >= 0, 'and says so in the filename, got ' + r.got);
  });

  t('the Export dialog offers schedules, and writes every one in the drawing', () => {
    const r = R(`${SETUP}
      begin();
      addEnt({t:'table', p:[0,0], rows:[['Mark','Door'],['D-01','Single 900']], kind:'doors', layer:'0'});
      addEnt({t:'table', p:[0,9000], rows:[['Mark','Window'],['W-01','1200x1200']], kind:'windows', layer:'0'});
      commit('t');
      const files = [];
      const real = download;
      globalThis.download = (name, text) => { files.push(name); };
      doExport();
      const btn = document.getElementById('eCsv');
      /* the stub does not give textContent to children parsed out of innerHTML,
         so the label is read from the dialog markup it was written into */
      const card = document.getElementById('card');
      const label = (card && card.innerHTML) || '';
      if (btn && btn.onclick) btn.onclick();
      globalThis.download = real;
      return { hasButton: !!btn, label, files };`);
    eq(r.hasButton, true, 'the Export dialog has a schedules button');
    ok(/schedules \(\.csv\)/i.test(r.label), 'labelled so you know what you get');
    eq(r.files.length, 2, 'both schedules were written, got ' + r.files.join(', '));
    ok(r.files.some(f => /door/.test(f)) && r.files.some(f => /window/.test(f)),
      'each named for what it is: ' + r.files.join(', '));
  });

  t('a drawing with no schedules says so rather than writing nothing', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'}); commit('l');
      let wrote = 0;
      const real = download;
      globalThis.download = () => { wrote++; };
      const n = exportSchedules();
      globalThis.download = real;
      return { n, wrote };`);
    eq(r.n, 0, 'nothing to write');
    eq(r.wrote, 0, 'and nothing written');
  });

  t('exporting with nothing selected says so instead of writing an empty file', () => {
    const r = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[1000,0], layer:'0'}); commit('l');
      let wrote = 0;
      const real = download;
      globalThis.download = () => { wrote++; };
      SEL.clear();
      cancelCmd(); startCmd('tableexport'); endCmd(true);
      const noneSelected = wrote;
      SEL.add([...DOC.ents.values()][0].id);      /* a line, not a table */
      cancelCmd(); startCmd('tableexport'); endCmd(true);
      globalThis.download = real;
      return { noneSelected, afterLine: wrote };`);
    eq(r.noneSelected, 0, 'nothing selected writes nothing');
    eq(r.afterLine, 0, 'and a line is not a schedule');
  });
};
