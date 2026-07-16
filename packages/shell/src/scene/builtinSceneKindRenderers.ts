/**
 * Registers the engine's built-in *environment* scene-kind renderers (the shell half of #809) and
 * ensures the matching core kinds are registered too. Idempotent; `AuthoredScene` calls it at module
 * load so a document with a `water`/`grass_field`/`soil` volume renders without the game wiring
 * anything up. Domain studios (poles, …) register their own renderer via the public
 * `registerSceneKindRenderer` — no edit here.
 */
import { registerBuiltinSceneKinds } from "@jgengine/core/scene/builtinSceneKinds";

import { registerGrassFieldRenderer } from "./GrassFieldRenderer";
import { registerWaterRenderer } from "./WaterRenderer";
import { registerSoilPatchRenderer } from "./SoilPatchRenderer";

let registered = false;

/** Registers the engine's built-in environment scene-kind renderers. Called by `AuthoredScene`. @internal */
export function registerBuiltinSceneKindRenderers(): void {
  if (registered) return;
  registered = true;
  registerBuiltinSceneKinds();
  registerWaterRenderer();
  registerGrassFieldRenderer();
  registerSoilPatchRenderer();
}
