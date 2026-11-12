// @skill jgengine-gameplay
/**
 * Composed item rolls on the generator contract. An {@link ItemRecipe} names the params a roll takes
 * (a param schema), the choice steps those params produce ({@link GenSchema} from `item/itemgen`),
 * the steps they pin, and how the resolved choices become the game's item. {@link rollItemRecipe}
 * rolls one from any random stream (a session's chest stream, a loot table's rng);
 * {@link defineItemGenerator} turns the same recipe into a seeded generator the editor and agents
 * list and roll variants of.
 */
import { defineGenerator, type GeneratorDefinition } from "../generator/generator";
import { registerGeneratorText } from "../generator/generatorText";
import type { ParamSchema, ParamsOf } from "../generator/paramSchema";
import { generate, type GenProvenance, type GenResult, type GenSchema } from "./itemgen";

/** The output family every item generator writes: one {@link RolledItem}. */
export const ROLLED_ITEM_OUTPUT = "rolled-item";

/** One rolled item, the provenance of its choices, and a few lines of text that name it. */
export interface RolledItem<Item> {
  item: Item;
  provenance: GenProvenance;
  /** Short text lines for the variant tile and agents, most telling first. */
  summary: readonly string[];
}

/** A game's composed item roll: its params, the choice steps they produce, and how the choices become an item. */
export interface ItemRecipe<Schema extends ParamSchema, Item> {
  id: string;
  label: string;
  schema: Schema;
  /** The choice steps a roll with these params resolves (weights and pools may read the params). */
  steps(params: ParamsOf<Schema>): GenSchema;
  /** Steps these params fix to one option id (a pinned rarity, a named legendary). */
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

/** Register the text tile for {@link ROLLED_ITEM_OUTPUT}: the item's summary lines. Called by `registerBuiltinSceneKinds`. @internal */
export function registerItemGeneratorText(): void {
  registerGeneratorText(ROLLED_ITEM_OUTPUT, (output) => {
    const summary = typeof output === "object" && output !== null ? (output as Partial<RolledItem<unknown>>).summary : undefined;
    return Array.isArray(summary) ? summary.filter((line): line is string => typeof line === "string") : [];
  });
}
