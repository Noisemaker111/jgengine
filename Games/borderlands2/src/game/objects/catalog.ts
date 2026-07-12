export interface WorldObjectDef {
  id: string;
  name: string;
  color: string;
  height: number;
}

export const worldObjects: readonly WorldObjectDef[] = [
  { id: "red_chest", name: "Weapon Chest", color: "#a32c1e", height: 1 },
  { id: "ammo_chest", name: "Ammo Chest", color: "#3c5b32", height: 0.8 },
  { id: "vendor_marcus", name: "Marcus Munitions", color: "#c9a23a", height: 2.2 },
  { id: "vendor_zed", name: "Dr. Zed's Meds", color: "#d8d4c8", height: 2.2 },
  { id: "new_u_station", name: "New-U Station", color: "#2f8cff", height: 2.6 },
  { id: "bandit_barrel", name: "Explosive Barrel", color: "#b3452a", height: 0.9 },
  { id: "fast_travel", name: "Fast Travel Station", color: "#38e1ff", height: 2.8 },
  { id: "black_market", name: "Crazy Earl's Black Market", color: "#8a2be2", height: 2.2 },
];

const byId = new Map(worldObjects.map((object) => [object.id, object]));

export function worldObjectById(id: string): WorldObjectDef | undefined {
  return byId.get(id);
}
