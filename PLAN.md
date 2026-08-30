# Orthograph — the road to professional AEC quality

Ordered by dependency, not by appeal. Each phase assumes the one above it is
done. Owner is **you** (a decision only you can make), **agent** (a dispatched
builder or critic), or **integrator** (careful hand work in the main session).

State at the time of writing: `master` carries Wave 1 pieces A1, A2 and A4
integrated — 307 tests, 12/12 behavioural checks, zero known correctness bugs.
A3 is built but unmerged on `piece/A3`.

---

## Phase 0 — DECIDED (21 Aug 2026)

### 0.1 AutoCAD access — granted, but AutoCAD is broken

Access was granted and AutoCAD 2024 launches, but it **will not open a drawing**:
both `New` and the `+` tab do nothing while the process reports as responding.
That is a broken startup path (usually a corrupt profile or a missing `acad.dwt`),
not a hang. Until it is repaired — try **Reset Settings to Default** from the
Start menu before reinstalling — **critics remain expertise-based and must say so
in their verdict.** Revit 2024/2025 and Rhino 8 are untested and may still work
for the Wave 3 model-semantics questions if it comes to that.

### 0.2 Scope — Wave 1 to a professional standard, then ship. Waves 2–4 are out.

Measured cost this session: **250–320k tokens per builder**, plus a critic of
similar size, plus rework rounds. Four parallel builders exhausted the budget in
about 25 minutes, and the cap has been hit three times. On a Pro plan, 21 pieces
× (build + critique + rework) is not reachable — not close.

So the scope is: **finish Wave 1 properly, clear the debt behind it, and ship it.**

The reasoning is not only budget. The precision core *is* what separates a CAD
tool from a toy: snapping, the command line, selection and the viewport are what
a professional judges in the first sixty seconds. Waves 2–4 are not missing
features — the app already draws, dimensions, hatches, and models walls, rooms
and stairs. They are *unpolished* features. Finishing Wave 1 therefore yields a
coherent product; starting Wave 2 would yield a wider unfinished one.

**In scope:** Phase 1 (finish and critique all four Wave 1 pieces), Phase 2
(the debt list), Phase 6 (release).
**Out of scope for this cycle:** Phases 3, 4 and 5. They stay written down, in
order, for whenever there is budget.

### 0.3 File ownership — one writer at a time. This is the rule.

The single largest cost of the last cycle was four builders independently
rewriting `05-view.js` and `14-events.js`, then an integration that surfaced four
breakages no individual branch had — including one that stopped the bundle from
loading at all. Parallelism did not save time here; it moved the work into a
harder place and made it more expensive.

The policy, from now on:

1. **Only one agent holds write access to `src/` at any moment.** No parallel
   builders. This alone removes every merge conflict.
2. **Critics are read-only.** They may run, drive and read the app, and read code
   to explain what they observed, but they never edit. Any number may run at once,
   and they may run alongside the single writer.
3. **A piece is integrated by its own author, not by a third party.** A3's merge
   was attempted by someone who had not written the code and it broke brace
   structure in two files. The author knows the intent.
4. **Merge master *into* the branch before finishing the work, not after.**
   Integrating first means the piece is finished against what actually ships.
5. **Documentation and release work happens in a separate worktree**, so it never
   contends with the writer.

---

## Phase 0 (original) — Unblock. Do these first; they change everything downstream.

| # | Task | Owner | Why it is first |
|---|---|---|---|
| 0.1 | **Approve computer-use access to AutoCAD 2024 / Revit 2025** | you | Every critic so far has judged from expertise because the access prompt was denied. Approving it converts the whole loop from "an expert's recollection of AutoCAD" into an actual side-by-side against the product on this disk. Nothing else improves critique quality this much. |
| 0.2 | **Decide the real scope** | you | At ~250–320k tokens per builder plus critics plus rework, 21 pieces is many budget cycles. Pick one: (a) Wave 1 only, finished to a high standard; (b) breadth-first single pass over all 21, critics later; (c) depth-first through the waves until budget ends. The plan below assumes (c) but works for any. |
| 0.3 | **Plan file ownership per wave before dispatching** | integrator | The single biggest cost so far was four builders independently rewriting `05-view.js` and `14-events.js`. Assign disjoint files per wave, or serialise builders that must share one. |

---

## Phase 1 — Finish Wave 1. Highest value per token: the work is already paid for.

