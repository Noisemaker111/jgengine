import type { ContentProgressionRule } from "@jgengine/core/game/contentValidation";
import type { SuiteContent, SuiteContentUse } from "@jgengine/core/suite/contentAudit";

import { CHARTS, RECIPES, STARTING_ZONES, UPGRADES, UPGRADE_IDS } from "../src/game/burrow";
import { ITEM_KINDS, ITEMS } from "../src/game/loot";
import { ROOM_TEMPLATES, ZONES } from "../src/world";

/**
 * Crumb Run's content, read from the game's own tables: the rooms each zone's templates hold (and what
 * their spots can roll), the trap springs and spider silk, the workbench's recipes, the burrow's
 * upgrades and the charts that open zones.
 */
const zoneFact = (zone: string) => `zone:${zone}`;
const levelFact = (id: string, level: number) => `${id}:${level}`;

const finds: ContentProgressionRule[] = ZONES.map((zone) => ({
  id: `find:${zone}`, path: `src/game/runGen.ts/${zone}`, requires: [zoneFact(zone)],
  // A spot rolls any kind with a pick weight; a kind with zones rolls a quarter as often elsewhere.
  provides: ITEM_KINDS.filter((kind) => (ITEMS[kind].weight ?? 1) > 0),
}));
const hunters: ContentProgressionRule[] = [
  ...ROOM_TEMPLATES.filter((t) => t.threats.some((s) => s.kind === "trap")).map((t) => ({ id: `disarm:${t.id}`, path: `src/editor.scene.json/${t.id}`, requires: [zoneFact(t.zone)], provides: ["spring"] })),
  ...ROOM_TEMPLATES.filter((t) => t.threats.some((s) => s.kind === "spider")).map((t) => ({ id: `spider:${t.id}`, path: `src/editor.scene.json/${t.id}`, requires: [zoneFact(t.zone), "needle"], provides: ["spider-silk"] })),
];
const crafts: ContentProgressionRule[] = RECIPES.map((r) => ({ id: `craft:${r.makes}`, path: `src/game/burrow.ts/${r.makes}`, requires: [...Object.keys(r.needs), levelFact("workbench", r.bench)], provides: [r.makes] }));
const builds: ContentProgressionRule[] = UPGRADE_IDS.flatMap((id) => UPGRADES[id].levels.map((level, i) => ({
  id: `build:${id}:${i + 1}`, path: `src/game/burrow.ts/${id}`, requires: [...Object.keys(level.cost.items), ...(i === 0 ? [] : [levelFact(id, i)])], provides: [levelFact(id, i + 1)],
})));
const charts: ContentProgressionRule[] = Object.entries(CHARTS).map(([zone, chart]) => ({ id: `chart:${zone}`, path: `src/game/burrow.ts/${zone}`, requires: [...Object.keys(chart.cost.items), levelFact("mapRoom", 1)], provides: [zoneFact(zone)] }));

const uses: SuiteContentUse[] = [
  // Every find trades at the swap-meet for bottle caps; caps themselves become the purse when banked.
  { id: "trade", path: "src/game/controls.ts/deepward.trade", items: ITEM_KINDS.filter((k) => k !== "bottle-cap") },
  { id: "purse", path: "src/game/state.ts/settleRun", items: ["bottle-cap"] },
  { id: "carry-gear", path: "src/game/state.ts/hasGear", items: ITEM_KINDS.filter((k) => ITEMS[k].gear !== undefined) },
  { id: "larder", path: "src/game/state.ts/larderMeal", items: ITEM_KINDS.filter((k) => ITEMS[k].category === "food") },
  ...RECIPES.map((r) => ({ id: `craft:${r.makes}`, path: `src/game/burrow.ts/${r.makes}`, items: Object.keys(r.needs) })),
  ...UPGRADE_IDS.flatMap((id) => UPGRADES[id].levels.map((level, i) => ({ id: `build:${id}:${i + 1}`, path: `src/game/burrow.ts/${id}`, items: Object.keys(level.cost.items) }))),
];

export const content: SuiteContent = {
  items: ITEM_KINDS.map((id) => (ITEMS[id].gear === "slingshot" ? { id, ammo: "none" as const } : { id })),
  start: [...STARTING_ZONES.map(zoneFact), levelFact("workbench", 1)],
  sources: [...finds, ...hunters, ...crafts, ...builds, ...charts],
  uses,
  places: [],
  // Nights survived: what the burrow can afford, in the order a steady player gets there.
  runway: {
    axis: "extractions", cap: 16,
    unlocks: [
      { id: levelFact("larder", 1), at: 1 }, { id: levelFact("mapRoom", 1), at: 2 }, { id: "little:wren", at: 2 },
      { id: zoneFact("kidroom"), at: 3 }, { id: levelFact("satchel", 1), at: 4 }, { id: levelFact("workbench", 2), at: 5 },
      { id: zoneFact("garage"), at: 6 }, { id: levelFact("trophies", 1), at: 7 }, { id: "little:dot", at: 7 }, { id: "little:tuck", at: 8 },
      { id: zoneFact("attic"), at: 9 }, { id: levelFact("satchel", 2), at: 11 }, { id: levelFact("larder", 2), at: 12 }, { id: "little:fennel", at: 14 },
    ],
  },
};
