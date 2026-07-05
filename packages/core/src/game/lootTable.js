function assertValidEntry(entry) {
    const hasItem = entry.item !== undefined;
    const hasCurrency = entry.currency !== undefined;
    if (hasItem === hasCurrency) {
        throw new Error("loot entry must have exactly one of item or currency");
    }
    if (!(entry.weight > 0)) {
        throw new Error(`loot entry weight must be positive, got ${entry.weight}`);
    }
}
function assertValidDef(def) {
    if (def.entries.length === 0) {
        throw new Error(`loot table "${def.id}" must have at least one entry`);
    }
    for (const entry of def.entries)
        assertValidEntry(entry);
}
function resolveCount(count, rng) {
    if (typeof count === "number")
        return count;
    const [min, max] = count;
    return min + Math.floor(rng() * (max - min + 1));
}
function pickEntry(entries, rng) {
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = rng() * total;
    for (const entry of entries) {
        roll -= entry.weight;
        if (roll < 0)
            return entry;
    }
    return entries[entries.length - 1];
}
function rollEntry(entry, rng) {
    const count = resolveCount(entry.count, rng);
    return entry.item !== undefined ? { item: entry.item, count } : { currency: entry.currency, count };
}
export function createLootRegistry() {
    const tables = new Map();
    return {
        register(def) {
            assertValidDef(def);
            if (tables.has(def.id)) {
                throw new Error(`loot table "${def.id}" is already registered`);
            }
            tables.set(def.id, def);
        },
        has(id) {
            return tables.has(id);
        },
        roll(id, rng = Math.random) {
            const table = tables.get(id);
            if (!table) {
                throw new Error(`unknown loot table: ${id}`);
            }
            const rolls = table.rolls ?? 1;
            const drops = [];
            for (let i = 0; i < rolls; i++) {
                drops.push(rollEntry(pickEntry(table.entries, rng), rng));
            }
            return drops;
        },
    };
}
export function lootTable(def) {
    assertValidDef(def);
    return def;
}
export function grantDrops(drops, appliers) {
    for (const drop of drops) {
        if (drop.item !== undefined) {
            appliers.putItem(drop.item, drop.count);
        }
        else if (drop.currency !== undefined) {
            appliers.grantCurrency(drop.currency, drop.count);
        }
    }
}
