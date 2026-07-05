export function createChangeSignal() {
    const listeners = new Set();
    let version = 0;
    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        notify() {
            version += 1;
            for (const listener of listeners)
                listener();
        },
        version() {
            return version;
        },
    };
}
export function notifyAfter(target, methods, notify) {
    const wrapped = { ...target };
    for (const method of methods) {
        const fn = target[method];
        wrapped[method] = ((...args) => {
            const result = fn(...args);
            notify();
            return result;
        });
    }
    return wrapped;
}
