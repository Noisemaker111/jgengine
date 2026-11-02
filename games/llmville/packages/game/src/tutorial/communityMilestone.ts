import { createContributionPool } from "@jgengine/core/placement/buildPermissions";

export const COMMUNITY_LAUNCH_TARGET = 5;

/** The neighbourhood goal as a contribution pool: each lab that launches a model pays one in. */
export function communityMilestone(launchedLabs: number) {
  const pool = createContributionPool({ launchedLabs: COMMUNITY_LAUNCH_TARGET });
  pool.contribute("neighbourhood", "launchedLabs", launchedLabs);
  return {
    target: COMMUNITY_LAUNCH_TARGET,
    progress: pool.totals()["launchedLabs"] ?? 0,
    complete: pool.isComplete(),
    title: "A neighborhood of makers",
    reward: "Founding neighborhood badge",
  };
}
