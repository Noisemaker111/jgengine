/**
 * Rack hardware — slot capacity, installed-module shape, warehouse-stock ↔ rack-slot moves,
 * and rack-menu drag-drop resolution. Shared by web UI and Convex mutations.
 */

import {
  INFRASTRUCTURE_BUILD_ITEM_ID_VALUES,
  getBuildItem,
  type InfrastructureBuildItemId,
} from "@llmville/game/build/catalog";
import {
  HARDWARE_CATALOG,
  coolerFitsRack,
  getHardwareDefinition,
  getHardwareMemoryBandwidthGbps,
  getRackCatalogDefinition,
  getRackCatalogSlotCapacity,
  getRackCoolingUnitDefinition,
  isRackCoolingUnitId,
  normalizeRackCoolingInventory,
  parseHardwareModelId,
  resolveRackCatalogId,
  type ComputePrecision,
  type HardwareModelId,
  type RackCoolingInventory,
  type RackCoolingUnitId,
} from "@llmville/game/infrastructure/catalog";
import {
  moveItem,
  type InventoryLayout,
  type InventorySlot,
  type InventoryState,
  type ItemTraits,
} from "@jgengine/core/inventory/inventoryModel";

export function isRackType(value: string): value is InfrastructureBuildItemId {
  return INFRASTRUCTURE_BUILD_ITEM_ID_VALUES.includes(value as InfrastructureBuildItemId);
}

export function parseRackType(value: string): InfrastructureBuildItemId {
  if (isRackType(value)) return value;
  const resolved = resolveRackCatalogId(value);
  if (resolved && isRackType(resolved)) return resolved;
  return "starter_rack";
}

export function getRackSlotCapacity(type: string): number {
  return getRackCatalogSlotCapacity(parseRackType(type));
}

export type RackInstalledHardwareSlot = HardwareModelId | null;

export function normalizeRackInstalledHardwareSlots(
  installed: readonly (string | null)[],
  rackType: string,
): RackInstalledHardwareSlot[] {
  const slotCapacity = getRackSlotCapacity(rackType);
  const normalized = installed
    .slice(0, slotCapacity)
    .map((value) => (value === null ? null : parseHardwareModelId(value)));

  while (normalized.length < slotCapacity) {
    normalized.push(null);
  }

  return normalized;
}

export function createEmptyRackSlots(rackType: string): RackInstalledHardwareSlot[] {
  return Array.from({ length: getRackSlotCapacity(rackType) }, () => null);
}

export function getRackInstalledHardwareSlots(rack: {
  rackType: string;
  installedHardwareModuleIds?: readonly (string | null)[];
}): RackInstalledHardwareSlot[] {
  return normalizeRackInstalledHardwareSlots(
    rack.installedHardwareModuleIds ?? [],
    rack.rackType,
  );
}

export function getRackInstalledHardware(rack: {
  rackType: string;
  installedHardwareModuleIds?: readonly (string | null)[];
}): HardwareModelId[] {
  return getRackInstalledHardwareSlots(rack)
    .filter((value): value is HardwareModelId => value !== null);
}

const RACK_HARDWARE_TRAITS: ItemTraits = {
  stackLimit: () => 1,
};

function rackHardwareLayout(rackType: string): InventoryLayout {
  return { slots: getRackSlotCapacity(rackType) };
}

export function rackSlotsToInventory(slots: readonly RackInstalledHardwareSlot[]): InventoryState {
  return {
    slots: slots.map((hardwareModelId) =>
      hardwareModelId === null ? null : { itemId: hardwareModelId, count: 1 },
    ),
  };
}

export function inventoryToRackSlots(state: InventoryState): RackInstalledHardwareSlot[] {
  return state.slots.map((slot) => (slot === null ? null : (slot.itemId as HardwareModelId)));
}

export type RackHardwareSource =
  | { kind: "stock"; hardwareId: string }
  | { kind: "slot"; slot: number };

export type RackHardwareTarget =
  | { kind: "stock" }
  | { kind: "slot"; slot?: number };

