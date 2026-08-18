# Orthograph — handoff for Claude Code

Browser CAD: AutoCAD-style drafting with a Revit-style parametric architecture
layer, shipped as one self-contained HTML file.

**State as of handoff: everything builds, 264 unit tests pass, 20 behavioural
checks pass, DXF validates against ezdxf with 0 audit errors.** No known
blockers. The open items at the bottom are polish and one real correctness bug
(see *Known bugs*, item 1).

---

## 1. Where everything is

The project currently lives in a Cowork session output folder:

```
C:\Users\Tanishq\AppData\Roaming\Claude\local-agent-mode-sessions\
  830c8908-0ab0-4b96-adc9-fa975890b82d\
  513eca51-846b-41bf-86a4-4276f7f2c3c5\
  local_90670052-77ef-4e31-b809-d109d9ac6f5e\
  outputs\orthograph\
```

> **Do this first.** That path is session-scoped and will not survive. Copy the
> whole `orthograph\` folder somewhere permanent before doing any work:
>
> ```powershell
> $src = "C:\Users\Tanishq\AppData\Roaming\Claude\local-agent-mode-sessions\830c8908-0ab0-4b96-adc9-fa975890b82d\513eca51-846b-41bf-86a4-4276f7f2c3c5\local_90670052-77ef-4e31-b809-d109d9ac6f5e\outputs\orthograph"
> Copy-Item -Recurse $src "$HOME\projects\orthograph"
> cd "$HOME\projects\orthograph"
> ```
>
> Everything below assumes you are in the project root.

### Tree

```
orthograph/
├─ orthograph.html          THE ARTEFACT — 432 KB, open in any browser. Generated.
├─ build.js                 concatenates src/*.js into src/shell.html → orthograph.html
├─ package.json             npm run build / test / check-dxf / make-fixture
├─ README.md                user-facing docs
├─ HANDOFF.md               this file
│
├─ src/                     ~9,250 lines. Build order is defined in build.js ORDER.
│  ├─ shell.html            markup + ALL CSS, with a placeholder for the bundle
│  ├─ 00-core.js            maths, ACI colour, units, fmt/parseLen
│  ├─ 01-doc.js             document model, journalled history, spatial index, DIRTY set
│  ├─ 02-geom.js            entity geometry, hit testing, transforms, grips, GEOM registry
│  ├─ 03-solve.js           intersections, offset, trim/extend, fillet, dimensions
│  ├─ 04a-wall.js           walls: joins, mitres, breaks, cleanup, wall spatial hash
│  ├─ 04b-openings.js       doors and windows, Revit-style flips
│  ├─ 04c-components.js     columns, stairs, ROOM TRACING, grids
│  ├─ 04d-area.js           AREA MEASUREMENT: bases, deductions, schedule, FAR
│  ├─ 05-view.js            viewport, renderer, shape cache, view rotation
│  ├─ 06-snap.js            snap engine, ST interaction state, pickAt/pickGrip
│  ├─ 07-cmd.js             command engine, drawing commands
│  ├─ 08-modify.js          modify, inquiry, blocks, hatch
│  ├─ 09-archcmd.js         architecture commands, ARCH defaults
│  ├─ 10-dxf.js             DXF reader (R12–R2018) and writer (R2000)
│  ├─ 11-io.js              SVG, PNG, native .ocad project file
│  ├─ 12-dwg.js             DWG reader/writer — EXPERIMENTAL, see §6
│  ├─ 13-ui.js              rails, menus, layers, properties + Command panel
│  ├─ 14-events.js          events, dynamic input, files, boot, demo seed
│  ├─ 04-arch.js            ⚠ DEAD STUB — split into 04a/04b/04c, not in build. Delete.
│  └─ 05-view-OLDBENCH.txt  ⚠ scratch left by an agent. Delete.
│
├─ test/
│  ├─ run.js                core suite + fixture emitter
│  ├─ load.js               loads the bundle into a vm sandbox; exports run() and bootApp()
│  ├─ dom-stub.js           minimal DOM + TRACING CANVAS (this is how rendering is tested)
│  ├─ extra.js              auto-loads test/suites/*.js
│  ├─ suites/               walls.js, snap.js, ui.js, arch.js, input.js, area.js
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
node test/run.js         # 264 unit tests, zero dependencies
node test/run.js wall    # run a subset by name substring
node tools/verify.js     # 20 behavioural checks
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

There is no browser. `test/load.js` evaluates the bundle in a `vm` sandbox.
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

**Area measurement re-bases a traced ring.** `areaTrace(seed, lvl, basis)`
traces the enclosure the same way a room does, then walks each edge, finds the
wall face carrying it (`faceCarrier`) and moves that edge onto the wall's
centreline or far face before re-solving the corners. That is why mixed
thicknesses and angled walls stay exact. Categories, factors and column
deductions live on the entity; `areaSchedule()` groups and totals them.

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

An adversarial review found four blockers that 244 passing tests had missed.
All are fixed, but they show where the sharp edges are:

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

1. `roomBoundary()` in `04c-components.js` writes `r.pts` during a *read*, with
   no `mut()` and no `DOCV++`. Right after `undo()`, `r.pts` can still hold the
   post-move polygon until something re-reads it. A `.ocad` or DXF written in
   that window persists a state undo never produced. **Fix properly** — either
   make it a pure read that caches outside the entity, or journal the write.
2. An unenclosed room silently keeps its last good area. `PROPS.room` says
   "follows the walls" and `QUICK.room` says "not enclosed", but the drawing
   gives no signal. Should draw the boundary dashed and flag it in the tag.

**Dead code to delete**

`src/04-arch.js` (stub), `src/05-view-OLDBENCH.txt`, `isArchEnt` (04a),
`rotv` (04b), `releaseTrack` (06), `bumpIndex` alias (01), `dir2` in
`stairPath`, and `window.saveTypeTable` leaks a global out of
`openTypeManager` (13-ui).

**Polish**

- Rail icons are flat plan-view symbols throughout. An isometric set was tried
  and reverted: at 16px the extra edges turned to mush and the silhouettes
  stopped being distinguishable. If it is attempted again, design at 16px
  rather than 20px and check the icons side by side at actual size.

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

Not yet created — these are the remaining steps:

1. `LICENSE` — MIT, `Copyright (c) 2026 Tanishq Bhattad`.
2. `.gitignore`:
   ```
   node_modules/
   test/out/
   *.log
   ```
3. `.github/workflows/ci.yml` — on push: `node build.js`,
   `git diff --exit-code orthograph.html` (catches a stale build),
   `node test/run.js`, `node tools/verify.js`, then
   `pip install ezdxf && python3 tools/check_dxf.py test/out/fixture.dxf`.
4. `git init && git add -A && git commit -m "Orthograph: browser CAD"`.
5. Create the repo and push. There is no GitHub connector in this Cowork
   session, so this step has to be done with `gh repo create` or the web UI.

README states the test count; it says 264, correct as of this handoff. Keep it
honest — CI runs the same suite, so a stale number will be visible.
