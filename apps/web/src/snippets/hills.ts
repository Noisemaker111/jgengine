import { fractalNoise } from "@jgengine/core/terrain/terrain";
import { vertices } from "./myWorld";

const cfg = {
  seed: 1337,
  frequency: 1.1,
  octaves: 4,
  lacunarity: 2,
  persistence: 0.5,
  ridged: false,
};

for (const v of vertices) {
  v.y = fractalNoise(v.x, v.z, cfg);
}
