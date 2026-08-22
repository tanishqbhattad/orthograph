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
