export function distanceBetween(a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function forwardXZ(aim) {
    if ("origin" in aim) {
        const [x, , z] = aim.direction;
        const length = Math.sqrt(x * x + z * z);
        if (length === 0)
            return null;
        return [x / length, z / length];
    }
    return [Math.sin(aim.yaw), Math.cos(aim.yaw)];
}
export function createSpatialApi(options) {
    const { resolvePosition, candidates, occluder } = options;
    function resolveTarget(target) {
        return typeof target === "string" ? resolvePosition(target) : target;
    }
    return {
        distance(aInstanceId, bInstanceId) {
            const a = resolvePosition(aInstanceId);
            const b = resolvePosition(bInstanceId);
            if (a === undefined || b === undefined)
                return null;
            return distanceBetween(a, b);
        },
        inRadius(center, radius, filter) {
            const centerId = typeof center === "string" ? center : null;
            const centerPosition = resolveTarget(center);
            if (centerPosition === undefined)
                return [];
            return candidates().filter((instanceId) => {
                if (instanceId === centerId)
                    return false;
                if (filter !== undefined && !filter(instanceId))
                    return false;
                const position = resolvePosition(instanceId);
                return position !== undefined && distanceBetween(centerPosition, position) <= radius;
            });
        },
        hasLineOfSight(fromInstanceId, toInstanceId) {
            const from = resolvePosition(fromInstanceId);
            const to = resolvePosition(toInstanceId);
            if (from === undefined || to === undefined)
                return false;
            if (occluder === undefined)
                return true;
            return !occluder(from, to);
        },
        queryArc({ from, aim, radius, halfAngleDeg = 60 }) {
            const origin = "origin" in aim ? aim.origin : resolvePosition(from);
            if (origin === undefined)
                return [];
            const forward = forwardXZ(aim);
            if (forward === null)
                return [];
            const minDot = Math.cos((halfAngleDeg * Math.PI) / 180);
            return candidates().filter((instanceId) => {
                if (instanceId === from)
                    return false;
                const position = resolvePosition(instanceId);
                if (position === undefined)
                    return false;
                const dx = position[0] - origin[0];
                const dz = position[2] - origin[2];
                const planarDistance = Math.sqrt(dx * dx + dz * dz);
                if (planarDistance > radius)
                    return false;
                if (planarDistance === 0)
                    return true;
                const dot = (forward[0] * dx + forward[1] * dz) / planarDistance;
                return dot >= minDot;
            });
        },
        moveToward(instanceId, target, { speed, stopDistance = 0, dt }) {
            const current = resolvePosition(instanceId);
            const destination = resolveTarget(target);
            if (current === undefined || destination === undefined)
                return null;
            const total = distanceBetween(current, destination);
            const remaining = total - stopDistance;
            if (remaining <= 0)
                return current;
            const step = Math.min(speed * dt, remaining);
            const scale = step / total;
            return [
                current[0] + (destination[0] - current[0]) * scale,
                current[1] + (destination[1] - current[1]) * scale,
                current[2] + (destination[2] - current[2]) * scale,
            ];
        },
    };
}
