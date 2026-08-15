# Orthograph

2D CAD in the browser: an AutoCAD-style drafting board with a Revit-style parametric
architecture layer on top. No build step required to *use* it — `orthograph.html` is a
single self-contained file. Open it in any browser.

## Layout

```
orthograph.html      the built artefact — this is the thing you ship
build.js             concatenates src/*.js into the shell → orthograph.html
src/
  shell.html         markup + CSS, with a placeholder for the bundle
  00-core.js         maths, colour index, units and formatting
  01-doc.js          document model, journalled history, spatial index
  02-geom.js         entity geometry, hit testing, transforms, grips
  03-solve.js        intersections, offset, trim/extend, fillet, dimensions
  04a-wall.js        walls, joins, cleanup, hosted-opening plumbing
  04b-openings.js    doors and windows, Revit-style flips
  04c-components.js  columns, stairs, rooms (planar face tracing), grids
  05-view.js         viewport and renderer
  06-snap.js         input state and the snap engine
  07-cmd.js          command engine + drawing commands
  08-modify.js       modify, inquiry, blocks, hatch
  09-archcmd.js      architecture commands
  10-dxf.js          DXF reader (R12–R2018) and writer (R2000)
  11-io.js           SVG, PNG, native project file
  12-dwg.js          DWG reader and writer — experimental, see below
  13-ui.js           rails, menus, layers, properties panel
  14-events.js       events, command line, files, boot
test/
  run.js             core tests, no dependencies — `node test/run.js`
  suites/*.js        per-area suites, auto-loaded (247 tests in total)
  load.js            loads the bundle into a vm sandbox
  dom-stub.js        minimal DOM + a tracing canvas, so rendering is testable
tools/
  check_dxf.py       validates output with ezdxf (`pip install ezdxf`)
  make_hard_dxf.py   builds a deliberately awkward R2018 file for the importer
```

## Build and test

```
node build.js                  # → orthograph.html
node test/run.js               # 247 tests
node test/run.js wall          # run a subset by name

pip install ezdxf
python3 tools/make_hard_dxf.py # generate the import fixture
python3 tools/check_dxf.py test/out/fixture.dxf
```

## The two modes

**Drafting** is the AutoCAD-shaped half: line, polyline, spline, rectangle, circle, arc,
ellipse, polygon, donut, point, construction line, ray, revision cloud, hatch, text,
paragraph text, leader, dimensions (linear, aligned, horizontal, vertical, radius,
diameter, angular, continue). Modify: move, copy, rotate, scale, mirror, offset, array
(rectangular, polar, path), stretch, align, trim, extend, lengthen, fillet, chamfer,
break, join, pedit, explode, divide, measure, match properties, blocks, erase. Inquiry:
distance, area, id, list, quick select.

**Architecture** is parametric. A wall is a centreline plus a type; the faces, mitred
corners and T-junction cleanup are all derived at draw time. Doors and windows are
*hosted* on a wall — they cut their own opening, move when the wall moves, clamp
themselves back inside when it shortens, re-home when it splits, and are deleted with it.
Select anything and the right-hand panel edits its parameters live.

Everything is 2D. Walls and openings carry height, sill and level data already, so the
model is ready for a 3D view later without a data migration.

## File formats

| Format | Read | Write | Notes |
|---|---|---|---|
| `.ocad` project | yes | yes | lossless — keeps walls, openings and type libraries as live objects |
| DXF | R12–R2018 | R2000 (AC1015) | verified against ezdxf: strict load, 0 audit errors |
| SVG / PNG | — | yes | for showing the drawing |
| DWG | R13–R2000, experimental | experimental | see below |

DXF export writes real `ELLIPSE`, `SPLINE`, `DIMENSION` and `HATCH` entities rather than
flattening everything to R12 polylines. Architectural objects have no DXF equivalent, so
they export as their plan geometry on the correct `A-` layers — use the project file if
you want them to stay editable.

## DWG — read this before using it

DWG is a closed binary format. The reader here is written from the Open Design Alliance's
published specification and covers R13–R2000 (AC1012–AC1015). R2004 and later wrap
everything in a compressed container it does not decode; those files are **reported, not
half-read**. Because objects are located independently through the object map, a failure
to decode one object cannot desynchronise the rest — anything that does not decode
cleanly is skipped and counted.

What is proven: the bit-level codec (every primitive round-trips, fuzzed across its range),
the object map, the CRCs, and the fact that a file written by the writer is read back
byte-for-byte correctly by the reader.

What is **not** proven: that AutoCAD accepts either. No DWG tooling or sample file was
available to check against, so this has never been tested on a real DWG. The writer is
gated behind an explicit warning in the export dialog for that reason.

**Use DXF.** It is the path that is actually verified against a reference implementation.
For converting existing DWGs, the free ODA File Converter does it in batch.

## Architecture layer

Walls are centrelines with a type; faces, mitred corners, T/X/Y cleanup and openings are
derived at draw time. Ortho binds wall creation *and* grip edits, so F8 makes an angled
wall impossible however you edit. Placement is by centreline, inner face or outer face.

Rooms are a **seed point**, not a frozen polygon. The boundary is re-derived from the
arrangement of the wall faces, so it is exact at any wall angle and it follows the walls
when they move. A space that is not enclosed is reported, not guessed at.

Stairs are straight, L or U; L and U carry a real landing plate and split the risers
either side of it. The point you drag to sets the first flight.

## Known limits

- No paper space or plotting.
- Hatch boundaries come from closed objects or a point inside one, not from a full
  arrangement trace of crossing lines.
- Splines are drawn through fit points (Catmull-Rom) and exported as clamped B-splines;
  imported NURBS are evaluated properly but stored tessellated.
- Wall cleanup handles L corners, straight runs, T-junctions, crossings and Y/X nodes
  where three or more walls meet.
- One level is drawn at a time; levels exist as data but there is no level switcher yet.
