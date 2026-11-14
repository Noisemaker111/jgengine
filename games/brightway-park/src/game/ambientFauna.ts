import type { AmbientFaunaConfig } from "@jgengine/core/ambientFauna/ambientFaunaConfig";

import { assets } from "./assets";

const BAT = assets.resolve("quaternius-textured-cute-monster-pack/Bat");

/**
 * The bats that wheel over the pier. The flocks are `ambient_fauna` zones in editor.scene.json (their
 * species key, `gull`, predates the haunt); this table says how they look now.
 */
export const ambientFauna: AmbientFaunaConfig = {
  species: {
    gull: {
      model: { url: BAT?.url ?? "/models/imported/creatures/dove.glb", targetHeight: 0.55, material: { color: "#2a2238" } },
      sprite: { color: "#1a1424", size: 0.3, length: 3 },
    },
  },
  surface: 0,
};
