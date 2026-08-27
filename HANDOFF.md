# Orthograph — handoff for Claude Code

Browser CAD: AutoCAD-style drafting with a Revit-style parametric architecture
layer, shipped as one self-contained HTML file.

**State: everything builds, 694 unit tests pass, 12 behavioural checks pass,
`tools/check_dxf.py` is a gate and reports PASS.** No known blockers and no
known correctness bugs. Waves 1-5 are done: drafting semantics, model
semantics, paper space and plotting, sections, levels, schedules, robustness,
accessibility and DXF interoperability.

---

## 1. Where everything is

```
C:\Users\Tanishq\projects\orthograph
```

> **Superseded.** This section originally pointed at a session-scoped Cowork
> output folder that no longer exists. The project moved to the path above on
> 16 Aug 2026 and is a git repository; `master` is the integrated line. See
> `PLAN.md` for what is done, what is next, and why the scope is what it is.

### Tree

```
orthograph/
├─ orthograph.html          THE ARTEFACT — 899 KB, open in any browser. Generated.
├─ build.js                 concatenates src/*.js into src/shell.html → orthograph.html
├─ package.json             npm run build / test / check-dxf / make-fixture
├─ README.md                user-facing docs
├─ HANDOFF.md               this file
│
├─ src/                     ~19,600 lines. Build order is defined in build.js ORDER.
│  ├─ shell.html            markup + ALL CSS, with a placeholder for the bundle
│  ├─ 00-core.js            maths, ACI colour, units, fmt/parseLen
│  ├─ 01-doc.js             document model, journalled history, spatial index, DIRTY set
│  ├─ 02-geom.js            entity geometry, hit testing, transforms, grips, GEOM registry
│  ├─ 03-solve.js           intersections, offset, trim/extend, fillet, dimensions
│  ├─ 04a-wall.js           walls: joins, mitres, breaks, cleanup, wall spatial hash
│  ├─ 04b-openings.js       doors and windows, Revit-style flips
│  ├─ 04c-components.js     columns, stairs, ROOM TRACING, grids
│  ├─ 05-view.js            viewport, renderer, shape cache, view rotation
│  ├─ 06-snap.js            snap engine, ST interaction state, pickAt/pickGrip
│  ├─ 07-cmd.js             command engine, drawing commands
│  ├─ 07b-nav.js            named views, zoom and pan history
│  ├─ 07c-sheet.js          paper space: sheets, viewports, plotting
│  ├─ 08-modify.js          modify, inquiry, blocks, hatch
│  ├─ 09-archcmd.js         architecture commands, ARCH defaults
│  ├─ 09b-layer.js          layer tools/states, dim + text styles, tables,
│  │                        attributes, LEVELS
│  ├─ 09c-section.js        sections and elevations cut from the plan
│  ├─ 09d-slab.js           floors, roofs, door/window schedules
│  ├─ 09e-boundary.js       planar face tracing for hatch and BOUNDARY
│  ├─ 10-dxf.js             DXF reader (R12-R2018) and writer (R2000)
│  ├─ 11-io.js              SVG, PNG, .ocad project file, autosave + recovery
│  ├─ 12-dwg.js             DWG reader/writer - EXPERIMENTAL, see section 6
│  ├─ 13-ui.js              rails, menus, layers, properties + Command panel
│  └─ 14-events.js          events, dynamic input, files, boot, demo seed
│
├─ test/
│  ├─ run.js                core suite + fixture emitter
│  ├─ load.js               loads the bundle into a vm sandbox; exports run() and bootApp()
│  ├─ dom-stub.js           minimal DOM + TRACING CANVAS (this is how rendering is tested)
│  ├─ extra.js              auto-loads test/suites/*.js
│  ├─ suites/               35 files, one per area — auto-loaded, see §2
│  └─ out/                  generated fixtures (fixture.dxf, hard.dxf, …) — gitignore these
│
└─ tools/
   ├─ verify.js             12 behavioural checks (rotation, rooms, placement, panel, latency)
   ├─ check_dxf.py          validates output with ezdxf
   └─ make_hard_dxf.py      generates an awkward R2018 file to test the importer
```

---

## 2. Build and test

```bash
node build.js            # → orthograph.html   (must be re-run after ANY src/ change)
node test/run.js         # 694 unit tests, zero dependencies
node test/run.js wall    # run a subset by name substring
node tools/verify.js     # 12 behavioural checks
node tools/serve.js      # serve at 127.0.0.1:8017 — file:// gives the page no origin
```

DXF validation needs Python:

```bash
pip install ezdxf
python3 tools/make_hard_dxf.py                    # → test/out/hard.dxf
python3 tools/check_dxf.py test/out/fixture.dxf   # expects "RESULT: PASS"
```

**The build is generated and committed.** `orthograph.html` must always match
`src/`. Verify with:

```bash
node build.js && git diff --exit-code orthograph.html
```

Wire that into CI — a stale build has bitten this project once already.

### How to test things headlessly

