export function runCommand(snapshot, commands, commandName, input, actorUserId) {
    const command = commands[commandName];
    if (!command) {
        return { ok: false, reason: `Unknown command: ${commandName}` };
    }
    const validationError = command.validate(snapshot, input);
    if (validationError) {
        return { ok: false, reason: validationError.reason };
    }
    const next = command.apply(snapshot, input);
    return {
        ok: true,
        snapshot: {
            ...next,
            revision: snapshot.revision + 1,
            dirty: {
                server: true,
                players: next.dirty.players.includes(actorUserId)
                    ? next.dirty.players
                    : [...next.dirty.players, actorUserId],
                chunks: next.dirty.chunks,
            },
        },
    };
}
