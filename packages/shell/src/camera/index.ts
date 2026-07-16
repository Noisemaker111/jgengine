/** Public camera surface for games. Pure rig math lives in sibling modules (package-internal). */
export { GameOrbitCamera, type CameraFollowListener, type GameOrbitCameraProps } from "./GameOrbitCamera";
export {
  GameFirstPersonCamera,
  readFirstPersonMuzzle,
  type GameFirstPersonCameraProps,
  type ViewmodelProps,
} from "./GameFirstPersonCamera";
export { GameInspectionCamera, type GameInspectionCameraProps } from "./GameInspectionCamera";
export { GameCameraRig, resolveRigKind, type GameCameraRigProps } from "./GameCameraRig";
export {
  PlayerFovProvider,
  PlayerFovSlider,
  usePlayerFov,
  type PlayerFovState,
} from "./PlayerFov";
export {
  CameraShakeContext,
  cameraShake,
  createCameraShakeChannel,
  defaultCameraShakeChannel,
  useCameraShake,
  type CameraShakeChannel,
} from "./shakeChannel";
export { rtsPanKeysConflict } from "./rigMath";
export { GAME_SIM_FRAME_PRIORITY } from "./orbitCameraMath";
