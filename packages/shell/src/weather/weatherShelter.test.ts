import { expect, test } from "bun:test";
import type { EditorVolume } from "@jgengine/core/editor/types";
import { createWeatherShelterUniforms, updateWeatherShelters, WEATHER_SHELTER_BUDGET } from "./weatherShelter";

const box = (id: string, x: number): EditorVolume => ({ id, kind: "shelter", shape: "box", center: { x, y: 1, z: 0 }, halfExtents: { x: 2, y: 2, z: 2 }, meta: { exposure: 0.25 } });

test("shelter clipping packs world y-up shapes, bounds work and selects closest volumes", () => {
  const uniforms = createWeatherShelterUniforms();
  const identity = uniforms.shelterCenters.value[0];
  const shelters = Array.from({ length: 100 }, (_, i) => box(String(i), i * 10));
  updateWeatherShelters(uniforms, shelters, 900, 1, 0);
  expect(uniforms.shelterCount.value).toBe(WEATHER_SHELTER_BUDGET);
  expect(uniforms.shelterCenters.value[0]!.x).toBe(900);
  expect(uniforms.shelterShapes.value[0]!.toArray()).toEqual([2, 2, 2, 0.25]);
  updateWeatherShelters(uniforms, shelters, 0, 1, 0);
  expect(uniforms.shelterCenters.value[0]).toBe(identity);
  expect(uniforms.shelterCenters.value[0]!.x).toBe(0);
  updateWeatherShelters(uniforms, [], 0, 0, 0);
  expect(uniforms.shelterCount.value).toBe(0);
});
