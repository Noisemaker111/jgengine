export type HardwareArchetype =
  | "efficient_edge"
  | "balanced_desk"
  | "memory_monster"
  | "prosumer_brute"
  | "datacenter_node"
  | "inference_wafer"
  | "inference_specialist";

export const HARDWARE_VENDOR_VALUES = ["NVIDIA", "AMD", "Google", "AWS", "Cerebras", "Groq", "Apple"] as const;
export type HardwareVendor = (typeof HARDWARE_VENDOR_VALUES)[number];

/** consumer = desk GPU, datacenter = server GPU, accelerator = custom ASIC/wafer, rack_scale = a whole machine, appliance = turnkey box. */
export const HARDWARE_CATEGORY_VALUES = ["consumer", "datacenter", "accelerator", "rack_scale", "appliance"] as const;
export type HardwareCategory = (typeof HARDWARE_CATEGORY_VALUES)[number];

/** What the part is built for; biases whether it shines at training throughput or serving/inference. */
export const HARDWARE_KIND_VALUES = ["training", "inference", "balanced"] as const;
export type HardwareKind = (typeof HARDWARE_KIND_VALUES)[number];

/** Numeric formats a part can run; gates which model quantizations it can accelerate (see quantization phase). */
export const COMPUTE_PRECISION_VALUES = ["fp16", "fp8", "fp4"] as const;
export type ComputePrecision = (typeof COMPUTE_PRECISION_VALUES)[number];

/** Fallback GB/s when a catalog row omits explicit memory bandwidth (≈32 GB/s per VRAM GB). */
export const HARDWARE_BANDWIDTH_PER_VRAM_GB = 32;

/**
 * Accelerator catalog. `trainingPowerFp16` is FP16/BF16 tensor TFLOPS (the core compute currency);
 * `fp8Tflops` is the FP8 peak used once a model is quantized. `unlockGameLevel` is a soft UI hint for
 * recommended progression tier — purchase gating uses room power/cooling capacity instead. TDP doubles as
 * heat output (kW) for the thermal system. Numbers track real 2025/2026 parts, scaled for game balance.
 */
