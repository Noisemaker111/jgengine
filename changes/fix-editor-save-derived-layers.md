editor saves (Ctrl+S, save_scene, CLI --save) no longer write a game's code-built layers into editor.scene.json, so save, load, save is stable (#1538)

Engine seam: packages/core/src/devtools/saveEndpoint.ts, packages/core/src/editor/document.ts, packages/core/src/editor/index.ts, packages/editor/src/mcp/cli.ts, packages/node/src/devSavePlugin.ts

### Added

- withDerivedEditorLayers shows code-built markers, volumes and paths in the editor, tagged so saves leave them out; a save reports how many it left out
- `withDerivedEditorLayers` (`@jgengine/core/editor`): Adds code-built layers to an authored scene for display, tagged `meta.derived` so every save drops them again: the scene file keeps only what was authored. Also `DerivedEditorLayers`.
- `withDerivedEditorLayers` (`@jgengine/core/editor/document`): Adds code-built layers to an authored scene for display, tagged `meta.derived` so every save drops them again: the scene file keeps only what was authored. Also `DerivedEditorLayers`.

### Fixed

- editor saves (Ctrl+S, save_scene, CLI --save) no longer write a game's code-built layers into editor.scene.json, so save, load, save is stable (#1538)
- Scrap Signal's scene file loses the 87 AI range volumes an earlier save baked into it; the game still builds them at load
