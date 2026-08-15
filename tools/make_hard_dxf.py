#!/usr/bin/env python3
"""Build a deliberately awkward R2018 DXF to test the importer."""
import math, ezdxf
from ezdxf.enums import TextEntityAlignment

doc = ezdxf.new('R2018', setup=True)
msp = doc.modelspace()
doc.layers.add('AWKWARD', color=1, linetype='DASHED')
doc.layers.add('OFFLAYER', color=3); doc.layers.get('OFFLAYER').off()
doc.layers.add('LOCKED', color=5); doc.layers.get('LOCKED').lock()

msp.add_line((0, 0), (1000, 0), dxfattribs={'layer': 'AWKWARD'})
msp.add_circle((500, 500), 250)
msp.add_arc((0, 500), 300, 30, 200)
msp.add_lwpolyline([(0, -500), (500, -500), (500, -900), (0, -900)], close=True)
pl = msp.add_polyline2d([(1500, 0), (1800, 300), (2100, 0), (1800, -300)], close=True)
msp.add_ellipse((3000, 0), major_axis=(400, 200), ratio=0.5, start_param=0, end_param=math.pi * 1.5)
msp.add_spline([(0, 1500), (400, 2000), (900, 1200), (1400, 1800)])
sp = msp.add_spline([(2000, 1500), (2400, 2000), (2900, 1200)])
sp.closed = False
msp.add_text('PLAIN TEXT', height=80).set_placement((0, 2500))
msp.add_text('CENTRED', height=80).set_placement((1000, 2500), align=TextEntityAlignment.CENTER)
mt = msp.add_mtext("Line one\\PLine two with {\\C1;colour} and \\H1.5x;big text", dxfattribs={'char_height': 60})
mt.set_location((0, 3000))
msp.add_point((250, 250))
msp.add_solid([(4000, 0), (4300, 0), (4300, 300), (4000, 300)])

# nested blocks with scale + rotation
inner = doc.blocks.new('INNER')
inner.add_line((-50, 0), (50, 0))
inner.add_circle((0, 0), 50)
outer = doc.blocks.new('OUTER')
outer.add_blockref('INNER', (0, 0), dxfattribs={'xscale': 2, 'yscale': 2})
outer.add_blockref('INNER', (200, 0), dxfattribs={'rotation': 45})
outer.add_lwpolyline([(-100, -100), (300, -100), (300, 100)])
msp.add_blockref('OUTER', (5000, 0), dxfattribs={'xscale': 1.5, 'yscale': 1.5, 'rotation': 30})
msp.add_blockref('OUTER', (5000, 1000))

# a MINSERT-style array
msp.add_blockref('INNER', (7000, 0), dxfattribs={'xscale': 1, 'yscale': 1})

# dimensions of every flavour
msp.add_linear_dim(base=(0, -1300), p1=(0, -1000), p2=(1000, -1000)).render()
msp.add_aligned_dim(p1=(2000, -1000), p2=(2800, -600), distance=200).render()
msp.add_radius_dim(center=(500, 500), radius=250, angle=45).render()
msp.add_diameter_dim(center=(500, 500), radius=250, angle=135).render()
msp.add_angular_dim_3p(base=(600, 1000), center=(0, 800), p1=(500, 800), p2=(0, 1300)).render()

h = msp.add_hatch(color=2)
h.paths.add_polyline_path([(6000, 2000), (7000, 2000), (7000, 3000), (6000, 3000)], is_closed=True)

msp.add_line((0, 0), (0, 100), dxfattribs={'layer': 'OFFLAYER'})
msp.add_line((100, 0), (100, 100), dxfattribs={'layer': 'LOCKED'})
msp.add_line((200, 0), (200, 100), dxfattribs={'true_color': 0x4EE6A8, 'lineweight': 50})

doc.saveas('test/out/hard.dxf')
print("wrote test/out/hard.dxf, version", doc.dxfversion)
print("modelspace entities:", len(list(msp)))
