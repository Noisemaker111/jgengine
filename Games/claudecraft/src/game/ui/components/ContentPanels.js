import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { StatBar } from "@jgengine/react";
import { useGame, useInventory, usePlayer } from "@jgengine/react/hooks";
import { useKeyedStore } from "@jgengine/react/store";
import { itemDefById } from "../../items/catalog";
import { delveStore, mailOpenStore, mailViewStore, valeCupStore, yumiStore } from "../../session/stores";
import { CLOSE_BUTTON, PANEL, PANEL_TITLE, QUALITY_COLORS } from "../theme";
export function MailPanel() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const open = useKeyedStore(mailOpenStore, userId);
    const view = useKeyedStore(mailViewStore, userId);
    const bags = useInventory("bags");
    if (!open)
        return null;
    return (_jsxs("div", { className: `${PANEL} pointer-events-auto w-[520px] max-h-[70vh] overflow-hidden`, children: [_jsxs("div", { className: PANEL_TITLE, children: [_jsx("span", { children: "Waystation Post" }), _jsx("button", { type: "button", className: CLOSE_BUTTON, onClick: () => commands.run("mail.close", {}), children: "\u2715" })] }), _jsxs("div", { className: "space-y-3 overflow-y-auto px-4 py-3 text-sm", children: [_jsx("p", { className: "text-xs text-stone-400", children: "Send items to yourself \u2014 they arrive after a short delay." }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", className: "rounded border border-amber-800/70 bg-amber-950/50 px-2 py-1 text-xs text-amber-100 hover:bg-amber-900/50", onClick: () => commands.run("market.open", {}), children: "Open Market Board" }), _jsx("button", { type: "button", className: "rounded border border-stone-700 bg-stone-900/70 px-2 py-1 text-xs text-stone-300 hover:bg-stone-800", onClick: () => commands.run("mail.cod", {}), children: "COD (stub)" })] }), _jsxs("div", { children: [_jsx("h3", { className: "mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80", children: "Send from bags" }), _jsx("div", { className: "max-h-40 space-y-0.5 overflow-y-auto", children: bags.every((slot) => slot === null) ? (_jsx("p", { className: "py-2 text-center text-xs text-stone-500", children: "Empty bags" })) : (bags.map((slot, index) => {
                                    if (slot === null)
                                        return null;
                                    const item = itemDefById(slot.itemId);
                                    if (item === null)
                                        return null;
                                    return (_jsxs("button", { type: "button", className: "flex w-full items-center justify-between rounded px-1.5 py-1 text-left hover:bg-stone-800/70", onClick: () => commands.run("mail.sendSelf", { itemId: slot.itemId, count: 1 }), children: [_jsx("span", { className: `truncate text-xs ${QUALITY_COLORS[item.quality]}`, children: item.name }), _jsx("span", { className: "text-[10px] text-amber-400/80", children: "Mail \u00D71" })] }, `${slot.itemId}-${index}`));
                                })) })] }), _jsxs("div", { children: [_jsx("h3", { className: "mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80", children: "In transit" }), (view?.pending.length ?? 0) === 0 ? (_jsx("p", { className: "text-xs text-stone-500", children: "No pending mail" })) : (view?.pending.map((entry) => (_jsxs("div", { className: "rounded bg-stone-900/60 px-2 py-1 text-xs text-stone-300", children: [entry.items.map((stack) => `${stack.itemId}×${stack.count}`).join(", "), entry.ready ? " — ready" : " — delayed"] }, entry.id))))] })] })] }));
}
export function DelveHud() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const session = useKeyedStore(delveStore, userId);
    if (session === null || session.status === "idle")
        return null;
    return (_jsxs("div", { className: "rounded-md border border-violet-800/70 bg-stone-950/85 px-3 py-2 text-sm text-violet-100 shadow-lg", children: [_jsxs("div", { className: "font-semibold text-violet-200", children: ["Delve \u00B7 Chamber ", session.chamberIndex + 1, "/", session.totalChambers] }), _jsxs("div", { className: "text-xs text-violet-100/80", children: [session.chamberName, " \u00B7 ", session.tier, " \u00B7 ", session.remaining, " left"] }), _jsxs("div", { className: "mt-1.5 flex gap-2", children: [(session.status === "cleared" || session.status === "complete") && (_jsx("button", { type: "button", className: "rounded border border-violet-600/70 bg-violet-950/60 px-2 py-0.5 text-[11px] hover:bg-violet-900/60", onClick: () => commands.run("delve.advance", {}), children: session.status === "complete" ? "Claimed" : "Advance" })), _jsx("button", { type: "button", className: "rounded border border-stone-600 bg-stone-900/70 px-2 py-0.5 text-[11px] hover:bg-stone-800", onClick: () => commands.run("delve.exit", {}), children: "Exit" })] })] }));
}
export function ValeCupHud() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const match = useKeyedStore(valeCupStore, userId);
    if (match === null || !match.active)
        return null;
    return (_jsxs("div", { className: "rounded-md border border-amber-800/70 bg-stone-950/85 px-3 py-2 text-sm text-amber-50 shadow-lg", children: [_jsx("div", { className: "font-semibold text-amber-200", children: "Vale Cup" }), _jsxs("div", { className: "text-xs", children: ["Vale ", match.scoreHome, " \u2013 ", match.scoreAway, " Away \u00B7 ", Math.ceil(match.timeLeft), "s"] }), match.result !== null && match.result !== "playing" && (_jsx("div", { className: "text-xs capitalize text-amber-300", children: match.result })), _jsxs("div", { className: "mt-1.5 flex gap-2", children: [_jsx("button", { type: "button", className: "rounded border border-amber-700/70 bg-amber-950/50 px-2 py-0.5 text-[11px]", onClick: () => commands.run("valecup.kick", { dirX: 0, dirZ: -1 }), children: "Kick" }), _jsx("button", { type: "button", className: "rounded border border-stone-600 bg-stone-900/70 px-2 py-0.5 text-[11px]", onClick: () => commands.run("valecup.leave", {}), children: "Leave" })] })] }));
}
export function YumiHud() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const session = useKeyedStore(yumiStore, userId);
    if (session === null || !session.active)
        return null;
    return (_jsxs("div", { className: "rounded-md border border-pink-800/70 bg-stone-950/85 px-3 py-2 text-sm text-pink-50 shadow-lg", children: [_jsx("div", { className: "font-semibold text-pink-200", children: "Protect Yumi" }), _jsx(StatBar, { value: session.yumiHp, max: Math.max(1, session.yumiMaxHp), fill: "#ec4899", chromeless: true, showValue: false, labelPlacement: "none", railHeight: 8, railRadius: 4, railStyle: { background: "#1c1917" }, width: "100%", style: { marginTop: 4 } }), _jsxs("div", { className: "mt-1 text-xs text-pink-100/80", children: ["Wave ", session.wave, " \u00B7 ", session.alive, " hostiles \u00B7 ", session.status] }), _jsx("button", { type: "button", className: "mt-1.5 rounded border border-stone-600 bg-stone-900/70 px-2 py-0.5 text-[11px]", onClick: () => commands.run("yumi.leave", {}), children: "Leave" })] }));
}
