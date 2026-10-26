### Migrate

- Level of detail lives in one folder per layer. Update deep imports:
  - `@jgengine/core/world/{lod,modelLod}` → `@jgengine/core/lod/…`.
  - `@jgengine/shell/render/{levelPass,singleVariantLod,characterLod,impostor,impostorCardPool}` → `@jgengine/shell/lod/…`.
- `ModelShadowMode` has one definition, in `@jgengine/core/lod/modelLod`; `@jgengine/shell/render/modelRender` no longer exports its copy.
- Removed `@jgengine/core/runtime/visibility` (`VisibilitySystem` class, `CameraVisibilityContext` and friends), which nothing used. Culling is `createVisibilitySystem` in `@jgengine/core/visibility/visibilitySystem`.
