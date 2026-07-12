import { describe, expect, test } from "bun:test";

import { mtof, notesInWindow, themeLoopSeconds, type MusicTheme } from "./music";

const theme: MusicTheme = {
  id: "t",
  bpm: 120,
  bars: 1,
  events: [
    { beat: 0, midi: 60, dur: 1, vel: 1, inst: "piano" },
    { beat: 2, midi: 64, dur: 1, vel: 1, inst: "piano" },
  ],
};

describe("mtof", () => {
  test("A4 is 440", () => expect(mtof(69)).toBeCloseTo(440, 6));
  test("octave up doubles", () => expect(mtof(81)).toBeCloseTo(880, 6));
});

describe("themeLoopSeconds", () => {
  test("1 bar at 120bpm is 2s", () => expect(themeLoopSeconds(theme)).toBeCloseTo(2, 6));
});

describe("notesInWindow", () => {
  test("returns notes whose onset falls in the window", () => {
    const hits = notesInWindow(theme, 0, -0.001, 0.5);
    expect(hits.map((h) => h.event.midi)).toEqual([60]);
    expect(hits[0]?.when).toBeCloseTo(0, 6);
  });

  test("beat 2 at 120bpm lands at 1s", () => {
    const hits = notesInWindow(theme, 0, 0.5, 1.5);
    expect(hits.map((h) => h.event.midi)).toEqual([64]);
    expect(hits[0]?.when).toBeCloseTo(1, 6);
  });

  test("wraps into the next loop", () => {
    const hits = notesInWindow(theme, 0, 1.9, 2.1);
    expect(hits.map((h) => h.event.midi)).toEqual([60]);
    expect(hits[0]?.when).toBeCloseTo(2, 6);
  });

  test("respects a non-zero anchor", () => {
    const hits = notesInWindow(theme, 10, 10.5, 11.5);
    expect(hits.map((h) => h.event.midi)).toEqual([64]);
    expect(hits[0]?.when).toBeCloseTo(11, 6);
  });

  test("non-overlapping windows partition every occurrence exactly once", () => {
    const seen: number[] = [];
    for (let w = 0; w < 8; w += 1) {
      const hits = notesInWindow(theme, 0, w * 0.5 - 1e-9, (w + 1) * 0.5 - 1e-9);
      seen.push(...hits.map((h) => h.event.midi));
    }
    expect(seen).toEqual([60, 64, 60, 64]);
  });
});
