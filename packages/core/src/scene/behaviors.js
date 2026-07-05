import { command, keybind, proximityPrompt, } from "../interaction/proximityPrompt";
export function wander({ radius }) {
    return { kind: "wander", radius };
}
export function promptable(prompt) {
    return { kind: "promptable", prompt };
}
const TALK_RADIUS = 2;
export function talkable(dialogueId) {
    return promptable(proximityPrompt({
        radius: TALK_RADIUS,
        display: keybind("interact"),
        invoke: command("dialogue.open", { id: dialogueId }),
    }));
}
export function player() {
    return { kind: "player" };
}
