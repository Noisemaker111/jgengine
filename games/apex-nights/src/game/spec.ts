import { defineGameSpec } from "@jgengine/core/worldModel/gameSpec";
import type { WorldActionDecl, WorldJobDecl, WorldModelDecl } from "@jgengine/core/worldModel/worldModel";

import { idea } from "./idea";

/** `crew.<id>` - money, wins and each upgrade's stage live in the crew faction. */
export const fact = (name: string) => `crew.${name}`;
const cash = fact(idea.currency.id);

/** Each upgrade is a garage part with a stage; buying the next stage costs its price times the stage. */
const buyActions: Record<string, WorldActionDecl> = Object.fromEntries(
  idea.upgrades.map((upgrade) => [
    `buy_${upgrade.id}`,
    {
      label: `Upgrade ${upgrade.label}`,
      on: upgrade.id,
      whenTarget: { stage: { atMost: upgrade.levels } },
      cost: { [cash]: -upgrade.cost },
      scaleBy: "stage",
      effect: { stage: 1 },
      note: `${upgrade.label} upgraded.`,
      refuse: `${upgrade.label} is maxed out`,
    },
  ]),
);

/** One story job per race, in order: winning a race is its goal, and the next one opens after it. */
const jobs: Record<string, WorldJobDecl> = Object.fromEntries(
  idea.races.map((race, index) => [
    race.id,
    {
      title: race.title,
      kind: "story",
      act: index + 1,
      giver: "chief",
      pitch: race.pitch,
      ...(index > 0 ? { requires: [idea.races[index - 1]!.id] } : {}),
      mission: {
        id: race.id,
        title: race.title,
        objectives: [{ id: `${race.id}-podium`, kind: "survive", actor: "player", label: `Finish ${race.title} in the top three`, until: { fact: fact(`podium_${race.id}`), atLeast: 1 } }],
      },
    } satisfies WorldJobDecl,
  ]),
);

/** The whole career as data: money, garage parts, race results and the order races open in. */
export const world: WorldModelDecl = {
  factions: {
    crew: {
      label: `${idea.name} crew`,
      facts: {
        [idea.currency.id]: { value: idea.currency.start, min: 0, max: 10000000 },
        raced: 0,
        wins: 0,
        ...Object.fromEntries(idea.races.flatMap((race) => [[`podium_${race.id}`, 0], [`best_${race.id}`, 0]])),
      },
    },
  },
  people: { chief: { name: idea.guide.name, faction: "crew", known: true, says: [{ text: idea.pitch }] } },
  things: Object.fromEntries(idea.upgrades.map((upgrade) => [upgrade.id, { label: upgrade.label, kind: upgrade.id, facts: { stage: 1 } }])),
  actions: buyActions,
  jobs,
};

export const career = defineGameSpec({
  id: idea.spec,
  world,
  autoStart: true,
  input: (ctx) => ({ actors: { player: { alive: ctx.scene.entity.get(ctx.player.userId) !== null } } }),
});

/** Stage 1 is stock; each stage above adds the upgrade's `boost`. */
export function boostOf(ctx: Parameters<typeof career.of>[0], id: string): number {
  const upgrade = idea.upgrades.find((entry) => entry.id === id);
  if (upgrade === undefined) return 0;
  return (career.of(ctx).num(`${id}.stage`) - 1) * upgrade.boost;
}

/** The race the career is on: the first one without a podium, or the last once all are done. */
export function currentRace(ctx: Parameters<typeof career.of>[0]): (typeof idea.races)[number] {
  const world = career.of(ctx);
  return idea.races.find((race) => world.num(fact(`podium_${race.id}`)) < 1) ?? idea.races[idea.races.length - 1]!;
}
