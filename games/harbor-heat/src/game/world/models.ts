import { librarySurfaceParameters, librarySurfaceScan } from "@jgengine/assets/catalogs/materialLibrary";
import { libraryModel } from "@jgengine/assets/catalogs/modelLibrary";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { MaterialAsset } from "@jgengine/core/material/materialAsset";

import { BUILDING_SPECS } from "./buildings";
import { resolveModelPlan, type ModelPick } from "@jgengine/core/model/resolveModel";

import { assets } from "../assets";
import { CAR_MODEL_NAME, CAST } from "./cast";
import { LIBRARY_PROPS } from "./props";

const art = (file: string): string => new URL(`../../art/${file}.glb`, import.meta.url).href;

/** Lacquered body paint: the clearcoat is what separates a car from a clay toy. */
const GLOSS = librarySurfaceParameters("paint/gloss");
/** The unit building every lot scales to its own width, depth and storey height. */
const CITY_BLOCK_URL = art("city-block");

/**
 * Traffic is the library's Khronos CarConcept (CC-BY 4.0) at its real 4.4 m length, resprayed per
 * kind: only the two body-paint materials take the colour, so glass, lights, tyres and trim keep
 * their own finish. The library has no cruiser or bus (`libraryModelGap("bus")`), so the HHPD
 * cruiser is the same car in a two-tone livery under an authored light bar, and the Islander is an
 * authored city bus (`scripts/author-harbor.mjs`).
 */
const CAR_PAINT = ["Paint 1 Carmine", "Paint 2 Carmine"];
function car(color: string): ModelConfig {
  return { ...libraryModel(CAR_MODEL_NAME), material: { ...GLOSS, color, materials: CAR_PAINT } };
}

/** The cruiser's white roof, doors and hood panel: the car's second paint slot. */
const HHPD_WHITE: MaterialAsset = {
  schemaVersion: 1,
  id: "harbor-heat/hhpd-white",
  name: "HHPD white",
  family: "standard",
  capabilities: ["pbr", "clearcoat"],
  surface: { ...GLOSS, color: "#eef1f5" },
};
const LIGHT_BAR_URL = new URL("../../art/hhpd-lightbar.glb", import.meta.url).href;

/** HHPD cruiser: navy body, white upper panels, red-and-blue bar on the roof. */
function cruiser(): ModelConfig {
  return {
    ...libraryModel(CAR_MODEL_NAME),
    material: { ...GLOSS, color: "#13213d", materials: ["Paint 1 Carmine"] },
    materialAssets: [HHPD_WHITE],
    materialAssignments: [{ selector: { slot: "Paint 2 Carmine" }, materialId: HHPD_WHITE.id }],
    parts: [{ model: { url: LIGHT_BAR_URL, anchor: "origin" }, position: [0, 1.17, -0.05] }],
  };
}

const castModels: Record<string, ModelConfig> = {
  ...Object.fromEntries(Object.entries(CAST).map(([id, name]) => [id, libraryModel(name)])),
  car_compact: car("#f2c14e"),
  car_muscle: car("#b8282e"),
  car_sport: car("#2fa8b8"),
  car_suv: car("#59664a"),
  car_cop: cruiser(),
  car_bus: { url: new URL("../../art/islander-bus.glb", import.meta.url).href, anchor: "origin" },
};

/** Aircraft are authored for Harbor Heat (`scripts/author-harbor-streets.mjs`): wheels and skids sit a metre under the origin, as the airframes' gear expects. */
const aircraft = (file: string, paintMaterial: string, color?: string): ModelConfig => ({
  url: art(file),
  anchor: "origin",
  ...(color === undefined ? {} : { material: { color, materials: [paintMaterial] } }),
});

/** The traffic cars the library's one sports car cannot be: Quaternius' real-size sedans and a taxi, as they were painted. */
const TRAFFIC_BODIES: Record<string, ModelPick> = {
  car_taxi: { model: "quaternius-lowpoly-cars/Taxi" },
  car_sedan: { model: "quaternius-lowpoly-cars/BasicCar" },
  car_hatch: { model: "quaternius-lowpoly-cars/SimpleCarShort" },
  car_coupe: { model: "quaternius-lowpoly-cars/SimpleCarHigh" },
};

export const entityModels: Record<string, ModelConfig> = {
  ...resolveModelPlan(assets, TRAFFIC_BODIES),
  air_helicopter: aircraft("helicopter", "heli paint"),
  air_trainer: aircraft("floatplane", "plane paint"),
  air_prop: aircraft("floatplane", "plane paint", "#7fd1c4"),
  air_jet: aircraft("jet", "jet paint"),
  air_vtol: aircraft("jet", "jet paint", "#f2c9a8"),
  boat_sail: { url: art("sailboat"), anchor: "origin" },
  boat_runabout: { url: art("runabout"), anchor: "origin" },
  heli_ambient: aircraft("helicopter", "heli paint", "#ff4f8b"),
  ...castModels,
};

/** Habitat species the scene document's flocks draw: gulls over the beach and the bay. */
export const flockModels: Record<string, ModelConfig> = { gull: { url: art("gull"), anchor: "origin" } };

