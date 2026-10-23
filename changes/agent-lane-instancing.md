### Added

- `ModelLodConfig.crowdCapacity` declares how many characters of one model a batch draws (default 128). A character past the cap keeps its own rig at its distance tier instead of disappearing.
- `ModelLodConfig.crowdDistance` accepts `0`, which batches a character at every distance instead of only past 25 m. A game with a near crowd or a close-quarters army sets it to batch members in front of the camera too.
- `characterRigTier` (`@jgengine/shell/render/characterLod`) resolves the distance tier a character poses its own rig on, which is the fallback for an over-cap crowd.

### Changed

- The character batch path now covers every drawable character model, not only skinned locomotion rigs: a node-transform character (rotating limbs, no skin) rides the node a clip moves, and a model with no clips at all batches as a static geometry. Both still bake to one geometry per material, so a crowd draws once per model and material.
- Batched characters are pickable: the batch carries the entity ids of the instances it drew, so `worldHit().entity` and a click on a batched character resolve to the character instead of falling through to the ground.

### Fixed

- A crowd batch silently dropped members past its fixed 128 instances while their markers still hid them, so a full scene lost characters. Members past the declared capacity now keep their own rigs.
- A crowd batch's clock now follows the game clock when one is bound, so a paused game no longer keeps its crowd walking.
