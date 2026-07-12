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
    rewards: { economy: { cash: 3500 } },
  },
];

export const MISSION_HINTS: Record<string, string> = {
  m1_welcome: "Find Marco under the downtown neon.",
  m2_dock_sweep: "Clear the Carmine gangers off the docks.",
  m3_the_ledger: "Drop the enforcer, grab the ledger.",
  m4_shake_the_heat: "Hit 3 stars, then lose the cops.",
};
