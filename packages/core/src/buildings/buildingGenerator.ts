/**
 * The building as a parts generator (`@jgengine/core/generator/generator`): the seeded config→parts
 * building ({@link generateBuilding}) drops into the parametric-asset catalog with a slider schema
 * and nothing bespoke. Domain generators (bookcase, …) register the same way from example or game code.
 *
 * @capability building-generator seeded building as a placeable parametric asset
 */
import { defineGenerator, registerGenerator } from "../generator/generator";
import { defineParamSchema } from "../generator/paramSchema";
import { PARTS_OUTPUT, partsBounds, type GeneratedAsset, type GeneratedPart } from "../scene/assetGenerator";
import { BUILDING_STYLE_PALETTES, DEFAULT_BUILDING_CONFIG, buildingSurfaceColor, generateBuilding, resolveBuildingPalette, type BuildingStyle } from "./buildings";

const BUILDING_STYLES: readonly BuildingStyle[] = Object.keys(BUILDING_STYLE_PALETTES).filter(isBuildingStyle);

function isBuildingStyle(value: string): value is BuildingStyle {
  return Object.hasOwn(BUILDING_STYLE_PALETTES, value);
}

/** The generator id a catalog entry / placed marker references. */
export const BUILDING_GENERATOR_ID = "building";

/** The building generator's slider schema — drives the inspector via #809. */
export const BUILDING_GENERATOR_SCHEMA = defineParamSchema({
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
      options: BUILDING_STYLES.map((style) => ({ value: style })),
    },
    { type: "seed", key: "seed", label: "seed", default: "" },
  ],
});

/** The building parts generator. */
export const BUILDING_GENERATOR = defineGenerator({
  id: BUILDING_GENERATOR_ID,
  label: "Building",
  output: PARTS_OUTPUT,
  schema: BUILDING_GENERATOR_SCHEMA,
  generate(params, context): GeneratedAsset {
    const palette = resolveBuildingPalette(isBuildingStyle(params.style) ? params.style : "generic");
    const building = generateBuilding({
      seed: context.seed,
      center: [0, 0],
      floors: params.floors,
      baysWide: params.baysWide,
      baysDeep: params.baysDeep,
      bayWidth: params.bayWidth,
      floorHeight: params.floorHeight,
    });
    const parts: GeneratedPart[] = building.parts.map((part) => ({
      id: part.id,
      kind: part.kind,
      position: part.position,
      size: part.scale,
      rotationY: part.rotationY,
      color: buildingSurfaceColor(palette[part.kind]),
    }));
    return { parts, bounds: partsBounds(parts) };
  },
});

/** Register the building generator. Called by {@link registerBuiltinSceneKinds}. @internal */
export function registerBuildingGenerator(): void {
  registerGenerator(BUILDING_GENERATOR);
}
