import type { InventoryDeclaration } from "@jgengine/core/game/defineGame";

const traits = {
  stackLimit: (itemId: string) => stackLimits.get(itemId) ?? 1,
};

const stackLimits = new Map<string, number>();

export function registerStackLimit(itemId: string, stack: number): void {
  stackLimits.set(itemId, stack);
}

export const inventories: Record<string, InventoryDeclaration> = {
  bags: { slots: 24, traits },
};
