import { carvableTerrain, type CarvableField } from "@jgengine/core/world/carve";
import type { TerrainField } from "@jgengine/core/world/terrain";

export const CRATER_CAP = 40;
export const CRATER_RADIUS = 3.1;
export const CRATER_DEPTH = 0.95;

export interface CraterInfluence {
  x: number;
  z: number;
  radius: number;
  depth: number;
}

export interface CraterRecord extends CraterInfluence {
  id: number;
  createdAt: number;
}

export interface CraterFieldState {
  records: readonly CraterRecord[];
  nextId: number;
  totalCreated: number;
}

export function createCraterFieldState(): CraterFieldState {
  return { records: [], nextId: 1, totalCreated: 0 };
}

export function addCraterRecord(
  state: CraterFieldState,
  x: number,
  z: number,
  now: number,
  radius = CRATER_RADIUS,
  depth = CRATER_DEPTH,
): CraterFieldState {
  const record: CraterRecord = { id: state.nextId, x, z, radius, depth, createdAt: now };
  const grown = [...state.records, record];
  const records = grown.length > CRATER_CAP ? grown.slice(grown.length - CRATER_CAP) : grown;
  return { records, nextId: state.nextId + 1, totalCreated: state.totalCreated + 1 };
}

export function buildCarvedField(base: TerrainField, records: readonly CraterRecord[]): CarvableField {
  const field = carvableTerrain(base);
  for (const record of records) {
    field.carve({ x: record.x, z: record.z, radius: record.radius, depth: record.depth });
  }
  return field;
}
