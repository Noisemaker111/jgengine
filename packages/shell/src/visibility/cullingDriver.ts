import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createVisibilitySystem, type Renderable } from "@jgengine/core/visibility/visibilitySystem";
import type { CameraView } from "@jgengine/core/visibility/frustum";
import type { CameraVisibilityContext } from "@jgengine/core/visibility/camera";
import type { VisibilityConfig } from "@jgengine/core/visibility/config";
import type { Vec3 } from "@jgengine/core/visibility/bounds";
import { renderBoundsOf, renderSphere } from "./renderBounds";

type MutableRenderable = { -readonly [Key in keyof Renderable]: Renderable[Key] };

interface Entry {
  renderable: MutableRenderable;
  bounds: { kind: "sphere"; radius: number; offset: [number, number, number] };
  x: number;
  y: number;
  z: number;
  rotation: number;
  radius: number;
  offsetY: number;
  seen: number;
}

/** Until a model is measured: a 2 m sphere over a standing entity, a scale-sized one over a prop. */
const ENTITY_FALLBACK = { radius: 2, offsetY: 1 };
/** Measured spheres grow by this share so a model's silhouette edge never clips at the frame edge. */
const MEASURED_MARGIN = 1.05;
const EMPTY_CAMERAS: readonly CameraVisibilityContext[] = [];

function scaleSize(scale: number | readonly [number, number, number] | undefined): number | undefined {
  if (scale === undefined) return undefined;
  return typeof scale === "number" ? Math.abs(scale) : Math.max(Math.abs(scale[0]), Math.abs(scale[1]), Math.abs(scale[2]));
}

function objectRadius(scale: number | readonly [number, number, number] | undefined): number {
  const size = scaleSize(scale);
  return size === undefined ? 1 : Math.max(0.75, size);
}

/** Builds the shell's live scene adapter for headless visibility. @internal */
export function buildCullingDriver(ctx: GameContext, config: VisibilityConfig | undefined) {
  const entries = new Map<string, Entry>();
  let frame = 0;
  let currentView: CameraView | null = null;

  /** The culling sphere: the measured model (scaled for props) once mounted, the fallback before. */
  function sphereFor(target: "entity" | "object", key: string, scale: number | undefined, fallback: { radius: number; offsetY: number }) {
    const box = renderBoundsOf(ctx, target, key);
    if (box === undefined) return fallback;
    const sphere = renderSphere(box);
    const factor = scale ?? 1;
    return { radius: sphere.radius * factor * MEASURED_MARGIN, offsetY: sphere.offsetY * factor };
  }

  function update(id: string, position: Vec3, rotation: number, sphere: { radius: number; offsetY: number }, overrides: Renderable["overrides"], layer: string): Renderable {
    const { radius, offsetY } = sphere;
    let entry = entries.get(id);
    if (entry === undefined) {
      entry = { renderable: { id, position, version: 0 }, bounds: { kind: "sphere", radius, offset: [0, offsetY, 0] }, x: NaN, y: NaN, z: NaN, rotation: NaN, radius: NaN, offsetY: NaN, seen: frame };
      entries.set(id, entry);
    }
    const previous = entry.renderable;
    const changed = entry.x !== position[0] || entry.y !== position[1] || entry.z !== position[2] || entry.rotation !== rotation || entry.radius !== radius || entry.offsetY !== offsetY || previous.overrides !== overrides || previous.layer !== layer;
    if (changed) {
      // A retained renderable must belong to one row: the core may keep it for always-visible processing.
      entry.bounds.radius = radius;
      entry.bounds.offset[1] = offsetY;
      entry.offsetY = offsetY;
      previous.position = position;
      previous.version += 1;
      previous.bounds = entry.bounds;
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
      yield update(entity.id, entity.position, entity.rotationY, sphereFor("entity", entity.name, undefined, ENTITY_FALLBACK), config?.entities?.[entity.name], "entity");
    }
    for (const object of ctx.scene.object.list()) {
      const scale = object.visual?.scale;
      yield update(object.instanceId, object.position, object.rotationY, sphereFor("object", object.catalogId, scaleSize(scale), { radius: objectRadius(scale), offsetY: 0.5 }), config?.objects?.[object.catalogId], "object");
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
