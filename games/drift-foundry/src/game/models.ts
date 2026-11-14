import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { authored, chassisModels, ghostKartModel, rivalKartModels, shelfItemModels, shopperModel, stationModels, upgradeModels } from "./art/models";
import { trackEntityModels, trackObjectModels } from "./art/trackModels";
import { COMPACTOR_ENTITY, KART_GHOST_ENTITY, KART_PLAYER_ENTITY } from "./entities/catalog";
import {
  EXIT_GATE_ARCH,
  GATE_BARRICADE_JUMP,
  GATE_BARRICADE_PLOW,
  JUMP_CUE,
  MARBLE_SPILL,
  PICKUP_MARKER,
  PROP_AISLE_SIGN,
  PROP_BOX_PILE,
  PROP_CART_CORRAL,
  PROP_CEILING_LIGHT,
  PROP_ENDCAP,
  PROP_FREEZER,
  PROP_GONDOLA,
  PROP_GONDOLA_TALL,
  PROP_PALLET_STACK,
  PROP_WET_FLOOR,
} from "./objects/catalog";
import { assets } from "./assets";

function kit(id: string, overrides: Partial<ModelConfig> = {}): ModelConfig {
  const base = assets.resolve(id);
  if (base === null) throw new Error(`models: unresolved asset id "${id}"`);
  return { url: base.url, dims: base.dims, ...overrides };
}

export const entityModels: Record<string, ModelConfig> = {
  ...upgradeModels,
  ...rivalKartModels,
  ...chassisModels,
  [KART_PLAYER_ENTITY]: shopperModel,
  [KART_GHOST_ENTITY]: ghostKartModel,
  // The closing shutter with the ride-on floor scrubber and its full-width brush bar in front.
  [COMPACTOR_ENTITY]: authored("shutter-scrubber"),
  ...trackEntityModels,
};

export const objectModels: Record<string, ModelConfig> = {
  [PROP_PALLET_STACK]: authored("pallet-stack"),
  [PROP_ENDCAP]: authored("endcap"),
  [PROP_FREEZER]: authored("freezer"),
  [PROP_BOX_PILE]: authored("box-pile"),
  [PROP_GONDOLA]: authored("gondola"),
  [PROP_GONDOLA_TALL]: authored("gondola-tall"),
  [PROP_CART_CORRAL]: authored("cart-corral"),
  [PROP_WET_FLOOR]: authored("wet-floor"),
  [PROP_CEILING_LIGHT]: authored("ceiling-light-wide", { shadows: "none" }),
  [PROP_AISLE_SIGN]: authored("aisle-sign", { shadows: "none" }),
  [GATE_BARRICADE_PLOW]: authored("gate-box-wall"),
  [GATE_BARRICADE_JUMP]: authored("gate-pallet-ramp"),
  [JUMP_CUE]: authored("jump-cue", { shadows: "none" }),
  [MARBLE_SPILL]: authored("marble-spill", { shadows: "none" }),
  ...stationModels,
  ...shelfItemModels,
  [PICKUP_MARKER]: kit("quaternius-toon-shooter/Traffic_Cone", { targetHeight: 0.9 }),
  [EXIT_GATE_ARCH]: authored("checkout-arch"),
  ...trackObjectModels,
};

/** Pigeons that got in through the loading dock, circling under the roof: the authored habitats' species. */
export const flockModels: Record<string, ModelConfig> = {
  gull: kit("quaternius-5-low-poly-animals/bird", { targetHeight: 1.1, material: { color: "#8d95a3", roughness: 0.8 } }),
};
