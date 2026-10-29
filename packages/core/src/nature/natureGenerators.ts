// @skill jgengine-world
/**
 * Seeded nature generators on the generator contract: rocks from pebbles to boulders, and
 * driftwood; trees, shrubs, palms and ferns are grown by the plant simulation (`plant.grown`). Each
 * is a bounded param schema (rock shape, erosion, colour …) whose variants differ in shape, tint and
 * wear while still reading as their kind. Recipes (boulder, pebbles …) are schema presets. Every generator returns a {@link NatureMesh} under
 * {@link NATURE_OUTPUT}, so one draw path previews, places and scatter-instances them all.
 *
 * @capability nature-generator seeded rocks, pebbles and driftwood with editor variants and instanced scatter
 */
import { defineGenerator, registerGenerator, untypedGenerator, type GeneratorDefinition } from "../generator/generator";
import { defineParamSchema } from "../generator/paramSchema";
import { registerPlaceableGeneratorOutput } from "../scene/assetGenerator";
import {
  addStone,
  addTube,
  hexRgb,
  NatureMeshBuilder,
  noiseSeed,
  shade,
  type NatureMesh,
  type NatureRgb,
  type NatureVec,
} from "./natureMesh";

function pick<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new RangeError(`index ${index} outside ${values.length} items`);
  return value;
}

/** The generator output family every nature generator returns: a {@link NatureMesh}. */
export const NATURE_OUTPUT = "nature-mesh";

/** Detail levels each nature variant bakes: full near the camera, half for a mid level. */
const NATURE_LODS = [1, 0.5] as const;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** A value in `[1 - amount, 1 + amount]`. */
function spread(random: () => number, amount: number): number {
  return 1 + (random() * 2 - 1) * amount;
}

function sidesFor(detail: number, max: number): number {
  return Math.max(3, Math.round(lerp(4, max, detail)));
}

function barkColors(bark: NatureRgb, seed: number): (index: number, t: number) => NatureRgb {
  return (index, t) => shade(bark, 0.78 + t * 0.22 + ((Math.imul(index + 1, 2654435761) ^ seed) >>> 0) / 4294967296 * 0.12);
}

function pointOnPath(path: readonly NatureVec[], t: number): NatureVec {
  const f = Math.max(0, Math.min(1, t)) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(f));
  const k = f - i;
  const a = pick(path, i);
  const b = pick(path, i + 1);
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}

/** A limb from `start`: heads out at `azimuth` / `elevation` (radians from vertical), curving up toward its tip. */
function limbPath(start: NatureVec, azimuth: number, elevation: number, length: number, upCurve: number, segments: number): NatureVec[] {
  const points: NatureVec[] = [start];
  let [x, y, z] = start;
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    const angle = Math.max(0.05, elevation - upCurve * t * 0.6);
    const step = length / segments;
    x += Math.cos(azimuth) * Math.sin(angle) * step;
    z += Math.sin(azimuth) * Math.sin(angle) * step;
    y += Math.cos(angle) * step;
    points.push([x, y, z]);
  }
  return points;
}

// --- Rock ----------------------------------------------------------------------------------------

