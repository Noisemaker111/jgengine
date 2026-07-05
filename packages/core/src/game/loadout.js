export function createLoadouts(deps) {
    const definitions = new Map();
    return {
        register(defs) {
            for (const [loadoutId, def] of Object.entries(defs))
                definitions.set(loadoutId, def);
        },
        has(loadoutId) {
            return definitions.has(loadoutId);
        },
        applyLoadout(userId, loadoutId) {
            const def = definitions.get(loadoutId);
            if (def === undefined)
                return { reason: `unknown loadout "${loadoutId}"` };
            const transaction = deps.inventory.begin(userId);
            for (const [inventoryId, entries] of Object.entries(def.inventories ?? {})) {
                for (const entry of entries) {
                    const rejection = transaction.put(inventoryId, entry.item, entry.count, entry.slot);
                    if (rejection !== null)
                        return { reason: `${inventoryId}: ${rejection.reason}` };
                }
            }
            transaction.commit();
            for (const [statId, pool] of Object.entries(def.stats ?? {})) {
                deps.stats.seed(userId, statId, pool);
            }
            for (const [currencyId, amount] of Object.entries(def.economy ?? {})) {
                deps.economy.grant(userId, currencyId, amount);
            }
            for (const unlockId of def.unlocks ?? []) {
                deps.unlocks.grant(userId, unlockId);
            }
            return null;
        },
    };
}
