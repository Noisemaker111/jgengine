/**
 * Why an entity died — who or what gets credit, for drop/command rules and the `entity.died` event.
 * `source` names what dealt it: a player kill's killer instance id, or the hazard/item of an
 * environment death; `attacker` carries the non-player entity's instance id when one dealt it.
 */
export type DeathReason =
  | { kind: "player_kill"; killerUserId: string; source?: string; via?: { item?: string } }
  | { kind: "environment"; source: string; attacker?: string }
  | { kind: "self"; source: string };
