import { describe, expect, it } from "bun:test";

import { createMusicState, resolveMusicState, type MusicStateConfig } from "./musicState";

const config: MusicStateConfig = {
  release: 0.3,
  tiers: [
    { id: "ambient", theme: "wastes", enter: 0 },
    { id: "combat", theme: "skirmish", enter: 1, holdMs: 4000 },
    { id: "boss", theme: "boss", enter: 5, holdMs: 4000 },
  ],
};

describe("resolveMusicState", () => {
  it("settles into the base tier at zero intensity", () => {
    const result = resolveMusicState(createMusicState(), { intensity: 0, nowMs: 0 }, config);
    expect(result.theme).toBe("wastes");
    expect(result.changed).toBe(true);
  });

  it("escalates immediately when intensity rises", () => {
    const base = resolveMusicState(createMusicState(), { intensity: 0, nowMs: 0 }, config);
    const combat = resolveMusicState(base.state, { intensity: 2, nowMs: 100 }, config);
    expect(combat.theme).toBe("skirmish");
    expect(combat.changed).toBe(true);
  });

  it("holds the combat tier while the hold window is open", () => {
    const base = resolveMusicState(createMusicState(), { intensity: 0, nowMs: 0 }, config);
    const combat = resolveMusicState(base.state, { intensity: 3, nowMs: 100 }, config);
    const dropEarly = resolveMusicState(combat.state, { intensity: 0, nowMs: 1500 }, config);
    expect(dropEarly.theme).toBe("skirmish");
    expect(dropEarly.changed).toBe(false);
  });

  it("falls back once the hold expires and intensity clears the release margin", () => {
    const base = resolveMusicState(createMusicState(), { intensity: 0, nowMs: 0 }, config);
    const combat = resolveMusicState(base.state, { intensity: 3, nowMs: 100 }, config);
    const dropped = resolveMusicState(combat.state, { intensity: 0, nowMs: 9000 }, config);
    expect(dropped.theme).toBe("wastes");
    expect(dropped.changed).toBe(true);
  });

  it("does not flap when intensity hovers at the tier boundary", () => {
    const base = resolveMusicState(createMusicState(), { intensity: 0, nowMs: 0 }, config);
    const combat = resolveMusicState(base.state, { intensity: 1, nowMs: 100 }, config);
    const hover = resolveMusicState(combat.state, { intensity: 0.9, nowMs: 9000 }, config);
    expect(hover.theme).toBe("skirmish");
    expect(hover.changed).toBe(false);
  });

  it("reports no change while the tier is unchanged", () => {
    const base = resolveMusicState(createMusicState(), { intensity: 0, nowMs: 0 }, config);
    expect(resolveMusicState(base.state, { intensity: 0, nowMs: 500 }, config).changed).toBe(false);
  });
});
