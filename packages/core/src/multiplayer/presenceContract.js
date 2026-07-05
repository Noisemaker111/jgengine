export function createLocalPresenceTransport() {
    const feeds = {
        myPresenceLocation: null,
        onlinePresences: [],
        dormantPresences: [],
    };
    const actions = {
        ensurePresence: async () => null,
        leavePresence: async () => ({ left: true }),
        syncPose: () => undefined,
    };
    return {
        transport: {
            useFeeds: () => feeds,
            useActions: () => actions,
        },
        actions,
    };
}
