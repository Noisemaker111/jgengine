export const OBJECT_IDS = {
  fencePost: "fence_post",
  wreckTruck: "storm_wreck_truck",
  wreckSilo: "storm_wreck_silo",
} as const;

export type PropCatalogId = (typeof OBJECT_IDS)[keyof typeof OBJECT_IDS];
