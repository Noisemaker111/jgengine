import type { QuestDef } from "@jgengine/core/game/quest";

export const CHALLENGE_IDS = {
  droneCull: "ch_drone_cull",
  skitterStomp: "ch_skitter_stomp",
  huskBreaker: "ch_husk_breaker",
  spitterSilence: "ch_spitter_silence",
  eliteHunter: "ch_elite_hunter",
  bossSlayer: "ch_boss_slayer",
  midfield: "ch_midfield",
  legendaryFind: "ch_legendary_find",
} as const;

export const MANUAL_OBJECTIVE = {
  eliteKill: "elite-kill",
  bossKill: "boss-kill",
  reachWave: "reach-wave",
  legendaryPickup: "legendary-pickup",
} as const;

export const challenges: readonly QuestDef[] = [
  {
    id: CHALLENGE_IDS.droneCull,
    title: "Drone Cull",
    description: "Drop 15 scav drones of any rank.",
    objectives: [
      { id: "kills_grunt", kind: "kill", target: "drone_grunt", count: 9 },
      { id: "kills_veteran", kind: "kill", target: "drone_veteran", count: 4 },
      { id: "kills_elite", kind: "kill", target: "drone_elite", count: 2 },
    ],
    rewards: { economy: { scrap: 60 } },
  },
  {
    id: CHALLENGE_IDS.skitterStomp,
    title: "Skitter Stomp",
    description: "Squash 12 skitterlings.",
    objectives: [{ id: "kills", kind: "kill", target: "skitter_grunt", count: 12 }],
    rewards: { economy: { scrap: 45 } },
  },
  {
    id: CHALLENGE_IDS.huskBreaker,
    title: "Husk Breaker",
    description: "Bring down 6 rust husks.",
    objectives: [
      { id: "kills_grunt", kind: "kill", target: "husk_grunt", count: 4 },
      { id: "kills_veteran", kind: "kill", target: "husk_veteran", count: 2 },
    ],
    rewards: { economy: { scrap: 70 } },
  },
  {
    id: CHALLENGE_IDS.spitterSilence,
    title: "Silence the Spitters",
    description: "Kill 8 bile spitters before they wear you down.",
    objectives: [
      { id: "kills_grunt", kind: "kill", target: "spitter_grunt", count: 6 },
      { id: "kills_veteran", kind: "kill", target: "spitter_veteran", count: 2 },
    ],
    rewards: { economy: { scrap: 65 } },
  },
  {
    id: CHALLENGE_IDS.eliteHunter,
    title: "Elite Hunter",
    description: "Take out 5 elite machines.",
    objectives: [{ id: "kills", kind: MANUAL_OBJECTIVE.eliteKill, count: 5 }],
    rewards: { economy: { scrap: 120 } },
  },
  {
    id: CHALLENGE_IDS.bossSlayer,
    title: "Warden Down",
    description: "Destroy a yard boss.",
    objectives: [{ id: "kills", kind: MANUAL_OBJECTIVE.bossKill, count: 1 }],
    rewards: { economy: { scrap: 200 } },
  },
  {
    id: CHALLENGE_IDS.midfield,
    title: "Hold the Midfield",
    description: "Reach wave 5.",
    objectives: [{ id: "wave", kind: MANUAL_OBJECTIVE.reachWave, count: 5 }],
    rewards: { economy: { scrap: 90 } },
  },
  {
    id: CHALLENGE_IDS.legendaryFind,
    title: "Apex Salvage",
    description: "Pick a legendary weapon off the ground.",
    objectives: [{ id: "pickup", kind: MANUAL_OBJECTIVE.legendaryPickup, count: 1 }],
    rewards: { economy: { scrap: 150 } },
  },
];
