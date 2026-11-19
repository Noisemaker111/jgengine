// @skill jgengine-gameplay
import { defineGenerator, type GeneratorDefinition } from "../generator/generator";
import { registerGeneratorText } from "../generator/generatorText";
import type { ParamSchema, ParamsOf } from "../generator/paramSchema";
import { generate, type GenProvenance, type GenResult, type GenSchema } from "./itemgen";

export const ROLLED_ITEM_OUTPUT = "rolled-item";

export interface RolledItem<Item> {
  item: Item;
  provenance: GenProvenance;
  summary: readonly string[];
}

export interface ItemRecipe<Schema extends ParamSchema, Item> {
  id: string;
  label: string;
  schema: Schema;
  steps(params: ParamsOf<Schema>): GenSchema;
  pin?(params: ParamsOf<Schema>): Readonly<Record<string, string>>;
  /** The item the resolved choices make; further randomness comes from `rng`, after the choices. */
  build(result: GenResult, params: ParamsOf<Schema>, rng: () => number): Item;
  /** Short text lines naming one item. Default: one `step: option` line per resolved choice. */
  describe?(item: Item, result: GenResult): readonly string[];
}

function choiceLines(result: GenResult): string[] {
  return Object.entries(result.choices).map(([step, option]) => `${step}: ${option}`);
}

/**
 * Roll one item from a recipe with an injected random source: resolve its choice steps (honouring
 * pins), then build the item from the same stream. Throws when the steps cannot be satisfied, naming
 * the recipe and the reason.
 *
 * @capability item-generation compose constraints, weighted pools, transforms, and provenance into a deterministic generated item
 */
export function rollItemRecipe<Schema extends ParamSchema, Item>(recipe: ItemRecipe<Schema, Item>, params: ParamsOf<Schema>, rng: () => number): RolledItem<Item> {
  const outcome = generate(recipe.steps(params), rng, recipe.pin === undefined ? {} : { pin: recipe.pin(params) });
  if (!outcome.ok) throw new Error(`Item recipe "${recipe.id}" roll failed: ${outcome.reason} after ${outcome.attempts} attempts`);
  const item = recipe.build(outcome.result, params, rng);
  const summary = recipe.describe?.(item, outcome.result) ?? choiceLines(outcome.result);
  return { item, provenance: outcome.result.provenance, summary };
}

/**
 * The seeded generator for a recipe: `generate` is {@link rollItemRecipe} on the context's default
 * stream, so a seed regrows the same item. Register it with `registerGenerator` to list it in the
 * editor and to agents.
 *
 * @capability item-generation compose constraints, weighted pools, transforms, and provenance into a deterministic generated item
 */
export function defineItemGenerator<Schema extends ParamSchema, Item>(recipe: ItemRecipe<Schema, Item>): GeneratorDefinition<Schema, RolledItem<Item>> {
  return defineGenerator({
    id: recipe.id,
    label: recipe.label,
    output: ROLLED_ITEM_OUTPUT,
    schema: recipe.schema,
    generate: (params, context) => rollItemRecipe(recipe, params, context.random()),
  });
}

/** @internal */
export function registerItemGeneratorText(): void {
  registerGeneratorText(ROLLED_ITEM_OUTPUT, (output) => {
    const summary = typeof output === "object" && output !== null ? (output as Partial<RolledItem<unknown>>).summary : undefined;
    return Array.isArray(summary) ? summary.filter((line): line is string => typeof line === "string") : [];
  });
}
