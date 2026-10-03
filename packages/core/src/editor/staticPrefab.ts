/** A solid or clearance volume in the prefab's unnormalized local asset space. */
export interface StaticPrefabBox {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

/** Persisted static export settings; source parts remain editable in the prefab fragment. */
export interface StaticPrefabBake {
  assetId: string;
  /** Omit for a conservative closed exterior. Explicit boxes preserve authored openings. */
  collisionBoxes?: readonly StaticPrefabBox[];
  /** Required empty spaces, checked against movement solids before export. */
  clearances?: readonly (StaticPrefabBox & { id: string })[];
}

/** Validate and copy static prefab export settings from document or RPC input. */
export function parseStaticPrefabBake(value: unknown): StaticPrefabBake {
  const record = (input: unknown): Record<string, unknown> => {
    if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("expected an object");
    return input as Record<string, unknown>;
  };
  const input = record(value);
  for (const key of Object.keys(input)) {
    if (!["assetId", "collisionBoxes", "clearances"].includes(key)) throw new Error(`unknown static bake field: ${key}`);
  }
  if (typeof input.assetId !== "string" || input.assetId.trim().length === 0) throw new Error("assetId: expected a nonempty string");
  const boxes = (items: unknown, clearance: boolean): (StaticPrefabBox & { id?: string })[] => {
    if (!Array.isArray(items) || items.length === 0 || items.length > 4096) throw new Error("expected 1..4096 boxes");
    const ids = new Set<string>();
    return items.map((item, index) => {
      const box = record(item);
      for (const key of Object.keys(box)) {
        if (!["min", "max", ...(clearance ? ["id"] : [])].includes(key)) throw new Error(`box ${index}: unknown field ${key}`);
      }
      for (const key of ["min", "max"]) {
        const vector = box[key];
        if (!Array.isArray(vector) || vector.length !== 3 || !vector.every((axis) => typeof axis === "number" && Number.isFinite(axis))) throw new Error(`box ${index}.${key}: expected three finite numbers`);
      }
      const min = box.min as [number, number, number];
      const max = box.max as [number, number, number];
      if (!min.every((axis, i) => axis < max[i]!)) throw new Error(`box ${index}: min must be less than max on every axis`);
      if (clearance) {
        if (typeof box.id !== "string" || box.id.trim().length === 0 || ids.has(box.id)) throw new Error(`clearance ${index}: expected a unique nonempty id`);
        ids.add(box.id);
      }
      return { min: [...min], max: [...max], ...(clearance ? { id: box.id as string } : {}) };
    });
  };
  const collisionBoxes = input.collisionBoxes === undefined ? undefined : boxes(input.collisionBoxes, false);
  const clearances = input.clearances === undefined ? undefined : boxes(input.clearances, true) as (StaticPrefabBox & { id: string })[];
  if (clearances !== undefined && collisionBoxes === undefined) throw new Error("clearances require explicit collisionBoxes");
  for (const clearance of clearances ?? []) {
    if (collisionBoxes!.some((solid) => solid.min.every((axis, i) => axis < clearance.max[i]! && solid.max[i]! > clearance.min[i]!))) throw new Error(`clearance ${clearance.id} intersects a collision box`);
  }
  return { assetId: input.assetId, ...(collisionBoxes === undefined ? {} : { collisionBoxes }), ...(clearances === undefined ? {} : { clearances }) };
}
