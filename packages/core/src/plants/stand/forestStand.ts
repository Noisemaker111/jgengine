// @skill jgengine-world
/**
 * A forest an editor draws: a closed `forest_stand` path whose species mix, planting density, age and seed are grown by
 * the stand model ({@link createStand}) on one plot that wraps at its edges, then tiled across the polygon. Each living
 * tree becomes a scatter placement (item = species id, scale = its height over the model's authored height), so the
 * game's `scatterModels` turns species into models and rendering, solids and harvest read them like any scatter.
 *
 * @capability forest-stand fill a drawn polygon with a believable forest grown by the stand model, with a self-thinning dial
 */
import { defineParamSchema, parseParams, type ParamsOf } from "../../generator/paramSchema";
import { pickWeighted } from "../../random/pick";
import { hashUnit, seededRng } from "../../random/rng";
import { registerScatterSource, type ScatterInstance, type ScatterTerrain } from "../../scatter/scatterRegion";
import { registerSceneKind, type SceneKindObject } from "../../scene/sceneKinds";
import { masksInfluence, type AvoidMasks, type Vec2 } from "../../world/geometry";
import { pointInPolygon, polygonArea, ringBounds } from "../../world/polygon";
import type { ScenePathLike } from "../../world/sceneShapes";
import { PLANT_LIBRARY } from "../species/data/plantLibrary";
import type { PlantSpecies } from "../species/plantSpecies";
import { createStand, type StandTree } from "./standSim";

/** The editor path kind a forest stand is drawn as. */
export const FOREST_STAND_KIND = "forest_stand";

/** Most trees one stand places, so a huge polygon stays bounded work. */
export const FOREST_STAND_TREE_BUDGET = 20000;

/** The `forest_stand` params. */
export const FOREST_STAND_SCHEMA = defineParamSchema({
  fields: [
    { type: "weightedList", key: "species", label: "species (planting share)", itemLabel: "species id", default: [{ item: "pinus-resinosa", weight: 1 }] },
    { type: "range", key: "plantedPerHa", label: "planted", min: 100, max: 6000, step: 50, default: 1500, unit: "stems/ha" },
    { type: "range", key: "ageYears", label: "age", min: 1, max: 200, step: 1, default: 60, unit: "yr" },
    { type: "range", key: "selfThinning", label: "self-thinning", min: 0, max: 4, step: 0.05, default: 1 },
    { type: "bool", key: "recruitment", label: "seedlings recruit", default: false },
    { type: "range", key: "plotM", label: "plot tile", min: 20, max: 100, step: 5, default: 40, unit: "m" },
    { type: "number", key: "modelHeightM", label: "model height", min: 0.1, step: 0.5, default: 20, unit: "m" },
    { type: "seed", key: "seed", label: "seed", default: "" },
  ],
});

/** Parsed `forest_stand` params. */
export type ForestStandParams = ParamsOf<typeof FOREST_STAND_SCHEMA>;

/** One grown tree on the plot tile, plot-local metres. */
export interface ForestStandTree {
  species: string;
  x: number;
  z: number;
  heightM: number;
  crownRadiusM: number;
  dbhCm: number;
}

/** A grown plot tile and its stand statistics. */
export interface ForestStandPlot {
  sizeM: number;
  trees: readonly ForestStandTree[];
  treesPerHa: number;
}

function speciesOf(id: string): PlantSpecies | undefined {
  return PLANT_LIBRARY.find((species) => species.id === id);
}

const plots = new Map<string, ForestStandPlot>();
const PLOT_CACHE_LIMIT = 32;

/**
 * Grow one plot tile for the params: plant `plantedPerHa` stems of the species mix at their planting shares, then step
 * the stand `ageYears`. Deterministic per params and cached, so a document loads to the same trees every time.
 */
