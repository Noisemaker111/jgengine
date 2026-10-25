import { createAssetCatalog, type AssetCatalog, type ModelAssetRef } from "@jgengine/core/scene/assetCatalog";
import type { AssetFrame } from "@llmville/game/world/assetFrame";
import type { GridFootprint } from "@llmville/game/world/grid";

export const WORLD_MODEL_CATEGORY = {
  infrastructure: "infrastructure",
  decor: "decor",
  furniture: "furniture",
  hardware: "hardware",
} as const;

export type WorldModelCategory = (typeof WORLD_MODEL_CATEGORY)[keyof typeof WORLD_MODEL_CATEGORY];

export interface WorldModelAsset {
  label: string;
  prompt: string;
  suggestedPath: string;
  modelPath?: string;
  category?: WorldModelCategory;
  footprint?: GridFootprint;
  /** Spatial contract: forward axis, anchor, footprint fit. Prefer over baseRotation/baseScale. */
  frame?: AssetFrame;
  defaultScale?: number | [number, number, number];
  basePosition?: [number, number, number];
  /** @deprecated Prefer frame.sourceForward + frame.correction */
  baseRotation?: [number, number, number];
  baseScale?: number | [number, number, number];
}

function createAsset(
  label: string,
  slug: string,
  prompt: string,
  options: Pick<WorldModelAsset, "modelPath" | "category" | "footprint" | "frame" | "defaultScale" | "basePosition" | "baseRotation" | "baseScale"> = {},
): WorldModelAsset {
  return {
    label,
    prompt,
    suggestedPath: `/models/${slug}.glb`,
    ...options,
  };
}

export const LOW_END_GPU_IDS = [
  "gpu_1", "gpu_2", "gpu_3", "gpu_4",
  "gpu_5", "gpu_6", "gpu_7", "gpu_8",
] as const;

function createGpuAsset(
  id: string,
  label: string,
  options?: Pick<WorldModelAsset, "modelPath">,
): WorldModelAsset {
  const isLowEnd = (LOW_END_GPU_IDS as readonly string[]).includes(id);
  return createAsset(
    label,
    `hardware/${id}`,
    `${label} graphics card for an AI lab tycoon game, isolated hero prop, accurate board proportions, visible cooler shroud and PCIe bracket, realistic materials, slightly stylized but grounded, game-ready topology, clean UVs, fully textured PBR, no background, no stand, origin centered for easy placement`,
    isLowEnd ? { modelPath: "/models/hardware/low-end-gpu.glb", category: WORLD_MODEL_CATEGORY.hardware, ...options } : { category: WORLD_MODEL_CATEGORY.hardware, ...options },
  );
}

