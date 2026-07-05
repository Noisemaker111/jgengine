import { createDeathSystem, deathReasonFromEffect } from "../combat/death";
import { createEffectSystem, } from "../combat/effects";
import { createProjectileSystem } from "../combat/projectiles";
import { createCommandRegistry, } from "../commands/commandRegistry";
import { balance as walletBalance, canAfford as walletCanAfford, charge as walletCharge, chargeAll as walletChargeAll, createEmptyWallet, grant as walletGrant, } from "../economy/wallet";
import { createGameEvents } from "../game/events";
import { createGameFeed } from "../game/feed";
import { createLeaderboard } from "../game/leaderboard";
import { createLoadouts } from "../game/loadout";
import { createLootRegistry, grantDrops } from "../game/lootTable";
import { createQuestJournal } from "../game/quest";
import { createSocial } from "../game/social";
import { createTradeSystem } from "../game/trade";
import { createUnlocks } from "../game/unlocks";
import { createInventorySet, putItem, } from "../inventory/inventoryModel";
import { createItemUse, } from "../item/use";
import { createWeaponStats } from "../item/weapon";
import { createPoseState } from "../movement/poseState";
import { createEntityStatsApi, seedPoolStats, setPoolStat, } from "../scene/entityStats";
import { createObjectStore } from "../scene/objectStore";
import { createSpatialApi } from "../scene/spatial";
import { createTargeting } from "../scene/targeting";
import { createStats } from "../stats/statModifiers";
import { createChangeSignal, notifyAfter } from "../store/changeSignal";
export function createGameContext(options) {
    const { definition, content, player } = options;
    const now = options.now ?? Date.now;
    const signal = createChangeSignal();
    const entities = definition.scene;
    const objects = createObjectStore();
    entities.subscribe(signal.notify);
    objects.subscribe(signal.notify);
    const statsByInstance = new Map();
    const entityStats = notifyAfter(createEntityStatsApi((instanceId) => statsByInstance.get(instanceId)), ["set", "delta"], signal.notify);
    function ensureInstanceStats(instanceId) {
        let map = statsByInstance.get(instanceId);
        if (map === undefined) {
            map = {};
            statsByInstance.set(instanceId, map);
        }
        return map;
    }
    function catalogEntry(instanceId) {
        const entity = entities.get(instanceId);
        return entity === null ? undefined : content.entityById?.(entity.name);
    }
    const spatial = createSpatialApi({
        resolvePosition: (instanceId) => entities.get(instanceId)?.position,
        candidates: () => entities.list().map((entity) => entity.id),
    });
    const targeting = notifyAfter(createTargeting({
        candidates: () => entities.list().map((entity) => entity.id),
        classify(_fromId, toId) {
            const role = catalogEntry(toId)?.role;
            return role === "enemy" || role === "hostile" ? "hostile" : "friendly";
        },
        distance: (fromId, toId) => spatial.distance(fromId, toId),
    }), ["setTarget", "cycleTarget"], signal.notify);
    const combatSpatial = {
        inRadius: (center, radius) => spatial.inRadius(center, radius),
        hasLineOfSight: (from, to) => typeof from === "string" ? spatial.hasLineOfSight(from, to) : entities.get(to) !== null,
        positionOf: (instanceId) => entities.get(instanceId)?.position,
    };
    const weapon = createWeaponStats((itemId) => content.itemById?.(itemId));
    const rawEvents = createGameEvents();
    const events = {
        on: rawEvents.on,
        subscribe: rawEvents.subscribe,
        emit(name, payload) {
            rawEvents.emit(name, payload);
            signal.notify();
        },
    };
    const feed = createGameFeed();
    const lootRegistry = createLootRegistry();
    const unlocks = notifyAfter(createUnlocks(), ["grant", "hydrate"], signal.notify);
    const rawSocial = createSocial({ events, now });
    const social = {
        friends: notifyAfter(rawSocial.friends, ["request", "accept", "remove", "block", "hydrate"], signal.notify),
        party: notifyAfter(rawSocial.party, ["invite", "accept", "kick", "leave", "promote"], signal.notify),
        presence: rawSocial.presence,
    };
    const leaderboard = notifyAfter(createLeaderboard(), ["increment", "hydrate"], signal.notify);
    const playerStats = createStats({});
    const pose = createPoseState((instanceId) => catalogEntry(instanceId)?.movement);
    const commandRegistry = createCommandRegistry();
    const itemUse = createItemUse((itemId) => content.itemById?.(itemId)?.use);
    const inventoryDeclarations = definition.inventories ?? {};
    const inventoryIds = Object.keys(inventoryDeclarations);
    const layouts = {};
    for (const [inventoryId, declaration] of Object.entries(inventoryDeclarations)) {
        layouts[inventoryId] = { slots: declaration.slots, accepts: declaration.accepts };
    }
    const traits = Object.values(inventoryDeclarations).find((declaration) => declaration.traits !== undefined)?.traits ?? { stackLimit: () => Number.POSITIVE_INFINITY };
    const inventory = notifyAfter(createInventorySet(layouts, traits), ["put", "take", "move", "replaceState"], signal.notify);
    const wallets = new Map();
    const walletOf = (userId) => wallets.get(userId) ?? createEmptyWallet();
    const economy = {
        balance: (userId, currencyId) => walletBalance(walletOf(userId), currencyId),
        grant(userId, currencyId, amount) {
            wallets.set(userId, walletGrant(walletOf(userId), currencyId, amount));
            signal.notify();
        },
        charge(userId, currencyId, amount) {
            const result = walletCharge(walletOf(userId), currencyId, amount);
            if (result.status === "rejected")
                return { reason: result.reason };
            wallets.set(userId, result.state);
            signal.notify();
            return null;
        },
    };
    function putIntoAnyInventory(itemId, count) {
        for (const inventoryId of inventoryIds) {
            if (inventory.put(inventoryId, itemId, count).status === "ok")
                return;
        }
    }
    const loot = {
        register: lootRegistry.register,
        has: lootRegistry.has,
        roll: lootRegistry.roll,
        grantToPlayer(userId, drops, source) {
            grantDrops(drops, {
                putItem: (itemId, count) => putIntoAnyInventory(itemId, count),
                grantCurrency: (currencyId, amount) => economy.grant(userId, currencyId, amount),
            });
            const event = { userId, drops };
            if (source !== undefined)
                event.source = source;
            events.emit("loot.granted", event);
        },
    };
    const trade = createTradeSystem({
        resolveTrade: (itemId) => content.itemById?.(itemId)?.trade,
        wallet: {
            canAfford: (costs) => (walletCanAfford(walletOf(player.userId), costs) ? null : "insufficient-funds"),
            charge(costs) {
                const result = walletChargeAll(walletOf(player.userId), costs);
                if (result.status === "ok") {
                    wallets.set(player.userId, result.state);
                    signal.notify();
                }
            },
            grant(gains) {
                for (const [currencyId, amount] of Object.entries(gains)) {
                    economy.grant(player.userId, currencyId, amount);
                }
            },
        },
        inventory: {
            put(inventoryId, itemId, count) {
                if (layouts[inventoryId] === undefined)
                    return { reason: `unknown inventory "${inventoryId}"` };
                const result = inventory.put(inventoryId, itemId, count);
                return result.status === "ok" ? null : { reason: result.reason };
            },
            take(inventoryId, itemId, count) {
                if (layouts[inventoryId] === undefined)
                    return { reason: `unknown inventory "${inventoryId}"` };
                const result = inventory.take(inventoryId, itemId, count);
                return result.status === "ok" ? null : { reason: result.reason };
            },
            count: (inventoryId, itemId) => inventory.count(inventoryId, itemId),
        },
    });
    function seedUserPool(userId, statId, pool) {
        const map = ensureInstanceStats(userId);
        const next = setPoolStat(map, statId, pool);
        map[statId] = next[statId];
    }
    const rawQuest = createQuestJournal({
        events,
        rewards: {
            grantXp(userId, amount) {
                const existing = ensureInstanceStats(userId)["xp"];
                const current = (existing?.current ?? 0) + amount;
                seedUserPool(userId, "xp", { current, max: Math.max(existing?.max ?? 0, current) });
            },
            grantEconomy: (userId, currencyId, amount) => economy.grant(userId, currencyId, amount),
            grantItem(userId, inventoryId, itemId, count) {
                if (userId !== player.userId)
                    return { reason: `unknown user "${userId}"` };
                if (layouts[inventoryId] === undefined)
                    return { reason: `unknown inventory "${inventoryId}"` };
                const result = inventory.put(inventoryId, itemId, count);
                return result.status === "ok" ? null : { reason: result.reason };
            },
            grantUnlock: (userId, unlockId) => unlocks.grant(userId, unlockId),
        },
        hasUnlock: (userId, id) => unlocks.has(userId, id),
    });
    const quest = notifyAfter(rawQuest, ["accept", "abandon", "progress", "turnIn", "grant", "revoke", "hydrate"], signal.notify);
    const loadouts = notifyAfter(createLoadouts({
        inventory: {
            begin() {
                const staged = new Map();
                return {
                    put(inventoryId, itemId, count, slot) {
                        const layout = layouts[inventoryId];
                        if (layout === undefined)
                            return { reason: `unknown inventory "${inventoryId}"` };
                        const state = staged.get(inventoryId) ?? inventory.state(inventoryId);
                        const result = putItem(state, layout, traits, itemId, count, slot === undefined ? undefined : { slot });
                        if (result.status === "rejected")
                            return { reason: result.reason };
                        staged.set(inventoryId, result.state);
                        return null;
                    },
                    commit() {
                        for (const [inventoryId, state] of staged)
                            inventory.replaceState(inventoryId, state);
                    },
                };
            },
        },
        stats: { seed: seedUserPool },
        economy: { grant: economy.grant },
        unlocks: { grant: unlocks.grant },
    }), ["applyLoadout"], signal.notify);
    function spawnEntity(name, spawnOptions) {
        const entry = content.entityById?.(name);
        const walkSpeed = spawnOptions?.movement?.walkSpeed ?? entry?.movement?.walkSpeed;
        const options = walkSpeed === undefined
            ? spawnOptions
            : { ...spawnOptions, movement: { ...spawnOptions?.movement, walkSpeed } };
        const instanceId = entities.spawn(name, options);
        death.revive(instanceId);
        statsByInstance.set(instanceId, entry?.stats === undefined ? {} : seedPoolStats(entry.stats));
        return instanceId;
    }
    function despawnEntity(instanceId) {
        const existed = entities.despawn(instanceId);
        statsByInstance.delete(instanceId);
        targeting.clearAll(instanceId);
        pose.clear(instanceId);
        return existed;
    }
    const death = createDeathSystem({
        resolveOnDeath: (instanceId) => catalogEntry(instanceId)?.onDeath,
        resolveIdentity(instanceId) {
            const entity = entities.get(instanceId);
            if (entity === null)
                return null;
            return {
                catalogId: entity.name,
                position: [entity.position[0], entity.position[1], entity.position[2]],
            };
        },
        loot: { roll: (tableId) => (lootRegistry.has(tableId) ? lootRegistry.roll(tableId) : []) },
        events,
        runCommand(name, args) {
            commandRegistry.run(ctx, name, args);
        },
        despawn(instanceId) {
            despawnEntity(instanceId);
        },
    });
    const effects = notifyAfter(createEffectSystem({
        resolveReceive: (instanceId) => catalogEntry(instanceId)?.receive,
        resolveStats: (instanceId) => statsByInstance.get(instanceId),
        getStat: weapon.getStat,
        spatial: combatSpatial,
        onLethal(instanceId, lethalCtx) {
            const catalogId = entities.get(instanceId)?.name;
            const reason = deathReasonFromEffect({
                ...lethalCtx,
                userIdOf: (id) => (id === player.userId ? player.userId : undefined),
            });
            const resolution = death.resolveDeath(instanceId, reason);
            if (resolution.status === "resolved" &&
                resolution.drops.length > 0 &&
                reason.kind === "player_kill" &&
                reason.killerUserId === player.userId) {
                loot.grantToPlayer(player.userId, resolution.drops, catalogId);
            }
        },
    }), ["applyEffect"], signal.notify);
    const projectiles = notifyAfter(createProjectileSystem({
        effects,
        spatial: combatSpatial,
        getStat: weapon.getStat,
        now,
    }), ["fireProjectile", "settleProjectile"], signal.notify);
    const ctx = {
        scene: {
            object: objects,
            entity: {
                spawn: spawnEntity,
                despawn: despawnEntity,
                setPose: entities.setPose,
                get: entities.get,
                list: entities.list,
                stats: entityStats,
                setTarget: targeting.setTarget,
                getTarget: targeting.getTarget,
                cycleTarget: targeting.cycleTarget,
                canReceive: effects.canReceive,
                preview: effects.preview,
                effect: effects.applyEffect,
                willHitProjectile: projectiles.willHitProjectile,
                fireProjectile: projectiles.fireProjectile,
                settleProjectile: projectiles.settleProjectile,
                distance: spatial.distance,
                inRadius: spatial.inRadius,
                hasLineOfSight: spatial.hasLineOfSight,
                queryArc: spatial.queryArc,
                moveToward: spatial.moveToward,
            },
        },
        game: {
            commands: {
                define: commandRegistry.define,
                has: commandRegistry.has,
                names: commandRegistry.names,
                run(name, input) {
                    const result = commandRegistry.run(ctx, name, input);
                    signal.notify();
                    return result;
                },
            },
            events,
            feed: {
                bind: (action) => feed.bind(action, events),
                push(action, entry) {
                    feed.push(action, entry);
                    signal.notify();
                },
                recent: feed.recent,
                subscribe: feed.subscribe,
                snapshot: feed.snapshot,
                hydrate(data) {
                    feed.hydrate(data);
                    signal.notify();
                },
            },
            loot,
            trade,
            quest,
            social,
            unlocks,
            economy,
            leaderboard,
        },
        player: {
            userId: player.userId,
            isNew: player.isNew,
            inventory,
            stats: playerStats,
            loadout: loadouts,
            applyLoadout: loadouts.applyLoadout,
            movement: pose,
        },
        item: {
            use: {
                register: itemUse.register,
                registered: itemUse.registered,
                can: (input) => itemUse.can(ctx, input),
                use(input) {
                    const result = itemUse.use(ctx, input);
                    signal.notify();
                    return result;
                },
            },
            weapon,
        },
        subscribe: signal.subscribe,
        version: signal.version,
    };
    return ctx;
}
