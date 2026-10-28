// @skill jgengine-world
/**
 * The one generator contract every procedural system follows: a typed {@link ParamSchema}, an
 * injected seed, a pure deterministic `generate(params, context)`, and baking to N seeded variants
 * (each at one or more detail levels) for instancing and LOD. Register a generator and the editor
 * builds its param panel and variant grid from the schema alone; a draw-side preview keyed by the
 * generator's `output` renders it. Same params and seed always give the same output.
 *
 * @capability generator-contract seeded, schema-driven procedural generator with variants and editor exposure
 */
import { seededRng, type SeededRng } from "../random/rng";
import { jitterParams, parseParams, type ParamSchema, type ParamsOf } from "./paramSchema";

/** What a generate step receives besides its params: the seed and seeded streams derived from it. */
export interface GeneratorContext {
  /** The resolved seed string. */
  readonly seed: string;
  /** A seeded stream for one named purpose; the same seed and name always replay the same sequence. */
  random(stream?: string): SeededRng;
  /** Detail level the output is baked at, 1 full to near 0 coarsest. */
  readonly detail: number;
}

/**
 * A procedural generator. `generate` must be pure: no `Math.random`, clock or global state, so a
 * placed instance can store only its params and seed and regrow the same output anywhere.
 * @typeParam Schema the param schema, declared with `defineParamSchema` for exact param types.
 * @typeParam Output what one generate call returns (parts, a field, a heightfield, placements …).
 */
export interface GeneratorDefinition<Schema extends ParamSchema = ParamSchema, Output = unknown> {
  readonly id: string;
  readonly label: string;
  readonly schema: Schema;
  /**
   * The output family, e.g. `"parts"` or `"grass-field"`. Draw code registers one preview per family
   * (`registerGeneratorPreview`), so every generator of a family previews with no code of its own.
   */
  readonly output: string;
  /** Detail levels {@link bakeGeneratorVariants} bakes per variant, highest first. Default `[1]`. */
  readonly lods?: readonly number[];
  generate(params: ParamsOf<Schema>, context: GeneratorContext): Output;
}

/** The output type of a generator. */
export type GeneratorOutput<Definition> = Definition extends GeneratorDefinition<ParamSchema, infer Output> ? Output : never;

/** Declare a generator with its schema and output types inferred. */
export function defineGenerator<Schema extends ParamSchema, Output>(definition: GeneratorDefinition<Schema, Output>): GeneratorDefinition<Schema, Output> {
  return definition;
}

/** The context a generate call receives for `seed` at `detail`. @internal */
export function generatorContext(seed: string, detail = 1): GeneratorContext {
  return {
    seed,
    detail: Math.max(0, Math.min(1, detail)),
    random: (stream) => seededRng(stream === undefined || stream.length === 0 ? seed : `${seed}/${stream}`),
  };
}

/**
 * The seed an object's `meta` resolves to: the schema's `seed` field when it is set, else a
 * `meta.seed` string, else `fallback` (an editor object passes its id, so two objects differ).
 */
export function generatorSeed(schema: ParamSchema, meta: Readonly<Record<string, unknown>> | undefined, fallback: string): string {
  const seedField = schema.fields.find((field) => field.type === "seed");
  const raw = meta?.[seedField?.key ?? "seed"];
  return typeof raw === "string" && raw.length > 0 ? raw : fallback;
}

/** Options for {@link runGenerator}. */
export interface RunGeneratorOptions {
  /** Seed used when `meta` carries none. Default the generator id. */
  fallbackSeed?: string;
  /** Detail level, 0..1. Default 1. */
  detail?: number;
}

/** Parse `meta` against the generator's schema, resolve its seed and generate. */
export function runGenerator<Schema extends ParamSchema, Output>(
  definition: GeneratorDefinition<Schema, Output>,
  meta: Readonly<Record<string, unknown>> | undefined,
  options: RunGeneratorOptions = {},
): Output {
  const seed = generatorSeed(definition.schema, meta, options.fallbackSeed ?? definition.id);
  return definition.generate(parseParams(definition.schema, meta), generatorContext(seed, options.detail ?? 1));
}

/** One seeded variant: the `meta` it would write, and its parsed params and seed. */
export interface GeneratorVariant<Schema extends ParamSchema = ParamSchema> {
  index: number;
  seed: string;
  /** The full `meta` bag this variant writes onto an object (seed included). */
  meta: Record<string, unknown>;
  params: ParamsOf<Schema>;
}

/** Options for {@link generatorVariants}. */
export interface GeneratorVariantOptions {
  /** How many variants. Default 20. */
  count?: number;
  /** Seed of the variant set; the same seed lays out the same grid. Default `"variants"`. */
  seed?: string;
  /**
   * 0..1 how far each variant's params wander from the base values (see `jitterParams`). 0 varies
   * only the seed. Default 0.25.
   */
  explore?: number;
  /** Variants pinned at the front of the grid unchanged, as `meta` bags (the "keep" action). */
  keep?: readonly Readonly<Record<string, unknown>>[];
}

