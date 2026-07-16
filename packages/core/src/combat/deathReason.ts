/** Why an entity died — who or what gets credit, for drop/command rules and the `entity.died` event. */
export type DeathReason =
  | { kind: "player_kill"; killerUserId: string; via?: { item?: string } }
  | { kind: "environment"; source: string }
  | { kind: "self"; source: string };
