import { describe, expect, test } from "bun:test";

import { COMPACTOR_ENTITY } from "./entities/catalog";
import { flockModels } from "./models";
import { editorLayers } from "../editorLayers";
import { FOUNDRY_CREDITS } from "./credits";

describe("drift-foundry ambient life", () => {
  const simulation = editorLayers.simulation;

  test("smoke columns stand over the dumps and sparks and heat follow the compactor", () => {
    const emitters = simulation?.emitters ?? [];
    expect(emitters.filter((emitter) => emitter.effect === "smoke/plume").length).toBeGreaterThanOrEqual(6);
    for (const id of ["compactor-sparks", "compactor-heat"]) expect(emitters.find((emitter) => emitter.id === id)?.options?.follow).toBe(COMPACTOR_ENTITY);
  });

  test("every authored gull habitat has a species model", () => {
    const habitats = simulation?.habitats ?? [];
    expect(habitats.length).toBeGreaterThan(0);
    for (const habitat of habitats) expect(flockModels[habitat.species]).toBeDefined();
  });

  test("the wreck walls and ground decals are authored markers, not code", () => {
    const kinds = new Map<string, number>();
    for (const marker of editorLayers.markers) kinds.set(marker.kind, (kinds.get(marker.kind) ?? 0) + 1);
    expect(kinds.get("decal") ?? 0).toBeGreaterThan(30);
    expect(editorLayers.markers.filter((marker) => marker.id.startsWith("d04-")).length).toBeGreaterThan(80);
  });

  test("the credits name the sky, the grade and both fonts", () => {
    const text = JSON.stringify(FOUNDRY_CREDITS);
    for (const needle of ["Industrial Sunset", "Bleach bypass, warm", "Saira Stencil One", "Barlow Condensed"]) expect(text).toContain(needle);
  });
});
