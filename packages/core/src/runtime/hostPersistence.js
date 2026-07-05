import { isSaveEnabled, parseSaveAutoMs, saveScopeIncludesChunks, saveScopeIncludesPlayer, } from "./save";
import { createEmptyPlayerRow, splitProfilePlayer } from "./snapshot";
export const LEADERBOARD_PENDING_KEY = "leaderboardPending";
function isLeaderboardIncrement(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const candidate = value;
    return (typeof candidate.userId === "string" &&
        typeof candidate.stat === "string" &&
        (candidate.scope === "global" || candidate.scope === "server" || candidate.scope === "profile") &&
        typeof candidate.by === "number" &&
        (candidate.serverId === undefined || typeof candidate.serverId === "string"));
}
export function drainPendingLeaderboardIncrements(session) {
    const raw = session[LEADERBOARD_PENDING_KEY];
    if (!Array.isArray(raw) || raw.length === 0) {
        return { increments: [], session };
    }
    const rest = { ...session };
    delete rest[LEADERBOARD_PENDING_KEY];
    return { increments: raw.filter(isLeaderboardIncrement), session: rest };
}
export const FEED_RING_LIMIT = 20;
export function trimFeedEntries(entries, limit = FEED_RING_LIMIT) {
    if (entries.length <= limit)
        return entries;
    return entries.slice(entries.length - limit);
}
export function shouldAutoSave(save, dirtyAt, lastSavedAt, now) {
    if (!isSaveEnabled(save))
        return false;
    if (dirtyAt === undefined)
        return false;
    const intervalMs = parseSaveAutoMs(save.auto);
    const anchor = lastSavedAt ?? 0;
    return now - anchor >= intervalMs;
}
export function toServerListing(record) {
    return {
        serverId: record.serverId,
        status: record.status,
        memberCount: record.memberUserIds.length,
        slotsPerServer: record.slotsPerServer,
        mode: record.mode,
        updatedAt: record.updatedAt,
    };
}
export function buildHydratePlayers(server, profiles) {
    const players = {};
    for (const userId of server.memberUserIds) {
        const profile = profiles[userId] ?? null;
        const sessionPlayer = server.sessionPlayers[userId];
        if (profile) {
            players[userId] = {
                ...profile.playerState,
                ...(sessionPlayer?.session ? { session: sessionPlayer.session } : {}),
            };
        }
        else if (sessionPlayer) {
            players[userId] = sessionPlayer;
        }
        else {
            players[userId] = createEmptyPlayerRow(userId);
        }
    }
    return players;
}
export function planServerPersist(server, snapshot, save, now) {
    const drained = drainPendingLeaderboardIncrements(snapshot.server.session);
    const serverState = drained.increments.length > 0 ? { ...snapshot.server, session: drained.session } : snapshot.server;
    const leaderboard = drained.increments.map((entry) => entry.scope === "server" && entry.serverId === undefined
        ? { ...entry, serverId: server.serverId }
        : entry);
    const sessionPlayers = {};
    const profiles = [];
    for (const userId of Object.keys(snapshot.players)) {
        const player = snapshot.players[userId];
        if (!player)
            continue;
        const { persistent, session } = splitProfilePlayer(player);
        sessionPlayers[userId] = { ...persistent, session };
        if (isSaveEnabled(save) &&
            saveScopeIncludesPlayer(save.scope) &&
            snapshot.dirty.players.includes(userId)) {
            profiles.push({
                userId,
                gameId: server.gameId,
                playerState: persistent,
                revision: snapshot.revision,
                updatedAt: now,
            });
        }
    }
    const chunks = [];
    if (isSaveEnabled(save) && saveScopeIncludesChunks(save.scope)) {
        for (const chunkKey of snapshot.dirty.chunks) {
            const chunk = snapshot.chunks[chunkKey];
            if (!chunk)
                continue;
            chunks.push({ serverId: server.serverId, chunkKey, snapshot: chunk, updatedAt: now });
        }
    }
    return {
        server: {
            ...server,
            serverState,
            sessionPlayers,
            revision: snapshot.revision,
            dirtyAt: snapshot.dirty.server || snapshot.dirty.players.length > 0 ? now : server.dirtyAt,
            updatedAt: now,
            lastSavedAt: now,
        },
        profiles,
        chunks,
        leaderboard,
    };
}
