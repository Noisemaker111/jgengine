import { markersInGroup } from "../../editorLayers";
import type { KartTuning } from "../parts/build";
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

export const ROUTE_GATES: readonly RouteGate[] = markersInGroup("gate").map((marker) => {
  const meta = marker.meta ?? {};
  return {
    id: marker.id,
    zoneId: meta["zoneId"] as ZoneId,
    requirement: meta["requirement"] as GateRequirement,
    laneX: [meta["laneMinX"] as number, meta["laneMaxX"] as number] as const,
    atZ: marker.position.z,
    label: meta["label"] as string,
    radioLine: meta["radioLine"] as string,
  };
});

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
