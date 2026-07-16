import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { StatBar } from "@jgengine/react";
import { useGame, usePlayer } from "@jgengine/react/hooks";
import { useKeyedStore } from "@jgengine/react/store";
import { formatDuration } from "@jgengine/core/format/duration";
import { fiestaRecordStore, fiestaStore } from "../../session/stores";
import { CLOSE_BUTTON, PANEL, PANEL_TITLE } from "../theme";
const TIER_COLORS = {
    silver: "border-stone-400/60 text-stone-200",
    gold: "border-amber-400/70 text-amber-200",
    prismatic: "border-fuchsia-400/70 text-fuchsia-200",
};
export function ArenaPanel() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const record = useKeyedStore(fiestaRecordStore, userId);
    const fiesta = useKeyedStore(fiestaStore, userId);
    return (_jsxs("div", { className: `${PANEL} pointer-events-auto w-[360px]`, children: [_jsxs("div", { className: PANEL_TITLE, children: [_jsx("span", { children: "The Ashen Coliseum" }), _jsx("button", { type: "button", className: CLOSE_BUTTON, onClick: () => commands.run("openArena", {}), children: "\u2715" })] }), _jsxs("div", { className: "space-y-3 px-4 py-3 text-sm", children: [_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-3xl font-bold text-[#ffb24a]", style: { textShadow: "0 0 10px #cc5a1466, 1px 1px 2px #000" }, children: (record?.wins ?? 0) * 25 + 1500 }), _jsxs("div", { className: "text-xs text-stone-400", children: ["Rating \u2014 ", _jsxs("span", { className: "text-[#7fdc4f]", children: [record?.wins ?? 0, " wins"] }), " /", " ", _jsxs("span", { className: "text-[#ff7a6a]", children: [record?.losses ?? 0, " losses"] })] })] }), _jsx("div", { className: "rounded border border-[#5a4a20] bg-stone-950/60 px-3 py-2 text-xs text-stone-400", children: "The Ashen Coliseum is a ranked arena for the live world. Play online to enter the queue and climb the ladder." }), _jsxs("div", { className: "rounded border border-fuchsia-800/60 bg-fuchsia-950/20 px-3 py-2", children: [_jsx("div", { className: "mb-1 text-sm font-semibold text-[#ff3df0]", children: "2v2 FIESTA \u2014 Practice" }), _jsx("p", { className: "mb-2 text-xs text-stone-400", children: "Fight beside Sir Botsworth against Botzo the Arcane and Sneakbot. Score takedowns, grab augments, survive the ring. First to 15." }), fiesta?.active === true ? (_jsx("button", { type: "button", className: "w-full rounded border border-stone-600 bg-stone-900/70 px-2 py-1.5 text-xs text-stone-300 hover:bg-stone-800", onClick: () => commands.run("fiesta.leave", {}), children: "Forfeit Match" })) : (_jsx("button", { type: "button", className: "w-full rounded border border-fuchsia-600/70 bg-fuchsia-950/60 px-2 py-1.5 text-xs font-semibold text-fuchsia-100 hover:bg-fuchsia-900/50", onClick: () => {
                                    commands.run("fiesta.start", {});
                                    commands.run("openArena", {});
                                }, children: "Enter the FIESTA" }))] })] })] }));
}
export function FiestaBanner() {
    const { userId } = usePlayer();
    const view = useKeyedStore(fiestaStore, userId);
    if (view?.active !== true)
        return null;
    return (_jsxs("div", { className: "pointer-events-none flex flex-col items-center gap-1", children: [_jsxs("div", { className: "rounded-md border border-[#cc5a14] bg-gradient-to-b from-[#1a120bdd] to-[#0d0805dd] px-4 py-1.5 text-center shadow-lg", style: { boxShadow: "inset 0 0 16px #cc5a1422" }, children: [_jsxs("div", { className: "text-lg font-bold tracking-wide", children: [_jsx("span", { className: "text-[#7fdc4f]", children: view.scoreA }), _jsx("span", { className: "mx-2 text-[#d8cba0]", children: "FIESTA" }), _jsx("span", { className: "text-[#ff8d7a]", children: view.scoreB })] }), _jsx("div", { className: "text-[11px] text-[#d8cba0]", children: view.status === "countdown"
                            ? `Steel yourself… ${view.countdown}`
                            : view.status === "over"
                                ? "The bout is decided. Returning to the world…"
                                : `First to ${view.scoreLimit} · ${formatDuration(view.timeLeft)}${view.inRing ? "" : " · RING!"}` })] }), view.pop !== null && (_jsx("div", { className: "text-2xl font-black tracking-widest drop-shadow-lg", style: { color: view.pop.color, textShadow: "2px 2px 3px #000" }, children: view.pop.text })), view.playerRespawnIn > 0 && (_jsxs("div", { className: "rounded bg-stone-950/80 px-3 py-1 text-sm text-[#ff8d7a]", children: ["Respawn in ", Math.ceil(view.playerRespawnIn), "\u2026"] }))] }));
}
export function FiestaHud() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const view = useKeyedStore(fiestaStore, userId);
    if (view?.active !== true)
        return null;
    return (_jsxs("div", { className: "pointer-events-auto flex w-64 flex-col gap-2", children: [_jsxs("div", { className: "rounded-md border border-fuchsia-800/70 bg-stone-950/85 px-3 py-2 text-sm shadow-lg", children: [_jsx("div", { className: "mb-1 font-semibold text-[#ff3df0]", children: "Ashen Coliseum \u00B7 Fiesta" }), view.fighters.map((fighter) => (_jsxs("div", { className: "mb-0.5 flex items-center gap-2 text-xs", children: [_jsx("span", { className: `w-24 truncate ${fighter.team === "a" ? "text-[#7fdc4f]" : "text-[#ff8d7a]"}`, children: fighter.name }), _jsx(StatBar, { value: fighter.dead ? 0 : fighter.hp, max: Math.max(1, fighter.hpMax), fill: fighter.team === "a" ? "#22c55e" : "#ef4444", chromeless: true, showValue: false, labelPlacement: "none", railHeight: 6, railRadius: 4, railStyle: { background: "#292524" }, width: "auto", style: { flex: 1 } }), fighter.dead && (_jsx("span", { className: "text-[10px] text-stone-500", children: fighter.respawnIn > 0 ? `${Math.ceil(fighter.respawnIn)}s` : "down" }))] }, fighter.name))), view.augments.length > 0 && (_jsx("div", { className: "mt-1 text-[10px] text-[#32e0ff]", children: view.augments.map((aug) => aug.name).join(" · ") }))] }), view.offer !== null && (_jsxs("div", { className: "rounded-md border border-amber-700/70 bg-stone-950/90 px-3 py-2 shadow-lg", children: [_jsx("div", { className: "mb-1.5 text-xs font-bold uppercase tracking-wider text-[#ffd24a]", children: "Choose an augment" }), _jsx("div", { className: "flex flex-col gap-1.5", children: view.offer.map((aug) => (_jsxs("button", { type: "button", className: `rounded border bg-stone-900/80 px-2 py-1.5 text-left hover:bg-stone-800 ${TIER_COLORS[aug.tier] ?? TIER_COLORS.silver}`, onClick: () => commands.run("fiesta.pick", { augmentId: aug.id }), children: [_jsx("div", { className: "text-xs font-semibold", children: aug.name }), _jsx("div", { className: "text-[10px] text-stone-400", children: aug.description })] }, aug.id))) })] }))] }));
}