export const HARDWARE_CATALOG = [
  // Consumer / desk GPUs (early game).
  { id: "gpu_1", name: "GTX 1060", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 1, vramGb: 6, memoryBandwidthGbps: 192, trainingPowerFp16: 11, buyPrice: 480, tdpWatts: 120, supportedPrecisions: ["fp16"] },
  { id: "gpu_2", name: "GTX 1070", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 3, vramGb: 8, memoryBandwidthGbps: 256, trainingPowerFp16: 19, buyPrice: 650, tdpWatts: 150, supportedPrecisions: ["fp16"] },
  { id: "gpu_3", name: "GTX 1080", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 6, vramGb: 8, memoryBandwidthGbps: 320, trainingPowerFp16: 21, buyPrice: 850, tdpWatts: 180, supportedPrecisions: ["fp16"] },
  { id: "gpu_4", name: "GTX 1080 Ti", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 9, vramGb: 11, memoryBandwidthGbps: 484, trainingPowerFp16: 25, buyPrice: 1200, tdpWatts: 250, supportedPrecisions: ["fp16"] },
  { id: "gpu_5", name: "RTX 2060", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 12, vramGb: 6, memoryBandwidthGbps: 336, trainingPowerFp16: 52, buyPrice: 980, tdpWatts: 160, supportedPrecisions: ["fp16"] },
  { id: "gpu_6", name: "RTX 2070", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 15, vramGb: 8, memoryBandwidthGbps: 448, trainingPowerFp16: 60, buyPrice: 1300, tdpWatts: 175, supportedPrecisions: ["fp16"] },
  { id: "gpu_7", name: "RTX 2080", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 18, vramGb: 8, memoryBandwidthGbps: 448, trainingPowerFp16: 70, buyPrice: 1800, tdpWatts: 225, supportedPrecisions: ["fp16"] },
  { id: "gpu_8", name: "RTX 2080 Ti", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 21, vramGb: 11, memoryBandwidthGbps: 616, trainingPowerFp16: 85, buyPrice: 2500, tdpWatts: 250, supportedPrecisions: ["fp16"] },
  { id: "gpu_9", name: "RTX 3060", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 24, vramGb: 12, memoryBandwidthGbps: 360, trainingPowerFp16: 102, buyPrice: 1750, tdpWatts: 170, supportedPrecisions: ["fp16"] },
  { id: "gpu_10", name: "RTX 3070", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 27, vramGb: 8, memoryBandwidthGbps: 448, trainingPowerFp16: 120, buyPrice: 2200, tdpWatts: 220, supportedPrecisions: ["fp16"] },
  { id: "gpu_11", name: "RTX 3080", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 30, vramGb: 10, memoryBandwidthGbps: 760, trainingPowerFp16: 125, buyPrice: 3600, tdpWatts: 320, supportedPrecisions: ["fp16"] },
  { id: "gpu_12", name: "RTX 3090", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 33, vramGb: 24, memoryBandwidthGbps: 936, trainingPowerFp16: 142, buyPrice: 6800, tdpWatts: 350, supportedPrecisions: ["fp16"] },
  { id: "gpu_13", name: "RTX 4060 Ti", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 36, vramGb: 16, memoryBandwidthGbps: 288, trainingPowerFp16: 22, buyPrice: 2800, tdpWatts: 160, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 44 },
  { id: "gpu_14", name: "RTX 4070 Ti", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 39, vramGb: 16, memoryBandwidthGbps: 504, trainingPowerFp16: 40, buyPrice: 5400, tdpWatts: 285, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 80 },
  { id: "gpu_15", name: "RTX 4080", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 42, vramGb: 16, memoryBandwidthGbps: 717, trainingPowerFp16: 49, buyPrice: 8500, tdpWatts: 320, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 98 },
  { id: "gpu_16", name: "RTX 4090", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 45, vramGb: 24, memoryBandwidthGbps: 1008, trainingPowerFp16: 165, buyPrice: 12500, tdpWatts: 450, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 330 },
  { id: "gpu_25", name: "RTX 5090", vendor: "NVIDIA", category: "consumer", kind: "balanced", unlockGameLevel: 48, vramGb: 32, memoryBandwidthGbps: 1200, trainingPowerFp16: 210, buyPrice: 15000, tdpWatts: 575, supportedPrecisions: ["fp16", "fp8", "fp4"], fp8Tflops: 420 },
  // Workstation / pro.
  { id: "gpu_17", name: "RTX A4000", vendor: "NVIDIA", category: "datacenter", kind: "balanced", unlockGameLevel: 50, vramGb: 16, memoryBandwidthGbps: 448, trainingPowerFp16: 150, buyPrice: 9000, tdpWatts: 140, supportedPrecisions: ["fp16"] },
  { id: "gpu_18", name: "RTX A5000", vendor: "NVIDIA", category: "datacenter", kind: "balanced", unlockGameLevel: 55, vramGb: 24, memoryBandwidthGbps: 576, trainingPowerFp16: 200, buyPrice: 14000, tdpWatts: 230, supportedPrecisions: ["fp16"] },
  { id: "gpu_19", name: "RTX A6000", vendor: "NVIDIA", category: "datacenter", kind: "balanced", unlockGameLevel: 60, vramGb: 48, memoryBandwidthGbps: 768, trainingPowerFp16: 310, buyPrice: 22000, tdpWatts: 300, supportedPrecisions: ["fp16"] },
  // Datacenter GPUs (NVIDIA).
  { id: "gpu_20", name: "A100 40GB", vendor: "NVIDIA", category: "datacenter", kind: "training", unlockGameLevel: 60, vramGb: 40, memoryBandwidthGbps: 1555, trainingPowerFp16: 312, buyPrice: 24000, tdpWatts: 400, supportedPrecisions: ["fp16"] },
  { id: "gpu_21", name: "A100 80GB", vendor: "NVIDIA", category: "datacenter", kind: "training", unlockGameLevel: 64, vramGb: 80, memoryBandwidthGbps: 2039, trainingPowerFp16: 624, buyPrice: 37000, tdpWatts: 400, supportedPrecisions: ["fp16"] },
  { id: "gpu_22", name: "H100", vendor: "NVIDIA", category: "datacenter", kind: "balanced", unlockGameLevel: 68, vramGb: 80, memoryBandwidthGbps: 3350, trainingPowerFp16: 990, buyPrice: 55000, tdpWatts: 700, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 1979 },
  { id: "gpu_23", name: "H200", vendor: "NVIDIA", category: "datacenter", kind: "balanced", unlockGameLevel: 70, vramGb: 141, memoryBandwidthGbps: 4800, trainingPowerFp16: 990, buyPrice: 75000, tdpWatts: 700, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 1979 },
  { id: "gpu_24", name: "B200", vendor: "NVIDIA", category: "datacenter", kind: "balanced", unlockGameLevel: 74, vramGb: 192, memoryBandwidthGbps: 8000, trainingPowerFp16: 2250, buyPrice: 120000, tdpWatts: 1000, supportedPrecisions: ["fp16", "fp8", "fp4"], fp8Tflops: 4500 },
  { id: "gpu_34", name: "B300 (Blackwell Ultra)", vendor: "NVIDIA", category: "datacenter", kind: "balanced", unlockGameLevel: 75, vramGb: 288, memoryBandwidthGbps: 9600, trainingPowerFp16: 2500, buyPrice: 200000, tdpWatts: 1400, supportedPrecisions: ["fp16", "fp8", "fp4"], fp8Tflops: 5000 },
  // Datacenter GPUs (AMD).
  { id: "gpu_26", name: "AMD MI300X", vendor: "AMD", category: "datacenter", kind: "balanced", unlockGameLevel: 70, vramGb: 192, memoryBandwidthGbps: 5300, trainingPowerFp16: 1300, buyPrice: 90000, tdpWatts: 750, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 2600 },
  { id: "gpu_27", name: "AMD MI350X", vendor: "AMD", category: "datacenter", kind: "balanced", unlockGameLevel: 75, vramGb: 288, memoryBandwidthGbps: 8000, trainingPowerFp16: 2300, buyPrice: 110000, tdpWatts: 1000, supportedPrecisions: ["fp16", "fp8", "fp4"], fp8Tflops: 4600 },
  // Custom accelerators (ASIC / wafer / LPU).
  { id: "gpu_28", name: "Google TPU v5e", vendor: "Google", category: "accelerator", kind: "balanced", unlockGameLevel: 68, vramGb: 16, memoryBandwidthGbps: 819, trainingPowerFp16: 197, buyPrice: 20000, tdpWatts: 170, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 394 },
  { id: "gpu_29", name: "Google TPU v6e (Trillium)", vendor: "Google", category: "accelerator", kind: "balanced", unlockGameLevel: 72, vramGb: 32, memoryBandwidthGbps: 1640, trainingPowerFp16: 460, buyPrice: 35000, tdpWatts: 300, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 920 },
  { id: "gpu_30", name: "Google TPU v7 (Ironwood)", vendor: "Google", category: "accelerator", kind: "inference", unlockGameLevel: 75, vramGb: 192, memoryBandwidthGbps: 8200, trainingPowerFp16: 2300, buyPrice: 95000, tdpWatts: 600, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 4614 },
  { id: "gpu_31", name: "AWS Trainium2", vendor: "AWS", category: "accelerator", kind: "training", unlockGameLevel: 72, vramGb: 96, memoryBandwidthGbps: 3200, trainingPowerFp16: 667, buyPrice: 50000, tdpWatts: 500, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 1300 },
  { id: "gpu_33", name: "Groq LPU", vendor: "Groq", category: "accelerator", kind: "inference", unlockGameLevel: 73, vramGb: 1, memoryBandwidthGbps: 80000, trainingPowerFp16: 188, buyPrice: 25000, tdpWatts: 375, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 750 },
  { id: "gpu_32", name: "Cerebras WSE-3", vendor: "Cerebras", category: "accelerator", kind: "inference", unlockGameLevel: 75, vramGb: 44, memoryBandwidthGbps: 21_000_000, trainingPowerFp16: 125000, buyPrice: 2500000, tdpWatts: 23000, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 250000 },
  // Rack-scale machine: a whole liquid-cooled rack of compute (needs serious cooling).
  { id: "gpu_35", name: "GB200 NVL72", vendor: "NVIDIA", category: "rack_scale", kind: "balanced", unlockGameLevel: 75, vramGb: 13400, memoryBandwidthGbps: 5_760_000, trainingPowerFp16: 180000, buyPrice: 3000000, tdpWatts: 132000, supportedPrecisions: ["fp16", "fp8", "fp4"], fp8Tflops: 360000 },
  // Turnkey appliances (Route B — plug-and-play boxes).
  { id: "appliance_jetson_thor", name: "Jetson AGX Thor", vendor: "NVIDIA", category: "appliance", kind: "balanced", archetype: "efficient_edge", unlockGameLevel: 5, vramGb: 128, memoryBandwidthGbps: 276, trainingPowerFp16: 80, buyPrice: 3500, tdpWatts: 130, supportedPrecisions: ["fp16", "fp8", "fp4"], fp8Tflops: 160 },
  { id: "appliance_dgx_spark", name: "DGX Spark", vendor: "NVIDIA", category: "appliance", kind: "balanced", archetype: "balanced_desk", unlockGameLevel: 15, vramGb: 128, memoryBandwidthGbps: 273, trainingPowerFp16: 250, buyPrice: 4000, tdpWatts: 240, supportedPrecisions: ["fp16", "fp8", "fp4"], fp8Tflops: 500 },
  { id: "appliance_mac_studio", name: "Mac Studio M3 Ultra", vendor: "Apple", category: "appliance", kind: "balanced", archetype: "memory_monster", unlockGameLevel: 25, vramGb: 512, memoryBandwidthGbps: 819, trainingPowerFp16: 55, buyPrice: 10000, tdpWatts: 180, supportedPrecisions: ["fp16", "fp8"] },
  { id: "appliance_tinybox_pro", name: "tinybox pro", vendor: "NVIDIA", category: "appliance", kind: "training", archetype: "prosumer_brute", unlockGameLevel: 45, vramGb: 192, memoryBandwidthGbps: 8064, trainingPowerFp16: 1320, buyPrice: 40000, tdpWatts: 3200, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 2640 },
  { id: "appliance_dgx_b200", name: "DGX B200", vendor: "NVIDIA", category: "appliance", kind: "balanced", archetype: "datacenter_node", unlockGameLevel: 75, vramGb: 1400, memoryBandwidthGbps: 64_000, trainingPowerFp16: 18000, buyPrice: 400000, tdpWatts: 14000, supportedPrecisions: ["fp16", "fp8", "fp4"], fp8Tflops: 36000 },
  { id: "appliance_cerebras_cs3", name: "Cerebras CS-3", vendor: "Cerebras", category: "appliance", kind: "inference", archetype: "inference_wafer", unlockGameLevel: 75, vramGb: 44, memoryBandwidthGbps: 21_000_000, trainingPowerFp16: 125000, buyPrice: 2500000, tdpWatts: 23000, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 250000 },
  { id: "appliance_groq_lpu", name: "Groq LPU Rack", vendor: "Groq", category: "appliance", kind: "inference", archetype: "inference_specialist", unlockGameLevel: 60, vramGb: 8, memoryBandwidthGbps: 50_000, trainingPowerFp16: 50, buyPrice: 150000, tdpWatts: 2000, supportedPrecisions: ["fp16", "fp8"], fp8Tflops: 200 },
] as const;