/**
 * The palm is one authored GLB drawn at three street sizes, so all three species share its two
 * detail levels. Both levels come from the same parameters in `scripts/author-harbor.mjs`; the far
 * one keeps the crown's outline with fewer leaflets, rings and nuts. Past 60 m a palm is a
 * silhouette, and the engine's per-instance switch holds an instance on its level for 6 m either
 * side of the boundary.
 */
const PALM_URL = new URL("../../art/mainsail-palm.glb", import.meta.url).href;
const PALM_FAR_URL = new URL("../../art/mainsail-palm-far.glb", import.meta.url).href;
const PALM_VARIANTS = { levels: [{ url: PALM_URL, maxDistance: 60 }, { url: PALM_FAR_URL }] } as const;

/**
 * Street-tree planting cycle — `setup.ts` walks it so no two neighbours match.
 */
export const PALM_IDS: readonly string[] = [
  "obj_palm",
  "obj_palm_tall",
  "obj_palm_low",
  "obj_palm",
  "obj_palm_low",
  "obj_palm_tall",
];

/** Shop signs share one authored board; each shop paints it in its own colour. */
const shopSign = (color: string): ModelConfig => ({ url: art("shop-sign"), anchor: "origin", material: { color, materials: ["board"] } });
/** Containers share one authored box; the paint is the only difference. */
const container = (color: string): ModelConfig => ({ url: art("shipping-container"), anchor: "origin", material: { color, materials: ["container paint"] } });

const AUTHORED_OBJECTS: Record<string, ModelConfig> = {
  obj_gunshop_sign: shopSign("#ffb020"),
  obj_safehouse_sign: shopSign("#7fd1c4"),
  obj_hhpd_sign: shopSign("#4f7de8"),
  obj_neon: { url: art("neon-pole"), anchor: "origin" },
  obj_signal: { url: art("traffic-signal"), anchor: "origin" },
  obj_cargo: container("#d9694a"),
  obj_cargo_teal: container("#2c8c97"),
  obj_cargo_amber: container("#e0a53c"),
  obj_lamp_pool: { url: art("lamp-pool"), anchor: "origin" },
  obj_awning: { url: art("awning"), anchor: "origin" },
  obj_roof_a: { url: art("roof-clutter-a"), anchor: "origin" },
  obj_roof_b: { url: art("roof-clutter-b"), anchor: "origin" },
  obj_roof_c: { url: art("roof-clutter-c"), anchor: "origin" },
};

/**
 * Each cast is the unit block with one scanned facade on its walls; the roof keeps its own membrane.
 * Native size (no `targetHeight`): every placement scales it to its lot through `visual.scale`.
 */
const BUILDING_MODELS: Record<string, ModelConfig> = Object.fromEntries(
  BUILDING_SPECS.map((b) => [
    b.id,
    {
      url: CITY_BLOCK_URL,
      anchor: "origin",
      material: { color: b.paint, scan: librarySurfaceScan(b.facade, { tint: b.scanTint }), materials: ["facade"] },
    } satisfies ModelConfig,
  ]),
);

export const objectModels: Record<string, ModelConfig> = (() => {
  return {
    ...AUTHORED_OBJECTS,
    ...LIBRARY_PROPS,
    ...BUILDING_MODELS,
    // Driveways are the unit block flattened to a slab, in the sidewalk's concrete.
    obj_driveway: {
      url: CITY_BLOCK_URL,
      anchor: "origin",
      material: { color: "#c4beb2", scan: librarySurfaceScan("concrete/smooth", { tint: 0 }) },
    },
    // The plaza's paving is the same unit block flattened to a slab, laid in plaza stone.
    obj_plaza_paving: {
      url: CITY_BLOCK_URL,
      anchor: "origin",
      material: { color: "#e8cdb0", scan: librarySurfaceScan("paving/stone", { tint: 0.4 }), materials: ["facade", "roof"] },
    },
    obj_flametree: { url: PALM_URL, targetHeight: 6.8, anchor: "origin", variants: PALM_VARIANTS },
    obj_palm_planter: { url: PALM_URL, targetHeight: 5.8, anchor: "origin", variants: PALM_VARIANTS },
    obj_palm: { url: PALM_URL, targetHeight: 7.6, anchor: "origin", variants: PALM_VARIANTS },
    obj_palm_tall: { url: PALM_URL, targetHeight: 9, anchor: "origin", variants: PALM_VARIANTS },
    obj_palm_low: { url: PALM_URL, targetHeight: 6.2, anchor: "origin", variants: PALM_VARIANTS },
    obj_dispatch: { url: new URL("../../art/dispatch-booth.glb", import.meta.url).href, anchor: "origin" },
    obj_delivery_1: { url: new URL("../../art/parcel-tower-1.glb", import.meta.url).href, anchor: "origin" },
    obj_delivery_2: { url: new URL("../../art/parcel-tower-2.glb", import.meta.url).href, anchor: "origin" },
    obj_delivery_3: { url: new URL("../../art/parcel-tower-3.glb", import.meta.url).href, anchor: "origin" },
  };
})();
