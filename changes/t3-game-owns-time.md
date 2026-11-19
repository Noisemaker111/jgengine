ctx.wallClock(), the epoch clock a context was made with; game saves, away time and the save list's 'minutes ago' read it instead of Date.now()

Engine seam: packages/core/src/audio/musicDirector.view.ts, packages/core/src/audio/musicVoices.view.ts, packages/core/src/audio/synthEngine.view.ts, packages/core/src/combat/ImpactFeedback.draw.tsx, packages/core/src/combat/ShotFeedback.draw.tsx, packages/core/src/editor/commandApply.ts, packages/core/src/multiplayer/multiplayer.draw.ts, packages/core/src/runtime/gameContext.ts and 3 more

### Added

- ctx.wallClock(), the epoch clock a context was made with; game saves, away time and the save list's 'minutes ago' read it instead of Date.now()
- JG_TEST_DATE runs the test suite as if the machine's clock said that day (dates, file times and child processes together); bun scripts/test-dates.ts runs the whole suite on three days and names any result that moved: none does

### Fixed

- core never calls Math.random: audio noise and particle scatter draw from fixed seeded streams, ids use crypto.randomUUID, and the editor names a new prefab instance from the document (the same edit always gets the same id)
- three heavy tests (100 generated trees, a stand of trees, the walking validation table) declare their time instead of timing out at 5 s beside the other test lanes
