export function createItemUse(resolveUse) {
    const handlers = new Map();
    function resolveHandler(itemId) {
        const useName = resolveUse(itemId);
        if (!useName)
            return { rejection: { reason: "not-usable" } };
        const handler = handlers.get(useName);
        if (!handler)
            return { rejection: { reason: "unknown-handler" } };
        return { handler };
    }
    return {
        register(newHandlers) {
            for (const [name, handler] of Object.entries(newHandlers)) {
                if (handlers.has(name)) {
                    throw new Error(`Item use handler "${name}" is already registered.`);
                }
                handlers.set(name, handler);
            }
        },
        registered() {
            return Array.from(handlers.keys());
        },
        can(state, input) {
            const resolved = resolveHandler(input.itemId);
            if ("rejection" in resolved)
                return resolved.rejection;
            return resolved.handler.can?.(state, input) ?? null;
        },
        use(state, input) {
            const resolved = resolveHandler(input.itemId);
            if ("rejection" in resolved)
                return { state, error: resolved.rejection.reason };
            const rejection = resolved.handler.can?.(state, input);
            if (rejection)
                return { state, error: rejection.reason };
            return resolved.handler.apply(state, input);
        },
    };
}