export type HardwareModelId = (typeof HARDWARE_CATALOG)[number]["id"];

export interface HardwareModuleDefinition {
  id: HardwareModelId;
  name: string;
  unlockGameLevel: number;
  vramGb: number;
  memoryBandwidthGbps?: number;
  /** Peak FP16/BF16 tensor throughput (TFLOPS); the core compute currency for training + serving. */
  trainingPowerFp16: number;
  buyPrice: number;
  tdpWatts: number;
  vendor: HardwareVendor;
  category: HardwareCategory;
  kind: HardwareKind;
  archetype?: HardwareArchetype;
  /** Lowest numeric formats this part natively accelerates; lower precision unlocks more throughput when a model is quantized to it. */
  supportedPrecisions: readonly ComputePrecision[];
  /** Peak FP8 tensor throughput (TFLOPS) where the part supports it; used for quantized serving. */
  fp8Tflops?: number;
}

export function getHardwareMemoryBandwidthGbps(
  hardware: Pick<HardwareModuleDefinition, "memoryBandwidthGbps" | "vramGb">,
): number {
  return hardware.memoryBandwidthGbps ?? hardware.vramGb * HARDWARE_BANDWIDTH_PER_VRAM_GB;
}

export function parseHardwareModelId(value: string): HardwareModelId | null {
  return HARDWARE_CATALOG.some((hardware) => hardware.id === value)
    ? (value as HardwareModelId)
    : null;
}

