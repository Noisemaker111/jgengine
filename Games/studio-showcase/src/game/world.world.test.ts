import { describe, expect, test } from "bun:test";

import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { resolveVolumetricClouds } from "@jgengine/core/world/volumetricClouds";
import { resolveSoilObject } from "@jgengine/core/world/soilKind";

import { collectAuthoredTriggers } from "@jgengine/core/scene/authoredTriggers";

import { editorLayers } from "../editorLayers";
import { world } from "../world";
import "../game/triggers";

describe("studio-showcase world", () => {
  const summary = summarizeEnvironment(world);
  test("renders a populated scene", () => expect(summary.isEmpty).toBe(false));
  test("has relief terrain, not a flat plane", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.max).toBeGreaterThan(summary.terrain?.height.min ?? 0);
  });

  test("sky carries a volumetric cloud layer, off-by-default primitive turned on here", () => {
    expect(world.sky?.volumetricClouds).toBeDefined();
    const rules = resolveVolumetricClouds(world.sky?.volumetricClouds);
    expect(rules.coverage).toBeGreaterThan(0);
    expect(rules.coverage).toBeLessThanOrEqual(1);
    expect(rules.seed).toBe("showcase-clouds");
  });
});

describe("studio-showcase authored studios", () => {
  test("the water, grass, and soil studios are all authored as volumes", () => {
    const kinds = editorLayers.volumes.map((volume) => volume.kind);
    expect(kinds).toContain("water");
    expect(kinds).toContain("grass_field");
    expect(kinds).toContain("soil");
  });

  test("the soil patch resolves to a footprint with cracked/mossy rules", () => {
    const soilVolume = editorLayers.volumes.find((volume) => volume.kind === "soil");
    expect(soilVolume).toBeDefined();
    const resolved = resolveSoilObject(soilVolume!);
    expect(resolved).not.toBeNull();
    expect(resolved!.rules.crackIntensity).toBeGreaterThan(0);
    expect(resolved!.rules.mossCoverage).toBeGreaterThan(0);
  });

  test("announce zone carries an authored enter trigger for the announce action", () => {
    const triggers = collectAuthoredTriggers(editorLayers);
    const announce = triggers.find((trigger) => trigger.sourceId === "announce_zone");
    expect(announce).toBeDefined();
    expect(announce?.on).toBe("enter");
    expect(announce?.action).toBe("announce");
    expect(announce?.params.message).toBe("Welcome — authored trigger fired");
  });
});
