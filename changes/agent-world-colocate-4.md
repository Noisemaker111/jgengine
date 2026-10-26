Roads, the city renderer and the authored-scene renderers live in their `@jgengine/core` feature folders beside their models; the sprite and tile previews join `core/render`.

### Migrate
- `@jgengine/core/hud/hudPanelLayoutPreview.view` → `@jgengine/core/hud/hudLanesPreview.view`
- `@jgengine/react/roads/streetGeometryPreview` → `@jgengine/core/roads/streetGeometryPreview.view`
- `@jgengine/react/spriteClipPreview` → `@jgengine/core/render/spriteClipPreview.view`
- `@jgengine/react/tileLayerPreview` → `@jgengine/core/render/tileLayerPreview.view`
- `@jgengine/shell/city/CityRenderer` → `@jgengine/core/city/CityRenderer.draw`
- `@jgengine/shell/city/cityJunctionSurface` → `@jgengine/core/city/cityJunctionSurface`
- `@jgengine/shell/city/cityWindowMaterial` → `@jgengine/core/city/cityWindowMaterial.draw`
- `@jgengine/shell/roads/RoadJunctions` → `@jgengine/core/roads/RoadJunctions.draw`
- `@jgengine/shell/roads/RoadRibbons` → `@jgengine/core/roads/RoadRibbons.draw`
- `@jgengine/shell/roads/surfaceRibbonMaterial` → `@jgengine/core/roads/surfaceRibbonMaterial.draw`
- `@jgengine/shell/scene/AuthoredScene` → `@jgengine/core/scene/AuthoredScene.draw`
- `@jgengine/shell/scene/DecalRenderer` → `@jgengine/core/scene/DecalRenderer.draw`
- `@jgengine/shell/scene/GeneratedAssetRenderer` → `@jgengine/core/scene/GeneratedAssetRenderer.draw`
- `@jgengine/shell/scene/PoleLineRenderer` → `@jgengine/core/scene/PoleLineRenderer.draw`
- `@jgengine/shell/scene/SoilPatchRenderer` → `@jgengine/core/scene/SoilPatchRenderer.draw`
- `@jgengine/shell/scene/StudioStage` → `@jgengine/core/scene/StudioStage.draw`
- `@jgengine/shell/scene/builtinSceneKindRenderers` → `@jgengine/core/scene/builtinSceneKindRenderers.draw`
- `@jgengine/shell/scene/sceneKindRenderers` → `@jgengine/core/scene/sceneKindRenderers.draw`
- The `@jgengine/shell/scene` barrel is gone: import `AuthoredScene` from `@jgengine/core/scene/AuthoredScene.draw`.
