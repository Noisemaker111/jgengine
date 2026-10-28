// @skill jgengine-world
/**
 * Seeded nature generators on the generator contract: broadleaf and conifer trees, palms and
 * cycads, bushes, ferns, rocks from pebbles to boulders, and driftwood. Each is a bounded param
 * schema (trunk shape, branching, leaf clusters, bark and leaf colour, rock shape and erosion …)
 * whose variants differ in lean, branching, clumps, tint and wear while still reading as their
 * species. Species recipes (oak, birch, dead tree, pine, redwood, palm, cycad, berry bush, boulder,
 * pebbles …) are schema presets. Every generator returns a {@link NatureMesh} under
 * {@link NATURE_OUTPUT}, so one draw path previews, places and scatter-instances them all.
 *
 * @capability nature-generator seeded trees, palms, bushes, ferns, rocks and pebbles with editor variants and instanced scatter
 */
import { defineGenerator, registerGenerator, untypedGenerator, type GeneratorDefinition } from "../generator/generator";
import { defineParamSchema } from "../generator/paramSchema";
import { registerPlaceableGeneratorOutput } from "../scene/assetGenerator";
import {

  addBlob,
  addCone,
  addFrond,
  addStone,
  addTube,
  hexRgb,
  mixRgb,
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

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Most leaf clusters one broadleaf grows, so a tree's triangle count stays bounded at any slider setting. */
const MAX_LEAF_CLUSTERS = 24;
const DEG = Math.PI / 180;

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

function blobLevel(detail: number): number {
  return detail >= 0.75 ? 1 : 0;
}

/** A small random colour shift so two clusters of one tree are not the same green. */
function tinted(color: NatureRgb, random: () => number, amount: number): NatureRgb {
  return shade(color, spread(random, amount * 0.6), [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1], amount * 0.35);
}

function barkColors(bark: NatureRgb, seed: number): (index: number, t: number) => NatureRgb {
  return (index, t) => shade(bark, 0.78 + t * 0.22 + ((Math.imul(index + 1, 2654435761) ^ seed) >>> 0) / 4294967296 * 0.12);
}

/** A trunk's centreline: leaning, bending and buried a little so it never floats on a slope. */
function trunkPath(height: number, lean: number, bend: number, segments: number, random: () => number, curve = 0): NatureVec[] {
  const leanDir = random() * Math.PI * 2;
  const bendDir = leanDir + (random() - 0.5) * 2.4;
  const points: NatureVec[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const y = lerp(-0.25, height, t);
    const reach = Math.tan(lean) * y + curve * height * 0.38 * t * t;
    const wiggle = Math.sin(t * Math.PI * 1.3) * bend * height * 0.07;
    points.push([Math.cos(leanDir) * reach + Math.cos(bendDir) * wiggle, y, Math.sin(leanDir) * reach + Math.sin(bendDir) * wiggle]);
  }
  return points;
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

// --- Broadleaf -----------------------------------------------------------------------------------

/** Broadleaf tree params: trunk, branching, canopy clusters and colours. */
export const BROADLEAF_SCHEMA = defineParamSchema({
  groups: [
    { id: "trunk", label: "Trunk" },
    { id: "branches", label: "Branches" },
    { id: "canopy", label: "Canopy" },
    { id: "colour", label: "Colour" },
  ],
  fields: [
    { type: "seed", key: "seed", label: "seed", default: "" },
    { type: "range", key: "height", label: "height", group: "trunk", min: 1.5, max: 30, step: 0.1, default: 9, unit: "m", explore: [5, 14], exploreScale: "log" },
    { type: "range", key: "trunkRadius", label: "trunk radius", group: "trunk", min: 0.06, max: 1.6, step: 0.01, default: 0.34, unit: "m", explore: [0.18, 0.6], exploreScale: "log" },
    { type: "range", key: "taper", label: "taper", group: "trunk", min: 0.2, max: 0.9, step: 0.01, default: 0.6 },
    { type: "range", key: "lean", label: "lean", group: "trunk", min: 0, max: 0.5, step: 0.01, default: 0.07, unit: "rad", explore: [0, 0.2] },
    { type: "range", key: "bend", label: "bend", group: "trunk", min: 0, max: 1, step: 0.01, default: 0.35 },
    { type: "range", key: "gnarl", label: "gnarl", group: "trunk", min: 0, max: 0.6, step: 0.01, default: 0.18 },
    { type: "range", key: "branches", label: "branches", group: "branches", min: 0, max: 10, step: 1, default: 5, explore: [3, 8] },
    { type: "range", key: "branchStart", label: "first branch", group: "branches", min: 0.15, max: 0.85, step: 0.01, default: 0.42, explore: [0.3, 0.6] },
    { type: "range", key: "branchAngle", label: "branch angle", group: "branches", min: 15, max: 85, step: 1, default: 52, unit: "°", explore: [35, 70] },
    { type: "range", key: "branchLength", label: "branch length", group: "branches", min: 0.15, max: 0.8, step: 0.01, default: 0.42, explore: [0.3, 0.55] },
    { type: "range", key: "twigs", label: "twigs per branch", group: "branches", min: 0, max: 3, step: 1, default: 1 },
    { type: "range", key: "leafDensity", label: "leaf density", group: "canopy", min: 0, max: 1, step: 0.01, default: 1, vary: false },
    { type: "range", key: "clusterSize", label: "cluster size", group: "canopy", min: 0.4, max: 5, step: 0.05, default: 2.1, unit: "m", explore: [1.5, 2.8] },
    { type: "range", key: "clusterSquash", label: "cluster squash", group: "canopy", min: 0.4, max: 1.2, step: 0.01, default: 0.72 },
    { type: "range", key: "lumpiness", label: "lumpiness", group: "canopy", min: 0, max: 0.6, step: 0.01, default: 0.28 },
    { type: "color", key: "barkColor", label: "bark", group: "colour", default: "#6a4e38", explore: { hue: 10, saturation: 0.2, lightness: 0.06 } },
    { type: "color", key: "leafColor", label: "leaves", group: "colour", default: "#4f8a36", explore: { hue: 18, saturation: 0.2, lightness: 0.07 } },
    { type: "range", key: "leafTint", label: "leaf tint variation", group: "colour", min: 0, max: 0.5, step: 0.01, default: 0.16 },
  ],
  presets: [
    { id: "oak", label: "Oak", values: { height: 9, trunkRadius: 0.38, branches: 6, branchAngle: 58, twigs: 2, clusterSize: 1.7, leafColor: "#4f8a36", barkColor: "#6a4e38" } },
    { id: "birch", label: "Birch", values: { height: 11, trunkRadius: 0.18, taper: 0.5, branches: 5, branchStart: 0.5, branchAngle: 38, branchLength: 0.3, clusterSize: 1.5, clusterSquash: 0.95, barkColor: "#d9d4c7", leafColor: "#7fae3e" } },
    { id: "tropical", label: "Tropical hardwood", values: { height: 14, trunkRadius: 0.5, branchStart: 0.62, branchAngle: 66, branchLength: 0.45, clusterSize: 2.8, clusterSquash: 0.55, leafColor: "#3b7a2f", barkColor: "#7b6650" } },
    { id: "dead", label: "Dead tree", values: { leafDensity: 0, twigs: 2, branches: 6, gnarl: 0.35, bend: 0.6, barkColor: "#8a8173" } },
  ],
});

/** Broadleaf trees: oak, birch, tropical hardwood, dead tree. */
export const BROADLEAF_GENERATOR = defineGenerator({
  id: "nature.broadleaf",
  label: "Broadleaf tree",
  output: NATURE_OUTPUT,
  schema: BROADLEAF_SCHEMA,
  lods: NATURE_LODS,
  generate(params, context): NatureMesh {
    const random = context.random("shape");
    const seed = noiseSeed(context.seed);
    const builder = new NatureMeshBuilder();
    const bark = hexRgb(params.barkColor);
    const leaf = hexRgb(params.leafColor);
    const sides = sidesFor(context.detail, 9);
    const height = params.height;
    const trunk = trunkPath(height, params.lean, params.bend, Math.max(3, Math.round(6 * context.detail)), random);
    const trunkRadius = (t: number) => params.trunkRadius * (1 - params.taper * t) * (t < 0.08 ? 1 + (0.08 - t) * 6 : 1);
    addTube(builder, trunk, trunk.map((_, i) => trunkRadius(i / (trunk.length - 1))), { sides, color: barkColors(bark, seed), wobble: params.gnarl, seed });
    const tips: { at: NatureVec; scale: number }[] = [];
    const limbSegments = context.detail >= 0.75 ? 3 : 2;
    for (let b = 0; b < params.branches; b += 1) {
      const t = params.branchStart + (1 - params.branchStart) * 0.82 * ((b + random() * 0.8) / Math.max(1, params.branches));
      const start = pointOnPath(trunk, t);
      const azimuth = b * GOLDEN * 1.0 + random() * 0.9;
      const elevation = params.branchAngle * DEG * spread(random, 0.2);
      const length = params.branchLength * height * (1 - 0.45 * (t - params.branchStart)) * spread(random, 0.2);
      const limb = limbPath(start, azimuth, elevation, length, 0.5 + params.bend * 0.4, limbSegments);
      const base = trunkRadius(t) * 0.62;
      addTube(builder, limb, limb.map((_, i) => base * (1 - 0.75 * (i / limb.length))), { sides: Math.max(3, sides - 3), color: barkColors(bark, seed + b), wobble: params.gnarl * 0.5, seed: seed + b });
      tips.push({ at: pick(limb, limb.length - 1), scale: 1 });
      for (let k = 0; k < params.twigs && tips.length < MAX_LEAF_CLUSTERS - 1; k += 1) {
        const from = pointOnPath(limb, 0.45 + random() * 0.4);
        const twig = limbPath(from, azimuth + (random() - 0.5) * 2.2, elevation * spread(random, 0.3), length * 0.42 * spread(random, 0.25), 0.4, 2);
        addTube(builder, twig, [base * 0.45, base * 0.28, base * 0.12], { sides: 3, color: barkColors(bark, seed + b * 7 + k), seed });
        tips.push({ at: pick(twig, twig.length - 1), scale: 0.72 });
      }
    }
    tips.push({ at: pick(trunk, trunk.length - 1), scale: 1.15 });
    const clusterRandom = context.random("leaves");
    for (const tip of tips) {
      const keep = clusterRandom();
      if (keep >= params.leafDensity) continue;
      const size = params.clusterSize * tip.scale * spread(clusterRandom, 0.2);
      const lift = tip.at[1] / Math.max(1, height);
      addBlob(builder, {
        center: [tip.at[0], tip.at[1] + size * 0.15, tip.at[2]],
        radii: [size, size * params.clusterSquash, size * spread(clusterRandom, 0.12)],
        level: blobLevel(context.detail),
        lumpiness: params.lumpiness,
        seed: seed + Math.floor(keep * 100000),
        color: shade(tinted(leaf, clusterRandom, params.leafTint), 0.9 + lift * 0.15),
        colorJitter: params.leafTint,
        shadeBelow: 0.4,
      });
    }
    return builder.build();
  },
});

// --- Conifer -------------------------------------------------------------------------------------

/** Conifer params: trunk, tiered crown and colours. */
export const CONIFER_SCHEMA = defineParamSchema({
  groups: [
    { id: "trunk", label: "Trunk" },
    { id: "crown", label: "Crown" },
    { id: "colour", label: "Colour" },
  ],
  fields: [
    { type: "seed", key: "seed", label: "seed", default: "" },
    { type: "range", key: "height", label: "height", group: "trunk", min: 1.5, max: 45, step: 0.1, default: 12, unit: "m", explore: [8, 16], exploreScale: "log" },
    { type: "range", key: "trunkRadius", label: "trunk radius", group: "trunk", min: 0.05, max: 2, step: 0.01, default: 0.3, unit: "m", explore: [0.2, 0.45], exploreScale: "log" },
    { type: "range", key: "lean", label: "lean", group: "trunk", min: 0, max: 0.35, step: 0.01, default: 0.03, unit: "rad", explore: [0, 0.1] },
    { type: "range", key: "crownBase", label: "crown starts at", group: "crown", min: 0.02, max: 0.7, step: 0.01, default: 0.18, explore: [0.1, 0.3] },
    { type: "range", key: "crownWidth", label: "crown width", group: "crown", min: 0.12, max: 0.7, step: 0.01, default: 0.34, explore: [0.26, 0.42] },
    { type: "range", key: "tiers", label: "tiers", group: "crown", min: 3, max: 14, step: 1, default: 7, explore: [5, 9] },
    { type: "range", key: "droop", label: "tier droop", group: "crown", min: 0, max: 0.8, step: 0.01, default: 0.32 },
    { type: "range", key: "ragged", label: "raggedness", group: "crown", min: 0, max: 0.8, step: 0.01, default: 0.3 },
    { type: "range", key: "sparse", label: "gaps", group: "crown", min: 0, max: 0.6, step: 0.01, default: 0.05, explore: [0, 0.1] },
    { type: "color", key: "barkColor", label: "bark", group: "colour", default: "#5b4334", explore: { hue: 8, saturation: 0.2, lightness: 0.05 } },
    { type: "color", key: "needleColor", label: "needles", group: "colour", default: "#2f5f3a", explore: { hue: 14, saturation: 0.2, lightness: 0.06 } },
    { type: "range", key: "tint", label: "tint variation", group: "colour", min: 0, max: 0.5, step: 0.01, default: 0.12 },
  ],
  presets: [
    { id: "pine", label: "Pine", values: { height: 12, crownBase: 0.2, crownWidth: 0.34, tiers: 7 } },
    { id: "spruce", label: "Spruce", values: { height: 14, crownBase: 0.06, crownWidth: 0.4, tiers: 10, droop: 0.45, needleColor: "#264f37" } },
    { id: "redwood", label: "Redwood", values: { height: 32, trunkRadius: 1.25, crownBase: 0.52, crownWidth: 0.2, tiers: 11, droop: 0.2, ragged: 0.45, sparse: 0.2, barkColor: "#7a3f2a", needleColor: "#335c34" } },
  ],
});

/** Conifers: pine, spruce, redwood. */
export const CONIFER_GENERATOR = defineGenerator({
  id: "nature.conifer",
  label: "Conifer",
  output: NATURE_OUTPUT,
  schema: CONIFER_SCHEMA,
  lods: NATURE_LODS,
  generate(params, context): NatureMesh {
    const random = context.random("shape");
    const seed = noiseSeed(context.seed);
    const builder = new NatureMeshBuilder();
    const bark = hexRgb(params.barkColor);
    const needles = hexRgb(params.needleColor);
    const height = params.height;
    const trunk = trunkPath(height * 0.97, params.lean, 0.15, Math.max(2, Math.round(4 * context.detail)), random);
    addTube(builder, trunk, trunk.map((_, i) => {
      const t = i / (trunk.length - 1);
      return params.trunkRadius * (1 - 0.88 * t) * (t < 0.1 ? 1 + (0.1 - t) * 5 : 1);
    }), { sides: sidesFor(context.detail, 8), color: barkColors(bark, seed), wobble: 0.15, seed });
    const crownStart = params.crownBase * height;
    const crownSpan = height - crownStart;
    const tiers = params.tiers;
    const tierHeight = (crownSpan / tiers) * 1.9;
    const sides = Math.max(4, Math.round(lerp(4, 7, context.detail)));
    const treeNeedles = tinted(needles, random, params.tint);
    for (let i = 0; i < tiers; i += 1) {
      const t = i / Math.max(1, tiers - 1);
      if (i > 0 && i < tiers - 1 && random() < params.sparse) continue;
      const at = pointOnPath(trunk, (crownStart + crownSpan * t * 0.9) / height);
      const radius = Math.max(0.15, height * params.crownWidth * 0.5 * Math.pow(1 - t * 0.92, 0.9) * spread(random, 0.12));
      const color = tinted(shade(treeNeedles, 0.88 + t * 0.2), random, params.tint * 0.3);
      const coneHeight = Math.min(tierHeight, radius * 2.4);
      addCone(builder, {
        base: [at[0] + (random() - 0.5) * radius * 0.12, Math.max(at[1], coneHeight * params.droop + 0.1), at[2] + (random() - 0.5) * radius * 0.12],
        height: coneHeight,
        radius,
        sides,
        droop: params.droop,
        ragged: params.ragged,
        seed: seed + i * 13,
        color,
        rimColor: shade(color, 0.78),
      });
    }
    return builder.build();
  },
});

// --- Palm ----------------------------------------------------------------------------------------

/** Palm and cycad params: curved banded trunk, frond crown, fruit. */
export const PALM_SCHEMA = defineParamSchema({
  groups: [
    { id: "trunk", label: "Trunk" },
    { id: "fronds", label: "Fronds" },
    { id: "colour", label: "Colour" },
  ],
  fields: [
    { type: "seed", key: "seed", label: "seed", default: "" },
    { type: "range", key: "height", label: "height", group: "trunk", min: 0.4, max: 18, step: 0.1, default: 8, unit: "m", explore: [6, 10], exploreScale: "log" },
    { type: "range", key: "trunkRadius", label: "trunk radius", group: "trunk", min: 0.08, max: 0.8, step: 0.01, default: 0.2, unit: "m", explore: [0.16, 0.26] },
    { type: "range", key: "curve", label: "curve", group: "trunk", min: 0, max: 1, step: 0.01, default: 0.45, explore: [0.15, 0.75] },
    { type: "range", key: "lean", label: "lean", group: "trunk", min: 0, max: 0.6, step: 0.01, default: 0.12, unit: "rad", explore: [0, 0.3] },
    { type: "range", key: "bands", label: "trunk rings", group: "trunk", min: 0, max: 1, step: 0.01, default: 0.35 },
    { type: "range", key: "fronds", label: "fronds", group: "fronds", min: 3, max: 20, step: 1, default: 9, explore: [7, 12] },
    { type: "range", key: "frondLength", label: "frond length", group: "fronds", min: 0.4, max: 6, step: 0.05, default: 3.4, unit: "m", explore: [2.6, 4.2] },
    { type: "range", key: "frondWidth", label: "frond width", group: "fronds", min: 0.1, max: 1.6, step: 0.01, default: 0.75 },
    { type: "range", key: "droop", label: "droop", group: "fronds", min: 0, max: 1.4, step: 0.01, default: 0.75, explore: [0.5, 1] },
    { type: "range", key: "leaflets", label: "leaflets", group: "fronds", min: 0, max: 14, step: 1, default: 8 },
    { type: "range", key: "fruit", label: "coconuts", group: "fronds", min: 0, max: 8, step: 1, default: 3, vary: false },
    { type: "color", key: "trunkColor", label: "trunk", group: "colour", default: "#8a7356", explore: { hue: 8, saturation: 0.2, lightness: 0.05 } },
    { type: "color", key: "frondColor", label: "fronds", group: "colour", default: "#4f8f3a", explore: { hue: 14, saturation: 0.2, lightness: 0.06 } },
    { type: "color", key: "tipColor", label: "frond tips", group: "colour", default: "#8fae4a", explore: { hue: 14, saturation: 0.2, lightness: 0.06 } },
    { type: "color", key: "fruitColor", label: "fruit", group: "colour", default: "#5b4a2a" },
  ],
  presets: [
    { id: "coconut", label: "Coconut palm", values: { height: 8, curve: 0.45, fronds: 9, frondLength: 3.4, fruit: 3 } },
    { id: "cycad", label: "Cycad", values: { height: 1.3, trunkRadius: 0.32, curve: 0.05, lean: 0.04, bands: 0.7, fronds: 16, frondLength: 1.6, frondWidth: 0.42, droop: 0.3, leaflets: 12, fruit: 0, trunkColor: "#5f5140", frondColor: "#2f6b32", tipColor: "#4d8a3a" } },
    { id: "fan", label: "Fan palm", values: { height: 5, trunkRadius: 0.28, curve: 0.1, fronds: 14, frondLength: 1.8, frondWidth: 1.3, droop: 0.4, leaflets: 0, fruit: 0 } },
  ],
});

/** Palms and cycads: coconut palm, cycad, fan palm. */
export const PALM_GENERATOR = defineGenerator({
  id: "nature.palm",
  label: "Palm",
  output: NATURE_OUTPUT,
  schema: PALM_SCHEMA,
  lods: NATURE_LODS,
  generate(params, context): NatureMesh {
    const random = context.random("shape");
    const seed = noiseSeed(context.seed);
    const builder = new NatureMeshBuilder();
    const trunkColor = hexRgb(params.trunkColor);
    const segments = Math.max(3, Math.round(lerp(4, 12, context.detail) * Math.min(1.5, Math.max(0.5, params.height / 8))));
    const trunk = trunkPath(params.height, params.lean, 0.1, segments, random, params.curve);
    addTube(builder, trunk, trunk.map((_, i) => {
      const t = i / (trunk.length - 1);
      return params.trunkRadius * (1 - 0.3 * t) * (i % 2 === 0 ? 1 : 1 - params.bands * 0.12) * (t < 0.1 ? 1 + (0.1 - t) * 4 : 1);
    }), { sides: sidesFor(context.detail, 8), color: (i, t) => shade(trunkColor, (i % 2 === 0 ? 1 : 1 - params.bands * 0.35) * (0.82 + t * 0.2)), seed });
    const top = pick(trunk, trunk.length - 1);
    const frond = hexRgb(params.frondColor);
    const tip = hexRgb(params.tipColor);
    const frondSegments = Math.max(3, Math.round(lerp(3, 7, context.detail)) + (params.leaflets > 0 ? 2 : 0));
    for (let i = 0; i < params.fronds; i += 1) {
      const heading = i * GOLDEN * 1.0 + random() * 0.4;
      const pitch = lerp(0.2, 0.95, random()) + (params.height < 2 ? 0.25 : 0);
      addFrond(builder, {
        base: top,
        heading,
        pitch,
        length: params.frondLength * spread(random, 0.15),
        width: params.frondWidth * spread(random, 0.15),
        droop: params.droop * spread(random, 0.2),
        segments: params.leaflets > 0 ? Math.max(frondSegments, Math.round(params.leaflets * context.detail)) : frondSegments,
        leaflets: params.leaflets,
        fold: 0.45,
        color: tinted(frond, random, 0.15),
        tipColor: tip,
      });
    }
    const fruit = hexRgb(params.fruitColor);
    for (let i = 0; i < params.fruit; i += 1) {
      const angle = random() * Math.PI * 2;
      const r = params.trunkRadius * 1.1;
      const size = Math.max(0.08, params.trunkRadius * 0.55);
      addBlob(builder, { center: [top[0] + Math.cos(angle) * r, top[1] - size * 1.2, top[2] + Math.sin(angle) * r], radii: [size, size * 1.1, size], level: 0, lumpiness: 0.1, seed: seed + i, color: fruit, colorJitter: 0.1, shadeBelow: 0.3 });
    }
    return builder.build();
  },
});

// --- Bush ----------------------------------------------------------------------------------------

/** Bush params: footprint, clumps, berries and colours. */
export const BUSH_SCHEMA = defineParamSchema({
  groups: [
    { id: "shape", label: "Shape" },
    { id: "berries", label: "Berries" },
    { id: "colour", label: "Colour" },
  ],
  fields: [
    { type: "seed", key: "seed", label: "seed", default: "" },
    { type: "range", key: "width", label: "width", group: "shape", min: 0.3, max: 5, step: 0.05, default: 1.4, unit: "m", explore: [1, 1.9], exploreScale: "log" },
    { type: "range", key: "height", label: "height", group: "shape", min: 0.2, max: 4, step: 0.05, default: 1.1, unit: "m", explore: [0.8, 1.4], exploreScale: "log" },
    { type: "range", key: "clumps", label: "clumps", group: "shape", min: 2, max: 14, step: 1, default: 6, explore: [4, 9] },
    { type: "range", key: "clumpSize", label: "clump size", group: "shape", min: 0.25, max: 0.8, step: 0.01, default: 0.48 },
    { type: "range", key: "lumpiness", label: "lumpiness", group: "shape", min: 0, max: 0.6, step: 0.01, default: 0.3 },
    { type: "range", key: "berries", label: "berries", group: "berries", min: 0, max: 40, step: 1, default: 0, vary: false },
    { type: "range", key: "berrySize", label: "berry size", group: "berries", min: 0.02, max: 0.15, step: 0.005, default: 0.06, unit: "m" },
    { type: "color", key: "leafColor", label: "leaves", group: "colour", default: "#4a7f34", explore: { hue: 18, saturation: 0.2, lightness: 0.07 } },
    { type: "range", key: "tint", label: "tint variation", group: "colour", min: 0, max: 0.5, step: 0.01, default: 0.18 },
    { type: "color", key: "berryColor", label: "berries", group: "colour", default: "#b3243a", explore: { hue: 30, saturation: 0.2, lightness: 0.08 } },
  ],
  presets: [
    { id: "shrub", label: "Shrub", values: { width: 1.4, height: 1.1, berries: 0 } },
    { id: "berry", label: "Berry bush", values: { width: 1.5, height: 1.2, clumps: 7, berries: 26, leafColor: "#3f7a37" } },
    { id: "hedge", label: "Low hedge", values: { width: 2.6, height: 0.8, clumps: 10, clumpSize: 0.38, lumpiness: 0.18 } },
  ],
});

/** Bushes: shrub, berry bush, low hedge. */
export const BUSH_GENERATOR = defineGenerator({
  id: "nature.bush",
  label: "Bush",
  output: NATURE_OUTPUT,
  schema: BUSH_SCHEMA,
  lods: NATURE_LODS,
  generate(params, context): NatureMesh {
    const random = context.random("shape");
    const seed = noiseSeed(context.seed);
    const builder = new NatureMeshBuilder();
    const leaf = hexRgb(params.leafColor);
    const halfW = params.width / 2;
    const clumps: { center: NatureVec; radii: NatureVec }[] = [];
    const core = Math.min(halfW, params.height) * 0.7;
    clumps.push({ center: [0, params.height * 0.45, 0], radii: [halfW * 0.75, params.height * 0.5, halfW * 0.75] });
    for (let i = 0; i < params.clumps; i += 1) {
      const angle = i * GOLDEN * 1.0 + random() * 0.6;
      const reach = halfW * (0.35 + random() * 0.4);
      const size = Math.max(core * 0.4, params.width * params.clumpSize * 0.5 * spread(random, 0.25));
      const y = params.height * lerp(0.3, 0.7, random());
      clumps.push({ center: [Math.cos(angle) * reach, Math.max(size * 0.55, Math.min(y, params.height - size * 0.6)), Math.sin(angle) * reach], radii: [size, size * 0.85, size * spread(random, 0.15)] });
    }
    clumps.forEach((clump, index) => {
      addBlob(builder, { center: clump.center, radii: clump.radii, level: blobLevel(context.detail), lumpiness: params.lumpiness, seed: seed + index * 31, color: tinted(leaf, random, params.tint), colorJitter: params.tint, shadeBelow: 0.45 });
    });
    const berry = hexRgb(params.berryColor);
    const berryRandom = context.random("berries");
    const berries = Math.round(params.berries * (context.detail >= 0.75 ? 1 : 0.5));
    for (let i = 0; i < berries; i += 1) {
      const clump = clumps[1 + Math.floor(berryRandom() * Math.max(1, clumps.length - 1))] ?? pick(clumps, 0);
      const theta = berryRandom() * Math.PI * 2;
      const phi = Math.acos(berryRandom() * 1.4 - 0.4);
      const out: NatureVec = [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
      const size = params.berrySize * spread(berryRandom, 0.25);
      addBlob(builder, {
        center: [clump.center[0] + out[0] * clump.radii[0] * 0.98, clump.center[1] + out[1] * clump.radii[1] * 0.98, clump.center[2] + out[2] * clump.radii[2] * 0.98],
        radii: [size, size, size],
        level: 0,
        lumpiness: 0,
        seed,
        color: shade(berry, spread(berryRandom, 0.15)),
        colorJitter: 0,
        shadeBelow: 0.3,
      });
    }
    return builder.build();
  },
});

// --- Fern ----------------------------------------------------------------------------------------

/** Fern params: frond rosette, arch and colours. */
export const FERN_SCHEMA = defineParamSchema({
  groups: [
    { id: "fronds", label: "Fronds" },
    { id: "colour", label: "Colour" },
  ],
  fields: [
    { type: "seed", key: "seed", label: "seed", default: "" },
    { type: "range", key: "fronds", label: "fronds", group: "fronds", min: 3, max: 22, step: 1, default: 10, explore: [7, 14] },
    { type: "range", key: "frondLength", label: "frond length", group: "fronds", min: 0.2, max: 3, step: 0.05, default: 1.05, unit: "m", explore: [0.8, 1.4], exploreScale: "log" },
    { type: "range", key: "frondWidth", label: "frond width", group: "fronds", min: 0.06, max: 0.8, step: 0.01, default: 0.3 },
    { type: "range", key: "spread", label: "spread", group: "fronds", min: 0, max: 1, step: 0.01, default: 0.55, explore: [0.35, 0.75] },
    { type: "range", key: "arch", label: "arch", group: "fronds", min: 0, max: 1.4, step: 0.01, default: 0.7, explore: [0.45, 0.95] },
    { type: "range", key: "leaflets", label: "leaflets", group: "fronds", min: 0, max: 16, step: 1, default: 10 },
    { type: "color", key: "color", label: "fronds", group: "colour", default: "#3f7d35", explore: { hue: 16, saturation: 0.2, lightness: 0.07 } },
    { type: "color", key: "tipColor", label: "tips", group: "colour", default: "#7aa844", explore: { hue: 16, saturation: 0.2, lightness: 0.07 } },
  ],
  presets: [
    { id: "fern", label: "Fern", values: {} },
    { id: "tree-fern-crown", label: "Low frond clump", values: { fronds: 16, frondLength: 0.7, spread: 0.8, arch: 0.4 } },
    { id: "bracken", label: "Bracken", values: { fronds: 7, frondLength: 1.4, frondWidth: 0.5, spread: 0.35, color: "#5d7a2e", tipColor: "#9a8a3e" } },
  ],
});

/** Ferns: fern, low frond clump, bracken. */
export const FERN_GENERATOR = defineGenerator({
  id: "nature.fern",
  label: "Fern",
  output: NATURE_OUTPUT,
  schema: FERN_SCHEMA,
  lods: NATURE_LODS,
  generate(params, context): NatureMesh {
    const random = context.random("shape");
    const builder = new NatureMeshBuilder();
    const color = hexRgb(params.color);
    const tip = hexRgb(params.tipColor);
    const segments = Math.max(3, Math.round(lerp(3, Math.max(4, params.leaflets), context.detail)));
    for (let i = 0; i < params.fronds; i += 1) {
      const heading = i * GOLDEN * 1.0 + random() * 0.5;
      addFrond(builder, {
        base: [(random() - 0.5) * 0.08, 0, (random() - 0.5) * 0.08],
        heading,
        pitch: lerp(1.25, 0.35, params.spread) + (random() - 0.5) * 0.3,
        length: params.frondLength * spread(random, 0.2),
        width: params.frondWidth * spread(random, 0.15),
        droop: params.arch * spread(random, 0.2),
        segments,
        leaflets: params.leaflets,
        fold: 0.3,
        color: tinted(color, random, 0.18),
        tipColor: mixRgb(tip, color, random() * 0.4),
      });
    }
    return builder.build();
  },
});

// --- Rock ----------------------------------------------------------------------------------------

/** Rock params: size, shape, cuts, erosion, moss and clustering. */
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
    { type: "range", key: "facets", label: "cut faces", group: "wear", min: 0, max: 12, step: 1, default: 5 },
    { type: "range", key: "erosion", label: "erosion", group: "wear", min: 0, max: 1, step: 0.01, default: 0.35 },
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
    const baseLevel = params.size < 0.6 || params.count > 3 ? 1 : 2;
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
        sink: params.sink,
        seed: seed + i * 101,
        random,
        color,
        mossColor: moss,
        moss: params.moss,
        colorVariance: params.colorVariance,
      });
    }
    return builder.build();
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
    return builder.build();
  },
});

/** Every nature generator, in editor order, as the untyped registry view. */
export const NATURE_GENERATORS: readonly GeneratorDefinition[] = [
  untypedGenerator(BROADLEAF_GENERATOR),
  untypedGenerator(CONIFER_GENERATOR),
  untypedGenerator(PALM_GENERATOR),
  untypedGenerator(BUSH_GENERATOR),
  untypedGenerator(FERN_GENERATOR),
  untypedGenerator(ROCK_GENERATOR),
  untypedGenerator(DRIFTWOOD_GENERATOR),
];

/** Registers every nature generator. Idempotent; called by `registerBuiltinSceneKinds`. @internal */
export function registerNatureGenerators(): void {
  for (const definition of NATURE_GENERATORS) registerGenerator(definition);
  registerPlaceableGeneratorOutput(NATURE_OUTPUT);
}
