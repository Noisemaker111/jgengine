// @skill jgengine-world
/**
 * Ground cover an editor places: a `ground_cover` volume whose sown species mix and care (mowing, trampling, grazing,
 * shade) are grown by the tiller model ({@link createTillerField}) for a number of weeks, and whose grown sward becomes
 * the grass look the volume renders with ({@link tillerCellLook}). A lawn, a hay meadow and a worn path are one kind
 * with different care.
 *
 * @capability ground-cover-field place a lawn, meadow or path the tiller model grows into the grass renderer's look
 */
import { defineParamSchema, parseParams, type ParamsOf } from "../../generator/paramSchema";
import { GRASS_DEFAULTS, resolveGrassObject, type GrassLook, type ResolvedGrass } from "../../grass/grassKind";
import { registerSceneKind, type SceneKindObject } from "../../scene/sceneKinds";
import { GROUND_COVER_LIBRARY, type GroundCoverSpecies } from "./groundCoverSpecies";
import { createTillerField, tillerCellLook } from "./tillerSim";

/** The editor volume kind a ground-cover field is placed as. */
export const GROUND_COVER_FIELD_KIND = "ground_cover";

/** The `ground_cover` params. */
export const GROUND_COVER_SCHEMA = defineParamSchema({
  fields: [
    { type: "weightedList", key: "species", label: "sown (share)", itemLabel: "ground-cover species id", default: [{ item: "lolium-perenne", weight: 2 }, { item: "trifolium-repens", weight: 1 }] },
    { type: "range", key: "weeks", label: "grown", min: 1, max: 104, step: 1, default: 26, unit: "weeks from 1 Jan" },
    { type: "range", key: "mowHeightM", label: "mowed to (0 never)", min: 0, max: 0.3, step: 0.005, default: 0, unit: "m" },
    { type: "range", key: "trample", label: "feet per week", min: 0, max: 1, step: 0.01, default: 0 },
    { type: "range", key: "graze", label: "grazed per week", min: 0, max: 1, step: 0.01, default: 0 },
    { type: "range", key: "light", label: "open sky", min: 0, max: 1, step: 0.01, default: 1 },
    { type: "seed", key: "seed", label: "seed", default: "" },
  ],
});

/** Parsed `ground_cover` params. */
export type GroundCoverParams = ParamsOf<typeof GROUND_COVER_SCHEMA>;

const looks = new Map<string, GrassLook>();
const LOOK_CACHE_LIMIT = 64;

/** Grow the sward for the params, a week at a time under its care, and return the look it renders with. Cached and deterministic. */
export function growGroundCoverLook(params: GroundCoverParams): GrassLook {
  const key = JSON.stringify(params);
  const cached = looks.get(key);
  if (cached !== undefined) return cached;
  const sown = params.species
    .map((entry) => ({ species: GROUND_COVER_LIBRARY.find((known) => known.id === entry.item), weight: entry.weight }))
    .filter((entry): entry is { species: GroundCoverSpecies; weight: number } => entry.species !== undefined && entry.weight > 0);
  const base: GrassLook = { ...GRASS_DEFAULTS, seed: params.seed };
  if (sown.length === 0) return base;
  const species = sown.map((entry) => entry.species);
  const total = sown.reduce((sum, entry) => sum + entry.weight, 0);
  const field = createTillerField({ species, cols: 1, rows: 1, sown: sown.map((entry) => entry.weight / total) });
  const all = { col: 0, row: 0 };
  field.setLight(all, params.light);
  for (let week = 0; week < Math.round(params.weeks); week += 1) {
    field.step(1);
    if (params.mowHeightM > 0) field.mow(all, params.mowHeightM);
    if (params.trample > 0) field.trample(all, params.trample);
    if (params.graze > 0) field.graze(all, params.graze);
  }
  const look = tillerCellLook(field, species, 0, 0, base);
  if (looks.size >= LOOK_CACHE_LIMIT) looks.delete(looks.keys().next().value ?? "");
  looks.set(key, look);
  return look;
}

/** A ground-cover volume's footprint and grown look, the same shape a `grass_field` resolves to. */
export function resolveGroundCoverObject(object: SceneKindObject): ResolvedGrass | null {
  const footprint = resolveGrassObject({ ...object, meta: {} });
  if (footprint === null) return null;
  const params = parseParams(GROUND_COVER_SCHEMA, object.meta);
  return { ...footprint, look: growGroundCoverLook({ ...params, seed: params.seed === "" ? object.id : params.seed }) };
}

/** Registers the `ground_cover` volume kind. Called by `registerBuiltinSceneKinds`. @internal */
export function registerGroundCoverKind(): void {
  registerSceneKind<ResolvedGrass | null>({
    kind: GROUND_COVER_FIELD_KIND,
    target: "volume",
    label: "Ground cover",
    addCategory: "Studios",
    accent: "#9cc76a",
    schema: GROUND_COVER_SCHEMA,
    resolve: (object) => resolveGroundCoverObject(object),
    note: (object) => {
      const resolved = resolveGroundCoverObject(object);
      if (resolved === null) return "Give the volume a box footprint.";
      return `${Math.round(resolved.size[0])}×${Math.round(resolved.size[1])} m · ${Math.round(resolved.look.bladeHeight * 100)} cm sward, ${Math.round(resolved.look.density * 100)}% cover`;
    },
  });
}
