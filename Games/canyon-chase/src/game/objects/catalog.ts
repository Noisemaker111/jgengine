export const OBJECT_IDS = {
  boulderRedrock: "boulder_redrock",
  boulderShadow: "boulder_shadow",
  scrubSage: "scrub_sage",
  wreckRig: "wreck_rig",
  driftwoodStump: "driftwood_stump",
  shadowWallSlab: "shadow_wall_slab",
  tumbleweedScreen: "tumbleweed_screen",
  angledDeceptionSlab: "angled_deception_slab",
  surveyMarker: "survey_marker",
  borderPost: "border_arch_post",
  borderBeam: "border_arch_beam",
  outpostCrate: "outpost_crate",
} as const;

export type ObjectCatalogId = (typeof OBJECT_IDS)[keyof typeof OBJECT_IDS];

export interface ObjectStyleEntry {
  readonly color: string;
  readonly opacity?: number;
}

export const objectStyles: Readonly<Record<ObjectCatalogId, ObjectStyleEntry>> = {
  [OBJECT_IDS.boulderRedrock]: { color: "#9c3820" },
  [OBJECT_IDS.boulderShadow]: { color: "#4b3b63" },
  [OBJECT_IDS.scrubSage]: { color: "#7d8c65" },
  [OBJECT_IDS.wreckRig]: { color: "#5b4a3d" },
  [OBJECT_IDS.driftwoodStump]: { color: "#6b5a45" },
  [OBJECT_IDS.shadowWallSlab]: { color: "#382c4d" },
  [OBJECT_IDS.tumbleweedScreen]: { color: "#e8d7c3" },
  [OBJECT_IDS.angledDeceptionSlab]: { color: "#7a2812" },
  [OBJECT_IDS.surveyMarker]: { color: "#ffc857" },
  [OBJECT_IDS.borderPost]: { color: "#caa46a" },
  [OBJECT_IDS.borderBeam]: { color: "#e8d7c3" },
  [OBJECT_IDS.outpostCrate]: { color: "#8c6a45" },
};
