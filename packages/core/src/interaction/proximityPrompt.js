export function keybind(actionId) {
    return { kind: "keybind", actionId };
}
export function gauge(gaugeId) {
    return { kind: "gauge", gaugeId };
}
export function label(text) {
    return { kind: "label", text };
}
export function command(name, input) {
    return { name, input };
}
export function proximityPrompt({ radius, display, invoke = null }) {
    return { radius, display, invoke };
}
/**
 * Nearest prompt strictly within its radius wins; a higher-priority prompt in
 * range beats any lower-priority one regardless of distance; equal priority
 * and distance keep the earliest prompt in the list.
 */
export function resolveActivePrompt(playerPosition, prompts) {
    let active = null;
    let activePriority = Number.NEGATIVE_INFINITY;
    let activeDistance = Number.POSITIVE_INFINITY;
    for (const candidate of prompts) {
        const nextDistance = Math.hypot(candidate.position.x - playerPosition.x, candidate.position.z - playerPosition.z);
        if (nextDistance >= candidate.prompt.radius)
            continue;
        const priority = candidate.priority ?? 0;
        if (priority > activePriority || (priority === activePriority && nextDistance < activeDistance)) {
            active = candidate;
            activePriority = priority;
            activeDistance = nextDistance;
        }
    }
    return active;
}
export function promptDisplaysEqual(a, b) {
    if (a === b)
        return true;
    if (a.kind === "keybind")
        return b.kind === "keybind" && a.actionId === b.actionId;
    if (a.kind === "gauge")
        return b.kind === "gauge" && a.gaugeId === b.gaugeId;
    return b.kind === "label" && a.text === b.text;
}
function commandInputsEqual(a, b) {
    if (Object.is(a, b))
        return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null)
        return false;
    const aRecord = a;
    const bRecord = b;
    const keys = Object.keys(aRecord);
    if (keys.length !== Object.keys(bRecord).length)
        return false;
    return keys.every((key) => Object.is(aRecord[key], bRecord[key]));
}
export function promptCommandsEqual(a, b) {
    if (a === b)
        return true;
    if (a === null || b === null)
        return false;
    return a.name === b.name && commandInputsEqual(a.input, b.input);
}
export function positionedPromptsEqual(a, b) {
    if (a === b)
        return true;
    return a.id === b.id
        && a.position.x === b.position.x
        && a.position.z === b.position.z
        && (a.priority ?? 0) === (b.priority ?? 0)
        && a.prompt.radius === b.prompt.radius
        && promptDisplaysEqual(a.prompt.display, b.prompt.display)
        && promptCommandsEqual(a.prompt.invoke, b.prompt.invoke);
}
