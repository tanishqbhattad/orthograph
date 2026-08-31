#!/usr/bin/env python3
"""Check a DXF against the structural rules a STRICT reader enforces.

check_dxf.py asks ezdxf whether the drawing survives a round trip. ezdxf is
forgiving by design, and that is the gap this file exists to close: it read our
files perfectly happily while AutoCAD refused to open them at all --

    Class separator for class AcDbDimStyleTable expected on line 828.
    Invalid or incomplete DXF input -- drawing discarded.

So this reads the raw tag stream and checks the things a strict reader checks,
with no library in between. It knows nothing about geometry; it is only asking
whether the file is put together the way the format says.

    python tools/dxf_strict.py [file.dxf]
"""
import sys, collections

path = sys.argv[1] if len(sys.argv) > 1 else 'test/out/fixture.dxf'
raw = open(path, 'r', encoding='utf-8', errors='replace').read()
lines = raw.split('\r\n') if '\r\n' in raw else raw.split('\n')
while lines and lines[-1] == '':
    lines.pop()

problems = []
def bad(msg, line=None):
    problems.append(("line %d: " % line if line else "") + msg)

# ---------------------------------------------------------------- tag stream
if len(lines) % 2:
    bad("odd number of lines: a DXF is pairs of code and value, so one is missing")
pairs = []          # (code, value, line-number-of-the-code)
for i in range(0, len(lines) - 1, 2):
    c = lines[i].strip()
    try:
        code = int(c)
    except ValueError:
        bad("group code %r is not a number" % c, i + 1)
        continue
    pairs.append((code, lines[i + 1], i + 1))

# ---------------------------------------------------------------- sections
depth, sections, order = 0, [], []
for code, val, ln in pairs:
    if code != 0:
        continue
    if val == 'SECTION':
        depth += 1
        if depth > 1:
            bad("SECTION opened inside another one", ln)
    elif val == 'ENDSEC':
        depth -= 1
        if depth < 0:
            bad("ENDSEC without a SECTION", ln)
            depth = 0
if depth:
    bad("%d section(s) never closed" % depth)
for i, (code, val, ln) in enumerate(pairs):
    if code == 0 and val == 'SECTION' and i + 1 < len(pairs) and pairs[i + 1][0] == 2:
        sections.append(pairs[i + 1][1])
if not pairs or pairs[-1][1] != 'EOF':
    bad("the file does not end with EOF")
