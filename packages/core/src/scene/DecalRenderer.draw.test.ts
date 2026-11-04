import { expect, test } from "bun:test";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";
import { buildDecalBatches, DECAL_CELL } from "./DecalRenderer.draw";

const flat = () => 0;

function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

function decal(id: string, x: number, z: number, meta: Record<string, unknown> = {}): SceneKindObject {
  return { id, kind: "decal", position: { x, y: 0, z }, meta };
}

test("decals sharing a world cell draw as one merged mesh off one atlas page", () => {
  const objects = Array.from({ length: 60 }, (_, index) => decal(`d${index}`, index % 10, Math.floor(index / 10), { seed: `s${index % 3}`, opacity: 0.4 }));
  const batches = buildDecalBatches(objects, flat);
  expect(batches.pages).toHaveLength(1);
  expect(batches.draws).toHaveLength(1);
  const geometry = present(batches.draws[0]).geometry;
  // Every decal's 13×13 drape grid is in the one mesh.
  expect(geometry.getAttribute("position").count).toBe(60 * 169);
  // Three distinct looks: the page holds three tiles, not sixty.
  expect(present(batches.pages[0]).image.width).toBe(3 * 144);
  const alpha = geometry.getAttribute("color");
  expect(alpha.itemSize).toBe(4);
  expect(alpha.getW(0)).toBeCloseTo(0.4);
  for (const draw of batches.draws) draw.geometry.dispose();
  for (const page of batches.pages) page.dispose();
});

test("decals in separate cells keep separate draws, so an unseen cell culls", () => {
  const batches = buildDecalBatches([decal("near", 1, 1), decal("far", DECAL_CELL * 3 + 1, 1)], flat);
  expect(batches.draws).toHaveLength(2);
  const [near, far] = batches.draws.map((draw) => present(draw.geometry.boundingSphere).center.x);
  expect(near).toBeCloseTo(1, 0);
  expect(far).toBeCloseTo(DECAL_CELL * 3 + 1, 0);
});

test("each decal samples only its own atlas tile", () => {
  const batches = buildDecalBatches([decal("a", 0, 0, { seed: "a" }), decal("b", 2, 0, { seed: "b" })], flat);
  const uv = present(batches.draws[0]).geometry.getAttribute("uv");
  const half = uv.count / 2;
  let firstMax = 0;
  let secondMin = 1;
  for (let i = 0; i < half; i += 1) firstMax = Math.max(firstMax, uv.getX(i));
  for (let i = half; i < uv.count; i += 1) secondMin = Math.min(secondMin, uv.getX(i));
  expect(firstMax).toBeLessThan(0.5);
  expect(secondMin).toBeGreaterThan(0.5);
});

test("a wall decal stands at its placed point, pushed out along its facing", () => {
  const batches = buildDecalBatches([decal("wall", 10, 20, { tilt: 90, offset: 0.5, lift: 1 })], flat);
  const box = present(present(batches.draws[0]).geometry.boundingBox);
  expect((box.min.z + box.max.z) / 2).toBeCloseTo(20.5, 3);
  expect((box.min.y + box.max.y) / 2).toBeCloseTo(1, 3);
  expect(box.max.y - box.min.y).toBeGreaterThan(0.2);
});
