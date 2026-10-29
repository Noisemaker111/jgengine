Fernwild's survivor creator on New game: a name, four bodies, a height slider and a live preview

Engine seam: packages/core/src/game/gameFlow.ts, packages/core/src/game/playableGame.ts, packages/core/src/map/map.view.tsx, packages/core/src/menu/gameFlowMenus.view.tsx, packages/core/src/model/SceneModels.draw.tsx, packages/core/src/model/modelLook.ts, packages/core/src/onboarding/onboarding.ts, packages/core/src/onboarding/onboardingSystem.ts and 4 more

### Added

- Fernwild's survivor creator on New game: a name, four bodies, a height slider and a live preview
- seven start beaches on the island map and in a list, graded Easy, Medium or Hard; death wakes you on the beach you chose
- the inventory pane heading shows the survivor's name
- engine per-entity looks (ModelConfig.looks, SceneEntity.look), setSpawnPose, a New game setup screen (newGameSetup) and a per-player onboarding area
- `runPlayed` (`@jgengine/core/game/gameFlow`): Whether a run already played in this world, so a new one has to restart the page first.
- `modelForLook` (`@jgengine/core/model/modelLook`): The model one entity draws for its `look` (`SceneEntity.look`): that entry of `model.looks` laid over the model, so a look swaps the body while keeping the model's held, worn and attachment tables unless it names its own. Also `modelLooks`.
- `useEntityLookModel` (`@jgengine/core/model/SceneModels.draw`): `model` as the live entity `instanceId` draws it: its current `look` laid over the model ({@link modelForLook}), re-rendering only when the look changes.
- `OnboardingArea` (`@jgengine/core/onboarding/onboarding`): Where a `"teaching-area"` onboarding guides: centre XZ and radius in metres, and what to call it.

### Changed

- Proof: bun run drive fernwild --flow fernwild-creator (makes Ada in the north, shows her from the front and in the pane, dies in the south and wakes in the north)

### Fixed

- entity hydrate kept dropping what an entity wore
- world map labels near the east edge read leftward and stay on the map
