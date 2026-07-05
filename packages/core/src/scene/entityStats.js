function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
export function getPoolStat(map, statId) {
    return map[statId] ?? null;
}
export function setPoolStat(map, statId, patch) {
    const existing = map[statId];
    const max = patch.max ?? existing?.max ?? 0;
    const min = patch.min ?? existing?.min ?? 0;
    const current = clamp(patch.current ?? existing?.current ?? max, min, max);
    return { ...map, [statId]: { current, max, min } };
}
export function applyPoolDelta(map, statId, amount) {
    const existing = map[statId];
    if (existing === undefined) {
        return { status: "rejected", reason: `unknown stat "${statId}"` };
    }
    const current = clamp(existing.current + amount, existing.min, existing.max);
    const stat = { ...existing, current };
    return {
        status: "ok",
        map: { ...map, [statId]: stat },
        stat,
        hitMin: current === existing.min,
        hitMax: current === existing.max,
    };
}
export function seedPoolStats(catalogStats) {
    const map = {};
    for (const [statId, declaration] of Object.entries(catalogStats)) {
        const min = declaration.min ?? 0;
        const current = clamp(declaration.current ?? declaration.max, min, declaration.max);
        map[statId] = { current, max: declaration.max, min };
    }
    return map;
}
export function createEntityStatsApi(resolve) {
    return {
        get(instanceId, statId) {
            const map = resolve(instanceId);
            if (map === undefined)
                return null;
            return getPoolStat(map, statId);
        },
        set(instanceId, statId, patch) {
            const map = resolve(instanceId);
            if (map === undefined)
                return false;
            const next = setPoolStat(map, statId, patch);
            map[statId] = next[statId];
            return true;
        },
        delta(instanceId, statId, amount) {
            const map = resolve(instanceId);
            if (map === undefined)
                return { reason: `unknown instance "${instanceId}"` };
            const result = applyPoolDelta(map, statId, amount);
            if (result.status === "rejected")
                return { reason: result.reason };
            map[statId] = result.stat;
            return null;
        },
    };
}
