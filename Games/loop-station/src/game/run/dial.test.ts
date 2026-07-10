import { describe, expect, test } from "bun:test";
import { createRecordingBuffer } from "@jgengine/core/sensor/recordingBuffer";

import { dialTicks, forecastCollision } from "./dial";
import { ghostGlowTier, ghostPhaseAt, ghostPositionAt } from "./ghosts";
import type { GhostFrameData, GhostRecord } from "./types";

function makeGhost(lapDuration: number, startTime: number, frames: readonly [number, number][]): GhostRecord {
  const buffer = createRecordingBuffer<GhostFrameData>();
  for (const [t, s] of frames) buffer.append(t, { x: s * 10, y: 0, z: 0, headingRad: 0, s });
  return { id: "ghost-1", lapIndex: 1, color: "#e83d84", startTime, lapDuration, buffer, faded: false };
}

describe("ghost phase + dial math", () => {
  test("ghost phase loops forever across lap boundaries", () => {
    const ghost = makeGhost(10, 0, [
      [0, 0],
      [5, 0.5],
      [10, 1],
    ]);
    expect(ghostPhaseAt(ghost, 5)).toBeCloseTo(0.5, 5);
    expect(ghostPhaseAt(ghost, 15)).toBeCloseTo(0.5, 5);
    expect(ghostPhaseAt(ghost, 25)).toBeCloseTo(0.5, 5);
  });

  test("ghostPositionAt returns null for a zero-duration ghost", () => {
    const ghost = makeGhost(0, 0, [[0, 0]]);
    expect(ghostPositionAt(ghost, 5)).toBeNull();
  });

  test("dialTicks reports one tick per ghost with its color and faded state", () => {
    const active = makeGhost(10, 0, [[0, 0]]);
    const faded = { ...makeGhost(10, 0, [[0, 0.3]]), faded: true };
    const ticks = dialTicks([active, faded], 3);
    expect(ticks.length).toBe(2);
    expect(ticks[1]!.faded).toBe(true);
  });

  test("glow tiers escalate as a ghost gets closer", () => {
    expect(ghostGlowTier(30)).toBe(0);
    expect(ghostGlowTier(10)).toBe(1);
    expect(ghostGlowTier(2)).toBe(2);
  });

  test("forecastCollision finds a future meeting point when player and ghost phases will align", () => {
    const ghost = makeGhost(10, 0, [
      [0, 0.5],
      [10, 0.5],
    ]);
    const hit = forecastCollision(0.1, 0.08, [ghost], 0);
    expect(hit).not.toBeNull();
    expect(hit!.lapIndex).toBe(1);
    expect(hit!.secondsAhead).toBeGreaterThan(0);
  });

  test("forecastCollision returns null when the player is stationary", () => {
    const ghost = makeGhost(10, 0, [[0, 0.5]]);
    expect(forecastCollision(0.1, 0, [ghost], 0)).toBeNull();
  });

  test("forecastCollision ignores faded ghosts", () => {
    const ghost = { ...makeGhost(10, 0, [[0, 0.5]]), faded: true };
    expect(forecastCollision(0.1, 0.08, [ghost], 0)).toBeNull();
  });
});
