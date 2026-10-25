import { defineGameSpec } from "@jgengine/core/worldModel/gameSpec";
import type { WorldActionDecl, WorldJobDecl, WorldModelDecl } from "@jgengine/core/worldModel/worldModel";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { idea } from "./idea";

/** `ops.<id>` - cash, kills and every outpost's state live in the ops faction. */
export const fact = (name: string) => `ops.${name}`;
export const gunThing = (id: string) => `gun_${id}`;
export const upgradeThing = (id: string) => `upgrade_${id}`;

const cash = fact(idea.currency.id);

/** Buying a gun: once, for its price. */
const buyGuns: Record<string, WorldActionDecl> = Object.fromEntries(
  idea.guns.map((gun) => [
    `buy_${gun.id}`,
    { label: `Buy ${gun.label}`, on: "gun", whenTarget: { owned: false }, cost: { [cash]: -gun.price }, effect: { owned: true }, note: `${gun.label} unlocked.`, refuse: "Already yours" },
  ]),
);

/** An upgrade costs its price times the stage it is on, up to its last stage. */
const buyUpgrades: Record<string, WorldActionDecl> = Object.fromEntries(
  idea.upgrades.map((upgrade) => [
    `upgrade_${upgrade.id}`,
    {
      label: upgrade.label,
      on: "upgrade",
      whenTarget: { stage: { atMost: upgrade.stages } },
      cost: { [cash]: -upgrade.price },
      scaleBy: "stage",
      effect: { stage: 1 },
      hook: "upgraded",
      note: `${upgrade.label} upgraded.`,
      refuse: "Already at its best",
    },
  ]),
);

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
      ...(index === idea.beats.length - 1 ? { hook: "victory" } : {}),
      mission: {
        id: beat.id,
        title: beat.title,
        objectives: [{ id: `${beat.id}-goal`, kind: "survive", actor: "player", label: beat.goal, until: { fact: beat.fact, atLeast: beat.atLeast } }],
      },
    } satisfies WorldJobDecl,
  ]),
);

/** The whole campaign as data: the wallet, the outposts, the guns and upgrades cash buys, the story. */
export const world: WorldModelDecl = {
  factions: {
    ops: {
      label: idea.base.label,
      facts: {
        [idea.currency.id]: { value: idea.currency.start, min: 0, max: 1000000 },
        kills: 0,
        cleared: 0,
        won: false,
        ...Object.fromEntries(idea.outposts.map((outpost) => [`${outpost.id}_clear`, false])),
      },
    },
    foe: { label: idea.foe },
  },
  people: { guide: { name: idea.guide.name, faction: "ops", known: true, says: [{ text: idea.pitch }] } },
  things: {
    ...Object.fromEntries(idea.guns.map((gun) => [gunThing(gun.id), { label: gun.label, kind: "gun", facts: { owned: gun.price === 0 } }])),
    ...Object.fromEntries(idea.upgrades.map((upgrade) => [upgradeThing(upgrade.id), { label: upgrade.label, kind: "upgrade", facts: { stage: 1 } }])),
  },
  actions: { ...buyGuns, ...buyUpgrades },
  jobs,
};

/** The running campaign: the declaration above plus the code it names. */
export const ops = defineGameSpec({
  id: idea.spec,
  world,
  hooks: {
    victory: (ctx: GameContext, call) => {
      call.world.set(fact("won"), true);
      ctx.game.notices.push({ text: `Every ${idea.foe} outpost is down. The ground is yours.`, tone: "success" });
    },
    upgraded: (ctx: GameContext) => applyUpgrades(ctx),
  },
  autoStart: true,
  input: (ctx) => ({ actors: { player: { alive: ctx.scene.entity.get(ctx.player.userId) !== null } } }),
});

/** An upgrade's bonus right now: `step` per stage past the first. */
export function bonus(ctx: GameContext, stat: "armor" | "damage"): number {
  const world = ops.of(ctx);
  return idea.upgrades.filter((upgrade) => upgrade.stat === stat).reduce((sum, upgrade) => sum + upgrade.step * (world.num(`${upgradeThing(upgrade.id)}.stage`) - 1), 0);
}

/** Armor raises the hero's health ceiling; the gain is healed in at once. */
export function applyUpgrades(ctx: GameContext): void {
  const me = ctx.player.userId;
  const health = ctx.scene.entity.stats.get(me, "health");
  if (health === null) return;
  const max = Math.round(idea.hero.health * (1 + bonus(ctx, "armor")));
  if (max === health.max) return;
  ctx.scene.entity.stats.set(me, "health", { max });
  ctx.scene.entity.stats.delta(me, "health", max - health.max);
}