function seedKey(schema: ParamSchema): string {
  return schema.fields.find((field) => field.type === "seed")?.key ?? "seed";
}

/**
 * A grid of seeded variants around `base`: kept variants first, then the base itself, then
 * fresh ones, each with its own seed and params nudged by `explore`. Pure — the same base and
 * options always give the same grid, which is what the editor's variant panel and the
 * `generator_variants` verb show.
 */
export function generatorVariants<Schema extends ParamSchema>(
  definition: GeneratorDefinition<Schema, unknown>,
  base: Readonly<Record<string, unknown>> | undefined,
  options: GeneratorVariantOptions = {},
): GeneratorVariant<Schema>[] {
  const count = Math.max(1, Math.floor(options.count ?? 20));
  const setSeed = options.seed ?? "variants";
  const explore = options.explore ?? 0.25;
  const key = seedKey(definition.schema);
  const baseSeed = generatorSeed(definition.schema, base, definition.id);
  const bags: Record<string, unknown>[] = [];
  for (const kept of options.keep ?? []) if (bags.length < count) bags.push({ ...kept });
  if (bags.length < count) bags.push({ ...base, [key]: baseSeed });
  for (let i = 0; bags.length < count; i += 1) {
    const random = seededRng(`${setSeed}/${baseSeed}/${i}`);
    bags.push({ ...base, ...jitterParams(definition.schema, base, random, explore), [key]: `${baseSeed}-${setSeed}-${i}` });
  }
  return bags.map((meta, index) => ({
    index,
    seed: generatorSeed(definition.schema, meta, baseSeed),
    meta,
    params: parseParams(definition.schema, meta),
  }));
}

/** One baked variant: the variant and its output at each detail level, highest detail first. */
export interface BakedGeneratorVariant<Schema extends ParamSchema, Output> {
  variant: GeneratorVariant<Schema>;
  lods: { detail: number; output: Output }[];
}

/**
 * Bake N variants of a generator at each of its `lods` — the set an instanced renderer draws from
 * (pick one per instance with {@link variantIndexAt}) and the editor's variant grid previews.
 * @capability generator-contract seeded, schema-driven procedural generator with variants and editor exposure
 */
export function bakeGeneratorVariants<Schema extends ParamSchema, Output>(
  definition: GeneratorDefinition<Schema, Output>,
  base: Readonly<Record<string, unknown>> | undefined,
  options: GeneratorVariantOptions = {},
): BakedGeneratorVariant<Schema, Output>[] {
  const lods = definition.lods !== undefined && definition.lods.length > 0 ? definition.lods : [1];
  return generatorVariants(definition, base, options).map((variant) => ({
    variant,
    lods: lods.map((detail) => ({ detail, output: definition.generate(variant.params, generatorContext(variant.seed, detail)) })),
  }));
}

/**
 * A stable variant index in `[0, count)` for one placed instance key (an id, a grid cell).
 * @capability generator-contract seeded, schema-driven procedural generator with variants and editor exposure
 */
export function variantIndexAt(count: number, seed: string, key: string | number): number {
  if (count <= 1) return 0;
  return Math.floor(seededRng(`${seed}#${key}`)() * count) % count;
}

const generators = new Map<string, GeneratorDefinition>();

/** Register a generator so the editor, the asset catalog and agents can find it. Last registration per id wins. */
export function registerGenerator<Schema extends ParamSchema, Output>(definition: GeneratorDefinition<Schema, Output>): void {
  generators.set(definition.id, untypedGenerator(definition));
}

/**
 * The untyped view of a typed generator, for code that holds raw meta bags (the editor, the variant
 * grid): its `generate` parses params against the schema first. Registered generators are already
 * this shape.
 * @capability generator-contract seeded, schema-driven procedural generator with variants and editor exposure
 */
export function untypedGenerator<Schema extends ParamSchema, Output>(definition: GeneratorDefinition<Schema, Output>): GeneratorDefinition {
  return {
    id: definition.id,
    label: definition.label,
    schema: definition.schema,
    output: definition.output,
    ...(definition.lods === undefined ? {} : { lods: definition.lods }),
    // Registry callers hold untyped params, so they are parsed against the schema on the way in.
    generate: (params, context) => definition.generate(parseParams(definition.schema, params), context),
  };
}

/** The registered generator for an id, or undefined. */
export function getGenerator(id: string): GeneratorDefinition | undefined {
  return generators.get(id);
}

/** Every registered generator, in registration order, optionally of one output family. */
export function listGenerators(output?: string): GeneratorDefinition[] {
  const all = [...generators.values()];
  return output === undefined ? all : all.filter((definition) => definition.output === output);
}
