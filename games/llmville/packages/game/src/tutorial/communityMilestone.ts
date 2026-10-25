export const COMMUNITY_LAUNCH_TARGET = 5;

export function communityMilestone(launchedLabs: number) {
  return {
    target: COMMUNITY_LAUNCH_TARGET,
    progress: Math.min(COMMUNITY_LAUNCH_TARGET, Math.max(0, launchedLabs)),
    complete: launchedLabs >= COMMUNITY_LAUNCH_TARGET,
    title: "A neighborhood of makers",
    reward: "Founding neighborhood badge",
  };
}
