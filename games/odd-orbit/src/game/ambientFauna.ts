import type { AmbientFaunaConfig } from "@jgengine/core/ambientFauna/ambientFaunaConfig";

import { HABITAT } from "./palette";

/** Garden life: drifting motes and a few glowflies over the bloom planter. The groups are `ambient_fauna` zones in editor.scene.json. */
export const ambientFauna: AmbientFaunaConfig = {
  species: {
    mote: { sprite: { color: HABITAT.flora, size: 0.05, glow: true } },
    glowfly: { sprite: { color: HABITAT.floraAlt, size: 0.08, glow: true } },
  },
};
