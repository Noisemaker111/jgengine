Faster frames in every game with a large scatter field: an instanced draw that holds nothing, and a field chunk past its draw distance, now leave the per-frame matrix pass instead of being walked every frame

Root cause: a scatter field mounts one instanced draw per chunk, species, variant and part; the far ones emptied when their placements switched to impostor cards stayed in the scene graph, so Fernwild's matrix pass walked about 8,500 nodes a frame (about 4 ms)

Refs #2730

### Changed

- Faster frames in every game with a large scatter field: an instanced draw that holds nothing, and a field chunk past its draw distance, now leave the per-frame matrix pass instead of being walked every frame
- The matrix pass's check for a world matrix written from outside is unrolled and skips the constant bottom row