for need in ('HEADER', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS'):
    if need not in sections:
        bad("no %s section: AutoCAD needs one in R2000" % need)

# ---------------------------------------------------------------- tables
# Every symbol table stops at AcDbSymbolTable -- except DIMSTYLE, which carries
# a second marker and its own count. That single exception is the bug this file
# was written for.
RECORD_CLASS = {
    'VPORT': 'AcDbViewportTableRecord',
    'LTYPE': 'AcDbLinetypeTableRecord',
    'LAYER': 'AcDbLayerTableRecord',
    'STYLE': 'AcDbTextStyleTableRecord',
    'VIEW': 'AcDbViewTableRecord',
    'UCS': 'AcDbUCSTableRecord',
    'APPID': 'AcDbRegAppTableRecord',
    'DIMSTYLE': 'AcDbDimStyleTableRecord',
    'BLOCK_RECORD': 'AcDbBlockTableRecord',
}
tables_seen = []
i = 0
while i < len(pairs):
    code, val, ln = pairs[i]
    if code == 0 and val == 'TABLE':
        name = pairs[i + 1][1] if i + 1 < len(pairs) and pairs[i + 1][0] == 2 else '?'
        tables_seen.append(name)
        head, j = [], i + 2
        while j < len(pairs) and pairs[j][0] != 0:
            head.append(pairs[j])
            j += 1
        flat = [(c, v) for c, v, _ in head]
        if (100, 'AcDbSymbolTable') not in flat:
            bad("table %s has no 100 AcDbSymbolTable in its header" % name, ln)
        if name == 'DIMSTYLE':
            if (100, 'AcDbDimStyleTable') not in flat:
                bad("the DIMSTYLE table header is missing 100 AcDbDimStyleTable -- "
                    "AutoCAD discards the drawing over this one", ln)
            elif not any(c == 71 for c, _ in flat):
                bad("the DIMSTYLE table header has the class marker but no 71 count", ln)
            else:
                k70 = [n for n, (c, _) in enumerate(flat) if c == 70]
                kcl = [n for n, (c, v) in enumerate(flat) if c == 100 and v == 'AcDbDimStyleTable']
                if k70 and kcl and kcl[0] < k70[0]:
                    bad("the DIMSTYLE class marker comes before the 70 count", ln)
        else:
            extra = [v for c, v in flat if c == 100 and v != 'AcDbSymbolTable']
            if extra:
                bad("table %s carries a marker only DIMSTYLE may have: %s"
                    % (name, ', '.join(extra)), ln)
        # the records inside it
        while j < len(pairs):
            c2, v2, l2 = pairs[j]
            if c2 == 0 and v2 == 'ENDTAB':
                break
            if c2 == 0 and v2 == name:
                rec, k = [], j + 1
                while k < len(pairs) and pairs[k][0] != 0:
                    rec.append(pairs[k])
                    k += 1
                fr = [(c, v) for c, v, _ in rec]
                want = RECORD_CLASS.get(name)
                if want and (100, want) not in fr:
                    bad("a %s record has no 100 %s" % (name, want), l2)
                if (100, 'AcDbSymbolTableRecord') not in fr:
                    bad("a %s record has no 100 AcDbSymbolTableRecord" % name, l2)
                # DIMSTYLE alone is handled on 105; everything else on 5
                hcode = 105 if name == 'DIMSTYLE' else 5
                if not any(c == hcode for c, _ in fr):
                    bad("a %s record has no handle on group code %d" % (name, hcode), l2)
                if name == 'DIMSTYLE' and any(c == 5 for c, _ in fr):
                    bad("a DIMSTYLE record is handled on 5; that table uses 105", l2)
            j += 1
        i = j
    i += 1
for need in RECORD_CLASS:
    if need not in tables_seen:
        bad("no %s table" % need)

# ---------------------------------------------------------------- handles
handles, dupes = set(), []
for n, (code, val, ln) in enumerate(pairs):
    if code not in (5, 105):
        continue
    prev = pairs[n - 1] if n else (None, None, None)
    if prev[0] == 0 and prev[1] == 'SECTION':
        continue
    # $HANDSEED carries its value on group code 5 as well, and it is a seed
    # rather than a handle -- counting it makes the file look like it uses a
    # handle it has not used, and then fails its own seed check.
    if prev[0] == 9:
        continue
    h = val.strip().upper()
    if h in ('', '0'):
        bad("a handle is %r" % val, ln)
        continue
    try:
        int(h, 16)
    except ValueError:
        bad("handle %r is not hexadecimal" % val, ln)
        continue
    if h in handles:
        dupes.append((h, ln))
    handles.add(h)
for h, ln in dupes[:6]:
    bad("handle %s is used twice" % h, ln)

seed = None
for n, (code, val, ln) in enumerate(pairs):
    if code == 9 and val == '$HANDSEED' and n + 1 < len(pairs):
        seed = pairs[n + 1][1].strip()
if seed is None:
    bad("$HANDSEED is not in the header")
elif handles:
    try:
        if int(seed, 16) <= max(int(h, 16) for h in handles):
            bad("$HANDSEED %s is not above every handle in the file" % seed)
    except ValueError:
        bad("$HANDSEED %r is not hexadecimal" % seed)

# ---------------------------------------------------------------- entities
# Every graphical object carries AcDbEntity and then its own subclass, and
# names a layer that exists.
layer_names = set()
i = 0
while i < len(pairs):
    code, val, ln = pairs[i]
    if code == 0 and val == 'TABLE' and pairs[i + 1][1] == 'LAYER':
        j = i + 2
        while j < len(pairs) and not (pairs[j][0] == 0 and pairs[j][1] == 'ENDTAB'):
            if pairs[j][0] == 0 and pairs[j][1] == 'LAYER':
                k = j + 1
                while k < len(pairs) and pairs[k][0] != 0:
                    if pairs[k][0] == 2:
                        layer_names.add(pairs[k][1])
                        break
                    k += 1
            j += 1
        break
    i += 1

GRAPHICAL = {'LINE', 'LWPOLYLINE', 'POLYLINE', 'CIRCLE', 'ARC', 'ELLIPSE', 'SPLINE',
             'POINT', 'TEXT', 'MTEXT', 'INSERT', 'HATCH', 'SOLID', 'DIMENSION',
             'LEADER', 'XLINE', 'RAY', 'ATTDEF', 'ATTRIB', 'VIEWPORT'}
missing_layer, no_entity_class, blocks_used, block_names = collections.Counter(), collections.Counter(), set(), set()
in_entities = False
for n, (code, val, ln) in enumerate(pairs):
    if code == 2 and n and pairs[n - 1][0] == 0 and pairs[n - 1][1] == 'SECTION':
        in_entities = val in ('ENTITIES', 'BLOCKS')
    if code == 0 and val == 'BLOCK':
        k = n + 1
        while k < len(pairs) and pairs[k][0] != 0:
            if pairs[k][0] == 2:
                block_names.add(pairs[k][1])
                break
            k += 1
    if code != 0 or val not in GRAPHICAL or not in_entities:
        continue
    body, k = [], n + 1
    while k < len(pairs) and pairs[k][0] != 0:
        body.append((pairs[k][0], pairs[k][1]))
        k += 1
    if (100, 'AcDbEntity') not in body:
        no_entity_class[val] += 1
    lay = [v for c, v in body if c == 8]
    if lay and layer_names and lay[0] not in layer_names:
        missing_layer[lay[0]] += 1
    if val == 'INSERT':
        nm = [v for c, v in body if c == 2]
        if nm:
            blocks_used.add(nm[0])
for t, n in no_entity_class.most_common(5):
    bad("%d %s entit%s without 100 AcDbEntity" % (n, t, 'y' if n == 1 else 'ies'))
for lay, n in missing_layer.most_common(5):
    bad("%d entities are on layer %r, which is not in the LAYER table" % (n, lay))
for b in sorted(blocks_used - block_names):
    bad("an INSERT names block %r, which is not defined" % b)

# ---------------------------------------------------------------- verdict
print("file    :", path)
print("lines   :", len(lines), " tags:", len(pairs))
print("sections:", ', '.join(sections))
print("tables  :", ', '.join(tables_seen))
print("handles :", len(handles), " seed:", seed)
if problems:
    print()
    print("PROBLEMS a strict reader would raise:")
    for p in problems:
        print("   -", p)
print()
print("RESULT:", "FAIL" if problems else "PASS")
sys.exit(1 if problems else 0)
