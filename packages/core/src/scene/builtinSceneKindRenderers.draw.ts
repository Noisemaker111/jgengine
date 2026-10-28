/**
 * Registers the engine's built-in *environment* scene-kind renderers (the shell half of #809) and
 * ensures the matching core kinds are registered too. Idempotent; `AuthoredScene` calls it at module
 * load so a document with a `water`/`grass_field`/`soil` volume renders without the game wiring
 * anything up. Domain studios (poles, …) register their own renderer via the public
 * `registerSceneKindRenderer` — no edit here.
 */
import { registerBuiltinSceneKinds } from "@jgengine/core/scene/builtinSceneKinds";

import { registerGrassFieldRenderer } from "@jgengine/core/grass/GrassFieldRenderer.draw";
import { registerWaterRenderer } from "@jgengine/core/water/WaterRenderer.draw";
import { registerSoilPatchRenderer } from "./SoilPatchRenderer.draw";
import { registerCityRenderer } from "@jgengine/core/city/CityRenderer.draw";
import { registerPoleLineRenderer } from "./PoleLineRenderer.draw";
import { registerDecalRenderer } from "./DecalRenderer.draw";
import { registerGrassPreview } from "@jgengine/core/grass/grassPreview.draw";
import { registerPartsPreview } from "./GeneratedAssetRenderer.draw";
import { registerNatureDraw } from "@jgengine/core/nature/naturePreview.draw";

let registered = false;

/** Registers the engine's built-in environment scene-kind renderers and generator variant previews. Called by `AuthoredScene`. @internal */
export function registerBuiltinSceneKindRenderers(): void {
  if (registered) return;
  registered = true;
  registerBuiltinSceneKinds();
  registerWaterRenderer();
  registerGrassFieldRenderer();
  registerSoilPatchRenderer();
  registerCityRenderer();
  registerPoleLineRenderer();
  registerDecalRenderer();
  registerGrassPreview();
  registerPartsPreview();
  registerNatureDraw();
}
