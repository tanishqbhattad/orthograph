'use strict';
/* ============================================================
   What AutoCAD is strict about

   ezdxf reads almost anything, which is why every DXF check
   here passed while AutoCAD refused the same file outright:

     Class separator for class AcDbDimStyleTable expected on
     line 828. Invalid or incomplete DXF input — drawing
     discarded.

   The DIMSTYLE table is the one symbol table in DXF whose
   header carries a SECOND subclass marker after the entry
   count — 100 AcDbDimStyleTable, then 71 with the number of
   entries. Every other table stops at AcDbSymbolTable. Ours
   stopped there too, so AutoCAD hit the first record where it
   expected the marker and discarded the whole drawing.

   These are structural assertions rather than round trips: a
   reader that accepts our file proves nothing about a reader
   that does not.
   ============================================================ */
const SETUP = `
  resetDoc(); ensureLayer('A-WALL');
  begin();
  addEnt({t:'wall', a:[0,0], b:[6000,0], wt:'gen100', layer:'A-WALL'});
  addEnt({t:'dim', k:'linear', p1:[0,0], p2:[6000,0], off:900, layer:'DIMENSIONS'});
  addEnt({t:'text', p:[0,1200], s:'HELLO', h:200, layer:'TEXT'});
  commit('w');
`;
/** the DXF as [code, value] pairs, which is the only way to read one */
const pairsOf = (dxf) => {
  const L = dxf.split(/\r\n|\n/);
  const out = [];
  for (let i = 0; i + 1 < L.length; i += 2) out.push([L[i].trim(), L[i + 1]]);
  return out;
};
/** the group codes of one table's header, up to its first record */
const tableHead = (dxf, name) => {
  const p = pairsOf(dxf);
  for (let i = 0; i < p.length; i++) {
    if (p[i][0] === '0' && p[i][1] === 'TABLE' && p[i + 1] && p[i + 1][1] === name) {
      const head = [];
      for (let j = i + 2; j < p.length; j++) {
        if (p[j][0] === '0') break;                 /* the first record starts here */
        head.push(p[j]);
      }
      return head;
    }
  }
  return null;
};
module.exports = ({ group, t, ok, eq, close, R }) => {

  group('the tables section');

  t('the DIMSTYLE table header carries the class marker AutoCAD demands', () => {
    const dxf = R(`${SETUP} return exportDXF();`);
    const head = tableHead(dxf, 'DIMSTYLE');
    ok(head, 'there is a DIMSTYLE table');
    const flat = head.map(x => x[0] + '=' + x[1]);
    ok(flat.indexOf('100=AcDbSymbolTable') >= 0, 'the ordinary marker: ' + flat.join(' '));
    ok(flat.indexOf('100=AcDbDimStyleTable') >= 0,
      'and the one only this table has: ' + flat.join(' '));
    const i70 = flat.findIndex(x => x.slice(0, 3) === '70=');
    const iCls = flat.indexOf('100=AcDbDimStyleTable');
    ok(i70 >= 0 && iCls > i70, 'in that order — count first, then the marker');
    ok(flat.some(x => x.slice(0, 3) === '71='), 'with its own entry count after it');
  });

  t('and no other table grew one, because no other table has one', () => {
    const dxf = R(`${SETUP} return exportDXF();`);
    const bad = [];
    for (const n of ['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'VIEW', 'UCS', 'APPID', 'BLOCK_RECORD']) {
      const head = tableHead(dxf, n);
      if (!head) continue;
      if (head.some(x => x[0] === '100' && x[1] !== 'AcDbSymbolTable')) bad.push(n);
    }
    eq(bad.length, 0, 'they stop at AcDbSymbolTable: ' + bad.join(', '));
  });

  t('every table is opened and closed, and every record sits inside one', () => {
    const dxf = R(`${SETUP} return exportDXF();`);
    const p = pairsOf(dxf);
    let depth = 0, worst = 0, ends = 0, opens = 0;
    for (const [c, v] of p) {
      if (c !== '0') continue;
      if (v === 'TABLE') { depth++; opens++; }
      else if (v === 'ENDTAB') { depth--; ends++; }
      if (depth < 0) worst = -1;
    }
    eq(worst, 0, 'no ENDTAB without a TABLE');
    eq(depth, 0, 'and every TABLE is closed');
    eq(opens, ends, opens + ' tables, ' + ends + ' ends');
  });

  t('the DIMSTYLE record is keyed on 105, not 5, as that table alone is', () => {
    const dxf = R(`${SETUP} return exportDXF();`);
    const p = pairsOf(dxf);
    const i = p.findIndex((x, k) => x[0] === '0' && x[1] === 'DIMSTYLE' &&
      p.slice(0, k).some(y => y[0] === '2' && y[1] === 'DIMSTYLE'));
    ok(i > 0, 'the record is there');
    const codes = p.slice(i + 1, i + 4).map(x => x[0]);
    ok(codes.indexOf('105') >= 0, 'handled with 105: ' + codes.join(','));
    eq(codes.indexOf('5'), -1, 'and not with 5');
  });

  group('the shape of the file');

  t('every section is opened and closed', () => {
    const dxf = R(`${SETUP} return exportDXF();`);
    const p = pairsOf(dxf);
    let open = 0, close = 0;
    for (const [c, v] of p) {
      if (c !== '0') continue;
      if (v === 'SECTION') open++;
      if (v === 'ENDSEC') close++;
    }
    eq(open, close, open + ' sections opened, ' + close + ' closed');
    eq(p[p.length - 1][1], 'EOF', 'and the file ends where it says it does');
  });

  t('it is R2000, and says so once', () => {
    const dxf = R(`${SETUP} return exportDXF();`);
    const n = (dxf.match(/\$ACADVER/g) || []).length;
    eq(n, 1, 'one version stamp');
    ok(dxf.indexOf('AC1015') >= 0, 'and it is R2000');
  });
  group('nothing references what the file does not define');

  /* An entity naming a layer the file never defines loses its layer in
     whatever opens it — AutoCAD drops it onto 0. The document is allowed to
     get into that state (AUDIT exists to find it), so the exporter has to be
     the one that does not pass it on. */
  t('every layer an entity names is in the LAYER table', () => {
    const dxf = R(`${SETUP}
      /* a layer nobody ensured — exactly what AUDIT reports on */
      begin();
      addEnt({t:'line', a:[0,0], b:[1000,0], layer:'A-NEVER-MADE'});
      commit('l');
      return exportDXF();`);
    const p = pairsOf(dxf);
    const defined = new Set();
    let inLayerTable = false;
    for (let i = 0; i < p.length; i++) {
      if (p[i][0] === '0' && p[i][1] === 'TABLE' && p[i+1] && p[i+1][1] === 'LAYER') inLayerTable = true;
      else if (p[i][0] === '0' && p[i][1] === 'ENDTAB') inLayerTable = false;
      else if (inLayerTable && p[i][0] === '0' && p[i][1] === 'LAYER') {
        for (let j = i + 1; j < p.length && p[j][0] !== '0'; j++)
          if (p[j][0] === '2') { defined.add(p[j][1]); break; }
      }
    }
    const used = new Set();
    for (let i = 0; i < p.length; i++) if (p[i][0] === '8') used.add(p[i][1]);
    const missing = [...used].filter(x => !defined.has(x));
    eq(missing.length, 0, 'these are drawn on but never defined: ' + missing.join(', '));
    ok(defined.has('A-NEVER-MADE'), 'including one the document never made');
  });

  t('the layer table says how many records it holds', () => {
    const dxf = R(`${SETUP}
      begin(); addEnt({t:'line', a:[0,0], b:[1,0], layer:'A-NEVER-MADE'}); commit('l');
      return exportDXF();`);
    const head = tableHead(dxf, 'LAYER');
    const n70 = head.filter(x => x[0] === '70').map(x => +x[1])[0];
    const p = pairsOf(dxf);
    let count = 0, inside = false;
    for (let i = 0; i < p.length; i++) {
      if (p[i][0] === '0' && p[i][1] === 'TABLE' && p[i+1] && p[i+1][1] === 'LAYER') inside = true;
      else if (inside && p[i][0] === '0' && p[i][1] === 'ENDTAB') break;
      else if (inside && p[i][0] === '0' && p[i][1] === 'LAYER') count++;
    }
    eq(n70, count, 'the count matches the records: ' + n70 + ' vs ' + count);
  });
};
