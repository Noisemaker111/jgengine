import { runCommand } from "./commandRunner";
import { createEmptyPlayerRow, createRuntimeSnapshot, } from "./snapshot";
export function createGameRuntime(definition) {
    const loop = definition.loop;
    let initialized = false;
    return {
        gameId: definition.gameId,
        save: definition.save,
        hydrate(input) {
            let current = createRuntimeSnapshot({
                gameId: input.gameId,
                serverId: input.serverId,
                server: input.serverRow,
                players: input.playersByUserId,
                chunks: input.chunksByKey,
            });
            if (loop?.onInit && !initialized) {
                initialized = true;
                loop.onInit({
                    get snapshot() {
                        return current;
                    },
                    setSnapshot(next) {
                        current = next;
                    },
                });
            }
            return current;
        },
        runCommand(snapshot, actorUserId, commandName, input) {
            return runCommand(snapshot, definition.commands, commandName, input, actorUserId);
        },
        tick(snapshot, dtSeconds) {
            if (!loop?.onTick)
                return snapshot;
            let current = snapshot;
            for (const userId of Object.keys(current.players)) {
                const ctx = {
                    get snapshot() {
                        return current;
                    },
                    player: { userId, isNew: false },
                    setSnapshot(next) {
                        current = next;
                    },
                };
                loop.onTick(ctx, dtSeconds);
            }
            return current;
        },
        joinPlayer(snapshot, userId, isNew) {
            const players = { ...snapshot.players };
            if (!players[userId]) {
                players[userId] = createEmptyPlayerRow(userId);
            }
            let next = {
                ...snapshot,
                players,
                revision: snapshot.revision + 1,
                dirty: {
                    ...snapshot.dirty,
                    server: true,
                    players: snapshot.dirty.players.includes(userId)
                        ? snapshot.dirty.players
                        : [...snapshot.dirty.players, userId],
                },
            };
            if (!loop?.onNewPlayer) {
                return next;
            }
            const ctx = {
                get snapshot() {
                    return next;
                },
                player: { userId, isNew },
                setSnapshot(updated) {
                    next = updated;
                },
            };
            loop.onNewPlayer(ctx);
            return next;
        },
        toProfileRow(snapshot, userId) {
            const player = snapshot.players[userId];
            if (!player)
                return null;
            return {
                userId,
                gameId: snapshot.gameId,
                player,
                updatedAt: Date.now(),
            };
        },
    };
}