export interface RackHardwareState {
  rackType: string;
  installed: readonly (string | null)[];
  stock: HardwareInventory;
}

export type RackHardwareMoveError =
  | "unknown_hardware"
  | "no_stock"
  | "rack_full"
  | "invalid_slot"
  | "slot_empty"
  | "slot_occupied";

export type RackHardwareMoveOutcome =
  | { ok: true; nextInstalled: RackInstalledHardwareSlot[]; nextStock: HardwareInventory }
  | { ok: false; reason: RackHardwareMoveError };

function stockToInventory(stock: HardwareInventory): InventoryState {
  const slots: InventorySlot[] = [];
  for (const hardware of HARDWARE_CATALOG) {
    const count = stock[hardware.id] ?? 0;
    for (let unit = 0; unit < count; unit++) slots.push({ itemId: hardware.id, count: 1 });
  }
  slots.push(null);
  return { slots };
}

function inventoryToStock(state: InventoryState): HardwareInventory {
  const stock = { ...DEFAULT_HARDWARE_INVENTORY };
  for (const slot of state.slots) {
    if (slot === null) continue;
    const id = parseHardwareModelId(slot.itemId);
    if (id !== null) stock[id] += slot.count;
  }
  return stock;
}

export function moveRackHardware(
  state: RackHardwareState,
  from: RackHardwareSource,
  to: RackHardwareTarget,
): RackHardwareMoveOutcome {
  const rackInventory = rackSlotsToInventory(
    normalizeRackInstalledHardwareSlots(state.installed, state.rackType),
  );
  const rackLayout = rackHardwareLayout(state.rackType);
  const stockInventory = stockToInventory(normalizeHardwareInventory(state.stock));
  const stockLayout: InventoryLayout = { slots: stockInventory.slots.length };

  let sourceSlot: number;
  let sourceInventory: InventoryState;
  if (from.kind === "stock") {
    const hardwareId = parseHardwareModelId(from.hardwareId);
    if (hardwareId === null) return { ok: false, reason: "unknown_hardware" };
    sourceSlot = stockInventory.slots.findIndex(
      (slot) => slot !== null && slot.itemId === hardwareId,
    );
    if (sourceSlot === -1) return { ok: false, reason: "no_stock" };
    sourceInventory = stockInventory;
  } else {
    sourceSlot = Math.floor(from.slot);
    sourceInventory = rackInventory;
  }

  const destination =
    to.kind === "stock"
      ? { inventory: stockInventory, layout: stockLayout, slot: undefined }
      : {
          inventory: rackInventory,
          layout: rackLayout,
          slot: to.slot === undefined ? undefined : Math.floor(to.slot),
        };

  const moved = moveItem(
    sourceInventory,
    sourceSlot,
    destination.inventory,
    destination.layout,
    RACK_HARDWARE_TRAITS,
    destination.slot,
  );
  if (moved.status === "rejected") {
    const reason: RackHardwareMoveError =
      moved.reason === "empty-slot"
        ? "slot_empty"
        : moved.reason === "no-space"
          ? destination.slot === undefined
            ? "rack_full"
            : "slot_occupied"
          : "invalid_slot";
    return { ok: false, reason };
  }

  const nextRack = from.kind === "slot" ? moved.from : to.kind === "slot" ? moved.to : rackInventory;
  const nextStock = from.kind === "stock" ? moved.from : to.kind === "stock" ? moved.to : stockInventory;
  return {
    ok: true,
    nextInstalled: inventoryToRackSlots(nextRack),
    nextStock: inventoryToStock(nextStock),
  };
}

/**
 * Chunk iteration order is not placement order, so the tutorial bench anchors on the oldest rack with
 * the instance id as tie-break — the same rack on every client, every load.
 */
export function tutorialBenchPosition(
  racks: readonly { id: string; createdAt: number; x: number; z: number }[],
): { x: number; z: number } | null {
  let anchor: { id: string; createdAt: number; x: number; z: number } | null = null;
  for (const rack of racks) {
    if (
      anchor === null ||
      rack.createdAt < anchor.createdAt ||
      (rack.createdAt === anchor.createdAt && rack.id < anchor.id)
    ) {
      anchor = rack;
    }
  }
  return anchor === null ? null : { x: anchor.x, z: anchor.z };
}

