import { describe, expect, test } from "bun:test";
import { createRaceState, firstPastPost } from "@jgengine/core/game/race";

import { buildTrack, ringsForCourse } from "./courses";

const flatGround = () => 0;
const RACER = "drone";

function freshState() {
  const track = buildTrack("technical", flatGround);
  const state = createRaceState({ track, win: firstPastPost(1) });
  state.addRacer(RACER, 0);
  return { track, state };
}

describe("ring sequencing", () => {
  test("hitting rings in order registers each checkpoint", () => {
    const { track, state } = freshState();
    const first = track.checkpoints[0]!;
    const events = state.update(1, { [RACER]: first.center });
    expect(events.some((event) => event.type === "checkpoint.hit" && event.checkpoint === 0)).toBe(true);
  });

  test("flying straight to a later ring while skipping earlier ones is ignored", () => {
    const { track, state } = freshState();
    const third = track.checkpoints[2]!;
    const events = state.update(1, { [RACER]: third.center });
    expect(events.length).toBe(0);
    expect(state.progressOf(RACER)?.nextCheckpoint).toBe(0);
  });

  test("wrong-ring position leaves progress untouched until the correct ring is reached", () => {
    const rings = ringsForCourse("technical");
    const { track, state } = freshState();
    const wrongRing = track.checkpoints[5]!;
    state.update(1, { [RACER]: wrongRing.center });
    expect(state.progressOf(RACER)?.progress).toBe(0);

    const correctFirst = track.checkpoints[0]!;
    state.update(2, { [RACER]: correctFirst.center });
    expect(state.progressOf(RACER)?.progress).toBe(1);
    expect(rings.length).toBeGreaterThan(0);
  });

  test("same x/z at the wrong altitude does not register a hit", () => {
    const { track, state } = freshState();
    const first = track.checkpoints[0]!;
    const wrongAltitude: readonly [number, number, number] = [first.center[0], first.center[1] + 30, first.center[2]];
    const events = state.update(1, { [RACER]: wrongAltitude });
    expect(events.length).toBe(0);
  });

  test("completing every checkpoint in order finishes the race", () => {
    const { track, state } = freshState();
    let finished = false;
    track.checkpoints.forEach((checkpoint, index) => {
      const events = state.update(index + 1, { [RACER]: checkpoint.center });
      if (events.some((event) => event.type === "race.finished")) finished = true;
    });
    expect(finished).toBe(true);
    expect(state.progressOf("drone")?.finished).toBe(true);
  });
});