| # | Task | Owner |
|---|---|---|
| 1.1 | **Finish A3 (selection & grips)** — write `test/suites/select.js`, drive it in a browser, keep edits to shared files surgical | agent |
| 1.2 | **Integrate A3** — ~15 conflict hunks. Resolve with `git checkout --ours/--theirs` per region plus targeted edits, verifying `node --check` after each file. My previous attempt hand-spliced and broke brace structure; do not repeat that | integrator |
| 1.3 | **Critic: A2 (command line)** — never ran, killed by the cap | agent |
| 1.4 | **Critic: A4 (viewport)** — never dispatched | agent |
| 1.5 | **Critic: A3 (selection)** | agent |
| 1.6 | **Critic: A1 round 3** — confirm the arbitration fix, then attack the three open gaps: Object-snap tab renders no per-mode checkboxes; Shift+letter overrides inert; PER/TAN not aimed | agent |
| 1.7 | **Rework rounds** until each critic picks Orthograph or names only cosmetic gaps | agent |
| 1.8 | **Wave 1 coherence pass** — one fresh agent uses the whole app end to end and smooths the seams four builders left | agent |

---

## Phase 2 — Debt the merge unblocked. Cheap, and it stops future confusion.

| # | Task | Owner |
|---|---|---|
| 2.1 | Delete `releaseTrack` (06-snap), `bumpIndex` (01-doc), `saveTypeTable` global leak (13-ui) — deferred during the merge because all four branches touched those files | integrator |
| 2.2 | Collapse the `DASH.solid` / `DASH_SOLID` duplication (2 uses vs 19) to one name | integrator |
| 2.3 | Unenclosed rooms: draw the boundary dashed and flag it in the tag. Today an open room silently keeps its last good area | agent |
| 2.4 | L/U stair grips: grip `b` is no longer on the object once the stair turns. Give it grips per flight plus the landing | agent |
| 2.5 | Imperial is inconsistent — `fmt()` gives `9'-10 1/8"`, `dispNum()` gives decimal feet | agent |
| 2.6 | Wall face/break snaps silently switch off above 240 walls, with no indication | agent |
| 2.7 | Two brick walls meeting at 0.5° produce a 2.3m mitre spike (`MITRE_MAX`) | agent |
| 2.8 | A negative wall thickness loaded from `.ocad` is accepted; only the props setter guards | agent |
| 2.9 | Quick properties appear at the bbox centre, not the cursor | agent |

---

## Phase 3 — Wave 2, drafting semantics (AutoCAD parity)

Ordered so the most-used commands land first.

| # | Piece | Primary files |
|---|---|---|
| 3.1 | **B1** Modify command semantics (move/copy/rotate/scale/mirror/offset/array/stretch/align) | `08-modify.js` |
| 3.2 | **B2** Trim, extend, fillet, chamfer, break, join — modes and edge cases | `03-solve.js`, `08-modify.js` |
| 3.3 | **B6** Layers, linetypes, lineweights, ByLayer/ByBlock, layer states | `01-doc.js`, `13-ui.js` |
| 3.4 | **B3** Dimensions & dimension styles — associativity, all types, annotative | `03-solve.js` |
| 3.5 | **B4** Text, mtext, leaders, tables & styles | `08-modify.js`, `13-ui.js` |
| 3.6 | **B5** Hatch & boundary detection — island detection is the hard part | `08-modify.js` |
| 3.7 | **B7** Blocks & attributes — insert, explode, attributes, dynamic-ish | `08-modify.js` |
| 3.8 | Wave 2 integration + coherence pass | integrator + agent |

---

## Phase 4 — Wave 3, model semantics (Revit parity)

| # | Piece | Primary files |
|---|---|---|
| 4.1 | **C1** Wall types & compound structure (real layered assemblies) | `04a-wall.js` |
| 4.2 | **C2** Doors, windows & hosted families — parameters, tags | `04b-openings.js` |
| 4.3 | **C3** Levels, grids & datums — including a level switcher, which does not exist yet | `04c-components.js` |
| 4.4 | **C4** Rooms, areas & schedules | `04c-components.js` |
| 4.5 | **C5** Stairs, floors, roofs & columns | `04c-components.js` |
| 4.6 | **C6** Sections, elevations & view range — the biggest single feature in this phase | new module |
| 4.7 | Wave 3 integration + coherence pass | integrator + agent |

---

## Phase 5 — Wave 4, output & reliability

| # | Piece |
|---|---|
| 5.1 | **D3** Undo, autosave, robustness, scale performance |
| 5.2 | **D1** Sheets, paper space, plotting, PDF — the README lists "no paper space" as a known limit |
| 5.3 | **D2** File interoperability — DXF fidelity, and either validate DWG against real AutoCAD (now possible) or keep it labelled experimental |
| 5.4 | **D4** UI shell, shortcuts, accessibility |
| 5.5 | Wave 4 integration + final coherence pass |

