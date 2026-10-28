// @skill jgengine-world
/**
 * Rock fragments as meshes on the generator contract: {@link fragmentMesh} turns one fragment into a
 * flat-shaded {@link NatureMesh} (weathered faces in the stone colour, fresh fracture faces lighter),
 * {@link rockCell} cuts a convex stone, and `fracture.rock` previews a stone broken at a chosen energy.
 *
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */

import { defineGenerator, registerGenerator, untypedGenerator, type GeneratorDefinition } from "../generator/generator";
import { defineParamSchema } from "../generator/paramSchema";
import { NatureMeshBuilder, hexRgb, type NatureMesh, type NatureRgb } from "../nature/natureMesh";
import { NATURE_OUTPUT } from "../nature/natureGenerators";
import type { SeededRng } from "../random/rng";
import { boxCell, cellVolume, clipCell, type CellVec, type ConvexCell } from "./convexCell";
import { KWH_PER_TONNE } from "./fragmentSize";
import { ROCK_BREAKAGE, fractureRock, type RockFragment } from "./rockFracture";

/**
 * A convex stone centred at the origin: an ellipsoid of half-axes `radii` cut by `facets` random tangent planes, each set
 * in by up to `roughness` of its reach.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function rockCell(radii: CellVec, facets: number, roughness: number, rng: SeededRng): ConvexCell {
  let cell = boxCell([-radii[0], -radii[1], -radii[2]], [radii[0], radii[1], radii[2]]);
  for (let i = 0; i < facets; i += 1) {
    const z = rng() * 2 - 1;
    const angle = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    const n: CellVec = [r * Math.cos(angle), r * Math.sin(angle), z];
    const reach = Math.hypot(radii[0] * n[0], radii[1] * n[1], radii[2] * n[2]);
    cell = clipCell(cell, { normal: n, offset: reach * (1 - roughness * rng()) }, false);
  }
  return cell;
}

/**
 * A fragment's mesh, positions relative to its centre: one flat-shaded polygon per face, fracture faces in `fractureColor`.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function fragmentMesh(fragment: Pick<RockFragment, "cell" | "centre">, color: NatureRgb, fractureColor: NatureRgb, offset: CellVec = [0, 0, 0]): NatureMesh {
  const builder = new NatureMeshBuilder();
  addCell(builder, fragment.cell, fragment.centre, color, fractureColor, offset);
  return builder.build("rock");
}

function addCell(builder: NatureMeshBuilder, cell: ConvexCell, centre: CellVec, color: NatureRgb, fractureColor: NatureRgb, offset: CellVec): void {
  for (const face of cell.faces) {
    const tint = face.fracture ? fractureColor : color;
    const first = builder.vertexCount;
    for (const p of face.vertices) builder.vertex([p[0] - centre[0] + offset[0], p[1] - centre[1] + offset[1], p[2] - centre[2] + offset[2]], tint);
    for (let i = 1; i + 1 < face.vertices.length; i += 1) builder.triangle(first, first + i, first + i + 1);
  }
}

/** Params of `fracture.rock`. */
export const ROCK_FRACTURE_SCHEMA = defineParamSchema({
  groups: [
    { id: "stone", label: "Stone" },
    { id: "impact", label: "Impact" },
    { id: "colour", label: "Colour" },
  ],
  fields: [
    { type: "seed", key: "seed", label: "seed", default: "" },
    { type: "select", key: "rock", label: "rock", group: "stone", options: ROCK_BREAKAGE.map((rock) => ({ value: rock.id })), default: "granite" },
    { type: "range", key: "size", label: "size", group: "stone", min: 0.05, max: 4, step: 0.01, default: 0.6, unit: "m", explore: [0.3, 1.2], exploreScale: "log" },
    { type: "range", key: "stretch", label: "stretch", group: "stone", min: 0.6, max: 2, step: 0.01, default: 1.2 },
    { type: "range", key: "flatness", label: "height", group: "stone", min: 0.3, max: 1.2, step: 0.01, default: 0.75 },
    { type: "range", key: "facets", label: "cut faces", group: "stone", min: 4, max: 40, step: 1, default: 18 },
    { type: "range", key: "energy", label: "impact energy", group: "impact", min: 0.01, max: 3, step: 0.01, default: 0.3, unit: "kWh/t", exploreScale: "log" },
    { type: "range", key: "fragments", label: "most pieces", group: "impact", min: 2, max: 96, step: 1, default: 32, vary: false },
    { type: "range", key: "explode", label: "flight", group: "impact", min: 0, max: 0.5, step: 0.01, default: 0.03, unit: "s" },
    { type: "color", key: "color", label: "stone", group: "colour", default: "#8a8478" },
    { type: "color", key: "fractureColor", label: "fresh break", group: "colour", default: "#c9c2b4" },
  ],
  presets: [
    { id: "chipped", label: "Chipped", values: { energy: 0.05 } },
    { id: "split", label: "Split", values: { energy: 0.3 } },
    { id: "shattered", label: "Shattered", values: { energy: 2, fragments: 80 } },
  ],
});

/**
 * A stone broken by a blow from above, its fragments shown `explode` seconds into their flight.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export const ROCK_FRACTURE_GENERATOR = defineGenerator({
  id: "fracture.rock",
  label: "Broken rock",
  output: NATURE_OUTPUT,
  schema: ROCK_FRACTURE_SCHEMA,
  generate(params, context): NatureMesh {
    const material = ROCK_BREAKAGE.find((rock) => rock.id === params.rock) ?? ROCK_BREAKAGE[0];
    const half = params.size / 2;
    const builder = new NatureMeshBuilder();
    const color = hexRgb(params.color);
    const fresh = hexRgb(params.fractureColor);
    if (material === undefined) return builder.build("rock");
    const stone = rockCell([half * params.stretch, half * params.flatness, half / params.stretch], params.facets, 0.2, context.random("shape"));
    let top = -Infinity;
    for (const face of stone.faces) for (const p of face.vertices) top = Math.max(top, p[1]);
    const volume = cellVolume(stone).volume;
    const result = fractureRock(stone, {
      material,
      energy: params.energy * KWH_PER_TONNE * volume * material.density,
      impactPoint: [0, top, 0],
      rng: context.random("break"),
      maxFragments: params.fragments,
      force: true,
    });
    for (const fragment of result.fragments) {
      const t = params.explode;
      const offset: CellVec = [fragment.centre[0] + fragment.velocity[0] * t, fragment.centre[1] + fragment.velocity[1] * t, fragment.centre[2] + fragment.velocity[2] * t];
      addCell(builder, fragment.cell, fragment.centre, color, fresh, offset);
    }
    return builder.build("rock");
  },
});

/** The fracture generators. */
export const FRACTURE_GENERATORS: readonly GeneratorDefinition[] = [untypedGenerator(ROCK_FRACTURE_GENERATOR)];

/** Registers `fracture.rock`. Idempotent. @internal */
export function registerFractureGenerators(): void {
  for (const definition of FRACTURE_GENERATORS) registerGenerator(definition);
}
