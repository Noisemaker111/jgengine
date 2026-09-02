import { describe, expect, test } from "bun:test";
import { createActionContextStack } from "./actionContexts";

describe("action context stack", () => {
  test("merges passthrough contexts from top down", () => {
    const stack = createActionContextStack();
    stack.push({ id: "play", codes: { move: ["KeyW"], pause: ["Escape"] }, passthrough: true });
    stack.push({ id: "overlay", codes: { pause: ["KeyP"], chat: ["Enter"] }, passthrough: true });
    expect(stack.active()).toEqual({ move: ["KeyW"], pause: ["KeyP"], chat: ["Enter"] });
  });

  test("a non-passthrough context blocks lower contexts", () => {
    const stack = createActionContextStack();
    stack.push({ id: "play", codes: { move: ["KeyW"] }, passthrough: true });
    stack.push({ id: "menu", codes: { confirm: ["Enter"] }, passthrough: false });
    expect(stack.active()).toEqual({ confirm: ["Enter"] });
    expect(stack.pop("menu")).toBe(true);
    expect(stack.active()).toEqual({ move: ["KeyW"] });
  });

  test("snapshots and restores layered state", () => {
    const stack = createActionContextStack();
    stack.push({ id: "play", codes: { jump: ["Space"] }, passthrough: true });
    const snapshot = stack.snapshot();
    stack.push({ id: "menu", codes: {}, passthrough: false });
    stack.restore(snapshot);
    expect(stack.active()).toEqual({ jump: ["Space"] });
  });
});