---

## Phase 6 — Release

| # | Task | Owner |
|---|---|---|
| 6.1 | `LICENSE` — MIT, `Copyright (c) 2026 Tanishq Bhattad` | integrator |
| 6.2 | `.github/workflows/ci.yml` — build, `git diff --exit-code orthograph.html` (a stale build has bitten this project twice), tests, verify, then `pip install ezdxf && python tools/check_dxf.py` | integrator |
| 6.3 | Update `README.md` and `HANDOFF.md` — both describe the pre-Wave-1 app and a project path that no longer exists | integrator |
| 6.4 | Create the GitHub repo and push (`gh` is not installed here; web UI or install it) | you |

---

## Process rules learned the hard way

- **Measure performance interleaved, never against a stored number.** The machine under agent load is 2–3× slower; a stored baseline produces phantom regressions.
- **Builders must write their own tests.** The two that did found real bugs; the one that did not is the piece still unmerged.
- **Integration is a task, not an afterthought.** Wave 1's merge surfaced four breakages that no individual branch had, including one that stopped the bundle loading.
- **Ask builders to name what they wired to nothing.** Every builder that did so saved a critic round.
- **Commit in-flight work before anything else when a run is interrupted.** ~3,900 lines were once one crash away from being lost.

---

# Phases 7–10 — after the comparison study (28 Aug 2026)

Five open-source CAD codebases were read against ours: FreeCAD, LibreCAD,
OpenSCAD, OpenCADStudio and cadCAD. **cadCAD is not CAD software** — it is an
economics simulation framework that shares the acronym — and is struck from the
list. The other four produced the ordering below.

**What the study actually established.** None of the four has an architecture
layer: no walls, no hosted openings, no rooms, no schedules. Our snap
arbitration, journalled undo with stable IDs, paper space and test discipline
are ahead of all of them. We are not behind on the things this project is
about. We are behind on **drafting furniture** — hatch patterns, linetypes,
per-viewport layer state — and we had **five data-correctness bugs**, four of
which were found only by comparing against how someone else had solved the same
problem.

**The ordering principle.** Bugs that misreport or destroy data come first, in
every case, before any feature. Every one of the five found this round produced
a *plausible wrong number* rather than a crash: a room area that disagreed with
its own schedule, a `1200+225` that drew a 1200 wall, a hatch that counted its
holes as floor. A crash gets fixed the day it ships; a confident wrong number
gets built.

**The pattern in our own defects, worth stating because it predicts the next
one.** Four of the five were in the same two places: (a) state *derived from
other entities*, where nothing told the dependent thing to update — rooms,
schedules; and (b) the **interop boundary**, where our reader silently discards
what it does not model. Both are places where the failure is invisible from
inside the app. When looking for the next bug, look there first.

---

## Phase 7 — Correctness and interop

Everything here is a verified bug, reproduced before being written down.

| # | Task | Files | Effort | Risk |
|---|---|---|---|---|
| 7.1 | **DXF polyline bulges.** `10-dxf.js:142` reads `p.slice(0,2)`; group code 42 is never read, on `LWPOLYLINE` or `VERTEX`. A consultant's rounded polyline imports as straight chords with no warning, and `check_dxf.py` cannot catch it because it validates the writer, not the reader. **Stopgap first** (tessellate bulged spans at import and `echo` a note — converts silent corruption into visible-but-lossy in an hour), then the real representation: `e.bulges` sparse alongside `e.pts`, arc items out of `shapes()`, exact arc case in `prims()`, arc extrema in `bbox`, sign flip under mirror, tessellate on non-uniform scale, write code 42 back out | `10-dxf.js`, `02-geom.js`, `03-solve.js` | 3–5 d | Med |
| 7.2 | **Door and window schedules never refresh.** `09b-layer.js:927` filters `kind === 'rooms'`, so a placed door schedule is stale from the moment the next door is drawn. Verified: 2 rows, add a door, still 2 rows. Fix as part of 9.1 if that lands first, otherwise on its own | `09b-layer.js` | 2 h | None |
| 7.3 | **Hatch pattern round-trip is lossy both ways.** Import forces `pattern:'line'` and discards the name; export writes `ANSI31`/`ANSI37` regardless. We silently rewrite other people's hatch patterns. Preserve the name on read and write it back even before we can render it | `10-dxf.js:205,687` | 3 h | Low |
| 7.4 | **Audit the rest of the interop boundary the same way.** 7.1 and 7.3 are the two found; the reader almost certainly discards more. Method: build a file in another package, import, export, diff. `check_dxf.py`'s fixture is ours, so it can only ever prove the writer self-consistent | `10-dxf.js`, `tools/` | 1–2 d | Low |