// --- Rack menu drag-drop -----------------------------------------------------

export function hardwareModelIdsWithPositiveStock(
  hardwareInventory: Record<string, number>,
): HardwareModelId[] {
  return Object.entries(hardwareInventory)
    .filter(([, count]) => count > 0)
    .map(([id]) => parseHardwareModelId(id))
    .filter((hardwareModelId): hardwareModelId is HardwareModelId => hardwareModelId !== null);
}

export interface RackHardwareDragEndpoints {
  from: { kind: "stock"; hardwareId: HardwareModelId } | { kind: "slot"; slot: number };
  to: RackHardwareTarget;
}

/** Map a rack-menu drag (`inventory`/`slot` source, `uninstall`/`slot-N` target) to move endpoints. */
export function rackHardwareDropEndpoints(params: {
  overId: string;
  dragType: "inventory" | "slot";
  hardwareModelId: HardwareModelId;
  sourceSlotIndex?: number;
}): RackHardwareDragEndpoints | null {
  const from: RackHardwareDragEndpoints["from"] | null =
    params.dragType === "inventory"
      ? { kind: "stock", hardwareId: params.hardwareModelId }
      : params.sourceSlotIndex === undefined
        ? null
        : { kind: "slot", slot: params.sourceSlotIndex };
  if (from === null) return null;

  if (params.overId === "uninstall") {
    return from.kind === "slot" ? { from, to: { kind: "stock" } } : null;
  }

  const slotMatch = /^slot-(\d+)$/.exec(params.overId);
  if (!slotMatch) return null;
  const slot = Number.parseInt(slotMatch[1]!, 10);
  if (from.kind === "slot" && from.slot === slot) return null;
  return { from, to: { kind: "slot", slot } };
}


/** Fraction of TDP emitted as heat when idle (no active training/serving). */
export const THERMAL_IDLE_ACTIVITY = 0.25;
export const THERMAL_AMBIENT_TEMP_C = 22;
export const THERMAL_MAX_TEMP_C = 100;
export const THERMAL_TEMP_CURVE_K = 1.35;

const THERMAL_THROTTLE_GRACE = 1.08;

export type ThermalStatus = "cool" | "optimal" | "warm" | "hot" | "critical";

export interface ThermalState {
  heatLoadKw: number;
  coolingCapacityKw: number;
  /** heatLoad / capacity; > 1 means under-cooled. */
  utilization: number;
  /** Multiplier applied to usable compute when under-cooled (<= 1; 1 = no throttle). */
  throttleFactor: number;
  temperatureC: number;
}

export function computeThermalState(heatLoadKw: number, coolingCapacityKw: number): ThermalState {
  const capacity = Math.max(0, coolingCapacityKw);
  const utilization = capacity <= 0 ? (heatLoadKw > 0 ? Infinity : 0) : heatLoadKw / capacity;
  const graceCapacity = capacity * THERMAL_THROTTLE_GRACE;
  const throttleFactor =
    heatLoadKw <= graceCapacity ? 1 : graceCapacity <= 0 ? 0 : graceCapacity / heatLoadKw;
  const span = THERMAL_MAX_TEMP_C - THERMAL_AMBIENT_TEMP_C;
  const temperatureC =
    heatLoadKw <= 0
      ? THERMAL_AMBIENT_TEMP_C
      : !Number.isFinite(utilization)
        ? THERMAL_MAX_TEMP_C
        : Math.min(
            THERMAL_MAX_TEMP_C,
            THERMAL_AMBIENT_TEMP_C + span * (1 - Math.exp(-THERMAL_TEMP_CURVE_K * utilization)),
          );
  return { heatLoadKw, coolingCapacityKw: capacity, utilization, throttleFactor, temperatureC };
}

