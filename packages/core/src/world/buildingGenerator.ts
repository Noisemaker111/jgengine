/**
 * The building generator registered against the {@link registerAssetGenerator} seam — the one engine
 * adopter, proving the seeded config→parts building generator ({@link generateBuilding}) drops into
 * the parametric-asset catalog with a slider schema and nothing bespoke. Domain generators (bookcase,
 * …) register the same way from example/game code.
 *
 * @capability building-generator seeded building as a placeable parametric asset
 */
import { registerAssetGenerator, partsBounds, type GeneratedAsset, type GeneratedPart } from "../scene/assetGenerator";
import type { ParamSchema, ParsedParams } from "../scene/sceneKinds";
import { BUILDING_STYLE_PALETTES, DEFAULT_BUILDING_CONFIG, generateBuilding, resolveBuildingPalette, type BuildingStyle } from "./buildings";

/** The generator id a catalog entry / placed marker references. */
export const BUILDING_GENERATOR_ID = "building";

/** The building generator's slider schema — drives the inspector via #809. */
export const BUILDING_GENERATOR_SCHEMA: ParamSchema = {
  fields: [
    { type: "range", key: "floors", label: "floors", min: 1, max: 20, step: 1, default: DEFAULT_BUILDING_CONFIG.floors },
    { type: "range", key: "baysWide", label: "bays wide", min: 1, max: 12, step: 1, default: DEFAULT_BUILDING_CONFIG.baysWide },
    { type: "range", key: "baysDeep", label: "bays deep", min: 1, max: 12, step: 1, default: DEFAULT_BUILDING_CONFIG.baysDeep },
    { type: "range", key: "bayWidth", label: "bay width", min: 1, max: 5, step: 0.1, default: DEFAULT_BUILDING_CONFIG.bayWidth, unit: "m" },
    { type: "range", key: "floorHeight", label: "floor height", min: 2, max: 5, step: 0.1, default: DEFAULT_BUILDING_CONFIG.floorHeight, unit: "m" },
    {
      type: "select",
      key: "style",
      label: "style",
      default: "generic",
      options: Object.keys(BUILDING_STYLE_PALETTES).map((style) => ({ value: style })),
    },
    { type: "seed", key: "seed", label: "seed", default: "" },
  ],
};

/** Generate a building's parts from validated params + seed — the {@link registerAssetGenerator} hook. @internal */
export function generateBuildingAsset(params: ParsedParams, seed: string): GeneratedAsset {
  const style = params["style"] as BuildingStyle;
  const palette = resolveBuildingPalette(style);
  const building = generateBuilding({
    seed,
    center: [0, 0],
    floors: params["floors"] as number,
    baysWide: params["baysWide"] as number,
    baysDeep: params["baysDeep"] as number,
    bayWidth: params["bayWidth"] as number,
    floorHeight: params["floorHeight"] as number,
  });
  const parts: GeneratedPart[] = building.parts.map((part) => ({
    id: part.id,
    kind: part.kind,
    position: part.position,
    size: part.scale,
    rotationY: part.rotationY,
    color: palette[part.kind],
  }));
  return { parts, bounds: partsBounds(parts) };
}

/** Register the building generator asset. Called by {@link registerBuiltinSceneKinds}. @internal */
export function registerBuildingGenerator(): void {
  registerAssetGenerator({
    id: BUILDING_GENERATOR_ID,
    label: "Building",
    schema: BUILDING_GENERATOR_SCHEMA,
    generate: generateBuildingAsset,
  });
}
