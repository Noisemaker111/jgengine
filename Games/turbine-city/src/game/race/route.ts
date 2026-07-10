import type { Checkpoint } from "@jgengine/core/game/race";
import type { FanSchedule } from "../flight/fanSchedule";
import type { FlowTube, Vec3 } from "../flight/flowTube";

export interface RouteNode {
  readonly id: string;
  readonly position: Vec3;
}

const A0: RouteNode = { id: "A0", position: [0, 20, 0] };
const A1: RouteNode = { id: "A1", position: [55, 24, -60] };
const A2: RouteNode = { id: "A2", position: [15, 28, -130] };
const A3: RouteNode = { id: "A3", position: [-40, 24, -190] };

const B0: RouteNode = { id: "B0", position: [-90, 20, -150] };
const B1: RouteNode = { id: "B1", position: [-160, 26, -90] };
const B2: RouteNode = { id: "B2", position: [-190, 30, -10] };
const B3: RouteNode = { id: "B3", position: [-150, 24, 60] };

const C1: RouteNode = { id: "C1", position: [-90, 32, 140] };
const C2: RouteNode = { id: "C2", position: [20, 26, 130] };

const R10: RouteNode = { id: "R10", position: [90, 22, 40] };

export const ROUTE_NODES = { A0, A1, A2, A3, B0, B1, B2, B3, C1, C2, R10 } as const;

export const TUBE_RADIUS = 11;
export const TUBE_CORE_RADIUS = 4.5;
export const CANYON_BASE_SPEED = 32;
export const CONNECTOR_BASE_SPEED = 12;
export const OPEN_SKY_BASE_SPEED = 9;

export interface FanDef extends FanSchedule {
  readonly canyon: "A" | "B" | "C";
}

const CYCLE_RAMP = 3;
const CYCLE_ON = 16;
const CYCLE_OFF = 8;

function fan(id: string, canyon: "A" | "B" | "C", phaseOffset: number, reverses: boolean): FanDef {
  return { id, canyon, rampSec: CYCLE_RAMP, onSec: CYCLE_ON, offSec: CYCLE_OFF, phaseOffset, reverses };
}

export const FANS: readonly FanDef[] = [
  fan("fan-a1", "A", 0, false),
  fan("fan-a2", "A", 4, true),
  fan("fan-a3", "A", 8, false),
  fan("fan-b1", "B", 12, false),
  fan("fan-b2", "B", 16, true),
  fan("fan-b3", "B", 20, false),
  fan("fan-c1", "C", 24, true),
  fan("fan-c2", "C", 27, false),
];

export function fanById(id: string): FanDef {
  const found = FANS.find((f) => f.id === id);
  if (found === undefined) throw new Error(`fanById: unknown fan "${id}"`);
  return found;
}

function tube(id: string, fanId: string | null, from: RouteNode, to: RouteNode, baseSpeed: number, radius = TUBE_RADIUS, coreRadius = TUBE_CORE_RADIUS): FlowTube {
  return { id, fanId, from: from.position, to: to.position, radius, coreRadius, baseSpeed };
}

export const FLOW_TUBES: readonly FlowTube[] = [
  tube("tube-a0-a1", "fan-a1", A0, A1, CANYON_BASE_SPEED),
  tube("tube-a1-a2", "fan-a2", A1, A2, CANYON_BASE_SPEED),
  tube("tube-a2-a3", "fan-a3", A2, A3, CANYON_BASE_SPEED),
  tube("tube-a3-b0", null, A3, B0, CONNECTOR_BASE_SPEED),
  tube("tube-b0-b1", "fan-b1", B0, B1, CANYON_BASE_SPEED),
  tube("tube-b1-b2", "fan-b2", B1, B2, CANYON_BASE_SPEED),
  tube("tube-b2-b3", "fan-b3", B2, B3, CANYON_BASE_SPEED),
  tube("tube-b3-c1", "fan-c1", B3, C1, CANYON_BASE_SPEED),
  tube("tube-c1-c2", "fan-c2", C1, C2, CANYON_BASE_SPEED),
  tube("tube-b3-c2-connector", null, B3, C2, CONNECTOR_BASE_SPEED, TUBE_RADIUS * 0.85, TUBE_CORE_RADIUS * 0.85),
  tube("tube-c2-r10", null, C2, R10, OPEN_SKY_BASE_SPEED, TUBE_RADIUS * 1.3, TUBE_CORE_RADIUS * 1.3),
  tube("tube-r10-a0", null, R10, A0, OPEN_SKY_BASE_SPEED, TUBE_RADIUS * 1.3, TUBE_CORE_RADIUS * 1.3),
];

export const RING_HALF: Vec3 = [14, 12, 14];

export const RING_NODES: readonly RouteNode[] = [A0, A1, A2, A3, B0, B1, B2, B3, C2, R10];

export const CHECKPOINTS: readonly Checkpoint[] = RING_NODES.map((node, i) => ({
  id: `ring-${i + 1}`,
  center: node.position,
  half: RING_HALF,
}));

export const RING_COUNT = CHECKPOINTS.length;
export const LAPS = 2;

export const SPAWN_POSITION: Vec3 = A0.position;
export const SPAWN_HEADING = Math.atan2(A1.position[0] - A0.position[0], A1.position[2] - A0.position[2]);

export const CANYON_C_FAN_IDS: readonly string[] = ["fan-c1", "fan-c2"];

export const LOOP_VIA_CANYON: readonly RouteNode[] = [A0, A1, A2, A3, B0, B1, B2, B3, C1, C2, R10];
export const LOOP_VIA_CONNECTOR: readonly RouteNode[] = [A0, A1, A2, A3, B0, B1, B2, B3, C2, R10];
