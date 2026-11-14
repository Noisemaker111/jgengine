import { describe, expect, test } from "bun:test";

import { COMPACTOR_ENTITY } from "./entities/catalog";
import { flockModels } from "./models";
import { editorLayers } from "../editorLayers";
import { FOUNDRY_CREDITS } from "./credits";

describe("Aisle 9 ambient life", () => {
  const simulation = editorLayers.simulation;

  test("freezer fog rolls off the frozen section and the scrubber's suds and spray follow the shutters", () => {
    const emitters = simulation?.emitters ?? [];
    const fog = emitters.filter((emitter) => emitter.id.startsWith("freezer-fog-"));
    expect(fog.length).toBeGreaterThanOrEqual(6);
    for (const emitter of fog) expect(emitter.position.z).toBeGreaterThanOrEqual(150);
    for (const emitter of fog) expect(emitter.position.z).toBeLessThanOrEqual(300);
    for (const id of ["scrubber-suds", "scrubber-spray"]) expect(emitters.find((emitter) => emitter.id === id)?.options?.follow).toBe(COMPACTOR_ENTITY);
  });

  test("every authored pigeon habitat has a species model", () => {
    const habitats = simulation?.habitats ?? [];
    expect(habitats.length).toBeGreaterThan(0);
    for (const habitat of habitats) expect(flockModels[habitat.species]).toBeDefined();
  });

  test("the shelving runs and floor decals are authored markers, not code", () => {
    const kinds = new Map<string, number>();
    for (const marker of editorLayers.markers) kinds.set(marker.kind, (kinds.get(marker.kind) ?? 0) + 1);
    expect(kinds.get("decal") ?? 0).toBeGreaterThan(30);
    const shelving = editorLayers.markers.filter((marker) => marker.id.startsWith("d04-"));
    expect(shelving.length).toBeGreaterThan(80);
    expect(new Set(shelving.map((marker) => marker.catalogId))).toEqual(new Set(["prop_gondola", "prop_freezer", "prop_gondola_tall", "prop_pallet_stack"]));
  });

  test("the credits name the sky, the grade and both fonts", () => {
    const text = JSON.stringify(FOUNDRY_CREDITS);
    for (const needle of ["Industrial Workshop Foundry", "Vivid pop", "Lilita One", "Nunito"]) expect(text).toContain(needle);
  });
});
