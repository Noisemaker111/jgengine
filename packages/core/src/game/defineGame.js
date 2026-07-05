import { createEntityStore } from "../scene/entityStore";
export function defineGame(config) {
    if (config.name.trim().length === 0) {
        throw new Error("defineGame: name must be non-empty");
    }
    return { ...config, scene: createEntityStore() };
}
