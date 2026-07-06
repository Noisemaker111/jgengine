import type { InventoryDeclaration } from "@jgengine/core/game/defineGame";

export const inventories: Record<string, InventoryDeclaration> = {
  hotbar: { slots: 3, hud: "hotbar" },
  backpack: { slots: 12 },
};
