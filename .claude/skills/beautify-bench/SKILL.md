---
name: beautify-bench
description: Benchmark the make-it-beautiful loop — measure tokens, time, quality; tune the process.
---

# Beautify bench — tune the loop, not just the game

## What this is

A repeatable harness for improving the **process** behind "make this game look beautiful": run the same visual task through the currently documented flow, measure what it cost and what it produced, change one process lever, run again. The game getting prettier is a side effect; the deliverable is a cheaper, faster, better-routing loop — with every run logged in [`index.md`](index.md) so the improvement curve is visible.

## The benchmark task

Default: **"Make the starter area, terrain and environment of the `borderlands2` game look a lot better. Materials, textures, assets, models, icons — do it all."** Runs may build on the previous run's world state — the task is judged on *delta and cost*, not on starting from zero. Swap in another game only with a new index section, never mid-series.

## Protocol (one run)

1. **Clean instrument state.** Note the current `main` commit. Pick the one process lever this run tests (see Levers) and apply it *before* launching.
2. **Launch one worker agent** (Opus for judgment-heavy runs, Sonnet when testing cheap-loop levers) with ONLY the user-style task prompt plus "work in this repo; follow CLAUDE.md and the skills." **Never put workflow hints, tool names, or screenshot instructions in the prompt** — routing must come from the docs, or the run measures nothing.
3. **Measure** from the Agent tool result and artifacts:
   - `tokens` — subagent_tokens from the run (sum across resumes)
   - `minutes` — wall-clock duration_ms summed
   - `iterations` — screenshot count the worker took (its shots are the trace)
   - `quality 0-5` — the orchestrator (not the worker) judges the final default spawn `--mode play` shot: 0 = unchanged, 2 = fails the `jgengine-ui` rejection test, 3 = passes it, 5 = ships-on-a-store-page. Look at the before/after with your own eyes; never accept the worker's self-grade.
4. **Log the run** as one row in `index.md` + a one-line comment saying what lever changed and whether it paid.
5. **Keep or revert the lever.** Paid → fold it into the real skills/scripts (docs ship in the same PR). Didn't → revert and log that too; a negative result is a result.
6. Ship the run's row + any process changes as one PR.

## Levers (start here, extend freely)

Tracked in [issue #710](https://github.com/Noisemaker111/jgengine/issues/710). Test one at a time:

- **Warm loop**: `shoot`/`drive --keep` once (dev server + Chrome on fixed debug port 9223 survive the process exit), `--connect 9223` every re-shot after — <10s per re-shot instead of a ~90s vite+Chrome reboot (`jgengine-verify` → "The warm loop")
- **Half-res judge shots**: `--size half` mid-loop (~1/4 the image tokens); drop it for full-res final evidence
- **Scoped typecheck**: `bun run --cwd Games/<id> check-types` (`tsgo -p Games/<id>/tsconfig.json`, ~5s) instead of full `check-types` per tweak
- **Read/edit discipline**: offset reads, read-before-edit, batch edits per re-shoot
- Skill wording changes (sharper rejection test, spawn-camera-first rule, art-stack ordering)
- Model/effort mix for the worker

## Rules

- One lever per run — otherwise the row attributes nothing.
- The orchestrator's eye is the only quality gate. Reject generously; the #706 baseline shipped only after a rejection round.
- `index.md` is append-only history; never rewrite old rows.
- Cost of the bench itself counts: if a run burns more than it saves across two future runs, say so in the comment.
