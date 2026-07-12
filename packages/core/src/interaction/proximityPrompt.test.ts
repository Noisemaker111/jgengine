import { describe, expect, test } from "bun:test";
import {
  command,
  gauge,
  keybind,
  label,
  positionedPromptsEqual,
  promptCommandsEqual,
  promptDisplaysEqual,
  proximityPrompt,
  resolveActivePrompt,
  type PositionedPrompt,
} from "@jgengine/core/interaction/proximityPrompt";

function positioned(
  id: string,
  position: { x: number; z: number },
  radius: number,
  priority?: number,
): PositionedPrompt {
  return {
    id,
    position,
    priority,
    prompt: proximityPrompt({ radius, display: keybind("interact") }),
  };
}

describe("proximity prompt descriptors", () => {
  test("proximityPrompt builds the directive shape with display variants", () => {
    const prompt = proximityPrompt({
      radius: 2,
      display: keybind("interact"),
      invoke: command("rack.configure", { rackId: "rack-1" }),
    });

    expect(prompt).toEqual({
      radius: 2,
      display: { kind: "keybind", actionId: "interact" },
      invoke: { name: "rack.configure", input: { rackId: "rack-1" } },
    });
  });

  test("invoke defaults to null for display-only prompts", () => {
    expect(proximityPrompt({ radius: 3, display: label("Panel") }).invoke).toBeNull();
    expect(gauge("power")).toEqual({ kind: "gauge", gaugeId: "power" });
  });
});

describe("resolveActivePrompt", () => {
  test("returns null when no prompt is strictly within radius", () => {
    const prompts = [positioned("a", { x: 2, z: 0 }, 2)];
    expect(resolveActivePrompt({ x: 0, z: 0 }, prompts)).toBeNull();
    expect(resolveActivePrompt({ x: 0, z: 0 }, [])).toBeNull();
  });

  test("picks the nearest prompt within radius", () => {
    const prompts = [
      positioned("far", { x: 1.5, z: 0 }, 2),
      positioned("near", { x: 0.5, z: 0 }, 2),
    ];
    expect(resolveActivePrompt({ x: 0, z: 0 }, prompts)?.id).toBe("near");
  });

  test("breaks distance ties by list order", () => {
    const prompts = [
      positioned("first", { x: 1, z: 0 }, 2),
      positioned("second", { x: -1, z: 0 }, 2),
    ];
    expect(resolveActivePrompt({ x: 0, z: 0 }, prompts)?.id).toBe("first");
  });

  test("higher priority in range beats a closer lower-priority prompt", () => {
    const prompts = [
      positioned("close-low", { x: 0.2, z: 0 }, 2, 0),
      positioned("far-high", { x: 1.8, z: 0 }, 2, 1),
    ];
    expect(resolveActivePrompt({ x: 0, z: 0 }, prompts)?.id).toBe("far-high");
  });

  test("infinite radius prompt acts as a fallback under lower priority", () => {
    const fallback = positioned("fallback", { x: 0, z: 0 }, Number.POSITIVE_INFINITY, -1);
    const near = positioned("near", { x: 1, z: 0 }, 2, 0);
    expect(resolveActivePrompt({ x: 0, z: 0 }, [fallback, near])?.id).toBe("near");
    expect(resolveActivePrompt({ x: 50, z: 0 }, [fallback, near])?.id).toBe("fallback");
  });
});

describe("prompt equality", () => {
  test("compares display variants structurally", () => {
    expect(promptDisplaysEqual(keybind("interact"), keybind("interact"))).toBe(true);
    expect(promptDisplaysEqual(keybind("interact"), keybind("jump"))).toBe(false);
    expect(promptDisplaysEqual(gauge("power"), label("power"))).toBe(false);
    expect(promptDisplaysEqual(label("Panel"), label("Panel"))).toBe(true);
  });

  test("keybind label is carried and distinguishes equality", () => {
    expect(keybind("interact", "Open Chest")).toEqual({ kind: "keybind", actionId: "interact", label: "Open Chest" });
    expect(keybind("interact")).toEqual({ kind: "keybind", actionId: "interact" });
    expect(promptDisplaysEqual(keybind("interact", "Open"), keybind("interact", "Open"))).toBe(true);
    expect(promptDisplaysEqual(keybind("interact", "Open"), keybind("interact", "Talk"))).toBe(false);
    expect(promptDisplaysEqual(keybind("interact", "Open"), keybind("interact"))).toBe(false);
  });

  test("compares commands by name and shallow input", () => {
    expect(promptCommandsEqual(command("a", { id: "1" }), command("a", { id: "1" }))).toBe(true);
    expect(promptCommandsEqual(command("a", { id: "1" }), command("a", { id: "2" }))).toBe(false);
    expect(promptCommandsEqual(command("a"), null)).toBe(false);
    expect(promptCommandsEqual(null, null)).toBe(true);
  });

  test("compares positioned prompts structurally", () => {
    const a: PositionedPrompt = {
      id: "rack-1",
      position: { x: 1, z: 2 },
      prompt: proximityPrompt({
        radius: 2,
        display: keybind("interact"),
        invoke: command("rack.configure", { rackId: "rack-1" }),
      }),
    };
    const same = { ...a, priority: 0 };
    expect(positionedPromptsEqual(a, same)).toBe(true);
    expect(positionedPromptsEqual(a, { ...a, position: { x: 1, z: 3 } })).toBe(false);
    expect(positionedPromptsEqual(a, { ...a, priority: 1 })).toBe(false);
  });
});
