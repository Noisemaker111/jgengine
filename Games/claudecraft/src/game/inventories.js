const traits = {
    stackLimit: (itemId) => stackLimits.get(itemId) ?? 1,
};
const stackLimits = new Map();
export function registerStackLimit(itemId, stack) {
    stackLimits.set(itemId, stack);
}
export const inventories = {
    bags: { slots: 24, traits },
    bank: { slots: 28, traits },
};
