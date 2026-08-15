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

bad = len(auditor.errors)
print("\nRESULT:", "PASS" if (strict_ok and bad == 0) else "FAIL")
sys.exit(0 if (strict_ok and bad == 0) else 1)
