/**
 * Action-binding model: games bind semantic actions ("jump", "interact") to
 * physical control codes; capture layers resolve raw events through this map
 * so gameplay code never sees keycodes. Control codes are plain strings, so
 * the same model serves keyboard codes, mouse buttons, touch controls, or
 * gamepad inputs.
 */
export function bindingMatches(code, binding) {
    return code === binding.primary || code === binding.secondary;
}
/** First action (in the map's key order) bound to the given control code, or null. */
export function resolveBoundAction(code, bindings) {
    for (const action of Object.keys(bindings)) {
        if (bindingMatches(code, bindings[action]))
            return action;
    }
    return null;
}
/**
 * Collapse left/right modifier variants of a KeyboardEvent.code so bindings
 * store one logical key.
 */
export function normalizeKeyCode(code) {
    if (code === "ShiftLeft" || code === "ShiftRight")
        return "Shift";
    if (code === "ControlLeft" || code === "ControlRight")
        return "Control";
    return code;
}
function toBindings(codes) {
    return codes.map((code) => ({ primary: code, secondary: null }));
}
export function toActionStateBindingMap(map) {
    const result = {};
    for (const action of Object.keys(map)) {
        const codes = map[action];
        if (Array.isArray(codes)) {
            result[action] = toBindings(codes);
        }
        else {
            const modes = codes;
            result[action] = { hold: toBindings(modes.hold ?? []), toggle: toBindings(modes.toggle ?? []) };
        }
    }
    return result;
}
function resolveActionBindingModes(config) {
    if (Array.isArray(config))
        return { hold: config, toggle: [] };
    return { hold: config.hold ?? [], toggle: config.toggle ?? [] };
}
export function createActionStateTracker(map) {
    const actions = Object.keys(map);
    const modesByAction = new Map(actions.map((action) => [action, resolveActionBindingModes(map[action])]));
    const heldCodesByAction = new Map(actions.map((action) => [action, new Set()]));
    const toggledActions = new Set();
    const pressedThisFrame = new Set();
    const activeCodes = new Set();
    function findAction(code, pick) {
        for (const action of actions) {
            if (pick(modesByAction.get(action)).some((binding) => bindingMatches(code, binding)))
                return action;
        }
        return null;
    }
    return {
        handleDown(code) {
            const normalized = normalizeKeyCode(code);
            if (activeCodes.has(normalized))
                return null;
            activeCodes.add(normalized);
            let matched = null;
            const holdAction = findAction(normalized, (modes) => modes.hold);
            if (holdAction !== null) {
                heldCodesByAction.get(holdAction).add(normalized);
                pressedThisFrame.add(holdAction);
                matched = holdAction;
            }
            const toggleAction = findAction(normalized, (modes) => modes.toggle);
            if (toggleAction !== null) {
                if (toggledActions.has(toggleAction))
                    toggledActions.delete(toggleAction);
                else
                    toggledActions.add(toggleAction);
                pressedThisFrame.add(toggleAction);
                matched = matched ?? toggleAction;
            }
            return matched;
        },
        handleUp(code) {
            const normalized = normalizeKeyCode(code);
            activeCodes.delete(normalized);
            const holdAction = findAction(normalized, (modes) => modes.hold);
            if (holdAction !== null)
                heldCodesByAction.get(holdAction).delete(normalized);
            return holdAction;
        },
        isDown(action) {
            return (heldCodesByAction.get(action)?.size ?? 0) > 0 || toggledActions.has(action);
        },
        wasPressed(action) {
            return pressedThisFrame.has(action);
        },
        endFrame() {
            pressedThisFrame.clear();
        },
        reset() {
            for (const codes of heldCodesByAction.values())
                codes.clear();
            toggledActions.clear();
            pressedThisFrame.clear();
            activeCodes.clear();
        },
    };
}
