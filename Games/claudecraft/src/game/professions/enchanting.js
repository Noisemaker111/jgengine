import { seededRng } from "@jgengine/core/random/rng";
import { DISENCHANT_MATERIAL_BY_QUALITY, disenchantYield, enchantById, ENCHANTS, enchantsForSlot, isDisenchantable, } from "../items/enchanting";
import { itemDefById } from "../items/catalog";
import { applySheet, enchantsOf, equipsOf, storeKeys } from "../session/hero";
export { ENCHANTS, enchantsForSlot };
const disenchantRoll = seededRng("claudecraft-disenchant");
/** Consume one bagged copy of an eligible weapon/armor piece into arcane materials, scaled by
 * the item's rarity and level tier (plus one rng-rolled bonus unit). */
export function disenchantItem(ctx, userId, itemId) {
    const def = itemDefById(itemId);
    if (def === null)
        return { ok: false, reason: "unknown-item" };
    if (!isDisenchantable(def))
        return { ok: false, reason: "not-disenchantable" };
    if (ctx.player.inventory.count("bags", itemId) < 1)
        return { ok: false, reason: "not-held" };
    ctx.player.inventory.take("bags", itemId, 1);
    const materialItemId = DISENCHANT_MATERIAL_BY_QUALITY[def.quality];
    const count = disenchantYield(def, disenchantRoll);
    ctx.player.inventory.put("bags", materialItemId, count);
    ctx.scene.entity.floatText({
        instanceId: userId,
        text: `Disenchanted into ${count} ${materialItemId.replaceAll("_", " ")}`,
        kind: "info",
    });
    return { ok: true, materialItemId, count };
}
/** Apply a permanent stat enchant to whatever is currently equipped in its target slot,
 * consuming its arcane reagents. The enchant sticks to the slot (this engine's items are
 * fungible by id, not per-copy instances), so re-equipping different gear in that slot keeps
 * the enchant active as long as something is equipped there. */
export function applyEnchant(ctx, userId, slot, enchantId) {
    const enchant = enchantById(enchantId);
    if (enchant === null)
        return { ok: false, reason: "unknown-enchant" };
    if (enchant.itemSlot !== slot)
        return { ok: false, reason: "wrong-slot" };
    const equipped = equipsOf(ctx, userId)[slot];
    if (equipped === undefined)
        return { ok: false, reason: "nothing-equipped" };
    for (const reagent of enchant.reagents) {
        if (ctx.player.inventory.count("bags", reagent.itemId) < reagent.count) {
            return { ok: false, reason: "insufficient-materials" };
        }
    }
    for (const reagent of enchant.reagents)
        ctx.player.inventory.take("bags", reagent.itemId, reagent.count);
    const enchants = { ...enchantsOf(ctx, userId), [slot]: enchantId };
    ctx.game.store.set(storeKeys.enchants(userId), enchants);
    applySheet(ctx, userId);
    ctx.scene.entity.floatText({ instanceId: userId, text: `${enchant.name} applied!`, kind: "info" });
    return { ok: true };
}
