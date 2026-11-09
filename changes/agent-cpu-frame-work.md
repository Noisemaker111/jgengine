frames cost less CPU in every game with the same image: culling walks only changed stores and marks its sets on each object's record, static prop batches re-gather only when their own members entered or left the view and run their sources only after a change, terrain height samples are about 40% faster with identical heights, grass bakes are faster and keep their tufts, foot IK no longer recomposes every ancestor, and three's render and shadow walks start from the nodes they draw

### Added

- `FlatWalkRenderer` (`@jgengine/core/render/flatSceneWalk.draw`): The renderer parts the flat walk wraps: three's render lists and shadow pass, and its render counter.
- `SceneWalkStarts` (`@jgengine/core/visibility/culledTransforms.draw`): The walk starts the scene's last matrix pass found; `serial` changes with every pass.
- `IdSet` (`@jgengine/core/visibility/visibilitySystem`): A read-only set of ids: membership, count and iteration. Also `RenderableSource`.

### Fixed

- frames cost less CPU in every game with the same image: culling walks only changed stores and marks its sets on each object's record, static prop batches re-gather only when their own members entered or left the view and run their sources only after a change, terrain height samples are about 40% faster with identical heights, grass bakes are faster and keep their tufts, foot IK no longer recomposes every ancestor, and three's render and shadow walks start from the nodes they draw
- the stray browser sweep counts a kill by whether the browser exited, so a busy PC's slow taskkill no longer leaves a dead browser's profile behind