export function getHardwareDefinition(id: HardwareModelId | string): HardwareModuleDefinition {
  return HARDWARE_CATALOG.find((hardware) => hardware.id === id) ?? HARDWARE_CATALOG[0];
}

export const HARDWARE_MODEL_ID_VALUES = HARDWARE_CATALOG.map((hardware) => hardware.id) as [
  HardwareModelId,
  HardwareModelId,
  ...HardwareModelId[],
];

/**
 * Rack-mounted cooling catalog (v3). Coolers install into a rack's cooler slot;
 * capacity is per-rack, not site-wide.
 */

export const RACK_COOLANT_TYPE_VALUES = ["air", "water", "ln2"] as const;
export type RackCoolantType = (typeof RACK_COOLANT_TYPE_VALUES)[number];

export const RACK_COOLING_CATALOG = [
  {
    id: "rusty_case_fan",
    name: "Rusty Case Fan",
    description: "A wheezing desk fan zip-tied to the rack door. Better than nothing.",
    coolantType: "air" as const,
    capacityKw: 1.0,
    powerOverheadKw: 0.05,
    waterConsumption: 0,
    unlockDataTokens: 0,
    buyPrice: 200,
  },
  {
    id: "basic_rack_fan",
    name: "Basic Rack Fan",
    description: "Proper rack-mount fan tray. Moves real air through the slots.",
    coolantType: "air" as const,
    capacityKw: 2.5,
    powerOverheadKw: 0.1,
    waterConsumption: 0,
    unlockDataTokens: 500,
    buyPrice: 800,
  },
  {
    id: "small_water_cooler",
    name: "Small Water Cooler",
    description: "Compact loop with a radiator on the rack rear. Quiet and effective.",
    coolantType: "water" as const,
    capacityKw: 6.0,
    powerOverheadKw: 0.15,
    waterConsumption: 8,
    unlockDataTokens: 2000,
    buyPrice: 4000,
  },
  {
    id: "large_fan",
    name: "Large Rack Fan",
    description: "High-flow fan wall. Loud, but it keeps dense air racks alive.",
    coolantType: "air" as const,
    capacityKw: 5.0,
    powerOverheadKw: 0.2,
    waterConsumption: 0,
    unlockDataTokens: 5000,
    buyPrice: 6000,
  },
  {
    id: "medium_water_cooler",
    name: "Medium Water Cooler",
    description: "Dual-loop rack cooler for serious heat loads.",
    coolantType: "water" as const,
    capacityKw: 15.0,
    powerOverheadKw: 0.3,
    waterConsumption: 25,
    unlockDataTokens: 15000,
    buyPrice: 20000,
  },
  {
    id: "basic_ln2",
    name: "Basic Liquid Nitrogen Rig",
    description: "LN2 dewar feed with safety interlocks. End-game density cooling.",
    coolantType: "ln2" as const,
    capacityKw: 40.0,
    powerOverheadKw: 0.5,
    waterConsumption: 0,
    unlockDataTokens: 50000,
    buyPrice: 100000,
  },
] as const;

