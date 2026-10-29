// @skill jgengine-world
/**
 * Grown plants on the generator contract: a species grown from its seed to an age by the biology
 * simulation, then drawn in a style. Growth and look are separate layers: every style field changes
 * only the mesh, so restyling never regrows, and two placements share one grown structure.
 *
 * @capability plant-grown place, scatter and preview simulation-grown plants of any species, age and style
 */
import { defineGenerator, registerGenerator, type GeneratorContext } from "../../generator/generator";
import { defineParamSchema, type ParamsOf } from "../../generator/paramSchema";
import { runSliced, type SlicedJob } from "../../run/slicedWork";
import { registerPlaceableGeneratorOutput } from "../../scene/assetGenerator";
import { createIndexedDbPlantCacheStorage, createPlantCache, type CachedPlantStructure, type PlantCache } from "../cache/plantCache";
import { OPEN_TEMPERATE_SITE } from "../growth/plantEnvironment";
import { createPlantGrowth, PLANT_SIM_VERSION } from "../growth/plantGrowth";
import { buildPlantMesh, DEFAULT_PLANT_STYLE, PLANT_MESH_LODS, plantMeshLod, type PlantMesh, type PlantStyle } from "../mesh/plantMesh";
import { ACER_SACCHARUM } from "../species/data/acerSaccharum";
import { PLANT_LIBRARY } from "../species/data/plantLibrary";
import { plantSpeciesById, registerPlantSpecies } from "../species/plantSpecies";
import { hashPlantStructure } from "../structure/plantStructure";
import { createWorkerPlantGrower, type PlantGrower, type PlantGrowRequest, type PlantGrowResult, type PlantMeshOrder } from "./plantGrowPool";

/** The generator output family a grown plant returns: a {@link PlantMesh}. */
export const PLANT_MESH_OUTPUT = "plant-mesh";

const sentenceCase = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

/** Grown-plant params: what grows (species, age, site) and how it looks (every style field). */
export const PLANT_GROWN_SCHEMA = defineParamSchema({
  groups: [
    { id: "plant", label: "Plant" },
    { id: "site", label: "Site" },
    { id: "look", label: "Look" },
    { id: "shading", label: "Shading" },
  ],
  fields: [
    { type: "seed", key: "seed", label: "seed", default: "" },
    {
      type: "select",
      key: "species",
      label: "species",
      group: "plant",
      default: "acer-saccharum",
      vary: false,
      options: PLANT_LIBRARY.map((species) => ({ value: species.id, label: sentenceCase(species.names.common["en"] ?? species.id) })),
    },
    { type: "range", key: "age", label: "age", group: "plant", min: 1, max: 300, step: 1, default: 60, unit: "years", explore: [5, 300], exploreScale: "log" },
    { type: "range", key: "day", label: "day of year", group: "plant", min: 1, max: 365, step: 1, default: 200, vary: false },
    { type: "range", key: "deadYears", label: "dead for", group: "plant", min: 0, max: 60, step: 1, default: 0, unit: "years", vary: false },
    { type: "range", key: "light", label: "open sky", group: "site", min: 0.05, max: 1, step: 0.01, default: 1, vary: false },
    {
      type: "select",
      key: "foliage",
      label: "foliage",
      group: "look",
      default: "leaves",
      vary: false,
      options: [
        { value: "leaves", label: "Leaves" },
        { value: "clumps", label: "Clumps" },
      ],
    },
    { type: "range", key: "leafScale", label: "leaf scale", group: "look", min: 0.5, max: 5, step: 0.05, default: DEFAULT_PLANT_STYLE.leafScale, vary: false },
    { type: "color", key: "leafTint", label: "leaf tint", group: "look", default: "#ffffff", vary: false },
    { type: "color", key: "barkTint", label: "bark tint", group: "look", default: "#ffffff", vary: false },
    { type: "range", key: "saturation", label: "saturation", group: "look", min: 0, max: 2, step: 0.01, default: 1, vary: false },
    { type: "range", key: "brightness", label: "brightness", group: "look", min: 0.2, max: 2, step: 0.01, default: 1, vary: false },
    { type: "range", key: "colorJitter", label: "colour variation", group: "look", min: 0, max: 0.5, step: 0.01, default: 0.15, vary: false },
    { type: "range", key: "paint", label: "paint with tint", group: "look", min: 0, max: 1, step: 0.01, default: 0, vary: false },
    { type: "bool", key: "barkGrain", label: "bark grain", group: "look", default: true, vary: false },
    {
      type: "select",
      key: "shading",
      label: "shading",
      group: "shading",
      default: "lit",
      vary: false,
      options: [
        { value: "lit", label: "Lit" },
        { value: "ramp", label: "Cel ramp" },
      ],
    },
    { type: "range", key: "rampBands", label: "ramp bands", group: "shading", min: 2, max: 8, step: 1, default: 3, vary: false },
    { type: "range", key: "rampSoftness", label: "ramp softness", group: "shading", min: 0, max: 1, step: 0.01, default: 0.2, vary: false },
    { type: "range", key: "rampShadow", label: "ramp shadow", group: "shading", min: 0, max: 1, step: 0.01, default: 0.35, vary: false },
  ],
});

