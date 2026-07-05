import { createObservableKeyedStore } from "../store/observableKeyedStore";
function toEntityPosition(position) {
    if (position === undefined)
        return [0, 0, 0];
    if ("x" in position)
        return [position.x, position.y, position.z];
    return position;
}
export function createEntityStore() {
    const store = createObservableKeyedStore();
    let nextCounter = 1;
    function generateId() {
        let id = `entity-${nextCounter}`;
        while (store.has(id)) {
            nextCounter += 1;
            id = `entity-${nextCounter}`;
        }
        nextCounter += 1;
        return id;
    }
    return {
        spawn(name, options = {}) {
            if (options.id !== undefined && store.has(options.id)) {
                throw new Error(`Scene entity id "${options.id}" is already spawned.`);
            }
            const id = options.id ?? generateId();
            store.set(id, {
                id,
                name,
                position: toEntityPosition(options.position),
                rotationY: options.rotationY ?? 0,
                rotationX: options.rotationX ?? 0,
                rotationZ: options.rotationZ ?? 0,
                role: options.role ?? "prop",
                movement: options.movement ?? {},
                behaviors: options.behaviors ?? [],
                meta: options.meta,
            });
            return id;
        },
        despawn(id) {
            const existed = store.has(id);
            store.delete(id);
            return existed;
        },
        update(id, patch) {
            const current = store.get(id);
            if (!current)
                return false;
            store.set(id, { ...current, ...patch });
            return true;
        },
        setPose(id, pose) {
            const current = store.get(id);
            if (!current)
                return false;
            store.set(id, {
                ...current,
                position: toEntityPosition(pose.position),
                rotationY: pose.rotationY ?? current.rotationY,
                rotationX: pose.rotationX ?? current.rotationX,
                rotationZ: pose.rotationZ ?? current.rotationZ,
            });
            return true;
        },
        get(id) {
            return store.get(id) ?? null;
        },
        list() {
            return store.arraySnapshot();
        },
        clear() {
            for (const entity of store.arraySnapshot()) {
                store.delete(entity.id);
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