**Exit:** a DXF from another package round-trips without silent loss, and we can
say which entities are lossy and why, per entity.

---

## Phase 8 — Drawing production

Cheap, visible on every drawing, and it retires the limits the README lists
first. Nothing here is architecturally risky.

| # | Task | Files | Effort | Risk |
|---|---|---|---|---|
| 8.1 | **Hatch pattern families.** Three of four agents put this top. A pattern is N line families of `{angle, origin, dx, dy, dashes[]}`, and `dashes` maps 1:1 onto `setLineDash`. **`drawHatch` already implements exactly one family, correctly** — going to N is a loop plus a per-row offset. Author ~16 patterns ourselves as a JS literal (~4 KB): ANSI31/32/37, AR-CONC, AR-BRSTD, AR-B816, AR-HBONE, AR-SAND, INSUL, PLAST, EARTH, GRAVEL, STEEL, NET, HONEY, TRIANG. Then wall poche picks a pattern by layer material rather than a tone weight | `05-view.js` (`drawHatch`), `08-modify.js`, `04a-wall.js`, `10-dxf.js` | 2–4 d | Low |
| 8.2 | **`HULL`.** Andrew monotone chain over the pooled `poly(e, tol)` of a selection. Site boundary from survey points, extent of a furniture layout, escape-route catchment | `08-modify.js` | ~40 lines | None |
| 8.3 | **Offset joins and a miter limit.** `offsetEnt` is miter-only with no limit and no self-intersection cleanup, so a near-reflex vertex produces an arbitrarily long spike — the wall code learned this separately (`MITRE_MAX`). Add round/bevel, a limit, and take OpenSCAD's API decision: the join style falls out of *how you asked* (radius → round, distance → miter), not a fourth prompt | `03-solve.js` | ~120 lines | Low |
| 8.4 | **Per-viewport layer freeze (VPLAYER).** One model, several sheets: GA, setting-out and finishes are the same walls with different layers on. Without it you duplicate geometry. Our viewports already carry their own view state, so `vp.frozen` has a natural home | `07c-sheet.js`, `05-view.js`, `09b-layer.js`, `10-dxf.js` | 2–3 d | Low |
| 8.5 | **Detail views.** A viewport with a parent, an anchor, a radius and an auto reference letter. Standard sheet furniture; our viewport is already `{x,y,w,h,centre,scale}` | `07c-sheet.js` | 2–3 d | Low |
| 8.6 | **Dimension format spec.** Prefix/suffix, `±` tolerance, unit suppression. `dimStyle()` currently returns six numbers | `03-solve.js` | ~150 lines | None |
| 8.7 | **Plot screening.** A per-layer print percentage so demolition and existing-building layers plot at 40% grey. All the machinery exists | `05-view.js`, `09b-layer.js`, `11-io.js` | ~100 lines | Low |
| 8.8 | **"A"-type linetype alignment.** Patterns should begin and end on a full dash with the interior phased to fit; we stroke at `lineDashOffset = 0`, so every centreline ends on whatever fragment falls there. Sibling idea worth more: phase all layers of a compound wall against one reference length so dashes line up across parallel boundaries | `05-view.js`, `04a-wall.js` | ~150 lines | Low |

**Exit:** a printed section distinguishes brick from blockwork from insulation by
pattern, not by grey level — the first item in the README's known limits.

---

## Phase 9 — Model semantics

| # | Task | Files | Effort | Risk |
|---|---|---|---|---|
| 9.1 | **Generic schedule engine.** Replace the hardcoded row builders with a spec `{label, prop, agg, filter, unit}` stored on the table entity and evaluated in `GEOM.table.shapes`, so a schedule is live rather than a snapshot. Subsumes 7.2 and makes any property schedulable | `09d-slab.js`, `09b-layer.js` | ~400 lines | Low |
| 9.2 | **Room boundary provenance.** `roomBlockers` pushes bare `[a,b]` segments with no owner, so which wall bounds which room is thrown away. Thread `{owner, side}` through `roomSplit`/`roomGraph`/`roomWalkFace` and it unlocks per-room wall areas, finish take-off by wall, "select the walls bounding this room", and a perimeter that excludes column notches | `04c-components.js` | ~150 lines | Low |
| 9.3 | **`StandardCode` and shared `Material`.** A NRM/Uniclass code on every element is what makes a schedule orderable; material as a shared record rather than a per-type string | `04a-wall.js`, `04b-openings.js` | ~1 d | None |
| 9.4 | **Property-pulling labels.** A leader whose text is drawn from a named property of the object it points at, removing hand-typed `%<area:id>%`. Retires "no field browser, so they are typed by hand" | `02-geom.js`, `13-ui.js` | ~100 lines | None |
| 9.5 | **Reason-carrying failures.** `####` is right; make it carry *why*, show it on hover, and list every unresolved field in one place. Then kill `'That did not work.'` (`07-cmd.js:710,1958`) — the catch-all on the hot path of every command — and replace it with the command, the live prompt and the rejected value | `02-geom.js`, `07-cmd.js` | ~150 lines | None |

