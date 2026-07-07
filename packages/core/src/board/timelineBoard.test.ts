import { describe, expect, test } from "bun:test";

import {
  createTimelineBoard,
  createTimelineBoardState,
  tickTimeline,
} from "@jgengine/core/board/timelineBoard";

describe("timelineBoard expiry-order resolution", () => {
  test("slots fire in cooldown-expiry order, not slot order", () => {
    const state = createTimelineBoardState([
      { id: "slow", cooldownMs: 300 },
      { id: "fast", cooldownMs: 100 },
    ]);
    const { fires } = tickTimeline(state, 350);
    expect(fires.map((f) => f.slotId)).toEqual(["fast", "fast", "slow", "fast"]);
    expect(fires.map((f) => f.atMs)).toEqual([100, 200, 300, 300]);
  });

  test("ties break by slot index", () => {
    const state = createTimelineBoardState([
      { id: "b", cooldownMs: 100 },
      { id: "a", cooldownMs: 100 },
    ]);
    const { fires } = tickTimeline(state, 100);
    expect(fires.map((f) => f.slotId)).toEqual(["b", "a"]);
  });

  test("remaining carries across ticks", () => {
    let state = createTimelineBoardState([{ id: "x", cooldownMs: 100 }]);
    let out = tickTimeline(state, 60);
    expect(out.fires).toHaveLength(0);
    state = out.state;
    out = tickTimeline(state, 60);
    expect(out.fires.map((f) => f.atMs)).toEqual([100]);
    expect(out.state.slots[0].remainingMs).toBe(80);
  });

  test("offset delays the first fire", () => {
    const state = createTimelineBoardState([{ id: "x", cooldownMs: 100, offsetMs: 250 }]);
    const { fires } = tickTimeline(state, 300);
    expect(fires.map((f) => f.atMs)).toEqual([250]);
  });

  test("disabled slots never fire", () => {
    const state = createTimelineBoardState([{ id: "x", cooldownMs: 50, enabled: false }]);
    expect(tickTimeline(state, 500).fires).toHaveLength(0);
  });

  test("rejects non-positive cooldown and duplicate ids", () => {
    expect(() => createTimelineBoardState([{ id: "x", cooldownMs: 0 }])).toThrow();
    expect(() =>
      createTimelineBoardState([
        { id: "x", cooldownMs: 10 },
        { id: "x", cooldownMs: 20 },
      ]),
    ).toThrow();
  });
});

describe("createTimelineBoard controller", () => {
  test("tick advances internal state and setEnabled gates firing", () => {
    const board = createTimelineBoard([
      { id: "a", cooldownMs: 100 },
      { id: "b", cooldownMs: 150 },
    ]);
    expect(board.tick(100).map((f) => f.slotId)).toEqual(["a"]);
    board.setEnabled("b", false);
    const fires = board.tick(200);
    expect(fires.every((f) => f.slotId === "a")).toBe(true);
  });
});
