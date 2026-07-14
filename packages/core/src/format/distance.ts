/** Target unit for {@link formatDistance}: meters, kilometers, or `"auto"` (km past 1000m). */
export type DistanceUnit = "m" | "km" | "auto";

/** Options for {@link formatDistance}. */
export interface DistanceFormat {
  /** Target unit. `"auto"` switches to km at 1000m and above. Defaults to `"m"`. */
  unit?: DistanceUnit;
  /** Fractional digits to show. Defaults to 0 for meters, 1 for kilometers. */
  decimals?: 0 | 1 | 2;
  /** Append the unit label. Defaults to true; set false to compose custom unit styling. */
  showUnit?: boolean;
}

const AUTO_KM_THRESHOLD = 1000;

/**
 * Format a distance given in meters as a HUD-ready string, switching to km automatically past 1000m when `unit: "auto"`.
 *
 * @capability distance-format render meters as m or km for HUD stats, telemetry, and range readouts
 */
export function formatDistance(meters: number, options: DistanceFormat = {}): string {
  const requested = options.unit ?? "m";
  const clamped = Math.max(0, meters);
  const showUnit = options.showUnit ?? true;
  const useKm = requested === "km" || (requested === "auto" && clamped >= AUTO_KM_THRESHOLD);
  if (useKm) {
    const text = (clamped / 1000).toFixed(options.decimals ?? 1);
    return showUnit ? `${text}km` : text;
  }
  const text = clamped.toFixed(options.decimals ?? 0);
  return showUnit ? `${text}m` : text;
}