/** Electrical service capacity (kW) the lab can draw, indexed by purchased grid-hookup level. */
export const GRID_HOOKUP_CAPACITY_KW = [1.5, 5, 20, 100, 600] as const;
export const BASE_POWER_CAPACITY_KW = GRID_HOOKUP_CAPACITY_KW[0];

export function gridHookupCapacityKw(level: number): number {
  const clamped = Math.max(0, Math.min(GRID_HOOKUP_CAPACITY_KW.length - 1, Math.round(level)));
  return GRID_HOOKUP_CAPACITY_KW[clamped] ?? BASE_POWER_CAPACITY_KW;
}

/** Breaker throttle: 1 within the service limit, else capacity/draw. */
export function computePowerThrottle(drawKw: number, capacityKw: number): number {
  if (capacityKw <= 0) return drawKw > 0 ? 0 : 1;
  return drawKw <= capacityKw ? 1 : capacityKw / drawKw;
}

export function isOverCapacity(loadKw: number, capacityKw: number): boolean {
  return loadKw > capacityKw;
}


export type HardwareInventory = Record<HardwareModelId, number>;

export const DEFAULT_HARDWARE_INVENTORY = Object.fromEntries(
  HARDWARE_CATALOG.map((hardware) => [hardware.id, 0]),
) as HardwareInventory;

export function normalizeHardwareInventory(inv?: Partial<HardwareInventory> | unknown): HardwareInventory {
  if (typeof inv !== "object" || inv === null) {
    return { ...DEFAULT_HARDWARE_INVENTORY };
  }

  const normalized = { ...DEFAULT_HARDWARE_INVENTORY };
  for (const hardware of HARDWARE_CATALOG) {
    const count = (inv as Partial<HardwareInventory>)[hardware.id];
    if (typeof count === "number" && Number.isFinite(count)) {
      normalized[hardware.id] = Math.max(0, Math.floor(count));
    }
  }
  return normalized;
}

export function getHardwareInventoryCount(inv: HardwareInventory, id: HardwareModelId): number {
  return inv[id] ?? 0;
}

export function setHardwareInventoryCount(
  inv: HardwareInventory,
  id: HardwareModelId,
  count: number,
): HardwareInventory {
  return { ...inv, [id]: Math.max(0, Math.floor(count)) };
}

/** Rack runtime state values stored on rack documents. */
export const RACK_STATE_VALUES = ["idle", "training"] as const;


export interface RackHardwareDoc {
  rackType: string;
  installedHardwareModuleIds?: readonly (string | null)[];
}

export interface RackHardwareStats {
  rackCount: number;
  totalInstalledHardwareModules: number;
  totalInstalledGpus: number;
  totalTrainingPowerFp16: number;
  totalVramGb: number;
  totalMemoryBandwidthGbps: number;
  totalPowerDrawWatts: number;
  stabilityBonus: number;
}

function getRackStabilityBonus(type: InfrastructureBuildItemId): number {
  return getBuildItem(type).passiveBoost ?? 0;
}

export function computeRackHardwareStats(racks: readonly RackHardwareDoc[]): RackHardwareStats {
  const stats: RackHardwareStats = {
    rackCount: racks.length,
    totalInstalledHardwareModules: 0,
    totalInstalledGpus: 0,
    totalTrainingPowerFp16: 0,
    totalVramGb: 0,
    totalMemoryBandwidthGbps: 0,
    totalPowerDrawWatts: 0,
    stabilityBonus: 0,
  };
  for (const rack of racks) {
    const type = parseRackType(rack.rackType);
    stats.stabilityBonus += getRackStabilityBonus(type);
    const hardware = getRackInstalledHardware(rack).map(getHardwareDefinition);
    stats.totalInstalledHardwareModules += hardware.length;
    stats.totalInstalledGpus += hardware.length;
    for (const module of hardware) {
      stats.totalTrainingPowerFp16 += module.trainingPowerFp16;
      stats.totalVramGb += module.vramGb;
      stats.totalMemoryBandwidthGbps += getHardwareMemoryBandwidthGbps(module);
      stats.totalPowerDrawWatts += module.tdpWatts;
    }
  }
  return stats;
}

