import type { CameraRigKind } from "../game/playableGame";
import type { CameraRigConfig } from "../runtime/cameraDirector";

/**
 * Per-session capture-camera override — the harness counterpart of `?cam=`/`?look=`, and the same
 * install-style seam as `world/spawnOverride`: the runner installs one, the shell reads it, nothing
 * changes until one is installed.
 *
 * It exists because a game that owns its camera wins by other routes: a static `camera` config
 * swapped by the harness only reaches the rig until the game selects its own rig at runtime
 * (`ctx.camera.setRig`, a persisted settings camera, a director cinematic), and the capture then
 * silently photographs the game's camera. This override is read above every one of those, so a
 * framed capture stays framed; a game's own camera is untouched the moment the page loads without
 * the param.
 */
export interface CaptureCameraOverride {
  kind: CameraRigKind;
  config: CameraRigConfig;
}

let installed: CaptureCameraOverride | null = null;

/**
 * Install (or, with `null`, clear) the capture camera. Idempotent; last write wins. It outranks the
 * game's static camera config and any runtime `ctx.camera` rig selection, and it is never saved —
 * it is a property of this capture session, not of the game.
 *
 * @capability capture force a framed capture camera over a game that owns its camera
 */
export function installCaptureCamera(override: CaptureCameraOverride | null): void {
  installed = override;
}

/** Clear any installed capture camera. */
export function clearCaptureCamera(): void {
  installed = null;
}

/** The installed capture camera, or `null` when the game's own camera should render. */
export function readCaptureCamera(): CaptureCameraOverride | null {
  return installed;
}
