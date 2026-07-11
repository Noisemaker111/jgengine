import { composeMassing, type MassingBody, type MassingSpec } from "@jgengine/core/world/massing";

import { CELL, HALF, lots, type Building, type CitySignals, type Plaza, type Program } from "../catalog";

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function massingSpecOf(b: Building): MassingSpec {
  return {
    seed: b.id,
    width: b.width,
    height: b.height,
    depth: b.depth,
    floorHeight: b.floorHeight,
    baySpacing: b.baySpacing,
    pilotis: b.pilotis,
    podiumHeight: b.podiumHeight,
    cores: b.cores,
    terraces: b.terraces,
    cantilever: b.cantilever,
    voids: b.voids,
    taper: b.taper,
    articulation: b.articulation,
    crown: b.crown,
    moduleDensity: b.moduleDensity,
    branches: b.branches,
    composition: b.composition,
    profile: b.profile,
  };
}

export function buildingBodies(b: Building): MassingBody[] {
  return composeMassing(massingSpecOf(b));
}

export function occupiedLotKeys(buildings: readonly Building[], plazas: readonly Plaza[]): Set<string> {
  const keys = new Set(plazas.map((p) => `${Math.round(p.x / CELL)},${Math.round(p.z / CELL)}`));
  for (const b of buildings) {
    const a = (b.rotation * Math.PI) / 180;
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    const halfX = (c * b.width + s * b.depth) / 2 + 5;
    const halfZ = (s * b.width + c * b.depth) / 2 + 5;
    for (const lot of lots) if (Math.abs(lot.x - b.x) <= halfX && Math.abs(lot.z - b.z) <= halfZ) keys.add(`${lot.gx},${lot.gz}`);
  }
  return keys;
}

export function lotAt(x: number, z: number): { gx: number; gz: number; x: number; z: number } | null {
  const gx = Math.round(x / CELL) + 0;
  const gz = Math.round(z / CELL) + 0;
  if (Math.abs(gx) > HALF || Math.abs(gz) > HALF) return null;
  return { gx, gz, x: gx * CELL, z: gz * CELL };
}

const smoothstep = (value: number, edge0: number, edge1: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export interface SolarState {
  direction: readonly [number, number, number];
  elevation: number;
  daylight: number;
  night: boolean;
}

export function solarModel(hour: number): SolarState {
  const phase = ((hour - 6.5) / (19.5 - 6.5)) * Math.PI;
  const elevation = Math.sin(phase);
  const x = Math.cos(phase) * 0.82;
  const z = -0.52;
  const length = Math.sqrt(x * x + elevation * elevation + z * z);
  const daylight = smoothstep(elevation, -0.1, 0.12);
  return {
    direction: [x / length, elevation / length, z / length],
    elevation,
    daylight,
    night: daylight < 0.2,
  };
}

export const NEUTRAL_SIGNALS: CitySignals = {
  activity: 42,
  nightAccess: "neutral",
  sharedRooms: false,
  specialistGrowth: false,
  reuse: false,
  formal: false,
};

const SHARED_ROOM_PROGRAMS: readonly Program[] = ["housing", "mixed", "civic"];

export function programOccupancy(b: Building, hour: number, signals: CitySignals): number {
  const h = (hour + 24) % 24;
  let use =
    b.program === "housing"
      ? h >= 18 || h < 7
        ? 0.86
        : 0.44
      : b.program === "work"
        ? h >= 7 && h < 19
          ? 0.92
          : 0.12
        : b.program === "civic"
          ? h >= 8 && h < 20
            ? 0.76
            : 0.15
          : b.program === "culture"
            ? h >= 14 && h < 23
              ? 0.9
              : h >= 10
                ? 0.34
                : 0.1
            : h >= 7 && h < 23
              ? 0.72
              : 0.42;
  if (signals.sharedRooms && SHARED_ROOM_PROGRAMS.includes(b.program)) use += 0.08;
  if (h >= 21 || h < 6) use *= signals.nightAccess === "open" ? 1.18 : signals.nightAccess === "quiet" ? 0.62 : 0.78;
  return clamp(use * (0.54 + signals.activity * 0.0046), 0.04, 1);
}

export function livedWeathering(b: Building): number {
  return Math.min(100, b.weathering + (100 - b.condition) * 0.55 + Math.min(160, b.age) * 0.12);
}
