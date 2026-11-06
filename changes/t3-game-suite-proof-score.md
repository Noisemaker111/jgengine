The suite score generator writes into hand-edited READMEs and plans, so it names no outputs and reads only each game's suite files

Engine seam: packages/core/src/commands/commandDispatch.ts, packages/core/src/commands/commandRegistry.ts, packages/core/src/game/controlGate.ts, packages/core/src/game/systemRuntime.ts, packages/core/src/input/shellInputPublication.ts, packages/core/src/movement/playerMovement.ts, packages/core/src/onboarding/onboardingSystem.ts, packages/core/src/play/headlessFlow.draw.ts and 15 more

### Added

- `HeadlessKeys` (`@jgengine/core/play/headlessKeys.draw`): Keys held against a headless {@link PlaySession}, mapped through the game's own bindings.
- `ContextMap` (`@jgengine/core/runtime/contextIdentity`): A `WeakMap` keyed by context identity that treats a wrapper of a context as the context itself ({@link aliasContext}). Also `contextOf`.
- `auditSuiteContent` (`@jgengine/core/suite/contentAudit`): The generic content check behind the suite's data entries: every item has a source and a use, every source is usable, every placeable item places, every firing weapon has obtainable ammo, and unlocks run steadily to the progression cap. Also `SuiteContent`, `SuiteContentItem`, `SuiteContentUse`, `SuiteUnlock`, `placedFact`, `recipeContent`.
- `expandSuiteGenres` (`@jgengine/core/suite/gameSuite`): The genres a declaration reaches, its includes followed. Also `GameSuiteConfig`, `GameSuiteScore`, `SuiteDataResult`, `SuiteProofResult`, `SuiteReport`, `SuiteScoreRow`, `SuiteStatus`, `parseSuiteReport` and 9 more.
- `runGameSuite` (`@jgengine/core/suite/runSuiteProof.draw`): Run a game's whole suite: every proof, then the content check. Also `LoadedSuiteProof`, `SuiteProofRun`, `SuiteProofRunOptions`, `runSuiteProof`.
- `SetupClosedError` (`@jgengine/core/suite/setupWindow`): Thrown when code touches a {@link SetupWindow} view after the window closed. Also `SetupWindow`, `openSetupWindow`.
- `SUITE_ENTRIES` (`@jgengine/core/suite/suiteCatalog`): Every entry, universal first, then by genre. Also `SUITE_GENRES`, `SUITE_UNIVERSAL`, `SuiteDepth`, `SuiteEntry`, `SuiteGenre`, `SuiteProofBy`.
- `CHEAT_COMMAND_NAME` (`@jgengine/core/suite/suiteProof`): Command names a proof treats as cheats even when the game forgot `cheat: true`. Also `ProofPlay`, `ProofSetup`, `SuiteProof`, `SuiteProofSpec`, `defineProof`.

### Changed

- The suite score generator writes into hand-edited READMEs and plans, so it names no outputs and reads only each game's suite files
- runStages test knows game-suite writes into hand-edited READMEs and PLANs
- jgengine suite scores the run it just made, so a regression reads red instead of the committed green report
- Game READMEs and plans lead with the suite score
- Brightway Park: headless suite proofs and the content check; Credits is not simulatable (#2967)
- Per-context state resolves a wrapped context to the real one, so a proof's setup seeds the game's own model
- perContext and the new ContextMap key by contextOf(ctx); the suite runner aliases its setup view to the
- session's context. A game helper handed the setup view used to build a second model for the wrapper.
- Scrap Signal: headless suite proofs; dev capture commands are marked cheat
- Fernwild: 18 headless suite proofs and the content check
- Games declare their suite genres; jgengine suite prints the score and gen writes it to README and PLAN
- Suite proofs: game code may keep the setup context, a command setup defines is a cheat, and the score renders by area
- The setup window lets the game's own ticks, commands and probe through after it closes, so a store
- that registered through the setup context keeps working; proof code that kept it is still refused.
- Game suite: a catalog of what players must be able to do, headless proofs that refuse cheats, and a content check
