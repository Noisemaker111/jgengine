import type { ContentProgressionRule } from "@jgengine/core/game/contentValidation";
import { recipeContent, type SuiteContent, type SuiteContentUse } from "@jgengine/core/suite/contentAudit";

import { islandCaves } from "../src/game/caves";
import { BROOD_TIERS, TROPHY_DROPS } from "../src/game/data/bosses";
import { CRAFTING_RECIPES, ENGRAMS } from "../src/game/data/engrams";
import { HARVESTABLES } from "../src/game/data/harvestables";
import { FIST, ITEMS, PICK_UP, SPOILS, type ToolDef } from "../src/game/data/items";
import { SPECIES } from "../src/game/data/species";
import { START } from "../src/game/data/start";
import { STRUCTURES } from "../src/game/data/structures";
import { SUPPLY_TIERS } from "../src/game/data/supplyDrops";
import { MAX_LEVEL } from "../src/game/data/survivor";
import { NARCOTICS } from "../src/game/data/taming";

/** What a tool gets from a node: every resource it has a bias for. */
function yields(tool: ToolDef, kinds: readonly string[]): string[] {
  return kinds.filter((kind) => (tool.gather.biases?.[kind] ?? tool.gather.defaultBias ?? 0) > 0);
}

const tools = ITEMS.filter((item) => item.tool !== undefined);
const recipes = recipeContent(CRAFTING_RECIPES, "src/game/data/engrams.ts");

const harvest: ContentProgressionRule[] = Object.entries(HARVESTABLES).flatMap(([id, node]) => {
  const kinds = node.resources.map((resource) => resource.kind);
  const path = `src/game/data/harvestables.ts/${id}`;
  if (node.by === "pick") return [{ id: `pick:${id}`, path, requires: [], provides: yields(PICK_UP, kinds) }];
  return [
    { id: `strike:${id}:fist`, path, requires: [], provides: yields(FIST, kinds) },
    ...tools.flatMap((item) => (item.tool === undefined ? [] : [{ id: `strike:${id}:${item.id}`, path, requires: [item.id], provides: yields(item.tool, kinds) }])),
  ];
});

const carcasses: ContentProgressionRule[] = Object.values(SPECIES).map((species) => {
  const trophy = TROPHY_DROPS[species.id];
  return { id: `carcass:${species.id}`, path: `src/game/data/species.ts/${species.id}`, requires: [], provides: ["raw_meat", "hide", ...(trophy === undefined ? [] : [trophy])] };
});

const spoiling: ContentProgressionRule[] = Object.entries(SPOILS).flatMap(([from, rule]) =>
  rule.into === null ? [] : [{ id: `spoil:${from}`, path: "src/game/data/items.ts/SPOILS", requires: [from], provides: [rule.into] }]);

const crates: ContentProgressionRule[] = SUPPLY_TIERS.map((tier) => ({ id: `crate:${tier.id}`, path: `src/game/data/supplyDrops.ts/${tier.id}`, requires: [], provides: tier.loot.flatMap((entry) => (entry.item === undefined ? [] : [entry.item])) }));

const caves: ContentProgressionRule[] = islandCaves(() => 0).filter((cave) => cave.artifact !== "").map((cave) => ({ id: `cave:${cave.id}`, path: `src/editor.scene.json/${cave.id}`, requires: [], provides: [cave.artifact] }));

const bosses: ContentProgressionRule[] = BROOD_TIERS.map((tier) => ({ id: `boss:${tier.id}`, path: `src/game/data/bosses.ts/${tier.id}`, requires: Object.keys(tier.cost), provides: Object.keys(tier.rewards) }));

const uses: SuiteContentUse[] = [
  ...recipes.uses,
  { id: "eat", path: "src/game/data/items.ts", items: ITEMS.filter((item) => item.consume !== undefined).map((item) => item.id) },
  { id: "equip", path: "src/game/data/items.ts", items: ITEMS.filter((item) => item.tool !== undefined || item.wear !== undefined || item.kind === "saddle").map((item) => item.id) },
  { id: "tame-food", path: "src/game/data/species.ts", items: [...new Set(Object.values(SPECIES).flatMap((species) => Object.keys(species.taming.foods)))] },
  { id: "keep-under", path: "src/game/data/taming.ts", items: Object.keys(NARCOTICS) },
  ...BROOD_TIERS.map((tier) => ({ id: `summon:${tier.id}`, path: `src/game/data/bosses.ts/${tier.id}`, items: Object.keys(tier.cost) })),
];

/** Fernwild's content for the game suite's data entries, read from the catalogs the game runs on. */
export const content: SuiteContent = {
  items: ITEMS.map((item) => ({
    id: item.id,
    ...(item.kind === "structure" ? { placeable: true } : {}),
    // A tool that hits from range fires something; Fernwild's data names no ammo for it.
    ...(item.tool?.damageClass === "ranged" ? { ammo: [] } : {}),
  })),
  start: [...(START.unlocked ?? [])],
  sources: [...recipes.sources, ...harvest, ...carcasses, ...spoiling, ...crates, ...caves, ...bosses],
  uses,
  places: STRUCTURES.map((structure) => structure.id),
  runway: { axis: "level", cap: MAX_LEVEL, unlocks: ENGRAMS.map((engram) => ({ id: engram.id, at: engram.level })) },
};
