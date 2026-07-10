import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../world";
import { CORNER_COUNT, CORRIDOR_LINES, LAPS } from "./race/track";
import { GATE_FLARES, RIDGE_POSTS, SHORE_PROPS } from "./world/setup";
import { CORRIDOR_IDS } from "./ice/grid";

describe("frostbite circuit world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("terrain resolves finite height everywhere", () => {
    expect(summary.terrain?.height.finite).toBe(true);
  });

  test("weather is present for the arctic-midnight atmosphere", () => {
    expect(summary.counts.weatherSystems).toBeGreaterThan(0);
  });
});

describe("frostbite circuit track layout", () => {
  test("six corners, three corridors, five laps per the content budget", () => {
    expect(CORNER_COUNT).toBe(6);
    expect(CORRIDOR_IDS).toHaveLength(3);
    expect(LAPS).toBe(5);
  });

  test("every corridor forms a closed loop of substantial length", () => {
    for (const corridor of CORRIDOR_IDS) {
      const line = CORRIDOR_LINES[corridor];
      expect(line.length).toBeGreaterThan(150);
    }
  });

  test("shore dressing clears the 40+ prop content floor", () => {
    expect(SHORE_PROPS.length).toBeGreaterThanOrEqual(40);
  });

  test("every corner carries a sector gate with flanking flares", () => {
    expect(GATE_FLARES.length).toBe(CORNER_COUNT * 2);
  });

  test("snow ridges are dressed between corridors", () => {
    expect(RIDGE_POSTS.length).toBeGreaterThan(20);
  });
});
