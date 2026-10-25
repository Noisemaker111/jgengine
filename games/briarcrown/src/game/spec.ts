import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineGameSpec } from "@jgengine/core/worldModel/gameSpec";
import type { WorldActionDecl, WorldChanges, WorldFlowDecl, WorldJobDecl, WorldKindDecl, WorldModelDecl, WorldTriggerDecl } from "@jgengine/core/worldModel/worldModel";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import type { BuildingWord } from "./kindShape";
import { realmGrid } from "./places";
import { hideWalker, onCrowned, onTier, showWalker } from "./hooks";

/** `realm.<id>` - every resource, tier and count the realm keeps lives in the realm faction. */
export const fact = (name: string) => `realm.${name}`;

const [food] = idea.resources;
const tierLabel = (tier: number) => idea.tiers[tier - 1]?.label ?? `tier ${tier}`;
const spend = (cost: Readonly<Record<string, number>>): WorldChanges => Object.fromEntries(Object.entries(cost).map(([id, amount]) => [fact(id), -amount]));
/** Coin to take a building to its next level, times its level. */
export const upgradeCost = (building: BuildingWord) => Math.max(10, Math.round(Object.values(building.cost).reduce((sum, amount) => sum + amount, 0) * 0.6));

function kindOf(building: BuildingWord): WorldKindDecl {
  const needs = building.staff ?? 0;
  const tags = building.role === "home" ? ["home", "dwelling", "building"] : building.role === "producer" ? ["producer", "building"] : ["crown"];
  return {
    label: building.label,
    tags,
    grid: "realm",
    size: building.size,
    cost: spend(building.cost),
    takes: building.takes,
    refund: 0.5,
    when: { [fact("tier")]: { atLeast: building.tier }, ...(needs > 0 ? { [fact("idle")]: { atLeast: needs } } : {}) },
    refuse: needs > 0 ? `${building.label} needs the ${tierLabel(building.tier).toLowerCase()} and ${needs} free ${idea.people.label.toLowerCase()} - build homes` : `${building.label} unlocks at the ${tierLabel(building.tier).toLowerCase()}`,
    facts: { level: 1, ...(building.houses === undefined ? {} : { beds: building.houses }), ...(building.staff === undefined ? {} : { staff: building.staff }) },
    ...(building.role === "crown" ? { limit: 1, hook: "crowned" } : {}),
  };
}

const upgrades: Record<string, WorldActionDecl> = Object.fromEntries(
  idea.buildings
    .filter((building) => building.role !== "crown")
    .map((building) => [
      `upgrade_${building.id}`,
      {
        label: "Upgrade",
        on: building.id,
        whenTarget: { level: { atMost: 2 } },
        cost: { [fact(idea.coin)]: -upgradeCost(building) },
        scaleBy: "level",
        effect: { level: 1, ...(building.houses === undefined ? {} : { beds: building.houses }) },
        note: "{target} upgraded.",
        refuse: "Already at its best",
      } satisfies WorldActionDecl,
    ]),
);

const producers = idea.buildings.filter((building) => building.role === "producer" && building.makes !== undefined);
const flows: Record<string, WorldFlowDecl> = {
  eating: { to: fact(food!.id), rate: -idea.eats, from: fact("people") },
  taxes: { to: fact(idea.coin), rate: idea.tax, from: fact("people"), when: { [fact("fed")]: true } },
  ...Object.fromEntries(
    producers.map((building) => [
      `${building.id}_output`,
      {
        to: fact(building.makes!),
        rate: building.rate ?? 0.2,
        from: fact(`works_${building.id}`),
        // Hungry hands stop work everywhere but the fields.
        ...(building.makes === food!.id ? {} : { when: { [fact("fed")]: true } }),
      },
    ]),
  ),
};

