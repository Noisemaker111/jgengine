export type MovementPose = "standing" | "crouch" | "prone" | "running";
export type AimMode = "hip" | "ads";
export interface PoseHitbox {
    height: number;
    eyeHeight: number;
    speedMultiplier: number;
}
export declare const POSE_HITBOX: Record<MovementPose, PoseHitbox>;
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
export declare function createPoseState(resolveAllowed: (instanceId: string) => PoseAllowedStates | null | undefined): PoseState;
