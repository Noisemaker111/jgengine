import { describe, expect, test } from "bun:test";

import { ENCOUNTER } from "./manifest";
import { bossLine, nextWaveIndex, tierLabel, waveCompositionLine, wavePreviewLine, waveStatusLine } from "./status";

describe("waveStatusLine", () => {
  test("before the first release the widget says the wave is ready", () => {
    expect(waveStatusLine({ started: false, releasing: false, wave: 1, alive: 0 })).toBe("Wave 1 · ready to release");
  });

  test("while raiders are alive the count is shown with the wave", () => {
    expect(waveStatusLine({ started: true, releasing: true, wave: 1, alive: 12 })).toBe("Wave 1 · 12 raiders left");
    expect(waveStatusLine({ started: true, releasing: false, wave: 2, alive: 1 })).toBe("Wave 2 · 1 raider left");
  });

  test("a running wave with nobody on the field yet is not reported as zero raiders", () => {
    expect(waveStatusLine({ started: true, releasing: true, wave: 1, alive: 0 })).toBe("Wave 1 · raiders incoming");
  });

  test("between waves with an empty field the widget reports it clear", () => {
    expect(waveStatusLine({ started: true, releasing: false, wave: 3, alive: 0 })).toBe("Wave 3 · field clear");
  });
});

describe("wavePreviewLine", () => {
  test("names the next wave and what walks in it, before it is released", () => {
    const line = wavePreviewLine(ENCOUNTER.waves[0]!, 1);
    expect(line.startsWith("Next · Probe")).toBe(true);
    expect(line).toContain("5 Scouts");
    expect(line).toContain("2 Grunts");
  });

  test("a boss wave says so once, by the boss's own name", () => {
    const line = wavePreviewLine(ENCOUNTER.waves[11]!, 12);
    expect(line).toContain("· BOSS The Warden");
    expect(wavePreviewLine(ENCOUNTER.waves[7]!, 8)).toContain("· BOSS The Warlord");
    expect(wavePreviewLine(ENCOUNTER.waves[7]!, 8).match(/The Warlord/g)).toHaveLength(1);
  });

  test("the preview follows the release button, not the open wave", () => {
    expect(nextWaveIndex(false, 1)).toBe(0);
    expect(nextWaveIndex(true, 7)).toBe(7);
    expect(ENCOUNTER.waves[nextWaveIndex(true, 7)]!.label).toBe(ENCOUNTER.waves[7]!.label);
  });

  test("named elites are named, never counted as anonymous elites", () => {
    const line = wavePreviewLine(ENCOUNTER.waves[6]!, 7);
    expect(line).toMatch(/Captain Ironjaw|Reaver Sable|Breaker Hollow/);
    expect(line).not.toContain("1 Captains");
  });

  test("past the last wave there is nothing to promise", () => {
    expect(wavePreviewLine(null, 12)).toBe("No further assault — hold the keep");
  });
});

describe("bossLine", () => {
  test("reads the boss, its phase and whether a tell is running", () => {
    expect(bossLine({ unitId: "raider_warlord", state: { phaseId: "enraged", tellId: "roar" } })).toBe(
      "The Warlord — Bloodied (telegraphing)",
    );
    expect(bossLine(null)).toBeNull();
  });
});
