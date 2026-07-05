export function createStats(base) {
    const baseValues = { ...base };
    const sourceEntries = new Map();
    function isExpired(entry, nowMs) {
        return nowMs !== undefined && entry.expiresAtMs !== undefined && entry.expiresAtMs <= nowMs;
    }
    function resolve(stat, nowMs) {
        let total = baseValues[stat];
        let multiplier = 1;
        for (const entry of sourceEntries.values()) {
            if (isExpired(entry, nowMs))
                continue;
            const modifier = entry.modifiers[stat];
            if (!modifier)
                continue;
            if (modifier.add !== undefined)
                total += modifier.add;
            if (modifier.multiply !== undefined)
                multiplier *= modifier.multiply;
        }
        return total * multiplier;
    }
    return {
        setBase(stat, value) {
            baseValues[stat] = value;
        },
        getBase(stat) {
            return baseValues[stat];
        },
        addSource(sourceId, modifiers, options) {
            sourceEntries.set(sourceId, { modifiers, expiresAtMs: options?.expiresAtMs });
        },
        removeSource(sourceId) {
            sourceEntries.delete(sourceId);
        },
        hasSource(sourceId) {
            return sourceEntries.has(sourceId);
        },
        get(stat, nowMs) {
            return resolve(stat, nowMs);
        },
        pruneExpired(nowMs) {
            const pruned = [];
            for (const [sourceId, entry] of sourceEntries) {
                if (isExpired(entry, nowMs)) {
                    sourceEntries.delete(sourceId);
                    pruned.push(sourceId);
                }
            }
            return pruned;
        },
        sources() {
            return Array.from(sourceEntries.keys());
        },
    };
}
