import type { Polarity } from "./polarity";

export type Lane = 0 | 1 | 2;
export type FloorSurfaceKind = "floor" | "ceiling";

export interface StripSegment {
  surface: FloorSurfaceKind;
  lane: Lane;
  fromZ: number;
  toZ: number;
  polarity: Polarity;
}

export interface GateSegment {
  surface: FloorSurfaceKind;
  lane: Lane;
  z: number;
  width: number;
  requires: Polarity;
}

export interface CheckpointDef {
  id: string;
  z: number;
}

export interface SectorLayout {
  id: string;
  index: number;
  length: number;
  tint: string;
  label: string;
  strips: readonly StripSegment[];
  gates: readonly GateSegment[];
  checkpoints: readonly CheckpointDef[];
}

export function stripPolarityAt(
  strips: readonly StripSegment[],
  surface: FloorSurfaceKind,
  lane: Lane,
  z: number,
): Polarity | null {
  for (const segment of strips) {
    if (segment.surface !== surface || segment.lane !== lane) continue;
    if (z >= segment.fromZ && z < segment.toZ) return segment.polarity;
  }
  return null;
}

export function gateAt(
  gates: readonly GateSegment[],
  surface: FloorSurfaceKind,
  lane: Lane,
  z: number,
  tolerance = 0.5,
): GateSegment | null {
  for (const gate of gates) {
    if (gate.surface !== surface || gate.lane !== lane) continue;
    const half = gate.width / 2 + tolerance;
    if (z >= gate.z - half && z <= gate.z + half) return gate;
  }
  return null;
}

export function otherSurface(surface: FloorSurfaceKind): FloorSurfaceKind {
  return surface === "floor" ? "ceiling" : "floor";
}