`test/load.js` evaluates the bundle in a `vm` sandbox.
Because top-level `const`/`let` live in the sandbox's lexical scope, test code
must run **inside** it:

```js
const { loadApp } = require('./test/load.js');
const { run, bootApp } = loadApp();
bootApp();                                   // full startup incl. the demo plan
console.log(run(`resetDoc(); /* app code */ return something;`));
```

The canvas is a **tracing stub**. To assert that something actually rendered:

```js
const c = document.getElementById('cv').getContext('2d');
c.__trace.pts.length = 0;                    // .counts, .pts, .calls
paint();
```

Suites are auto-loaded from `test/suites/*.js` and export
`({group, t, ok, eq, close, run, R, bootApp}) => {...}`. Add new files there —
never edit `test/run.js` for feature tests.

⚠ **Suites share one sandbox.** Pin state in your SETUP string
(`DOC.units='mm'` etc.) or you will inherit another suite's leftovers. This has
caused false failures before.

### And then check it in a real browser

Headless is necessary and not sufficient. The sandbox has no canvas, no
storage and no IndexedDB, so every fake you write there agrees with you.
`node tools/serve.js`, then drive the page — anything touching rendering,
storage or events must be seen working in a browser before it is called done.

This is not a formality. The IndexedDB autosave tier passed eight headless
tests against a fake store and was still broken: the wrapper read the outcome
of a transaction out of the value it returned, and a `put` returns no value, so
every successful write looked like a refusal. The fake answered with a value,
so nothing headless could have caught it. One page load did.

---

## 3. Architecture in one page

**Document.** `DOC.ents` is a `Map<id, entity>`. Entities are plain JSON —
that is what makes save/load and undo cheap. `DOCV` increments on every
mutation; caches key off it. `DIRTY` is a `Set` of changed ids that the
renderer drains for scoped cache invalidation.

**History is journalled, not snapshotted.** `begin()` → mutate → `commit()`.
Every edit to a live entity must go through `mut(e)` first (it records the
before-image and flags reindexing). A patch stores only what changed: 200 undo
steps on a 5,000-entity drawing cost ~56 KB against a 461 KB document.
`rollback()` abandons an in-flight journal.

**Geometry is a registry.** `GEOM[type]` supplies `shapes / bbox / dist /
grips / grip / xf / area`. Core primitives are handled by switches in
`02-geom.js`; walls, openings, rooms, stairs, columns, grids, hatch and inserts
register into `GEOM`. `shapes(e)` returns the canonical draw list — items are
`{pts, closed}`, `{c, r, a0, a1}`, `{c, r}` or `{text, p, h, rot, anchor}`,
each with an optional `role` that drives line weight and alpha.

**Walls are centrelines.** Faces, mitres, T/X/Y cleanup and openings are all
derived at draw time from `wallEndPoints`, `wallBreaks` and `wallOpenings`.
Nothing is baked. `04a-wall.js` keeps its **own** spatial hash built from raw
offset rectangles — it cannot use the document index, because a wall's bbox
needs its joins, which would need the index, which needs the bbox.

**Rooms are a seed point, not a polygon.** `roomTrace(seed, lvl)` builds the
planar arrangement of wall faces, splits at intersections, welds nodes and
walks the face containing the seed. Exact at any wall angle. Cached per `DOCV`
in `_arrCache`. A space that is not enclosed returns `null`.

**Openings are hosted.** A door/window stores `host` (wall id) and `pos`
(distance along the centreline). Moving the wall moves them; shortening it
shrinks or deletes them; deleting the wall cascades via `delWallCascade`.

**Rendering.** `entShapes()` caches per entity with neighbourhood-scoped
invalidation. `V.rot` rotates the view only — world coordinates never change,
so ortho and snapping stay in true world space.

---

## 4. Conventions that matter

- **Millimetres internally, always.** `DOC.units` is display only. `fmt()` and
  `parseLen()` convert at the edges.
- **Never mutate a live entity without `mut(e)`.** Undo will silently lose it.
- **Any `src/` change needs `node build.js`.** The HTML is not live-linked.
- **Module order is significant** — see `ORDER` in `build.js`. Later modules may
  call earlier ones; the reverse only works inside function bodies.
- **Comments explain *why*.** The codebase documents the reasoning behind
  non-obvious geometry (the mitre sign rule, the room-tracer rewrite, the wall
  index cycle). Keep that up.

---

## 5. Recent work worth knowing about

### The most recent round (27 Aug 2026)

1. **Four wall caches were keyed on `DOCV`**, which `mut()` bumps on every
   mutation. Any geometry read between two mutations therefore rebuilt all of
   them, once per mutation — and moving a selection is exactly that pattern.
   2,000 walls took 23.6 seconds, of which the mutations themselves were 1ms.
   `allWalls()` is now structural-only (which walls exist cannot change because
   one of them moved) and the three maps are patched in `mut()`, while the
   entity still holds its OLD position — the only moment its existing entries
   can be found. 23,586ms → 80ms; a 3,000-wall move 3,212ms → 239ms.
   **The recorded claim that this was inherent to the clone-based journal was
   wrong**: cloning 6,000 entities measures 15ms. Measure before believing a
   note in this file, including this one.
