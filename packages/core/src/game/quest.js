function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
export function createQuestJournal(deps) {
    const catalog = new Map();
    const users = new Map();
    function requireUserQuests(userId) {
        let quests = users.get(userId);
        if (!quests) {
            quests = new Map();
            users.set(userId, quests);
        }
        return quests;
    }
    function requirementMet(userId, requirementId) {
        if (users.get(userId)?.get(requirementId)?.status === "completed")
            return true;
        return deps.hasUnlock?.(userId, requirementId) ?? false;
    }
    function canAccept(userId, questId) {
        const def = catalog.get(questId);
        if (def === undefined)
            return { reason: `unknown quest "${questId}"` };
        const state = users.get(userId)?.get(questId);
        if (state?.status === "active")
            return { reason: `quest "${questId}" already active` };
        if (state?.status === "completed")
            return { reason: `quest "${questId}" already completed` };
        for (const requirementId of def.requires ?? []) {
            if (!requirementMet(userId, requirementId)) {
                return { reason: `quest "${questId}" requires "${requirementId}"` };
            }
        }
        return null;
    }
    function accept(userId, questId) {
        const denied = canAccept(userId, questId);
        if (denied !== null)
            return denied;
        requireUserQuests(userId).set(questId, { status: "active", progress: new Map() });
        deps.events.emit("quest.accepted", { userId, questId });
        return null;
    }
    function progress(userId, questId, objectiveId, delta) {
        const def = catalog.get(questId);
        const state = users.get(userId)?.get(questId);
        if (def === undefined || state === undefined || state.status !== "active")
            return;
        const objective = def.objectives.find((candidate) => candidate.id === objectiveId);
        if (objective === undefined)
            return;
        const previous = state.progress.get(objectiveId) ?? 0;
        const next = clamp(previous + delta, 0, objective.count);
        if (next === previous)
            return;
        state.progress.set(objectiveId, next);
        deps.events.emit("quest.updated", { userId, questId, objectiveId, progress: next });
    }
    function canTurnIn(userId, questId) {
        const def = catalog.get(questId);
        if (def === undefined)
            return { reason: `unknown quest "${questId}"` };
        const state = users.get(userId)?.get(questId);
        if (state === undefined || state.status !== "active") {
            return { reason: `quest "${questId}" is not active` };
        }
        for (const objective of def.objectives) {
            if ((state.progress.get(objective.id) ?? 0) < objective.count) {
                return { reason: `objective "${objective.id}" incomplete` };
            }
        }
        return null;
    }
    function applyRewards(userId, rewards) {
        if (rewards.xp)
            deps.rewards.grantXp(userId, rewards.xp.amount);
        for (const [currencyId, amount] of Object.entries(rewards.economy ?? {})) {
            deps.rewards.grantEconomy(userId, currencyId, amount);
        }
        for (const entry of rewards.items ?? []) {
            deps.rewards.grantItem(userId, entry.inventory, entry.item, entry.count);
        }
        for (const unlockId of rewards.unlocks ?? []) {
            deps.rewards.grantUnlock(userId, unlockId);
        }
    }
    function turnIn(userId, questId) {
        const denied = canTurnIn(userId, questId);
        if (denied !== null)
            return denied;
        const def = catalog.get(questId);
        const state = users.get(userId).get(questId);
        state.status = "completed";
        if (def.rewards)
            applyRewards(userId, def.rewards);
        deps.events.emit("quest.completed", { userId, questId });
        for (const nextQuestId of def.rewards?.quests ?? []) {
            if (canAccept(userId, nextQuestId) === null)
                accept(userId, nextQuestId);
        }
        return null;
    }
    function creditKill(killerUserId, catalogId) {
        for (const def of catalog.values()) {
            for (const objective of def.objectives) {
                if (objective.kind !== "kill" || objective.target !== catalogId)
                    continue;
                const recipients = new Set([killerUserId]);
                if (objective.partyShare?.credit === "all" && deps.partyMembersNear) {
                    for (const member of deps.partyMembersNear(killerUserId, objective.partyShare.radius)) {
                        recipients.add(member);
                    }
                }
                for (const userId of recipients)
                    progress(userId, def.id, objective.id, 1);
            }
        }
    }
    function creditCollect(userId, itemId, count) {
        for (const def of catalog.values()) {
            for (const objective of def.objectives) {
                if (objective.kind !== "collect" || objective.item !== itemId)
                    continue;
                progress(userId, def.id, objective.id, count);
            }
        }
    }
    return {
        register(defs) {
            const entries = Array.isArray(defs) ? defs : Object.values(defs);
            for (const def of entries)
                catalog.set(def.id, def);
        },
        has(questId) {
            return catalog.has(questId);
        },
        canAccept,
        accept,
        abandon(userId, questId) {
            const quests = users.get(userId);
            if (quests?.get(questId)?.status === "active")
                quests.delete(questId);
        },
        progress,
        canTurnIn,
        turnIn,
        grant(userId, questId, options) {
            const def = catalog.get(questId);
            if (def === undefined)
                return;
            const completed = options?.completed ?? false;
            const progressMap = new Map();
            if (completed) {
                for (const objective of def.objectives)
                    progressMap.set(objective.id, objective.count);
            }
            requireUserQuests(userId).set(questId, {
                status: completed ? "completed" : "active",
                progress: progressMap,
            });
            if (completed)
                deps.events.emit("quest.completed", { userId, questId });
            else
                deps.events.emit("quest.accepted", { userId, questId });
        },
        revoke(userId, questId) {
            users.get(userId)?.delete(questId);
        },
        list(userId) {
            const quests = users.get(userId);
            if (!quests)
                return [];
            const instances = [];
            for (const [questId, state] of quests) {
                const def = catalog.get(questId);
                if (def === undefined)
                    continue;
                instances.push({
                    questId,
                    status: state.status,
                    objectives: def.objectives.map((objective) => {
                        const current = state.progress.get(objective.id) ?? 0;
                        return {
                            id: objective.id,
                            kind: objective.kind,
                            count: objective.count,
                            progress: current,
                            complete: current >= objective.count,
                        };
                    }),
                });
            }
            return instances;
        },
        bind(action) {
            if (action === "entity.died") {
                return deps.events.on("entity.died", (event) => {
                    if (event.reason.kind !== "player_kill")
                        return;
                    creditKill(event.reason.killerUserId, event.catalogId);
                });
            }
            return deps.events.on("inventory.added", (event) => {
                creditCollect(event.userId, event.item, event.count);
            });
        },
        snapshot(userId) {
            const quests = users.get(userId);
            if (!quests)
                return [];
            return Array.from(quests, ([questId, state]) => ({
                questId,
                status: state.status,
                progress: Object.fromEntries(state.progress),
            }));
        },
        hydrate(userId, data) {
            const quests = new Map();
            for (const entry of data) {
                quests.set(entry.questId, {
                    status: entry.status,
                    progress: new Map(Object.entries(entry.progress)),
                });
            }
            users.set(userId, quests);
        },
    };
}
