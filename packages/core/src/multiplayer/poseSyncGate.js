function poseChanged(a, b, tuning) {
    return (Math.abs(a.x - b.x) > tuning.positionEpsilon
        || Math.abs(a.y - b.y) > tuning.verticalEpsilon
        || Math.abs(a.z - b.z) > tuning.positionEpsilon
        || Math.abs(a.rotationY - b.rotationY) > tuning.rotationEpsilon
        || Math.abs(a.rotationPitch - b.rotationPitch) > tuning.rotationEpsilon);
}
export function createPoseSyncGate(tuning) {
    let lastSentPose = null;
    let lastSentAt = 0;
    return {
        evaluate(pose, nowMs) {
            if (lastSentPose === null) {
                lastSentPose = pose;
                lastSentAt = nowMs;
                return true;
            }
            const changed = poseChanged(lastSentPose, pose, tuning);
            const intervalElapsed = nowMs - lastSentAt >= tuning.minIntervalMs;
            const heartbeatDue = nowMs - lastSentAt >= tuning.heartbeatMs;
            if (!changed && !heartbeatDue)
                return false;
            if (!intervalElapsed && !heartbeatDue)
                return false;
            lastSentPose = pose;
            lastSentAt = nowMs;
            return true;
        },
    };
}