2. **`entLength()` reported the perimeter of whatever an object flattened to**,
   so a 5m wall said 35m and a 5m cavity wall said 66m, counting every layer
   line in it. That is the number the properties panel labels Length and that
   gets ordered from. Fixed with a `GEOM len` hook, mirroring the `area` hook
   that already existed.
3. **Autosave now overflows to IndexedDB** past localStorage's ~5MB (about
   25,000 objects), keeping a ~90-byte pointer in localStorage so the write
   during `beforeunload` always fits. See the browser note in §2.

### The adversarial review (Aug 2026)

It found four blockers that 244 passing tests had missed. All are fixed, but
they show where the sharp edges are:

1. **The room tracer was rasterised.** Grid phase made traced edges miss their
   wall face — 8.35% area error on a plain brick room — and an axis-aligned
   raster edge can never match an angled wall. Replaced with the exact face
   walk. The old tests only used 100 mm walls, the one thickness where the
   error hid.
2. **Command option keys were hijacked.** The prompt said "C to close" and C
   started CIRCLE, because the shortcut handler had no `if (CMD)` guard.
3. **The U-stair landing was a diagonal parallelogram** and the L corner did
   not close. Landings are now built in the stair's own u/v frame.
4. **600 walls ran at 0.4 fps while dragging.** `wallBreaks` scanned every wall
   and any edit cleared the whole shape cache. Now ~57 fps.

Also fixed: band selection selected things outside the box once the view was
rotated; ortho did not bind grip edits; a door wider than its wall erased the
wall; the tool rail silently clipped 12 tools on a 1366×768 laptop; and three
features were fully written but wired to nothing (snap menu, pick-box sizing,
wall poche toggle).

**Lesson for whoever picks this up:** tests here assert counts and topology
easily and shape badly. When you touch geometry, assert exact coordinates and
sweep a parameter range — `tools/verify.js` sweeps 147 rooms across three wall
thicknesses for exactly this reason.

---

## 6. Known bugs and open work

**Real bugs**

1. ~~`roomBoundary()` writes `r.pts` during a *read*.~~ **FIXED 21 Aug 2026.**
   It is a pure read now; the `.ocad` writer materialises its own copy at write
   time via `roomForSave()` in `11-io.js`. Three tests in `test/suites/arch.js`
   pin it, including one reproducing the original corrupt-file sequence
   (trace -> edit -> trace -> undo -> save), verified to fail against the
   pre-fix code.
2. An unenclosed room silently keeps its last good area. `PROPS.room` says
   "follows the walls" and `QUICK.room` says "not enclosed", but the drawing
   gives no signal. Should draw the boundary dashed and flag it in the tag.

**Dead code to delete**

Nothing outstanding. `src/04-arch.js`, `src/05-view-OLDBENCH.txt`, `isArchEnt`,
`rotv`, `dir2`, the `bumpIndex` alias and the `window.saveTypeTable` global are
all gone. `releaseTrack` was on this list and should not have been — it is
live, called from `06-snap.js:411`. Check before deleting on this file's word.

**Polish**

- L/U stair grips still return `a / mid / b`; grip `b` is no longer on the
  object once the stair turns. Give it grips per flight plus the landing.
- Wall face/break snaps silently switch off above 240 walls (`06-snap.js`) with
  no indication.
- Two brick walls meeting at 0.5° produce a 2.3 m mitre spike (`MITRE_MAX`).
- A negative `th` loaded from `.ocad` is accepted; only the props setter guards.
- Quick properties appear at the object's bbox centre, not the cursor.
- Imperial is inconsistent: `fmt()` gives `9'-10 1/8"`, `dispNum()` gives
  decimal feet.

**DWG is experimental and should stay labelled that way.** The reader covers
R13–R2000 and refuses R2004+ rather than half-reading. The bit codec, object
map and CRCs are round-trip verified against the reader, but **nothing has ever
been tested against AutoCAD** — no DWG tooling or sample file was available.
The writer is gated behind a warning dialog. DXF is the proven path.

---

## 7. Publishing to GitHub

Decisions already made: **MIT licence**, and **commit the built
`orthograph.html`** (the single-file download is the whole pitch).

Done already: `LICENSE` (MIT, Copyright (c) 2026 Tanishq Bhattad),
`.gitignore`, `.github/workflows/ci.yml`, and the git history itself. CI runs
`node build.js` then `git diff --exit-code orthograph.html` to fail a stale
build — which has shipped from here before — followed by the tests, the
behavioural checks and the ezdxf gate.

**The one remaining step is creating the repository and pushing, and that is
Tanishq's decision rather than an agent's.** Nothing here should run
`gh repo create` or `git push`. Commit locally and leave it.

README and this file were brought back in line with the code on 27 Aug 2026.
Both had drifted: the README still said there was no paper space, no level
switcher and no boundary trace, all of which had shipped.
