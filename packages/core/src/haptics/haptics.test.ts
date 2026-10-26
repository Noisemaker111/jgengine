import { describe, expect, test } from "bun:test";
import { createHapticChannels } from "./haptics";

describe("createHapticChannels", () => {
  test("held channels combine by max within one priority", () => {
    const haptics = createHapticChannels();
    haptics.set("engine", { strong: 0.3, weak: 0.1 });
    haptics.set("road", { strong: 0.1, weak: 0.5 });
    expect(haptics.mix(1 / 60)).toEqual({ strong: 0.3, weak: 0.5 });
    haptics.set("road", { strong: 0, weak: 0 });
    expect(haptics.mix(1 / 60)).toEqual({ strong: 0.3, weak: 0.1 });
  });

  test("a higher-priority channel ducks the rest", () => {
    const haptics = createHapticChannels({ duck: 0.5 });
    haptics.set("engine", { strong: 0.8, weak: 0.4 });
    haptics.set("impact", { strong: 0.6, weak: 0 }, 2);
    const level = haptics.mix(0);
    expect(level.strong).toBeCloseTo(0.6, 6);
    expect(level.weak).toBeCloseTo(0.2, 6);
  });

  test("pulses fade linearly and expire", () => {
    const haptics = createHapticChannels();
    haptics.pulse("impact", { strong: 1, weak: 0.5, ms: 200 });
    expect(haptics.mix(0.05).strong).toBeCloseTo(0.75, 6);
    expect(haptics.mix(0.1).weak).toBeCloseTo(0.125, 6);
    expect(haptics.mix(0.1)).toEqual({ strong: 0, weak: 0 });
    expect(haptics.snapshot().channels).toEqual([]);
  });

  test("clamps levels and round-trips through snapshot", () => {
    const haptics = createHapticChannels();
    haptics.set("engine", { strong: 3, weak: -1 }, 1);
    haptics.pulse("bump", { strong: 0.5, weak: 0.5, ms: 100 });
    const copy = createHapticChannels({ duck: 1 });
    copy.restore(haptics.snapshot());
    expect(copy.mix(0)).toEqual(haptics.mix(0));
    haptics.clear();
    expect(haptics.mix(0)).toEqual({ strong: 0, weak: 0 });
  });
});
