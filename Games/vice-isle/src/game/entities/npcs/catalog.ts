export interface NpcDef {
  id: string;
  role: "npc";
  walkSpeed: number;
  health: number;
  wander?: { radius: number };
}

export const NPCS: readonly NpcDef[] = [
  { id: "ped_beach", role: "npc", walkSpeed: 1.6, health: 20 },
  { id: "ped_city", role: "npc", walkSpeed: 1.9, health: 20 },
  { id: "ped_docks", role: "npc", walkSpeed: 1.5, health: 20 },
  { id: "contact_marco", role: "npc", walkSpeed: 0, health: 200 },
];

export const npcById = (id: string): NpcDef | undefined => NPCS.find((n) => n.id === id);

export function npcEntry(def: NpcDef) {
  return {
    role: def.role,
    movement: { walkSpeed: def.walkSpeed },
    stats: { health: { max: def.health, min: 0 } },
    receive: { damage: { order: ["health"] } },
    ...(def.wander !== undefined ? { wander: def.wander } : {}),
    ...(def.id.startsWith("ped_") ? { onDeath: { drops: "loot_ped" } } : {}),
  };
}
