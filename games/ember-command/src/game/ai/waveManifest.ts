import type { EncounterDefinition } from "@jgengine/core/ai/director/encounter";
import type { EncounterConfig as PlanConfig } from "@jgengine/core/combat/encounterSequence";

import { ENEMY_WAVE_INTERVAL } from "../tuning";

/** The entry key an order uses; the game resolves it to the nearest Marauder camp when the unit spawns. */
export const MARCH_ENTRY = "warcamp";

/**
 * The Marauder march, authored as waves. Composition escalates wave by wave — grunts first, Reavers
 * from the third — and `escalates` lets the director thicken a wave when the player is in control.
 * Ember's cycle repeats these waves, so the last authored wave is the one the loop rests on.
 */
export const MARAUDER_WAVES: EncounterDefinition = {
  id: "marauder-march",
  waves: [
    {
      id: "vanguard",
      label: "Vanguard",
      groups: [{ unit: "grunt", entry: MARCH_ENTRY, count: 2 }],
    },
    {
      id: "press",
      label: "Press",
      groups: [
        { unit: "grunt", entry: MARCH_ENTRY, count: 3, escalates: true },
        { unit: "grunt", entry: MARCH_ENTRY, count: 1, at: 3 },
      ],
    },
    {
      id: "reavers",
      label: "Reavers",
      groups: [
        { unit: "grunt", entry: MARCH_ENTRY, count: 3, escalates: true },
        { unit: "reaver", entry: MARCH_ENTRY, count: 1, at: 4 },
      ],
    },
    {
      id: "hammer",
      label: "Hammer",
      groups: [
        { unit: "grunt", entry: MARCH_ENTRY, count: 4, escalates: true },
        { unit: "reaver", entry: MARCH_ENTRY, count: 2, at: 4 },
      ],
    },
    {
      id: "tide",
      label: "Tide",
      groups: [
        { unit: "grunt", entry: MARCH_ENTRY, count: 5, escalates: true },
        { unit: "reaver", entry: MARCH_ENTRY, count: 3, at: 4 },
      ],
    },
  ],
};

export const WAVE_CYCLE = MARAUDER_WAVES.waves.length;

/**
 * The Marauder plan: look before committing, plant a forward camp once the player is found, then
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
