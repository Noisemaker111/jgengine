### Migrate

- Vector and point types have one definition each, in `@jgengine/core/world/geometry`:
  - `Vec2` / `Vec3` tuples: import them from `@jgengine/core/world/geometry` instead of `movement/formation`, `world/cityGeometry`, `vfx/particles`, `anim/ikSolver`, `world/buildings` or `visibility/bounds`.
  - New `Point3` (`{ x, y, z }`) replaces the object-style `Vec3` in `shell/camera/orbitCameraMath`, `shell/audio/audioEngine`, `editor/camera/orbitFraming` and `core/multiplayer/lagCompensation` (no longer re-exported from `@jgengine/core/multiplayer`), and `ScenePoint3` in `core/world/sceneShapes`.
  - `Point3` from `@jgengine/core/world/spatialSample` is now `Vec3`.
- Removed `@jgengine/core/world/vec2` and `@jgengine/core/world/vec3`. For 3D distance use `distanceBetween` from `@jgengine/core/scene/spatial`.
- Camera config moved: `@jgengine/core/game/cameraConfig` → `@jgengine/core/camera/cameraConfig`. `CameraFollowState` is defined only there; `@jgengine/shell/camera/orbitCameraMath` no longer exports it or `distanceBetween`.
- `@jgengine/shell/camera/rigMath` no longer exports `clamp`, `lerp` or `smoothstep`; use `@jgengine/core/math/scalar` and `@jgengine/core/anim/easing`.