export function installedSupportsPrecision(
  racks: readonly RackHardwareDoc[],
  precision: ComputePrecision,
): boolean {
  if (precision === "fp16") return true;
  for (const rack of racks) {
    for (const id of getRackInstalledHardware(rack)) {
      if (getHardwareDefinition(id).supportedPrecisions.includes(precision)) return true;
    }
  }
  return false;
}

/**
 * Per-card compute dedication. Each installed GPU slot (`rackId:slotIndex`) is assigned to exactly one
 * lane — training, scraping, or serving — and serving cards additionally bind to a specific model. This
 * replaces the old aggregate training/scraping/serving *ratio* split: instead of pooling all TFLOPs and
 * slicing by a fraction, each physical card contributes its full stats to the one job it is dedicated to.
 */

export const COMPUTE_LANE_VALUES = ["training", "scraping", "serving"] as const;
export type ComputeLane = (typeof COMPUTE_LANE_VALUES)[number];

export interface ComputeAssignment {
  lane: ComputeLane;
  /** For serving: which model this card serves. Ignored for training/scraping. */
  targetModelId?: string;
}

export type ComputeAssignmentMap = Record<string, ComputeAssignment>;

/** Stable empty map for "no game loaded yet" / "no assignments" fallbacks — avoids a fresh literal each render. */
export const EMPTY_COMPUTE_ASSIGNMENTS: ComputeAssignmentMap = {};

export interface AssignmentRackInput {
  rackId: string;
  rackType: string;
  installedHardwareModuleIds?: readonly (string | null)[];
}

export interface LaneComputeStats {
  /** FP16/BF16 tensor TFLOPS summed across the lane's cards. */
  tflops: number;
  vramGb: number;
  gpuCount: number;
  bandwidthGbps: number;
}

export interface ComputeAssignmentStats {
  training: LaneComputeStats;
  scraping: LaneComputeStats;
  /** Aggregate of every serving-dedicated card (across all served models). */
  serving: LaneComputeStats;
  /** Per-model serving stats, keyed by targetModelId. */
  servingByModel: Map<string, LaneComputeStats>;
  /** Installed cards not assigned to any lane. */
  undedicated: LaneComputeStats;
  /** Every installed card, regardless of assignment. */
  total: LaneComputeStats;
}

/** Stable key for a physical slot; assignments are stored under this. */
export function assignmentKey(rackId: string, slotIndex: number): string {
  return `${rackId}:${slotIndex}`;
}

function emptyLane(): LaneComputeStats {
  return { tflops: 0, vramGb: 0, gpuCount: 0, bandwidthGbps: 0 };
}

type HardwareModule = ReturnType<typeof getHardwareDefinition>;

function addModule(lane: LaneComputeStats, module: HardwareModule): void {
  lane.tflops += module.trainingPowerFp16;
  lane.vramGb += module.vramGb;
  lane.gpuCount += 1;
  lane.bandwidthGbps += getHardwareMemoryBandwidthGbps(module);
}

/**
 * Walk every installed card across all racks, bucketing its stats into the lane it is dedicated to.
 * Serving cards are also summed per target model so a model's throughput/VRAM come from *its* cards only.
 */
export function computeAssignmentStats(
  racks: readonly AssignmentRackInput[],
  assignments: ComputeAssignmentMap | null | undefined,
): ComputeAssignmentStats {
  const map = assignments ?? EMPTY_COMPUTE_ASSIGNMENTS;
  const stats: ComputeAssignmentStats = {
    training: emptyLane(),
    scraping: emptyLane(),
    serving: emptyLane(),
    servingByModel: new Map<string, LaneComputeStats>(),
    undedicated: emptyLane(),
    total: emptyLane(),
  };

  for (const rack of racks) {
    const slots = getRackInstalledHardwareSlots(rack);
    slots.forEach((hardwareModelId, slotIndex) => {
      if (hardwareModelId === null) return;
      const module = getHardwareDefinition(hardwareModelId);
      addModule(stats.total, module);

      const assignment = map[assignmentKey(rack.rackId, slotIndex)];
      if (!assignment) {
        addModule(stats.undedicated, module);
        return;
      }

      if (assignment.lane === "training") {
        addModule(stats.training, module);
        return;
      }
      if (assignment.lane === "scraping") {
        addModule(stats.scraping, module);
        return;
      }

      // serving
      addModule(stats.serving, module);
      if (assignment.targetModelId) {
        let perModel = stats.servingByModel.get(assignment.targetModelId);
        if (!perModel) {
          perModel = emptyLane();
          stats.servingByModel.set(assignment.targetModelId, perModel);
        }
        addModule(perModel, module);
      }
    });
  }

  return stats;
}

