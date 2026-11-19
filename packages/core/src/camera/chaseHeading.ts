import type { ChaseCameraConfig } from "@jgengine/core/game/playableGame";

/** @capability chase-heading keep camera-relative input heading independent of body facing while retaining vehicle and seat camera follow */
export function resolveChaseHeading(
  config: Pick<ChaseCameraConfig, "headingSource" | "view"> | undefined,
  bodyYaw: number,
  inputYaw: number | undefined,
  initialYaw?: number,
): number {
  return config?.headingSource === "input" && (config.view ?? "chase") === "chase" ? inputYaw ?? initialYaw ?? bodyYaw : bodyYaw;
}
