### Changed

- A rigged model's skinned parts merge into one skinned mesh per skeleton and material at load (`mergeSkinnedModelParts`, `@jgengine/shell/render/modelMeshMerge`). Vertices move into bind space and skin indices are remapped onto the union of the parts' bones, so the posed result is unchanged. A KayKit character's six body parts become one draw and one bone-matrix upload per character.
- Characters now carry distance tiers. Under 15 m the rig poses every frame, under 40 m every other frame with the accumulated time, and past 25 m a crowd-eligible rig is drawn by the GPU crowd path and stops updating bones. The thresholds live in `ModelConfig.lod` per model; `lod: false` keeps a model at full rate (a player avatar or a cutscene character), and the local player is always full rate. Any animated model with no `ik`, `attachments` or `parts` is crowd-eligible, so a game with no configuration still loses its distant characters' skeletons.
- `CharacterCrowd` (`@jgengine/shell/render/CharacterCrowd`) draws those far characters: one baked rig per kind, one instanced draw per material, each member's clip, gait phase and speed sampled on the GPU. Entity markers decide the tier, so a character only leaves its rig once the batch for its kind is baked.

Harbor Heat at the spawn view: 426 skinned meshes  71, bone pose writes per frame 2,894  41, draws 2,537  1,387, `updateMatrixWorld` 1.47  1.36 ms, frame 25.1  16.7 ms.

### Added

- `ModelLodConfig` (`@jgengine/core/game/playableGame`) sets a character model's full-rate, half-rate and crowd distances plus the crowd hysteresis.
- `characterLodTier` / `characterLodPolicy` (`@jgengine/shell/render/characterLod`) resolve a distance to a tier, and the `render/characters` devtools system probe reports rigs by tier, skinned parts, bone pose writes per frame and crowd instances in `debug_snapshot().systems`.
