Draw a scene document on any canvas, no framework

Refs #3262

### Added

- `mountSceneView(canvas, document, options)` (`@jgengine/core/sceneView/mount.draw`) draws a scene document's markers, volumes and paths with plain three.js and no UI framework, and returns `update(document)`, `setCamera`, `objectOf(id)`, `invalidate()` and `dispose()`. It draws only when the document, the camera or the canvas size changes. `options.kinds` maps a kind to a lazy draw module (`() => import("./roof.draw")`), loaded the first time a document uses that kind; other objects draw by shape. Drag turns, pinch or wheel zooms, two fingers or right-drag pans.
- `@jgengine/core/sceneView/sceneView`: the framework-free model under it (document diff by object reference, bounds, camera framing, orbit, zoom and pan).
- `bun run check bundle-budget` fails when the scene view or the scene document entry grows past its gzip budget (scene view: plain three.js + 5 KB; document + undo: 38 KB).
