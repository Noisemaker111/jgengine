/**
 * Registers the engine's built-in *environment* scene kinds against the {@link registerSceneKind}
 * seam: `scatter` (the proof adopter — its inspector, `+ Add` entry, and parse now come from the
 * registry), `water` (a reusable parametric water surface), `grass_field` (GPU vertex-wind grass), and
 * `soil` (crack/moss ground-variation patch), and `pole_line` (poles + sagging cables along a path).
 * These are genre-agnostic engine primitives, like terrain. Domain studios (bookcases, …) are NOT
 * built in — they register themselves from example/game code via the same public seam, needing zero
 * engine edits (see `examples/studios`). Call
 * {@link registerBuiltinSceneKinds} once at startup (idempotent).
 */
import { SCATTER_GENERATOR, SCATTER_PATH_KIND, SCATTER_SCHEMA } from "../scatter/scatterRegion";
import { registerWaterKind } from "../water/waterKind";
import { registerGrassKind } from "@jgengine/core/grass/grassKind";
import { registerSoilKind } from "../world/soilKind";
import { registerAmbientFaunaKind } from "../ambientFauna/ambientFaunaKind";
import { registerPoleLineKind } from "../world/poleLineKind";
import { registerDecalKind } from "../world/decalKind";
import { registerBuildingGenerator } from "../buildings/buildingGenerator";
import { registerNatureGenerators } from "../nature/natureGenerators";
import { registerSurfaceMaterialGenerator } from "../material/surfaceMaterialGenerator";
import { registerItemGeneratorText } from "../item/itemGenerator";
import { registerLootGeneratorText } from "../loot/lootGenerator";
import { registerNameGeneratorText } from "../random/nameGen";
import { registerGroundCoverKind } from "../plants/groundCover/groundCoverField";
import { registerNavAuthoringKinds } from "../nav/navAuthoringKinds";
import { describeScatterCoverage, densityCoverage } from "../scatter/scatterCoverage";
import { registerSceneKind } from "./sceneKinds";
import { registerGenerator } from "../generator/generator";
import { type ParamSchema } from "../generator/paramSchema";

const LIGHT_SCHEMA: ParamSchema = {
  fields: [
    { type: "select", key: "type", label: "type", options: [{ value: "point", label: "Point" }, { value: "spot", label: "Spot" }], default: "point" },
    { type: "color", key: "color", label: "color", default: "#ffd6a0" },
    { type: "number", key: "intensity", label: "intensity", min: 0, step: 0.1, default: 2 },
    { type: "number", key: "range", label: "range", min: 0, step: 0.5, default: 12 },
    { type: "bool", key: "castShadow", label: "cast shadow", default: false },
  ],
};

let registered = false;

/**
 * Idempotently registers the engine's light built-in environment scene kinds + generators. The heavy
 * ones (city, forest stands, grown plants) load on demand (`ON_DEMAND_SCENE_KINDS`), or all at once
 * with `registerAllSceneKinds`. @internal
 */
export function registerBuiltinSceneKinds(): void {
  if (registered) return;
  registered = true;

  registerGenerator(SCATTER_GENERATOR);
  registerSceneKind({
    kind: SCATTER_PATH_KIND,
    generator: SCATTER_GENERATOR.id,
    target: "path",
    label: "Foliage / scatter",
    pathShape: "area",
    addCategory: "Studios",
    accent: "#34d399",
    schema: SCATTER_SCHEMA,
    coverage: { spec: "scatter", densityKey: "density", assetsKey: "palette" },
    note: (object, params) => {
      const points = object.points ?? [];
      if (points.length < 3) return "Draw at least 3 points to close the region.";
      let area = 0;
      for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
        area += points[j]!.x * points[i]!.z - points[i]!.x * points[j]!.z;
      }
      area = Math.abs(area) / 2;
      const density = typeof params["density"] === "number" ? params["density"] : 0;
      return describeScatterCoverage(densityCoverage("scatter", area, density));
    },
  });
  registerSceneKind({ kind: "light", target: "marker", label: "Light", addCategory: "Environment", accent: "#fbbf24", schema: LIGHT_SCHEMA });

  registerWaterKind();
  registerGrassKind();
  registerSoilKind();
  registerAmbientFaunaKind();
  registerGroundCoverKind();
  registerPoleLineKind();
  registerDecalKind();
  registerNavAuthoringKinds();
  registerBuildingGenerator();
  registerNatureGenerators();
  registerSurfaceMaterialGenerator();
  registerNameGeneratorText();
  registerLootGeneratorText();
  registerItemGeneratorText();
}
