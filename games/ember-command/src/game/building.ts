import type { WorkQueueConfig } from "@jgengine/core/gameplay";

import { BUILDINGS } from "./catalog";

/** A placed-but-not-yet-raised building: its type and where it goes. */
export interface BuildSpec {
  type: string;
  x: number;
  z: number;
}

/** The construction queue config — duration is the building's build time; completion output is the
 * placement the systems tick raises into a real building entity. Several may raise at once. */
export const BUILD_CONFIG: WorkQueueConfig<BuildSpec, undefined, BuildSpec> = {
  duration: (spec) => BUILDINGS[spec.type]?.buildSeconds ?? 0,
  concurrency: 6,
  output: (job) => job.spec,
};
