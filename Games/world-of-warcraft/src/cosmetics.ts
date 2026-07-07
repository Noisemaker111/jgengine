import type { CosmeticLoadoutDef } from "@jgengine/core/game/cosmetics";

export const cosmeticLoadouts: Record<string, CosmeticLoadoutDef> = {
  heroDefault: { slots: { skin: "bronze_plate", back: "none", aura: "none" } },
  heroFestive: { slots: { skin: "bronze_plate", back: "cape_scarlet", aura: "sparkle_trail" } },
};
