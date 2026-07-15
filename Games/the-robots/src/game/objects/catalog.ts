export interface WorldObjectDef {
  id: string;
  name: string;
  color: string;
  height: number;
}

export const worldObjects: readonly WorldObjectDef[] = [
  { id: "red_chest", name: "Weapon Chest", color: "#a32c1e", height: 1 },
  { id: "ammo_chest", name: "Ammo Chest", color: "#3c5b32", height: 0.8 },
  { id: "vendor_rigg", name: "Rigg Munitions", color: "#c9a23a", height: 2.2 },
  { id: "vendor_zed", name: "Dr. Sparx's Meds", color: "#d8d4c8", height: 2.2 },
  { id: "new_u_station", name: "Rebuild Station", color: "#2f8cff", height: 2.6 },
  { id: "bandit_barrel", name: "Explosive Barrel", color: "#b3452a", height: 0.9 },
  { id: "fast_travel", name: "Fast Travel Station", color: "#38e1ff", height: 2.8 },
  { id: "black_market", name: "Crazy Earl's Black Market", color: "#8a2be2", height: 2.2 },
  { id: "rock_spire", name: "Rock Spire", color: "#8a5a38", height: 3 },
  { id: "dead_tree", name: "Dead Tree", color: "#4a3a2c", height: 2.4 },
  { id: "wreck", name: "Scrapjack Wreck", color: "#5e564a", height: 1.2 },
  { id: "barricade", name: "Scrap Barricade", color: "#6b5a44", height: 1.6 },
  { id: "watchtower", name: "Scrapjack Watchtower", color: "#5a4a36", height: 5 },
  { id: "tent", name: "Scrapjack Tent", color: "#7a4432", height: 1.8 },
  { id: "signpost", name: "Signpost", color: "#8a6a3c", height: 2.4 },
  { id: "street_lamp", name: "Street Lamp", color: "#3a4450", height: 3.4 },
  { id: "road_marker", name: "Road Marker", color: "#a06a3c", height: 1 },
  { id: "bus_wreck", name: "Crashed Bus", color: "#c9a23a", height: 2.6 },
  { id: "water_tower", name: "Coretown Water Tower", color: "#a06a3c", height: 7 },
  { id: "bone_arch", name: "Scrap Bone Arch", color: "#e0d6c2", height: 2.6 },
  { id: "reactor_gate", name: "Reactor Gate", color: "#3a2c4a", height: 8 },
  { id: "cover_crate", name: "Cover Crate", color: "#6b5a44", height: 1.1 },
  { id: "banner_pole", name: "Scrapjack Banner", color: "#7a2c1e", height: 3.2 },
];

const byId = new Map(worldObjects.map((object) => [object.id, object]));

export function worldObjectById(id: string): WorldObjectDef | undefined {
  return byId.get(id);
}
