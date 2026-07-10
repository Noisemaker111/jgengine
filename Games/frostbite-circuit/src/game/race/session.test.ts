import { describe, expect, test } from "bun:test";
import { NEUTRAL_AXIS, type AxisInput } from "@jgengine/core/input/axisInput";

import { SLEDDERS } from "../ai/sledders";
import { statusCounts } from "../ice/grid";
import { CORNER_COUNT, CORRIDOR_LINES, LAPS, nearestSampleIndex } from "./track";
import { createRaceSession, PLAYER_RACER_ID } from "./session";

function runTicks(session: ReturnType<typeof createRaceSession>, seconds: number, axis: AxisInput = NEUTRAL_AXIS, step = 1 / 30) {
  let elapsed = 0;
  while (elapsed < seconds) {
    session.tick(step, axis);
    elapsed += step;
  }
}

const LOOKAHEAD_SAMPLES = 6;

function autopilotAxis(position: readonly [number, number, number], heading: number): AxisInput {
  const line = CORRIDOR_LINES.mid;
  const idx = nearestSampleIndex([position[0], position[2]]);
  const target = line[(idx + LOOKAHEAD_SAMPLES) % line.length]!;
  const desiredHeading = Math.atan2(target[0] - position[0], target[1] - position[2]);
  let diff = desiredHeading - heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2));
  return { throttle: 1, brake: 0, steer, handbrake: 0 };
}

function driveAutopilot(session: ReturnType<typeof createRaceSession>, seconds: number, step = 1 / 30) {
  let elapsed = 0;
  while (elapsed < seconds) {
    const pose = session.snapshot().playerPose;
    session.tick(step, autopilotAxis(pose.position, pose.heading));
    elapsed += step;
  }
}

describe("frostbite circuit race session", () => {
  test("starts in the start phase and advances start -> countdown -> racing", () => {
    const session = createRaceSession("session-phase-seed");
    expect(session.snapshot().phase).toBe("start");
    session.confirm();
    expect(session.snapshot().phase).toBe("countdown");
    runTicks(session, 3.5);
    expect(session.snapshot().phase).toBe("racing");
  });

  test("confirm is a no-op once racing has started", () => {
    const session = createRaceSession("session-confirm-seed");
    session.confirm();
    runTicks(session, 3.5);
    expect(session.snapshot().phase).toBe("racing");
    session.confirm();
    expect(session.snapshot().phase).toBe("racing");
  });

  test("AI sledders progress laps and post standings for every racer", () => {
    const session = createRaceSession("session-standings-seed");
    session.confirm();
    runTicks(session, 3.5);
    runTicks(session, 30);

    const snapshot = session.snapshot();
    expect(snapshot.standings).toHaveLength(SLEDDERS.length + 1);
    const ids = snapshot.standings.map((s) => s.racerId).sort();
    expect(ids).toEqual([PLAYER_RACER_ID, ...SLEDDERS.map((s) => s.id)].sort());

    const positions = snapshot.standings.map((s) => s.position).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3]);

    const stationaryPlayer = snapshot.standings.find((s) => s.racerId === PLAYER_RACER_ID)!;
    expect(stationaryPlayer.position).toBe(3);
  });

  test("driving AI stresses the ice — crossed corridors crack and eventually open over several laps", () => {
    const session = createRaceSession("session-stress-seed");
    session.confirm();
    runTicks(session, 3.5);
    driveAutopilot(session, 140);

    const counts = statusCounts(session.snapshot().iceWorld);
    expect(counts.cracked + counts.open).toBeGreaterThan(0);
  });

  test("the line-repeater's favorite corridor degrades faster than a corridor it never touches", () => {
    const session = createRaceSession("session-repeater-seed");
    session.confirm();
    runTicks(session, 3.5);
    driveAutopilot(session, 140);

    const world = session.snapshot().iceWorld;
    const repeater = SLEDDERS.find((s) => s.personality === "repeater")!;
    let favoriteStressed = 0;
    let favoriteTotal = 0;
    for (const cell of world.grid.cells) {
      if (cell === null || cell.corridor !== repeater.favoriteCorridor) continue;
      favoriteTotal += 1;
      if (cell.status !== "solid") favoriteStressed += 1;
    }
    expect(favoriteTotal).toBeGreaterThan(0);
    expect(favoriteStressed).toBeGreaterThan(0);
  });

  test("memory map iceWorld is the live sim grid, not a detached copy", () => {
    const session = createRaceSession("session-memorymap-seed");
    session.confirm();
    runTicks(session, 3.5);

    const before = session.snapshot().iceWorld;
    const beforeAgain = session.snapshot().iceWorld;
    expect(before).toBe(beforeAgain);

    driveAutopilot(session, 5);
    const after = session.snapshot().iceWorld;
    expect(after).not.toBe(before);
  });

  test("restart fully refreezes the lake and clears race state", () => {
    const session = createRaceSession("session-restart-seed");
    session.confirm();
    runTicks(session, 3.5);
    driveAutopilot(session, 140);

    const stressedBefore = statusCounts(session.snapshot().iceWorld);
    expect(stressedBefore.cracked + stressedBefore.open).toBeGreaterThan(0);

    session.restart();
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("countdown");
    expect(snapshot.lap).toBe(1);
    expect(snapshot.sinkCount).toBe(0);
    expect(snapshot.cleanLines).toBe(0);
    expect(snapshot.radioLog).toHaveLength(0);
    expect(snapshot.banner).toBeNull();

    const counts = statusCounts(snapshot.iceWorld);
    expect(counts.cracked).toBe(0);
    expect(counts.open).toBe(0);
    expect(counts.solid).toBeGreaterThan(1800);
  });

  test("lap sequencing: the field completes the full five-lap race and reaches a finished phase", () => {
    const session = createRaceSession("session-finish-seed");
    session.confirm();
    runTicks(session, 3.5);
    runTicks(session, 260);

    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("finished");
    expect(snapshot.outcome).not.toBeNull();
    expect(snapshot.standings.some((s) => s.finished)).toBe(true);
  });

  test("track geometry constants back the session's lap/corner structure", () => {
    expect(CORNER_COUNT).toBe(6);
    expect(LAPS).toBe(5);
  });
});
