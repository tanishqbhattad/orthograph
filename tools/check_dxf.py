#!/usr/bin/env python3
"""Validate an Orthograph DXF with ezdxf: audit it, then report what came through."""
import sys, collections
import ezdxf
from ezdxf import recover

path = sys.argv[1] if len(sys.argv) > 1 else 'test/out/fixture.dxf'
strict_ok = True
try:
    doc = ezdxf.readfile(path)
    print(f"readfile: OK (strict loader)")
except Exception as e:
    strict_ok = False
    print(f"readfile: FAILED -> {type(e).__name__}: {e}")
    doc, auditor = recover.readfile(path)
    print(f"recover : loaded with {len(auditor.errors)} errors, {len(auditor.fixes)} fixes")

print(f"version : {doc.dxfversion}  ({doc.acad_release})")

auditor = doc.audit()
print(f"audit   : {len(auditor.errors)} errors, {len(auditor.fixes)} fixes")
for e in auditor.errors[:12]:
    print("   ERROR", e)
for f in auditor.fixes[:12]:
    print("   FIX  ", f)

msp = doc.modelspace()
kinds = collections.Counter(e.dxftype() for e in msp)
print("entities:", dict(kinds), "total", sum(kinds.values()))
print("layers  :", [l.dxf.name for l in doc.layers])
print("ltypes  :", [l.dxf.name for l in doc.linetypes])
print("blocks  :", [b.name for b in doc.blocks if not b.name.startswith('*Model') and not b.name.startswith('*Paper')])

# spot-check the geometry that R12 used to destroy
def one(t):
    for e in msp:
        if e.dxftype() == t:
            return e
    return None

el = one('ELLIPSE')
if el:
    c, mj = el.dxf.center, el.dxf.major_axis
    import math
    print(f"ELLIPSE : centre=({c.x:.2f}, {c.y:.2f}) rx={math.hypot(mj.x,mj.y):.2f} ratio={el.dxf.ratio:.4f} rot={math.degrees(math.atan2(mj.y,mj.x)):.2f}deg")
sp = one('SPLINE')
if sp:
    print(f"SPLINE  : degree={sp.dxf.degree} ctrl={len(sp.control_points)} knots={len(sp.knots)} closed={sp.closed}")
    try:
        pts = list(sp.flattening(0.5))
        p0, p1 = pts[0], pts[-1]
        print(f"          flattens to {len(pts)} points, start=({p0.x:.2f}, {p0.y:.2f}) end=({p1.x:.2f}, {p1.y:.2f})")
    except Exception as ex:
        print("          flattening failed:", type(ex).__name__, ex)
dims = [e for e in msp if e.dxftype() == 'DIMENSION']
print(f"DIMENSION: {len(dims)}")
for d in dims:
    got = d.dxf.get('dimtype', None)
    print(f"          type={got} style={d.dxf.dimstyle} block={d.dxf.get('geometry', '-')} measurement={round(d.get_measurement(),2) if hasattr(d,'get_measurement') else '?'}")
h = one('HATCH')
if h:
    print(f"HATCH   : paths={len(h.paths)} solid={h.dxf.solid_fill} pattern={h.dxf.pattern_name}")
ins = one('INSERT')
if ins:
    ip = ins.dxf.insert
    print(f"INSERT  : name={ins.dxf.name} at=({ip.x:.1f}, {ip.y:.1f})")

# round-trip: save what ezdxf loaded and confirm it stays clean
out = path.replace('.dxf', '.ezdxf-rt.dxf')
doc.saveas(out)
doc2 = ezdxf.readfile(out)
a2 = doc2.audit()
print(f"re-save : {len(a2.errors)} errors, {len(a2.fixes)} fixes -> {out}")

# ---------------------------------------------------------------- assertions
# Printing what came through is a report; failing when something did NOT is a
# gate. mtext, leader and attdef were silently dropped from every DXF this
# program wrote until a coherence sweep caught it, so the fixture carries a
# marker for each and this insists on finding it.
failures = []

def want(cond, msg):
    if not cond:
        failures.append(msg)

want(kinds.get('LINE', 0) > 10, "no LINE records")
want(kinds.get('LWPOLYLINE', 0) > 0, "no LWPOLYLINE records")
want(kinds.get('TEXT', 0) >= 10,
     "only %d TEXT records - mtext, the leader note, the attdef tag and the "
     "table cells should all be here" % kinds.get('TEXT', 0))
want(kinds.get('DIMENSION', 0) >= 5, "dimensions missing")
want(kinds.get('HATCH', 0) >= 2, "the island hatch is missing")
want(kinds.get('INSERT', 0) >= 1, "the block insert is missing")

texts = [t.dxf.text for t in msp.query('TEXT')]
blob = " | ".join(texts)
for needle, what in [("GENERAL NOTES", "mtext paragraph"),
                     ("SEE DETAIL", "leader note"),
                     ("DOORNO", "attribute definition"),
                     ("HALL", "room name"),
                     ("Mark", "table heading")]:
    want(needle in blob, "%s (%r) never reached the DXF" % (what, needle))

# A hatch with a hole has to say which loop is the outside, and the style must
# match the island detection the program does (Normal, alternating - not Outer).
for h in msp.query('HATCH'):
    want(h.dxf.hatch_style == 0,
         "hatch style is %s, expected 0 (Normal islands)" % h.dxf.hatch_style)
    if len(h.paths) > 1:
        ext = [bool(p.path_type_flags & 1) for p in h.paths]
        want(ext[0] and not any(ext[1:]),
             "island hatch boundary flags are %s, expected the first loop "
             "external and the rest not" % ext)

# Every layer the fixture draws on must exist, or its entities land on layer 0
# in whatever opens the file.
have_layers = {l.dxf.name for l in doc.layers}
for need in ["A-WALL", "TEXT", "DIMENSIONS", "A-AREA"]:
    want(need in have_layers, "layer %s missing from the table" % need)

if failures:
    print()
    print("FAILURES:")
    for f in failures:
        print("   -", f)

bad = len(auditor.errors)
ok = strict_ok and bad == 0 and not failures
print()
print("RESULT:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
