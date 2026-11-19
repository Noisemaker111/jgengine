import { registerCityRenderer } from "@jgengine/core/city/CityRenderer.draw";
import { registerLandformPreview } from "@jgengine/core/landform/generator/landformPreview.draw";
import { registerPlantDraw } from "@jgengine/core/plants/grown/plantGrown.draw";
import { registerAllSceneKinds } from "@jgengine/core/scene/allSceneKinds";

import { registerBuiltinSceneKindRenderers } from "./builtinSceneKindRenderers.draw";

/** @internal */
export function registerAllSceneKindRenderers(): void {
  registerAllSceneKinds();
  registerBuiltinSceneKindRenderers();
  registerCityRenderer();
  registerPlantDraw();
  registerLandformPreview();
}
