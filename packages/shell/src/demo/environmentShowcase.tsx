import {
  building,
  environment,
  grass,
  ocean,
  rain,
  terrain,
} from "@jgengine/core/world/features";

import { EnvironmentScene } from "../environment/EnvironmentScene";
import type { PlayableGame } from "../registry";
import { demoGame } from "./demoGame";

export const showcaseEnvironment = environment({
  terrain: terrain({ bounds: { w: 220, d: 220 }, height: 4, frequency: 0.035, seed: "showcase", waterLevel: -1 }),
  vegetation: grass({ area: { w: 120, d: 120 }, density: 5, colors: ["#31531f", "#8fbf4a"], seed: "showcase" }),
  water: ocean({ bounds: { w: 520, d: 520 }, level: -1.4, waveHeight: 0.9, waveSpeed: 0.5, color: "#1f6f92" }),
  weather: rain({ area: { w: 160, d: 160, h: 70 }, density: 0.5, wind: [1.4, 0.4] }),
  structures: building({ count: 6, footprint: { w: 12, d: 9 }, stories: [3, 7], storyHeight: 2.8, spacing: 6, seed: "showcase" }),
});

export const environmentShowcaseGame: PlayableGame = {
  ...demoGame,
  environment: () => <EnvironmentScene feature={showcaseEnvironment} />,
};