---

## Phase 10 — Driving dimensions

The one constrained interaction with universal value in plan drafting: **type a
number into a dimension and the wall moves.** Built as the first slice of a real
solver, not as a hack, so the rest can layer on without rework.

Scope: Levenberg–Marquardt on a flat `Float64Array`, coincidence eliminated by
union-find before any numerics, connected-component partitioning so a drag
solves the cluster under the cursor rather than the drawing, and a **soft anchor**
(`w·(pᵢ − pᵢ⁰)`, `w ≈ 1e-3`) on every parameter the user did not nominate —
without which a distance constraint moves both walls by half and the tool feels
like a poltergeist. Constraints for the first slice: `distance`, `distX`,
`distY`, plus `fix` implemented as *absent parameters* rather than clamped ones.

- **~700 lines** for the first slice; ~1,850 for the full set (12–15 constraint
  types, diagnosis, glyphs, auto-capture from the snap engine).
- Ship behind `DCLINEAR` with a sysvar to disable and a hard parameter cap, held
  to the existing drag-latency budget. Above ~150 parameters in a component,
  preview unsolved and solve on mouse-up.
- **Hold until someone has drawn a real building in this.** AutoCAD has had
  constraints since 2010 and architect adoption is near zero; the value is
  concentrated almost entirely in the one interaction above.
- The thing that will actually break it is not the maths. It is the interaction
  between solver writes and `wallCacheTouch` / `_arrCache` / `SHPC` — the same
  machinery that produced the stale-room bug. Driving one dimension surfaces
  every coupling bug on a problem small enough to debug.

---

## Explicitly not doing

- **A geometry scripting DSL.** Argued both ways and it loses. AutoLISP shipped
  in 1986 and the people who used it wrote office standards, not geometry.
  Script-first also loses at exactly what drafting is made of — inexact,
  snapped, contextual decisions. If automation is wanted later, it is a **macro
  recorder over `runInput`** (~120 lines, adds no new execution path) and
  **parameters on blocks surfaced as sliders in the properties panel**, not a
  language.
- **General 2D region booleans**, until `AREA` on a real plan is demonstrably
  wrong. Then generalise `09e-boundary.js` onto an integer grid — snap to
  2⁻¹⁰ mm so "same point" is exactly representable, which deletes the entire
  epsilon-tuning problem — rather than writing a sweep from scratch. 500–700
  lines, medium-high risk.
- **Minkowski.** The only 2D architectural use is `offset(r)` with a round join,
  at a tenth of the code.
- **A dependency graph / push recompute.** Ours is pull-based and that is the
  better fit: no ordering problem, no cycles, no two-pass settling. FreeCAD
  needs push because a recompute is an OCC boolean; ours is a repaint. Their own
  source carries `"still touched after recompute"` and a commented-out
  topological sort.
- **A real UCS**, stroke fonts, isometric mode, NURBS splines. All real, all
  documented as limits, none of them ahead of the above.
- **3D.** Unchanged: not until the 2D base is excellent.

---

## Method notes from this round

- **Reading someone else's solution to the same problem is the cheapest bug
  detector we have used.** Five bugs, four of them found by comparison rather
  than by testing, in code with 750 passing tests. The tests were not weak; they
  encoded the same assumptions the code did.
- **Verify every claim in a report before acting on it.** Of the findings
  checked this round, several were stale or wrong in the other direction — a
  "2.3 m mitre spike" measured 1 mm, and a repo briefed as a thin side project
  turned out to be 300,000 lines of Rust.
- **A negative result is a result.** The cadCAD agent's most useful output was
  "this is not CAD software", and its second most useful was a *failure mode*
  from an unrelated domain — a config field accepted, stored and never read —
  which found thirteen unsaved settings in our own code.
- **Watch for licence.** OpenCADStudio is GPL-3.0 with a QCAD-derived pattern
  file; LibreCAD ships patterns as 3.6 MB of DXF. We are MIT and single-file:
  ideas only, and the patterns get authored here.
