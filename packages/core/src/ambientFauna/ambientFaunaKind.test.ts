import { describe, expect, test } from "bun:test";

import { registerBuiltinSceneKinds } from "../scene/builtinSceneKinds";
import { getSceneKind } from "../scene/sceneKinds";
import { AMBIENT_FAUNA_KIND, faunaGroupsFromVolumes } from "./ambientFaunaKind";

const zone = (id: string, meta: Record<string, unknown>, extra = {}) => ({
  id, kind: AMBIENT_FAUNA_KIND, shape: "box" as const, center: { x: 10, y: 0, z: -4 }, halfExtents: { x: 20, y: 2, z: 8 }, meta, ...extra,
});

describe("ambient_fauna zones", () => {
  test("the editor knows the kind", () => {
    registerBuiltinSceneKinds();
    expect(getSceneKind(AMBIENT_FAUNA_KIND)?.target).toBe("volume");
  });

  test("a zone becomes a group with its footprint, window and band", () => {
    const [group] = faunaGroupsFromVolumes([zone("z1", { species: "minnow", motion: "school", count: 40, window: "day", bandMin: 0.5, speed: 3 })]);
    expect(group).toMatchObject({ id: "z1", species: "minnow", motion: "school", count: 40, window: { sunMin: 0.05 }, band: { min: 0.5 }, speed: 3, area: { shape: "box", x: 10, z: -4, halfX: 20, halfZ: 8 } });
  });

  test("density stands in for a count, a sphere is a disc, and unnamed zones are skipped", () => {
    const groups = faunaGroupsFromVolumes([
      zone("a", { species: "moth", motion: "swarm", density: 4 }, { shape: "sphere", radius: 12, halfExtents: undefined }),
      zone("b", { motion: "swarm" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ density: 4, area: { shape: "disc", radius: 12 } });
  });

  test("a zone can borrow a water volume's footprint and top face as the surface", () => {
    const water = { id: "lake", kind: "water", shape: "box" as const, center: { x: 0, y: 3, z: 0 }, halfExtents: { x: 50, y: 1, z: 30 } };
    const [group] = faunaGroupsFromVolumes([water, zone("fish", { species: "carp", motion: "school", volumeId: "lake" })]);
    expect(group).toMatchObject({ surface: 4, area: { shape: "box", x: 0, halfX: 50, halfZ: 30 } });
  });
});