export type RackCoolingUnitId = (typeof RACK_COOLING_CATALOG)[number]["id"];

export const RACK_COOLING_UNIT_ID_VALUES = RACK_COOLING_CATALOG.map((unit) => unit.id) as [
  RackCoolingUnitId,
  RackCoolingUnitId,
  ...RackCoolingUnitId[],
];

export interface RackCoolingUnitDefinition {
  id: RackCoolingUnitId;
  name: string;
  description: string;
  coolantType: RackCoolantType;
  capacityKw: number;
  powerOverheadKw: number;
  waterConsumption: number;
  unlockDataTokens: number;
  buyPrice: number;
}

export function getRackCoolingUnitDefinition(id: RackCoolingUnitId | string): RackCoolingUnitDefinition {
  return RACK_COOLING_CATALOG.find((unit) => unit.id === id) ?? RACK_COOLING_CATALOG[0];
}

export function isRackCoolingUnitId(value: string): value is RackCoolingUnitId {
  return RACK_COOLING_CATALOG.some((unit) => unit.id === value);
}

export type RackCoolingInventory = Record<RackCoolingUnitId, number>;

export const DEFAULT_RACK_COOLING_INVENTORY = Object.fromEntries(
  RACK_COOLING_UNIT_ID_VALUES.map((id) => [id, 0]),
) as RackCoolingInventory;

