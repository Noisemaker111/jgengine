import { defineGameSpec } from "@jgengine/core/worldModel/gameSpec";
import type { WorldActionDecl, WorldJobDecl, WorldKindDecl, WorldModelDecl, WorldSlotDecl } from "@jgengine/core/worldModel/worldModel";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import type { TowerWord } from "./kindShape";
import { onBuilt, onFallen, onVictory } from "./hooks";
import { pads } from "./places";

/** `hold.<id>` - coin, lives and the wave count live in the hold faction. */
export const fact = (name: string) => `hold.${name}`;

/** Coin to take a tower to its next level, times its level. */
export const upgradeCost = (tower: TowerWord) => Math.round(tower.cost * 0.75);

function kindOf(tower: TowerWord): WorldKindDecl {
  return {
    label: tower.label,
    tags: ["tower"],
    slot: "pad",
    cost: { [fact("coin")]: -tower.cost },
    takes: 1.5,
    refund: 0.6,
    ...(tower.from > 1 ? { when: { [fact("wave")]: { atLeast: tower.from } }, refuse: `${tower.label} unlocks on ${idea.wave.toLowerCase()} ${tower.from}` } : {}),
    facts: { level: 1 },
    hook: "built",
  };
}

const upgrades: Record<string, WorldActionDecl> = Object.fromEntries(
  idea.towers.map((tower) => [
    `upgrade_${tower.id}`,
    {
      label: "Upgrade",
      on: tower.id,
      whenTarget: { level: { atMost: 2 } },
      cost: { [fact("coin")]: -upgradeCost(tower) },
      scaleBy: "level",
      effect: { level: 1 },
      note: "{target} upgraded.",
      refuse: "Already at its best",
    } satisfies WorldActionDecl,
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
      mission: {
        id: beat.id,
        title: beat.title,
        objectives: [{ id: `${beat.id}-goal`, kind: "survive", actor: "player", label: beat.goal, until: { fact: beat.fact, atLeast: beat.atLeast } }],
      },
    } satisfies WorldJobDecl,
  ]),
);

const padSlots: Record<string, WorldSlotDecl> = Object.fromEntries(pads(editorLayers).map((pad) => [pad.id, { position: [pad.x, pad.z] as const, label: pad.label }]));

/** The whole hold as data: coin and lives, the pads, the towers, what an upgrade costs, when it ends. */
export const world: WorldModelDecl = {
  factions: {
    hold: {
      label: idea.core.label,
      facts: {
        coin: { value: idea.coin.start, min: 0, max: 1000000 },
        lives: { value: idea.core.lives, min: 0, max: 1000 },
        // The wave last sent, and how many have been held.
        wave: 0,
        cleared: 0,
        kills: 0,
        raiding: false,
        calm: idea.calm.first,
        won: false,
        lost: false,
      },
    },
  },
  people: { guide: { name: idea.guide.name, faction: "hold", known: true, says: [{ text: idea.pitch }] } },
  slots: { pad: padSlots },
  kinds: Object.fromEntries(idea.towers.map((tower) => [tower.id, kindOf(tower)])),
  actions: {
    ...upgrades,
    sell: { label: "Sell", on: "tower", removes: true, note: "{target} sold." },
  },
  totals: {
    [fact("towers")]: { of: "tower" },
    [fact("levels")]: { of: "tower", sum: "level" },
  },
  triggers: {
    fallen: { when: { [fact("lives")]: { atMost: 0 } }, hook: "fallen", once: true },
    victory: { when: { [fact("cleared")]: { atLeast: idea.waves } }, hook: "victory", once: true },
  },
  queues: { build: { lanes: 4 } },
  jobs,
};

/**
 * The running hold: the declaration above plus the code it names. Towers stand in the scene under
 * their instance ids (the engine spawns, removes and rebuilds them after a load); the story beats
 * play straight through.
 */
export const hold = defineGameSpec({
  id: idea.spec,
  world,
  hooks: { fallen: onFallen, victory: onVictory, built: onBuilt },
  show: { tower: true },
  autoStart: true,
});
