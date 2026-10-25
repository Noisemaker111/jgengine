import { CARDINAL_LABELS, type CardinalDirection } from "@llmville/game/world/cardinal";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readNonNegativeInteger(value: unknown): number | null {
  const numeric = readFiniteNumber(value);
  if (numeric === null) return null;
  const integer = Math.floor(numeric);
  return integer >= 0 ? integer : null;
}

export function readCardinalDirection(value: unknown): CardinalDirection | null {
  const numeric = readFiniteNumber(value);
  if (numeric === null) return null;
  const index = Math.floor(numeric);
  return index >= 0 && index < CARDINAL_LABELS.length ? (index as CardinalDirection) : null;
}

export function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((entry) => typeof entry === "string") ? [...(value as string[])] : null;
}

export function readPoint3(value: unknown): { x: number; y: number; z: number } | null {
  if (!isRecord(value)) return null;
  const x = readFiniteNumber(value.x);
  const y = readFiniteNumber(value.y);
  const z = readFiniteNumber(value.z);
  return x === null || y === null || z === null ? null : { x, y, z };
}

export function readPoint2(value: unknown): { x: number; z: number } | null {
  if (!isRecord(value)) return null;
  const x = readFiniteNumber(value.x);
  const z = readFiniteNumber(value.z);
  return x === null || z === null ? null : { x, z };
}
