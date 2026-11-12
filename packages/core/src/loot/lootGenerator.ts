// @skill jgengine-gameplay
/**
 * Loot rolls on the generator contract: a game declares its {@link LootCatalog} once with
 * {@link defineLootGenerator}, and the generator rolls a seeded set of items from params (how many,
 * at what level, optionally pinned to a rarity, maker or base). Same params and seed, same items, so
 * an agent can roll twenty loot sets with `generator_variants` and a game rebuilds a shelf or a drop
 * from its seed alone.
 */
import { defineGenerator, type GeneratorDefinition } from "../generator/generator";
import { registerGeneratorText } from "../generator/generatorText";
import { defineParamSchema, type ParamsOf } from "../generator/paramSchema";
import { assertLootCatalog, rollLoot, type LootCatalog, type LootItem, type LootRollOptions } from "./lootGen";

/** The output family every loot generator writes: the rolled items, in roll order. */
export const LOOT_ITEMS_OUTPUT = "loot-items";

/** Most items one roll returns. */
export const MAX_LOOT_ROLL = 256;

/** Starting values a game gives its loot generator's params. */
export interface LootGeneratorDefaults {
  /** Items per roll (default 5). */
  count?: number;
  /** Item level (default 1). */
  level?: number;
}

/** What a game declares: an id and label for the registry, its catalog and its defaults. */
export interface LootGeneratorSpec {
  id: string;
  label: string;
  catalog: LootCatalog;
  defaults?: LootGeneratorDefaults;
}

const ANY = { value: "", label: "any" } as const;

function lootSchema(catalog: LootCatalog, defaults: LootGeneratorDefaults) {
  const curve = catalog.levelScale ?? [];
  const topLevel = Math.max(2, curve[curve.length - 1]?.[0] ?? 20);
  return defineParamSchema({
    fields: [
      { type: "number", key: "count", label: "items", min: 1, max: MAX_LOOT_ROLL, step: 1, default: Math.max(1, Math.min(MAX_LOOT_ROLL, Math.round(defaults.count ?? 5))), vary: false },
      { type: "number", key: "level", label: "item level", min: 1, step: 1, default: Math.max(1, Math.round(defaults.level ?? 1)), explore: [1, topLevel] },
      { type: "select", key: "rarity", label: "rarity", options: [ANY, ...catalog.rarities.map((tier) => ({ value: tier.id }))], default: "" },
      { type: "select", key: "manufacturer", label: "maker", options: [ANY, ...catalog.manufacturers.map((maker) => ({ value: maker.id, label: maker.name }))], default: "", vary: false },
      { type: "select", key: "base", label: "base", options: [ANY, ...catalog.bases.map((base) => ({ value: base.id, label: base.name }))], default: "", vary: false },
      { type: "seed", key: "seed", label: "seed", default: "" },
    ],
  });
}

/** The params every loot generator takes; an empty `rarity`, `manufacturer` or `base` is drawn from the catalog. */
export type LootGeneratorParams = ParamsOf<ReturnType<typeof lootSchema>>;

/** A declared loot generator: its output is the rolled items, and it keeps the catalog it rolls from. */
export interface LootGeneratorDefinition extends GeneratorDefinition<ReturnType<typeof lootSchema>, LootItem[]> {
  readonly catalog: LootCatalog;
}

/**
 * Declare a seeded loot generator over a game's catalog, checked once here. Its `generate` rolls
 * every item from the context's default stream in order through {@link rollLoot}, so the first N
 * items of a longer roll are the same N items. Register it with `registerGenerator` to list it in
 * the editor and to agents.
 *
 * @capability loot-generation roll a named item from bases, parts, affixes, rarity weights, manufacturer personalities and level scaling
 */
export function defineLootGenerator(spec: LootGeneratorSpec): LootGeneratorDefinition {
  const { catalog } = spec;
  assertLootCatalog(catalog);
  const definition = defineGenerator({
    id: spec.id,
    label: spec.label,
    output: LOOT_ITEMS_OUTPUT,
    schema: lootSchema(catalog, spec.defaults ?? {}),
    generate(params, context): LootItem[] {
      const rng = context.random();
      const options: LootRollOptions = {
        level: params.level,
        ...(params.rarity === "" ? {} : { rarity: params.rarity }),
        ...(params.manufacturer === "" ? {} : { manufacturer: params.manufacturer }),
        ...(params.base === "" ? {} : { baseId: params.base }),
      };
      return Array.from({ length: params.count }, () => rollLoot(catalog, rng, options));
    },
  });
  return { ...definition, catalog };
}

function lootLine(item: unknown): string | null {
  if (typeof item !== "object" || item === null) return null;
  const { name, rarity, level } = item as Partial<LootItem>;
  return typeof name === "string" ? `${name} · ${String(rarity)} · L${String(level)}` : null;
}

/** Register the text tile for {@link LOOT_ITEMS_OUTPUT}: one line per item. Called by `registerBuiltinSceneKinds`. @internal */
export function registerLootGeneratorText(): void {
  registerGeneratorText(LOOT_ITEMS_OUTPUT, (output) => (Array.isArray(output) ? output.map(lootLine).filter((line): line is string => line !== null) : []));
}
