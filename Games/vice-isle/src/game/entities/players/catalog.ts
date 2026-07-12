export const playerCatalog = {
  id: "street_runner",
  role: "player" as const,
  movement: { walkSpeed: 6.2, poses: ["standing", "running"] as const },
  stats: {
    health: { max: 100, min: 0 },
    armor: { max: 100, min: 0, current: 0 },
    ammo_9mm: { max: 240, min: 0, current: 36 },
    ammo_shell: { max: 60, min: 0, current: 0 },
  },
  receive: {
    damage: { order: ["armor", "health"] },
    heal: { order: ["health"] },
  },
};
