/**
 * Scatter species grown by a generator instead of loaded from a GLB: a palette item maps to a
 * registered generator (a nature tree, a rock …) plus base params, and the field draws a few baked
 * variants of it spread across the placements, each placement keeping its variant for good.
 *
 * @capability scatter-generator grow a scatter palette item from a seeded generator's baked variants
 */
import { findSchemaPreset, type ParamSchema } from "../generator/paramSchema";
import { generatorVariantFor, variantIndexAt, type GeneratorDefinition, type GeneratorVariant } from "../generator/generator";
import type { ScatterInstance } from "./scatterRegion";

/** A scatter palette item grown by a registered generator. */
export interface ScatterGeneratorItem {
  /** Registered generator id, e.g. `"plant.grown"` or `"nature.rock"`. */
  generator: string;
  /** Schema preset applied first, e.g. `"cycad"`. */
  preset?: string;
  /** Base params over the preset (a kept variant's `meta` works as-is). */
  params?: Readonly<Record<string, unknown>>;
  /**
   * Distinct variants baked and spread over the placements. Default 6, clamped to 1..16. `"unique"`
   * grows every placement from its own seed: the nearest few ({@link ScatterGeneratorItem.heroes}) draw
   * their own mesh, and the rest draw as 4 shared stand-ins and their impostors until the camera
   * comes near.
   */
  variants?: number | "unique";
  /** With `variants: "unique"`, most placements drawn as their own mesh at once. Default 32. */
  heroes?: number;
  /** With `variants: "unique"`, ground distance (m) within which a placement draws as its own mesh. Default 40. */
  heroDistance?: number;
  /** With `variants: "unique"`, detail level the near placements grow at, 0..1. Default `detail`. */
  heroDetail?: number;
  /** 0..1 how far variants wander from the base params. Default 0.3. */
  explore?: number;
  /** Exact variants to bake first, as `meta` bags (the editor grid's kept tiles). */
  keep?: readonly Readonly<Record<string, unknown>>[];
  /** Detail level baked, 0..1. Default 1. */
  detail?: number;
}

/** True when a scatter mapping names a generator rather than a model. */
export function isScatterGeneratorItem(value: unknown): value is ScatterGeneratorItem {
  return typeof value === "object" && value !== null && "generator" in value && typeof value.generator === "string";
}

/**
 * How many variants a generator item bakes.
 * @capability scatter-generator grow a scatter palette item from a seeded generator's baked variants
 */
export function scatterGeneratorVariantCount(item: ScatterGeneratorItem): number {
  if (item.variants === "unique") return UNIQUE_STAND_INS;
  return Math.max(1, Math.min(16, Math.floor(item.variants ?? 6)));
}

/** Shared variants a unique item draws its far placements with. */
const UNIQUE_STAND_INS = 4;

/** True when every placement of the item grows from its own seed. @internal */
export function isUniqueScatterItem(item: ScatterGeneratorItem): boolean {
  return item.variants === "unique";
}

/**
 * The variant one placement of a unique item grows as: its own seed and params, from the palette
 * item and the placement id alone, so it regrows the same anywhere.
 * @capability scatter-generator grow a scatter palette item from a seeded generator's baked variants
 */
export function scatterPlacementVariant(definition: GeneratorDefinition, item: string, spec: ScatterGeneratorItem, placementId: string): GeneratorVariant {
  return generatorVariantFor(definition, scatterGeneratorBase(spec, definition.schema), placementId, { seed: item, explore: spec.explore ?? 0.3 });
}

/**
 * The base `meta` a generator item's variants grow around: preset values, then params.
 * @capability scatter-generator grow a scatter palette item from a seeded generator's baked variants
 */
export function scatterGeneratorBase(item: ScatterGeneratorItem, schema: ParamSchema): Record<string, unknown> {
  const preset = item.preset === undefined ? undefined : findSchemaPreset(schema, item.preset);
  return { ...preset?.values, ...item.params };
}

const VARIANT_MARK = "~v";

/** The draw item for one variant of a generator-grown palette item. @internal */
export function scatterVariantItem(item: string, variant: number): string {
  return `${item}${VARIANT_MARK}${variant}`;
}

/** Split a draw item back into its palette item and variant, or null when it carries none. @internal */
export function parseScatterVariantItem(drawItem: string): { item: string; variant: number } | null {
  const at = drawItem.lastIndexOf(VARIANT_MARK);
  if (at < 0) return null;
  const variant = Number(drawItem.slice(at + VARIANT_MARK.length));
  return Number.isInteger(variant) ? { item: drawItem.slice(0, at), variant } : null;
}

/**
 * Tags each placement of a generator-grown item with a stable variant (from its id), so the field
 * batches and draws per variant. Placements of other items come back as the same objects.
 * @internal
 */
export function assignScatterVariants(instances: readonly ScatterInstance[], variantsOf: (item: string) => number | undefined): ScatterInstance[] {
  return instances.map((instance) => {
    const count = variantsOf(instance.item);
    if (count === undefined) return instance;
    return { ...instance, item: scatterVariantItem(instance.item, variantIndexAt(count, instance.item, instance.id)) };
  });
}