/**
 * Per-rack, per-card thermal model (v3). Heat and cooling are rack-local;
 * no neighbor bleed, no site-wide temperature.
 */


export interface RackThermalInput {
  id: string;
  rackType: string;
  installedHardwareModuleIds?: readonly (string | null)[];
  installedCoolerId?: RackCoolingUnitId | string | null;
}

export interface CardThermalState {
  slotIndex: number;
  hardwareModelId: string;
  heatKw: number;
  coolingShareKw: number;
  throttleFactor: number;
  temperatureC: number;
  utilization: number;
}

export interface RackThermalStateV3 {
  rackId: string;
  rackType: string;
  rackHeatKw: number;
  rackCapacityKw: number;
  rackThrottle: number;
  cards: CardThermalState[];
}

function rackPowerEfficiency(rackType: string): number {
  const catalogId = resolveRackCatalogId(rackType);
  if (!catalogId) return 1;
  return getRackCatalogDefinition(catalogId).powerEfficiency;
}

function rackPassiveCoolingKw(rackType: string, ambientCoolingMult: number): number {
  const catalogId = resolveRackCatalogId(rackType);
  if (!catalogId) return 0.35 * ambientCoolingMult;
  return getRackCatalogDefinition(catalogId).passiveCoolingKw * ambientCoolingMult;
}

function installedCoolerCapacityKw(installedCoolerId: string | null | undefined): number {
  if (!installedCoolerId) return 0;
  return getRackCoolingUnitDefinition(installedCoolerId).capacityKw;
}

function cardHeatKw(
  hardwareModelId: string,
  rackType: string,
  activityFactor: number,
): number {
  const powerEff = rackPowerEfficiency(rackType);
  return (getHardwareDefinition(hardwareModelId).tdpWatts / 1000) * powerEff * activityFactor;
}

export function computeCardTemperatureC(heatKw: number, coolingShareKw: number): number {
  const utilization =
    coolingShareKw <= 0 ? (heatKw > 0 ? Infinity : 0) : heatKw / coolingShareKw;
  if (heatKw <= 0) return THERMAL_AMBIENT_TEMP_C;
  if (!Number.isFinite(utilization)) return THERMAL_MAX_TEMP_C;
  const span = THERMAL_MAX_TEMP_C - THERMAL_AMBIENT_TEMP_C;
  return Math.min(
    THERMAL_MAX_TEMP_C,
    THERMAL_AMBIENT_TEMP_C + span * (1 - Math.exp(-THERMAL_TEMP_CURVE_K * utilization)),
  );
}

