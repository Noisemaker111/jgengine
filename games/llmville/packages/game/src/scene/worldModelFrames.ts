import type { AssetFrame } from "@llmville/game/scene/assetBounds";
import type { GridFootprint } from "@llmville/game/world/grid";

export interface WorldModelFrameEntry {
  footprint?: GridFootprint;
  frame?: AssetFrame;
  defaultScale?: number | [number, number, number];
  basePosition?: [number, number, number];
  baseRotation?: [number, number, number];
  baseScale?: number | [number, number, number];
}

/** Minimal spatial contract per catalog model key (keys with a GLB modelPath). */
export const WORLD_MODEL_FRAMES: Partial<Record<string, WorldModelFrameEntry>> = {
  neon_sign: { footprint: { width: 1, depth: 1 } },
  potted_plant: { footprint: { width: 1, depth: 1 } },
  holo_poster: { footprint: { width: 1, depth: 1 } },
  llmville_banner: { footprint: { width: 1, depth: 1 } },
  motivational_poster: { footprint: { width: 1, depth: 1 } },
  ethernet_art_display: { footprint: { width: 1, depth: 1 } },
  office_plant_large: { footprint: { width: 2, depth: 2 } },
  fiber_optic_tree: { footprint: { width: 1, depth: 1 } },
  cable_tidy_bin: { footprint: { width: 1, depth: 1 } },
  folding_chair: { footprint: { width: 1, depth: 1 } },
  rug_corner: { footprint: { width: 2, depth: 2 } },
  yoga_mat_corner: { footprint: { width: 1, depth: 2 } },
  snack_fridge: { footprint: { width: 2, depth: 1 } },
  energy_drink_crate: { footprint: { width: 1, depth: 1 } },
  side_table: { footprint: { width: 1, depth: 1 } },
  monitor_stand: { footprint: { width: 1, depth: 1 } },
  bookshelf_unit: { footprint: { width: 1, depth: 1 } },
  trophy_shelf: { footprint: { width: 1, depth: 2 } },
  server_plushie: { footprint: { width: 1, depth: 1 } },
  wall_clock: { footprint: { width: 1, depth: 1 } },
  desk_lamp: { footprint: { width: 1, depth: 1 } },
  beanbag_corner: { footprint: { width: 2, depth: 2 } },
  coffee_cart: { footprint: { width: 2, depth: 1 } },
  whiteboard_wall: { footprint: { width: 2, depth: 1 } },
  garage_bookshelf: {
    footprint: { width: 1, depth: 1 },
    frame: { anchor: "floor-center", fitFootprint: true },
  },
  gpu_1: {},
  gpu_2: {},
  gpu_3: {},
  gpu_4: {},
  gpu_5: {},
  gpu_6: {},
  gpu_7: {},
  gpu_8: {},
};