import type { WorkQueueConfig } from "@jgengine/core/gameplay";

import { buildingDef } from "./catalog";

export interface BuildSpec {
  type: string;
  x: number;
  z: number;
}

export const BUILD_CONFIG: WorkQueueConfig<BuildSpec, undefined, BuildSpec> = {
  duration: (spec) => buildingDef(spec.type)?.buildSeconds ?? 0,
  concurrency: 6,
  output: (job) => job.spec,
};