export function computeRackThermalStateV3(
  rack: RackThermalInput,
  options?: { isComputeActive?: boolean; ambientCoolingMult?: number },
): RackThermalStateV3 {
  const isComputeActive = options?.isComputeActive ?? true;
  const ambientCoolingMult = options?.ambientCoolingMult ?? 1;
  const activityFactor = isComputeActive ? 1 : THERMAL_IDLE_ACTIVITY;

  const slots = rack.installedHardwareModuleIds ?? [];
  const installedIds = getRackInstalledHardware(rack);
  const activeCardCount = Math.max(1, installedIds.length);

  const passiveKw = rackPassiveCoolingKw(rack.rackType, ambientCoolingMult);
  const coolerKw = installedCoolerCapacityKw(rack.installedCoolerId);
  const rackCapacityKw = passiveKw + coolerKw;

  const cards: CardThermalState[] = [];
  let rackHeatKw = 0;

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const hardwareModelId = slots[slotIndex];
    if (!hardwareModelId) continue;
    const heatKw = cardHeatKw(hardwareModelId, rack.rackType, activityFactor);
    rackHeatKw += heatKw;
    const coolingShareKw = rackCapacityKw / activeCardCount;
    const thermal = computeThermalState(heatKw, coolingShareKw);
    cards.push({
      slotIndex,
      hardwareModelId,
      heatKw,
      coolingShareKw,
      throttleFactor: thermal.throttleFactor,
      temperatureC: computeCardTemperatureC(heatKw, coolingShareKw),
      utilization: thermal.utilization,
    });
  }

  const rackThrottle =
    cards.length === 0 ? 1 : Math.min(...cards.map((card) => card.throttleFactor));

  return {
    rackId: rack.id,
    rackType: rack.rackType,
    rackHeatKw,
    rackCapacityKw,
    rackThrottle,
    cards,
  };
}

export function computeAllRackThermalStatesV3(
  racks: readonly RackThermalInput[],
  options?: { isComputeActive?: boolean; ambientCoolingMult?: number },
): RackThermalStateV3[] {
  return racks.map((rack) => computeRackThermalStateV3(rack, options));
}

/** Weighted site throttle: sum of per-rack TFLOPs × rack throttle / total TFLOPs. */
export function computeWeightedSiteRackThrottle(
  rackStates: readonly RackThermalStateV3[],
  rackTflops: Record<string, number>,
): number {
  let weighted = 0;
  let totalTflops = 0;
  for (const state of rackStates) {
    const tflops = rackTflops[state.rackId] ?? 0;
    if (tflops <= 0) continue;
    weighted += tflops * state.rackThrottle;
    totalTflops += tflops;
  }
  if (totalTflops <= 0) return 1;
  return weighted / totalTflops;
}

export function getRackCoolerOverheadKw(racks: readonly RackThermalInput[]): number {
  let total = 0;
  for (const rack of racks) {
    if (!rack.installedCoolerId) continue;
    total += getRackCoolingUnitDefinition(rack.installedCoolerId).powerOverheadKw;
  }
  return total;
}

export function getInstalledRackCoolingWaterConsumption(racks: readonly RackThermalInput[]): number {
  let total = 0;
  for (const rack of racks) {
    if (!rack.installedCoolerId) continue;
    total += getRackCoolingUnitDefinition(rack.installedCoolerId).waterConsumption;
  }
  return total;
}

export interface RackSiteThermalSummary {
  effectiveThermalThrottle: number;
  heatLoadKw: number;
  coolingCapacityKw: number;
  temperatureC: number;
  powerDrawKw: number;
  powerCapacityKw: number;
  powerThrottle: number;
}

/** Site-level thermal + power from per-rack v3 model (shared by serving + scene summary). */
export function summarizeRackSiteThermal(
  racks: readonly RackThermalInput[],
  options: {
    powerCapacityKw: number;
    isComputeActive?: boolean;
    ambientCoolingMult?: number;
    rackTflops?: Record<string, number>;
  },
): RackSiteThermalSummary {
  const isComputeActive = options.isComputeActive ?? true;
  const ambientCoolingMult = options.ambientCoolingMult ?? 1;
  const rackThermalStates = computeAllRackThermalStatesV3(racks, { isComputeActive, ambientCoolingMult });

  const rackTflops = options.rackTflops ?? Object.fromEntries(
    racks.map((rack) => {
      let tflops = 0;
      for (const hardwareModelId of getRackInstalledHardware(rack)) {
        tflops += getHardwareDefinition(hardwareModelId).trainingPowerFp16;
      }
      return [rack.id, tflops];
    }),
  );

  const effectiveThermalThrottle = computeWeightedSiteRackThrottle(rackThermalStates, rackTflops);
  const heatLoadKw = rackThermalStates.reduce((sum, state) => sum + state.rackHeatKw, 0);
  const coolingCapacityKw = rackThermalStates.reduce((sum, state) => sum + state.rackCapacityKw, 0);
  const temperatureC = rackThermalStates.reduce((max, state) => {
    const cardMax = state.cards.reduce((m, card) => Math.max(m, card.temperatureC), 0);
    return Math.max(max, cardMax);
  }, THERMAL_AMBIENT_TEMP_C);
  const coolerOverheadKw = getRackCoolerOverheadKw(racks);
  const powerDrawKw = heatLoadKw + coolerOverheadKw;
  const powerThrottle = computePowerThrottle(powerDrawKw, options.powerCapacityKw);

  return {
    effectiveThermalThrottle,
    heatLoadKw,
    coolingCapacityKw,
    temperatureC,
    powerDrawKw,
    powerCapacityKw: options.powerCapacityKw,
    powerThrottle,
  };
}


