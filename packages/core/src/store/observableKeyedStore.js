export function createObservableKeyedStore(areEqual) {
    const store = new Map();
    const listeners = new Set();
    const EMPTY = [];
    let arrayCache = EMPTY;
    function emit() {
        arrayCache = store.size === 0 ? EMPTY : Array.from(store.values());
        for (const listener of listeners)
            listener();
    }
    return {
        set(key, value) {
            const previous = store.get(key);
            if (previous !== undefined && areEqual?.(previous, value))
                return;
            store.set(key, value);
            emit();
        },
        delete(key) {
            if (!store.has(key))
                return;
            store.delete(key);
            emit();
        },
        get(key) {
            return store.get(key);
        },
        has(key) {
            return store.has(key);
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        mapSnapshot() {
            return store;
        },
        arraySnapshot() {
            return arrayCache;
        },
    };
}
