import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { generatorVariants, runGenerator } from "@jgengine/core/generator/generator";
import { getGeneratorPreview } from "@jgengine/core/generator/generatorPreview.draw";
import { RACE_CIRCUIT_GENERATOR } from "@jgengine/core/roads/raceCircuit";
import { STREET_NETWORK_GENERATOR } from "@jgengine/core/roads/streetGenerator";
import { streetLayersDraw, streetPreviewLayers } from "@jgengine/core/roads/streetNetworkPreview.draw";
import type { EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";

import { CITY_GENERATOR } from "./cityKind";
import { registerCityRenderer } from "./CityRenderer.draw";

describe("city, street and race circuit variant tiles", () => {
  test("the city draw half registers a tile preview for each generator's output family", () => {
    registerCityRenderer();
    for (const definition of [CITY_GENERATOR, STREET_NETWORK_GENERATOR, RACE_CIRCUIT_GENERATOR]) {
      const preview = getGeneratorPreview(definition.output);
      expect(preview).toBeDefined();
      const variant = generatorVariants(definition, { seed: "tile" }, { count: 1 })[0]!;
      const frame = preview!.frame({ definition, variant });
      expect(frame.distance).toBeGreaterThan(100);
    }
  });

  test("a race tile lays the lap over the streets and mounts and disposes cleanly", () => {
    const race = runGenerator(RACE_CIRCUIT_GENERATOR, { seed: "tile" });
    const layers = streetPreviewLayers(race.network, race.route);
    expect(layers.map((layer) => layer.color)).toEqual(["#3c4148", "#d8402f"]);
    const scene = new THREE.Scene();
    // type-escape: the draw reads only `scene` from the frame state.
    const state = { scene } as unknown as EngineFrameState;
    const draw = streetLayersDraw(layers, 200, 200);
    draw.mount?.(state);
    const meshes: THREE.Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    expect(meshes.length).toBe(3);
    draw.dispose?.(state);
    expect(scene.children.length).toBe(0);
  });
});
