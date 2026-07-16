import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { LevelUpFlash, ToastStack } from "@jgengine/react/components";
import { useGame, useGameStore, usePlayer, useQuestJournal } from "@jgengine/react/hooks";
import { useKeyedStore } from "@jgengine/react/store";
import { DUNGEONS } from "../../dungeons/catalog";
import { mobById } from "../../entities/enemies/catalog";
import { itemDefById } from "../../items/catalog";
import { QUESTS } from "../../quests/catalog";
import { deadStore } from "../../session/stores";
import { inCrypt, zoneAt } from "../../world/zones";
import { QUALITY_COLORS } from "../theme";
export function DeathOverlay() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const dead = useKeyedStore(deadStore, userId);
    if (!dead)
        return null;
    return (_jsx("div", { className: "pointer-events-auto absolute inset-0 z-30 flex items-center justify-center backdrop-grayscale", style: { background: "radial-gradient(ellipse at center, #40000077 0%, #300000bb 100%)" }, children: _jsxs("div", { className: "text-center", children: [_jsx("h2", { className: "text-[44px] font-bold text-[#dddddd]", style: { fontFamily: "var(--wcc-font-display)", textShadow: "2px 2px 8px #000" }, children: "You Have Died" }), _jsx("p", { className: "mt-2 text-sm text-red-100/80", children: "Your spirit lingers. Return to the nearest graveyard." }), _jsx("button", { type: "button", onClick: () => commands.run("player.release", {}), className: "wcc-btn mt-6 px-6 py-2.5 font-semibold", children: "Release Spirit" })] }) }));
}
export function QuestTracker() {
    const journal = useQuestJournal();
    const active = journal.slice(0, 5);
    if (active.length === 0)
        return null;
    return (_jsxs("div", { className: "w-60 text-right", children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-wider text-amber-400/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]", children: "Objectives" }), active.map((quest) => {
                const def = QUESTS.find((entry) => entry.id === quest.questId);
                return (_jsxs("div", { className: "mt-1.5", children: [_jsxs("p", { className: `text-sm font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,0.9)] ${quest.status === "completed" ? "text-emerald-300" : "text-amber-100"}`, children: [def?.title ?? quest.questId, quest.status === "completed" ? " ✓" : ""] }), quest.status !== "completed" &&
                            quest.objectives.map((objective) => (_jsxs("p", { className: `text-xs [text-shadow:0_1px_2px_rgba(0,0,0,0.9)] ${objective.complete ? "text-emerald-400" : "text-stone-300"}`, children: [objective.progress, "/", objective.count, " ", objective.kind === "kill" ? "slain" : "collected"] }, objective.id)))] }, quest.questId));
            })] }));
}
export function useZoneName() {
    const { userId } = usePlayer();
    const position = useGameStore((ctx) => ctx.scene.entity.get(userId)?.position ?? null);
    if (position === null)
        return null;
    const dungeon = DUNGEONS.find((entry) => Math.hypot(position[0] - entry.center[0], position[2] - entry.center[1]) <= entry.radius);
    return dungeon?.name ?? (inCrypt(position[0], position[2]) ? "The Hollow Crypt" : zoneAt(position[2]).name);
}
export function ZoneLabel() {
    const label = useZoneName();
    if (label === null)
        return null;
    return (_jsx("p", { className: "wcc-title text-center text-lg font-semibold tracking-wide", children: label }));
}
export function KillLootToasts() {
    return (_jsxs("div", { className: "flex w-72 flex-col gap-1", children: [_jsx(ToastStack, { action: "loot.granted", limit: 4, className: "flex flex-col gap-1", renderToast: (entry) => {
                    const payload = entry.data;
                    const drops = payload?.drops ?? [];
                    return (_jsx("p", { className: "text-sm [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]", children: drops.map((drop, index) => {
                            if (drop.currency !== undefined) {
                                return (_jsxs("span", { className: "text-amber-300", children: ["+", drop.count, " copper", " "] }, index));
                            }
                            const item = drop.item === undefined ? null : itemDefById(drop.item);
                            return (_jsxs("span", { className: item === null ? "text-stone-200" : QUALITY_COLORS[item.quality], children: [item?.name ?? drop.item, " ", drop.count > 1 ? `×${drop.count} ` : " "] }, index));
                        }) }));
                } }), _jsx(ToastStack, { action: "entity.died", limit: 3, className: "flex flex-col gap-0.5", renderToast: (entry) => {
                    const payload = entry.data;
                    if (payload?.reason?.kind !== "player_kill")
                        return null;
                    const mob = payload.catalogId === undefined ? null : mobById(payload.catalogId);
                    if (mob === null)
                        return null;
                    return (_jsxs("p", { className: "text-xs text-stone-400 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]", children: [mob.name, " slain"] }));
                } })] }));
}
export function LevelUpOverlay() {
    return (_jsx(LevelUpFlash, { className: "pointer-events-none absolute inset-x-0 top-1/4 z-20 flex justify-center", renderFlash: (event) => (_jsxs("p", { className: "animate-pulse font-serif text-4xl font-bold text-amber-300 [text-shadow:0_2px_16px_rgba(251,191,36,0.6)]", children: ["Level ", event.level, "!"] })) }));
}
export function CreditLine() {
    return (_jsxs("a", { href: "https://github.com/levy-street/world-of-claudecraft", target: "_blank", rel: "noreferrer", className: "pointer-events-auto flex items-center gap-1.5 text-[10px] text-stone-400/90 hover:text-amber-300 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]", children: [_jsx("img", { src: "https://unavatar.io/github/levy-street", alt: "", className: "h-4 w-4 rounded-full", onError: (event) => {
                    event.currentTarget.style.display = "none";
                } }), "Port of World of ClaudeCraft \u00B7 Levy Street (MIT)"] }));
}
