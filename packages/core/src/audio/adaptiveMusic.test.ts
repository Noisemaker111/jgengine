import { describe, expect, test } from "bun:test";

import { themeLoopSeconds } from "./music";
import { ADAPTIVE_THEMES, createCombatIntensity, DEFAULT_ADAPTIVE_TIERS } from "./adaptiveMusic";
import { createMusicState, resolveMusicState } from "./musicState";

describe("createCombatIntensity", () => {
  test("jumps on a bump, decays over quiet time, and stays inside 0..1", () => {
    const intensity = createCombatIntensity(0.1);
    intensity.bump(0.5, 0);
    expect(intensity.read(0)).toBeCloseTo(0.5);
    expect(intensity.read(2000)).toBeCloseTo(0.3);
    intensity.bump(2, 2000);
    expect(intensity.read(2000)).toBe(1);
    expect(intensity.read(60_000)).toBe(0);
  });
});

describe("built-in adaptive themes", () => {
  test("every default tier names a built-in theme that has notes and a sane loop", () => {
    for (const tier of DEFAULT_ADAPTIVE_TIERS) {
      const theme = ADAPTIVE_THEMES[tier.theme!];
      expect(theme).toBeDefined();
      expect(theme!.events.length).toBeGreaterThan(4);
      expect(themeLoopSeconds(theme!)).toBeGreaterThan(3);
      for (const event of theme!.events) expect(event.beat).toBeLessThan(theme!.bars * 4);
    }
  });

  test("a fight's worth of intensity climbs explore → fight and holds before easing back", () => {
    const config = { tiers: DEFAULT_ADAPTIVE_TIERS };
    let state = createMusicState();
    const at = (intensity: number, nowMs: number) => {
      const result = resolveMusicState(state, { intensity, nowMs }, config);
      state = result.state;
      return result.theme;
    };
    expect(at(0, 0)).toBe("jg.explore");
    expect(at(0.7, 1000)).toBe("jg.fight");
    expect(at(0.1, 3000)).toBe("jg.fight");
    expect(at(0.1, 8000)).toBe("jg.explore");
  });
});
