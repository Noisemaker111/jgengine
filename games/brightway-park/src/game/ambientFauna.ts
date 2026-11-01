import type { AmbientFaunaConfig } from "@jgengine/core/ambientFauna/ambientFaunaConfig";

/**
 * Life the art direction's pass 8 asks for. The gull groups are `ambient_fauna` zones in editor.scene.json;
 * this table says how they look. The catalog has no gull, so they use the nearest bird, the dove.
 */
export const ambientFauna: AmbientFaunaConfig = {
  species: {
    gull: {
      model: { url: "/models/imported/creatures/dove.glb", targetHeight: 0.6, material: { color: "#f4f1ea" } },
      sprite: { color: "#f4f1ea", size: 0.3, length: 3 },
    },
  },
  surface: 0,
};
