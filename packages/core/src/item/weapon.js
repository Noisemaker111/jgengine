export function getWeaponStat(entry, stat) {
    if (!entry?.weapon)
        return null;
    let value = entry.weapon;
    for (const key of stat.split(".")) {
        if (typeof value !== "object" || value === null)
            return null;
        value = value[key];
    }
    return typeof value === "number" ? value : null;
}
export function createWeaponStats(resolveEntry) {
    return {
        getStat(itemId, stat) {
            return getWeaponStat(resolveEntry(itemId), stat);
        },
    };
}
