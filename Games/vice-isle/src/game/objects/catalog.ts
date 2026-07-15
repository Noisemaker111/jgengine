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
  { id: "obj_crate_dock", label: "Dock Crate", color: "#8a5a33", footprint: { w: 1, h: 1, d: 1 }, solid: true },
  { id: "obj_palm_planter", label: "Palm Planter", color: "#3f7d3a", footprint: { w: 1, h: 1, d: 1 }, solid: true },
  { id: "obj_streetlight", label: "Streetlight", color: "#c9d2e0", footprint: { w: 1, h: 4, d: 1 }, solid: false },
  ...BUILDING_OBJECTS,
];

export const objectById = (id: string): ObjectDef | undefined => OBJECTS.find((o) => o.id === id);
