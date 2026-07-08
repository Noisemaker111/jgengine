import type { InventoryDeclaration } from "@jgengine/core/game/defineGame";
import { ORES } from "./blocks";

const isResource = (itemId: string) => ORES.some((ore) => ore.resourceId === itemId);

/**
 * One shared trait table routes picked-up drops by kind: raw blocks/tools are
 * "build" and restack into the hotbar, refined ore resources are "resource" and
 * land in the pack. Kind-gating (not hotbar fullness) is what keeps ores out of
 * the build bar.
 */
const traits = {
  stackLimit: () => Number.POSITIVE_INFINITY,
  kind: (itemId: string) => (isResource(itemId) ? "resource" : "build"),
};

export const inventories: Record<string, InventoryDeclaration> = {
  hotbar: { slots: 7, hud: "hotbar", accepts: "build", traits },
  resources: { slots: 12, accepts: "resource" },
};