const triggers: Record<string, WorldTriggerDecl> = {
  hungry: { when: { [fact("fed")]: false }, note: `The stores are out of ${food!.label.toLowerCase()}: work stops until there is more.` },
  ...Object.fromEntries(
    idea.tiers.slice(1).map((tier, index) => [
      `tier_${index + 2}`,
      { when: { [fact("people")]: { atLeast: tier.people }, [fact("tier")]: { atLeast: index + 1, atMost: index + 1 } }, then: { [fact("tier")]: 1 }, note: tier.note, hook: "tier", once: true },
    ]),
  ),
};

const jobs: Record<string, WorldJobDecl> = Object.fromEntries(
  idea.beats.map((beat, index) => [
    beat.id,
    {
      title: beat.title,
      kind: "story",
      act: index + 1,
      giver: "guide",
      pitch: beat.pitch,
      ...(index > 0 ? { requires: [idea.beats[index - 1]!.id] } : {}),
      mission: {
        id: beat.id,
        title: beat.title,
        objectives: [{ id: `${beat.id}-goal`, kind: "survive", actor: "player", label: beat.goal, until: { fact: beat.fact, atLeast: beat.atLeast } }],
      },
    } satisfies WorldJobDecl,
  ]),
);

/** The whole realm as data: what it stores, what can be built, what it makes, how it grows. */
export const world: WorldModelDecl = {
  factions: {
    realm: {
      label: idea.seat.label,
      facts: {
        ...Object.fromEntries(idea.resources.map((resource) => [resource.id, { value: resource.start, min: 0, max: 1000000 }])),
        tier: 1,
        won: false,
      },
    },
  },
  people: { guide: { name: idea.guide.name, faction: "realm", known: true, says: [{ text: idea.pitch }] } },
  grids: { realm: realmGrid(editorLayers) },
  kinds: {
    seat: { label: idea.seat.label, tags: ["home", "seat"], grid: "realm", size: idea.seat.size, facts: { level: 1, beds: idea.seat.houses }, limit: 1 },
    ...Object.fromEntries(idea.buildings.map((building) => [building.id, kindOf(building)])),
  },
  actions: {
    ...upgrades,
    demolish: { label: "Demolish", on: "building", removes: true, note: "{target} torn down." },
  },
  totals: {
    [fact("people")]: { of: "home", sum: "beds" },
    [fact("jobs")]: { of: "producer", sum: "staff", building: true },
    [fact("homes")]: { of: "dwelling" },
    [fact("producers")]: { of: "producer" },
    [fact("crowns")]: { of: "crown" },
    ...Object.fromEntries(producers.map((building) => [fact(`works_${building.id}`), { of: building.id, sum: "level" }])),
  },
  flows,
  triggers,
  queues: { build: { lanes: 2 } },
  jobs,
};

/** People housed and employed, read straight from the saved world so conditions can see who is free. */
function census(ctx: GameContext): { people: number; jobs: number } {
  const state = realm.store.read(ctx);
  let people = 0;
  let jobs = 0;
  for (const [id, instance] of Object.entries(state?.instances ?? {})) {
    const beds = Number(state?.facts[`${id}.beds`] ?? 0);
    if (instance.ready) people += beds;
    jobs += Number(state?.facts[`${id}.staff`] ?? 0);
  }
  return { people, jobs };
}

/**
 * The running realm: the declaration above plus the code it names. Built things stand in the scene
 * under their instance ids (the engine spawns, removes and rebuilds them after a load), and the story
 * beats play straight through.
 */
export const realm = defineGameSpec({
  id: idea.spec,
  world,
  hooks: { tier: onTier, crowned: onCrowned },
  show: { home: true, producer: true, crown: true },
  autoStart: true,
  live: (ctx) => {
    const count = census(ctx);
    const stored = Number(realm.store.read(ctx)?.facts[fact(food!.id)] ?? food!.start);
    return { [fact("idle")]: count.people - count.jobs, [fact("fed")]: stored > 0.5 };
  },
  onReady: (ctx, instance) => showWalker(ctx, instance),
  onRemoved: (ctx, removed) => hideWalker(ctx, removed),
  onRestored: (ctx, instances) => {
    for (const instance of instances) showWalker(ctx, instance);
  },
});
