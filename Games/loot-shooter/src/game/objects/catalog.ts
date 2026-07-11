export interface CoverObjectDef {
  id: string;
  name: string;
  solid: boolean;
  color: string;
  height: number;
}

export const coverObjects: readonly CoverObjectDef[] = [
  { id: "crate_metal", name: "Supply Crate", solid: true, color: "#4a5566", height: 1 },
  { id: "crate_amber", name: "Munitions Crate", solid: true, color: "#96702a", height: 1 },
  { id: "barrier_slab", name: "Blast Barrier", solid: true, color: "#3a434e", height: 0.95 },
  { id: "pylon_beacon", name: "Beacon Pylon", solid: true, color: "#1d2b33", height: 2.4 },
  { id: "wreck_hull", name: "Drone Wreck", solid: true, color: "#4a3228", height: 1.1 },
  { id: "station_ammo", name: "Ammo Requisition", solid: true, color: "#f5a623", height: 2 },
  { id: "station_gear", name: "Gear Requisition", solid: true, color: "#38e1ff", height: 2 },
];

const byId = new Map(coverObjects.map((object) => [object.id, object]));

export function coverObjectById(id: string): CoverObjectDef | undefined {
  return byId.get(id);
}
