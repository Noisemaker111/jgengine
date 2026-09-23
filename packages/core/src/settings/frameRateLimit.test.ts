import { describe, expect, it } from "bun:test";

import { paceFrame, readFrameRateLimit } from "./frameRateLimit";

function run(displayHz: number, fps: number, seconds: number): number {
  let anchor = 0;
  let rendered = 0;
  for (let frame = 1; frame <= displayHz * seconds; frame++) {
    const t = (frame * 1000) / displayHz;
    const next = paceFrame(t, anchor, fps);
    if (next === null) continue;
    anchor = next;
    rendered += 1;
  }
  return rendered;
}

describe("paceFrame", () => {
  it("renders every refresh when uncapped", () => {
    expect(run(144, 0, 1)).toBe(144);
  });

  it("holds the cap on a faster display without drifting low", () => {
    expect(run(144, 60, 10)).toBeGreaterThanOrEqual(595);
    expect(run(144, 60, 10)).toBeLessThanOrEqual(601);
    expect(run(240, 30, 10)).toBeGreaterThanOrEqual(298);
  });

  it("never skips when the cap matches the display", () => {
    expect(run(60, 60, 2)).toBe(120);
  });

  it("re-anchors after a long stall instead of bursting", () => {
    expect(paceFrame(5000, 0, 60)).toBe(5000);
  });
});

describe("readFrameRateLimit", () => {
  it("maps display and junk to 0 and numbers to fps", () => {
    const store = (value: unknown) => ({ get: <T,>(_id: string, _fallback: T) => value as T });
    expect(readFrameRateLimit(store("display"))).toBe(0);
    expect(readFrameRateLimit(store("nope"))).toBe(0);
    expect(readFrameRateLimit(store("120"))).toBe(120);
  });
});
