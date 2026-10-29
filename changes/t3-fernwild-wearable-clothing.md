clothing a rigged human wears shows on its body: `ModelConfig.worn` maps item ids to a body area (head, torso, legs, hands, feet), set per entity with `ctx.scene.entity.update(id, { worn })`

Engine seam: packages/core/src/anim/crowdRegistry.draw.ts, packages/core/src/anim/wearable/wornLayers.draw.ts, packages/core/src/anim/wearable/wornRegion.ts, packages/core/src/game/playableGame.ts, packages/core/src/model/SceneModels.draw.tsx, packages/core/src/scene/entityStore.ts

### Added

- clothing a rigged human wears shows on its body: `ModelConfig.worn` maps item ids to a body area (head, torso, legs, hands, feet), set per entity with `ctx.scene.entity.update(id, { worn })`
- `attachWornLayer` (`@jgengine/core/anim/wearable/wornLayers.draw`): Dress a rigged humanoid in one worn layer: every opaque skinned mesh under `rig` gets a shell of the layer's region, bound to that mesh's own skeleton, so the piece bends with every clip, IK pass and folded first-person head. Also `useWornLayers`.
- `WEAR_REGIONS` (`@jgengine/core/anim/wearable/wornRegion`): The engine's region for each body area: a cap over the crown, a long-sleeved top, trousers, boots to mid-shin, gloves. Also `BodyFrame`, `SkinBone`, `SkinGeometry`, `WearRegion`, `WearRegionName`, `WornLayer`.

### Changed

- Each worn piece is a layer of the body's own skin cut to that area by bone and height, pushed out a few millimetres and skinned to the same skeleton, so it bends with every clip, foot IK and the folded first-person head (`@jgengine/core/anim/wearable`)
- Fernwild's cloth hat, shirt, trousers, gloves and boots now show on the survivor in tan and brown fibre, in third person, first person and the inventory's survivor pane; taking a piece off removes it
- Fernwild credits ambientCG for the cloth texture
