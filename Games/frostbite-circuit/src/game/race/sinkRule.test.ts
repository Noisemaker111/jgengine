import { describe, expect, test } from "bun:test";

import { createIceWorld, withIceCell } from "../ice/grid";
import { checkSink, resolveSink, MAX_SINKS_BEFORE_LOSS, SINK_TIME_PENALTY_SECONDS } from "./sinkRule";

describe("sink detection + respawn penalty", () => {
  test("open water sinks, solid and cracked ice do not", () => {
    const base = createIceWorld({ cellSize: 2, originX: 0, originZ: 0, width: 4, height: 4 });
    const solid = withIceCell(base, 1, 1, { status: "solid", corridor: "mid", corner: 0, crossedThisLap: false });
    const open = withIceCell(base, 1, 1, { status: "open", corridor: "mid", corner: 0, crossedThisLap: false });

    expect(checkSink(solid, [2, 0, 2])).toBe(false);
    expect(checkSink(open, [2, 0, 2])).toBe(true);
  });

  test("resolving a sink applies the +6s time penalty and increments the counter", () => {
    const outcome = resolveSink(0, { position: [5, 0, 5], heading: 1.2 });
    expect(outcome.sinkCount).toBe(1);
    expect(outcome.timePenalty).toBe(SINK_TIME_PENALTY_SECONDS);
    expect(outcome.respawn.position).toEqual([5, 0, 5]);
    expect(outcome.lostToSinking).toBe(false);
  });

  test("the fourth sink ends the race", () => {
    const outcome = resolveSink(MAX_SINKS_BEFORE_LOSS - 1, { position: [0, 0, 0], heading: 0 });
    expect(outcome.sinkCount).toBe(MAX_SINKS_BEFORE_LOSS);
    expect(outcome.lostToSinking).toBe(true);
  });
});
