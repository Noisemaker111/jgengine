Drift Foundry now runs well under 16.7 ms a frame on the dev PC, in the menu and while driving, with every prop, building, shadow and effect still drawn.

Drift Foundry at 1280x720, uncapped, three interleaved rounds each (before = the build without this change):

| measure | before | after |
|---|---:|---:|
| median frame, menu view | 37.3, 34.3, 36.0 ms | 10.2, 10.3, 10.5 ms |
| median frame, driving | 63.3, 57.7, 57.7 ms | 13.4, 13.9, 12.9 ms |
| 90th-percentile frame, driving | 81.5, 69.4, 73.0 ms | 17.8, 16.3, 16.3 ms |
| draw calls a frame, menu view | 1,247 | 272 |
| draw calls a frame, driving | 2,660 | 358 |

There was no extra ambient-occlusion scene pass: ambient occlusion reads the beauty pass's depth. The cost was the beauty pass itself (about 1,070 draws), the shadow cascades re-drawing the same props and building chunks, and per-object work every frame.

Prevention: `staticObjectBatches.draw.test.ts` covers composed kit models batching with each part's offset and batches surviving removals; `visibilitySystem.test.ts` fails when a still object is re-placed in the spatial index every frame; `culledTransforms.draw.test.ts` covers culled markers leaving the matrix pass and being rebuilt when shown; `staticTransforms.draw.test.ts` fails when a frozen node misses a parent placed in the same commit; `buildingKit.draw.test.ts` checks glass sits inside its wall; Drift Foundry's `scenery.test.ts` fails when its zone clutter, lamps, towers, barricades or exit arch stop being scenery.

Bends: none. `instanceChunks.draw.test.ts` expectations moved with the new 256 m default cell; the checks themselves are unchanged.

### Changed

- Static batches take composed kit models (models built from `parts` with no roles, variants or motion): each part becomes its own instanced draw at the offset the single-model renderer gives it. Removing a batched prop no longer rebuilds its batch; regrouping one elsewhere still does.
- The `scenery` catalog flag now covers props a run clears away, such as a yard's clutter; Drift Foundry marks its zone clutter, yard lamps and towers, barricades and exit arch as scenery.
- Building chunks default to 256 m cells instead of 64 m (`partitionInstances` `cellSize`). Drift Foundry's beauty and shadow draws for buildings drop by about two thirds for about 2% more triangles; Harbor Heat's draws and triangles are unchanged.
- Box-building window and storefront glass no longer casts shadows when box walls are drawn: each pane sits inside its full wall panel, 2.5 cm proud, so the wall already casts that shadow.
- Building chunk distance tests reuse the chunk's bounds until its world matrix changes, and building chunks leave three's per-frame matrix pass (`freezeStaticTransforms`, which now also settles the node's parents first).
- The scene's matrix pass skips object and entity markers that culling hid, and rebuilds them in the pass that shows them again (`@jgengine/core/visibility/culledTransforms.draw`).
- Culling no longer re-places unchanged objects in its spatial index every frame, and the culling driver stops allocating a sphere and a lookup key per object per frame.