/** Rock params: size, shape, shading, cuts, erosion, crags, moss and clustering. */
export const ROCK_SCHEMA = defineParamSchema({
  groups: [
    { id: "shape", label: "Shape" },
    { id: "wear", label: "Wear" },
    { id: "cluster", label: "Cluster" },
    { id: "colour", label: "Colour" },
  ],
  fields: [
    { type: "seed", key: "seed", label: "seed", default: "" },
    { type: "range", key: "size", label: "size", group: "shape", min: 0.05, max: 10, step: 0.01, default: 1.4, unit: "m", explore: [1, 2], exploreScale: "log" },
    { type: "range", key: "stretch", label: "stretch", group: "shape", min: 0.5, max: 2.2, step: 0.01, default: 1.2, explore: [0.9, 1.5] },
    { type: "range", key: "flatness", label: "height", group: "shape", min: 0.25, max: 1.4, step: 0.01, default: 0.68, explore: [0.5, 0.85] },
    { type: "range", key: "roughness", label: "roughness", group: "shape", min: 0, max: 0.6, step: 0.01, default: 0.22 },
    { type: "bool", key: "smooth", label: "smooth shading", group: "shape", default: false },
    { type: "range", key: "facets", label: "cut faces", group: "wear", min: 0, max: 12, step: 1, default: 5 },
    { type: "range", key: "erosion", label: "erosion", group: "wear", min: 0, max: 1, step: 0.01, default: 0.35 },
    { type: "range", key: "crag", label: "crags", group: "wear", min: 0, max: 1, step: 0.01, default: 0 },
    { type: "range", key: "sink", label: "buried", group: "wear", min: 0, max: 0.45, step: 0.01, default: 0.12 },
    { type: "range", key: "moss", label: "moss", group: "wear", min: 0, max: 1, step: 0.01, default: 0.2 },
    { type: "range", key: "count", label: "stones", group: "cluster", min: 1, max: 9, step: 1, default: 1, vary: false },
    { type: "range", key: "scatter", label: "cluster spread", group: "cluster", min: 0.3, max: 3, step: 0.05, default: 1, vary: false },
    { type: "color", key: "color", label: "stone", group: "colour", default: "#8a8478", explore: { hue: 12, saturation: 0.25, lightness: 0.07 } },
    { type: "color", key: "mossColor", label: "moss", group: "colour", default: "#5b7a3a", explore: { hue: 14, saturation: 0.2, lightness: 0.06 } },
    { type: "range", key: "colorVariance", label: "colour variation", group: "colour", min: 0, max: 0.4, step: 0.01, default: 0.12 },
  ],
  presets: [
    { id: "rock", label: "Rock", values: { size: 1.4, count: 1 } },
    { id: "boulder", label: "Boulder", values: { size: 3.6, stretch: 1.3, flatness: 0.72, facets: 7, erosion: 0.45, moss: 0.35 } },
    { id: "pebbles", label: "Pebbles", values: { size: 0.22, count: 6, scatter: 1.6, facets: 2, erosion: 0.8, roughness: 0.12, sink: 0.05, moss: 0, flatness: 0.55 } },
    { id: "slab", label: "Slab", values: { size: 2.4, stretch: 1.8, flatness: 0.32, facets: 9, erosion: 0.15 } },
  ],
});

/** Rocks: rock, boulder, pebbles, slab. */
export const ROCK_GENERATOR = defineGenerator({
  id: "nature.rock",
  label: "Rock",
  output: NATURE_OUTPUT,
  schema: ROCK_SCHEMA,
  lods: NATURE_LODS,
  generate(params, context): NatureMesh {
    const random = context.random("shape");
    const seed = noiseSeed(context.seed);
    const builder = new NatureMeshBuilder();
    const color = hexRgb(params.color);
    const moss = hexRgb(params.mossColor);
    const baseLevel = (params.size < 0.6 || params.count > 3 ? 1 : 2) + (params.smooth ? 1 : 0);
    const level = context.detail >= 0.75 ? baseLevel : Math.max(0, baseLevel - 1);
    for (let i = 0; i < params.count; i += 1) {
      const size = i === 0 ? params.size : params.size * lerp(0.4, 0.85, random());
      const angle = random() * Math.PI * 2;
      const reach = i === 0 ? 0 : params.size * params.scatter * lerp(0.6, 1.2, random());
      const stretch = params.stretch * spread(random, 0.12);
      const half = size / 2;
      addStone(builder, {
        center: [Math.cos(angle) * reach, -half * params.flatness * params.sink * 0.5, Math.sin(angle) * reach],
        radii: [half * stretch, half * params.flatness, half / stretch],
        level,
        roughness: params.roughness,
        facets: params.facets,
        erosion: params.erosion,
        crag: params.crag,
        smooth: params.smooth,
        sink: params.sink,
        seed: seed + i * 101,
        random,
        color,
        mossColor: moss,
        moss: params.moss,
        colorVariance: params.colorVariance,
      });
    }
    return builder.build("rock");
  },
});

