import type { Checkpoint } from "@jgengine/core/game/race";
import { yawRight } from "@jgengine/core/movement/steering";
import { seededRng } from "@jgengine/core/random/rng";
import { lerp } from "../shared/vec2";
import { type ZoneId, zoneAt } from "./zones";

export const WORLD_SEED = "tideway-harbor-7";
export const COURSE_RX = 95;
export const COURSE_RZ = 58;
export const GATE_COUNT = 8;
export const LAPS = 2;
export const GATE_HALF: readonly [number, number, number] = [9, 5, 9];
export const TERRAIN_BOUNDS = { w: 420, d: 420 };
export const WATER_LEVEL = 0;
export const ISLET_HEIGHT = 3.2;
export const SKERRY_HEIGHT = 2.6;

function angleDegOf(index: number): number {
  return (index * 360) / GATE_COUNT;
}

function pointOnEllipse(angleDeg: number, rx: number, rz: number): readonly [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [Math.cos(rad) * rx, Math.sin(rad) * rz];
}

export interface Gate {
  id: string;
  index: number;
  label: string;
  angleDeg: number;
  center: readonly [number, number, number];
  zoneId: ZoneId;
}

export const GATES: readonly Gate[] = Array.from({ length: GATE_COUNT }, (_, index) => {
  const angleDeg = angleDegOf(index);
  const [x, z] = pointOnEllipse(angleDeg, COURSE_RX, COURSE_RZ);
  return {
    id: `gate-${index + 1}`,
    index,
    label: `Gate ${index + 1}`,
    angleDeg,
    center: [x, 0.6, z],
    zoneId: zoneAt(x, z),
  };
});

export function checkpointsFromGates(gates: readonly Gate[]): readonly Checkpoint[] {
  return gates.map((gate) => ({ id: gate.id, center: gate.center, half: GATE_HALF }));
}

const START_ANGLE_DEG = angleDegOf(GATE_COUNT - 1) + 360 / GATE_COUNT / 2;
const [START_X, START_Z] = pointOnEllipse(START_ANGLE_DEG, COURSE_RX, COURSE_RZ);
const [FIRST_GATE_X, FIRST_GATE_Z] = pointOnEllipse(angleDegOf(0), COURSE_RX, COURSE_RZ);

export const START_HEADING_RAD = Math.atan2(FIRST_GATE_X - START_X, FIRST_GATE_Z - START_Z);

export interface StartSlot {
  racerId: string;
  x: number;
  z: number;
  headingRad: number;
}

function lateralOffset(headingRad: number, distance: number): readonly [number, number] {
  const [x, z] = yawRight(headingRad);
  return [x * distance, z * distance];
}

const GRID_LANE_OFFSETS: readonly number[] = [0, -1, 1, -2, 2];

export function startingGrid(racerIds: readonly string[]): readonly StartSlot[] {
  return racerIds.map((racerId, index) => {
    const lane = GRID_LANE_OFFSETS[index % GRID_LANE_OFFSETS.length]!;
    const [ox, oz] = lateralOffset(START_HEADING_RAD, lane * 4.2);
    const back = index * 3.4;
    return {
      racerId,
      x: START_X + ox - Math.sin(START_HEADING_RAD) * back,
      z: START_Z + oz - Math.cos(START_HEADING_RAD) * back,
      headingRad: START_HEADING_RAD,
    };
  });
}

export interface IsletMask {
  id: string;
  x: number;
  z: number;
  radius: number;
  height: number;
  falloff: number;
}

function generateIslets(): readonly IsletMask[] {
  const rng = seededRng(`${WORLD_SEED}:islets`);
  const interior: IsletMask[] = Array.from({ length: 12 }, (_, i) => {
    const baseAngle = (i / 12) * 360;
    const angle = baseAngle + (rng() - 0.5) * 24;
    const radius = lerp(16, 40, rng());
    const rad = (angle * Math.PI) / 180;
    const isletRadius = lerp(5, 8, rng());
    return {
      id: `islet-${i}`,
      x: Math.cos(rad) * radius,
      z: Math.sin(rad) * radius,
      radius: isletRadius,
      height: ISLET_HEIGHT,
      falloff: isletRadius * 0.6,
    };
  });
  const skerries: IsletMask[] = Array.from({ length: 6 }, (_, i) => {
    const baseAngle = (i / 6) * 360 + 30;
    const angle = baseAngle + (rng() - 0.5) * 20;
    const radius = lerp(108, 132, rng());
    const rad = (angle * Math.PI) / 180;
    const skerryRadius = lerp(6, 11, rng());
    return {
      id: `skerry-${i}`,
      x: Math.cos(rad) * radius,
      z: Math.sin(rad) * radius,
      radius: skerryRadius,
      height: SKERRY_HEIGHT,
      falloff: skerryRadius * 0.6,
    };
  });
  return [...interior, ...skerries];
}

export const ISLETS: readonly IsletMask[] = generateIslets();

export interface BuildingCluster {
  id: string;
  position: readonly [number, number];
  count: number;
  footprint: { w: number; d: number };
  stories: readonly [number, number];
  landRadius: number;
}

export const BUILDING_CLUSTERS: readonly BuildingCluster[] = [
  { id: "south-harbor", position: [0, -170], count: 10, footprint: { w: 10, d: 8 }, stories: [1, 3], landRadius: 48 },
  { id: "east-hamlet", position: [165, 60], count: 5, footprint: { w: 8, d: 7 }, stories: [1, 2], landRadius: 30 },
];