export interface RackSnapshot {
  rackId: string;
  rackType: string;
  installedHardwareModuleIds?: readonly (string | null)[];
  installedCoolerId?: string | null;
}

export function rackAssignmentInputs(racks: readonly RackSnapshot[]): AssignmentRackInput[] {
  return racks.map((rack) => ({
    rackId: rack.rackId,
    rackType: rack.rackType,
    installedHardwareModuleIds: rack.installedHardwareModuleIds,
  }));
}

export function rackThermalInputs(racks: readonly RackSnapshot[]): RackThermalInput[] {
  return racks.map((rack) => ({
    id: rack.rackId,
    rackType: rack.rackType,
    installedHardwareModuleIds: rack.installedHardwareModuleIds,
    installedCoolerId: rack.installedCoolerId,
  }));
}

/**
 * Install / uninstall rack-mounted coolers (mirrors rack hardware spare-pool pattern).
 */


export type InstallCoolerOutcome =
  | { ok: true; nextInventory: RackCoolingInventory; coolerId: RackCoolingUnitId }
  | { ok: false; reason: "no_stock" | "incompatible" | "already_installed" | "unknown_cooler" };

export type UninstallCoolerOutcome =
  | { ok: true; nextInventory: RackCoolingInventory; coolerId: RackCoolingUnitId }
  | { ok: false; reason: "no_cooler_installed" };

export function installCoolerIntoRack(args: {
  rackType: string;
  installedCoolerId: string | null | undefined;
  coolingInventory: RackCoolingInventory;
  coolerId: string;
}): InstallCoolerOutcome {
  if (args.installedCoolerId) {
    return { ok: false, reason: "already_installed" };
  }
  if (!isRackCoolingUnitId(args.coolerId)) {
    return { ok: false, reason: "unknown_cooler" };
  }

  const inventory = normalizeRackCoolingInventory(args.coolingInventory);
  if ((inventory[args.coolerId] ?? 0) <= 0) {
    return { ok: false, reason: "no_stock" };
  }

  const catalogId = resolveRackCatalogId(args.rackType);
  if (!catalogId) {
    return { ok: false, reason: "incompatible" };
  }
  const rackDef = getRackCatalogDefinition(catalogId);
  const coolerDef = getRackCoolingUnitDefinition(args.coolerId);
  if (!coolerFitsRack(coolerDef.coolantType, rackDef.allowedCoolantTypes)) {
    return { ok: false, reason: "incompatible" };
  }

  return {
    ok: true,
    nextInventory: { ...inventory, [args.coolerId]: inventory[args.coolerId] - 1 },
    coolerId: args.coolerId,
  };
}

export function uninstallCoolerFromRack(args: {
  installedCoolerId: string | null | undefined;
  coolingInventory: RackCoolingInventory;
}): UninstallCoolerOutcome {
  if (!args.installedCoolerId || !isRackCoolingUnitId(args.installedCoolerId)) {
    return { ok: false, reason: "no_cooler_installed" };
  }
  const inventory = normalizeRackCoolingInventory(args.coolingInventory);
  const coolerId = args.installedCoolerId;
  return {
    ok: true,
    nextInventory: { ...inventory, [coolerId]: (inventory[coolerId] ?? 0) + 1 },
    coolerId,
  };
}