// --- Driftwood -----------------------------------------------------------------------------------

/** Driftwood params: a weathered log lying on the ground. */
export const DRIFTWOOD_SCHEMA = defineParamSchema({
  groups: [{ id: "shape", label: "Shape" }, { id: "colour", label: "Colour" }],
  fields: [
    { type: "seed", key: "seed", label: "seed", default: "" },
    { type: "range", key: "length", label: "length", group: "shape", min: 0.5, max: 8, step: 0.05, default: 2.6, unit: "m", explore: [1.8, 3.6], exploreScale: "log" },
    { type: "range", key: "radius", label: "radius", group: "shape", min: 0.04, max: 0.6, step: 0.01, default: 0.16, unit: "m", explore: [0.11, 0.22] },
    { type: "range", key: "bend", label: "bend", group: "shape", min: 0, max: 1, step: 0.01, default: 0.4 },
    { type: "range", key: "stubs", label: "branch stubs", group: "shape", min: 0, max: 6, step: 1, default: 3 },
    { type: "range", key: "gnarl", label: "gnarl", group: "shape", min: 0, max: 0.6, step: 0.01, default: 0.3 },
    { type: "color", key: "color", label: "wood", group: "colour", default: "#b7a68c", explore: { hue: 8, saturation: 0.2, lightness: 0.06 } },
  ],
  presets: [
    { id: "driftwood", label: "Driftwood", values: {} },
    { id: "fallen-log", label: "Fallen log", values: { length: 5, radius: 0.35, stubs: 4, color: "#6b5440" } },
  ],
});

/** Driftwood and fallen logs. */
export const DRIFTWOOD_GENERATOR = defineGenerator({
  id: "nature.driftwood",
  label: "Driftwood",
  output: NATURE_OUTPUT,
  schema: DRIFTWOOD_SCHEMA,
  lods: NATURE_LODS,
  generate(params, context): NatureMesh {
    const random = context.random("shape");
    const seed = noiseSeed(context.seed);
    const builder = new NatureMeshBuilder();
    const wood = hexRgb(params.color);
    const segments = Math.max(3, Math.round(lerp(3, 7, context.detail)));
    const bendDir = random() < 0.5 ? -1 : 1;
    const path: NatureVec[] = [];
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      path.push([(t - 0.5) * params.length, params.radius * 0.8, bendDir * Math.sin(t * Math.PI) * params.bend * params.length * 0.15]);
    }
    const radii = path.map((_, i) => params.radius * (1 - 0.45 * (i / segments)));
    addTube(builder, path, radii, { sides: sidesFor(context.detail, 7), color: barkColors(wood, seed), wobble: params.gnarl, seed, closeTip: true });
    for (let i = 0; i < params.stubs; i += 1) {
      const from = pointOnPath(path, 0.15 + random() * 0.7);
      const stub = limbPath(from, random() * Math.PI * 2, lerp(0.6, 1.4, random()), params.radius * lerp(1.5, 4, random()), 0, 1);
      addTube(builder, stub, [params.radius * 0.45, params.radius * 0.22], { sides: 4, color: barkColors(wood, seed + i), seed });
    }
    return builder.build("bark");
  },
});

/** Every nature generator, in editor order, as the untyped registry view. */
export const NATURE_GENERATORS: readonly GeneratorDefinition[] = [
  untypedGenerator(ROCK_GENERATOR),
  untypedGenerator(DRIFTWOOD_GENERATOR),
];

/** Registers every nature generator. Idempotent; called by `registerBuiltinSceneKinds`. @internal */
export function registerNatureGenerators(): void {
  for (const definition of NATURE_GENERATORS) registerGenerator(definition);
  registerPlaceableGeneratorOutput(NATURE_OUTPUT);
}
