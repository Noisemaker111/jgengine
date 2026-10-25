/**
 * Shared builder screenshot API constants for the Vite dev plugin and browser UI.
 */

export const BUILDER_SCREENSHOT_ANGLES = ["viewport", "perspective", "top", "side"] as const;
export type BuilderScreenshotAngle = (typeof BUILDER_SCREENSHOT_ANGLES)[number];

/** Preset cameras — only captured when explicitly requested via POST /screenshot/request. */
export const PRESET_CAPTURE_ANGLES: readonly BuilderScreenshotAngle[] = ["perspective", "top", "side"];

/** Default on-demand capture — viewport only so the user's camera stays put. */
export const DEFAULT_AGENT_CAPTURE_ANGLES: readonly BuilderScreenshotAngle[] = ["viewport"];

/** Full capture set when an agent explicitly wants preset angles too. */
export const FULL_AGENT_CAPTURE_ANGLES: readonly BuilderScreenshotAngle[] = [
  "viewport",
  "perspective",
  "top",
  "side",
];

export function isBuilderScreenshotAngle(value: string): value is BuilderScreenshotAngle {
  return (BUILDER_SCREENSHOT_ANGLES as readonly string[]).includes(value);
}

export function parseCaptureAngles(raw: unknown, defaultAngles: readonly BuilderScreenshotAngle[] = DEFAULT_AGENT_CAPTURE_ANGLES): BuilderScreenshotAngle[] | null {
  if (raw === undefined) return [...defaultAngles];
  if (!Array.isArray(raw)) return null;
  const angles: BuilderScreenshotAngle[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || !isBuilderScreenshotAngle(entry)) return null;
    if (!angles.includes(entry)) angles.push(entry);
  }
  return angles.length > 0 ? angles : null;
}