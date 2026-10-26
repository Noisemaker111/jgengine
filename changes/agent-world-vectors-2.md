### Migrate

- Camera and vector types have one definition each:
  - `Vec3` from `@jgengine/core/vfx/particles` or `@jgengine/core/visibility/bounds`, and `Vec2` from `@jgengine/core/world/cityGeometry` → `@jgengine/core/world/geometry`.
  - The `{ x, y, z }` `Vec3` of `@jgengine/shell/camera/orbitCameraMath` and `@jgengine/editor/camera/orbitFraming` → `Xyz` from `@jgengine/core/math/xyz`.
  - Camera config moved: `@jgengine/core/game/cameraConfig` → `@jgengine/core/camera/cameraConfig`. `CameraFollowState` is defined only there; `orbitCameraMath` no longer exports it or `distanceBetween`.
  - `@jgengine/shell/camera/rigMath` no longer exports `clamp`, `lerp` or `smoothstep`; use `@jgengine/core/math/scalar` and `@jgengine/core/anim/easing`.
  - `nowMs` is no longer exported from `@jgengine/core/visibility/diagnostics`; use `@jgengine/core/devtools/frame`.
