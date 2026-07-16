import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { assets } from "./assets";
import { GUEST_KINDS } from "./entities/guests/catalog";

const CITY = "kaykit-city-builder";
const NATURE = "quaternius-stylized-nature";
const CHAR = "kaykit-adventurers";

function model(id: string, targetHeight: number, extra?: Partial<ModelConfig>): ModelConfig {
  const base = assets.resolve(id)!;
  return { url: base.url, dims: base.dims, targetHeight, ...extra };
}

function scaled(id: string, scale: number, extra?: Partial<ModelConfig>): ModelConfig {
  const base = assets.resolve(id)!;
  return { url: base.url, dims: base.dims, scale, ...extra };
}

const GUEST_CHARACTERS: readonly { id: string; color: string; height: number }[] = [
  { id: `${CHAR}/Barbarian`, color: "#e2483d", height: 1.85 },
  { id: `${CHAR}/Knight`, color: "#2f9fd0", height: 1.9 },
  { id: `${CHAR}/Mage`, color: "#8a5cd0", height: 1.8 },
  { id: `${CHAR}/Rogue`, color: "#4fb04a", height: 1.75 },
  { id: `${CHAR}/Rogue_Hooded`, color: "#e85fa0", height: 1.75 },
];

export const entityModels: Record<string, ModelConfig> = Object.fromEntries(
  GUEST_KINDS.map((kind, i) => {
    const def = GUEST_CHARACTERS[i % GUEST_CHARACTERS.length]!;
    return [kind, model(def.id, def.height, { material: { color: def.color } })];
  }),
);

const CAROUSEL_CAR_COLORS = ["#e2483d", "#f0c53a", "#4fb04a", "#3f63d8"];

function carouselCars(): NonNullable<ModelConfig["parts"]> {
  const count = 4;
  const radius = 1.5;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return {
      model: model(`${CITY}/car_hatchback`, 0.75, {
        material: { color: CAROUSEL_CAR_COLORS[i % CAROUSEL_CAR_COLORS.length]! },
      }),
      position: [Math.cos(a) * radius, 0.4, Math.sin(a) * radius] as [number, number, number],
    };
  });
}

const CAROUSEL: ModelConfig = {
  ...model(`${CITY}/base`, 0.4, { material: { color: "#f06d9a", roughness: 0.7 } }),
  parts: [
    { model: model(`${CITY}/streetlight`, 3, { material: { color: "#ffd24a", metalness: 0.5 } }), position: [0, 0.4, 0] },
    ...carouselCars(),
  ],
};

const COASTER_STATION: ModelConfig = {
  ...model(`${CITY}/building_C_withoutBase`, 4.6, { material: { color: "#3f7be0" } }),
  parts: [
    { model: model(`${CITY}/car_taxi`, 1.1, { material: { color: "#ff5a3c" } }), position: [3.2, 0.55, 0] },
  ],
};

const FERRIS_GONDOLA_COLORS = ["#e2483d", "#f0c53a", "#4fb04a", "#3f63d8"];

function ferrisGondolas(): NonNullable<ModelConfig["parts"]> {
  const count = 8;
  const radius = 2.6;
  const gondolaY = 3.4;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return {
      model: model(`${CITY}/car_hatchback`, 0.9, {
        material: { color: FERRIS_GONDOLA_COLORS[i % FERRIS_GONDOLA_COLORS.length]! },
      }),
      position: [Math.cos(a) * radius, gondolaY, Math.sin(a) * radius] as [number, number, number],
    };
  });
}

const FERRIS_MAST_HEIGHT = 5.6;

const FERRIS_WHEEL: ModelConfig = {
  ...model(`${CITY}/building_H_withoutBase`, FERRIS_MAST_HEIGHT, { material: { color: "#33b1c9", metalness: 0.3 } }),
  parts: [...ferrisGondolas()],
};

const DROP_TOWER_HEIGHT = 8.2;

const DROP_TOWER: ModelConfig = {
  ...model(`${CITY}/building_H_withoutBase`, DROP_TOWER_HEIGHT, { material: { color: "#2a2f3a" } }),
  parts: [
    {
      model: model(`${CITY}/car_taxi`, 1.15, { material: { color: "#e2483d", emissive: "#e2483d", emissiveIntensity: 0.2 } }),
      position: [0, DROP_TOWER_HEIGHT * 0.45, 0],
    },
  ],
};

const TRACK_PIECE: ModelConfig = scaled(`${CITY}/road_straight`, 2.1, {
  material: { color: "#ff5a3c" },
});

const PATH_TILE: ModelConfig = scaled(`${CITY}/base`, 2, { material: { color: "#c8bfa6" } });

const FLOWERBED: ModelConfig = model(`${NATURE}/Flower_3_Group`, 1, {});

const JANITOR_POST: ModelConfig = {
  ...model(`${CITY}/dumpster`, 1.1, { material: { color: "#2b6db0" } }),
  parts: [
    { model: model(`${CITY}/trash_A`, 0.5), position: [1, 0, 0.6] },
    {
      model: model(`${CHAR}/Rogue_Hooded`, 1.8, { material: { color: "#2fb37a" } }),
      position: [-1.3, 0, 0.7],
    },
  ],
};

export const objectModels: Record<string, ModelConfig> = {
  ride_carousel: CAROUSEL,
  ride_coaster: COASTER_STATION,
  ride_ferris: FERRIS_WHEEL,
  ride_dropzone: DROP_TOWER,
  stall_food: model(`${CITY}/building_E_withoutBase`, 2.2, { material: { color: "#e8622a" } }),
  stall_drink: model(`${CITY}/building_F_withoutBase`, 2.2, { material: { color: "#2fb37a" } }),
  stall_souvenir: model(`${CITY}/building_D_withoutBase`, 2.2, { material: { color: "#8a5cd0" } }),
  track_piece: TRACK_PIECE,
  path_walk: PATH_TILE,
  deco_tree: model(`${NATURE}/CommonTree_3`, 3.2, {}),
  deco_flowerbed: FLOWERBED,
  deco_lamp: model(`${CITY}/streetlight`, 3, { material: { color: "#3a3f4c" } }),
  deco_fountain: model(`${CITY}/watertower`, 2.2, { material: { color: "#7fbfe0", metalness: 0.2 } }),
  deco_topiary: model(`${NATURE}/Bush_Common`, 1.8, { material: { color: "#2f7a34" } }),
  staff_janitor: JANITOR_POST,
};
