import type { HarvestableDef } from "@jgengine/core/harvest/scatterHarvest";

/** How a scatter species is gathered: struck (left click, tool bias applies) or picked by hand (E). */
export type GatherBy = "strike" | "pick";

export interface Harvestable extends HarvestableDef {
  by: GatherBy;
  label: string;
}

const REGROW = 600;

const tree = (label: string, budget: number, radius: number): Harvestable => ({
  by: "strike",
  label,
  budget,
  radius,
  respawn: REGROW,
  resources: [
    { kind: "wood", amount: [1, 2] },
    { kind: "thatch", amount: [2, 3] },
  ],
});

const rock = (label: string, budget: number, radius: number): Harvestable => ({
  by: "strike",
  label,
  budget,
  radius,
  respawn: REGROW,
  resources: [
    { kind: "stone", amount: [1, 2] },
    { kind: "flint", amount: [1, 2] },
  ],
});

/** A resource rock: struck for its ore plus stone. A pick gets more ore, a hatchet more stone. */
const ore = (label: string, kind: string, budget: number, radius: number): Harvestable => ({
  by: "strike",
  label,
  budget,
  radius,
  respawn: REGROW * 2,
  resources: [
    { kind, amount: [1, 2] },
    { kind: "stone", amount: [0, 1] },
  ],
});

/** Plants picked by hand for fiber. */
const weed = (label: string): Harvestable => ({ by: "pick", label, budget: 2, radius: 0.6, respawn: REGROW / 2, resources: [{ kind: "fiber", amount: [1, 3] }] });

const bush = (label: string, berries: Record<string, number>): Harvestable => ({
  by: "pick",
  label,
  budget: 4,
  radius: 0.8,
  respawn: REGROW / 2,
  resources: [{ kind: "fiber", amount: [2, 4] }, ...Object.entries(berries).map(([kind, most]) => ({ kind, amount: [0, most] as const }))],
});

/** Scatter palette item → what it yields. Items not listed (grass) are scenery. */
export const HARVESTABLES: Readonly<Record<string, Harvestable>> = {
  palm: tree("Tree", 30, 0.5),
  fanpalm: tree("Tree", 20, 0.4),
  treefern: tree("Tree", 15, 0.3),
  jungletree: tree("Tree", 60, 0.7),
  youngtree: tree("Tree", 25, 0.35),
  tree: tree("Tree", 40, 0.6),
  tree2: tree("Tree", 40, 0.6),
  tree3: tree("Tree", 50, 0.7),
  pine: tree("Pine", 40, 0.6),
  pine2: tree("Pine", 35, 0.5),
  redwood: tree("Redwood", 120, 1.4),
  deadtree: tree("Dead Tree", 20, 0.5),
  boulder: rock("Boulder", 30, 1.4),
  boulder2: rock("Boulder", 30, 1.3),
  seaboulder: rock("Boulder", 45, 2.6),
  searock: rock("Rock", 24, 1.2),
  rock: rock("Rock", 18, 0.9),
  metal_rock: ore("Metal Rock", "metal", 40, 1.3),
  obsidian_rock: ore("Obsidian", "obsidian", 30, 1.1),
  crystal: { ...ore("Crystal", "crystal", 12, 0.7), resources: [{ kind: "crystal", amount: [1, 3] }] },
  oil_rock: ore("Oil Rock", "oil", 25, 1),
  flowers: weed("Flowers"),
  tallgrass: weed("Tall Grass"),
  plant: weed("Plant"),
  mushroom: weed("Mushrooms"),
  bush: bush("Bush", { mejoberry: 2, amarberry: 2, azulberry: 2, tintoberry: 2, narcoberry: 1, stimberry: 1 }),
  berrybush: bush("Berry Bush", { mejoberry: 4, amarberry: 3, azulberry: 3, tintoberry: 3, narcoberry: 2, stimberry: 2 }),
  fern: bush("Fern", { tintoberry: 1 }),
  bracken: bush("Fern", { tintoberry: 1 }),
  cycad: bush("Bush", { amarberry: 1 }),
  shrub: bush("Bush", { mejoberry: 2, amarberry: 2, azulberry: 2, tintoberry: 2 }),
  pebble2: { by: "pick", label: "Stones", budget: 1, radius: 0.5, respawn: REGROW, resources: [{ kind: "stone", amount: 1 }, { kind: "flint", amount: [0, 1] }] },
  pebble: { by: "pick", label: "Stones", budget: 1, radius: 0.5, respawn: REGROW, resources: [{ kind: "stone", amount: 1 }, { kind: "flint", amount: [0, 1] }] },
};

/** Whether a species is gathered by `by`. */
export const gatheredBy = (by: GatherBy) => (item: string): boolean => HARVESTABLES[item]?.by === by;
