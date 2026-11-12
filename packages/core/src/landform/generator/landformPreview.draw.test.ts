import { expect, test } from "bun:test";
import * as THREE from "three";

import { generatorVariants, untypedGenerator } from "../../generator/generator";
import { defaultParamMeta } from "../../generator/paramSchema";
import { createLandformCache, createLandformGenerator, LANDFORM_SCHEMA } from "./landformGenerator";
import { landformPreviewDraw } from "./landformPreview.draw";

test("a landform variant tile draws its coarsest detail as one relief mesh, lowest ground at 0", () => {
  const definition = untypedGenerator(createLandformGenerator(createLandformCache(), { grower: null }));
  const [variant] = generatorVariants(definition, { ...defaultParamMeta(LANDFORM_SCHEMA), side: 64, cellSize: 50, years: 2e5, seed: "tile" }, { count: 1 });
  if (variant === undefined) throw new Error("no variant");
  const scene = new THREE.Scene();
  const state = { scene } as never;
  const draw = landformPreviewDraw({ definition, variant });
  draw.mount?.(state);
  const mesh = scene.children[0];
  if (!(mesh instanceof THREE.Mesh)) throw new Error("no relief mesh");
  const geometry: THREE.BufferGeometry = mesh.geometry;
  // Detail 0.25 of 64 cells per side is 16, so 16 × 16 vertices.
  expect(geometry.getAttribute("position").count).toBe(16 * 16);
  expect(geometry.getAttribute("color").count).toBe(16 * 16);
  geometry.computeBoundingBox();
  expect(geometry.boundingBox?.min.y).toBeCloseTo(0, 6);
  draw.dispose?.(state);
  expect(scene.children).toHaveLength(0);
});
