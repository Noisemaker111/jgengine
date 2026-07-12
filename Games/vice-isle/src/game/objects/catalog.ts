export interface ObjectDef {
  id: string;
  label: string;
  color: string;
  footprint: { w: number; h: number; d: number };
  solid: boolean;
}

export const OBJECTS: readonly ObjectDef[] = [
  { id: "obj_gunshop_sign", label: "Ammu-Isle", color: "#ffb020", footprint: { w: 2, h: 2, d: 1 }, solid: false },
  { id: "obj_crate_dock", label: "Dock Crate", color: "#8a5a33", footprint: { w: 1, h: 1, d: 1 }, solid: true },
  { id: "obj_palm_planter", label: "Palm Planter", color: "#3f7d3a", footprint: { w: 1, h: 1, d: 1 }, solid: true },
  { id: "obj_streetlight", label: "Streetlight", color: "#c9d2e0", footprint: { w: 1, h: 4, d: 1 }, solid: false },
];

export const objectById = (id: string): ObjectDef | undefined => OBJECTS.find((o) => o.id === id);
