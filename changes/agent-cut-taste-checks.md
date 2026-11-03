checks that judged taste, pacing, budgets or process instead of broken code: games-design, game-feel, art-direction, content-gate, concept-homes, stateful-ratchet, type-escapes, changelog, script-help, browser-test-budget, test-spawn-timeouts, fixture-location, no-blocking-wait, recursive-walk, capture-hygiene, scaffold-launch, games-framework, games-capabilities, module-globals, game-front-end, skills, stage-skills --check, the skill-api JSDoc and orphan ratchets, the load guard, the CPU and frame timing gates, and verify:fast's exit 2 for files no test reaches

Engine seam: packages/assets/src/catalogs/entryFiles.ts, packages/core/src/hud/WorldHud.draw.tsx, packages/core/src/movement/reference/flightPower.ts, packages/core/src/plants/groundCover/groundCoverSpecies.ts, packages/jgengine/src/find/codeMap.ts, packages/jgengine/src/projectConfig.ts, packages/jgengine/src/templates/browserLaunch.ts, packages/jgengine/src/templates/starterGame.ts

### Migrate

- jgengine.json capabilities no longer has debt; CapabilityDebt is removed

### Added

- scripts/skillDocs.test.ts keeps the two skill-sync assertions that catch SDK-user breakage: valid SKILL.md frontmatter named for its folder, and every @jgengine path a skill doc names exists

### Changed

- bun run check: killed at the 600 s limit before (games-depth still running), 112 s and passing after. verify:fast --no-cache on a one-line Fernwild change: 332 s and failing before, 23 s and passing after

### Fixed

- asset build globs on Windows skip built .lods folders and honour exclusions

### Removed

- checks that judged taste, pacing, budgets or process instead of broken code: games-design, game-feel, art-direction, content-gate, concept-homes, stateful-ratchet, type-escapes, changelog, script-help, browser-test-budget, test-spawn-timeouts, fixture-location, no-blocking-wait, recursive-walk, capture-hygiene, scaffold-launch, games-framework, games-capabilities, module-globals, game-front-end, skills, stage-skills --check, the skill-api JSDoc and orphan ratchets, the load guard, the CPU and frame timing gates, and verify:fast's exit 2 for files no test reaches
- CI's perf-cpu, perf and smoke placeholder jobs; branch protection requires only ci
- the exemption markers (framework-ok, home-ok, walk-ok, wait-ok, fixture-location) and the capability debt entries that only those checks read, and every doc line telling agents to satisfy them
