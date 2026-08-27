# Orthograph

2D CAD in the browser: an AutoCAD-style drafting board with a Revit-style parametric
architecture layer on top. No build step required to *use* it — `orthograph.html` is a
single self-contained file. Open it in any browser.

107 commands, 93 acad.pgp aliases, 655 tests.

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
  07b-nav.js         named views, zoom and pan history
  07c-sheet.js       paper space: sheets, viewports, title blocks, plotting
  08-modify.js       modify, inquiry, blocks, hatch
  09-archcmd.js      architecture commands
  09b-layer.js       layer tools and states, dimension/text styles, tables,
                     attributes, levels
  09c-section.js     section and elevation views cut from the plan
  09d-slab.js        floors and roofs; door and window schedules
  09e-boundary.js    planar face tracing for hatch and BOUNDARY
  10-dxf.js          DXF reader (R12–R2018) and writer (R2000)
  11-io.js           SVG, PNG, native project file, autosave and recovery
  12-dwg.js          DWG reader and writer — experimental, see below
  13-ui.js           rails, menus, layers, properties panel
  14-events.js       events, command line, files, boot
test/
  run.js             core tests, no dependencies — `node test/run.js`
  suites/*.js        per-area suites, auto-loaded
  load.js            loads the bundle into a vm sandbox
  dom-stub.js        minimal DOM + a tracing canvas, so rendering is testable
tools/
  serve.js           the dev server
  verify.js          behavioural checks, including a drag-latency budget
  check_dxf.py       validates output with ezdxf (`pip install ezdxf`) — a gate
  make_hard_dxf.py   builds a deliberately awkward R2018 file for the importer
```

## Running it

`orthograph.html` opens straight from disk, but **serve it if you are developing**:
loaded over `file://` the page has no origin, which breaks canvas readback and any
storage it touches — including autosave.

```
node tools/serve.js            # → http://127.0.0.1:8017/
```

## Build and test

```
node build.js                  # → orthograph.html
node test/run.js               # 655 tests
node test/run.js wall          # run a subset by name
node tools/verify.js           # behavioural checks + drag latency

pip install ezdxf
python3 tools/make_hard_dxf.py # generate the import fixture
python3 tools/check_dxf.py     # exits non-zero if the DXF regresses
```

## Precision

The part that decides whether a CAD tool is usable. Sixteen object snap modes
(endpoint, midpoint, centre, geometric centre, node, quadrant, intersection,
apparent intersection, extension, insertion, perpendicular, tangent, nearest,
parallel and the two wall-specific ones), each with AutoCAD's own marker glyph
and a tooltip. Polar tracking with configurable increments, object snap tracking
that acquires points on dwell and crosses their alignment paths, temporary
overrides, FROM and mid-between-2-points.

Candidates are ranked by **distance to the cursor**, with priority buying only a
bounded head start — so a perpendicular under the crosshair is not stolen by an
endpoint eight pixels away, which is the failure that makes most snap engines
tiring to use.

The command line is the real one: acad.pgp aliases, prompts whose bracketed
keywords are typed by their capital, transparent commands, `U`/`REDO`, and live
system variables reachable through `SETVAR`. Coordinates take every AutoCAD form —
absolute, relative `@dx,dy`, polar `@dist<angle`, direct distance entry and the
`#` override.

The drawing can be driven without a mouse. The arrows move the crosshair — one snap
step, ten with Shift, a tenth with Alt — and Ctrl+Enter is the click: it gives a running
command its point, or selects whatever is under the crosshair. The arrows belong to the
command line whenever it has focus, so neither half gets in the other one's way. CONTRAST
swaps in a high-contrast palette, and a machine asking for one through prefers-contrast
gets it without being told twice.

Selection follows the same rules: left-to-right windows (blue, solid, encloses),
right-to-left crosses (green, dashed, touches), with live preview of what the box
would take, lasso, fence, cycling through overlapping objects, and grips that go
blue → hover → hot red with the full stretch/move/rotate/scale/mirror cycle.

## The two modes

**Drafting** is the AutoCAD-shaped half: line, polyline, spline, rectangle, circle, arc,
ellipse, polygon, donut, point, construction line, ray, revision cloud, hatch, text,
paragraph text with stacked fractions, leader, dimensions (linear, aligned, horizontal, vertical, radius,
diameter, angular, continue, baseline, ordinate, arc length). Modify: move, copy, rotate, scale, mirror, offset,
array (rectangular, polar, path), stretch, align, trim, extend, lengthen, fillet, chamfer,
break, join, pedit, explode, divide, measure, match properties, blocks, erase. Inquiry:
distance, area, id, list, quick select.

**Architecture** is parametric. A wall is a centreline plus a type; the faces, mitred
corners and T-junction cleanup are all derived at draw time. Doors and windows are
*hosted* on a wall — they cut their own opening, move when the wall moves, clamp
themselves back inside when it shortens, re-home when it splits, and are deleted with it.
Select anything and the right-hand panel edits its parameters live.

Walls carry a compound structure: a type is a stack of layers with thicknesses, and the
layer boundaries are drawn, so a cavity wall reads as a cavity wall rather than as two
lines. Each layer is poched at its own weight — brick dense, insulation nearly open — so
the fill agrees with the lines drawn across it.

**Fields.** Text can read the drawing instead of being typed into it: `%<drawing>%`,
`%<sheet>%`, `%<scale>%`, `%<date>%`, and `%<area:id>%`, `%<length:id>%` or
`%<count:door>%` for something in it. A field that cannot be resolved comes out as
`####` rather than as a gap nobody can account for.

## Storeys, sheets and output

**Levels.** Storeys are real: objects belong to one, `LEVEL`/`LEVELUP`/`LEVELDOWN` move
between them, and the storey below can be shown as a faint underlay to trace against.

**Sections and elevations.** `SECTION` cuts a view from the plan — walls poched where
they are cut, everything beyond the cut line drawn as seen elevation, respecting the view
depth and which way the section looks. Layers apply to a section; levels do not, because
a section through a building is a section through all of it.

**Annotation that comes out right.** Text and dimensions can be marked annotative,
which sizes them in paper millimetres instead of model ones: the model height is derived
from whichever scale is looking at them, so one note is the same size on the sheet through
a 1:50 viewport and a 1:200 one. `CANNOSCALE` sets the scale for model space.

**Sheets.** Paper space with named layouts, viewports onto model space at a stated scale,
title blocks and plotting. A viewport is a rectangle on the paper in millimetres plus the
model point at its centre and the scale it looks through; everything about plotting falls
out of those three numbers.

**Schedules.** Doors and windows are marked (D-01, W-01…) in reading order, marks are
stable when new openings are added, and `DOORSCHEDULE`/`WINDOWSCHEDULE` place a real
table that counts only the current storey, carrying fire rating, acoustic rating and
finish alongside the sizes. Rooms schedule the same way.
Every schedule writes out as CSV — from the Export dialog, or `TABLEEXPORT` for
the ones you have selected — because a schedule is a thing somebody orders from.

## Not losing your work

Autosave writes whenever the journal has moved since the last save, on a timer and again
when the page is hidden or closed. It goes to localStorage, which is synchronous and
therefore the only store that can be relied on during `beforeunload`.

A drawing bigger than about 25,000 objects outgrows localStorage's ~5MB. Those go to
IndexedDB instead, with a ~90-byte pointer left in localStorage so recovery can find them
— small enough that it can always be written, including on the way out. On the next
start, unsaved work is offered back rather than restored silently: being handed a drawing
you cannot identify is worse than being told one exists.

## File formats

| Format | Read | Write | Notes |
|---|---|---|---|
| `.ocad` project | yes | yes | lossless — keeps walls, openings and type libraries as live objects |
| DXF | R12–R2018 | R2000 (AC1015) | verified against ezdxf as a CI gate, and by Rhino 8 as a second reader |
| SVG / PNG | — | yes | for showing the drawing |
| DWG | R13–R2000, experimental | experimental | see below |

DXF export writes real `ELLIPSE`, `SPLINE`, `DIMENSION` and `HATCH` entities rather than
flattening everything to R12 polylines. Architectural objects have no DXF equivalent, so
they export as their plan geometry on the correct `A-` layers — use the project file if
you want them to stay editable. Anything the writer has no direct mapping for is
flattened to primitives rather than dropped.

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

Hatch works the same way. `BOUNDARY` and a hatch pick both trace the face of the
arrangement containing the point, cutting the geometry at every crossing first, so four
lines that happen to enclose a space can be filled even though no closed object exists.

Stairs are straight, L or U; L and U carry a real landing plate and split the risers
either side of it. The point you drag to sets the first flight.

## Performance

The drawing is spatially indexed, and the caches derived from the walls are patched
rather than rebuilt: they are keyed on structural change, not on the document version,
because a version-keyed cache is thrown away by every mutation and moving a selection is
thousands of mutations. `tools/verify.js` holds a drag-latency budget — 600 walls stay
above 60fps while being dragged — so a regression here fails the build rather than being
noticed months later.

## Known limits

- Everything is 2D. Walls, openings and slabs carry height, sill and level data already,
  so the model is ready for a 3D view later without a data migration.
- DWG remains experimental and unverified against AutoCAD — use DXF.
- Splines are drawn through fit points (Catmull-Rom) and exported as clamped B-splines;
  imported NURBS are evaluated properly but stored tessellated.
- Poche weight varies by material but is not hatched: there are no material
  hatch patterns, so a printed section distinguishes layers by tone alone.
- Stairs in section are projected onto the section line rather than sliced by it,
  so a flight is drawn as what you would see rather than as a true cut.
- Grid bubbles are labelled and can be turned off per end. Storey datums are drawn
  in sections but there is no datum symbol for use in a plan.
- Fire, acoustic and finish are recorded and scheduled but not checked: nothing
  verifies that a door onto a protected stair actually has a rating.
- Schedules export as CSV, one file per schedule; there is no live link back
  from a spreadsheet into the drawing.
- An arc-length dimension has no DXF R2000 equivalent, so it exports as flattened
  geometry rather than as an editable dimension.
- Fields cover the drawing name, sheet, scale, date, and an object'''s area,
  length or count; there is no field browser, so they are typed by hand.
- Blocks have no attribute manager, in-place reference editing or dynamic parameters.
- Keyboard picking is Ctrl+Enter rather than a rebindable key, and the
  high-contrast palette is one alternative rather than a set you can edit.

## Licence

MIT. See `LICENSE`.
