import { describe, expect, test } from "bun:test";
import type { RecordingFrame } from "@jgengine/core/sensor/recordingBuffer";

import { paceDelta } from "./pace";
import type { GhostFrameData } from "./types";

function frame(t: number, s: number): RecordingFrame<GhostFrameData> {
  return { t, data: { x: 0, y: 0, z: 0, headingRad: 0, s } };
}

const PREVIOUS_LAP: readonly RecordingFrame<GhostFrameData>[] = [
  frame(0, 0),
  frame(10, 0.25),
  frame(20, 0.5),
  frame(30, 0.75),
  frame(40, 1),
];

describe("pace delta", () => {
  test("unknown when there is no previous lap yet", () => {
    expect(paceDelta(null, 5, 0.1).status).toBe("unknown");
  });

  test("ahead when the current lap reaches the same track position sooner", () => {
    const reading = paceDelta(PREVIOUS_LAP, 8, 0.25);
    expect(reading.status).toBe("ahead");
    expect(reading.deltaSeconds).toBeCloseTo(2, 5);
  });

  test("behind when the current lap reaches the same track position later", () => {
    const reading = paceDelta(PREVIOUS_LAP, 13, 0.25);
    expect(reading.status).toBe("behind");
    expect(reading.deltaSeconds).toBeCloseTo(-3, 5);
  });

  test("even within tolerance of the previous lap's time at this position", () => {
    const reading = paceDelta(PREVIOUS_LAP, 10.02, 0.25);
    expect(reading.status).toBe("even");
  });
});