export function normalizeRackCoolingInventory(
  inventory?: Partial<Record<string, number | undefined>>,
): RackCoolingInventory {
  const normalized = { ...DEFAULT_RACK_COOLING_INVENTORY };
  for (const id of RACK_COOLING_UNIT_ID_VALUES) {
    const count = inventory?.[id];
    if (typeof count === "number" && Number.isFinite(count)) {
      normalized[id] = Math.max(0, count);
    }
  }
  return normalized;
}

export function coolerFitsRack(
  coolerType: RackCoolantType,
  allowedCoolantTypes: readonly RackCoolantType[],
): boolean {
  return allowedCoolantTypes.includes(coolerType);
}

/** Rack type catalog. Each rack defines slot count, allowed cooler families, passive cooling, and power efficiency. */


export const RACK_CATALOG = [
  {
    id: "starter_rack",
    label: "2-Slot GPU Rack",
    description: "Open floor rack for your first two GPUs. Air cooling only.",
    slotCapacity: 2,
    allowedCoolantTypes: ["air"] as const,
    passiveCoolingKw: 0.35,
    powerEfficiency: 1.0,
    unlockDataTokens: 0,
    buyPrice: 200,
  },
  {
    id: "air_rack_4",
    label: "4-GPU Air Rack",
    description: "Enclosed air-cooled cabinet. Room for a third GPU before you need a fan.",
    slotCapacity: 4,
    allowedCoolantTypes: ["air"] as const,
    passiveCoolingKw: 0.3,
    powerEfficiency: 1.0,
    unlockDataTokens: 300,
    buyPrice: 1500,
  },
  {
    id: "air_rack_6",
    label: "6-GPU Air Rack",
    description: "Mid-size air rack for growing labs.",
    slotCapacity: 6,
    allowedCoolantTypes: ["air"] as const,
    passiveCoolingKw: 0.5,
    powerEfficiency: 1.0,
    unlockDataTokens: 800,
    buyPrice: 3000,
  },
  {
    id: "water_rack_4",
    label: "Quad Water Rack",
    description: "Compact rack built for water loops only.",
    slotCapacity: 4,
    allowedCoolantTypes: ["water"] as const,
    passiveCoolingKw: 0.4,
    powerEfficiency: 0.95,
    unlockDataTokens: 1500,
    buyPrice: 5000,
  },
  {
    id: "server_rack_8_water",
    label: "8-GPU Water Server Rack",
    description: "Dense water-cooled server rack with improved power efficiency.",
    slotCapacity: 8,
    allowedCoolantTypes: ["water"] as const,
    passiveCoolingKw: 0.6,
    powerEfficiency: 0.85,
    unlockDataTokens: 3000,
    buyPrice: 12000,
  },
  {
    id: "server_rack_12",
    label: "12-GPU Server Rack",
    description: "Full server cabinet. Accepts air or water coolers.",
    slotCapacity: 12,
    allowedCoolantTypes: ["air", "water"] as const,
    passiveCoolingKw: 0.8,
    powerEfficiency: 0.85,
    unlockDataTokens: 6000,
    buyPrice: 15000,
  },
  {
    id: "water_server_rack_12",
    label: "12-GPU Water Server Rack",
    description: "Water-first server rack. Also LN2 compatible for extreme builds.",
    slotCapacity: 12,
    allowedCoolantTypes: ["water", "ln2"] as const,
    passiveCoolingKw: 0.8,
    powerEfficiency: 0.8,
    unlockDataTokens: 12000,
    buyPrice: 22000,
  },
  {
    id: "ln2_rack_16",
    label: "16-GPU LN2 Rack",
    description: "Purpose-built for liquid nitrogen cooling only.",
    slotCapacity: 16,
    allowedCoolantTypes: ["ln2"] as const,
    passiveCoolingKw: 1.0,
    powerEfficiency: 0.8,
    unlockDataTokens: 25000,
    buyPrice: 35000,
  },
  {
    id: "medium_server_rack_24",
    label: "24-GPU Medium Server Rack",
    description: "Datacenter-scale cabinet. Accepts any cooler type.",
    slotCapacity: 24,
    allowedCoolantTypes: ["air", "water", "ln2"] as const,
    passiveCoolingKw: 1.2,
    powerEfficiency: 0.75,
    unlockDataTokens: 50000,
    buyPrice: 50000,
  },
] as const;

