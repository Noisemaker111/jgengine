import type { KartTuning } from "../parts/build";
import { LEFT_LANE_X, RIGHT_LANE_X } from "../run/constants";
import type { ZoneId } from "../zones/catalog";

export type GateRequirement = "plow" | "jump";

export interface RouteGate {
  id: string;
  zoneId: ZoneId;
  requirement: GateRequirement;
  laneX: readonly [number, number];
  atZ: number;
  label: string;
  radioLine: string;
}

export const ROUTE_GATES: readonly RouteGate[] = [
  {
    id: "gate_canyon_plow",
    zoneId: "canyons",
    requirement: "plow",
    laneX: LEFT_LANE_X,
    atZ: 60,
    label: "CRUSHED-CAR WALL",
    radioLine: "PLOWED THE CAR WALL — SHE'S UGLY BUT SHE'S FAST",
  },
  {
    id: "gate_canyon_jump",
    zoneId: "canyons",
    requirement: "jump",
    laneX: RIGHT_LANE_X,
    atZ: 95,
    label: "TIRE-STACK RAMP",
    radioLine: "CLEARED THE TIRE STACK — NICE AIR",
  },
  {
    id: "gate_flats_plow_1",
    zoneId: "flats",
    requirement: "plow",
    laneX: LEFT_LANE_X,
    atZ: 190,
    label: "FRIDGE BLOCKADE",
    radioLine: "FRIDGE BLOCKADE DOWN — KEEP ROLLING",
  },
  {
    id: "gate_flats_jump",
    zoneId: "flats",
    requirement: "jump",
    laneX: RIGHT_LANE_X,
    atZ: 230,
    label: "WASHER-PILE RAMP",
    radioLine: "OVER THE WASHER PILE — LOOKED GOOD FROM HERE",
  },
  {
    id: "gate_flats_plow_2",
    zoneId: "flats",
    requirement: "plow",
    laneX: LEFT_LANE_X,
    atZ: 265,
    label: "STOVE-STACK LINE",
    radioLine: "STOVE STACK SCATTERED — DON'T LOOK BACK",
  },
  {
    id: "gate_gantry_jump_1",
    zoneId: "gantry",
    requirement: "jump",
    laneX: RIGHT_LANE_X,
    atZ: 340,
    label: "CONTAINER GAP",
    radioLine: "CONTAINER GAP CLEARED — BIG AIR",
  },
  {
    id: "gate_gantry_plow",
    zoneId: "gantry",
    requirement: "plow",
    laneX: LEFT_LANE_X,
    atZ: 390,
    label: "CRANE DEBRIS FIELD",
    radioLine: "PLOWED THE CRANE DEBRIS — ALMOST HOME",
  },
  {
    id: "gate_gantry_jump_2",
    zoneId: "gantry",
    requirement: "jump",
    laneX: RIGHT_LANE_X,
    atZ: 430,
    label: "FINAL GANTRY LEAP",
    radioLine: "FINAL GANTRY LEAP — SEE YOU AT THE GATE",
  },
];

export function gateSatisfied(gate: RouteGate, tuning: KartTuning): boolean {
  return gate.requirement === "plow" ? tuning.hasPlow : tuning.jumpPower > 0;
}

export function inLane(x: number, laneX: readonly [number, number]): boolean {
  return x >= laneX[0] && x <= laneX[1];
}

export function blockedZ(x: number, currentZ: number, candidateZ: number, tuning: KartTuning): number {
  let maxZ = candidateZ;
  for (const gate of ROUTE_GATES) {
    if (!inLane(x, gate.laneX)) continue;
    if (currentZ > gate.atZ) continue;
    if (gateSatisfied(gate, tuning)) continue;
    if (candidateZ > gate.atZ) maxZ = Math.min(maxZ, gate.atZ);
  }
  return maxZ;
}

export function gatesInZone(zoneId: ZoneId): readonly RouteGate[] {
  return ROUTE_GATES.filter((gate) => gate.zoneId === zoneId);
}
