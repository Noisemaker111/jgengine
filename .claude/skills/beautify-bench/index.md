# Beautify bench — run log

Task: borderlands2 starter area (see SKILL.md). Append-only; one row per run. `tokens`/`minutes` include all worker resumes. `quality` judged by the orchestrator on the default spawn `--mode play` shot (0-5).

| run | date | main commit | model | lever tested | tokens | minutes | iterations | quality | comment |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 2026-07-14 | pre-#706 | opus | baseline — no lever, raw skills routing (PR #706) | ~220k | ~21 | 13 | 3 | Skills routed shot→judge→art-stack unprompted ✓. First self-report was over-graded (spawn shot unchanged) — orchestrator rejection round required. Cost sinks measured: vite+Chrome reboot per shot (~90s), whole-file re-reads, full check-types per tweak, full-res shots every iteration → filed #710. |
