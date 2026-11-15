export interface WorldObjectDef {
  id: string;
  name: string;
  color: string;
  height: number;
}

export const worldObjects: readonly WorldObjectDef[] = [
  { id: "red_chest", name: "Toy Chest", color: "#a32c1e", height: 1 },
  { id: "ammo_chest", name: "Recycling Bin", color: "#3c5b32", height: 0.8 },
  { id: "vendor_rigg", name: "Hank's Garage", color: "#c9a23a", height: 2.2 },
  { id: "vendor_sparx", name: "Nana's First-Aid Porch", color: "#d8d4c8", height: 2.2 },
  { id: "rebuild_station", name: "Lucky Gnome", color: "#2f8cff", height: 2.6 },
  { id: "bandit_barrel", name: "Propane Tank", color: "#b3452a", height: 0.9 },
  { id: "fast_travel", name: "Bus Stop", color: "#38e1ff", height: 2.8 },
  { id: "black_market", name: "Swap Meet Table", color: "#8a2be2", height: 2.2 },
  { id: "vault", name: "Hank's Workbench", color: "#c9a23a", height: 2.4 },
  { id: "rock_spire", name: "Landscaping Boulder", color: "#8a5a38", height: 3 },
  { id: "dead_tree", name: "Overgrown Tree", color: "#4a3a2c", height: 2.4 },
  { id: "wreck", name: "Abandoned Moving Truck", color: "#5e564a", height: 1.2 },
  { id: "barricade", name: "Patio-Furniture Barricade", color: "#6b5a44", height: 1.6 },
  { id: "watchtower", name: "Treehouse Lookout", color: "#5a4a36", height: 5 },
  { id: "tent", name: "Carport", color: "#7a4432", height: 1.8 },
  { id: "signpost", name: "Signpost", color: "#8a6a3c", height: 2.4 },
  { id: "street_lamp", name: "Street Lamp", color: "#3a4450", height: 3.4 },
  { id: "road_marker", name: "Road Marker", color: "#a06a3c", height: 1 },
  { id: "bus_wreck", name: "Abandoned School Bus", color: "#c9a23a", height: 2.6 },
  { id: "water_tower", name: "Maple Hollow Water Tower", color: "#a06a3c", height: 7 },
  { id: "bone_arch", name: "Giant Lawn Flamingo", color: "#e0d6c2", height: 2.6 },
  { id: "reactor_gate", name: "Estates Gate", color: "#3a2c4a", height: 8 },
  { id: "cover_crate", name: "Moving Box", color: "#6b5a44", height: 1.1 },
  { id: "banner_pole", name: "Yard-Sale Sign", color: "#7a2c1e", height: 3.2 },
  { id: "wind_turbine", name: "Cell Tower", color: "#b3bec9", height: 7 },
  { id: "mailbox", name: "Mailbox", color: "#2f6fd6", height: 1.2 },
  { id: "driveway", name: "Driveway", color: "#6b6d72", height: 0.04 },
  { id: "picket_fence", name: "Picket Fence", color: "#f5f2ea", height: 1 },
  { id: "culdesac", name: "Cul-de-Sac", color: "#5b5d63", height: 0.04 },
];

const byId = new Map(worldObjects.map((object) => [object.id, object]));

export function worldObjectById(id: string): WorldObjectDef | undefined {
  return byId.get(id);
}
