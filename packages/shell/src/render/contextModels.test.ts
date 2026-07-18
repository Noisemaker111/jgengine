import { describe, expect, test } from "bun:test";

import { defineGame } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { encodeCollisionMesh, type CollisionMeshData } from "@jgengine/core/scene/collisionMesh";

import { contextModels } from "./resolveModel";

// Torus: major radius 1, tube radius 0.3, hole axis +Z, centered at origin — index-shared seams.
function torusData(): CollisionMeshData {
  const major = 32;
  const tube = 16;
  const positions: number[] = [];
  for (let i = 0; i < major; i += 1) {
    const a = (i / major) * Math.PI * 2;
    for (let j = 0; j < tube; j += 1) {
      const b = (j / tube) * Math.PI * 2;
      positions.push(
        Math.cos(a) * (1 + Math.cos(b) * 0.3),
        Math.sin(a) * (1 + Math.cos(b) * 0.3),
        Math.sin(b) * 0.3,
      );
    }
  }
  const vertexAt = (i: number, j: number): number => (i % major) * tube + (j % tube);
  const indices: number[] = [];
  for (let i = 0; i < major; i += 1) {
    for (let j = 0; j < tube; j += 1) {
      indices.push(vertexAt(i, j), vertexAt(i + 1, j), vertexAt(i + 1, j + 1));
      indices.push(vertexAt(i, j), vertexAt(i + 1, j + 1), vertexAt(i, j + 1));
    }
  }
  const data = encodeCollisionMesh({ positions, indices });
  if (data === null) throw new Error("torus failed to encode");
  return data;
}

const torusDims = { footprint: { w: 2.6, d: 0.6 }, center: { x: 0, z: 0 }, minY: -1.3, maxY: 1.3 };

describe("contextModels mesh-hitbox parity", () => {
  test("the shell catalog path and a headless models lookup resolve identical mesh hits", () => {
    const clientData = torusData();
    // The host parses its own copy of the generated index — same JSON, distinct objects.
    const hostData = JSON.parse(JSON.stringify(clientData)) as CollisionMeshData;

    const assets = createAssetCatalog();
    assets.register("kit/torus", { url: "/models/kit/torus.glb", dims: torusDims, collisionMesh: clientData });
    const clientModels = contextModels({
      game: { assets },
      objectModels: { torus: "kit/torus" },
    });
    expect(clientModels).toBeDefined();

    const definition = () =>
      defineGame({ name: "Parity", assets: createAssetCatalog(), multiplayer: "off" });
    const content = { objectById: (catalogId: string) => (catalogId === "torus" ? {} : null) };
    const player = { userId: "user_a", isNew: true };
    const client = createGameContext({ definition: definition(), content, player, models: clientModels! });
    const host = createGameContext({
      definition: definition(),
      content,
      player,
      models: { object: (catalogId) => (catalogId === "torus" ? { dims: torusDims, collisionMesh: hostData } : undefined) },
    });

    for (const ctx of [client, host]) ctx.scene.object.place("torus", 0, 0, 4);

    // Hole center sits at placement + [0, 1.3, 0] (grounded centered fit); probe the hole, the ring,
    // and an off-axis diagonal, and require bit-identical outcomes on both sides.
    const rays = [
      { origin: [0, 1.3, 0], direction: [0, 0, 1] },
      { origin: [1, 1.3, 0], direction: [0, 0, 1] },
      { origin: [-0.4, 1.0, 0], direction: [0.1, 0.05, 1] },
    ] as const;
    for (const ray of rays) {
      const a = client.scene.raycast({ origin: ray.origin, direction: ray.direction, maxDistance: 20 });
      const b = host.scene.raycast({ origin: ray.origin, direction: ray.direction, maxDistance: 20 });
      expect(a === null).toBe(b === null);
      if (a !== null && b !== null) {
        expect(a.distance).toBe(b.distance);
        expect(a.point).toEqual(b.point);
        expect(a.normal).toEqual(b.normal);
        expect(a.targetKind).toBe(b.targetKind);
      }
    }
    // And the concave contract itself: hole passes, ring blocks.
    expect(client.scene.raycast({ origin: [0, 1.3, 0], direction: [0, 0, 1], maxDistance: 20 })).toBeNull();
    expect(
      client.scene.raycast({ origin: [1, 1.3, 0], direction: [0, 0, 1], maxDistance: 20 })?.distance,
    ).toBeCloseTo(3.7, 1);
  });
});
