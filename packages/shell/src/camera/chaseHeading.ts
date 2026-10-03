import type { ChaseCameraConfig } from "@jgengine/core/game/playableGame";

/**
 * Select a chase heading without feeding target facing or camera smoothing back into input-owned yaw.
 * Seat views always use body heading; omitting `headingSource` preserves body follow.
 *
 * @capability chase-heading keep camera-relative input heading independent of body facing while retaining vehicle and seat camera follow
 */
export function resolveChaseHeading(
  config: Pick<ChaseCameraConfig, "headingSource" | "view"> | undefined,
  bodyYaw: number,
  inputYaw: number,
): number {
  return config?.headingSource === "input" && (config.view ?? "chase") === "chase" ? inputYaw : bodyYaw;
}
