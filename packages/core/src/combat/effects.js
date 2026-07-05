import { applyPoolDelta } from "../scene/entityStats";
import { distanceBetween } from "../scene/spatial";
const DEFAULT_DRAIN_STAT = "damage";
export function createEffectSystem(deps) {
    function resolveRule(instanceId, effect) {
        return deps.resolveReceive(instanceId)?.[effect] ?? null;
    }
    function baseDrainMagnitude(effect, via) {
        if (via?.amount !== undefined)
            return via.amount;
        if (via?.item === undefined)
            return 0;
        const statName = deps.drainStatByEffect?.[effect] ?? DEFAULT_DRAIN_STAT;
        return deps.getStat(via.item, statName) ?? 0;
    }
    function modifiedDrainMagnitude(magnitude, rule) {
        let result = magnitude;
        for (const reduction of Object.values(rule.modifiers ?? {})) {
            result *= 1 - reduction;
        }
        return result;
    }
    function canReceive(instanceId, effect) {
        const rule = resolveRule(instanceId, effect);
        if (rule === null)
            return "not-receivable";
        const stats = deps.resolveStats(instanceId);
        if (stats === undefined)
            return "unknown-instance";
        const anyPoolAboveMin = rule.order.some((statId) => {
            const stat = stats[statId];
            return stat !== undefined && stat.current > stat.min;
        });
        if (!anyPoolAboveMin)
            return "pools-depleted";
        return null;
    }
    function drainPools(instanceId, effect, rule, stats, drainMagnitude) {
        const applied = [];
        const lastStatId = rule.order[rule.order.length - 1];
        let remaining = drainMagnitude;
        let lethal = false;
        for (const statId of rule.order) {
            if (remaining === 0)
                break;
            const before = stats[statId];
            if (before === undefined)
                continue;
            const result = applyPoolDelta(stats, statId, -remaining);
            if (result.status === "rejected")
                continue;
            stats[statId] = result.stat;
            const delta = result.stat.current - before.current;
            if (delta !== 0)
                applied.push({ statId, delta });
            remaining += delta;
            if (statId === lastStatId && drainMagnitude > 0 && result.hitMin)
                lethal = true;
        }
        return { instanceId, effect, applied, lethal };
    }
    function applyTo(instanceId, effect, via, from, scale) {
        if (canReceive(instanceId, effect) !== null)
            return null;
        const rule = resolveRule(instanceId, effect);
        const stats = deps.resolveStats(instanceId);
        if (rule === null || stats === undefined)
            return null;
        const drainMagnitude = modifiedDrainMagnitude(baseDrainMagnitude(effect, via) * scale, rule);
        const result = drainPools(instanceId, effect, rule, stats, drainMagnitude);
        if (result.lethal)
            deps.onLethal?.(instanceId, { from, via, effect });
        return result;
    }
    return {
        canReceive,
        preview(input) {
            const rule = resolveRule(input.to, input.effect);
            if (rule === null)
                return 0;
            return modifiedDrainMagnitude(baseDrainMagnitude(input.effect, input.via), rule);
        },
        applyEffect(input) {
            if ("to" in input) {
                const result = applyTo(input.to, input.effect, input.via, input.from, 1);
                return result === null ? [] : [result];
            }
            const falloff = input.falloff ?? "none";
            const los = input.los ?? true;
            const results = [];
            for (const instanceId of deps.spatial.inRadius(input.at, input.radius)) {
                if (los && !deps.spatial.hasLineOfSight(input.at, instanceId))
                    continue;
                let scale = 1;
                if (falloff === "linear") {
                    const position = deps.spatial.positionOf(instanceId);
                    if (position === undefined)
                        continue;
                    scale = Math.max(0, 1 - distanceBetween(input.at, position) / input.radius);
                }
                const result = applyTo(instanceId, input.effect, input.via, input.from, scale);
                if (result !== null)
                    results.push(result);
            }
            return results;
        },
    };
}
