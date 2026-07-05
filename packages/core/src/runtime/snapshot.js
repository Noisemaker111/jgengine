export const RUNTIME_SNAPSHOT_VERSION = 1;
export function createEmptyServerRow() {
    return {
        entities: [],
        objects: [],
        session: {},
        feeds: {},
    };
}
export function createEmptyPlayerRow(userId) {
    return {
        userId,
        inventories: {},
        economy: {},
        unlocks: [],
        session: {},
    };
}
export function createRuntimeSnapshot(args) {
    return {
        version: RUNTIME_SNAPSHOT_VERSION,
        gameId: args.gameId,
        serverId: args.serverId,
        server: args.server ?? createEmptyServerRow(),
        players: args.players ?? {},
        chunks: args.chunks ?? {},
        revision: 0,
        dirty: {
            server: false,
            players: [],
            chunks: [],
        },
    };
}
export function markServerDirty(snapshot) {
    return {
        ...snapshot,
        revision: snapshot.revision + 1,
        dirty: { ...snapshot.dirty, server: true },
    };
}
export function markPlayerDirty(snapshot, userId) {
    if (snapshot.dirty.players.includes(userId)) {
        return markServerDirty(snapshot);
    }
    return {
        ...snapshot,
        revision: snapshot.revision + 1,
        dirty: {
            ...snapshot.dirty,
            server: true,
            players: [...snapshot.dirty.players, userId],
        },
    };
}
export function clearDirtyFlags(snapshot) {
    return {
        ...snapshot,
        dirty: {
            server: false,
            players: [],
            chunks: [],
        },
    };
}
export function splitProfilePlayer(player) {
    const { session = {}, ...persistentFields } = player;
    return {
        persistent: {
            ...persistentFields,
            session: {},
        },
        session,
    };
}
