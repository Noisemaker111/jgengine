import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useCurrency, useEntityStat, useGame, useGameStore, useInventory, usePlayer, useQuestJournal, } from "@jgengine/react/hooks";
import { useKeyedStore } from "@jgengine/react/store";
import { classById } from "../../classes/catalog";
import { NPCS } from "../../entities/npcs/catalog";
import { ITEMS, itemDefById } from "../../items/catalog";
import { enchantsForSlot } from "../../items/enchanting";
import { equippedSetStatus } from "../../items/sets";
import { PROFESSIONS } from "../../professions/catalog";
import { professionsOf } from "../../professions/gathering";
import { classStore, equipStore, shopStore } from "../../session/stores";
import { QUESTS } from "../../quests/catalog";
import { enchantsOf, heroSheet } from "../../session/hero";
import { CLOSE_BUTTON, PANEL, PANEL_TITLE, QUALITY_COLORS, copperLabel } from "../theme";
function isSalvageOrDisenchantable(itemId) {
    const item = itemDefById(itemId);
    return item !== null && (item.kind === "weapon" || item.kind === "armor") && item.quality !== "poor";
}
function Window({ title, onClose, children, wide, }) {
    return (_jsxs("div", { className: `${PANEL} pointer-events-auto ${wide === true ? "w-[440px]" : "w-96"} max-h-[70vh] overflow-hidden`, children: [_jsxs("div", { className: PANEL_TITLE, children: [_jsx("span", { children: title }), _jsx("button", { type: "button", className: CLOSE_BUTTON, onClick: onClose, children: "\u2715" })] }), _jsx("div", { className: "max-h-[58vh] overflow-y-auto px-4 py-3", children: children })] }));
}
function ItemRow({ itemId, count, action, actionLabel, price, extraActions, }) {
    const item = itemDefById(itemId);
    if (item === null)
        return null;
    return (_jsxs("div", { className: "flex items-center gap-2 rounded px-1.5 py-1 hover:bg-stone-800/60", children: [_jsx("span", { className: `flex h-8 w-8 shrink-0 items-center justify-center rounded border border-stone-700 bg-stone-900 ${QUALITY_COLORS[item.quality]}`, children: _jsx(GameIcon, { name: item.icon, size: 20 }) }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsxs("span", { className: `block truncate text-sm ${QUALITY_COLORS[item.quality]}`, children: [item.name, count !== undefined && count > 1 ? ` ×${count}` : ""] }), _jsxs("span", { className: "block text-[11px] text-stone-500", children: [item.kind === "weapon" && item.weapon !== undefined
                                ? `${item.weapon.min}–${item.weapon.max} dmg · ${item.weapon.speed}s`
                                : item.kind === "armor"
                                    ? `${item.armor ?? 0} armor${item.slot !== undefined ? ` · ${item.slot}` : ""}`
                                    : item.kind, price !== undefined ? ` · ${copperLabel(price)}` : ""] })] }), extraActions?.map((extra) => (_jsx("button", { type: "button", onClick: extra.onClick, className: "rounded border border-stone-700 bg-stone-900/70 px-2 py-0.5 text-xs text-stone-300 hover:bg-stone-800", children: extra.label }, extra.label))), action !== undefined && (_jsx("button", { type: "button", onClick: action, className: "rounded border border-amber-800 bg-amber-950/60 px-2 py-0.5 text-xs font-semibold text-amber-200 hover:bg-amber-900/60", children: actionLabel }))] }));
}
export function BagsPanel() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const slots = useInventory("bags");
    const copper = useCurrency("copper");
    const shopId = useKeyedStore(shopStore, userId);
    const close = () => commands.run("openBags", {});
    return (_jsx(Window, { title: _jsxs("span", { children: ["Backpack \u00B7 ", _jsx("span", { className: "text-amber-400", children: copperLabel(copper) })] }), onClose: close, children: slots.every((slot) => slot === null) ? (_jsx("p", { className: "py-6 text-center text-sm text-stone-500", children: "Your backpack is empty." })) : (_jsx("div", { className: "space-y-0.5", children: slots.map((slot, index) => slot === null ? null : (_jsx(ItemRow, { itemId: slot.itemId, count: slot.count, action: shopId !== null
                    ? () => commands.run("shop.sell", { itemId: slot.itemId })
                    : itemDefById(slot.itemId)?.kind === "consumable" || itemDefById(slot.itemId)?.slot !== undefined
                        ? () => commands.run("bags.use", { itemId: slot.itemId })
                        : undefined, actionLabel: shopId !== null
                    ? "Sell"
                    : itemDefById(slot.itemId)?.kind === "consumable"
                        ? "Use"
                        : "Equip", extraActions: shopId !== undefined || !isSalvageOrDisenchantable(slot.itemId)
                    ? undefined
                    : [
                        { label: "Salvage", onClick: () => commands.run("item.salvage", { itemId: slot.itemId }) },
                        { label: "Disenchant", onClick: () => commands.run("item.disenchant", { itemId: slot.itemId }) },
                    ] }, `${slot.itemId}-${index}`))) })) }));
}
export function CharacterPanel() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const classId = useKeyedStore(classStore, userId);
    const level = useEntityStat(userId, "level")?.current ?? 1;
    const sheet = useGameStore((ctx) => heroSheet(ctx, userId));
    const equips = useKeyedStore(equipStore, userId);
    const profs = useGameStore((ctx) => professionsOf(ctx, userId));
    if (classId === null || sheet === null)
        return null;
    const cls = classById(classId);
    return (_jsxs(Window, { title: `${cls.name} · Level ${level}`, onClose: () => commands.run("openCharacter", {}), children: [_jsx("div", { className: "grid grid-cols-2 gap-x-6 gap-y-1 text-sm", children: [
                    ["Strength", sheet.attributes.str],
                    ["Agility", sheet.attributes.agi],
                    ["Stamina", sheet.attributes.sta],
                    ["Intellect", sheet.attributes.int],
                    ["Spirit", sheet.attributes.spi],
                    ["Armor", Math.round(sheet.armor)],
                    ["Attack power", Math.round(sheet.attackPower)],
                    ["Spell power", Math.round(sheet.spellPower)],
                    ["Crit", `${sheet.critPct.toFixed(1)}%`],
                    ["Haste", `${(sheet.hastePct * 100).toFixed(1)}%`],
                ].map(([label, value]) => (_jsxs("div", { className: "flex justify-between border-b border-stone-800/60 py-0.5", children: [_jsx("span", { className: "text-stone-400", children: label }), _jsx("span", { className: "font-semibold text-amber-100", children: value })] }, label))) }), _jsx("h3", { className: "mt-4 mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80", children: "Professions" }), _jsx("div", { className: "grid grid-cols-3 gap-2 text-sm", children: PROFESSIONS.map((profession) => (_jsxs("div", { className: "flex items-center gap-1.5 rounded border border-stone-800 px-2 py-1", children: [_jsx(GameIcon, { name: profession.icon, size: 16, className: "text-amber-300" }), _jsx("span", { className: "capitalize text-stone-300", children: profession.name }), _jsxs("span", { className: "ml-auto font-semibold text-amber-100", children: [profs[profession.id], "/", profession.maxSkill] })] }, profession.id))) }), _jsx("h3", { className: "mt-4 mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80", children: "Equipped" }), Object.entries(equips).length === 0 ? (_jsx("p", { className: "text-sm text-stone-500", children: "Nothing equipped." })) : (_jsx("div", { className: "space-y-0.5", children: Object.entries(equips).map(([slot, itemId]) => itemId === undefined ? null : _jsx(ItemRow, { itemId: itemId }, slot)) })), _jsx(SetBonuses, { equips: equips }), _jsx(Enchants, { equips: equips })] }));
}
function Enchants({ equips }) {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const enchants = useGameStore((ctx) => enchantsOf(ctx, userId));
    const counts = useInventory("bags");
    const held = (itemId) => counts.reduce((sum, slot) => sum + (slot !== null && slot.itemId === itemId ? slot.count : 0), 0);
    const slots = Object.keys(equips).filter((slot) => equips[slot] !== undefined);
    const enchantable = slots.filter((slot) => enchantsForSlot(slot).length > 0);
    if (enchantable.length === 0)
        return null;
    return (_jsxs(_Fragment, { children: [_jsx("h3", { className: "mt-4 mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80", children: "Enchants" }), _jsx("div", { className: "space-y-2", children: enchantable.map((slot) => {
                    const activeId = enchants[slot];
                    return (_jsxs("div", { className: "rounded border border-stone-800 px-2 py-1.5", children: [_jsxs("p", { className: "mb-1 text-xs capitalize text-stone-400", children: [slot, activeId !== undefined && _jsx("span", { className: "ml-1 text-emerald-300", children: "\u2014 applied" })] }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: enchantsForSlot(slot).map((enchant) => {
                                    const affordable = enchant.reagents.every((reagent) => held(reagent.itemId) >= reagent.count);
                                    const active = activeId === enchant.id;
                                    return (_jsx("button", { type: "button", disabled: !affordable || active, onClick: () => commands.run("item.applyEnchant", { slot, enchantId: enchant.id }), title: enchant.reagents.map((r) => `${r.count} ${r.itemId.replaceAll("_", " ")}`).join(", "), className: `rounded border px-2 py-0.5 text-[11px] ${active
                                            ? "border-emerald-700 bg-emerald-950/50 text-emerald-300"
                                            : affordable
                                                ? "border-amber-800 bg-amber-950/60 text-amber-200 hover:bg-amber-900/60"
                                                : "border-stone-800 text-stone-600"}`, children: enchant.name.replace("Enchant Weapon: ", "").replace("Enchant ", "") }, enchant.id));
                                }) })] }, slot));
                }) })] }));
}
function SetBonuses({ equips }) {
    const sets = equippedSetStatus(equips);
    if (sets.length === 0)
        return null;
    return (_jsxs(_Fragment, { children: [_jsx("h3", { className: "mt-4 mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80", children: "Set Bonuses" }), _jsx("div", { className: "space-y-2", children: sets.map((set) => (_jsxs("div", { children: [_jsxs("p", { className: "text-sm font-semibold text-amber-200", children: [set.name, " ", _jsxs("span", { className: "text-stone-400", children: ["(", set.equipped, ")"] })] }), set.tiers.map((tier) => (_jsxs("p", { className: `text-xs ${tier.active ? "text-emerald-300" : "text-stone-500"}`, children: ["(", tier.pieces, ") ", tier.text] }, tier.pieces)))] }, set.setId))) })] }));
}
export function QuestLogPanel() {
    const { commands } = useGame();
    const journal = useQuestJournal();
    return (_jsx(Window, { title: "Quest Log", onClose: () => commands.run("openQuestLog", {}), wide: true, children: journal.length === 0 ? (_jsx("p", { className: "py-6 text-center text-sm text-stone-500", children: "No quests yet \u2014 speak with the marshals and wardens of the hubs." })) : (_jsx("div", { className: "space-y-3", children: journal.map((quest) => {
                const def = QUESTS.find((entry) => entry.id === quest.questId);
                return (_jsxs("div", { children: [_jsxs("p", { className: `font-semibold ${quest.status === "completed" ? "text-emerald-300" : "text-amber-200"}`, children: [def?.title ?? quest.questId, quest.status === "completed" ? " (complete)" : ""] }), def?.description !== undefined && _jsx("p", { className: "text-xs text-stone-400", children: def.description }), _jsx("ul", { className: "mt-1 space-y-0.5 text-sm", children: quest.objectives.map((objective) => (_jsxs("li", { className: objective.complete ? "text-emerald-400" : "text-stone-300", children: [objective.complete ? "✓" : "•", " ", objectiveLabel(quest.questId, objective.id), " ", objective.progress, "/", objective.count] }, objective.id))) })] }, quest.questId));
            }) })) }));
}
function objectiveLabel(questId, objectiveId) {
    const def = QUESTS.find((entry) => entry.id === questId);
    const objective = def?.objectives.find((entry) => entry.id === objectiveId);
    if (objective === undefined)
        return objectiveId;
    if (objective.kind === "kill")
        return `Slay ${objective.target?.replaceAll("_", " ") ?? "foes"}`;
    return `Collect ${objective.item?.replaceAll("_", " ") ?? "items"}`;
}
const PICK_LABEL = {
    hardSet: "Hard Set",
    set: "Set",
    steady: "Steady",
    ease: "Ease",
    drop: "Drop",
};
export function LockpickPanel() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const session = useGameStore((ctx) => ctx.game.store.get(`lockpick:${userId}`));
    if (session === undefined)
        return null;
    const close = () => commands.run("lockpick.close", {});
    return (_jsxs(Window, { title: `Tumbler's Path · Ante ${session.ante} · ${session.livesLeft} ${session.livesLeft === 1 ? "life" : "lives"}`, onClose: close, children: [session.result !== "playing" && (_jsx("p", { className: `mb-2 text-sm font-semibold ${session.result === "success" ? "text-emerald-300" : "text-rose-300"}`, children: session.result === "success" ? "The lock clicks open!" : "The lock jams shut." })), _jsx("div", { className: "mx-auto grid gap-0.5", style: { gridTemplateColumns: `repeat(${session.cols}, 1.15rem)` }, children: Array.from({ length: session.rows }).map((_, row) => Array.from({ length: session.cols }).map((_, col) => {
                    const cell = session.visible.find((c) => c.col === col && c.row === row);
                    const isPick = col === session.col && row === session.row;
                    const bg = cell === undefined
                        ? "bg-stone-950"
                        : cell.kind === "seat"
                            ? "bg-amber-500"
                            : cell.kind === "gate"
                                ? "bg-sky-500"
                                : cell.kind === "trap"
                                    ? "bg-rose-600"
                                    : "bg-stone-600";
                    return (_jsx("div", { className: `h-[1.15rem] w-[1.15rem] rounded-sm ${bg} ${isPick ? "ring-2 ring-amber-200" : ""}` }, `${col}-${row}`));
                })) }), _jsx("div", { className: "mt-3 flex flex-wrap justify-center gap-1.5", children: session.allowedActions.map((action) => (_jsx("button", { type: "button", disabled: session.result !== "playing", onClick: () => commands.run("lockpick.pick", { action }), className: "rounded border border-amber-800 bg-amber-950/60 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-900/60 disabled:opacity-40", children: PICK_LABEL[action] ?? action }, action))) })] }));
}
export function VendorPanel() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const shopId = useKeyedStore(shopStore, userId);
    const copper = useCurrency("copper");
    const stock = useGameStore((ctx) => shopId === null ? [] : ctx.game.trade.tradableAt(shopId, ITEMS.map((item) => item.id)));
    if (shopId === null)
        return null;
    const vendor = NPCS.find((npc) => npc.shopId === shopId);
    return (_jsxs(Window, { title: _jsxs("span", { children: [vendor?.name ?? "Vendor", " \u00B7 ", _jsx("span", { className: "text-amber-400", children: copperLabel(copper) })] }), onClose: () => commands.run("shop.close", {}), wide: true, children: [_jsx("p", { className: "mb-2 text-xs text-stone-500", children: "Open your backpack (B) to sell. Prices in copper." }), _jsx("div", { className: "space-y-0.5", children: stock.map((itemId) => (_jsx(ItemRow, { itemId: itemId, price: itemDefById(itemId)?.buyPrice, action: () => commands.run("shop.buy", { itemId }), actionLabel: "Buy" }, itemId))) })] }));
}
