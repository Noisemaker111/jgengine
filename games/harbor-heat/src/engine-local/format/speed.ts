/** Target unit for {@link formatSpeed}: km/h, mph, knots, or raw m/s. */
export type SpeedUnit = "kmh" | "mph" | "knots" | "ms";

/** Options for {@link formatSpeed}. */
export interface SpeedFormat {
  /** Target unit to convert into from the m/s input. Defaults to `"kmh"`. */
  unit?: SpeedUnit;
  /** Fractional digits to show. Defaults to 0. */
  decimals?: 0 | 1 | 2;
  /** Append the unit label. Defaults to true; set false to compose custom unit styling. */
  showUnit?: boolean;
}

const SPEED_UNIT_FACTOR: Record<SpeedUnit, number> = {
  kmh: 3.6,
  mph: 2.2369362920544025,
  knots: 1.9438444924406046,
  ms: 1,
};

const SPEED_UNIT_LABEL: Record<SpeedUnit, string> = {
  kmh: "km/h",
  mph: "mph",
  knots: "kn",
  ms: "m/s",
};

/**
 * Format a speed given in meters/second as a HUD-ready string in km/h, mph, knots, or m/s — the one conversion table every speedometer and telemetry readout should share.
 *
 * @capability speed-format render a m/s speed as km/h, mph, knots, or m/s for speedometers and telemetry HUDs
 */
export function formatSpeed(metersPerSecond: number, options: SpeedFormat = {}): string {
  const unit = options.unit ?? "kmh";
  const decimals = options.decimals ?? 0;
  const showUnit = options.showUnit ?? true;
  const converted = Math.max(0, metersPerSecond) * SPEED_UNIT_FACTOR[unit];
  const text = converted.toFixed(decimals);
  return showUnit ? `${text} ${SPEED_UNIT_LABEL[unit]}` : text;
}
