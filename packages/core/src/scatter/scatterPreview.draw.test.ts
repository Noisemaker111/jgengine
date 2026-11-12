import { expect, test } from "bun:test";
import * as THREE from "three";

import { generatorVariants, untypedGenerator } from "../generator/generator";
import { SCATTER_GENERATOR } from "./scatterRegion";
import { scatterPreviewDraw } from "./scatterPreview.draw";

test("a scatter variant tile draws one instanced proxy per palette item over the plot", () => {
  const definition = untypedGenerator(SCATTER_GENERATOR);
  const [variant] = generatorVariants(definition, { palette: [{ item: "pine", weight: 1 }, { item: "rock", weight: 1 }], density: 0.3 }, { count: 1 });
  if (variant === undefined) throw new Error("no variant");
  const scene = new THREE.Scene();
  const draw = scatterPreviewDraw({ definition, variant });
  const state = { scene } as never;
  draw.mount?.(state);
  const instanced: THREE.InstancedMesh[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) instanced.push(object);
  });
  expect(instanced).toHaveLength(2);
  expect(instanced.reduce((sum, mesh) => sum + mesh.count, 0)).toBeGreaterThan(20);
  draw.dispose?.(state);
  expect(scene.children).toHaveLength(0);
});
