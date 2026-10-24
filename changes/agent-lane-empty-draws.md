### Fixed

- `countStaticBatchDraws` (`@jgengine/shell/world/staticObjectBatches`) counts the draws the static batches submit, so a variant level with no instance in a cell and a cell the camera culled are no longer reported as draws. `submitInstanceCount` (`@jgengine/shell/render/submittedDraws`) is the one place the batch, scatter, proxy and authored-primitive paths set an instance count and its visibility, and three issues a draw only when both say there is something to draw.
