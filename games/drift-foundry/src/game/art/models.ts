import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { UPGRADE_KINDS } from "./upgrades";

// Module URLs survive both the standalone build and the engine's configured /play host.
export const buggyModel: ModelConfig = { url: new URL("./cart-player.glb", import.meta.url).href, anchor: "origin" };

/** Rival karts are the welded buggy in yard paint with one roof shape each (slab, fin, hoop), so the field reads apart at speed. */
const rivalModel = (roof: string, color: string): ModelConfig => ({
  url: new URL(`./cart-rival-${roof}.glb`, import.meta.url).href,
  anchor: "origin",
  material: { color, roughness: 0.72 },
});
export const rivalKartModels: Record<string, ModelConfig> = {
  kart_rival_grandma: rivalModel("tally", "#2f8f7a"),
  kart_rival_twins: rivalModel("moss", "#b7a13a"),
  kart_rival_brick: rivalModel("hobbs", "#7a3fb0"),
};

/** The best-run ghost: the same buggy as see-through teal glass, so it never reads as a rival. */
export const ghostKartModel: ModelConfig = {
  ...buggyModel,
  material: { color: "#5de0ce", emissive: "#5de0ce", emissiveIntensity: 0.55, roughness: 0.4, alphaMode: "blend", opacity: 0.32 },
};
export const upgradeModels: Record<string, ModelConfig> = {
  [UPGRADE_KINDS.power_walker]: { url: new URL("./upgrade-power_walker.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.leaf_blower]: { url: new URL("./upgrade-leaf_blower.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.e_assist]: { url: new URL("./upgrade-e_assist.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.pallet_plow]: { url: new URL("./upgrade-pallet_plow.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.noodle_bumper]: { url: new URL("./upgrade-noodle_bumper.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.sign_spoiler]: { url: new URL("./upgrade-sign_spoiler.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.spring_casters]: { url: new URL("./upgrade-spring_casters.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.fixed_squeak]: { url: new URL("./upgrade-fixed_squeak.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.knobby_casters]: { url: new URL("./upgrade-knobby_casters.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.wire_basket]: { url: new URL("./upgrade-wire_basket.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.cage_basket]: { url: new URL("./upgrade-cage_basket.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.bin_lid_armor]: { url: new URL("./upgrade-bin_lid_armor.glb", import.meta.url).href, anchor: "origin" },
};
export const jumpBarrierModel: ModelConfig = { url: new URL("./jump-barrier.glb", import.meta.url).href, anchor: "origin" };
export const jumpCueModel: ModelConfig = { url: new URL("./jump-cue.glb", import.meta.url).href, anchor: "origin", shadows: "none" };
export const stationModels: Record<string, ModelConfig> = {
  pickup_engine: { url: new URL("./pickup-engine.glb", import.meta.url).href, anchor: "origin" },
  pickup_front: { url: new URL("./pickup-front.glb", import.meta.url).href, anchor: "origin" },
  pickup_wheels: { url: new URL("./pickup-wheels.glb", import.meta.url).href, anchor: "origin" },
  pickup_frame: { url: new URL("./pickup-frame.glb", import.meta.url).href, anchor: "origin" },
};
