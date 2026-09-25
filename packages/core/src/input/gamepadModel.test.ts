import { describe, expect, test } from "bun:test";

import { bindingLabel } from "./actionBindings";
import { GAMEPAD_GLYPH_SETS, gamepadFeelOptions, resolveGamepadFrame, type GamepadSnapshot } from "./gamepadModel";

const snapshot = (axes: number[], buttons: { pressed: boolean; value: number }[] = []): GamepadSnapshot => ({
  id: "test-pad",
  axes,
  buttons,
  connected: true,
});

describe("resolveGamepadFrame", () => {
  test("applies axial deadzone and keeps signed axis bindings analog", () => {
    const frame = resolveGamepadFrame(
      snapshot([0.1, -0.5]),
      { move: ["padaxis:0+", "padaxis:1-"] },
      { deadzone: { kind: "axial", inner: 0.2, outer: 0.8 } },
    );
    expect(frame.analog.move).toBeCloseTo(0.5, 5);
    expect(frame.held).toEqual(["move"]);
  });

  test("applies radial deadzone across the stick", () => {
    const frame = resolveGamepadFrame(
      snapshot([0.45, 0.6]),
      { aim: ["padaxis:0+", "padaxis:1+"] },
      { deadzone: { kind: "radial", inner: 0.5, outer: 1 } },
    );
    expect(frame.analog.aim).toBeCloseTo(0.4, 5);
  });

  test("curves axis output and resolves pressed buttons", () => {
    const frame = resolveGamepadFrame(
      snapshot([0.5], [{ pressed: true, value: 1 }]),
      { jump: ["pad:0"], steer: ["padaxis:0+"] },
      { deadzone: { kind: "axial", inner: 0, outer: 1 }, curve: 2 },
    );
    expect(frame.held).toEqual(["jump", "steer"]);
    expect(frame.analog.steer).toBeCloseTo(0.25, 5);
  });

  test("disconnected snapshots produce no input", () => {
    expect(resolveGamepadFrame({ ...snapshot([1]), connected: false }, { move: ["padaxis:0+"] }, { deadzone: { kind: "axial", inner: 0, outer: 1 } })).toEqual({ held: [], analog: {} });
  });

  test("triggers resolve through triggerDeadzone and the shared curve", () => {
    const bindings = { throttle: ["pad:7"] } as const;
    const options = { deadzone: { kind: "axial", inner: 0.1, outer: 1 }, curve: 2, triggerDeadzone: 0.2 } as const;
    const resting = resolveGamepadFrame(snapshot([], [...Array(7).fill({ pressed: false, value: 0 }), { pressed: true, value: 0.15 }]), bindings, options);
    expect(resting).toEqual({ held: [], analog: {} });
    const half = resolveGamepadFrame(snapshot([], [...Array(7).fill({ pressed: false, value: 0 }), { pressed: true, value: 0.6 }]), bindings, options);
    expect(half.held).toEqual(["throttle"]);
    expect(half.analog.throttle).toBeCloseTo(0.25, 5);
  });

  test("reuses the out frame and clears stale actions", () => {
    const out = { held: [] as string[], analog: {} as Record<string, number> };
    const options = { deadzone: { kind: "axial", inner: 0, outer: 1 } } as const;
    const first = resolveGamepadFrame(snapshot([1]), { steer: ["padaxis:0+"] }, options, out);
    expect(first).toBe(out);
    expect(out).toEqual({ held: ["steer"], analog: { steer: 1 } });
    resolveGamepadFrame(snapshot([0]), { steer: ["padaxis:0+"] }, options, out);
    expect(out).toEqual({ held: [], analog: {} });
  });
});

describe("gamepadFeelOptions", () => {
  test("defaults to the shell deadzone and a linear curve", () => {
    expect(gamepadFeelOptions(undefined)).toEqual({
      deadzone: { kind: "axial", inner: 0.12, outer: 0.95 },
      curve: 1,
      triggerDeadzone: 0,
    });
  });

  test("a number deadzone is the axial inner edge", () => {
    expect(gamepadFeelOptions({ deadzone: 0.2, curve: 1.6, triggerDeadzone: 0.05 })).toEqual({
      deadzone: { kind: "axial", inner: 0.2, outer: 0.95 },
      curve: 1.6,
      triggerDeadzone: 0.05,
    });
  });
});

describe("gamepad binding labels", () => {
  test("returns family-specific button glyphs", () => {
    expect(bindingLabel("pad:0", "xbox")).toBe("A");
    expect(bindingLabel("pad:0", "playstation")).toBe("Cross");
    expect(bindingLabel("pad:0", "nintendo")).toBe("B");
    expect(bindingLabel("pad:0", "generic")).toBe("1");
    expect(bindingLabel("pad:1", GAMEPAD_GLYPH_SETS.xbox)).toBe("B");
    expect(bindingLabel("padaxis:1-")).toBe("Axis 1-");
    expect(GAMEPAD_GLYPH_SETS.xbox.buttons).toHaveLength(16);
  });
});
