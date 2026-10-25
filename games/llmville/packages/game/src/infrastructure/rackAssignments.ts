import {
  COMPUTE_LANE_VALUES,
  getRackSlotCapacity,
  type ComputeAssignment,
  type ComputeLane,
  type RackInstalledHardwareSlot,
} from "@llmville/game/infrastructure/infrastructure";

export type RackSlotAssignments = (ComputeAssignment | null)[];

export function isComputeLane(value: unknown): value is ComputeLane {
  return typeof value === "string" && (COMPUTE_LANE_VALUES as readonly string[]).includes(value);
}

function parseAssignment(value: unknown): ComputeAssignment | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as { lane?: unknown; targetModelId?: unknown };
  if (!isComputeLane(record.lane)) return null;
  if (record.lane !== "serving") return { lane: record.lane };
  return typeof record.targetModelId === "string"
    ? { lane: "serving", targetModelId: record.targetModelId }
    : null;
}

export function normalizeRackSlotAssignments(value: unknown, rackType: string): RackSlotAssignments {
  const capacity = getRackSlotCapacity(rackType);
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: capacity }, (_, index) => parseAssignment(source[index]));
}

export function rackSlotAssignment(
  assignments: RackSlotAssignments,
  slotIndex: number,
): ComputeAssignment | null {
  return assignments[Math.floor(slotIndex)] ?? null;
}

export type RackSlotAssignmentDecision =
  | { ok: false; reason: string }
  | { ok: true; assignments: RackSlotAssignments };

export function decideRackSlotAssignment(args: {
  installedHardwareModuleIds: readonly RackInstalledHardwareSlot[];
  assignments: RackSlotAssignments;
  slotIndex: number;
  lane: ComputeLane;
  targetModelId?: string;
  targetModelExists?: boolean;
}): RackSlotAssignmentDecision {
  const slotIndex = Math.floor(args.slotIndex);
  if (
    slotIndex < 0 ||
    slotIndex >= args.installedHardwareModuleIds.length ||
    args.installedHardwareModuleIds[slotIndex] == null
  ) {
    return { ok: false, reason: "No GPU in that slot" };
  }
  if (args.lane === "serving") {
    if (!args.targetModelId) return { ok: false, reason: "Pick a model for this serving card" };
    if (args.targetModelExists !== true) return { ok: false, reason: "Model not found" };
  }

  const assignments = [...args.assignments];
  assignments[slotIndex] =
    args.lane === "serving"
      ? { lane: "serving", targetModelId: args.targetModelId }
      : { lane: args.lane };
  return { ok: true, assignments };
}

export function withRackSlotUnassigned(
  assignments: RackSlotAssignments,
  slotIndex: number,
): RackSlotAssignments {
  const next = [...assignments];
  next[Math.floor(slotIndex)] = null;
  return next;
}

export function withRackSlotAssignmentsFollowingHardware(
  assignments: RackSlotAssignments,
  installedHardwareModuleIds: readonly RackInstalledHardwareSlot[],
): RackSlotAssignments {
  return assignments.map((assignment, index) =>
    installedHardwareModuleIds[index] == null ? null : assignment,
  );
}

export function shouldResetScrapingAnchor(lane: ComputeLane, hasScrapingAnchor: boolean): boolean {
  return lane === "scraping" && !hasScrapingAnchor;
}
