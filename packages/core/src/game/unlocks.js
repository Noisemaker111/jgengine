export function createUnlocks(defs = []) {
    const definitions = new Map();
    for (const def of defs)
        definitions.set(def.id, def);
    const granted = new Map();
    function requireGrantedSet(userId) {
        let set = granted.get(userId);
        if (!set) {
            set = new Set();
            granted.set(userId, set);
        }
        return set;
    }
    return {
        has(userId, unlockId) {
            return granted.get(userId)?.has(unlockId) ?? false;
        },
        grant(userId, unlockId) {
            requireGrantedSet(userId).add(unlockId);
        },
        list(userId) {
            return Array.from(granted.get(userId) ?? []);
        },
        tree(categoryId) {
            return Array.from(definitions.values()).filter((def) => def.category === categoryId);
        },
        snapshot(userId) {
            return Array.from(granted.get(userId) ?? []);
        },
        hydrate(userId, ids) {
            granted.set(userId, new Set(ids));
        },
    };
}
