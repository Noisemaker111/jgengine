The camera lives in one `@jgengine/core/camera` folder: rig math and config beside the three.js rigs (orbit, first person, inspection, top-down, RTS, shoulder, chase, cinematic), camera shake, collision and the player FOV preference. `@jgengine/shell/camera` is gone.

### Migrate
- `@jgengine/shell/camera` → import each name from its file: `cameraShake`/`defaultCameraShake` from `@jgengine/core/camera/shake/cameraShake`, rigs from `@jgengine/core/camera/<Rig>.draw`, math from `@jgengine/core/camera/<file>`
- `CameraBlendScratch` and the blend helpers come only from `@jgengine/core/camera/cameraBlendMath.draw` (no longer re-exported by `cameraRigs.draw`)
- `fovPreference` is now `@jgengine/core/camera/fovPreference.view` (it reads `Storage`)
- `@jgengine/shell/camera/GameCameraRig` → `@jgengine/core/camera/GameCameraRig.draw`
- `@jgengine/shell/camera/GameFirstPersonCamera` → `@jgengine/core/camera/GameFirstPersonCamera.draw`
- `@jgengine/shell/camera/GameInspectionCamera` → `@jgengine/core/camera/GameInspectionCamera.draw`
- `@jgengine/shell/camera/GameOrbitCamera` → `@jgengine/core/camera/GameOrbitCamera.draw`
- `@jgengine/shell/camera/PlayerFov` → `@jgengine/core/camera/PlayerFov.draw`
- `@jgengine/shell/camera/Viewports` → `@jgengine/core/camera/Viewports.draw`
- `@jgengine/shell/camera/aimRecoil` → `@jgengine/core/camera/aimRecoil`
- `@jgengine/shell/camera/cameraBlendMath` → `@jgengine/core/camera/cameraBlendMath.draw`
- `@jgengine/shell/camera/cameraCollision` → `@jgengine/core/camera/cameraCollision`
- `@jgengine/shell/camera/cameraRigs` → `@jgengine/core/camera/cameraRigs.draw`
- `@jgengine/shell/camera/chaseHeading` → `@jgengine/core/camera/chaseHeading`
- `@jgengine/shell/camera/customMuzzle` → `@jgengine/core/camera/customMuzzle.draw`
- `@jgengine/shell/camera/fovPreference` → `@jgengine/core/camera/fovPreference.view`
- `@jgengine/shell/camera/inspectionCameraMath` → `@jgengine/core/camera/inspectionCameraMath`
- `@jgengine/shell/camera/orbitCameraMath` → `@jgengine/core/camera/orbitCameraMath`
- `@jgengine/shell/camera/rigMath` → `@jgengine/core/camera/rigMath`
- `@jgengine/shell/camera/rigResolve` → `@jgengine/core/camera/rigResolve`
