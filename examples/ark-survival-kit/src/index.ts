/**
 * ARK-style survival kit — a worked example that composes the JGengine survival-game
 * primitives into one open-world creature-taming loop: spawn a wild creature, tame it into a
 * loyal companion, breed and imprint a lineage, harvest tool-gated resources under a carry-weight
 * limit, spend unlock points, run a tribe, keep an ambient population alive, and snap modular
 * base pieces together.
 *
 * This is the "first adopter" for the primitives shipped alongside it — everything here is engine
 * API, not game content. A real game authors its world in `editor.scene.json` and drives these
 * seams from its own runtime; this file just demonstrates that they fit together.
 */
import { createPopulationDirector } from "@jgengine/core/ai/populationDirector";
import { createUnlockPoints } from "@jgengine/core/economy/unlockPoints";
import {
  applyImprintBonus,
  breedOffspring,
  imprintIncrementPerRequest,
  incubationViable,
  maturationStage,
  tickIncubation,
} from "@jgengine/core/game/breeding";
import type { Genome, IncubationState, MaturationStage, StatBlock } from "@jgengine/core/game/breeding";
import { createTribe, createTribeRegistry } from "@jgengine/core/game/tribe";
import type { TribeConfig } from "@jgengine/core/game/tribe";
import { resolveEncumbrance, totalLoad } from "@jgengine/core/inventory/encumbrance";
import type { LoadEntry, MassResolver } from "@jgengine/core/inventory/encumbrance";
import { seededRng } from "@jgengine/core/random/rng";
import { createCompanionRoster, resolveCompanionIntent } from "@jgengine/core/scene/companion";
import type { CompanionIntent } from "@jgengine/core/scene/companion";
import {
  applyCaptureEffectiveness,
  resolveSpawnStats,
  rollSpawnInstance,
  spendDomesticLevel,
} from "@jgengine/core/stats/spawnLevelStats";
import type { CreatureStatInstance, SpawnSpeciesDef } from "@jgengine/core/stats/spawnLevelStats";
import {
  createBuildSocketCatalog,
  footprintCells,
  pieceSocketsFromModel,
} from "@jgengine/core/world/buildSockets";
import type { ModelSocketLike } from "@jgengine/core/world/buildSockets";
import { createResourceNodeField } from "@jgengine/core/world/resourceNode";
import type { ToolProfile } from "@jgengine/core/world/resourceNode";

/** The stats a creature in this kit carries — a game supplies its own set. */
type ArkStat = "health" | "stamina" | "weight" | "melee";

/** One species' base stats and per-point growth (fraction of base added per distributed point). */
const RAPTOR: SpawnSpeciesDef<ArkStat> = {
  health: { base: 200, growth: 0.1 },
  stamina: { base: 150, growth: 0.1 },
  weight: { base: 140, growth: 0.02 },
  melee: { base: 100, growth: 0.05 },
};

/**
 * Spawn a wild creature at a level, tame it at the given effectiveness (which buys bonus levels),
 * then spend one earned post-tame level into melee. Returns the tamed instance and its resolved
 * stat values.
 */
export function spawnAndTame(spawnLevel: number, effectiveness: number) {
  const rng = seededRng("raptor-spawn");
  const wild = rollSpawnInstance<ArkStat>("raptor", RAPTOR, spawnLevel, rng);
  const capture = applyCaptureEffectiveness(RAPTOR, wild, effectiveness, rng);
  const levelled = spendDomesticLevel<ArkStat>(capture.instance, "melee", { maxDomesticLevels: 88 });
  const tamed: CreatureStatInstance<ArkStat> = levelled.instance;
  return {
    wildLevel: wild.level,
    bonusLevels: capture.bonusLevels,
    tamedLevel: tamed.level,
    stats: resolveSpawnStats(RAPTOR, tamed),
  };
}

/**
 * Turn an owned creature into a companion, order it to fight aggressively, and resolve its intent
 * for one tick given the owner's position, target, and nearby threats.
 */
