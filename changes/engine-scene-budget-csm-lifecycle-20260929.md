### Fixed

- Cascaded shadows release lights, targets, GPU shadow maps and disposed model shader bindings. Streamed meshes retain authored shader hooks without a full-scene material scan each frame.
- Composed model assets start loading together through the existing cache. Material maps apply before their first GPU upload rather than after the parent model draws.
