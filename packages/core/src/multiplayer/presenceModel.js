export function decidePoseSync(current, incoming, rules, nowMs) {
    const elapsedSec = Math.max(rules.minElapsedSec, Math.min(rules.maxElapsedSec, (nowMs - (current.lastSeenAtMs ?? nowMs)) / 1000));
    const maxDist = rules.maxSpeed * elapsedSec;
    const maxDistSq = maxDist * maxDist;
    let targetX = incoming.position.x;
    let targetZ = incoming.position.z;
    const dx = targetX - current.position.x;
    const dz = targetZ - current.position.z;
    const magSq = dx * dx + dz * dz;
    if (magSq > maxDistSq) {
        const scale = Math.sqrt(maxDistSq / magSq);
        targetX = current.position.x + dx * scale;
        targetZ = current.position.z + dz * scale;
    }
    const nextY = incoming.position.y === undefined
        ? current.position.y
        : Math.max(0, Math.min(rules.maxVerticalOffset, incoming.position.y));
    const nextRotationY = incoming.rotationY ?? current.rotationY;
    const nextRotationPitch = incoming.rotationPitch ?? current.rotationPitch ?? 0;
    const moved = targetX !== current.position.x || targetZ !== current.position.z;
    const jumped = nextY !== current.position.y;
    const rotated = nextRotationY !== current.rotationY || nextRotationPitch !== (current.rotationPitch ?? 0);
    const changed = moved || jumped || rotated;
    return {
        position: { x: targetX, y: nextY, z: targetZ },
        rotationY: nextRotationY,
        rotationPitch: nextRotationPitch,
        changed,
        refreshKeepAlive: !changed && shouldRefreshKeepAlive(current.lastSeenAtMs, nowMs, rules),
    };
}
export function shouldRefreshKeepAlive(lastSeenAtMs, nowMs, rules) {
    return nowMs - (lastSeenAtMs ?? 0) >= rules.keepAliveRefreshMs;
}
export function shouldPersistWorldSnapshot(lastSavedAtMs, nowMs, intervalMs) {
    return lastSavedAtMs === undefined || nowMs - lastSavedAtMs >= intervalMs;
}
export function resolveActivePresence(rows) {
    const actives = rows.filter((row) => row.revokedAt === undefined);
    if (actives.length === 0)
        return { active: null, extras: [] };
    const sorted = [...actives].sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0));
    return { active: sorted[0] ?? null, extras: sorted.slice(1) };
}
export function isPresenceExpired(lastSeenAtMs, nowMs, idleCutoffMs) {
    return nowMs - lastSeenAtMs >= idleCutoffMs;
}
/** Most-recently-seen row across an actor's rows, to reuse instead of inserting a new one. */
export function pickReusablePresence(rows) {
    return [...rows].sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0))[0];
}
