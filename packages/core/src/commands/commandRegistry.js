export function createCommandRegistry() {
    const definitions = new Map();
    return {
        define(name, definition) {
            if (definitions.has(name)) {
                throw new Error(`Command "${name}" is already defined.`);
            }
            definitions.set(name, definition);
        },
        has(name) {
            return definitions.has(name);
        },
        names() {
            return Array.from(definitions.keys());
        },
        run(state, name, input) {
            const definition = definitions.get(name);
            if (!definition)
                return { status: "unknown-command" };
            const rejection = definition.validate?.(state, input) ?? null;
            if (rejection)
                return { status: "rejected", reason: rejection.reason };
            return { status: "applied", state: definition.apply(state, input) };
        },
    };
}
