import { describe, expect, test } from "bun:test";

import { bindingLabel } from "./actionBindings";
import { GAMEPAD_GLYPH_SETS, resolveGamepadFrame, type GamepadSnapshot } from "./gamepadModel";

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
