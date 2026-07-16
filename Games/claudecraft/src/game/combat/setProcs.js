import { seededRng } from "@jgengine/core/random/rng";
import { perContext } from "@jgengine/core/runtime/perContext";
import { aurasOf, syncAuras } from "../session/hero";
const rng = seededRng("claudecraft-setprocs");
const icdOf = perContext(() => new Map());
function ready(ctx, userId, procId, now, icdSec) {
    if (icdSec <= 0)
        return true;
    const readyAt = icdOf(ctx).get(userId)?.get(procId) ?? 0;
    return now >= readyAt;
}
function arm(ctx, userId, procId, now, icdSec) {
    if (icdSec <= 0)
        return;
    const icd = icdOf(ctx);
    let map = icd.get(userId);
    if (map === undefined) {
        map = new Map();
        icd.set(userId, map);
    }
    map.set(procId, now + icdSec);
}
function selfBuff(ctx, userId, proc, now) {
    const stat = proc.effect.buffStat;
    const list = aurasOf(ctx, userId);
    const existing = list.findIndex((aura) => aura.id === proc.id);
    if (existing >= 0)
        list.splice(existing, 1);
    list.push({
        id: proc.id,
        name: proc.name,
        icon: proc.icon,
        school: "physical",
        kind: "buff",
        sourceId: userId,
        amount: 0,
        tickEvery: 0,
        nextTickAt: now,
        expiresAt: now + proc.effect.durationSec,
        buffStat: stat,
        buffAmount: proc.effect.amount,
    });
    syncAuras(ctx, userId);
}
function nextCastFree(ctx, userId, proc, now) {
    const list = aurasOf(ctx, userId);
    const existing = list.findIndex((aura) => aura.id === proc.id);
    if (existing >= 0)
        list.splice(existing, 1);
    list.push({
        id: proc.id,
        name: proc.name,
        icon: proc.icon,
        school: "arcane",
        kind: "buff",
        sourceId: userId,
        amount: 0,
        tickEvery: 0,
        nextTickAt: now,
        expiresAt: now + proc.effect.durationSec,
        buffStat: "next_cast_free",
        buffAmount: 0,
    });
    syncAuras(ctx, userId);
}
function targetDot(ctx, userId, targetId, proc, now) {
    const list = aurasOf(ctx, targetId);
    const e = proc.effect;
    const existing = list.find((aura) => aura.id === proc.id);
    if (existing !== undefined) {
        existing.stacks = Math.min(e.maxStacks, (existing.stacks ?? 1) + 1);
        existing.amount = e.amount * existing.stacks;
        existing.expiresAt = now + e.durationSec;
        existing.sourceId = userId;
    }
    else {
        list.push({
            id: proc.id,
            name: proc.name,
            icon: proc.icon,
            school: "physical",
            kind: "dot",
            sourceId: userId,
            amount: e.amount,
            tickEvery: e.tickSec,
            nextTickAt: now + e.tickSec,
            expiresAt: now + e.durationSec,
            stacks: 1,
            maxStacks: e.maxStacks,
        });
    }
    syncAuras(ctx, targetId);
}
function fire(ctx, userId, procs, trigger, targetId) {
    const now = ctx.time.now();
    for (const proc of procs) {
        if (proc.trigger !== trigger)
            continue;
        if (!ready(ctx, userId, proc.id, now, proc.icdSec))
            continue;
        if (proc.chance < 1 && rng() >= proc.chance)
            continue;
        if (proc.effect.kind === "selfBuff") {
            selfBuff(ctx, userId, proc, now);
        }
        else if (proc.effect.kind === "nextCastFree") {
            nextCastFree(ctx, userId, proc, now);
        }
        else {
            if (targetId === null)
                continue;
            targetDot(ctx, userId, targetId, proc, now);
        }
        arm(ctx, userId, proc.id, now, proc.icdSec);
    }
}
export function fireWeaponCritProcs(ctx, userId, sheet, targetId) {
    if (sheet.setProcs.length === 0)
        return;
    fire(ctx, userId, sheet.setProcs, "weaponCrit", targetId);
}
export function fireSpellCastProcs(ctx, userId, sheet) {
    if (sheet.setProcs.length === 0)
        return;
    fire(ctx, userId, sheet.setProcs, "spellCast", null);
}
export function consumeNextCastFree(ctx, userId) {
    const list = aurasOf(ctx, userId);
    const index = list.findIndex((aura) => aura.buffStat === "next_cast_free");
    if (index < 0)
        return false;
    list.splice(index, 1);
    syncAuras(ctx, userId);
    return true;
}
