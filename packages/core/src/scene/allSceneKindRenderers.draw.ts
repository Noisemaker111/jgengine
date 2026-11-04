import { registerCityRenderer } from "@jgengine/core/city/CityRenderer.draw";
import { registerPlantDraw } from "@jgengine/core/plants/grown/plantGrown.draw";
import { registerAllSceneKinds } from "@jgengine/core/scene/allSceneKinds";

import { registerBuiltinSceneKindRenderers } from "./builtinSceneKindRenderers.draw";

/**
 * Registers every engine scene kind, renderer and generator preview now, the on-demand systems
 * (city, grown plants) included. For the editor, which lists and previews them all; a game's scene
 * loads only what it uses. @internal
 */
export function registerAllSceneKindRenderers(): void {
  registerAllSceneKinds();
  registerBuiltinSceneKindRenderers();
  registerCityRenderer();
  registerPlantDraw();
}
