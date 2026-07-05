export function createGameEvents() {
    const listeners = new Map();
    function on(name, handler) {
        let set = listeners.get(name);
        if (!set) {
            set = new Set();
            listeners.set(name, set);
        }
        const entry = handler;
        set.add(entry);
        return () => set.delete(entry);
    }
    return {
        on,
        subscribe: on,
        emit(name, payload) {
            const set = listeners.get(name);
            if (!set)
                return;
            for (const handler of set)
                handler(payload);
        },
    };
}