type PlantGrownParams = ParamsOf<typeof PLANT_GROWN_SCHEMA>;

/**
 * The style a grown plant's params describe.
 * @capability plant-grown place, scatter and preview simulation-grown plants of any species, age and style
 */
export function plantStyleOf(params: PlantGrownParams): PlantStyle {
  return {
    foliage: params.foliage,
    leafScale: params.leafScale,
    leafTint: params.leafTint,
    barkTint: params.barkTint,
    saturation: params.saturation,
    brightness: params.brightness,
    colorJitter: params.colorJitter,
    paint: params.paint,
    shading: params.shading,
    ramp: { bands: params.rampBands, softness: params.rampSoftness, shadow: params.rampShadow },
    barkGrain: params.barkGrain,
  };
}

function growRequest(params: PlantGrownParams, context: GeneratorContext): PlantGrowRequest {
  const species = plantSpeciesById(params.species) ?? PLANT_LIBRARY.find((known) => known.id === params.species) ?? ACER_SACCHARUM;
  const age = Math.max(1, Math.min(species.limits.maxAgeYears, Math.round(params.age)));
  return { species, env: { ...OPEN_TEMPERATE_SITE, light: params.light }, seed: context.seed, age, day: Math.round(params.day), deadYears: Math.max(0, Math.round(params.deadYears)) };
}

/**
 * The cache key of a grown structure: species and its version, simulation version, seed, age, day
 * and site. Anything that changes what grows is in it; nothing about the look is.
 * @capability plant-grown place, scatter and preview simulation-grown plants of any species, age and style
 */
export function plantStructureKey(request: PlantGrowRequest): string {
  const { species, env } = request;
  return `plant/${species.id}@${species.version}/sim${PLANT_SIM_VERSION}/${request.seed}/${request.age}/${request.day}/dead${request.deadYears}/${JSON.stringify(env)}`;
}

function meshKey(structureKey: string, style: PlantStyle, lod: number): string {
  return `${structureKey}/mesh/${lod}/${JSON.stringify(style)}`;
}

// Plants grow while the loading screen is up, so a slice can take most of a 30 Hz frame.
const GROW_SLICE_MS = 24;

function* growJob(request: PlantGrowRequest): SlicedJob<CachedPlantStructure> {
  const growth = createPlantGrowth(request.species, request.env, request.seed);
  while (growth.ageYears() < request.age) {
    growth.step();
    yield;
  }
  if (request.deadYears > 0) growth.kill();
  for (let year = 0; year < request.deadYears; year += 1) {
    growth.step();
    yield;
  }
  const structure = growth.structure(request.day);
  yield;
  return { structure, hash: hashPlantStructure(structure) };
}

function growNow(request: PlantGrowRequest): CachedPlantStructure {
  const growth = createPlantGrowth(request.species, request.env, request.seed);
  growth.step(request.age);
  if (request.deadYears > 0) {
    growth.kill();
    growth.step(request.deadYears);
  }
  const structure = growth.structure(request.day);
  return { structure, hash: hashPlantStructure(structure) };
}

/** Options for {@link createPlantGrownGenerator}. */
export interface PlantGrownGeneratorOptions {
  /**
   * Where `prepare` grows plants. Default: a worker pool ({@link createWorkerPlantGrower}) where the
   * platform has workers. Null, or a grower that fails, grows in frame slices on the main thread.
   */
  grower?: PlantGrower | null;
}

