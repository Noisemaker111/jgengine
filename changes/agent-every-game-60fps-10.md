Scattered plants and rocks draw through the shared static batches, so every chunk, variant and detail level with the same material is one draw per area instead of one draw each (Fernwild: 738 draws down to about 370, frame p95 24.8 ms to 15.6 ms).

### Fixed

- Scattered plants and rocks draw through the shared static batches, so every chunk, variant and detail level with the same material is one draw per area instead of one draw each (Fernwild: 738 draws down to about 370, frame p95 24.8 ms to 15.6 ms).
- Unique near plants and rocks (scatter heroes) join the same shared batches instead of drawing every part of every hero on its own in the main pass and each shadow cascade.
- World-projected (triplanar) materials now follow each placement's own rotation, so instanced and batched rocks blend their texture by their real facing, and they can share batched draws.
- A shared batch picks up textures its source material swaps in after the batch was made, such as generated rock surfaces whose bake lands after the first rock is placed.
- Clicking a building piece or other batched scenery that names no object no longer reports an empty object id.
