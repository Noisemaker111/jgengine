# Beautify bench — run log

Task: the-robots starter area (see SKILL.md). Append-only; one row per run. `tokens`/`minutes` include all worker resumes. `quality` judged by the orchestrator on the default spawn `--mode play` shot (0-5).

| run | date | main commit | model | lever tested | tokens | minutes | iterations | quality | comment |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 2026-07-14 | pre-#706 | opus | baseline — no lever, raw skills routing (PR #706) | ~220k | ~21 | 13 | 3 | Skills routed shot→judge→art-stack unprompted ✓. First self-report was over-graded (spawn shot unchanged) — orchestrator rejection round required. Cost sinks measured: vite+Chrome reboot per shot (~90s), whole-file re-reads, full check-types per tweak, full-res shots every iteration → filed #710. |

## tower-guard series

Task: tower-guard starter area, terrain, environment (swapped game; see SKILL.md default-task note). Same columns/definitions as above; new series because the task target changed.

| run | date | main commit | model | lever tested | tokens | minutes | iterations | quality | comment |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-07-15 | 0324a06 | opus | baseline — no lever, raw skills routing, first run on this game | ~213k | ~24 | 3 shots (baseline → dust-bowl overcorrection → corrected/final) | 4 | Rebuilt flat olive terrain + gray-cylinder keep + monotone pine wall into a zoned scene (noise-driven terrain detail, stone castle keep, zoned foliage regions, golden-hour sky+fog, warm shadowed lighting) — all via editor.scene.json data, no hardcoded geometry. Self-corrected an overcorrection (dust-bowl sand band) mid-loop without orchestrator intervention. Held short of a 5: tree/rock silhouettes still read as repeated low-poly primitives up close. |
