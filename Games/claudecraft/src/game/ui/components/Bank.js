import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useGame, useInventory } from "@jgengine/react/hooks";
import { itemDefById } from "../../items/catalog";
import { CLOSE_BUTTON, PANEL, PANEL_TITLE, QUALITY_COLORS } from "../theme";
function Column({ title, inventoryId, actionLabel, command, }) {
    const { commands } = useGame();
    const slots = useInventory(inventoryId);
    return (_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("h3", { className: "mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80", children: title }), _jsx("div", { className: "space-y-0.5", children: slots.every((slot) => slot === null) ? (_jsx("p", { className: "py-3 text-center text-xs text-stone-500", children: "Empty" })) : (slots.map((slot, index) => {
                    if (slot === null)
                        return null;
                    const item = itemDefById(slot.itemId);
                    if (item === null)
                        return null;
                    return (_jsxs("button", { type: "button", onClick: () => commands.run(command, { itemId: slot.itemId }), title: actionLabel, className: "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-stone-800/70", children: [_jsx("span", { className: `flex h-7 w-7 shrink-0 items-center justify-center rounded border border-stone-700 bg-stone-900 ${QUALITY_COLORS[item.quality]}`, children: _jsx(GameIcon, { name: item.icon, size: 16 }) }), _jsxs("span", { className: `min-w-0 flex-1 truncate text-xs ${QUALITY_COLORS[item.quality]}`, children: [item.name, slot.count > 1 ? ` ×${slot.count}` : ""] }), _jsx("span", { className: "text-[10px] text-amber-400/80", children: actionLabel })] }, `${slot.itemId}-${index}`));
                })) })] }));
}
export function BankPanel() {
    const { commands } = useGame();
    return (_jsxs("div", { className: `${PANEL} pointer-events-auto w-[560px] max-h-[70vh] overflow-hidden`, children: [_jsxs("div", { className: PANEL_TITLE, children: [_jsx("span", { children: "The Gilded Strongbox" }), _jsx("button", { type: "button", className: CLOSE_BUTTON, onClick: () => commands.run("bank.close", {}), children: "\u2715" })] }), _jsxs("div", { className: "flex max-h-[58vh] gap-5 overflow-y-auto px-4 py-3", children: [_jsx(Column, { title: "Backpack", inventoryId: "bags", actionLabel: "Deposit", command: "bank.deposit" }), _jsx(Column, { title: "Strongbox", inventoryId: "bank", actionLabel: "Withdraw", command: "bank.withdraw" })] })] }));
}
