import { registerCityKind } from "../city/cityKind";
import { registerLandformGenerator } from "../landform/generator/landformGenerator";
import { registerPlantGenerators } from "../plants/grown/plantGrown";
import { registerForestStandKind } from "../plants/stand/forestStand";
import { registerBuiltinSceneKinds } from "./builtinSceneKinds";

/**
 * Registers every engine scene kind and generator now, the on-demand ones (`ON_DEMAND_SCENE_KINDS`)
 * included, for the editor and tools that list them all. A game's scene loads only what it uses. @internal
 */
export function registerAllSceneKinds(): void {
  registerBuiltinSceneKinds();
  registerCityKind();
  registerForestStandKind();
  registerPlantGenerators();
  registerLandformGenerator();
}
