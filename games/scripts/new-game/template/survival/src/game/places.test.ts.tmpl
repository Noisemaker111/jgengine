import { describe, expect, test } from "bun:test";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import { campGrid, cellAt, herdMarkers, homeMarker, lairs, nodeMarkers } from "./places";
import { waveRoster } from "./waves";

describe("the authored camp", () => {
  const grid = campGrid(editorLayers);
  const home = homeMarker(editorLayers);
  const far = (x: number, z: number) => Math.hypot(x - home.position.x, z - home.position.z);

  test("you start inside the build grid, so the first build lands", () => {
    const spawn = editorLayers.markers.find((marker) => marker.kind === "player_spawn");
    expect(spawn).toBeDefined();
    expect(cellAt(grid, spawn!.position.x, spawn!.position.z)).not.toBeNull();
  });

  test("every resource has spots to gather, outside the camp", () => {
    for (const resource of idea.nodes) {
      const spots = nodeMarkers(editorLayers).filter((spot) => spot.node === resource.id);
      expect(spots.length).toBeGreaterThan(0);
      for (const spot of spots) expect(cellAt(grid, spot.x, spot.z)).toBeNull();
    }
  });

  test("herds graze away from the camp and enemies come from far off", () => {
    for (const herd of herdMarkers(editorLayers)) expect(far(herd.x, herd.z)).toBeGreaterThan(10);
    expect(lairs(editorLayers).length).toBeGreaterThan(0);
    for (const lair of lairs(editorLayers)) expect(far(lair.x, lair.z)).toBeGreaterThan(40);
  });

  test("nights get harder: each wave is at least as big as the last", () => {
    for (let wave = 2; wave <= 10; wave += 1) expect(waveRoster(wave).length).toBeGreaterThanOrEqual(waveRoster(wave - 1).length);
    expect(waveRoster(5).length).toBeGreaterThan(waveRoster(1).length);
  });
});
