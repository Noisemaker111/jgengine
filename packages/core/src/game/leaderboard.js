function resolveStatId(def) {
    const stat = def.stat ?? def.currency;
    if (stat === undefined) {
        throw new Error("leaderboard track requires stat or currency");
    }
    return stat;
}
function trackKey(stat, scope) {
    return `${scope}:${stat}`;
}
function rowKey(stat, scope, serverId, userId) {
    return `${scope}:${stat}:${serverId ?? ""}:${userId}`;
}
export function createLeaderboard(sink) {
    const trackedPairs = new Map();
    const rows = new Map();
    return {
        track(def) {
            const stat = resolveStatId(def);
            trackedPairs.set(trackKey(stat, def.scope), { stat, scope: def.scope });
        },
        tracked() {
            return Array.from(trackedPairs.values());
        },
        increment(userId, stat, options) {
            if (!trackedPairs.has(trackKey(stat, options.scope))) {
                return { status: "rejected", reason: "not-tracked" };
            }
            const key = rowKey(stat, options.scope, options.serverId, userId);
            const value = (rows.get(key)?.value ?? 0) + (options.by ?? 1);
            const row = { stat, scope: options.scope, serverId: options.serverId, userId, value };
            rows.set(key, row);
            sink?.onIncrement?.(row);
            return { status: "ok", value };
        },
        getTop(stat, options) {
            return Array.from(rows.values())
                .filter((row) => row.stat === stat && row.scope === options.scope && row.serverId === options.serverId)
                .sort((a, b) => b.value - a.value)
                .slice(0, options.limit ?? 10)
                .map((row) => ({ userId: row.userId, value: row.value }));
        },
        getProfile(userId) {
            const profile = {};
            for (const row of rows.values()) {
                if (row.userId === userId && row.scope === "profile")
                    profile[row.stat] = row.value;
            }
            return profile;
        },
        snapshot() {
            return Array.from(rows.values());
        },
        hydrate(data) {
            rows.clear();
            for (const row of data)
                rows.set(rowKey(row.stat, row.scope, row.serverId, row.userId), row);
        },
    };
}
