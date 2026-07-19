import { defineGame, type GameCameraConfig } from "@jgengine/shell/gameKit";

// The joint: the camera is game DATA, not chrome. Hand `defineGame` a camera config
// and the shell mounts the matching rig — "orbit" is the third-person chase camera
// that follows the player. Tune boom distance/height here; no camera component to wire.
const camera: GameCameraConfig = {
  rig: "orbit",
  minDistance: 3,
  maxDistance: 9,
  targetHeight: 1.6,
};

export const game = defineGame({ name: "Explore", camera });
// <GameHost playable={game} />  — the orbit rig chases the player entity automatically
