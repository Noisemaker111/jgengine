import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { UPGRADE_KINDS } from "./upgrades";

// Module URLs survive both the standalone build and the engine's configured /play host.
export const buggyModel: ModelConfig = { url: new URL("./row-six-buggy.glb", import.meta.url).href, anchor: "origin" };

/** Rival karts are the welded buggy in yard paint with one roof shape each (slab, fin, hoop), so the field reads apart at speed. */
const rivalModel = (roof: string, color: string): ModelConfig => ({
  url: new URL(`./row-six-rival-${roof}.glb`, import.meta.url).href,
  anchor: "origin",
  material: { color, roughness: 0.72 },
});
export const rivalKartModels: Record<string, ModelConfig> = {
  kart_rival_tally: rivalModel("tally", "#2f8f7a"),
  kart_rival_moss: rivalModel("moss", "#b7a13a"),
  kart_rival_hobbs: rivalModel("hobbs", "#7a3fb0"),
};

/** The best-run ghost: the same buggy as see-through teal glass, so it never reads as a rival. */
export const ghostKartModel: ModelConfig = {
  ...buggyModel,
  material: { color: "#5de0ce", emissive: "#5de0ce", emissiveIntensity: 0.55, roughness: 0.4, alphaMode: "blend", opacity: 0.32 },
};
export const upgradeModels: Record<string, ModelConfig> = {
  [UPGRADE_KINDS.salvage_v6]: { url: new URL("./upgrade-salvage_v6.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.truck_engine]: { url: new URL("./upgrade-truck_engine.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.ev_conversion]: { url: new URL("./upgrade-ev_conversion.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.plow_blade]: { url: new URL("./upgrade-plow_blade.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.hood_plate]: { url: new URL("./upgrade-hood_plate.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.fan_blade_vanes]: { url: new URL("./upgrade-fan_blade_vanes.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.coil_springs]: { url: new URL("./upgrade-coil_springs.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.steel_rims]: { url: new URL("./upgrade-steel_rims.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.monster_treads]: { url: new URL("./upgrade-monster_treads.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.scrap_frame]: { url: new URL("./upgrade-scrap_frame.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.roll_cage]: { url: new URL("./upgrade-roll_cage.glb", import.meta.url).href, anchor: "origin" },
  [UPGRADE_KINDS.armor_plating]: { url: new URL("./upgrade-armor_plating.glb", import.meta.url).href, anchor: "origin" },
};
export const jumpBarrierModel: ModelConfig = { url: new URL("./jump-barrier.glb", import.meta.url).href, anchor: "origin" };
export const jumpCueModel: ModelConfig = { url: new URL("./jump-cue.glb", import.meta.url).href, anchor: "origin", shadows: "none" };
export const stationModels: Record<string, ModelConfig> = {
  pickup_engine: { url: new URL("./pickup-engine.glb", import.meta.url).href, anchor: "origin" },
  pickup_front: { url: new URL("./pickup-front.glb", import.meta.url).href, anchor: "origin" },
  pickup_wheels: { url: new URL("./pickup-wheels.glb", import.meta.url).href, anchor: "origin" },
  pickup_frame: { url: new URL("./pickup-frame.glb", import.meta.url).href, anchor: "origin" },
};
