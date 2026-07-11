/**
 * Policy for composing sky backdrops with `PlayableGame.lighting`:
 * - authored lighting present → sky renders dome + fog only; lights stay game-owned
 * - no authored lighting → sky may emit its default sun/hemisphere with the dome
 * Time-of-day never rewrites configured lights; it only drives sky colors/fog (and
 * sky-owned lights when the game did not author lighting).
 */
export type SkyLightOwnership = "authored" | "sky-default";

export function resolveSkyLightOwnership(hasAuthoredLighting: boolean): SkyLightOwnership {
  return hasAuthoredLighting ? "authored" : "sky-default";
}

export function skyEmitsLights(ownership: SkyLightOwnership): boolean {
  return ownership === "sky-default";
}
