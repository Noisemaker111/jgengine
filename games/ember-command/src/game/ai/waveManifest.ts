import type { EncounterDefinition } from "@jgengine/core/waves/encounter";
import type { EncounterSequenceConfig as PlanConfig } from "@jgengine/core/waves/encounterSequence";

import { ENEMY_WAVE_INTERVAL } from "../tuning";

/** The entry key an order uses; the game resolves it to the nearest Black Ant camp when the unit spawns. */
export const MARCH_ENTRY = "brood_mound";

/**
 * The Black Ant march, authored as waves. Composition escalates wave by wave — raiders first, Majors
 * from the third — and `escalates` lets the director thicken a wave when the player is in control.
 * Ember's cycle repeats these waves, so the last authored wave is the one the loop rests on.
 */
export const RIVAL_WAVES: EncounterDefinition = {
  id: "rival-march",
  waves: [
    {
      id: "colony",
      label: "Red",
      groups: [{ unit: "raider", entry: MARCH_ENTRY, count: 2 }],
    },
    {
      id: "press",
      label: "Press",
      groups: [
        { unit: "raider", entry: MARCH_ENTRY, count: 3, escalates: true },
        { unit: "raider", entry: MARCH_ENTRY, count: 1, at: 3 },
      ],
    },
    {
      id: "majors",
      label: "Majors",
      groups: [
        { unit: "raider", entry: MARCH_ENTRY, count: 3, escalates: true },
        { unit: "major", entry: MARCH_ENTRY, count: 1, at: 4 },
      ],
    },
    {
      id: "hammer",
      label: "Hammer",
      groups: [
        { unit: "raider", entry: MARCH_ENTRY, count: 4, escalates: true },
        { unit: "major", entry: MARCH_ENTRY, count: 2, at: 4 },
      ],
    },
    {
      id: "tide",
      label: "Tide",
      groups: [
        { unit: "raider", entry: MARCH_ENTRY, count: 5, escalates: true },
        { unit: "major", entry: MARCH_ENTRY, count: 3, at: 4 },
      ],
    },
  ],
};

export const WAVE_CYCLE = RIVAL_WAVES.waves.length;

/**
 * The Black Ant plan: look before committing, plant a forward camp once the player is found, then
 * send a wave every beat forever. Phase gates are engine predicates — a flag the game raises or a
 * timer — so the plan itself holds no timing code.
 */
export const MARCH_PLAN: PlanConfig = {
  phases: [
    {
      id: "scout",
      completion: {
        kind: "quorum",
        params: {
          count: 1,
          predicates: [
            { kind: "flag", params: { flag: "contact" } },
            { kind: "timer", params: { seconds: 45 } },
          ],
        },
      },
    },
    { id: "expand", completion: { kind: "flag", params: { flag: "campRaised" } } },
    {
      id: "attack",
      repeat: 5000,
      completion: { kind: "timer", params: { seconds: ENEMY_WAVE_INTERVAL } },
    },
  ],
};
