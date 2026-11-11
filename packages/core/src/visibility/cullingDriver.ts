import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createVisibilitySystem, type Renderable } from "@jgengine/core/visibility/visibilitySystem";
import type { CameraView } from "@jgengine/core/visibility/frustum";
import type { CameraVisibilityContext } from "@jgengine/core/visibility/camera";
import type { VisibilityConfig } from "@jgengine/core/visibility/config";
import { renderBoundsOf, renderBoundsRevision, renderSphere } from "./measuredBounds";
import type { Vec3 } from "@jgengine/core/world/geometry";

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

/**
 * A counter that moves whenever an entry of the kind-to-overrides table `read` returns is added,
 * removed or replaced. A game's table holds a few kinds, so checking it every frame costs a few compares.
 */
function overrideWatch(read: () => Readonly<Record<string, unknown>> | undefined): () => number {
  let seen: unknown[] = [];
  let changes = 0;
  return () => {
    const table = read();
    let index = 0;
    let changed = false;
    if (table !== undefined) {
      for (const key in table) {
        if (!Object.hasOwn(table, key)) continue;
        if (seen[index] !== key || seen[index + 1] !== table[key]) {
          seen[index] = key;
          seen[index + 1] = table[key];
          changed = true;
        }
        index += 2;
      }
    }
    if (seen.length !== index) {
      seen = seen.slice(0, index);
      changed = true;
    }
    if (changed) changes += 1;
    return changes;
  };
}

/**
 * Builds the shell's live scene adapter for headless visibility: the scene's entities and its placed
 * objects as two sources. A source is walked again only after its store changed, a measured box landed
 * or the game replaced one of its kinds' overrides, so a still prop costs nothing per frame while
 * actors move. Call `dispose` when done with it.
 * @internal
 */
export function buildCullingDriver(ctx: GameContext, config: VisibilityConfig | undefined) {
  let walk = 0;
  let currentView: CameraView | null = null;
  // Rebuilt only when the caller hands over a different view object: a provider rewrites one in place.
  let currentCameras: readonly CameraVisibilityContext[] = EMPTY_CAMERAS;

  /** The culling sphere, written to `sphere`: the measured model (scaled for props) once mounted, the fallback before. */
  const sphere = { radius: 0, offsetY: 0 };
  function sphereFor(target: "entity" | "object", key: string, scale: number | undefined, fallbackRadius: number, fallbackOffsetY: number): void {
    const box = renderBoundsOf(ctx, target, key);
    if (box === undefined) {
      sphere.radius = fallbackRadius;
      sphere.offsetY = fallbackOffsetY;
      return;
    }
    const measured = renderSphere(box);
    const factor = scale ?? 1;
    sphere.radius = measured.radius * factor * MEASURED_MARGIN;
    sphere.offsetY = measured.offsetY * factor;
  }

  function update(entries: Map<string, Entry>, id: string, position: Vec3, rotation: number, overrides: Renderable["overrides"], layer: string): Renderable {
    const { radius, offsetY } = sphere;
    let entry = entries.get(id);
    if (entry === undefined) {
      entry = { renderable: { id, position, version: 0 }, bounds: { kind: "sphere", radius, offset: [0, offsetY, 0] }, x: NaN, y: NaN, z: NaN, rotation: NaN, radius: NaN, offsetY: NaN, seen: walk };
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
    entry.seen = walk;
    return entry.renderable;
  }

  // Each source's rows are refilled on its walk, which then forgets the rows it no longer yields with
  // `forEach`: a `for…of` over the map allocates an iterator result per object.
  const entityEntries = new Map<string, Entry>();
  const objectEntries = new Map<string, Entry>();
  const forgetIn = (entries: Map<string, Entry>) => (entry: Entry, id: string): void => {
    if (entry.seen !== walk) entries.delete(id);
  };
  const forgetEntity = forgetIn(entityEntries);
  const forgetObject = forgetIn(objectEntries);
  const entityRows: Renderable[] = [];
  const objectRows: Renderable[] = [];
  function entityRenderables(): readonly Renderable[] {
    walk += 1;
    entityRows.length = 0;
    for (const entity of ctx.scene.entity.list()) {
      sphereFor("entity", entity.name, undefined, ENTITY_FALLBACK.radius, ENTITY_FALLBACK.offsetY);
      entityRows.push(update(entityEntries, entity.id, entity.position, entity.rotationY, config?.entities?.[entity.name], "entity"));
    }
    entityEntries.forEach(forgetEntity);
    return entityRows;
  }
  function objectRenderables(): readonly Renderable[] {
    walk += 1;
    objectRows.length = 0;
    for (const object of ctx.scene.object.list()) {
      const scale = object.visual?.scale;
      sphereFor("object", object.catalogId, scaleSize(scale), objectRadius(scale), 0.5);
      objectRows.push(update(objectEntries, object.instanceId, object.position, object.rotationY, config?.objects?.[object.catalogId], "object"));
    }
    objectEntries.forEach(forgetObject);
    return objectRows;
  }

  // Store listeners attach on the first update, not at build, so a driver the UI builds and drops never
  // holds one, and one disposed and then updated again re-attaches. Attaching counts as a change, so the
  // first walk after it reads everything the store did while nobody listened.
  let entityChanges = 0;
  let objectChanges = 0;
  let unsubscribe: (() => void)[] | null = null;
  function listen(): void {
    if (unsubscribe !== null) return;
    entityChanges += 1;
    objectChanges += 1;
    unsubscribe = [
      ctx.scene.entity.subscribe(() => { entityChanges += 1; }),
      ctx.scene.object.subscribe(() => { objectChanges += 1; }),
    ];
  }
  const entityOverrides = overrideWatch(() => config?.entities);
  const objectOverrides = overrideWatch(() => config?.objects);

  const system = createVisibilitySystem({
    sources: [
      // Each part only grows, so the sum moves whenever any part does.
      { renderables: entityRenderables, revision: () => { listen(); return entityChanges + renderBoundsRevision(ctx) + entityOverrides(); } },
      { renderables: objectRenderables, revision: () => { listen(); return objectChanges + renderBoundsRevision(ctx) + objectOverrides(); } },
    ],
    cameras: () => currentCameras,
    ...(config?.culling !== undefined ? { settings: config.culling } : {}),
    ...(config?.scene !== undefined ? { sceneOverrides: config.scene } : {}),
  });
  return {
    system,
    setView(view: CameraView | null) {
      if (view === currentView) return;
      currentView = view;
      currentCameras = view === null ? EMPTY_CAMERAS : [{ id: "main", view }];
    },
    trackedCount() {
      return entityEntries.size + objectEntries.size;
    },
    dispose() {
      if (unsubscribe === null) return;
      for (const stop of unsubscribe) stop();
      unsubscribe = null;
    },
  };
}
