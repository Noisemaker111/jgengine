export interface PlayerPose {
    x: number;
    y: number;
    z: number;
    rotationY: number;
    rotationPitch: number;
}
export interface PoseSyncTuning {
    minIntervalMs: number;
    heartbeatMs: number;
    positionEpsilon: number;
    verticalEpsilon: number;
    rotationEpsilon: number;
}
export interface PoseSyncGate {
    evaluate(pose: PlayerPose, nowMs: number): boolean;
}
export declare function createPoseSyncGate(tuning: PoseSyncTuning): PoseSyncGate;
