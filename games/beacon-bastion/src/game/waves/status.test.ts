import { describe, expect, test } from "bun:test";

import { ENCOUNTER } from "./manifest";
import { bossLine, nextWaveIndex, tierLabel, waveCompositionLine, wavePreviewLine, waveStatusLine } from "./status";

describe("waveStatusLine", () => {
  test("before the first release the widget says the wave is ready", () => {
    expect(waveStatusLine({ started: false, releasing: false, wave: 1, alive: 0 })).toBe("Wave 1 · ready to release");
  });

  test("while tech is on the street the count is shown with the wave", () => {
    expect(waveStatusLine({ started: true, releasing: true, wave: 1, alive: 12 })).toBe("Wave 1 · 12 gadgets left");
    expect(waveStatusLine({ started: true, releasing: false, wave: 2, alive: 1 })).toBe("Wave 2 · 1 gadget left");
  });

  test("a running wave with nothing on the street yet is not reported as zero gadgets", () => {
    expect(waveStatusLine({ started: true, releasing: true, wave: 1, alive: 0 })).toBe("Wave 1 · tech incoming");
  });

  test("between waves with an empty field the widget reports it clear", () => {
    expect(waveStatusLine({ started: true, releasing: false, wave: 3, alive: 0 })).toBe("Wave 3 · street clear");
  });
});

describe("wavePreviewLine", () => {
  test("names the next wave and what walks in it, before it is released", () => {
    const line = wavePreviewLine(ENCOUNTER.waves[0]!, 1);
    expect(line.startsWith("Next · Push Notifications")).toBe(true);
    expect(line).toContain("6 Earbuds");
    expect(line).toContain("3 Smartphones");
  });

  test("a boss wave says so once, by the boss's own name", () => {
    const line = wavePreviewLine(ENCOUNTER.waves[11]!, 12);
    expect(line).toContain("· BOSS THE DATA CENTER");
    expect(line.match(/THE DATA CENTER/g)).toHaveLength(2);
    expect(wavePreviewLine(ENCOUNTER.waves[5]!, 6)).toContain("· BOSS Server Rack");
    expect(wavePreviewLine(ENCOUNTER.waves[5]!, 6).match(/Server Rack/g)).toHaveLength(1);
  });

  test("the preview follows the release button, not the open wave", () => {
    expect(nextWaveIndex(false, 1)).toBe(0);
    expect(nextWaveIndex(true, 7)).toBe(7);
    expect(ENCOUNTER.waves[nextWaveIndex(true, 7)]!.label).toBe(ENCOUNTER.waves[7]!.label);
  });

  test("a composed wave is named by its pattern and lists real tech", () => {
    const line = wavePreviewLine(ENCOUNTER.waves[6]!, 7);
    expect(line).toMatch(/Graphics Card Shortage|Mining Season|Autonomous Traffic|Large Language Model|Internet of Things/);
    expect(line).not.toContain("tech_");
  });

  test("past the last wave there is nothing to promise", () => {
    expect(wavePreviewLine(null, 12)).toBe("Nothing else is coming — hold the street");
  });
});

describe("bossLine", () => {
  test("reads the boss, its phase and whether a tell is running", () => {
    expect(bossLine({ unitId: "boss_datacenter", state: { phaseId: "overload", tellId: "overload" } })).toBe(
      "THE DATA CENTER — Overloaded (telegraphing)",
    );
    expect(bossLine(null)).toBeNull();
  });
});