export function fieldCompanion(): CompanionIntent {
  const roster = createCompanionRoster({
    stats: { health: { max: 200 }, melee: { max: 100 } },
    upgrades: { melee: { increment: 5, maxCap: 400 } },
    pointsPerLevel: (level) => (level % 2 === 0 ? 2 : 1),
    leash: 14,
  });
  const companion = roster.adopt("player-1", { sourceId: "roster-raptor-7", command: "follow" });
  roster.command(companion.id, "aggressive");
  roster.levelUp(companion.id, 3);
  roster.spend(companion.id, "melee");
  const record = roster.get(companion.id)!;
  return resolveCompanionIntent(record, {
    ownerPosition: [10, 0, 4],
    ownerTargetId: "wild-rex-42",
    threats: ["wild-carno-9"],
  });
}

/**
 * Breed two parents, imprint the offspring to full over a care schedule, and walk an egg through
 * incubation and maturation stages.
 */
export function breedLineage() {
  const rng = seededRng("breed-1");
  const sire: Genome = { stats: { health: 40, melee: 30 }, mutationCount: 3, colorMutationCount: 1 };
  const dam: Genome = { stats: { health: 25, melee: 45 }, mutationCount: 5, colorMutationCount: 2 };
  const offspring = breedOffspring(sire, dam, rng);

  const requests = 8;
  const perRequest = imprintIncrementPerRequest(requests);
  let imprint = 0;
  for (let i = 0; i < requests; i++) imprint = Math.min(1, imprint + perRequest);
  const imprintedStats: StatBlock = applyImprintBonus(offspring.genome.stats, imprint, {}, { asOwner: true });

  let egg: IncubationState = { health: 100, elapsed: 0 };
  egg = tickIncubation(egg, 30, 5, { minTemp: 20, maxTemp: 40 });
  egg = tickIncubation(egg, 55, 5, { minTemp: 20, maxTemp: 40 }); // too hot — loses health, no progress
  const stages: MaturationStage[] = [
    { id: "baby", at: 0 },
    { id: "juvenile", at: 0.1 },
    { id: "adolescent", at: 0.5 },
    { id: "adult", at: 1 },
  ];
  return {
    mutations: offspring.mutations.length,
    lineageMutationCount: offspring.genome.mutationCount,
    imprint,
    imprintedStats,
    eggViable: incubationViable(egg),
    stage: maturationStage(egg.elapsed, 100, stages),
  };
}

/**
 * Harvest a mixed metal/stone node with two tools — a pick (favors metal) and a hatchet (favors
 * stone) — then weigh the haul against a carry capacity to derive the encumbrance state.
 */
export function harvestAndWeigh() {
  const field = createResourceNodeField({
    nodes: [
      {
        id: "metal-vein",
        budget: 60,
        resources: [
          { kind: "metal", amount: 2 },
          { kind: "stone", amount: [1, 3] },
        ],
        respawn: 300,
      },
    ],
    rng: seededRng("harvest-1"),
  });

  const pick: ToolProfile = { power: 4, biases: { metal: 2, stone: 0.25 }, defaultBias: 1 };
  const hatchet: ToolProfile = { power: 4, biases: { stone: 2, metal: 0.25 }, defaultBias: 1 };

  const haul = new Map<string, number>();
  const record = (kind: string, amount: number) => haul.set(kind, (haul.get(kind) ?? 0) + amount);
  for (const grant of field.harvest("metal-vein", pick, { multiplier: 1.5 }).granted) record(grant.kind, grant.amount);
  for (const grant of field.harvest("metal-vein", hatchet).granted) record(grant.kind, grant.amount);
  field.tick(300); // respawn timer only matters once depleted; shown for completeness

  const mass: Record<string, number> = { metal: 2, stone: 1 };
  const massOf: MassResolver = (itemId) => mass[itemId] ?? 0;
  const entries: LoadEntry[] = [...haul].map(([itemId, quantity]) => ({ itemId, quantity: Math.round(quantity) }));
  const load = totalLoad(entries, massOf);
  const encumbrance = resolveEncumbrance(load, 30);
  return { haul: Object.fromEntries(haul), load, encumbrance };
}

