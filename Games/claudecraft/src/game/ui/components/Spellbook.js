import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useEntityStat, useGame, usePlayer } from "@jgengine/react/hooks";
import { useKeyedStore } from "@jgengine/react/store";
import { useState } from "react";
import { classById } from "../../classes/catalog";
import { barStore, classStore } from "../../session/stores";
import { CLOSE_BUTTON, PANEL, PANEL_TITLE } from "../theme";
export function SpellbookPanel() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const [pickedSlot, setPickedSlot] = useState(0);
    const classId = useKeyedStore(classStore, userId);
    const level = useEntityStat(userId, "level")?.current ?? 1;
    const bar = useKeyedStore(barStore, userId);
    if (classId === null)
        return null;
    const cls = classById(classId);
    const abilities = [...cls.abilities].sort((a, b) => a.levelReq - b.levelReq);
    return (_jsxs("div", { className: `${PANEL} pointer-events-auto w-[460px] max-h-[72vh] overflow-hidden`, children: [_jsxs("div", { className: PANEL_TITLE, children: [_jsxs("span", { children: ["Spellbook \u00B7 ", cls.name] }), _jsx("button", { type: "button", className: CLOSE_BUTTON, onClick: () => commands.run("openSpellbook", {}), children: "\u2715" })] }), _jsxs("div", { className: "flex items-center gap-1.5 border-b border-amber-900/40 px-4 py-2", children: [_jsx("span", { className: "text-xs text-stone-400", children: "Assign to slot" }), Array.from({ length: 9 }, (_, index) => (_jsx("button", { type: "button", onClick: () => setPickedSlot(index), className: `h-7 w-7 rounded border text-xs font-bold ${pickedSlot === index
                            ? "border-amber-400 bg-amber-900/60 text-amber-100"
                            : "border-stone-700 bg-stone-900 text-stone-400 hover:border-amber-600"}`, children: index + 1 }, index)))] }), _jsx("div", { className: "max-h-[52vh] space-y-0.5 overflow-y-auto px-4 py-3", children: abilities.map((ability) => {
                    const known = ability.levelReq <= level;
                    const slotIndex = bar.indexOf(ability.id);
                    return (_jsxs("button", { type: "button", disabled: !known, draggable: known, onDragStart: (event) => {
                            event.dataTransfer.setData("text/plain", `ability:${ability.id}`);
                            event.dataTransfer.effectAllowed = "copy";
                        }, onClick: () => commands.run("spellbook.assign", { abilityId: ability.id, slot: pickedSlot }), className: `flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left ${known ? "cursor-grab hover:bg-stone-800/70" : "opacity-45"}`, children: [_jsx("span", { className: "flex h-9 w-9 shrink-0 items-center justify-center rounded border border-stone-700 bg-stone-900 text-amber-200", children: _jsx(GameIcon, { name: ability.icon, size: 22 }) }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsxs("span", { className: "block text-sm font-semibold text-amber-100", children: [ability.name, slotIndex >= 0 && (_jsxs("span", { className: "ml-2 rounded bg-amber-950/80 px-1 text-[10px] text-amber-400 ring-1 ring-amber-900", children: ["slot ", slotIndex + 1] }))] }), _jsxs("span", { className: "block text-[11px] text-stone-400", children: [known ? "" : `Learned at level ${ability.levelReq} · `, ability.cost > 0 ? `${ability.cost} ${cls.resource} · ` : "", ability.castTime > 0 ? `${ability.castTime}s cast · ` : "Instant · ", ability.cooldown > 0 ? `${ability.cooldown}s cooldown · ` : "", ability.range > 0 ? `${ability.range} yd` : "melee"] })] })] }, ability.id));
                }) })] }));
}
