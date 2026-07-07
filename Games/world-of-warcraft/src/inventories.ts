import type { InventoryDeclaration } from "@jgengine/core/game/defineGame";

export const inventories: Record<string, InventoryDeclaration> = {
  hotbar: { slots: 9, hud: "hotbar" },
  backpack: { slots: 28 },
  equipment: { slots: 4, accepts: ["weapon", "armor"] },
};
