import { seededRng } from "@jgengine/core/random/rng";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createRing } from "@jgengine/core/session/ring";
import { addThreat, despawnMob, spawnMobAt } from "../ai/mobs";
import { applySheet, heroEntityId, aurasOf, classOf, clearAuras, heroOf, setExternalCombatMods, syncAuras, teleportHero, } from "../session/hero";
import { castStore, deadStore, fiestaRecordStore, fiestaStore } from "../session/stores";
import { ARENA_CENTER, ARENA_DAIS, ARENA_DAIS_OBJECT, ARENA_PILLAR_OBJECT, ARENA_PILLARS, ARENA_RETURN_DELAY, ARENA_SPAWNS_A_2V2, ARENA_SPAWNS_B_2V2, ARENA_STUBS, ARENA_WALL_OBJECT, ARENA_WALL_X, ARENA_Z_MAX, ARENA_Z_MIN, augmentById, eligibleAugments, FIESTA_ALLY_CATALOG, FIESTA_ALLY_NAME, FIESTA_COUNTDOWN, FIESTA_ENEMY_MOBS, FIESTA_FIRST_WAVE_AT, FIESTA_MAX_DURATION, FIESTA_POWERUP_FIRST, FIESTA_POWERUP_INTERVAL, FIESTA_POWERUP_MAX, FIESTA_POWERUP_OBJECT, FIESTA_POWERUP_RADIUS, FIESTA_POWERUP_TELEGRAPH, FIESTA_POWERUP_TTL, FIESTA_RING_DPS_PCT, FIESTA_RING_SHRINK_RATE, FIESTA_SCORE_LIMIT, FIESTA_TOTAL_WAVES, FIESTA_WAVE_INTERVAL, fiestaRespawnTime, POWERUPS, ringTargetForWave, tierForWave, } from "./catalog";
const BASE_WALK_SPEED = 7;
const ALLY_SWING_DAMAGE = 26;
const ALLY_SWING_SPEED = 2.2;
const ALLY_HEAL_AMOUNT = 55;
const ALLY_HEAL_EVERY = 10;
const ALLY_MAX_HP = 480;
const ENEMY_WAVE_HP_PCT = 0.12;
const sessionsOf = perContext(() => new Map());
const matchCounterOf = perContext(() => ({ value: 0 }));
export function fiestaStoreKey(userId) {
    return `fiesta:${userId}`;
}
export function fiestaRecordKey(userId) {
    return `arenaFiesta:${userId}`;
}
export function fiestaActive(ctx, userId) {
    return sessionsOf(ctx).has(userId);
}
function say(ctx, userId, text) {
    ctx.scene.entity.floatText({ instanceId: userId, text, kind: "info" });
}
function pop(ctx, session, userId, text, color) {
    session.pop = { text, color, at: ctx.time.now() };
    say(ctx, userId, text);
}
function buildFiestaRing(fightAt) {
    const phases = [];
    for (let wave = 1; wave <= FIESTA_TOTAL_WAVES; wave += 1) {
        const fromRadius = ringTargetForWave(wave - 1);
        const toRadius = ringTargetForWave(wave);
        phases.push({
            startTime: fightAt + FIESTA_FIRST_WAVE_AT + (wave - 1) * FIESTA_WAVE_INTERVAL,
            shrinkDuration: (fromRadius - toRadius) / FIESTA_RING_SHRINK_RATE,
            fromRadius,
            toRadius,
            damagePerSecond: 1,
        });
    }
    return createRing({ center: [ARENA_CENTER[0], ARENA_CENTER[1] + 2], phases });
}
function placeArena(ctx, session) {
    const [cx, cz] = ARENA_CENTER;
    const groundAt = (x, z) => ctx.world.groundHeightAt(x, z);
    const daisY = groundAt(cx + ARENA_DAIS[0], cz + ARENA_DAIS[1]);
    session.arenaObjects.push(ctx.scene.object.place(ARENA_DAIS_OBJECT, cx + ARENA_DAIS[0], daisY, cz + ARENA_DAIS[1], {
        visual: { scale: [ARENA_DAIS[2] * 2, 0.3, ARENA_DAIS[2] * 2], color: "#8a6a3a", opacity: 0.9 },
    }));
    for (const [px, pz] of ARENA_PILLARS) {
        const x = cx + px;
        const z = cz + pz;
        session.arenaObjects.push(ctx.scene.object.place(ARENA_PILLAR_OBJECT, x, groundAt(x, z) + 2, z, {
            visual: { scale: [1.4, 4.5, 1.4], color: "#6d6257" },
        }));
    }
    for (const [sx, sz] of ARENA_STUBS) {
        const x = cx + sx;
        const z = cz + sz;
        session.arenaObjects.push(ctx.scene.object.place(ARENA_PILLAR_OBJECT, x, groundAt(x, z) + 0.6, z, {
            visual: { scale: [1.2, 1.2, 8], color: "#5c5348" },
        }));
    }
    const walls = [
        [cx, cz + ARENA_Z_MIN, [ARENA_WALL_X * 2 + 2, 4, 1.6]],
        [cx, cz + ARENA_Z_MAX, [ARENA_WALL_X * 2 + 2, 4, 1.6]],
        [cx - ARENA_WALL_X, cz + 2, [1.6, 4, ARENA_Z_MAX - ARENA_Z_MIN + 2]],
        [cx + ARENA_WALL_X, cz + 2, [1.6, 4, ARENA_Z_MAX - ARENA_Z_MIN + 2]],
    ];
    for (const [x, z, scale] of walls) {
        session.arenaObjects.push(ctx.scene.object.place(ARENA_WALL_OBJECT, x, groundAt(x, z) + 2, z, {
            visual: { scale: [...scale], color: "#4a4038" },
        }));
    }
}
function spawnEnemy(ctx, session, fighter) {
    const def = FIESTA_ENEMY_MOBS.find((entry) => entry.id === fighter.enemyDefId);
    if (def === undefined)
        return;
    const id = spawnMobAt(ctx, def, fighter.spawn, 20, { noRespawn: true });
    if (session.wave > 0) {
        const hp = ctx.scene.entity.stats.get(id, "health");
        if (hp !== null) {
            const boosted = Math.round(hp.max * (1 + ENEMY_WAVE_HP_PCT * session.wave));
            ctx.scene.entity.stats.set(id, "health", { max: boosted, current: boosted });
        }
    }
    addThreat(ctx, id, ctx.player.userId, 1);
    fighter.entityId = id;
    fighter.respawnAt = null;
}
function spawnAlly(ctx, session, fighter) {
    const [x, z] = fighter.spawn;
    const id = ctx.scene.entity.spawn(FIESTA_ALLY_CATALOG, {
        id: `fiesta-ally:${matchCounterOf(ctx).value}:${fighter.deaths}`,
        position: [x, ctx.world.groundHeightAt(x, z), z],
    });
    ctx.scene.entity.stats.set(id, "health", { max: ALLY_MAX_HP, current: ALLY_MAX_HP });
    ctx.scene.entity.stats.set(id, "level", { current: 20 });
    fighter.entityId = id;
    fighter.respawnAt = null;
}
export function startFiesta(ctx, userId) {
    if (sessionsOf(ctx).has(userId))
        return false;
    const hero = ctx.scene.entity.get(userId);
    if (hero === null || deadStore.read(ctx, userId))
        return false;
    matchCounterOf(ctx).value += 1;
    const now = ctx.time.now();
    const level = ctx.scene.entity.stats.get(userId, "level");
    const xp = ctx.scene.entity.stats.get(userId, "xp");
    const session = {
        status: "countdown",
        startedAt: now,
        fightAt: now + FIESTA_COUNTDOWN,
        scoreA: 0,
        scoreB: 0,
        wave: 0,
        nextWaveAt: now + FIESTA_COUNTDOWN + FIESTA_FIRST_WAVE_AT,
        ring: buildFiestaRing(now + FIESTA_COUNTDOWN),
        nextRingDamageAt: now,
        powerups: [],
        nextPowerupAt: now + FIESTA_COUNTDOWN + FIESTA_POWERUP_FIRST,
        offer: null,
        augments: [],
        playerPowerups: [],
        fighters: [
            { key: "player", name: "You", team: "a", entityId: userId, spawn: ARENA_SPAWNS_A_2V2[0], deaths: 0, respawnAt: null },
            { key: "ally", name: FIESTA_ALLY_NAME, team: "a", entityId: null, spawn: ARENA_SPAWNS_A_2V2[1], deaths: 0, respawnAt: null },
            { key: "enemy1", name: "Botzo the Arcane", team: "b", entityId: null, spawn: ARENA_SPAWNS_B_2V2[0], deaths: 0, respawnAt: null, enemyDefId: "fiesta_bot_botzo" },
            { key: "enemy2", name: "Sneakbot", team: "b", entityId: null, spawn: ARENA_SPAWNS_B_2V2[1], deaths: 0, respawnAt: null, enemyDefId: "fiesta_bot_sneakbot" },
        ],
        returnPos: [hero.position[0], hero.position[2]],
        levelSnapshot: {
            level: level?.current ?? 1,
            xp: xp?.current ?? 0,
            xpMax: xp?.max ?? 400,
        },
        arenaObjects: [],
        firstBlood: false,
        playerStreak: 0,
        playerLastKillAt: -10,
        overAt: null,
        result: null,
        pop: null,
        nextAllyHealAt: now + FIESTA_COUNTDOWN + ALLY_HEAL_EVERY,
        nextAllySwingAt: 0,
        roll: seededRng(`fiesta:${matchCounterOf(ctx).value}`),
    };
    sessionsOf(ctx).set(userId, session);
    placeArena(ctx, session);
    teleportHero(ctx, userId, session.fighters[0].spawn[0], session.fighters[0].spawn[1]);
    applySheet(ctx, userId, { fill: true });
    for (const fighter of session.fighters) {
        if (fighter.key === "ally")
            spawnAlly(ctx, session, fighter);
        else if (fighter.enemyDefId !== undefined)
            spawnEnemy(ctx, session, fighter);
    }
    pop(ctx, session, userId, "Welcome to the 2v2 FIESTA! Score takedowns, grab augments, survive the ring!", "#ff3df0");
    sync(ctx, userId);
    return true;
}
function applyAugments(ctx, userId, session) {
    const mods = {
        meleeDmgPct: 0,
        spellDmgPct: 0,
        healPct: 0,
        maxHpPct: 0,
        critAdd: 0,
        armorAdd: 0,
        lifestealPct: 0,
    };
    for (const id of session.augments) {
        const aug = augmentById(id);
        if (aug === null)
            continue;
        mods.meleeDmgPct += aug.meleeDmgPct ?? 0;
        mods.spellDmgPct += aug.spellDmgPct ?? 0;
        mods.healPct += aug.healPct ?? 0;
        mods.maxHpPct += aug.maxHpPct ?? 0;
        mods.critAdd += aug.crit ?? 0;
        mods.armorAdd += aug.armor ?? 0;
        mods.lifestealPct += aug.lifestealPct ?? 0;
    }
    setExternalCombatMods(ctx, userId, mods);
    applySheet(ctx, userId);
    updatePlayerSpeed(ctx, userId, session);
}
function updatePlayerSpeed(ctx, userId, session) {
    let pct = 0;
    for (const id of session.augments)
        pct += augmentById(id)?.moveSpeedPct ?? 0;
    const now = ctx.time.now();
    for (const active of session.playerPowerups) {
        if (now < active.expiresAt)
            pct += active.def.moveSpeedPct ?? 0;
    }
    ctx.scene.entity.update(userId, { movement: { walkSpeed: BASE_WALK_SPEED * (1 + pct) } });
}
export function pickAugment(ctx, userId, augmentId) {
    const session = sessionsOf(ctx).get(userId);
    if (session === undefined || session.offer === null || !session.offer.includes(augmentId))
        return false;
    const aug = augmentById(augmentId);
    if (aug === null)
        return false;
    session.offer = null;
    session.augments.push(augmentId);
    applyAugments(ctx, userId, session);
    pop(ctx, session, userId, aug.name.toUpperCase(), "#32e0ff");
    sync(ctx, userId);
    return true;
}
export function leaveFiesta(ctx, userId) {
    const session = sessionsOf(ctx).get(userId);
    if (session === undefined)
        return false;
    if (session.status !== "over") {
        session.result = "defeat";
        recordResult(ctx, userId, "defeat");
    }
    cleanupAndReturn(ctx, userId, session);
    return true;
}
function scoreFor(session, team) {
    return team === "a" ? session.scoreA : session.scoreB;
}
function addScore(session, team, amount) {
    if (team === "a")
        session.scoreA += amount;
    else
        session.scoreB += amount;
}
export function onFiestaEntityDied(ctx, evt) {
    const userId = ctx.player.userId;
    const session = sessionsOf(ctx).get(userId);
    if (session === undefined || session.status === "over")
        return false;
    const now = ctx.time.now();
    const elapsed = now - session.fightAt;
    if (evt.instanceId === userId) {
        const fighter = session.fighters[0];
        fighter.deaths += 1;
        fighter.respawnAt = now + fiestaRespawnTime(fighter.deaths, elapsed);
        session.playerStreak = 0;
        addScore(session, "b", 1);
        clearAuras(ctx, userId);
        const hero = heroOf(ctx, userId);
        if (hero !== null) {
            hero.casting = null;
            hero.autoAttack = false;
        }
        castStore.clear(ctx, userId);
        checkWin(ctx, userId, session);
        sync(ctx, userId);
        return true;
    }
    const fighter = session.fighters.find((entry) => entry.entityId === evt.instanceId);
    if (fighter === undefined)
        return false;
    fighter.entityId = null;
    fighter.deaths += 1;
    fighter.respawnAt = now + fiestaRespawnTime(fighter.deaths, elapsed);
    clearAuras(ctx, evt.instanceId);
    if (fighter.team === "b") {
        let points = 1;
        if (evt.reason.kind === "player_kill") {
            for (const id of session.augments)
                points += augmentById(id)?.scorePerKill ?? 0;
            const rapid = now - session.playerLastKillAt <= 4;
            session.playerLastKillAt = now;
            session.playerStreak += 1;
            if (!session.firstBlood) {
                session.firstBlood = true;
                pop(ctx, session, userId, "FIRST BLOOD!", "#ff3df0");
            }
            else if (rapid) {
                pop(ctx, session, userId, "DOUBLE KILL!", "#ffae00");
            }
            else if (session.playerStreak >= 3) {
                pop(ctx, session, userId, `${session.playerStreak}× SPREE!`, "#ff7a1a");
            }
            else {
                pop(ctx, session, userId, "TAKEDOWN!", "#ffd24a");
            }
        }
        else if (!session.firstBlood) {
            session.firstBlood = true;
            pop(ctx, session, userId, "FIRST BLOOD!", "#ff3df0");
        }
        else {
            pop(ctx, session, userId, "TAKEDOWN!", "#ffd24a");
        }
        addScore(session, "a", points);
    }
    else {
        addScore(session, "b", 1);
    }
    checkWin(ctx, userId, session);
    sync(ctx, userId);
    return true;
}
function checkWin(ctx, userId, session) {
    if (session.status === "over")
        return;
    if (session.scoreA >= FIESTA_SCORE_LIMIT || session.scoreB >= FIESTA_SCORE_LIMIT) {
        endMatch(ctx, userId, session);
    }
}
function endMatch(ctx, userId, session) {
    session.status = "over";
    session.overAt = ctx.time.now();
    session.result =
        session.scoreA === session.scoreB ? "draw" : session.scoreA > session.scoreB ? "victory" : "defeat";
    recordResult(ctx, userId, session.result);
    pop(ctx, session, userId, session.result === "victory" ? "VICTORY!" : session.result === "defeat" ? "DEFEAT" : "DRAW", session.result === "victory" ? "#7fdc4f" : session.result === "defeat" ? "#ff7a6a" : "#d8cba0");
    say(ctx, userId, "The bout is decided. Returning to the world…");
}
function recordResult(ctx, userId, result) {
    if (result === "draw")
        return;
    fiestaRecordStore.update(ctx, userId, (record) => result === "victory"
        ? { wins: record.wins + 1, losses: record.losses }
        : { wins: record.wins, losses: record.losses + 1 });
}
function cleanupAndReturn(ctx, userId, session) {
    for (const fighter of session.fighters) {
        if (fighter.key === "player" || fighter.entityId === null)
            continue;
        if (fighter.key === "ally") {
            if (ctx.scene.entity.get(fighter.entityId) !== null)
                ctx.scene.entity.despawn(fighter.entityId);
        }
        else {
            despawnMob(ctx, fighter.entityId);
        }
    }
    for (const powerup of session.powerups)
        ctx.scene.object.remove(powerup.objectId);
    for (const objectId of session.arenaObjects)
        ctx.scene.object.remove(objectId);
    sessionsOf(ctx).delete(userId);
    setExternalCombatMods(ctx, userId, null);
    fiestaStore.clear(ctx, userId);
    const alive = ctx.scene.entity.get(userId) !== null;
    if (!alive) {
        const [x, z] = session.returnPos;
        ctx.scene.entity.spawn(heroEntityId(ctx, userId), {
            id: userId,
            position: [x, ctx.world.groundHeightAt(x, z), z],
        });
        ctx.scene.entity.stats.set(userId, "level", { current: session.levelSnapshot.level });
        ctx.scene.entity.stats.set(userId, "xp", {
            current: session.levelSnapshot.xp,
            max: session.levelSnapshot.xpMax,
        });
    }
    else {
        teleportHero(ctx, userId, session.returnPos[0], session.returnPos[1]);
    }
    ctx.scene.entity.update(userId, { movement: { walkSpeed: BASE_WALK_SPEED } });
    clearAuras(ctx, userId);
    applySheet(ctx, userId, { fill: true });
}
function respawnPlayer(ctx, userId, session) {
    const fighter = session.fighters[0];
    const [x, z] = fighter.spawn;
    ctx.scene.entity.spawn(heroEntityId(ctx, userId), {
        id: userId,
        position: [x, ctx.world.groundHeightAt(x, z), z],
    });
    ctx.scene.entity.stats.set(userId, "level", { current: session.levelSnapshot.level });
    ctx.scene.entity.stats.set(userId, "xp", {
        current: session.levelSnapshot.xp,
        max: session.levelSnapshot.xpMax,
    });
    applySheet(ctx, userId, { fill: true });
    updatePlayerSpeed(ctx, userId, session);
    fighter.respawnAt = null;
    pop(ctx, session, userId, "BACK IN!", "#7fdc4f");
}
function spawnPowerup(ctx, session) {
    const def = POWERUPS[Math.floor(session.roll() * POWERUPS.length)];
    const angle = session.roll() * Math.PI * 2;
    const ringNow = session.ring.at(ctx.time.now()).radius;
    const radius = (0.25 + session.roll() * 0.6) * Math.max(3, ringNow - 2);
    const x = ARENA_CENTER[0] + Math.sin(angle) * radius;
    const z = ARENA_CENTER[1] + 2 + Math.cos(angle) * radius;
    const now = ctx.time.now();
    const objectId = ctx.scene.object.place(FIESTA_POWERUP_OBJECT, x, ctx.world.groundHeightAt(x, z) + 1, z, {
        visual: { scale: 0.9, color: def.color, opacity: 0.9 },
    });
    session.powerups.push({
        objectId,
        def,
        x,
        z,
        grabbableAt: now + FIESTA_POWERUP_TELEGRAPH,
        expiresAt: now + FIESTA_POWERUP_TELEGRAPH + FIESTA_POWERUP_TTL,
    });
}
function grabPowerup(ctx, userId, session, spawn) {
    const now = ctx.time.now();
    session.playerPowerups = session.playerPowerups.filter((entry) => now < entry.expiresAt);
    session.playerPowerups.push({ def: spawn.def, expiresAt: now + spawn.def.duration });
    if (spawn.def.attackPower !== undefined) {
        const list = aurasOf(ctx, userId);
        const auraId = `powerup:${spawn.def.id}`;
        const existing = list.findIndex((aura) => aura.id === auraId);
        if (existing >= 0)
            list.splice(existing, 1);
        list.push({
            id: auraId,
            name: spawn.def.name,
            icon: "buffArrow",
            school: "nature",
            kind: "buff",
            sourceId: userId,
            amount: 0,
            tickEvery: 999,
            nextTickAt: now + 999,
            expiresAt: now + spawn.def.duration,
            buffStat: "attackPower",
            buffAmount: spawn.def.attackPower,
        });
        syncAuras(ctx, userId);
        applySheet(ctx, userId);
    }
    updatePlayerSpeed(ctx, userId, session);
    pop(ctx, session, userId, spawn.def.name.toUpperCase(), spawn.def.color);
}
function tickAlly(ctx, userId, session, dt) {
    const ally = session.fighters[1];
    if (ally.entityId === null)
        return;
    const self = ctx.scene.entity.get(ally.entityId);
    if (self === null)
        return;
    const now = ctx.time.now();
    const ringSample = session.ring.at(now);
    const distCenter = Math.hypot(self.position[0] - ringSample.center[0], self.position[2] - ringSample.center[1]);
    if (distCenter > ringSample.radius - 2.5) {
        const next = ctx.scene.entity.moveToward(ally.entityId, [ARENA_CENTER[0], self.position[1], ARENA_CENTER[1] + 2], { speed: 7, dt, stopDistance: 0 });
        if (next !== null) {
            ctx.scene.entity.setPose(ally.entityId, {
                position: [next[0], ctx.world.groundHeightAt(next[0], next[2]), next[2]],
                dt,
            });
        }
        return;
    }
    if (now >= session.nextAllyHealAt) {
        session.nextAllyHealAt = now + ALLY_HEAL_EVERY;
        const playerHp = ctx.scene.entity.stats.get(userId, "health");
        if (playerHp !== null && playerHp.max > 0 && playerHp.current / playerHp.max < 0.65) {
            ctx.scene.entity.effect({
                from: ally.entityId,
                to: userId,
                effect: "heal",
                via: { amount: -ALLY_HEAL_AMOUNT },
            });
            ctx.scene.entity.floatText({ instanceId: ally.entityId, text: "Sacrament!", kind: "info" });
        }
    }
    let target = null;
    let best = Number.POSITIVE_INFINITY;
    for (const fighter of session.fighters) {
        if (fighter.team !== "b" || fighter.entityId === null)
            continue;
        const enemy = ctx.scene.entity.get(fighter.entityId);
        if (enemy === null)
            continue;
        const dist = Math.hypot(enemy.position[0] - self.position[0], enemy.position[2] - self.position[2]);
        if (dist < best) {
            best = dist;
            target = fighter;
        }
    }
    if (target === null || target.entityId === null)
        return;
    if (best > 2.6) {
        const next = ctx.scene.entity.moveToward(ally.entityId, target.entityId, {
            speed: 7,
            dt,
            stopDistance: 2.2,
        });
        if (next !== null) {
            ctx.scene.entity.setPose(ally.entityId, {
                position: [next[0], ctx.world.groundHeightAt(next[0], next[2]), next[2]],
                dt,
            });
        }
    }
    else if (now >= session.nextAllySwingAt) {
        session.nextAllySwingAt = now + ALLY_SWING_SPEED;
        ctx.scene.entity.effect({
            from: ally.entityId,
            to: target.entityId,
            effect: "damage",
            via: { amount: ALLY_SWING_DAMAGE },
        });
        addThreat(ctx, target.entityId, ally.entityId, ALLY_SWING_DAMAGE);
    }
}
function ringDamage(ctx, session, now) {
    for (const fighter of session.fighters) {
        if (fighter.entityId === null)
            continue;
        const entity = ctx.scene.entity.get(fighter.entityId);
        if (entity === null)
            continue;
        if (!session.ring.isOutside(now, [entity.position[0], entity.position[2]]))
            continue;
        const hp = ctx.scene.entity.stats.get(fighter.entityId, "health");
        if (hp === null || hp.max <= 0)
            continue;
        const amount = Math.max(1, Math.round(hp.max * FIESTA_RING_DPS_PCT * 0.5));
        ctx.scene.entity.effect({
            from: fighter.entityId,
            to: fighter.entityId,
            effect: "damage",
            via: { amount },
        });
    }
}
export function tickFiesta(ctx, userId, dt) {
    const session = sessionsOf(ctx).get(userId);
    if (session === undefined)
        return;
    const now = ctx.time.now();
    if (session.status === "over") {
        if (session.overAt !== null && now >= session.overAt + ARENA_RETURN_DELAY) {
            cleanupAndReturn(ctx, userId, session);
        }
        else {
            sync(ctx, userId);
        }
        return;
    }
    if (session.status === "countdown") {
        if (now >= session.fightAt) {
            session.status = "playing";
            pop(ctx, session, userId, "FIESTA — GO!", "#ff5a3c");
        }
        sync(ctx, userId);
        return;
    }
    if (now - session.fightAt >= FIESTA_MAX_DURATION) {
        endMatch(ctx, userId, session);
        sync(ctx, userId);
        return;
    }
    if (session.wave < FIESTA_TOTAL_WAVES && now >= session.nextWaveAt) {
        session.wave += 1;
        session.nextWaveAt = now + FIESTA_WAVE_INTERVAL;
        const classId = classOf(ctx, userId)?.id ?? "warrior";
        const pool = eligibleAugments(tierForWave(session.wave), classId, session.augments);
        const offer = [];
        while (offer.length < 3 && pool.length > 0) {
            const index = Math.floor(session.roll() * pool.length);
            offer.push(pool.splice(index, 1)[0].id);
        }
        session.offer = offer.length > 0 ? offer : null;
        pop(ctx, session, userId, "AUGMENTS!", "#ffd24a");
        for (const fighter of session.fighters) {
            if (fighter.team !== "b" || fighter.entityId === null)
                continue;
            const hp = ctx.scene.entity.stats.get(fighter.entityId, "health");
            if (hp !== null) {
                const boosted = Math.round(hp.max * (1 + ENEMY_WAVE_HP_PCT));
                ctx.scene.entity.stats.set(fighter.entityId, "health", {
                    max: boosted,
                    current: Math.min(boosted, hp.current + Math.round(hp.max * ENEMY_WAVE_HP_PCT)),
                });
            }
        }
    }
    if (now >= session.nextRingDamageAt) {
        session.nextRingDamageAt = now + 0.5;
        ringDamage(ctx, session, now);
    }
    const liveCount = session.powerups.length;
    if (now >= session.nextPowerupAt && liveCount < FIESTA_POWERUP_MAX) {
        session.nextPowerupAt = now + FIESTA_POWERUP_INTERVAL;
        spawnPowerup(ctx, session);
    }
    const player = ctx.scene.entity.get(userId);
    session.powerups = session.powerups.filter((spawn) => {
        if (now >= spawn.expiresAt) {
            ctx.scene.object.remove(spawn.objectId);
            return false;
        }
        if (player !== null && now >= spawn.grabbableAt) {
            const dist = Math.hypot(player.position[0] - spawn.x, player.position[2] - spawn.z);
            if (dist <= FIESTA_POWERUP_RADIUS) {
                ctx.scene.object.remove(spawn.objectId);
                grabPowerup(ctx, userId, session, spawn);
                return false;
            }
        }
        return true;
    });
    const before = session.playerPowerups.length;
    session.playerPowerups = session.playerPowerups.filter((entry) => now < entry.expiresAt);
    if (session.playerPowerups.length !== before)
        updatePlayerSpeed(ctx, userId, session);
    for (const fighter of session.fighters) {
        if (fighter.respawnAt === null || now < fighter.respawnAt)
            continue;
        if (fighter.key === "player")
            respawnPlayer(ctx, userId, session);
        else if (fighter.key === "ally")
            spawnAlly(ctx, session, fighter);
        else
            spawnEnemy(ctx, session, fighter);
    }
    tickAlly(ctx, userId, session, dt);
    sync(ctx, userId);
}
function sync(ctx, userId) {
    const session = sessionsOf(ctx).get(userId);
    if (session === undefined) {
        fiestaStore.clear(ctx, userId);
        return;
    }
    const now = ctx.time.now();
    const fighters = session.fighters.map((fighter) => {
        const hp = fighter.entityId === null ? null : ctx.scene.entity.stats.get(fighter.entityId, "health");
        return {
            name: fighter.name,
            team: fighter.team,
            hp: hp?.current ?? 0,
            hpMax: hp?.max ?? 1,
            dead: fighter.entityId === null || (hp !== null && hp.current <= 0),
            respawnIn: fighter.respawnAt === null ? 0 : Math.max(0, fighter.respawnAt - now),
        };
    });
    const playerEntity = ctx.scene.entity.get(userId);
    const inRing = playerEntity === null
        ? true
        : !session.ring.isOutside(now, [playerEntity.position[0], playerEntity.position[2]]);
    const view = {
        active: true,
        status: session.status,
        countdown: Math.max(0, Math.ceil(session.fightAt - now)),
        timeLeft: Math.max(0, FIESTA_MAX_DURATION - Math.max(0, now - session.fightAt)),
        scoreA: session.scoreA,
        scoreB: session.scoreB,
        scoreLimit: FIESTA_SCORE_LIMIT,
        ringRadius: session.ring.at(now).radius,
        inRing,
        fighters,
        offer: session.offer === null
            ? null
            : session.offer.map((id) => {
                const aug = augmentById(id);
                return {
                    id,
                    name: aug?.name ?? id,
                    description: aug?.description ?? "",
                    tier: aug?.tier ?? "silver",
                };
            }),
        augments: session.augments.map((id) => ({ id, name: augmentById(id)?.name ?? id })),
        result: session.result,
        pop: session.pop !== null && now - session.pop.at <= 1.4 ? session.pop : null,
        playerRespawnIn: session.fighters[0].respawnAt === null ? 0 : Math.max(0, session.fighters[0].respawnAt - now),
    };
    fiestaStore.write(ctx, userId, view);
}
