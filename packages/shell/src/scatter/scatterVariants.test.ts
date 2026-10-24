import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { createModelVariantSelector } from "@jgengine/core/world/modelLod";
import { lodBandIndex } from "@jgengine/core/world/lod";
import type { ScatterInstance } from "@jgengine/core/world/scatterRegion";
import { scatterBatchInstances, type ScatterBatch } from "./InstancedScatter";
import { buildScatterModelSources, disposeScatterModelSources } from "./scatterModels";
import { scatterVariantTriangles, writeScatterVariantLevel } from "./scatterVariants";

const FULL_TRIANGLES = 9134;
const FAR_TRIANGLES = 4110;

const PALM: ModelConfig = {
  url: "mainsail-palm.glb",
  targetHeight: 7.6,
  anchor: "origin",
  variants: {
    levels: [
      { url: "mainsail-palm.glb", maxDistance: 70 },
      { url: "mainsail-palm-lod1.glb" },
    ],
  },
};

/** Fifteen palms down one line, the layout the variants test and Harbor's palm species both use. */
function palms(count = 15): ScatterInstance[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `harbor/palm/${index + 1}`,
    regionId: "harbor",
    item: "palm",
    x: 0,
    y: 0,
    z: (index + 1) * 4,
    rotationY: 0,
    scale: 1,
  }));
}

/** One-mesh GLB stand-in carrying exactly `triangles` triangles, so a drawn count is a real triangle count. */
function palmScene(triangles: number): THREE.Group {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 7.6, 0]), 3));
  const index = new Uint32Array(triangles * 3);
  for (let i = 0; i < index.length; i += 1) index[i] = i % 3;
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "#3f6b32" })));
  return root;
}

/** One 128 m chunk, so every palm lands in the same species batch the per-cell path builds. */
function oneCellBatch(instances: readonly ScatterInstance[]): ScatterBatch {
  const batches = scatterBatchInstances(instances, 128);
  expect(batches).toHaveLength(1);
  return batches[0]!;
}

/** Draws one batch through the real level pass, one instanced mesh per level, as the component does. */
function drawLevels(
  batch: ScatterBatch,
  model: ModelConfig,
  camera: THREE.Vector3,
  triangles: readonly number[],
): { counts: number[]; meshes: THREE.InstancedMesh[]; slots: THREE.Matrix4[][] } {
  const selector = createModelVariantSelector(model.variants!);
  const counts: number[] = [];
  const meshes: THREE.InstancedMesh[] = [];
  const slots: THREE.Matrix4[][] = [];
  model.variants!.levels.forEach((level, index) => {
    const harvested = buildScatterModelSources(palmScene(triangles[index]!), {
      ...model,
      url: level.url,
      variants: undefined,
    });
    expect(harvested.sources).toHaveLength(1);
    const source = harvested.sources[0]!;
    const reserved = batch.matrices.map(() => new THREE.Matrix4());
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, batch.instances.length);
    const count = writeScatterVariantLevel(index, selector, camera, batch.instances, batch.matrices, source.localMatrix, reserved);
    mesh.count = count;
    mesh.visible = count > 0;
    counts.push(count);
    meshes.push(mesh);
    slots.push(reserved);
    disposeScatterModelSources(harvested.root);
  });
  return { counts, meshes, slots };
}

describe("scatter model variants", () => {
  test("a palm species at 9,134 triangles draws the far variant past the switch and drops the triangle total", () => {
    const instances = palms();
    const batch = oneCellBatch(instances);
    expect(batch.instances).toHaveLength(15);
    const camera = new THREE.Vector3(0, 0, -50);
    const { counts, meshes, slots } = drawLevels(batch, PALM, camera, [FULL_TRIANGLES, FAR_TRIANGLES]);

    // Distances are 54..110 m from a camera parked 50 m back; the switch at 70 m leaves 54..70 near.
    expect(counts).toEqual([5, 10]);
    expect(meshes.map((mesh) => mesh.visible)).toEqual([true, true]);
    expect(counts[0]! + counts[1]!).toBe(instances.length);

    const total = scatterVariantTriangles(counts, [FULL_TRIANGLES, FAR_TRIANGLES]);
    expect(total).toBe(5 * FULL_TRIANGLES + 10 * FAR_TRIANGLES);
    expect(total).toBe(86770);
    expect(instances.length * FULL_TRIANGLES).toBe(137010);
    expect(instances.length * FULL_TRIANGLES - total).toBe(50240);

    // The far draw carries the far placements' own transforms, not a copy of the near ones.
    expect(slots[1]![0]!.elements[14]).toBeCloseTo(24, 5);
    expect(slots[1]![9]!.elements[14]).toBeCloseTo(60, 5);
    expect(slots[0]![0]!.elements[14]).toBeCloseTo(4, 5);
  });

  test("one species batch holding near and far placements keeps both levels without per-frame allocation", () => {
    const batch = oneCellBatch(palms());
    const camera = new THREE.Vector3(0, 0, -50);
    const { counts } = drawLevels(batch, PALM, camera, [FULL_TRIANGLES, FAR_TRIANGLES]);
    expect(counts[0]!).toBeGreaterThan(0);
    expect(counts[1]!).toBeGreaterThan(0);

    const selector = createModelVariantSelector(PALM.variants!);
    const reserved = batch.matrices.map(() => new THREE.Matrix4());
    const firstSlots = reserved.slice();
    const local = new THREE.Matrix4();
    for (let frame = 0; frame < 120; frame += 1) {
      writeScatterVariantLevel(0, selector, camera, batch.instances, batch.matrices, local, reserved);
      writeScatterVariantLevel(1, selector, camera, batch.instances, batch.matrices, local, reserved);
    }
    expect(reserved).toHaveLength(batch.instances.length);
    expect(reserved.every((slot, index) => slot === firstSlots[index])).toBe(true);
  });

  test("a camera parked on the switch distance never flips levels across frames", () => {
    const boundary = PALM.variants!.levels[0]!.maxDistance;
    const batch = oneCellBatch([{
      id: "harbor/palm/boundary",
      regionId: "harbor",
      item: "palm",
      x: 0,
      y: 0,
      z: 0,
      rotationY: 0,
      scale: 1,
    }]);
    const camera = new THREE.Vector3(0, 0, -boundary);
    expect(lodBandIndex(PALM.variants!.levels, boundary)).toBe(0);

    const selector = createModelVariantSelector(PALM.variants!);
    const near = [new THREE.Matrix4()];
    const far = [new THREE.Matrix4()];
    const local = new THREE.Matrix4();
    const frames: number[][] = [];
    for (let frame = 0; frame < 240; frame += 1) {
      const jitter = Math.sin(frame / 7) * 0.4;
      camera.set(0, 0, -boundary + jitter);
      frames.push([
        writeScatterVariantLevel(0, selector, camera, batch.instances, batch.matrices, local, near),
        writeScatterVariantLevel(1, selector, camera, batch.instances, batch.matrices, local, far),
      ]);
    }
    expect(frames.every((frame) => frame[0] === 1 && frame[1] === 0)).toBe(true);

    // Walking out settles on the far level; coming back inside needs the far hysteresis edge.
    expect(selector.level(batch.instances[0]!.id, boundary + 6.1)).toBe(1);
    expect(selector.level(batch.instances[0]!.id, boundary - 5.9)).toBe(1);
    expect(selector.level(batch.instances[0]!.id, boundary - 6.1)).toBe(0);
  });
});
