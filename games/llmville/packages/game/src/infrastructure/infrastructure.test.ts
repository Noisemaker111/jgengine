import { describe, expect, test } from "bun:test";
import {
  assignmentKey,
  computeAssignmentStats,
  getRackSlotCapacity,
  inventoryToRackSlots,
  moveRackHardware,
  normalizeHardwareInventory,
  rackSlotsToInventory,
  tutorialBenchPosition,
  type RackHardwareState,
  type AssignmentRackInput,
  type ComputeAssignmentMap,
  type RackInstalledHardwareSlot,
} from "@llmville/game/infrastructure/infrastructure";

describe("getRackSlotCapacity", () => {
  test("reads slot capacity from the rack catalog for every canonical rack type", () => {
    expect(getRackSlotCapacity("starter_rack")).toBe(2);
    expect(getRackSlotCapacity("air_rack_4")).toBe(4);
    expect(getRackSlotCapacity("air_rack_6")).toBe(6);
    expect(getRackSlotCapacity("water_rack_4")).toBe(4);
    expect(getRackSlotCapacity("server_rack_8_water")).toBe(8);
    expect(getRackSlotCapacity("server_rack_12")).toBe(12);
    expect(getRackSlotCapacity("water_server_rack_12")).toBe(12);
    expect(getRackSlotCapacity("ln2_rack_16")).toBe(16);
    expect(getRackSlotCapacity("medium_server_rack_24")).toBe(24);
  });

  test("falls back to the starter rack capacity for an unknown rack type", () => {
    expect(getRackSlotCapacity("not_a_real_rack")).toBe(2);
  });
});

describe("rackSlotsToInventory / inventoryToRackSlots", () => {
  test("round-trips a mix of hardware and null gaps", () => {
    const slots: RackInstalledHardwareSlot[] = ["gpu_1", null, "gpu_2", null];
    expect(inventoryToRackSlots(rackSlotsToInventory(slots))).toEqual(slots);
  });

  test("round-trips an all-empty rack", () => {
    const slots: RackInstalledHardwareSlot[] = [null, null];
    expect(inventoryToRackSlots(rackSlotsToInventory(slots))).toEqual(slots);
  });

  test("round-trips a fully populated rack", () => {
    const slots: RackInstalledHardwareSlot[] = ["gpu_1", "gpu_2", "gpu_3"];
    expect(inventoryToRackSlots(rackSlotsToInventory(slots))).toEqual(slots);
  });

  test("stores each installed unit as a count-1 stack", () => {
    const state = rackSlotsToInventory(["gpu_1", null]);
    expect(state.slots[0]).toEqual({ itemId: "gpu_1", count: 1 });
    expect(state.slots[1]).toBeNull();
  });
});

function rackState(
  installed: RackInstalledHardwareSlot[],
  stock: Record<string, number>,
  rackType = "starter_rack",
): RackHardwareState {
  return { rackType, installed, stock: normalizeHardwareInventory(stock) };
}

describe("moveRackHardware", () => {
  test("stock to rack auto-installs into the first empty slot", () => {
    const outcome = moveRackHardware(rackState([null, null], { gpu_1: 1 }), { kind: "stock", hardwareId: "gpu_1" }, { kind: "slot" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.nextInstalled).toEqual(["gpu_1", null]);
    expect(outcome.nextStock.gpu_1).toBe(0);
  });

  test("stock to an explicit empty slot", () => {
    const outcome = moveRackHardware(rackState([null, null], { gpu_1: 1 }), { kind: "stock", hardwareId: "gpu_1" }, { kind: "slot", slot: 1 });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.nextInstalled).toEqual([null, "gpu_1"]);
  });

  test("stock dropped on an occupied slot replaces it and returns the old unit to stock", () => {
    const outcome = moveRackHardware(rackState(["gpu_1", null], { gpu_2: 1 }), { kind: "stock", hardwareId: "gpu_2" }, { kind: "slot", slot: 0 });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.nextInstalled).toEqual(["gpu_2", null]);
    expect(outcome.nextStock.gpu_1).toBe(1);
    expect(outcome.nextStock.gpu_2).toBe(0);
  });

  test("rejects rack_full when auto-installing into a full rack", () => {
    const outcome = moveRackHardware(rackState(["gpu_1", "gpu_1"], { gpu_1: 1 }), { kind: "stock", hardwareId: "gpu_1" }, { kind: "slot" });
    expect(outcome).toEqual({ ok: false, reason: "rack_full" });
  });

  test("rejects no_stock when the warehouse has none", () => {
    const outcome = moveRackHardware(rackState([null, null], { gpu_1: 0 }), { kind: "stock", hardwareId: "gpu_1" }, { kind: "slot" });
    expect(outcome).toEqual({ ok: false, reason: "no_stock" });
  });

  test("rejects unknown hardware ids", () => {
    const outcome = moveRackHardware(rackState([null, null], {}), { kind: "stock", hardwareId: "not_a_real_gpu" }, { kind: "slot" });
    expect(outcome).toEqual({ ok: false, reason: "unknown_hardware" });
  });

  test("slot to stock uninstalls and returns the unit", () => {
    const outcome = moveRackHardware(rackState(["gpu_1", "gpu_2"], { gpu_1: 0 }), { kind: "slot", slot: 0 }, { kind: "stock" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.nextInstalled).toEqual([null, "gpu_2"]);
    expect(outcome.nextStock.gpu_1).toBe(1);
  });

  test("uninstall targets the exact slot even with duplicate hardware", () => {
    const outcome = moveRackHardware(rackState(["gpu_1", "gpu_1"], { gpu_1: 0 }, "air_rack_4"), { kind: "slot", slot: 0 }, { kind: "stock" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.nextInstalled).toEqual([null, "gpu_1", null, null]);
  });

  test("rejects uninstalling an empty slot", () => {
    const outcome = moveRackHardware(rackState([null, "gpu_2"], {}), { kind: "slot", slot: 0 }, { kind: "stock" });
    expect(outcome).toEqual({ ok: false, reason: "slot_empty" });
  });

  test("rejects an out-of-range source slot", () => {
    const outcome = moveRackHardware(rackState([null, null], {}), { kind: "slot", slot: 9 }, { kind: "stock" });
    expect(outcome).toEqual({ ok: false, reason: "invalid_slot" });
  });

  test("moves an installed unit into an empty slot", () => {
    const outcome = moveRackHardware(rackState(["gpu_1", null], {}), { kind: "slot", slot: 0 }, { kind: "slot", slot: 1 });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.nextInstalled).toEqual([null, "gpu_1"]);
  });

  test("dropping a slot onto an occupied slot swaps the two units", () => {
    const outcome = moveRackHardware(rackState(["gpu_1", "gpu_2"], {}), { kind: "slot", slot: 0 }, { kind: "slot", slot: 1 });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.nextInstalled).toEqual(["gpu_2", "gpu_1"]);
  });
});

