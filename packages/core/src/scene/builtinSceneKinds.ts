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
import { SCATTER_PATH_KIND } from "../world/scatterRegion";
import { registerWaterKind } from "../world/waterKind";
import { registerGrassKind } from "../world/grassKind";
import { registerSoilKind } from "../world/soilKind";
import { registerPoleLineKind } from "../world/poleLineKind";
import { registerBuildingGenerator } from "../world/buildingGenerator";
import { registerCityKind } from "../world/cityKind";
import { registerSceneKind, type ParamSchema } from "./sceneKinds";

/** The scatter/foliage region schema — the fields the inspector exposed as hand-written `ScatterFields`. */
export const SCATTER_SCHEMA: ParamSchema = {
  fields: [
    { type: "range", key: "density", label: "density", min: 0, max: 2, step: 0.01, default: 0.15, unit: "/m²" },
    { type: "number", key: "minSpacing", label: "spacing", step: 0.25, default: 1.5, min: 0 },
    { type: "number", key: "minScale", label: "min scale", step: 0.05, default: 0.8, min: 0 },
    { type: "number", key: "maxScale", label: "max scale", step: 0.05, default: 1.3, min: 0 },
    { type: "number", key: "maxSlope", label: "max slope", step: 0.05, default: 0, min: 0 },
    { type: "number", key: "edgeFalloff", label: "edge fade", step: 0.5, default: 0, min: 0 },
    { type: "bool", key: "alignToNormal", label: "align to slope", default: false },
    { type: "bool", key: "autoAvoid", label: "auto-avoid gameplay spots", default: true },
    { type: "weightedList", key: "palette", label: "species (weighted)", itemLabel: "grass / tree id", default: [{ item: "grass", weight: 1 }] },
    { type: "seed", key: "seed", label: "seed", default: "" },
  ],
};

let registered = false;

/** Idempotently registers the engine's built-in environment scene kinds + generators. @internal */
export function registerBuiltinSceneKinds(): void {
  if (registered) return;
  registered = true;

  registerSceneKind({
    kind: SCATTER_PATH_KIND,
    target: "path",
    label: "Foliage / scatter",
    pathShape: "area",
    addCategory: "Studios",
    accent: "#34d399",
    schema: SCATTER_SCHEMA,
    note: (object, params) => {
      const points = object.points ?? [];
      if (points.length < 3) return "Draw at least 3 points to close the region.";
      let area = 0;
      for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
        area += points[j]!.x * points[i]!.z - points[i]!.x * points[j]!.z;
      }
      area = Math.abs(area) / 2;
      const density = typeof params["density"] === "number" ? params["density"] : 0;
      return `≈ ${Math.floor(area * density).toLocaleString()} placements over ${Math.round(area).toLocaleString()} m²`;
    },
  });

  registerWaterKind();
  registerGrassKind();
  registerSoilKind();
  registerCityKind();
  registerPoleLineKind();
  registerBuildingGenerator();
}
