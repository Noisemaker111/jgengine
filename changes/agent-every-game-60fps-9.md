Characters out of view are no longer animated: they draw nothing and cast no shadow, so their skeletons are not posed until they come back into view (Scrap Signal: 3,508 bone writes a frame down to 32).

### Fixed

- Characters out of view are no longer animated: they draw nothing and cast no shadow, so their skeletons are not posed until they come back into view (Scrap Signal: 3,508 bone writes a frame down to 32).
- Building kit pieces join the shared static batches, so walls and roofs of every building that share a material draw together per area instead of one draw per building chunk.
- Props with texture-map overrides (panel and scrap-metal crates, rocks) now batch like any other scenery instead of drawing one at a time; Scrap Signal's frame went from 25.7 ms to 16.5 ms at p95.
