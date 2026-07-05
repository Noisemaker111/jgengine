export function normalizeOnDeath(spec) {
    if (!spec)
        return { drops: [], command: null };
    const drops = spec.drops === undefined ? [] : typeof spec.drops === "string" ? [{ table: spec.drops }] : spec.drops;
    const command = spec.command === undefined ? null : typeof spec.command === "string" ? { name: spec.command } : spec.command;
    return { drops, command };
}
function matchesReason(when, reason) {
    return when === undefined || when.reason === reason.kind;
}
export function createDeathSystem(deps) {
    const dead = new Set();
    return {
        resolveDeath(instanceId, reason) {
            if (dead.has(instanceId))
                return { status: "rejected", reason: "already-dead" };
            const identity = deps.resolveIdentity(instanceId);
            if (identity === null)
                return { status: "rejected", reason: "unknown-instance" };
            dead.add(instanceId);
            const event = {
                instanceId,
                catalogId: identity.catalogId,
                reason,
                position: identity.position,
            };
            if (identity.userId !== undefined)
                event.userId = identity.userId;
            if (identity.displayName !== undefined)
                event.displayName = identity.displayName;
            deps.events.emit("entity.died", event);
            const onDeath = normalizeOnDeath(deps.resolveOnDeath(instanceId));
            const drops = [];
            for (const rule of onDeath.drops) {
                if (matchesReason(rule.when, reason))
                    drops.push(...deps.loot.roll(rule.table));
            }
            let ranCommand = null;
            if (onDeath.command !== null &&
                matchesReason(onDeath.command.when, reason) &&
                deps.runCommand !== undefined) {
                deps.runCommand(onDeath.command.name, onDeath.command.args);
                ranCommand = onDeath.command.name;
            }
            deps.despawn(instanceId);
            return { status: "resolved", drops, ranCommand };
        },
        revive(instanceId) {
            return dead.delete(instanceId);
        },
    };
}
export function deathReasonFromEffect(ctx) {
    const killerUserId = ctx.userIdOf?.(ctx.from);
    if (killerUserId !== undefined) {
        return ctx.via?.item !== undefined
            ? { kind: "player_kill", killerUserId, via: { item: ctx.via.item } }
            : { kind: "player_kill", killerUserId };
    }
    return { kind: "environment", source: ctx.via?.item ?? "effect" };
}
