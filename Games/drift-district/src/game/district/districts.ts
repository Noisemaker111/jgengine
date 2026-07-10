export type Vec2 = readonly [number, number];

export interface District {
  id: string;
  name: string;
  color: string;
  center: Vec2;
}

export const DISTRICTS: readonly District[] = [
  { id: "harbor", name: "Harbor", color: "#29d9e0", center: [-200, -20] },
  { id: "downtown", name: "Downtown", color: "#ff2d78", center: [180, -20] },
  { id: "heights", name: "Heights", color: "#ffb347", center: [10, 150] },
];

export function districtById(id: string): District {
  const found = DISTRICTS.find((d) => d.id === id);
  if (found === undefined) throw new Error(`districtById: unknown district "${id}"`);
  return found;
}
