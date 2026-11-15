/**
 * One description of a zone's air, read by both the ambience driver and the dust layer, so what the
 * player hears and what they see never disagree about how hard the wind is blowing.
 */
export interface ZoneAir {
  /** Wind strength 0..1 — drives the ambient bed gain and the dust density together. */
  wind: number;
  /** Playback rate of the wind bed; also tints the dust's drift speed. */
  rate: number;
  /** Distant-machinery bed gain 0..1. */
  industry: number;
  /** Airborne particulate colour for this zone. */
  dust: string;
}

export const ZONE_AIR: Record<string, ZoneAir> = {
  rustflat_waste: { wind: 0.7, rate: 1.05, industry: 0.1, dust: "#fff6c2" },
  breakwater_shelf: { wind: 0.6, rate: 1.0, industry: 0.15, dust: "#e9f7ff" },
  arid_badlands: { wind: 0.45, rate: 0.92, industry: 0.35, dust: "#fff1d6" },
  split_ridge: { wind: 0.6, rate: 0.96, industry: 0.45, dust: "#f2ead8" },
  glasswind_flats: { wind: 0.75, rate: 1.04, industry: 0.2, dust: "#f8ffe6" },
  // The Estates hum with Wi-Fi: the drifting motes read cold and violet against the pollen elsewhere.
  cores_blight: { wind: 0.45, rate: 0.74, industry: 1, dust: "#b9a8ff" },
  // The server farm: no wind, a deafening cooling hum, cold blue motes.
  data_center: { wind: 0.2, rate: 0.7, industry: 1, dust: "#9fd8ff" },
};

export const DEFAULT_AIR: ZoneAir = { wind: 0.55, rate: 1, industry: 0.25, dust: "#fff6c2" };

export function airAt(zoneId: string | null): ZoneAir {
  return (zoneId === null ? undefined : ZONE_AIR[zoneId]) ?? DEFAULT_AIR;
}

/** Slow, deterministic gust curve — two incommensurate periods so it never audibly repeats. */
export function gust(nowMs: number): number {
  const t = nowMs / 1000;
  return 0.72 + 0.2 * Math.sin(t / 7.3) + 0.08 * Math.sin(t / 2.9);
}
