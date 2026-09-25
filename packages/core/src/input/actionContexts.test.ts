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

  test("contexts carry axis bindings and shaping, merged top-down", () => {
    const stack = createActionContextStack();
    stack.push({
      id: "onFoot",
      codes: { forward: ["KeyW"] },
      passthrough: false,
      axes: { moveX: { positive: ["right"], negative: ["left"] } },
    });
    stack.push({
      id: "driving",
      codes: { throttle: ["KeyW"], steerRight: ["KeyD"], steerLeft: ["KeyA"] },
      passthrough: false,
      axes: { steer: { positive: ["steerRight"], negative: ["steerLeft"] } },
      shaping: { steer: { digital: { riseRate: 3, returnRate: 6 }, analog: { deadzone: 0.1, curve: 1.6 } } },
    });
    expect(stack.activeAxes()).toEqual({
      bindings: { steer: { positive: ["steerRight"], negative: ["steerLeft"] } },
      shaping: { steer: { digital: { riseRate: 3, returnRate: 6 }, analog: { deadzone: 0.1, curve: 1.6 } } },
    });
    stack.pop("driving");
    expect(stack.activeAxes().bindings).toEqual({ moveX: { positive: ["right"], negative: ["left"] } });
    const restored = createActionContextStack();
    restored.restore(stack.snapshot());
    expect(restored.activeAxes()).toEqual(stack.activeAxes());
  });

  test("subscribers hear push, pop and restore, and version bumps", () => {
    const stack = createActionContextStack();
    let calls = 0;
    const unsubscribe = stack.subscribe(() => {
      calls += 1;
    });
    stack.push({ id: "driving", codes: {}, passthrough: true });
    expect(stack.pop("missing")).toBe(false);
    stack.pop("driving");
    stack.restore({ contexts: [] });
    expect(calls).toBe(3);
    expect(stack.version()).toBe(3);
    unsubscribe();
    stack.push({ id: "menu", codes: {}, passthrough: false });
    expect(calls).toBe(3);
    expect(stack.ids()).toEqual(["menu"]);
  });
});
