export function createGameFeed(options) {
    const limit = options?.limit ?? 20;
    const buffers = new Map();
    const listeners = new Map();
    function append(action, entry) {
        const buffer = buffers.get(action) ?? [];
        buffer.push(entry);
        if (buffer.length > limit)
            buffer.splice(0, buffer.length - limit);
        buffers.set(action, buffer);
        for (const listener of listeners.get(action) ?? [])
            listener(entry);
    }
    return {
        bind(action, events) {
            return events.on(action, (payload) => append(action, { at: Date.now(), data: payload }));
        },
        push(action, data) {
            append(action, { at: Date.now(), data });
        },
        recent(action, opts) {
            const buffer = buffers.get(action) ?? [];
            const count = opts?.limit ?? buffer.length;
            return buffer.slice(Math.max(0, buffer.length - count));
        },
        subscribe(action, listener) {
            let set = listeners.get(action);
            if (!set) {
                set = new Set();
                listeners.set(action, set);
            }
            set.add(listener);
            return () => set.delete(listener);
        },
        snapshot() {
            const out = {};
            for (const [action, buffer] of buffers)
                out[action] = buffer.slice();
            return out;
        },
        hydrate(data) {
            buffers.clear();
            for (const [action, buffer] of Object.entries(data))
                buffers.set(action, buffer.slice(-limit));
        },
    };
}