export type RackCatalogId = (typeof RACK_CATALOG)[number]["id"];

/** Default 2-slot rack — tutorial and new-player starter build item. */
export const STARTER_RACK_CATALOG_ID = "starter_rack" as const satisfies RackCatalogId;

export const RACK_CATALOG_ID_VALUES = RACK_CATALOG.map((rack) => rack.id) as [
  RackCatalogId,
  RackCatalogId,
  ...RackCatalogId[],
];

export interface RackCatalogDefinition {
  id: RackCatalogId;
  label: string;
  description: string;
  slotCapacity: number;
  allowedCoolantTypes: readonly RackCoolantType[];
  passiveCoolingKw: number;
  powerEfficiency: number;
  unlockDataTokens: number;
  buyPrice: number;
}

export function getRackCatalogDefinition(id: RackCatalogId | string): RackCatalogDefinition {
  const rack = RACK_CATALOG.find((entry) => entry.id === id);
  if (rack) return rack;
  return RACK_CATALOG[0];
}

export function isRackCatalogId(value: string): value is RackCatalogId {
  return RACK_CATALOG.some((rack) => rack.id === value);
}

export function getRackCatalogSlotCapacity(rackType: string): number {
  if (isRackCatalogId(rackType)) {
    return getRackCatalogDefinition(rackType).slotCapacity;
  }
  return 2;
}

export function resolveRackCatalogId(rackType: string): RackCatalogId | null {
  return isRackCatalogId(rackType) ? rackType : null;
}
