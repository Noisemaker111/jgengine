import { expect, test } from "bun:test";
import * as THREE from "three";

import {
  clearDetailDraws,
  clearDetailPicks,
  createDetailPicks,
  pickDetailPlacements,
  placementLevel,
  scatterBatchInstances,
  syncDetailDraws,
} from "./InstancedScatter.draw";

const LEVELS = [{ maxDistance: 20 }, { maxDistance: 60 }, { maxDistance: Infinity }];

test("a placement takes the first level it is inside", () => {
  expect(placementLevel(LEVELS, 5, -1, 0.1)).toBe(0);
  expect(placementLevel(LEVELS, 30, -1, 0.1)).toBe(1);
  expect(placementLevel(LEVELS, 500, -1, 0.1)).toBe(2);
});

test("a placement holds its level until it is a hysteresis share past the edge", () => {
  expect(placementLevel(LEVELS, 21, 0, 0.1)).toBe(0);
  expect(placementLevel(LEVELS, 23, 0, 0.1)).toBe(1);
  expect(placementLevel(LEVELS, 19, 1, 0.1)).toBe(1);
  expect(placementLevel(LEVELS, 17, 1, 0.1)).toBe(0);
  expect(placementLevel(LEVELS, 200, 0, 0.1)).toBe(2);
});

test("one level is always that level", () => {
  expect(placementLevel([{ maxDistance: Infinity }], 1e6, 0, 0.5)).toBe(0);
});

/** A 200 m chunk with a plant every 10 m along x, the camera standing at its west edge. */
const ROW = Array.from({ length: 21 }, (_, index) => ({ x: index * 10, z: 0 }));

function drawn(picks: ReturnType<typeof createDetailPicks>, level: number): number[] {
  return Array.from(picks.members[level]?.subarray(0, picks.counts[level]) ?? []);
}

test("each plant of a big chunk draws at the level its own distance picks, and not past the draw distance", () => {
  const picks = createDetailPicks(ROW.length, LEVELS.length);
  expect(pickDetailPlacements(picks, LEVELS, ROW, 0, 0, 150, 0.1)).toBe(true);
  expect(drawn(picks, 0)).toEqual([0, 1, 2]);
  expect(drawn(picks, 1)).toEqual([3, 4, 5, 6]);
  expect(drawn(picks, 2)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15]);
  // Placements 16 to 20 are past the 150 m draw distance, so no level draws them.
  expect(Array.from(picks.level.subarray(16))).toEqual([-1, -1, -1, -1, -1]);
});

test("a camera that moves without changing any plant's level uploads nothing", () => {
  const picks = createDetailPicks(ROW.length, LEVELS.length);
  pickDetailPlacements(picks, LEVELS, ROW, 0, 0, 150, 0.1);
  expect(pickDetailPlacements(picks, LEVELS, ROW, 1, 0, 150, 0.1)).toBe(false);
  expect(Array.from(picks.dirty)).toEqual([0, 0, 0]);
  // Walking 12 m east brings plant 3 (30 m) inside the near level's 20 m edge with room to spare.
  expect(pickDetailPlacements(picks, LEVELS, ROW, 12, 0, 150, 0.1)).toBe(true);
  expect(drawn(picks, 0)).toEqual([0, 1, 2, 3]);
  expect(Array.from(picks.dirty)).toEqual([1, 1, 1]);
});

test("a chunk out of reach empties once and then stays quiet", () => {
  const picks = createDetailPicks(ROW.length, LEVELS.length);
  pickDetailPlacements(picks, LEVELS, ROW, 0, 0, 150, 0.1);
  expect(clearDetailPicks(picks)).toBe(true);
  expect(Array.from(picks.counts)).toEqual([0, 0, 0]);
  expect(clearDetailPicks(picks)).toBe(false);
});

test("the scene holds a draw only while its level has plants to draw", () => {
  const instances = ROW.map((at, index) => ({ id: `p${index}`, regionId: "r", item: "fern", x: at.x, y: 0, z: at.z, rotationY: 0, scale: 1 }));
  const [batch] = scatterBatchInstances(instances, 1000);
  if (batch === undefined) throw new Error("one chunk expected");
  const source = () => ({ geometry: new THREE.BoxGeometry(0.5, 0.5, 0.5), material: new THREE.MeshStandardMaterial(), localMatrix: new THREE.Matrix4() });
  // Two draw sources per level, as a plant with a stem and leaves has.
  const sources = LEVELS.map(() => [source(), source()]);
  const field = new THREE.Group();
  const meshes: Parameters<typeof syncDetailDraws>[1] = [];
  const picks = createDetailPicks(batch.instances.length, LEVELS.length);
  const sync = () => LEVELS.forEach((_, level) => {
    if (picks.dirty[level] === 1) syncDetailDraws(field, meshes, 0, batch, picks, level, sources[level] ?? []);
  });

  // Reach 40 m from x = 0: three plants at the near level, two at the middle one, none at the far one.
  pickDetailPlacements(picks, LEVELS, batch.instances, 0, 0, 40, 0.1);
  sync();
  const counts = () => field.children.map((child) => (child instanceof THREE.InstancedMesh ? child.count : -1));
  expect(counts()).toEqual([3, 3, 2, 2]);

  let freed = 0;
  for (const child of field.children) child.addEventListener("dispose", () => { freed += 1; });
  // Out of reach: every draw leaves the scene and frees its buffers.
  clearDetailPicks(picks);
  sync();
  expect(field.children.length).toBe(0);
  expect(freed).toBe(4);

  pickDetailPlacements(picks, LEVELS, batch.instances, 200, 0, 15, 0.1);
  sync();
  expect(counts()).toEqual([2, 2]);
  clearDetailDraws(field, meshes);
  expect(field.children.length).toBe(0);
});
