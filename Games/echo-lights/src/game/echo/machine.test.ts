import { describe, expect, test } from "bun:test";

import {
  ADVANCE_DELAY_SECONDS,
  SPEED_UP_LENGTHS,
  TIER_TIMING,
  speedTier,
  type PadIndex,
} from "./catalog";
import { pressPad, startRun, tickEcho, type EchoState } from "./machine";
import { sequencePads } from "./sequence";

function playThrough(state: EchoState): EchoState {
  let current = state;
  let guard = 0;
  while (current.phase === "watch") {
    if (current.nextAt === null) throw new Error("watch phase lost its schedule");
    current = tickEcho(current, current.nextAt);
    guard += 1;
    if (guard > 200) throw new Error("playback never reached recall");
  }
  return current;
}

function echoRound(state: EchoState, from: number): EchoState {
  let current = state;
  let now = from;
  for (const pad of current.sequence) {
    now += 0.4;
    current = pressPad(current, pad, now);
  }
  return current;
}

function wrongPad(expected: PadIndex): PadIndex {
  return (((expected as number) + 1) % 4) as PadIndex;
}

describe("speed tiering", () => {
  test("playback speeds up exactly at lengths 5, 9, and 13", () => {
    expect(SPEED_UP_LENGTHS).toEqual([5, 9, 13]);
    expect(speedTier(1)).toBe(0);
    expect(speedTier(4)).toBe(0);
    expect(speedTier(5)).toBe(1);
    expect(speedTier(8)).toBe(1);
    expect(speedTier(9)).toBe(2);
    expect(speedTier(12)).toBe(2);
    expect(speedTier(13)).toBe(3);
    expect(speedTier(30)).toBe(3);
  });

  test("each tier lights pads faster than the one before", () => {
    for (let tier = 1; tier < TIER_TIMING.length; tier += 1) {
      expect(TIER_TIMING[tier]!.lit).toBeLessThan(TIER_TIMING[tier - 1]!.lit);
      expect(TIER_TIMING[tier]!.gap).toBeLessThan(TIER_TIMING[tier - 1]!.gap);
    }
  });

  test("watch playback uses the timing of the current sequence length", () => {
    let state: EchoState = {
      ...startRun("classic", "tier-check", false, 0),
      sequence: sequencePads("tier-check", 5),
    };
    if (state.nextAt === null) throw new Error("missing schedule");
    const t0 = state.nextAt;
    state = tickEcho(state, t0);
    expect(state.litUntil - t0).toBeCloseTo(TIER_TIMING[1]!.lit, 5);
    expect((state.nextAt ?? 0) - t0).toBeCloseTo(TIER_TIMING[1]!.lit + TIER_TIMING[1]!.gap, 5);
  });
});

describe("sequence growth and verification", () => {
  test("a run starts with a single-step sequence in watch phase", () => {
    const state = startRun("classic", "growth", false, 10);
    expect(state.sequence).toHaveLength(1);
    expect(state.phase).toBe("watch");
    expect(state.completed).toBe(0);
    expect(state.nextAt).toBeGreaterThan(10);
  });

  test("playback lights every step in order, then hands over to recall", () => {
    let state: EchoState = {
      ...startRun("classic", "playback", false, 0),
      sequence: sequencePads("playback", 4),
    };
    const litOrder: PadIndex[] = [];
    let guard = 0;
    while (state.phase === "watch") {
      if (state.nextAt === null) throw new Error("watch phase lost its schedule");
      const before = state.playIndex;
      state = tickEcho(state, state.nextAt);
      if (state.playIndex > before && state.litPad !== null) litOrder.push(state.litPad);
      guard += 1;
      if (guard > 50) throw new Error("playback never finished");
    }
    expect(litOrder).toEqual([...state.sequence]);
    expect(state.phase).toBe("recall");
    expect(state.inputIndex).toBe(0);
  });

  test("echoing the full sequence completes the round and grows it by one", () => {
    let state = playThrough(startRun("classic", "grow-one", false, 0));
    state = echoRound(state, 100);
    expect(state.phase).toBe("advance");
    expect(state.completed).toBe(1);

    if (state.nextAt === null) throw new Error("advance lost its schedule");
    const grown = tickEcho(state, state.nextAt);
    expect(grown.phase).toBe("watch");
    expect(grown.sequence).toHaveLength(2);
    expect(grown.sequence[0]).toBe(state.sequence[0]!);
    expect(grown.inputIndex).toBe(0);
    expect(grown.playIndex).toBe(0);
  });

  test("three clean rounds reach round 4 with the seeded prefix intact", () => {
    let state = startRun("classic", "marathon", false, 0);
    for (let round = 1; round <= 3; round += 1) {
      state = playThrough(state);
      state = echoRound(state, 1000 * round);
      expect(state.completed).toBe(round);
      if (state.nextAt === null) throw new Error("advance lost its schedule");
      state = tickEcho(state, state.nextAt);
    }
    expect(state.sequence).toEqual(sequencePads("marathon", 4));
  });

  test("a correct partial echo advances inputIndex without ending the round", () => {
    let state = playThrough({
      ...startRun("classic", "partial", false, 0),
      sequence: sequencePads("partial", 3),
    });
    state = pressPad(state, state.sequence[0]!, 50);
    expect(state.phase).toBe("recall");
    expect(state.inputIndex).toBe(1);
    expect(state.litKind).toBe("press");
  });

  test("pad presses are ignored outside the recall phase", () => {
    const watching = startRun("classic", "locked", false, 0);
    expect(pressPad(watching, 0, 1)).toBe(watching);

    const advanced = echoRound(playThrough(watching), 10);
    expect(advanced.phase).toBe("advance");
    expect(pressPad(advanced, 0, 11)).toBe(advanced);
  });

  test("the advance pause matches the catalog delay", () => {
    const state = echoRound(playThrough(startRun("classic", "pause", false, 0)), 40);
    expect(state.phase).toBe("advance");
    expect(state.nextAt).not.toBeNull();
    expect((state.nextAt ?? 0) - 40.4).toBeCloseTo(ADVANCE_DELAY_SECONDS, 5);
  });
});

