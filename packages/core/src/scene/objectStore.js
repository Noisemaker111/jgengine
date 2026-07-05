import { createObservableKeyedStore } from "../store/observableKeyedStore";
export function createObjectStore() {
    const store = createObservableKeyedStore();
    let nextCounter = 1;
    function generateId() {
        let id = `object-${nextCounter}`;
        while (store.has(id)) {
            nextCounter += 1;
            id = `object-${nextCounter}`;
        }
        nextCounter += 1;
        return id;
    }
    return {
        place(catalogId, x, y, z, options = {}) {
            if (options.instanceId !== undefined && store.has(options.instanceId)) {
                throw new Error(`Scene object id "${options.instanceId}" is already placed.`);
            }
            const instanceId = options.instanceId ?? generateId();
            store.set(instanceId, {
                instanceId,
                catalogId,
                position: [x, y, z],
                rotationY: options.rotation ?? 0,
                ...(options.parentSpace !== undefined ? { parentSpace: options.parentSpace } : {}),
            });
            return instanceId;
        },
        remove(instanceId) {
            const existed = store.has(instanceId);
            store.delete(instanceId);
            return existed;
        },
        move(instanceId, x, y, z) {
            const current = store.get(instanceId);
            if (!current)
                return false;
            store.set(instanceId, { ...current, position: [x, y, z] });
            return true;
        },
        rotate(instanceId, rotationY) {
            const current = store.get(instanceId);
            if (!current)
                return false;
            store.set(instanceId, { ...current, rotationY });
            return true;
        },
        get(instanceId) {
            return store.get(instanceId) ?? null;
        },
        list(filter) {
            const all = store.arraySnapshot();
            if (filter?.parentSpace === undefined)
                return all;
            return all.filter((object) => object.parentSpace === filter.parentSpace);
        },
        clear() {
            for (const object of store.arraySnapshot()) {
                store.delete(object.instanceId);
            }
        },
        subscribe(listener) {
            return store.subscribe(listener);
        },
        snapshot() {
            return store.arraySnapshot();
        },
    };
}
