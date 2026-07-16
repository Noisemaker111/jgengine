import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef } from "react";
import { useGameContext } from "@jgengine/react/provider";
import { useGameStore, useHudTick, useTarget } from "@jgengine/react/hooks";
import { swingTimerState } from "@jgengine/core/ui/swingTimer";
import { isMobInstance } from "../../ai/mobs";
import { heroOf, heroSheet } from "../../session/hero";
export function SwingTimer() {
    useHudTick();
    const ctx = useGameContext();
    const userId = ctx.player.userId;
    const targetId = useTarget(userId);
    const gameNow = useGameStore((c) => c.time.now());
    const prevPeriodRef = useRef(0);
    const prevTimerRef = useRef(0);
    const hero = heroOf(ctx, userId);
    const sheet = heroSheet(ctx, userId);
    const target = targetId === null
        ? null
        : (() => {
            const health = ctx.scene.entity.stats.get(targetId, "health");
            return {
                dead: health !== null && health.current <= health.min,
                kind: isMobInstance(ctx, targetId) ? "enemy" : "npc",
            };
        })();
    const state = swingTimerState(hero === null || sheet === null
        ? { autoAttack: false, swingTimer: 0, weapon: { speed: 1 } }
        : {
            autoAttack: hero.autoAttack,
            swingTimer: Math.max(0, hero.nextSwingAt - gameNow),
            weapon: { speed: sheet.weapon.speed },
        }, target, prevPeriodRef.current, prevTimerRef.current);
    prevPeriodRef.current = state.nextPeriod;
    prevTimerRef.current = state.nextTimer;
    if (!state.visible)
        return null;
    return (_jsx("div", { className: "w-[300px]", children: _jsxs("div", { className: "wcc-bar-rail relative h-3 overflow-hidden rounded-[4px]", children: [_jsx("div", { className: "h-full", style: {
                        width: `${state.frac * 100}%`,
                        background: "linear-gradient(#f4f6fb, #b9c2d1 60%, #7d8898)",
                    } }), _jsx("span", { className: "wcc-title absolute inset-0 flex items-center justify-center text-[10px]", children: state.labelKind === "ready" ? "Ready" : state.seconds.toFixed(1) })] }) }));
}