describe("strict classic fail", () => {
  test("one wrong pad ends the run and freezes the completed length", () => {
    let state = startRun("classic", "strict", false, 0);
    state = playThrough(state);
    state = echoRound(state, 100);
    if (state.nextAt === null) throw new Error("advance lost its schedule");
    state = playThrough(tickEcho(state, state.nextAt));

    const failed = pressPad(state, wrongPad(state.sequence[0]!), 200);
    expect(failed.phase).toBe("over");
    expect(failed.completed).toBe(1);
    expect(failed.missPad).toBe(wrongPad(state.sequence[0]!));
    expect(failed.litKind).toBe("miss");
    expect(failed.nextAt).toBeNull();
  });

  test("a wrong pad on the very first round scores zero", () => {
    const state = playThrough(startRun("classic", "instant-loss", false, 0));
    const failed = pressPad(state, wrongPad(state.sequence[0]!), 5);
    expect(failed.phase).toBe("over");
    expect(failed.completed).toBe(0);
  });

  test("a finished run ignores further ticks and presses", () => {
    const state = playThrough(startRun("classic", "dead", false, 0));
    const failed = pressPad(state, wrongPad(state.sequence[0]!), 5);
    expect(pressPad(failed, 0, 6)).toBe(failed);
    const later = tickEcho(failed, 60);
    expect(later.phase).toBe("over");
    expect(later.sequence).toEqual(failed.sequence);
  });
});

describe("practice replay", () => {
  test("a miss replays the same sequence instead of ending the run", () => {
    let state = playThrough(startRun("practice", "forgiving", false, 0));
    const sequence = state.sequence;
    state = pressPad(state, wrongPad(sequence[0]!), 5);
    expect(state.phase).toBe("replay");
    expect(state.nextAt).not.toBeNull();
    expect(state.litKind).toBe("miss");

    if (state.nextAt === null) throw new Error("replay lost its schedule");
    state = tickEcho(state, state.nextAt);
    expect(state.phase).toBe("watch");
    expect(state.playIndex).toBe(0);
    expect(state.sequence).toEqual(sequence);

    state = playThrough(state);
    expect(state.phase).toBe("recall");
    expect(state.inputIndex).toBe(0);
  });

  test("practice still grows the sequence after a clean echo", () => {
    let state = playThrough(startRun("practice", "practice-grow", false, 0));
    state = pressPad(state, wrongPad(state.sequence[0]!), 5);
    if (state.nextAt === null) throw new Error("replay lost its schedule");
    state = playThrough(tickEcho(state, state.nextAt));

    state = echoRound(state, 50);
    expect(state.phase).toBe("advance");
    if (state.nextAt === null) throw new Error("advance lost its schedule");
    state = tickEcho(state, state.nextAt);
    expect(state.sequence).toHaveLength(2);
  });

  test("a miss never marks practice as over", () => {
    let state = playThrough(startRun("practice", "never-over", false, 0));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      state = pressPad(state, wrongPad(state.sequence[0]!), 10 + attempt);
      expect(state.phase).toBe("replay");
      if (state.nextAt === null) throw new Error("replay lost its schedule");
      state = playThrough(tickEcho(state, state.nextAt));
    }
    expect(state.phase).toBe("recall");
    expect(state.completed).toBe(0);
  });
});

describe("lit pad lifecycle", () => {
  test("a lit pad goes dark once its window passes", () => {
    let state: EchoState = startRun("classic", "lit", false, 0);
    if (state.nextAt === null) throw new Error("missing schedule");
    state = tickEcho(state, state.nextAt);
    expect(state.litPad).not.toBeNull();
    const dark = tickEcho(state, state.litUntil + 10);
    expect(dark.litPad).toBeNull();
    expect(dark.litKind).toBeNull();
  });

  test("ticks between events leave the state untouched by reference", () => {
    const state = startRun("classic", "steady", false, 0);
    expect(tickEcho(state, 0.01)).toBe(state);
  });
});
