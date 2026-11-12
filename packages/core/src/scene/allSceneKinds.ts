import { registerCityKind } from "../city/cityKind";
import { registerItemGeneratorText } from "../item/itemGenerator";
import { registerLandformGenerator } from "../landform/generator/landformGenerator";
import { registerLootGeneratorText } from "../loot/lootGenerator";
import { registerPlantGenerators } from "../plants/grown/plantGrown";
import { registerForestStandKind } from "../plants/stand/forestStand";
import { registerNameGeneratorText } from "../random/nameGen";
import { registerBuiltinSceneKinds } from "./builtinSceneKinds";

/**
 * Registers every engine scene kind and generator now, the on-demand ones (`ON_DEMAND_SCENE_KINDS`)
 * included, for the editor and tools that list them all. A game's scene loads only what it uses. The
 * name, loot and item text previews live here, not in `registerBuiltinSceneKinds`, because only the
 * variant grid and `generator_variants` read them, and registering them at runtime put the loot roller
 * in the engine download every game pays for (apps/dev/bundle-budget.json). @internal
 */
export function registerAllSceneKinds(): void {
  registerBuiltinSceneKinds();
  registerCityKind();
  registerForestStandKind();
  registerPlantGenerators();
  registerLandformGenerator();
  registerNameGeneratorText();
  registerLootGeneratorText();
  registerItemGeneratorText();
}
