# Engine gaps

Raw problems only — no game names, no genres, no solutions. Boxes stay `- [ ]` until the gap is fixed and verified.

- [ ] No way to paint a dynamic texture onto an entity's mesh at runtime; the paint-shaped APIs only record surface-name strings per wall or terrain cell, and entity GLBs render as static scenes.
- [ ] Pointer picking returns geometry and identity only; there is no way to sample the colour or PBR material of the surface under a hit point.
- [ ] No per-entity PBR material override at runtime; entity render config carries no colour, metallic, or roughness channel.
- [ ] No skeletal animation playback for entity GLBs — clips are loaded then dropped; there is no pose library and no way to hold a rig on a chosen pose or frame.
- [ ] Replicated entity snapshots carry no appearance field and the ws codec is JSON text only, so per-entity visual state cannot sync to other clients.
- [ ] Every sensor is geometric (radius, line of sight, frustum); nothing can score how well an entity's appearance blends into its background.
- [ ] No per-entity freeze state and no detector that flags or penalizes movement while frozen.
- [ ] Round teams are opaque score buckets — no asymmetric role assignment, no pluggable win-condition evaluators, and round phase names and count are hardcoded.
- [ ] Collision against arbitrary authored level meshes is unverified; physics shapes are footprint, AABB, or voxel only.