/** Earn unlock points across ten levels and buy a gated engram. */
export function unlockEngram() {
  const points = createUnlockPoints({ start: 0 });
  points.grantOnLevelUp(0, 10);
  const smithy = points.spend("smithy", 8, { requires: () => points.available() >= 8 });
  const refunded = points.refund("smithy");
  return {
    earned: points.earned(),
    smithyUnlocked: smithy.ok,
    availableAfterRefund: points.available(),
    refunded,
  };
}

/** Stand up two tribes, share a base, gate access by rank, and ally them in a registry. */
export function runTribes() {
  const config: TribeConfig = {
    id: "raptors",
    founderId: "alpha",
    ranks: [
      { id: "founder", name: "Founder", level: 100, bypass: true },
      { id: "builder", name: "Builder", level: 10, permissions: ["build", "use"] },
      { id: "grunt", name: "Grunt", level: 1, permissions: ["use"] },
    ],
  };
  const tribe = createTribe(config);
  tribe.addMember("alpha", "beta", "builder");
  tribe.addMember("alpha", "gamma", "grunt");
  tribe.registerAsset("alpha", { kind: "structure", id: "vault-1" }, { scope: "group" });

  const registry = createTribeRegistry();
  const a = registry.create(config);
  const b = registry.create({ ...config, id: "wolves", founderId: "omega" });
  registry.formAlliance(a.id, b.id);

  return {
    builderCanBuild: tribe.can("beta", "build"),
    gruntCanBuild: tribe.can("gamma", "build"),
    gruntCanUseVault: tribe.canAccess("gamma", { kind: "structure", id: "vault-1" }, "use"),
    allied: registry.areAllied("raptors", "wolves"),
    crossTribeFriendly: registry.isFriendly("alpha", "omega"),
  };
}

/** Keep an ambient population topped up: two dodos get eaten, and the director refills them. */
export function runPopulation() {
  const director = createPopulationDirector({
    regions: [
      {
        region: "south-beach",
        species: [
          { species: "dodo", cap: 5, weight: 3 },
          { species: "raptor", cap: 2, weight: 1 },
        ],
      },
    ],
    respawnDelay: 10,
    seed: 7,
  });

  const initialFill = director.tick(1).length; // primes toward caps on the first tick
  director.notifyRemoved("south-beach", "dodo");
  director.notifyRemoved("south-beach", "dodo");
  const beforeDelay = director.tick(5).length;
  const afterDelay = director.tick(10).length;
  return { initialFill, beforeDelay, afterDelay, dodosAlive: director.alive("south-beach", "dodo") };
}

/** Build a foundation, then find where a wall snaps onto it and which grid cells it claims. */
export function snapBase() {
  const modelSockets: readonly ModelSocketLike[] = [{ name: "edge-n", offset: [0, 1, -1] }];
  const foundationSockets = pieceSocketsFromModel(modelSockets, () => "found-top");

  const catalog = createBuildSocketCatalog({
    pieces: [
      { type: "foundation", sockets: [...foundationSockets, { name: "top", kind: "found-top", position: [0, 1, 0] }], footprint: { w: 2, d: 2 } },
      { type: "wall", sockets: [{ name: "base", kind: "wall-bottom", position: [0, 0, 0] }], footprint: { w: 2, d: 1 } },
    ],
    rules: [{ a: "wall-bottom", b: "found-top" }],
    cellSize: 1,
  });

  const placed = { type: "foundation", transform: { position: [0, 0, 0] as const } };
  const snaps = catalog.resolveSnaps(placed, "wall", {
    cursor: [0, 1, 0],
    isFree: (cell) => cell.col >= -8 && cell.row >= -8,
  });
  const cells = footprintCells([0, 0, 0], { w: 2, d: 2 }, 0, catalog.cellSize);
  return { snapCount: snaps.length, firstSnap: snaps[0]?.transform ?? null, footprintCells: cells.length };
}

/** Run every subsystem once and collect a summary — the smoke test for the whole kit. */
export function runArkSurvivalKitDemo() {
  return {
    tame: spawnAndTame(120, 0.85),
    companion: fieldCompanion(),
    lineage: breedLineage(),
    harvest: harvestAndWeigh(),
    unlocks: unlockEngram(),
    tribes: runTribes(),
    population: runPopulation(),
    building: snapBase(),
  };
}
