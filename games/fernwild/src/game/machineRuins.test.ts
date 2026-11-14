import { expect, test } from "bun:test";
import { markersOfKind } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "../editorLayers";
import { fabricatorParts, fabricatorSolids, vineCurves } from "./machineRuins";

const flat = () => 2;

test("rusted fabricators stand at every beach start and a few landmarks, each a bed, gantry and lit cabinet", () => {
  const fabricators = markersOfKind(editorLayers, "fabricator");
  expect(fabricators.length).toBeGreaterThanOrEqual(10);
  const parts = fabricatorParts();
  expect(parts.some((part) => part.material === "lamp")).toBe(true);
  expect(Math.max(...parts.map((part) => part.center[1] + part.size[1] / 2))).toBeGreaterThan(6);
});

test("cable vines sag from the gantry and end on the ground; the bed is solid", () => {
  const marker = markersOfKind(editorLayers, "fabricator")[0]!;
  const vines = vineCurves(marker, flat);
  expect(vines.length).toBe(Number(marker.meta?.["vines"] ?? 5));
  for (const vine of vines) {
    expect(vine[0]![1]).toBeGreaterThan(6);
    expect(vine.at(-1)![1]).toBeCloseTo(2.05, 1);
    for (const point of vine) expect(point[1]).toBeGreaterThanOrEqual(2.05 - 1e-9);
  }
  expect(vineCurves(marker, flat)).toEqual(vines);
  const [solid] = fabricatorSolids(marker, flat);
  expect(solid!.halfExtents[0]).toBeGreaterThan(3);
});
