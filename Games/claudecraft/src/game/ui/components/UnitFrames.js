import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { StatBar } from "@jgengine/react";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useEntityStat, useGameStore, usePlayer, useTarget } from "@jgengine/react/hooks";
import { useKeyedStore } from "@jgengine/react/store";
import { useGameContext } from "@jgengine/react/provider";
import { classById } from "../../classes/catalog";
import { mobById } from "../../entities/enemies/catalog";
import { NPCS } from "../../entities/npcs/catalog";
import { mobRuntimeOf } from "../../ai/mobs";
import { autoAttackStore, aurasStore, classStore, nameStore, petStore } from "../../session/stores";
import { HP_FILL, RESOURCE_FILL } from "../theme";
function Bar({ value, max, fill, label }) {
    return (_jsx(StatBar, { value: value, max: Math.max(1, max), fill: fill, label: label, chromeless: true, width: "100%", railHeight: 15, railRadius: 0, railClassName: "wcc-bar-rail", gloss: true, labelPlacement: "inside" }));
}
function AuraRow({ instanceId }) {
    const auras = useKeyedStore(aurasStore, instanceId);
    if (auras.length === 0)
        return null;
    return (_jsx("div", { className: "mt-1 flex flex-wrap gap-1", children: auras.map((aura) => (_jsx("span", { title: aura.name, className: `flex h-7 w-7 items-center justify-center rounded-[3px] border ${aura.kind === "dot"
                ? "border-[#c0392b] bg-[#2a0d0a] text-[#ff8f85]"
                : "border-[#3a6ea8] bg-[#0a1520] text-[#9fc4e0]"}`, children: _jsx(GameIcon, { name: aura.icon, size: 17 }) }, aura.id))) }));
}
function Portrait({ icon, color, level, hostile, }) {
    return (_jsxs("div", { className: "relative h-16 w-16 shrink-0", children: [_jsx("span", { className: "flex h-[60px] w-[60px] items-center justify-center rounded-full border-2 bg-[radial-gradient(circle_at_35%_30%,#2c2c3a,#15151f)]", style: { borderColor: hostile === true ? "#8a2a20" : "#6f5a2a", color }, children: _jsx(GameIcon, { name: icon, size: 30 }) }), _jsx("span", { className: "wcc-title absolute -bottom-0.5 -left-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#6f5a2a] bg-[#15151f] text-[11px] font-bold", style: { outline: "1px solid #000" }, children: level })] }));
}
export function PlayerFrame() {
    const { userId } = usePlayer();
    const classId = useKeyedStore(classStore, userId);
    const name = useKeyedStore(nameStore, userId);
    const health = useEntityStat(userId, "health");
    const resource = useEntityStat(userId, "resource");
    const level = useEntityStat(userId, "level");
    const pet = useKeyedStore(petStore, userId);
    if (classId === null || health === null)
        return null;
    const cls = classById(classId);
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center", children: [_jsx(Portrait, { icon: cls.icon, color: cls.color, level: level?.current ?? 1 }), _jsxs("div", { className: "wcc-panel w-[190px] rounded-l-none px-2 py-1.5", children: [_jsx("div", { className: "wcc-title truncate text-xs", children: name ?? cls.name }), _jsxs("div", { className: "mt-0.5 space-y-0.5", children: [_jsx(Bar, { value: health.current, max: health.max, fill: HP_FILL }), _jsx(Bar, { value: resource?.current ?? 0, max: resource?.max ?? 100, fill: RESOURCE_FILL[cls.resource] ?? "#2b7bd4" })] })] })] }), _jsx(AuraRow, { instanceId: userId }), pet !== null && (_jsxs("div", { className: "wcc-panel mt-1.5 w-[190px] px-2 py-1", children: [_jsxs("div", { className: "flex items-baseline justify-between text-[11px]", children: [_jsxs("span", { className: "truncate font-semibold text-[#9fdc7f]", children: [pet.name, !pet.alive ? " (fallen)" : ""] }), _jsx("span", { className: "text-[#998d6a]", children: pet.role })] }), _jsx("div", { className: "mt-0.5", children: _jsx(Bar, { value: pet.hp, max: Math.max(1, pet.maxHp), fill: HP_FILL }) })] }))] }));
}
export function TargetFrame() {
    const ctx = useGameContext();
    const { userId } = usePlayer();
    const targetId = useTarget(userId);
    const health = useEntityStat(targetId ?? "", "health");
    const targetName = useGameStore((ctx) => (targetId === null ? null : (ctx.scene.entity.get(targetId)?.name ?? null)));
    const autoAttack = useKeyedStore(autoAttackStore, userId);
    if (targetId === null || targetName === null || health === null)
        return null;
    const runtime = mobRuntimeOf(ctx, targetId);
    const mob = mobById(runtime?.defId ?? targetName);
    const npc = NPCS.find((entry) => `npc:${entry.id}` === targetId);
    const display = mob?.name ?? npc?.name ?? targetName;
    const hostile = runtime !== null;
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center", children: [_jsxs("div", { className: "wcc-panel w-[190px] rounded-r-none px-2 py-1.5", children: [_jsx("div", { className: "flex items-baseline justify-between", children: _jsxs("span", { className: "truncate text-xs font-semibold [text-shadow:1px_1px_2px_#000]", style: { color: hostile ? "#ff6b5e" : "#9fdc7f", fontFamily: "var(--wcc-font-display)" }, children: [display, autoAttack ? " ⚔" : "", mob?.boss === true ? " ☠" : ""] }) }), _jsx("div", { className: "mt-0.5", children: _jsx(Bar, { value: health.current, max: health.max, fill: HP_FILL }) })] }), _jsx(Portrait, { icon: (hostile ? "skull" : "shield"), color: hostile ? "#ff6b5e" : "#9fdc7f", level: runtime !== null ? runtime.level : "•", hostile: hostile })] }), _jsx(AuraRow, { instanceId: targetId })] }));
}