export function growForestStandPlot(params: ForestStandParams): ForestStandPlot {
  const key = JSON.stringify(params);
  const cached = plots.get(key);
  if (cached !== undefined) return cached;
  const entries = params.species.map((entry) => ({ species: speciesOf(entry.item), weight: entry.weight })).filter((entry): entry is { species: PlantSpecies; weight: number } => entry.species !== undefined && entry.weight > 0);
  const sizeM = params.plotM;
  if (entries.length === 0) return { sizeM, trees: [], treesPerHa: 0 };
  const species = entries.map((entry) => entry.species);
  const stand = createStand({ species, sizeM, seed: `forest:${params.seed}`, recruitment: params.recruitment, selfThinning: params.selfThinning });
  const place = seededRng(`forest:${params.seed}:plant`);
  const count = Math.round((params.plantedPerHa * sizeM * sizeM) / 1e4);
  stand.plant(Array.from({ length: count }, () => {
    const roll = place();
    const pick = pickWeighted(() => roll, entries.map((entry, index) => ({ index, weight: entry.weight })), (entry) => entry.weight);
    return { species: pick?.index ?? 0, x: place() * sizeM, z: place() * sizeM, ageYears: 0 };
  }));
  stand.step(Math.round(params.ageYears));
  const trees = stand.trees().map((tree: StandTree) => ({ species: species[tree.species]?.id ?? "", x: tree.x, z: tree.z, heightM: tree.heightM, crownRadiusM: tree.crownRadiusM, dbhCm: tree.dbhCm }));
  const plot = { sizeM, trees, treesPerHa: stand.stats().treesPerHa };
  if (plots.size >= PLOT_CACHE_LIMIT) plots.delete(plots.keys().next().value ?? "");
  plots.set(key, plot);
  return plot;
}

/** Read a path's forest params. */
export function readForestStandParams(object: Pick<SceneKindObject, "meta">): ForestStandParams {
  return parseParams(FOREST_STAND_SCHEMA, object.meta);
}

/**
 * The trees of one drawn stand: the plot tiled over the polygon, kept inside it and out of clearance masks, grounded on
 * `terrain`. Same path, same trees.
 */
export function resolveForestStand(path: ScenePathLike, terrain?: ScatterTerrain, masks?: AvoidMasks): ScatterInstance[] {
  if (path.points.length < 3) return [];
  const polygon: Vec2[] = path.points.map((point) => [point.x, point.z]);
  const params = readForestStandParams(path);
  const plot = growForestStandPlot({ ...params, seed: params.seed === "" ? path.id : params.seed });
  const bounds = ringBounds(polygon);
  if (plot.trees.length === 0) return [];
  const size = plot.sizeM;
  const hasMasks = masks !== undefined && (masks.discs.length > 0 || masks.corridors.length > 0);
  const out: ScatterInstance[] = [];
  for (let tz = Math.floor(bounds.minZ / size); tz * size < bounds.maxZ; tz += 1) {
    for (let tx = Math.floor(bounds.minX / size); tx * size < bounds.maxX; tx += 1) {
      for (const [index, tree] of plot.trees.entries()) {
        const x = tx * size + tree.x;
        const z = tz * size + tree.z;
        if (!pointInPolygon(polygon, x, z)) continue;
        const id = `${path.id}/${tx},${tz}/${index}`;
        if (hasMasks) {
          const influence = masksInfluence(x, z, masks);
          if (influence >= 1 || (influence > 0 && hashUnit(`${id}:avoid`) < influence)) continue;
        }
        out.push({
          id,
          regionId: path.id,
          item: tree.species,
          x,
          y: terrain === undefined ? 0 : terrain.sampleHeight(x, z),
          z,
          rotationY: 2 * Math.PI * hashUnit(`${id}:yaw`),
          scale: tree.heightM / params.modelHeightM,
        });
        if (out.length >= FOREST_STAND_TREE_BUDGET) return out;
      }
    }
  }
  return out;
}

/** Registers the `forest_stand` path kind and its scatter source. Called by `registerBuiltinSceneKinds`. @internal */
export function registerForestStandKind(): void {
  registerScatterSource(FOREST_STAND_KIND, resolveForestStand);
  registerSceneKind({
    kind: FOREST_STAND_KIND,
    target: "path",
    label: "Forest stand",
    pathShape: "area",
    addCategory: "Studios",
    accent: "#3f7d3a",
    schema: FOREST_STAND_SCHEMA,
    note: (object, params) => {
      const points = object.points ?? [];
      if (points.length < 3) return "Draw at least 3 points to close the stand.";
      const plot = growForestStandPlot({ ...readForestStandParams({ meta: params }), seed: typeof params["seed"] === "string" && params["seed"] !== "" ? params["seed"] : object.id });
      const area = polygonArea(points.map((point) => [point.x, point.z] as const));
      return `${Math.round(plot.treesPerHa)} trees/ha at ${Math.round(Number(params["ageYears"] ?? 0))} yr · about ${Math.round((plot.treesPerHa * area) / 1e4)} trees`;
    },
  });
}
