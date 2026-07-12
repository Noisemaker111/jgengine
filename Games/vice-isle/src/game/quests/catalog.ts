export const QUESTS = [
  {
    id: "m1_welcome",
    title: "Welcome to the Isle",
    objectives: [{ id: "meet_marco", kind: "goto", count: 1 }],
    rewards: { economy: { cash: 200 }, quests: ["m2_dock_sweep"] },
  },
  {
    id: "m2_dock_sweep",
    title: "Dock Sweep",
    requires: ["m1_welcome"],
    objectives: [{ id: "clear_gangers", kind: "kill", target: "ganger_dock", count: 5 }],
    rewards: { economy: { cash: 900 }, quests: ["m3_the_ledger"] },
  },
  {
    id: "m3_the_ledger",
    title: "The Ledger",
    requires: ["m2_dock_sweep"],
    objectives: [
      { id: "drop_enforcer", kind: "kill", target: "ganger_enforcer", count: 1 },
      { id: "grab_case", kind: "collect", item: "briefcase_carmine", count: 1 },
    ],
    rewards: { economy: { cash: 2000 }, quests: ["m4_shake_the_heat"] },
  },
  {
    id: "m4_shake_the_heat",
    title: "Shake the Heat",
    requires: ["m3_the_ledger"],
    objectives: [{ id: "lose_wanted", kind: "escape", count: 1 }],
    rewards: { economy: { cash: 3500 }, quests: ["m5_ocean_loop"] },
  },
  {
    id: "m5_ocean_loop",
    title: "The Ocean Loop",
    requires: ["m4_shake_the_heat"],
    objectives: [{ id: "win_race", kind: "race", count: 1 }],
    rewards: { economy: { cash: 4000 }, quests: ["m6_hot_wheels"] },
  },
  {
    id: "m6_hot_wheels",
    title: "Hot Wheels",
    requires: ["m5_ocean_loop"],
    objectives: [{ id: "deliver_cicada", kind: "deliver", count: 1 }],
    rewards: { economy: { cash: 5000 }, quests: ["m7_carmine_convoy"] },
  },
  {
    id: "m7_carmine_convoy",
    title: "Carmine Convoy",
    requires: ["m6_hot_wheels"],
    objectives: [{ id: "break_convoy", kind: "kill", target: "ganger_dock", count: 8 }],
    rewards: { economy: { cash: 6500 }, quests: ["m8_kingpin"] },
  },
  {
    id: "m8_kingpin",
    title: "Kingpin of Palm Heights",
    requires: ["m7_carmine_convoy"],
    objectives: [{ id: "drop_sal", kind: "kill", target: "kingpin_sal", count: 1 }],
    rewards: { economy: { cash: 25000 } },
  },
];

export const MISSION_HINTS: Record<string, string> = {
  m1_welcome: "Find Marco under the downtown neon.",
  m2_dock_sweep: "Clear the Carmine gangers off the docks.",
  m3_the_ledger: "Drop the enforcer, grab the ledger.",
  m4_shake_the_heat: "Hit 3 stars, then lose the cops.",
  m5_ocean_loop: "Grab a car, start the race at the garage.",
  m6_hot_wheels: "Steal the Cicada GT in Palm Heights, deliver it to the garage.",
  m7_carmine_convoy: "The Carmines are re-arming the docks. Break the convoy.",
  m8_kingpin: "Sal runs it all from his Palm Heights villa. End it.",
};
