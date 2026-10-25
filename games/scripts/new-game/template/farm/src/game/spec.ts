import { missionMarkers } from "@jgengine/core/mission/triggers";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineGameSpec } from "@jgengine/core/worldModel/gameSpec";
import type { WorldActionDecl, WorldJobDecl, WorldKindDecl, WorldModelDecl, WorldSlotDecl } from "@jgengine/core/worldModel/worldModel";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import { plotSpots } from "./places";

/** `farm.<id>` - coins, the day, what is in the bag and what you have done all live in the farm faction. */
export const fact = (name: string) => `farm.${name}`;
const coins = fact(idea.currency.id);

/** Seconds of play one in-world hour lasts. */
export const HOUR = idea.world.sky.dayLength / 24;

/** Each crop is a kind planted in a plot slot: paying its seed starts it growing, and it is ripe when the grow order finishes. */
const cropKinds: Record<string, WorldKindDecl> = Object.fromEntries(
  idea.crops.map((crop) => [
    crop.id,
    {
      label: crop.label,
      tags: ["crop"],
      slot: "plot",
      cost: { [coins]: -crop.seed },
      takes: crop.hours * HOUR,
      queue: "grow",
      when: { [fact(`has_${crop.id}`)]: true },
      refuse: `Buy ${crop.label.toLowerCase()} seeds at the ${idea.market.label.toLowerCase()} first`,
    } satisfies WorldKindDecl,
  ]),
);

const plotSlots: Record<string, WorldSlotDecl> = Object.fromEntries(plotSpots(editorLayers).map((plot) => [plot.id, { marker: plot.id, label: `plot ${plot.index}` }]));

const cropActions: Record<string, WorldActionDecl> = Object.fromEntries(
  idea.crops.flatMap((crop) => [
    [
      `harvest_${crop.id}`,
      {
        label: `Harvest ${crop.label.toLowerCase()}`,
        on: crop.id,
        removes: true,
        world: { [fact(crop.id)]: crop.yield, [fact("harvested")]: 1, [fact(`harvested_${crop.id}`)]: 1 },
      },
    ],
    [
      `unlock_${crop.id}`,
      {
        label: `${crop.label} seeds`,
        when: { [fact(`has_${crop.id}`)]: false },
        cost: { [coins]: -crop.unlock },
        world: { [fact(`has_${crop.id}`)]: true },
        note: `${crop.label} seeds in the shed.`,
        refuse: `You already grow ${crop.label.toLowerCase()}`,
      },
    ],
  ]),
);

/** Each upgrade is a thing with a stage; the next stage costs its price times the stage, like a garage part. */
const upgradeActions: Record<string, WorldActionDecl> = Object.fromEntries(
  idea.upgrades.map((upgrade) => [
    `buy_${upgrade.id}`,
    {
      label: upgrade.label,
      on: upgrade.id,
      whenTarget: { stage: { atMost: upgrade.levels } },
      cost: { [coins]: -upgrade.cost },
      scaleBy: "stage",
      effect: { stage: 1 },
      note: `${upgrade.label} upgraded.`,
      refuse: `${upgrade.label} is as good as it gets`,
    },
  ]),
);

/** Requests from the village, one after another; each pays a little when it is done. */
const jobs: Record<string, WorldJobDecl> = Object.fromEntries(
  idea.beats.map((beat, index) => {
    const giver = idea.villagers[index % idea.villagers.length]!;
    return [
      beat.id,
      {
        title: beat.title,
        kind: "story",
        act: index + 1,
        giver: giver.id,
        pitch: beat.pitch,
        ...(index > 0 ? { requires: [idea.beats[index - 1]!.id] } : {}),
        beat: { [coins]: rewardFor(index) },
        ...(index === idea.beats.length - 1 ? { hook: "festival" } : {}),
        mission: {
          id: beat.id,
          title: beat.title,
          objectives: [{ id: `${beat.id}-goal`, kind: "survive", actor: "player", label: beat.goal, until: { fact: beat.fact, atLeast: beat.atLeast } }],
        },
      } satisfies WorldJobDecl,
    ];
  }),
);

/** What finishing request `index` pays. */
export function rewardFor(index: number): number {
  return index === idea.beats.length - 1 ? 0 : 15 + index * 15;
}

export const world: WorldModelDecl = {
  factions: {
    farm: {
      label: idea.name,
      facts: {
        [idea.currency.id]: { value: idea.currency.start, min: 0, max: 10000000 },
        day: 1,
        harvested: 0,
        caught: 0,
        shipped: 0,
        earned: 0,
        festival: false,
        ...Object.fromEntries(idea.crops.flatMap((crop) => [[crop.id, 0], [`has_${crop.id}`, crop.unlock === 0], [`harvested_${crop.id}`, 0]])),
        ...Object.fromEntries(idea.fish.map((fish) => [fish.id, 0])),
      },
    },
  },
  people: Object.fromEntries(idea.villagers.map((villager) => [villager.id, { name: villager.name, faction: "farm", known: true, says: [{ text: villager.line }] }])),
  things: Object.fromEntries(idea.upgrades.map((upgrade) => [upgrade.id, { label: upgrade.label, kind: upgrade.id, facts: { stage: 1 } }])),
  kinds: cropKinds,
  slots: { plot: plotSlots },
  queues: { grow: { lanes: Math.max(1, idea.plots.total) } },
  actions: { ...cropActions, ...upgradeActions },
  totals: { [fact("planted")]: { of: "crop", building: true }, [fact("ripe")]: { of: "crop" } },
  jobs,
};

/**
 * The running farm: the declaration above plus the one hook it names. Crops growing in their plots
 * are build orders, so a save keeps every sprout and how far along it is, and sleeping catches the
 * world up overnight with `advance`.
 */
export const farm = defineGameSpec({
  id: idea.spec,
  world,
  markers: missionMarkers(editorLayers),
  hooks: {
    festival: (ctx, call) => {
      call.world.set(fact("festival"), true);
      ctx.game.notices.push({ text: `${idea.name} throws you a festival. The farm is yours to keep growing.`, tone: "success" });
    },
  },
  autoStart: true,
  onJob: (ctx, event) => {
    if (event.kind !== "job-done") return;
    const index = idea.beats.findIndex((beat) => beat.id === event.jobId);
    const pay = rewardFor(index);
    if (pay > 0) ctx.game.notices.push({ text: `${idea.villagers[index % idea.villagers.length]!.name} thanks you: +${pay} ${idea.currency.label.toLowerCase()}`, tone: "success" });
  },
  input: (ctx) => ({ actors: { player: { alive: ctx.scene.entity.get(ctx.player.userId) !== null } } }),
});

export const farmOf = (ctx: GameContext) => farm.of(ctx);

/** Stage 1 is what you start with. */
export const stageOf = (ctx: GameContext, id: "rod" | "land") => farm.of(ctx).num(`${id}.stage`) || 1;

/** Plots you can plant: the first `start`, and a row more for every stage of land bought. */
export function openPlots(ctx: GameContext): number {
  return Math.min(idea.plots.total, idea.plots.start + (stageOf(ctx, "land") - 1) * idea.plots.perRow);
}
