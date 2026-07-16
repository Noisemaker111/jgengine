import { pickWeighted } from "@jgengine/core/random/pick";
import { seededRng } from "@jgengine/core/random/rng";
import { perContext } from "@jgengine/core/runtime/perContext";
import { sceneMarkerXZ } from "../../editorLayers";
import { mobById } from "../entities/enemies/catalog";
import { itemDefById } from "../items/catalog";
import { spawnMobAt } from "../ai/mobs";
export const WORLD_BOSS_MOB_ID = "thunzharr_waking_peak";
const STORMCRAG = sceneMarkerXZ("landmark:stormcrag");
const WORLD_BOSS_HP = 40000;
const RESPAWN_SEC = 240;
const LOCKOUT_SEC = 1800;
const lootRng = seededRng("claudecraft-worldboss");
const worldBossOf = perContext(() => ({ currentBossId: null, nextSpawnAt: 0 }));
export function isWorldBoss(ctx, instanceId) {
    const state = worldBossOf(ctx);
    return state.currentBossId !== null && instanceId === state.currentBossId;
}
function lockKey(userId) {
    return `worldboss:lock:${userId}`;
}
function announce(ctx, text) {
    const userId = ctx.player.userId;
    if (ctx.scene.entity.get(userId) === null)
        return;
    ctx.scene.entity.floatText({ instanceId: userId, text, kind: "info", scale: 1.4 });
}
function spawnThunzharr(ctx) {
    const def = mobById(WORLD_BOSS_MOB_ID);
    if (def === null)
        return;
    const id = spawnMobAt(ctx, def, STORMCRAG, def.maxLevel, { noRespawn: true });
    ctx.scene.entity.stats.set(id, "health", { max: WORLD_BOSS_HP, current: WORLD_BOSS_HP });
    worldBossOf(ctx).currentBossId = id;
    announce(ctx, `${def.name} rises over Thornpeak Heights!`);
}
export function tickWorldBoss(ctx) {
    const now = ctx.time.now();
    const state = worldBossOf(ctx);
    if (state.currentBossId !== null) {
        if (ctx.scene.entity.get(state.currentBossId) === null) {
            state.currentBossId = null;
            state.nextSpawnAt = now + RESPAWN_SEC;
        }
        return;
    }
    if (now >= state.nextSpawnAt)
        spawnThunzharr(ctx);
}
function pickGroup(entries, rng) {
    const total = entries.reduce((sum, entry) => sum + entry.chance, 0);
    if (total <= 0 || rng() >= total)
        return null;
    const picked = pickWeighted(rng, entries, (entry) => entry.chance);
    return picked?.itemId ?? entries[entries.length - 1]?.itemId ?? null;
}
export function rollWorldBossLoot(rng) {
    const def = mobById(WORLD_BOSS_MOB_ID);
    if (def === null)
        return [];
    const drops = [];
    for (const entry of def.drops) {
        if (entry.itemId !== undefined && entry.chance >= 1)
            drops.push({ item: entry.itemId, count: 1 });
    }
    const gear = def.drops.filter((entry) => entry.itemId !== undefined && entry.chance < 1);
    const gloves = gear.filter((entry) => itemDefById(entry.itemId)?.slot === "gloves");
    const belts = gear.filter((entry) => itemDefById(entry.itemId)?.slot === "waist");
    const glove = pickGroup(gloves, rng);
    if (glove !== null)
        drops.push({ item: glove, count: 1 });
    else {
        const belt = pickGroup(belts, rng);
        if (belt !== null)
            drops.push({ item: belt, count: 1 });
    }
    return drops;
}
export function onWorldBossKilled(ctx, instanceId, userId) {
    const state = worldBossOf(ctx);
    if (state.currentBossId !== instanceId)
        return;
    state.currentBossId = null;
    const now = ctx.time.now();
    state.nextSpawnAt = now + RESPAWN_SEC;
    const expiry = ctx.game.store.get(lockKey(userId)) ?? 0;
    if (now < expiry) {
        announce(ctx, "You have already claimed Thunzharr's spoils this cycle.");
        return;
    }
    ctx.game.loot.grantToPlayer(userId, rollWorldBossLoot(lootRng), WORLD_BOSS_MOB_ID);
    ctx.game.store.set(lockKey(userId), now + LOCKOUT_SEC);
}
export function worldBossLockedOut(ctx, userId) {
    const expiry = ctx.game.store.get(lockKey(userId)) ?? 0;
    return ctx.time.now() < expiry;
}
export function resetWorldBoss(ctx) {
    const state = worldBossOf(ctx);
    state.currentBossId = null;
    state.nextSpawnAt = 0;
}
