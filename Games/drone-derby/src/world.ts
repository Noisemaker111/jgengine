import { building, environment, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";

const CONTAINER_STORIES: readonly [number, number] = [1, 3];
const WAREHOUSE_STORIES: readonly [number, number] = [3, 5];
const CONTAINER_FOOTPRINT = { w: 7, d: 7 };
const WAREHOUSE_FOOTPRINT = { w: 18, d: 14 };

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: 400, d: 400 },
    height: 2.2,
    frequency: 0.011,
    octaves: 3,
    baseHeight: -0.6,
    material: "rock",
    colors: { low: "#20242b", high: "#2c313b" },
    seed: "drone-derby-tarmac",
  }),
  sky: sky({ preset: "dusk", fog: { color: "#181b21", near: 70, far: 300 } }),
  structures: [
    building({
      position: [20, 60],
      count: 12,
      footprint: CONTAINER_FOOTPRINT,
      stories: CONTAINER_STORIES,
      storyHeight: 2.3,
      spacing: 3,
      style: "industrial",
      seed: "dd-containers-a",
    }),
    building({
      position: [110, -10],
      count: 12,
      footprint: CONTAINER_FOOTPRINT,
      stories: CONTAINER_STORIES,
      storyHeight: 2.3,
      spacing: 3,
      style: "industrial",
      seed: "dd-containers-b",
    }),
    building({
      position: [-10, -70],
      count: 10,
      footprint: CONTAINER_FOOTPRINT,
      stories: CONTAINER_STORIES,
      storyHeight: 2.3,
      spacing: 3,
      style: "industrial",
      seed: "dd-containers-c",
    }),
    building({
      position: [-80, 40],
      count: 10,
      footprint: CONTAINER_FOOTPRINT,
      stories: CONTAINER_STORIES,
      storyHeight: 2.3,
      spacing: 3,
      style: "industrial",
      seed: "dd-containers-d",
    }),
    building({
      position: [85, -60],
      count: 3,
      footprint: WAREHOUSE_FOOTPRINT,
      stories: WAREHOUSE_STORIES,
      storyHeight: 3.2,
      spacing: 6,
      style: "industrial",
      palette: { wall: "#3f4652", roof: "#23272f", storeSign: "#eab308" },
      seed: "dd-warehouse-a",
    }),
    building({
      position: [-95, -15],
      count: 3,
      footprint: WAREHOUSE_FOOTPRINT,
      stories: WAREHOUSE_STORIES,
      storyHeight: 3.2,
      spacing: 6,
      style: "industrial",
      palette: { wall: "#3f4652", roof: "#23272f", storeSign: "#eab308" },
      seed: "dd-warehouse-b",
    }),
  ],
});
