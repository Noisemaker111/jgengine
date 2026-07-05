import { MOVEMENT_TUNING } from "./movementModel";
const STANDING_HEIGHT = 1.8;
const CROUCH_HEIGHT = STANDING_HEIGHT * (MOVEMENT_TUNING.crouchEyeHeight / MOVEMENT_TUNING.standEyeHeight);
export const POSE_HITBOX = {
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
export function createPoseState(resolveAllowed) {
    const poses = new Map();
    const aims = new Map();
    function allowedPoses(instanceId) {
        return resolveAllowed(instanceId)?.poses ?? ["standing"];
    }
    function allowedAims(instanceId) {
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