/**
 * A grown-plant generator over one cache. `prepare` grows in a worker (or in slices off the frame,
 * or loads from storage); `generate` answers from the cache, growing on the spot only when nothing
 * prepared it.
 * @capability plant-grown place, scatter and preview simulation-grown plants of any species, age and style
 */
export function createPlantGrownGenerator(cache: PlantCache, options: PlantGrownGeneratorOptions = {}) {
  const growing = new Map<string, Promise<CachedPlantStructure>>();
  let grower: PlantGrower | null | undefined = options.grower;
  const growOffFrame = async (request: PlantGrowRequest, order: PlantMeshOrder): Promise<PlantGrowResult> => {
    grower ??= createWorkerPlantGrower();
    if (grower !== null) {
      try {
        return await grower.grow(request, order);
      } catch (error) {
        // A platform that cannot run the worker grows in frame slices from now on.
        console.warn("[jgengine] plant worker unavailable, growing on the main thread", error);
        grower.dispose();
        grower = null;
      }
    }
    return { grown: await runSliced(growJob(request), { budgetMs: GROW_SLICE_MS }).done, mesh: null };
  };
  const meshFrom = (key: string, grown: CachedPlantStructure, style: PlantStyle, lod: number): PlantMesh => {
    const mesh = buildPlantMesh({ structure: grown.structure, style, detail: PLANT_MESH_LODS[lod] ?? 1, structureHash: grown.hash });
    cache.putMesh(key, mesh);
    return mesh;
  };
  return defineGenerator({
    id: "plant.grown",
    label: "Grown plant",
    output: PLANT_MESH_OUTPUT,
    schema: PLANT_GROWN_SCHEMA,
    lods: PLANT_MESH_LODS,
    async prepare(params, context) {
      const request = growRequest(params, context);
      const style = plantStyleOf(params);
      const lod = plantMeshLod(context.detail);
      const structureKey = plantStructureKey(request);
      const key = meshKey(structureKey, style, lod);
      if ((await cache.loadMesh(key)) !== undefined) return;
      const stored = (await cache.loadStructure(structureKey)) ?? (await growing.get(structureKey));
      if (stored !== undefined) {
        meshFrom(key, stored, style, lod);
        return;
      }
      // Nothing grown yet: grow it and build this mesh in one go, off the main thread where possible.
      const run = growOffFrame(request, { style, detail: PLANT_MESH_LODS[lod] ?? 1 });
      const structure = run.then((result) => result.grown);
      structure.catch(() => undefined);
      growing.set(structureKey, structure);
      try {
        const { grown, mesh } = await run;
        cache.putStructure(structureKey, grown);
        if (mesh === null) meshFrom(key, grown, style, lod);
        else cache.putMesh(key, mesh);
      } finally {
        growing.delete(structureKey);
      }
    },
    generate(params, context): PlantMesh {
      const request = growRequest(params, context);
      const style = plantStyleOf(params);
      const lod = plantMeshLod(context.detail);
      const structureKey = plantStructureKey(request);
      const key = meshKey(structureKey, style, lod);
      const known = cache.mesh(key);
      if (known !== undefined) return known;
      let grown = cache.structure(structureKey);
      if (grown === undefined) {
        grown = growNow(request);
        cache.putStructure(structureKey, grown);
      }
      return meshFrom(key, grown, style, lod);
    },
  });
}

/**
 * The cache the built-in {@link PLANT_GROWN_GENERATOR} uses: IndexedDB in a browser, memory elsewhere.
 * Swap its storage with `setStorage`.
 * @capability plant-grown place, scatter and preview simulation-grown plants of any species, age and style
 */
export const PLANT_CACHE: PlantCache = createPlantCache({ storage: createIndexedDbPlantCacheStorage() });

/**
 * The built-in grown-plant generator, `plant.grown`.
 * @capability plant-grown place, scatter and preview simulation-grown plants of any species, age and style
 */
export const PLANT_GROWN_GENERATOR = createPlantGrownGenerator(PLANT_CACHE);

/**
 * Register the species library and the grown-plant generator, and let scenes place its output.
 * Called by `registerBuiltinSceneKinds`.
 * @internal
 */
export function registerPlantGenerators(): void {
  for (const species of PLANT_LIBRARY) if (plantSpeciesById(species.id) === undefined) registerPlantSpecies(species);
  registerGenerator(PLANT_GROWN_GENERATOR);
  registerPlaceableGeneratorOutput(PLANT_MESH_OUTPUT);
}
