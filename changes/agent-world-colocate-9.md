The last world and render features leave `@jgengine/shell` for their `@jgengine/core` folders: character animation, foot IK, ragdolls, GPU crowds and glances join `anim`; the living-world layer joins `weather`; interior dressing joins `buildings`; sprite batches and tile layers join `render`; static object models join `instancing`; physics body and joint drawing join `physics`; dropped items join `item`; flocks join `ai`; tire marks join `vfx`; world bars join `hud`; the territory overlay joins `placement`; data objects join `data`. `@jgengine/shell` now holds only the game player, its frame drivers and the scene roots.

### Migrate
- `@jgengine/shell/TerritoryOverlay` → `@jgengine/core/placement/TerritoryOverlay.view`
- `@jgengine/shell/render/CharacterCrowd` → `@jgengine/core/anim/CharacterCrowd.draw`
- `@jgengine/shell/render/CorpseRagdolls` → `@jgengine/core/anim/CorpseRagdolls.draw`
- `@jgengine/shell/render/InteriorDressing` → `@jgengine/core/buildings/InteriorDressing.draw`
- `@jgengine/shell/render/LivingWorldLayer` → `@jgengine/core/weather/LivingWorldLayer.draw`
- `@jgengine/shell/render/PartMotion` → `@jgengine/core/anim/PartMotion.draw`
- `@jgengine/shell/render/SkinnedInstances` → `@jgengine/core/anim/SkinnedInstances.draw`
- `@jgengine/shell/render/characterGlance` → `@jgengine/core/anim/characterGlance.draw`
- `@jgengine/shell/render/crowdBatch` → `@jgengine/core/anim/crowdBatch.draw`
- `@jgengine/shell/render/crowdRegistry` → `@jgengine/core/anim/crowdRegistry.draw`
- `@jgengine/shell/render/entityMuzzle` → `@jgengine/core/anim/entityMuzzle.draw`
- `@jgengine/shell/render/livingWorld` → `@jgengine/core/weather/livingWorld.draw`
- `@jgengine/shell/render/testFixtures/proceduralSpriteAtlas` → `@jgengine/core/render/testFixtures/proceduralSpriteAtlas.view`
- `@jgengine/shell/render/testFixtures/proceduralTileLayer` → `@jgengine/core/render/testFixtures/proceduralTileLayer.view`
- `@jgengine/shell/render/useEntityRenderCues` → `@jgengine/core/anim/useEntityRenderCues.draw`
- `@jgengine/shell/render/useFootIk` → `@jgengine/core/anim/useFootIk.draw`
- `@jgengine/shell/render/useModelAnimation` → `@jgengine/core/anim/useModelAnimation.draw`
- `@jgengine/shell/render/useRagdoll` → `@jgengine/core/anim/useRagdoll.draw`
- `@jgengine/shell/world/AuthoredFlocks` → `@jgengine/core/ai/AuthoredFlocks.draw`
- `@jgengine/shell/world/DataObjects` → `@jgengine/core/data/DataObjects.draw`
- `@jgengine/shell/world/InstancedBodies` → `@jgengine/core/physics/InstancedBodies.draw`
- `@jgengine/shell/world/InstancedJoints` → `@jgengine/core/physics/InstancedJoints.draw`
- `@jgengine/shell/world/SpriteBatch` → `@jgengine/core/render/SpriteBatch.draw`
- `@jgengine/shell/world/StaticObjectModels` → `@jgengine/core/instancing/StaticObjectModels.draw`
- `@jgengine/shell/world/TileLayerRenderer` → `@jgengine/core/render/TileLayerRenderer.draw`
- `@jgengine/shell/world/WorldItems` → `@jgengine/core/item/WorldItems.draw`
- `@jgengine/shell/world/WorldTireMarks` → `@jgengine/core/vfx/tireMarks.draw`
- `@jgengine/shell/world/entityPose` → `@jgengine/core/anim/entityPose`
- `@jgengine/shell/world/staticObjectBatches` → `@jgengine/core/instancing/staticObjectBatches.draw`
- `@jgengine/shell/world/tileLayerInstances` → `@jgengine/core/render/tileLayerInstances`
- `@jgengine/shell/world/worldBarSamples` → `@jgengine/core/hud/barSamples.draw`

`verify:fast` boots only games the load check can open: a change touching llmville no longer fails the load guard with "unknown game". `siteGames` moved to `scripts/siteGames.ts`.
