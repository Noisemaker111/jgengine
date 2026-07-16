import { seededRng } from "@jgengine/core/random/rng";
import { itemDefById } from "../items/catalog";
const QUALITY_ORDER = ["poor", "common", "uncommon", "rare", "epic"];
/** Generic material yield by rarity — everyone-can-salvage, no profession gate. Reuses the
 * existing harvested-material item ids rather than introducing new ones. */
export const SALVAGE_MATERIAL_BY_QUALITY = {
    poor: "bone_fragments",
    common: "bone_fragments",
    uncommon: "linen_scrap",
    rare: "spider_leg",
    epic: "spider_leg",
};
export function isSalvageable(def) {
    return def !== null && (def.kind === "weapon" || def.kind === "armor") && def.quality !== "poor";
}
/** Material yield for one salvage: scales with rarity and level tier, plus one rng-rolled
 * bonus unit, so identical salvages of the same item are not perfectly deterministic. */
export function salvageYield(def, roll) {
    const qualityIdx = Math.max(0, QUALITY_ORDER.indexOf(def.quality));
    const tierBonus = Math.floor((def.levelReq ?? 1) / 10);
    const bonus = roll() < 0.5 ? 0 : 1;
    return qualityIdx + tierBonus + 1 + bonus;
}
const salvageRoll = seededRng("claudecraft-salvage");
/** Break an eligible bagged weapon/armor piece back into raw materials. Denies (no side effect)
 * on an unknown/ineligible item or if the player doesn't hold a copy. */
export function salvageItem(ctx, userId, itemId) {
    const def = itemDefById(itemId);
    if (def === null)
        return { ok: false, reason: "unknown-item" };
    if (!isSalvageable(def))
        return { ok: false, reason: "not-salvageable" };
    if (ctx.player.inventory.count("bags", itemId) < 1)
        return { ok: false, reason: "not-held" };
    ctx.player.inventory.take("bags", itemId, 1);
    const materialItemId = SALVAGE_MATERIAL_BY_QUALITY[def.quality];
    const count = salvageYield(def, salvageRoll);
    ctx.player.inventory.put("bags", materialItemId, count);
    ctx.scene.entity.floatText({
        instanceId: userId,
        text: `Salvaged ${count} ${materialItemId.replaceAll("_", " ")}`,
        kind: "info",
    });
    return { ok: true, materialItemId, count };
}
