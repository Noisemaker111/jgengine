/**
 * Registers the engine's built-in *environment* scene-kind renderers (the shell half of #809) and
 * ensures the matching core kinds are registered too. Idempotent; `AuthoredScene` calls it at module
 * load so a document with a `water`/`grass_field`/`soil` volume renders without the game wiring
 * anything up. The heavy systems (city, grown plants) register their draw half on demand
 * (`loadOnDemandSceneKinds`). Domain studios (poles, …) register their own renderer via the public
 * `registerSceneKindRenderer` — no edit here.
 */
import { registerBuiltinSceneKinds } from "@jgengine/core/scene/builtinSceneKinds";
import { ON_DEMAND_SCENE_KINDS, type OnDemandSceneKind, type OnDemandSceneKindId } from "@jgengine/core/scene/onDemandSceneKinds";
import { trackSceneWork } from "@jgengine/core/model/modelLoad.draw";

import { registerGrassFieldRenderer } from "@jgengine/core/grass/GrassFieldRenderer.draw";
import { registerWaterRenderer } from "@jgengine/core/water/WaterRenderer.draw";
import { registerSoilPatchRenderer } from "./SoilPatchRenderer.draw";
import { registerPoleLineRenderer } from "./PoleLineRenderer.draw";
import { registerDecalRenderer } from "./DecalRenderer.draw";
import { registerGrassPreview } from "@jgengine/core/grass/grassPreview.draw";
import { registerPartsPreview } from "./GeneratedAssetRenderer.draw";
import { registerNatureDraw } from "@jgengine/core/nature/naturePreview.draw";
import { registerSurfaceMaterialDraw } from "@jgengine/core/material/surfaceMaterialPreview.draw";
import { registerScatterPreview } from "@jgengine/core/scatter/scatterPreview.draw";

let registered = false;

/** Registers the engine's light built-in environment scene-kind renderers and generator variant previews. Called by `AuthoredScene`. @internal */
export function registerBuiltinSceneKindRenderers(): void {
  if (registered) return;
  registered = true;
  registerBuiltinSceneKinds();
  registerWaterRenderer();
  registerGrassFieldRenderer();
  registerSoilPatchRenderer();
  registerPoleLineRenderer();
  registerDecalRenderer();
  registerGrassPreview();
  registerPartsPreview();
  registerNatureDraw();
  registerSurfaceMaterialDraw();
  registerScatterPreview();
}

/** The draw half of each on-demand system: its renderers and mesh builders. */
const ON_DEMAND_DRAW: Readonly<Record<OnDemandSceneKindId, () => Promise<void>>> = {
  city: async () => {
    const { registerCityRenderer } = await import("@jgengine/core/city/CityRenderer.draw");
    registerCityRenderer();
  },
  plants: async () => {
    const { registerPlantDraw } = await import("@jgengine/core/plants/grown/plantGrown.draw");
    registerPlantDraw();
  },
  course: async () => {
    const { registerCourseDraw } = await import("@jgengine/core/roads/coursePreview.draw");
    registerCourseDraw();
  },
  landform: async () => {
    const { registerLandformPreview } = await import("@jgengine/core/landform/generator/landformPreview.draw");
    registerLandformPreview();
  },
};

const loading = new Map<OnDemandSceneKindId, Promise<void>>();
const drawn = new Set<OnDemandSceneKindId>();

/** True once a system's kinds, generators and draw half are all registered. @internal */
export function onDemandSceneKindReady(entry: OnDemandSceneKind): boolean {
  return drawn.has(entry.id);
}
/**
 * Loads and registers the given on-demand systems (default: all of them), kinds and draw halves
 * together. Each loads once; a failed load can be retried. @internal
 */
export function loadOnDemandSceneKinds(entries: readonly OnDemandSceneKind[] = ON_DEMAND_SCENE_KINDS): Promise<void> {
  return Promise.all(
    entries.map((entry) => {
      const pending = loading.get(entry.id);
      if (pending !== undefined) return pending;
      const done = trackSceneWork(`scene-system:${entry.id}`);
      const load = Promise.all([Promise.resolve().then(entry.load), Promise.resolve().then(ON_DEMAND_DRAW[entry.id])]).then(
        () => {
          drawn.add(entry.id);
        },
        (error: unknown) => {
          loading.delete(entry.id);
          throw error;
        },
      ).finally(done);
      loading.set(entry.id, load);
      return load;
    }),
  ).then(() => undefined);
}
