import { MOVEMENT_TUNING } from "./movementModel";

export type MovementPose = "standing" | "crouch" | "prone" | "running";

export type AimMode = "hip" | "ads";

export interface PoseHitbox {
  height: number;
  eyeHeight: number;
  speedMultiplier: number;
}

const STANDING_HEIGHT = 1.8;
const CROUCH_HEIGHT = STANDING_HEIGHT * (MOVEMENT_TUNING.crouchEyeHeight / MOVEMENT_TUNING.standEyeHeight);

export const POSE_HITBOX: Record<MovementPose, PoseHitbox> = {
  standing: {
    height: STANDING_HEIGHT,
    eyeHeight: MOVEMENT_TUNING.standEyeHeight,
    speedMultiplier: 1,
  },
  crouch: {
    height: CROUCH_HEIGHT,
    eyeHeight: MOVEMENT_TUNING.crouchEyeHeight,
    speedMultiplier: MOVEMENT_TUNING.crouchSpeedMultiplier,
  },
  prone: {
    height: CROUCH_HEIGHT * 0.5,
    eyeHeight: MOVEMENT_TUNING.crouchEyeHeight * 0.4,
    speedMultiplier: MOVEMENT_TUNING.crouchSpeedMultiplier * 0.5,
  },
  running: {
    height: STANDING_HEIGHT,
    eyeHeight: MOVEMENT_TUNING.standEyeHeight,
    speedMultiplier: MOVEMENT_TUNING.runSpeedMultiplier,
  },
};

export interface PoseAllowedStates {
  poses?: readonly MovementPose[];
  aim?: readonly AimMode[];
}

export interface PoseRejection {
  reason: string;
}

export interface PoseState {
  getPose(instanceId: string): MovementPose;
  setPose(instanceId: string, pose: MovementPose): PoseRejection | null;
  getAim(instanceId: string): AimMode;
  setAim(instanceId: string, mode: AimMode): PoseRejection | null;
  clear(instanceId: string): void;
}

export function createPoseState(
  resolveAllowed: (instanceId: string) => PoseAllowedStates | null | undefined,
): PoseState {
  const poses = new Map<string, MovementPose>();
  const aims = new Map<string, AimMode>();

  function allowedPoses(instanceId: string): readonly MovementPose[] {
    return resolveAllowed(instanceId)?.poses ?? ["standing"];
  }

  function allowedAims(instanceId: string): readonly AimMode[] {
    return resolveAllowed(instanceId)?.aim ?? ["hip"];
  }

  return {
    getPose(instanceId) {
      return poses.get(instanceId) ?? "standing";
    },
    setPose(instanceId, pose) {
      if (!allowedPoses(instanceId).includes(pose)) {
        return { reason: `Entity "${instanceId}" does not allow pose "${pose}".` };
      }
      poses.set(instanceId, pose);
      return null;
    },
    getAim(instanceId) {
      return aims.get(instanceId) ?? "hip";
    },
    setAim(instanceId, mode) {
      if (!allowedAims(instanceId).includes(mode)) {
        return { reason: `Entity "${instanceId}" does not allow aim mode "${mode}".` };
      }
      aims.set(instanceId, mode);
      return null;
    },
    clear(instanceId) {
      poses.delete(instanceId);
      aims.delete(instanceId);
    },
  };
}
