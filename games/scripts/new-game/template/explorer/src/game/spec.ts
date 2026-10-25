import { defineGameSpec } from "@jgengine/core/worldModel/gameSpec";
import type { WorldJobDecl, WorldModelDecl } from "@jgengine/core/worldModel/worldModel";

import { idea } from "./idea";
import { onFound, onRelic, onVictory } from "./journey";

/** `journey.<name>` - the counts the story and the HUD read. */
export const fact = (name: string) => `journey.${name}`;
export const placeId = (landmark: string) => `place-${landmark}`;
export const relicId = (landmark: string) => `relic-${landmark}`;
export const GOAL = "goal";

const relicLandmarks = idea.landmarks.filter((landmark) => landmark.relic !== undefined);
const final = idea.landmarks.find((landmark) => landmark.role === "final");
/** Relics it takes to finish: every one on the map. */
export const RELICS_NEEDED = relicLandmarks.length;

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

/** The whole journey as data: what is found, what is carried, what still guards what, and the story. */
export const world: WorldModelDecl = {
  factions: { journey: { label: idea.hero.label, facts: { found: 0, relics: 0, won: 0, fallen: 0 } } },
  people: { guide: { name: idea.guide.name, faction: "journey", known: true, says: [{ text: idea.pitch }] } },
  things: {
    ...Object.fromEntries(idea.landmarks.map((landmark) => [placeId(landmark.id), { label: landmark.label, kind: "landmark", facts: { found: false } }])),
    ...Object.fromEntries(
      relicLandmarks.map((landmark) => [relicId(landmark.id), { label: landmark.relic!.label, kind: "relic", facts: { taken: false, guards: landmark.guardian?.count ?? 0 } }]),
    ),
    ...(final === undefined ? {} : { [GOAL]: { label: idea.goal.label, kind: "goal", facts: { lit: false, guards: final.guardian?.count ?? 0 } } }),
  },
  actions: {
    discover: { label: "Discover", on: "landmark", whenTarget: { found: false }, effect: { found: true }, world: { [fact("found")]: 1 }, hook: "found", note: "{target} found.", refuse: "Already on your map" },
    take_relic: {
      label: "Take",
      on: "relic",
      whenTarget: { taken: false, guards: { atMost: 0 } },
      effect: { taken: true },
      world: { [fact("relics")]: 1 },
      hook: "relic",
      note: "{target} taken.",
      refuse: "Its guardian still stands watch",
    },
    awaken: {
      label: idea.goal.verb,
      on: "goal",
      when: { [fact("relics")]: { atLeast: RELICS_NEEDED } },
      whenTarget: { lit: false, guards: { atMost: 0 } },
      effect: { lit: true },
      world: { [fact("won")]: 1 },
      hook: "victory",
      note: idea.goal.done,
      refuse: `Bring all ${RELICS_NEEDED} relics, and clear the guardian`,
    },
  },
  jobs,
};

/** The running journey: the declaration above plus the code it names; the story plays straight through. */
export const journey = defineGameSpec({
  id: idea.spec,
  world,
  hooks: { found: onFound, relic: onRelic, victory: onVictory },
  autoStart: true,
  input: (ctx) => ({ actors: { player: { alive: ctx.scene.entity.get(ctx.player.userId) !== null } } }),
});
