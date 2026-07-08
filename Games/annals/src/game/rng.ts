import { seededStreams } from "@jgengine/core/random/rng";

import { WORLD_SEED } from "./settlements";

export const historyRng = seededStreams(WORLD_SEED)("history");
