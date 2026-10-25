import { getHardwareDefinition, type HardwareModelId } from "@llmville/game/infrastructure/catalog";
import {
  assignmentKey,
  normalizeRackInstalledHardwareSlots,
  type ComputeAssignmentMap,
} from "@llmville/game/infrastructure/infrastructure";

import type { PlacedRack } from "./infrastructure";

interface RackLikeForComputeUnits {
  readonly rackId: string;
  readonly rackCreationTime: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly rackType: string;
  readonly installedHardwareModuleIds?: readonly (string | null)[];
}

export interface ListedComputeUnit {
  rackId: string;
  slotIndex: number;
  hardwareModelId: HardwareModelId;
  tflops: number;
  tdpWatts: number;
  vramGb: number;
}

/** Canonical listing: stable sort by creation time, position, then rack id. */
export function listComputeUnitsFromRacks(
  racks: readonly RackLikeForComputeUnits[],
): ListedComputeUnit[] {
  const ordered = [...racks].sort((a, b) => {
    if (a.rackCreationTime !== b.rackCreationTime) return a.rackCreationTime - b.rackCreationTime;
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    if (a.position.z !== b.position.z) return a.position.z - b.position.z;
    return a.rackId.localeCompare(b.rackId);
  });

  const units: ListedComputeUnit[] = [];
  for (const rack of ordered) {
    const slots = normalizeRackInstalledHardwareSlots(rack.installedHardwareModuleIds ?? [], rack.rackType);
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const id = slots[slotIndex];
      if (id === null) continue;
      const def = getHardwareDefinition(id);
      units.push({
        rackId: rack.rackId,
        slotIndex,
        hardwareModelId: id,
        tflops: def.trainingPowerFp16,
        tdpWatts: def.tdpWatts,
        vramGb: def.vramGb,
      });
    }
  }
  return units;
}

interface ClientComputeUnit {
  rackId: PlacedRack["id"];
  slotIndex: number;
  hardwareModelId: HardwareModelId;
  tflops: number;
}

export function listClientComputeUnits(racks: readonly PlacedRack[]): ClientComputeUnit[] {
  return listComputeUnitsFromRacks(
    racks.map((r) => ({
      rackId: r.id,
      rackCreationTime: r.createdAt,
      position: { x: r.x, y: r.y, z: r.z },
      rackType: r.rackType,
      installedHardwareModuleIds: r.installedHardwareModuleIds,
    })),
  ).map((u) => ({
    rackId: u.rackId,
    slotIndex: u.slotIndex,
    hardwareModelId: u.hardwareModelId,
    tflops: u.tflops,
  }));
}

export type GpuSlotWorkload = "idle" | "training" | "scraping" | "serving";

export const GPU_SPLOT_WORKLOAD = {
  idle: "idle",
  training: "training",
  scraping: "scraping",
  serving: "serving",
} as const satisfies Record<string, GpuSlotWorkload>;

/** Each installed slot's workload is exactly its per-card dedication lane (undedicated → idle). */
export function buildRackSlotGpuWorkloadMap(options: {
  racks: readonly PlacedRack[];
  computeAssignments?: ComputeAssignmentMap | null;
  isTraining?: boolean;
}): Map<string, GpuSlotWorkload> {
  const units = listClientComputeUnits(options.racks);
  const assignments = options.computeAssignments ?? {};
  const map = new Map<string, GpuSlotWorkload>();

  for (const unit of units) {
    const rackId = unit.rackId;
    const assignment = assignments[assignmentKey(rackId, unit.slotIndex)];
    map.set(
      assignmentKey(rackId, unit.slotIndex),
      assignment && !(assignment.lane === "training" && options.isTraining === false) ? assignment.lane : GPU_SPLOT_WORKLOAD.idle,
    );
  }

  return map;
}

export function workloadForRackSlot(
  map: ReadonlyMap<string, GpuSlotWorkload> | undefined,
  rackId: string,
  slotIndex: number,
  hardwareId: HardwareModelId | null | undefined,
): GpuSlotWorkload {
  if (!hardwareId) return GPU_SPLOT_WORKLOAD.idle;
  return map?.get(assignmentKey(rackId, slotIndex)) ?? GPU_SPLOT_WORKLOAD.idle;
}
