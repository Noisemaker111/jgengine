import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createVisibilitySystem, type Renderable } from "@jgengine/core/visibility/visibilitySystem";
import type { CameraView } from "@jgengine/core/visibility/frustum";
import type { CameraVisibilityContext } from "@jgengine/core/visibility/camera";
import type { VisibilityConfig } from "@jgengine/core/visibility/config";
import type { BoundsSpec, Vec3 } from "@jgengine/core/visibility/bounds";

type MutableRenderable = { -readonly [Key in keyof Renderable]: Renderable[Key] };

interface Entry {
  renderable: MutableRenderable;
  bounds: { kind: "sphere"; radius: number; offset: Vec3 };
  x: number;
  y: number;
  z: number;
  rotation: number;
  radius: number;
  seen: number;
}

const ENTITY_BOUNDS: BoundsSpec = { kind: "sphere", radius: 2, offset: [0, 1, 0] };
const EMPTY_CAMERAS: readonly CameraVisibilityContext[] = [];

function objectRadius(scale: number | readonly [number, number, number] | undefined): number {
  if (scale === undefined) return 1;
  const size = typeof scale === "number" ? Math.abs(scale) : Math.max(Math.abs(scale[0]), Math.abs(scale[1]), Math.abs(scale[2]));
  return Math.max(0.75, size);
}

/** Builds the shell's live scene adapter for headless visibility. @internal */
export function buildCullingDriver(ctx: GameContext, config: VisibilityConfig | undefined) {
  const entries = new Map<string, Entry>();
  let frame = 0;
  let currentView: CameraView | null = null;

  function update(id: string, position: Vec3, rotation: number, radius: number, overrides: Renderable["overrides"], layer: string): Renderable {
    let entry = entries.get(id);
    if (entry === undefined) {
      entry = { renderable: { id, position, version: 0 }, bounds: { kind: "sphere", radius, offset: [0, 0.5, 0] }, x: NaN, y: NaN, z: NaN, rotation: NaN, radius: NaN, seen: frame };
      entries.set(id, entry);
    }
    const previous = entry.renderable;
    const changed = entry.x !== position[0] || entry.y !== position[1] || entry.z !== position[2] || entry.rotation !== rotation || entry.radius !== radius || previous.overrides !== overrides || previous.layer !== layer;
    if (changed) {
      // A retained renderable must belong to one row: the core may keep it for always-visible processing.
      entry.bounds.radius = radius;
      previous.position = position;
      previous.version += 1;
      previous.bounds = layer === "entity" ? ENTITY_BOUNDS : entry.bounds;
      previous.overrides = overrides;
      previous.layer = layer;
      entry.x = position[0];
      entry.y = position[1];
      entry.z = position[2];
      entry.rotation = rotation;
      entry.radius = radius;
    }
    entry.seen = frame;
    return entry.renderable;
  }

  function* renderables(): Iterable<Renderable> {
    frame += 1;
    for (const entity of ctx.scene.entity.list()) {
      yield update(entity.id, entity.position, entity.rotationY, 2, config?.entities?.[entity.name], "entity");
    }
    for (const object of ctx.scene.object.list()) {
      yield update(object.instanceId, object.position, object.rotationY, objectRadius(object.visual?.scale), config?.objects?.[object.catalogId], "object");
    }
    for (const [id, entry] of entries) {
      if (entry.seen !== frame) entries.delete(id);
    }
  }

  const system = createVisibilitySystem({
    renderables,
    cameras: () => currentView === null ? EMPTY_CAMERAS : [{ id: "main", view: currentView }],
    ...(config?.culling !== undefined ? { settings: config.culling } : {}),
    ...(config?.scene !== undefined ? { sceneOverrides: config.scene } : {}),
  });
  return {
    system,
    setView(view: CameraView | null) {
      currentView = view;
    },
    trackedCount() {
      return entries.size;
    },
  };
}
