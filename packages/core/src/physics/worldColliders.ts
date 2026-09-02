import type { GameContext } from "../runtime/gameContextTypes";
import { colliderWorldCenter, resolveColliders, type ColliderShape } from "../scene/colliders";
import type { EntityPosition } from "../scene/entityStore";
import type { BodyHandle, BodyShape, PhysicsBackend, PhysicsVec3 } from "./physicsBackend";

const TERRAIN_SEGMENTS = 32;

function bodyShape(shape: ColliderShape): BodyShape {
  if (shape.kind === "sphere") return { kind: "sphere", radius: shape.radius };
  if (shape.kind === "aabb") return { kind: "box", halfExtents: shape.halfExtents };
  return { kind: "trimesh", vertices: shape.mesh.positions, indices: shape.mesh.indices };
}

function bodyPosition(shape: ColliderShape, position: EntityPosition, rotationY: number): PhysicsVec3 {
  return colliderWorldCenter(
    { name: "body", purpose: "physical", shape, damageEligible: false, blocks: true },
    position,
    rotationY,
  );
}

export interface WorldColliderSync {
  /** Rebuild static terrain and object bodies from the current context. */
  sync(): void;
  /** Remove all bodies owned by this synchronizer and stop reacting to scene changes. */
  dispose(): void;
}

/** Mirrors static scene-object physical colliders and the context's ground field into a physics backend. */
export function syncWorldColliders(backend: PhysicsBackend, ctx: GameContext): WorldColliderSync {
  const objectBodies = new Map<string, BodyHandle>();
  let terrainBody: BodyHandle | null = null;
  let disposed = false;

  function rebuildTerrain(): void {
    if (terrainBody !== null) backend.removeBody(terrainBody);
    terrainBody = null;
    const bounds = ctx.world.ground.bounds;
    if (bounds === undefined) return;
    const columns = TERRAIN_SEGMENTS + 1;
    const rows = TERRAIN_SEGMENTS + 1;
    const heights = new Float32Array(columns * rows);
    for (let row = 0; row < rows; row += 1) {
      const z = -bounds.d / 2 + (row / TERRAIN_SEGMENTS) * bounds.d;
      for (let column = 0; column < columns; column += 1) {
        const x = -bounds.w / 2 + (column / TERRAIN_SEGMENTS) * bounds.w;
        heights[row * columns + column] = ctx.world.ground.sampleHeight(x, z);
      }
    }
    terrainBody = backend.addBody({
      shape: { kind: "heightfield", rows, columns, heights, scale: [bounds.w / TERRAIN_SEGMENTS, 1, bounds.d / TERRAIN_SEGMENTS] },
      position: [0, 0, 0],
      kind: "static",
      userData: { kind: "terrain" },
    });
  }

  function syncObject(objectId: string): void {
    const old = objectBodies.get(objectId);
    if (old !== undefined) {
      backend.removeBody(old);
      objectBodies.delete(objectId);
    }
    const object = ctx.scene.object.get(objectId);
    if (object === null) return;
    const body = resolveColliders(ctx.scene.object.collidersOf(objectId)).find((collider) => collider.purpose === "physical");
    if (body === undefined) return;
    const handle = backend.addBody({
      shape: bodyShape(body.shape),
      position: bodyPosition(body.shape, object.position, object.rotationY),
      rotation: [0, Math.sin(object.rotationY / 2), 0, Math.cos(object.rotationY / 2)],
      kind: "static",
      userData: { kind: "object", instanceId: object.instanceId, catalogId: object.catalogId },
    });
    objectBodies.set(objectId, handle);
  }

  function sync(): void {
    if (disposed) return;
    rebuildTerrain();
    const ids = new Set(ctx.scene.object.ids());
    for (const [objectId, handle] of objectBodies) {
      if (!ids.has(objectId)) {
        backend.removeBody(handle);
        objectBodies.delete(objectId);
      }
    }
    for (const objectId of ids) syncObject(objectId);
  }

  const unsubscribe = ctx.scene.object.subscribe(sync);
  sync();
  return {
    sync,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      if (terrainBody !== null) backend.removeBody(terrainBody);
      terrainBody = null;
      for (const handle of objectBodies.values()) backend.removeBody(handle);
      objectBodies.clear();
    },
  };
}
