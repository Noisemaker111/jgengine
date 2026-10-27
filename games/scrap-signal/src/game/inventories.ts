import type { InventoryDeclaration } from "@jgengine/core/game/defineGame";

export const inventories: Record<string, InventoryDeclaration> = {
  hotbar: { slots: 4, hud: "hotbar" },
  backpack: { slots: 16 },
  // The Coretown vault: guns kept safe while you carry others. Banked, so it survives anything.
  vault: { slots: 16, tier: "banked" },
};
