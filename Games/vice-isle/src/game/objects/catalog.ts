export interface ObjectDef {
  id: string;
  label: string;
  color: string;
  footprint: { w: number; h: number; d: number };
  solid: boolean;
}

import { BUILDING_SPECS } from "../world/buildings";

const BUILDING_OBJECTS: readonly ObjectDef[] = BUILDING_SPECS.map((b) => ({
  id: b.id,
  label: "Building",
  color: "#8a8f99",
  footprint: { w: b.footprint, h: b.targetHeight, d: b.footprint },
  solid: true,
}));

export const OBJECTS: readonly ObjectDef[] = [
  { id: "obj_gunshop_sign", label: "Ammu-Isle", color: "#ffb020", footprint: { w: 2, h: 2, d: 1 }, solid: false },
  { id: "obj_safehouse_sign", label: "Palmview Bungalow", color: "#3fbf5a", footprint: { w: 2, h: 2, d: 1 }, solid: false },
  { id: "obj_vcpd_sign", label: "VCPD Station", color: "#4f7de8", footprint: { w: 2, h: 2, d: 1 }, solid: false },
  { id: "obj_crate_dock", label: "Dock Crate", color: "#8a5a33", footprint: { w: 1, h: 1, d: 1 }, solid: true },
  { id: "obj_palm_planter", label: "Palm Planter", color: "#3f7d3a", footprint: { w: 1, h: 1, d: 1 }, solid: true },
  { id: "obj_streetlight", label: "Streetlight", color: "#c9d2e0", footprint: { w: 1, h: 4, d: 1 }, solid: false },
  { id: "obj_palm", label: "Palm", color: "#57a05b", footprint: { w: 2, h: 6, d: 2 }, solid: true },
  { id: "obj_bench", label: "Bench", color: "#8a6a45", footprint: { w: 2, h: 1, d: 1 }, solid: false },
  { id: "obj_hydrant", label: "Hydrant", color: "#d64545", footprint: { w: 1, h: 1, d: 1 }, solid: false },
  { id: "obj_trashcan", label: "Trash Can", color: "#4a5560", footprint: { w: 1, h: 1, d: 1 }, solid: false },
  { id: "obj_dumpster", label: "Dumpster", color: "#3f6d4a", footprint: { w: 2, h: 1, d: 1 }, solid: true },
  { id: "obj_neon", label: "Neon Sign", color: "#f2599b", footprint: { w: 1, h: 3, d: 1 }, solid: false },
  { id: "obj_hedge", label: "Hedge", color: "#4e8a4a", footprint: { w: 2, h: 1, d: 2 }, solid: false },
  { id: "obj_cargo", label: "Cargo Container", color: "#c08a3c", footprint: { w: 3, h: 2, d: 2 }, solid: true },
  { id: "obj_cactus", label: "Cactus", color: "#5f8a4f", footprint: { w: 1, h: 2, d: 1 }, solid: false },
  ...BUILDING_OBJECTS,
];

export const objectById = (id: string): ObjectDef | undefined => OBJECTS.find((o) => o.id === id);
