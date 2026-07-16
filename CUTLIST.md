# Surface cut list (historical)

**Superseded as the primary backlog by [CRITIQUE-ACTIONS.md](CRITIQUE-ACTIONS.md).**

This file records the surface-diet pass that shipped from the 2026-07 critique (orphans, barrels, empty games, Windows `guard`). Keep for metrics; open new work on `CRITIQUE-ACTIONS.md`.

## Results

| Metric | Kickoff | After cut |
| --- | --- | --- |
| Orphan baseline | 1411 | **362** |
| API doc debt | ~3476 | **~2679** |
| Core package root | host barrel | VERSION/CHANGELOG only |
| Empty local `Games/*` | ~51 | 0 |

Tooling: `scripts/mark-internal.ts`, `scripts/cutlistSurface.test.ts`, `scripts/apiAdoption.ts` (packages/* consumers).
