import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { assets } from "../assets";
import { FREIGHT_CAR_ENTITY } from "../entities/catalog";
import { TRACK_OBJECT } from "../objects/catalog";
import { authored } from "./models";

/**
 * The departments' dressing: the store fixtures authored for this game (shelving, freezers, TV walls,
 * racking, ceiling lights and every set-piece) plus a few catalog pack pieces where a pack already
 * has the right thing - the garden centre's trees and shrubs, its lamp posts, the conveyor slabs,
 * stockroom cardboard and traffic cones.
 */
function kit(id: string, overrides: Partial<ModelConfig> = {}): ModelConfig {
  const base = assets.resolve(id);
  if (base === null) throw new Error(`trackModels: unresolved asset id "${id}"`);
  return { url: base.url, dims: base.dims, ...overrides };
}

export const trackObjectModels: Record<string, ModelConfig> = {
  [TRACK_OBJECT.edgeGondola]: authored("gondola"),
  [TRACK_OBJECT.edgeFreezer]: authored("freezer"),
  [TRACK_OBJECT.edgeProduce]: authored("produce-bin"),
  [TRACK_OBJECT.edgeHedge]: authored("hedge"),
  [TRACK_OBJECT.edgeTvWall]: authored("tv-wall"),
  [TRACK_OBJECT.edgeToyShelf]: authored("toy-shelf"),
  [TRACK_OBJECT.edgeRacking]: authored("racking"),
  [TRACK_OBJECT.lampCeiling]: authored("ceiling-light", { shadows: "none" }),
  [TRACK_OBJECT.lampGarden]: kit("kaykit-city-builder/streetlight", { targetHeight: 6.5, material: { color: "#3a4a3a", metalness: 0.5, roughness: 0.5 } }),
  [TRACK_OBJECT.palletStack]: authored("pallet-stack"),
  [TRACK_OBJECT.boxPile]: kit("quaternius-toon-shooter/Cardboard_Boxes", { targetHeight: 1.6 }),
  [TRACK_OBJECT.cone]: kit("quaternius-toon-shooter/Traffic_Cone", { targetHeight: 0.8 }),
  [TRACK_OBJECT.wetFloor]: authored("wet-floor"),
  [TRACK_OBJECT.endcap]: authored("endcap"),
  [TRACK_OBJECT.cartCorral]: authored("cart-corral"),
  [TRACK_OBJECT.tree]: kit("kaykit-forest/Tree_1_A_Color1", { targetHeight: 7 }),
  [TRACK_OBJECT.bush]: kit("kaykit-forest/Bush_1_A_Color1", { targetHeight: 1.4 }),
  [TRACK_OBJECT.flowers]: authored("flower-cart"),
  [TRACK_OBJECT.gnome]: authored("gnome-pile"),
  [TRACK_OBJECT.tvBox]: authored("tv-boxes"),
  [TRACK_OBJECT.plush]: authored("plush-pile"),
  [TRACK_OBJECT.forklift]: authored("forklift"),
  [TRACK_OBJECT.tumbleBin]: authored("tumble-bin"),
  [TRACK_OBJECT.ballBlaster]: authored("ball-blaster"),
  [TRACK_OBJECT.tugCrossing]: authored("tug-crossing"),
  // A conveyor section: an 8 m square of black belt rubber laid flat in the aisle.
  [TRACK_OBJECT.conveyor]: kit("kaykit-space-base/terrain_low", { scale: 4, material: { color: "#15171b", roughness: 0.85, metalness: 0.3 } }),
  [TRACK_OBJECT.sprinkler]: authored("sprinkler"),
  [TRACK_OBJECT.deptSign]: authored("dept-sign", { shadows: "none" }),
  [TRACK_OBJECT.bigScreen]: authored("big-screen"),
};

export const trackEntityModels: Record<string, ModelConfig> = {
  [FREIGHT_CAR_ENTITY]: authored("tugger-cart"),
};
