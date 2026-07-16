import type { BuildingStyle } from "@jgengine/core/world/buildings";

import { volumesOfKind } from "../../editorLayers";
import { EXIT_Z } from "../run/constants";

export type ZoneId = "canyons" | "flats" | "gantry";

export interface ZoneDef {
  id: ZoneId;
  label: string;
  radioName: string;
  start: number;
  end: number;
  wallColor: string;
  propIds: readonly [string, string];
  buildingStyle: BuildingStyle;
}

export const ZONES: readonly ZoneDef[] = volumesOfKind("zone").map((volume) => {
  const meta = volume.meta ?? {};
  const halfZ = volume.halfExtents?.z ?? 0;
  return {
    id: meta["zoneId"] as ZoneId,
    label: meta["label"] as string,
    radioName: meta["radioName"] as string,
    start: volume.center.z - halfZ,
    end: volume.center.z + halfZ,
    wallColor: meta["wallColor"] as string,
    propIds: meta["propIds"] as readonly [string, string],
    buildingStyle: meta["buildingStyle"] as BuildingStyle,
  };
});

export function zoneAt(z: number): ZoneDef {
  for (const zone of ZONES) if (z < zone.end) return zone;
  return ZONES[ZONES.length - 1]!;
}

export function zoneProgress(z: number): number {
  return Math.min(1, Math.max(0, z / EXIT_Z));
}