describe("tutorialBenchPosition", () => {
  test("returns null when no racks are placed", () => {
    expect(tutorialBenchPosition([])).toBeNull();
  });

  test("anchors on the oldest rack regardless of iteration order", () => {
    const racks = [
      { id: "obj_10_0_0", createdAt: 200, x: 10, z: 0 },
      { id: "obj_0_0_0", createdAt: 100, x: 0, z: 0 },
      { id: "obj_20_0_0", createdAt: 300, x: 20, z: 0 },
    ];
    expect(tutorialBenchPosition(racks)).toEqual({ x: 0, z: 0 });
    expect(tutorialBenchPosition([...racks].reverse())).toEqual({ x: 0, z: 0 });
  });

  test("breaks ties on instance id so every client picks the same rack", () => {
    const racks = [
      { id: "obj_9_0_0", createdAt: 100, x: 9, z: 1 },
      { id: "obj_3_0_0", createdAt: 100, x: 3, z: 2 },
    ];
    expect(tutorialBenchPosition(racks)).toEqual({ x: 3, z: 2 });
    expect(tutorialBenchPosition([...racks].reverse())).toEqual({ x: 3, z: 2 });
  });
});


const GPU_1_TFLOPS = 11;
const GPU_1_VRAM_GB = 6;
const GPU_1_BANDWIDTH_GBPS = 192;


describe("computeAssignmentStats", () => {
  test("buckets installed cards by lane and tracks undedicated cards", () => {
    const twoGpuRack: AssignmentRackInput = {
      rackId: "rack1",
      rackType: "starter_rack",
      installedHardwareModuleIds: ["gpu_1", "gpu_1"],
    };
    const assignments: ComputeAssignmentMap = {
      [assignmentKey("rack1", 0)]: { lane: "serving", targetModelId: "model1" },
    };
    const stats = computeAssignmentStats([twoGpuRack], assignments);

    expect(stats.serving).toEqual({
      tflops: GPU_1_TFLOPS,
      vramGb: GPU_1_VRAM_GB,
      gpuCount: 1,
      bandwidthGbps: GPU_1_BANDWIDTH_GBPS,
    });
    expect(stats.servingByModel.get("model1")).toEqual(stats.serving);
    expect(stats.undedicated).toEqual({
      tflops: GPU_1_TFLOPS,
      vramGb: GPU_1_VRAM_GB,
      gpuCount: 1,
      bandwidthGbps: GPU_1_BANDWIDTH_GBPS,
    });
    expect(stats.total).toEqual({
      tflops: GPU_1_TFLOPS * 2,
      vramGb: GPU_1_VRAM_GB * 2,
      gpuCount: 2,
      bandwidthGbps: GPU_1_BANDWIDTH_GBPS * 2,
    });
    expect(stats.training).toEqual({ tflops: 0, vramGb: 0, gpuCount: 0, bandwidthGbps: 0 });
    expect(stats.scraping).toEqual({ tflops: 0, vramGb: 0, gpuCount: 0, bandwidthGbps: 0 });
  });

  test("empty racks list yields all-zero stats", () => {
    const stats = computeAssignmentStats([], null);
    expect(stats.total).toEqual({ tflops: 0, vramGb: 0, gpuCount: 0, bandwidthGbps: 0 });
    expect(stats.servingByModel.size).toBe(0);
  });
});