export const CLUSTER_LAND_HEIGHT = 3.5;

export const BUILDING_CLUSTER_MASKS: readonly IsletMask[] = BUILDING_CLUSTERS.map((cluster) => ({
  id: `${cluster.id}-land`,
  x: cluster.position[0],
  z: cluster.position[1],
  radius: cluster.landRadius,
  height: CLUSTER_LAND_HEIGHT,
  falloff: cluster.landRadius * 0.55,
}));

export type BuoyKind = "gate" | "channel" | "shore";
export type BuoySide = "port" | "starboard" | null;

export interface BuoyPlacement {
  id: string;
  kind: BuoyKind;
  x: number;
  z: number;
  zoneId: ZoneId;
  side: BuoySide;
}

function generateGateBuoys(): readonly BuoyPlacement[] {
  const buoys: BuoyPlacement[] = [];
  for (let i = 0; i < GATES.length; i += 1) {
    const gate = GATES[i]!;
    const nextGate = GATES[(i + 1) % GATES.length]!;
    const dx = nextGate.center[0] - gate.center[0];
    const dz = nextGate.center[2] - gate.center[2];
    const len = Math.hypot(dx, dz) || 1;
    const perpX = -dz / len;
    const perpZ = dx / len;
    const spread = GATE_HALF[0] * 0.85;
    buoys.push({
      id: `${gate.id}-port`,
      kind: "gate",
      x: gate.center[0] + perpX * spread,
      z: gate.center[2] + perpZ * spread,
      zoneId: gate.zoneId,
      side: "port",
    });
    buoys.push({
      id: `${gate.id}-starboard`,
      kind: "gate",
      x: gate.center[0] - perpX * spread,
      z: gate.center[2] - perpZ * spread,
      zoneId: gate.zoneId,
      side: "starboard",
    });
  }
  return buoys;
}

function generateChannelBuoys(): readonly BuoyPlacement[] {
  const rng = seededRng(`${WORLD_SEED}:channel-buoys`);
  const buoys: BuoyPlacement[] = [];
  const zoneAngles: Record<ZoneId, number> = { east: 0, center: 120, west: 240 };
  let n = 0;
  for (const [zoneId, baseAngle] of Object.entries(zoneAngles) as [ZoneId, number][]) {
    for (let i = 0; i < 3; i += 1) {
      const angle = baseAngle + (i - 1) * 22 + (rng() - 0.5) * 8;
      const radius = lerp(70, 80, rng());
      const rad = (angle * Math.PI) / 180;
      buoys.push({
        id: `channel-buoy-${n}`,
        kind: "channel",
        x: Math.cos(rad) * radius,
        z: Math.sin(rad) * radius,
        zoneId,
        side: null,
      });
      n += 1;
    }
  }
  return buoys;
}

function generateShoreBuoys(): readonly BuoyPlacement[] {
  const rng = seededRng(`${WORLD_SEED}:shore-buoys`);
  const buoys: BuoyPlacement[] = [];
  for (const cluster of BUILDING_CLUSTERS) {
    const [cx, cz] = cluster.position;
    const towardOrigin = Math.hypot(cx, cz) < 1e-6 ? [0, 1] : [-cx / Math.hypot(cx, cz), -cz / Math.hypot(cx, cz)];
    const outAngle = Math.atan2(towardOrigin[1]!, towardOrigin[0]!);
    for (let i = 0; i < 3; i += 1) {
      const spread = outAngle + (rng() - 0.5) * 1.1;
      const radius = cluster.landRadius + 14 + rng() * 16;
      const x = cx + Math.cos(spread) * radius;
      const z = cz + Math.sin(spread) * radius;
      buoys.push({
        id: `${cluster.id}-shore-buoy-${i}`,
        kind: "shore",
        x,
        z,
        zoneId: zoneAt(x, z),
        side: null,
      });
    }
  }
  return buoys;
}

export const BUOYS: readonly BuoyPlacement[] = [
  ...generateGateBuoys(),
  ...generateChannelBuoys(),
  ...generateShoreBuoys(),
];

export type ShorePropKind = "piling" | "crate" | "lamp" | "net" | "barrel";
const SHORE_PROP_KINDS: readonly ShorePropKind[] = ["piling", "crate", "lamp", "net", "barrel"];

export interface ShorePropPlacement {
  id: string;
  kind: ShorePropKind;
  x: number;
  z: number;
  rotationY: number;
}

function generateShoreProps(): readonly ShorePropPlacement[] {
  const rng = seededRng(`${WORLD_SEED}:shore-props`);
  const props: ShorePropPlacement[] = [];
  let n = 0;
  for (const cluster of BUILDING_CLUSTERS) {
    const count = cluster.id === "south-harbor" ? 16 : 8;
    const [cx, cz] = cluster.position;
    const maxRadius = cluster.landRadius * 0.82;
    for (let i = 0; i < count; i += 1) {
      const kind = SHORE_PROP_KINDS[n % SHORE_PROP_KINDS.length]!;
      const angle = rng() * Math.PI * 2;
      const radius = lerp(maxRadius * 0.35, maxRadius, rng());
      const x = cx + Math.cos(angle) * radius;
      const z = cz + Math.sin(angle) * radius;
      props.push({ id: `${cluster.id}-prop-${i}`, kind, x, z, rotationY: rng() * Math.PI * 2 });
      n += 1;
    }
  }
  return props;
}

export const SHORE_PROPS: readonly ShorePropPlacement[] = generateShoreProps();
