### Added

- `installCaptureCamera`/`readCaptureCamera`/`clearCaptureCamera` and `CaptureCameraOverride` (`@jgengine/core/world/captureCamera`) are the harness counterpart of `?look=`, and the same install-style seam as `world/spawnOverride`: the runner installs a rig, the shell reads it. `resolveCaptureCameraConfig` (`@jgengine/shell/camera/rigResolve`) reads it above a game's static `camera` block, its runtime `ctx.camera.setRig` selection and its director cinematics, so a game that drives its own camera can no longer photograph that camera instead of a requested `--look` framing. With nothing installed the resolution is exactly `resolveRuntimeCameraConfig`, so every game renders as before.

### Changed

- The dev runner installs the resolved `?look=`/`--cam=` rig as the capture camera, and the shell's camera rig and presentation both resolve through `resolveCaptureCameraConfig`.
- `metricsPathFor` (`scripts/shot-metrics`) is the `--inspect` metrics path for a shot. `--out` without an image extension used to swap nothing, so the metrics JSON was written straight over the screenshot; the metrics path now always differs from the shot path.