export const WORLD_MODEL_CATALOG = {
  neon_sign: createAsset(
    "Neon Sign",
    "decor/neon-sign",
    "Wall-mounted neon startup sign for a cozy AI lab game, futuristic tubing, readable silhouette, metal backplate, soft emissive glow baked into textures, compact hero prop, game-ready topology, isolated asset, no background",
    { modelPath: "/models/decor/neon-sign.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  potted_plant: createAsset(
    "Potted Plant",
    "decor/potted-plant",
    "Cozy office potted plant for an AI startup game, ceramic planter, lush leafy silhouette, slightly stylized realistic leaves, clean readable shape from gameplay distance, fully textured PBR, game-ready topology, isolated asset, no background",
    { modelPath: "/models/decor/potted-plant.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  holo_poster: createAsset(
    "Holo Poster",
    "decor/holo-poster",
    "Freestanding holographic poster stand for an AI lab tycoon game, slim metal support, translucent display panel, sci-fi benchmark poster vibe, clean emissive surfaces, fully textured PBR, game-ready topology, isolated asset, no background",
    { modelPath: "/models/decor/holo-poster.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  llmville_banner: createAsset(
    "LLMville Banner",
    "decor/llmville-banner",
    "Fabric skyline banner for a startup lab interior.",
    { modelPath: "/models/decor/llmville-banner.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  motivational_poster: createAsset(
    "Move Fast Poster",
    "decor/motivational-poster",
    "Wall poster with bold startup typography.",
    { modelPath: "/models/decor/motivational-poster.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  ethernet_art_display: createAsset(
    "Cable Art Panel",
    "decor/ethernet-art-display",
    "Rainbow patch cable wall art panel.",
    { modelPath: "/models/decor/cable-art-panel.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  office_plant_large: createAsset(
    "Floor Plant",
    "decor/office-plant-large",
    "Tall potted plant for lab corners.",
    { modelPath: "/models/decor/office-plant-large.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 2, depth: 2 } },
  ),
  fiber_optic_tree: createAsset(
    "Fiber Tree",
    "decor/fiber-optic-tree",
    "Blinking fiber optic accent tree in a planter.",
    { modelPath: "/models/decor/fiber-optic-tree.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  cable_tidy_bin: createAsset(
    "Cable Tidy Bin",
    "decor/cable-tidy-bin",
    "Labeled bin for spare networking cable.",
    { modelPath: "/models/decor/cable-tidy-bin.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  folding_chair: createAsset(
    "Folding Chair",
    "decor/folding-chair",
    "Compact metal folding chair.",
    { modelPath: "/models/decor/folding-chair.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  rug_corner: createAsset(
    "Corner Rug",
    "decor/rug-corner",
    "Low-pile corner rug.",
    { modelPath: "/models/decor/rug-corner.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 2, depth: 2 } },
  ),
  yoga_mat_corner: createAsset(
    "Stretch Mat",
    "decor/yoga-mat-corner",
    "Foam wellness mat for the lab floor.",
    { modelPath: "/models/decor/yoga-mat-corner.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 2 } },
  ),
  snack_fridge: createAsset(
    "Snack Fridge",
    "decor/snack-fridge",
    "Mini fridge for the operator break zone.",
    { modelPath: "/models/decor/snack-fridge.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 2, depth: 1 } },
  ),
  energy_drink_crate: createAsset(
    "Energy Drink Crate",
    "decor/energy-drink-crate",
    "Wire crate of canned energy drinks.",
    { modelPath: "/models/decor/energy-drink-crate.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  side_table: createAsset(
    "Side Table",
    "decor/side-table",
    "Small round side table.",
    { modelPath: "/models/decor/side-table.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  monitor_stand: createAsset(
    "Monitor Riser",
    "decor/monitor-stand",
    "Desk monitor riser shelf.",
    { modelPath: "/models/decor/monitor-stand.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  bookshelf_unit: createAsset(
    "Bookshelf",
    "decor/bookshelf-unit",
    "Wood bookshelf with storage boxes.",
    { modelPath: "/models/furniture/bookshelf.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  trophy_shelf: createAsset(
    "Trophy Shelf",
    "decor/trophy-shelf",
    "Narrow display shelf for trophies.",
    { modelPath: "/models/decor/trophy-shelf.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 2 } },
  ),
  server_plushie: createAsset(
    "Server Plushie",
    "decor/server-plushie",
    "Cute rack mascot plush toy.",
    { modelPath: "/models/decor/server-plushie.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  wall_clock: createAsset(
    "Wall Clock",
    "decor/wall-clock",
    "Analog wall clock.",
    { modelPath: "/models/decor/wall-clock.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  desk_lamp: createAsset(
    "Desk Lamp",
    "decor/desk-lamp",
    "Articulated desk lamp.",
    { modelPath: "/models/decor/desk-lamp.glb", category: WORLD_MODEL_CATEGORY.decor, footprint: { width: 1, depth: 1 } },
  ),
  beanbag_corner: createAsset(
    "Beanbag Corner",
    "furniture/beanbag-corner",
    "Cozy oversized beanbag lounge chair for an indie AI tycoon game, soft fabric folds, plush volume, warm modern color palette, realistic stitching and seams, fully textured PBR, game-ready topology, isolated asset, no background",
    { modelPath: "/models/furniture/beanbag-corner.glb", category: WORLD_MODEL_CATEGORY.furniture, footprint: { width: 2, depth: 2 } },
  ),
  coffee_cart: createAsset(
    "Coffee Cart",
    "furniture/coffee-cart",
    "Compact office coffee cart for a startup game, rolling metal frame, espresso machine, mugs and utility shelf, cozy premium breakroom styling, fully textured PBR, game-ready topology, isolated asset, no background",
    { modelPath: "/models/furniture/coffee-cart.glb", category: WORLD_MODEL_CATEGORY.furniture, footprint: { width: 2, depth: 1 } },
  ),
  whiteboard_wall: createAsset(
    "Whiteboard Wall",
    "furniture/whiteboard-wall",
    "Large wall whiteboard for an AI startup lab, aluminum frame, marker tray, faint equations and architecture sketches, realistic materials, clean readable silhouette, fully textured PBR, game-ready topology, isolated asset, no background",
    { modelPath: "/models/furniture/whiteboard-wall.glb", category: WORLD_MODEL_CATEGORY.furniture, footprint: { width: 2, depth: 1 } },
  ),
  garage_bookshelf: createAsset(
    "Garage Bookshelf",
    "furniture/bookshelf",
    "Garage storage bookshelf with boxes and clutter for a scrappy AI founder space, wood shelves, readable silhouette, fully textured PBR, game-ready topology, isolated asset, no background",
    {
      modelPath: "/models/furniture/bookshelf.glb",
      category: WORLD_MODEL_CATEGORY.furniture,
      footprint: { width: 1, depth: 1 },
      frame: {
        anchor: "floor-center",
        fitFootprint: true,
      },
    },
  ),
  gpu_1: createGpuAsset("gpu_1", "GTX 1060"),
  gpu_2: createGpuAsset("gpu_2", "GTX 1070"),
  gpu_3: createGpuAsset("gpu_3", "GTX 1080"),
  gpu_4: createGpuAsset("gpu_4", "GTX 1080 Ti"),
  gpu_5: createGpuAsset("gpu_5", "RTX 2060"),
  gpu_6: createGpuAsset("gpu_6", "RTX 2070"),
  gpu_7: createGpuAsset("gpu_7", "RTX 2080"),
  gpu_8: createGpuAsset("gpu_8", "RTX 2080 Ti"),
  gpu_9: createGpuAsset("gpu_9", "RTX 3060"),
  gpu_10: createGpuAsset("gpu_10", "RTX 3070"),
  gpu_11: createGpuAsset("gpu_11", "RTX 3080"),
  gpu_12: createGpuAsset("gpu_12", "RTX 3090"),
  gpu_13: createGpuAsset("gpu_13", "RTX 4060 Ti"),
  gpu_14: createGpuAsset("gpu_14", "RTX 4070 Ti"),
  gpu_15: createGpuAsset("gpu_15", "RTX 4080"),
  gpu_16: createGpuAsset("gpu_16", "RTX 4090"),
  gpu_17: createGpuAsset("gpu_17", "RTX A4000"),
  gpu_18: createGpuAsset("gpu_18", "RTX A5000"),
  gpu_19: createGpuAsset("gpu_19", "RTX A6000"),
  gpu_20: createGpuAsset("gpu_20", "A100 40GB"),
  gpu_21: createGpuAsset("gpu_21", "A100 80GB"),
  gpu_22: createGpuAsset("gpu_22", "H100"),
  gpu_23: createGpuAsset("gpu_23", "H200"),
  gpu_24: createGpuAsset("gpu_24", "B200"),
} as const satisfies Record<string, WorldModelAsset>;

export type WorldModelId = keyof typeof WORLD_MODEL_CATALOG;

export function getWorldModelAsset(id: string | null | undefined): WorldModelAsset | null {
  if (!id) return null;
  return WORLD_MODEL_CATALOG[id as WorldModelId] ?? null;
}

export interface WorldModelAssetRef extends ModelAssetRef, WorldModelAsset {}

function buildWorldModelAssetCatalog(): AssetCatalog<WorldModelAssetRef> {
  const catalog = createAssetCatalog<WorldModelAssetRef>();
  for (const [id, asset] of Object.entries(WORLD_MODEL_CATALOG)) {
    if (!asset.modelPath) continue;
    catalog.register(id, { ...asset, url: asset.modelPath });
  }
  return catalog;
}

export const worldModelAssetCatalog: AssetCatalog<WorldModelAssetRef> = buildWorldModelAssetCatalog();

const GPU_IMAGE_MAP: Record<string, string> = {
  // Spliced from user-provided sheet (25 individual GPUs)
  "gpu_1": "/images/gpus/gtx-1060.png",
  "gpu_2": "/images/gpus/gtx-1070.png",
  "gpu_3": "/images/gpus/gtx-1080.png",
  "gpu_4": "/images/gpus/gtx-1080-ti.png",
  "gpu_5": "/images/gpus/rtx-2060.png",
  "gpu_6": "/images/gpus/rtx-2070.png",
  "gpu_7": "/images/gpus/rtx-2080.png",
  "gpu_8": "/images/gpus/rtx-2080-ti.png",
  "gpu_9": "/images/gpus/rtx-3060.png",
  "gpu_10": "/images/gpus/rtx-3070.png",
  "gpu_11": "/images/gpus/rtx-3080.png",
  "gpu_12": "/images/gpus/rtx-3090.png",
  "gpu_13": "/images/gpus/rtx-4060-ti.png",
  "gpu_14": "/images/gpus/rtx-4070-ti.png",
  "gpu_15": "/images/gpus/rtx-4080.png",
  "gpu_16": "/images/gpus/rtx-4090.png",
  "gpu_25": "/images/gpus/rtx-5090.png",

  // Additional / fallbacks for datacenter and others (can be improved later)
  "gpu_17": "/images/gpus/rtx-4080.png",
  "gpu_18": "/images/gpus/rtx-4090.png",
  "gpu_19": "/images/gpus/rtx-5090.png",
  "gpu_20": "/images/gpus/rtx-5090.png",
  "gpu_21": "/images/gpus/rtx-5090.png",
  "gpu_22": "/images/gpus/rtx-5090.png",
  "gpu_23": "/images/gpus/rtx-5090.png",
  "gpu_24": "/images/gpus/rtx-5090.png",
  "gpu_26": "/images/gpus/rtx-5090.png",
  "gpu_27": "/images/gpus/rtx-5090.png",
  "gpu_28": "/images/gpus/rtx-4080.png",
  "gpu_29": "/images/gpus/rtx-4090.png",
  "gpu_30": "/images/gpus/rtx-5090.png",
  "gpu_31": "/images/gpus/rtx-5090.png",
  "gpu_32": "/images/gpus/rtx-5090.png",
  "gpu_33": "/images/gpus/rtx-5090.png",
  "gpu_34": "/images/gpus/rtx-5090.png",
  "gpu_35": "/images/gpus/rtx-5090.png",

  // Legacy low/med fallbacks if needed
  "gpu_0": "/images/gpus/gtx-750-ti.png",
};

export function getHardwareImagePath(hardwareId: string | null | undefined): string {
  if (!hardwareId) return "/images/gpus/gtx-1060.png";
  return GPU_IMAGE_MAP[hardwareId] || "/images/gpus/gtx-1060.png";
}
