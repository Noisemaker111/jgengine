A change that makes a game load slower now fails `verify:fast` (and so `lane:close`) on this PC, instead of being found on jgengine.com later.

### Added

- `bun run shoot --load <game> --guard`: builds only the /play runner (apps/dev reads package source, ~40 s), opens `/play/?game=<id>` in a fresh Chrome profile on the real GPU, and fails when the worst freeze or scene ready is worse than `scripts/load-baseline.json` beyond noise (worst freeze: 1.5x or +400 ms; scene ready: 1.3x or +1.5 s). A failing game gets one more cold run first. Baselines are per GPU; a game without one is skipped with a hint. `--save-baseline` records games. Never runs in CI (it skips when `CI` is set).
- `verify:fast`: for the games a change boots (render, boot or game changes, per the #2500 scope), a `load guard <game>` step runs alone on the machine, cached by the same inputs as the boot probe.

### Changed

- Terrain detail shader: each blended slot inlines the procedural surface function once instead of three times (rock, paint layer and base each had their own call), so the terrain program is a third the code for the HLSL compiler. Same pixels.
- Baselines recorded for deepward and harbor-heat on the RTX 3070.

Guard proof: planting a 2.5 s main-thread stall in deepward's room lights made `bun run shoot --load deepward --guard` exit 1:
`deepward: worst freeze 2541 ms, baseline 636 ms, limit 1036 ms` and `deepward: scene ready 6407 ms, baseline 4871 ms, limit 6371 ms`.

Cold loads on current beta (site build, fresh profile, NVIDIA DXCache cleared before each game; ms):

| game | worst freeze | scene ready |
|---|---:|---:|
| apex-nights | 839 | 10863 |
| beacon-bastion | 838 | 19448 |
| briarcrown | 576 | 18059 |
| brightway-park | 720 | 17949 |
| deepward | 701 | 5489 |
| ember-command* | 945 | 26008 |
| fernwild* | 1266 | 26825 |
| harbor-heat* | 2405 | 33325 |
| odd-orbit* | 1076 | 18293 |
| orbit-watch* | 726 | 10319 |
| outpost-zero* | 834 | 11332 |
| red-frontier* | 776 | 11059 |

\* measured while a second load run overlapped on the GPU, so these read slow.
After (runner build, cold): deepward 636 / 4871, harbor-heat 2168 / 42084 (other agents' test runs shared the machine).

Not done: scene ready is still 10–40 s for most games; the shader compile cost per program and the drift-foundry / harbor-heat main-thread freezes were not traced; drift-foundry, hold-the-line, saltwick, scrap-signal and the-sunken-crown have no clean measurement.

Verification:
- `bun test scripts/load-check.test.ts scripts/verify-fast.test.ts packages/shell/src/terrain/terrainDetailMaterial.test.ts`: pass
- `bun run shoot --load deepward --guard` with a planted stall: exit 1 (above)

## Bends

- None.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
