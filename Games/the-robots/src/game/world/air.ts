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
  windshear_waste: { wind: 1, rate: 1.18, industry: 0.15, dust: "#d8bc8c" },
  southern_shelf: { wind: 0.72, rate: 1.02, industry: 0.2, dust: "#c9ab7e" },
  arid_badlands: { wind: 0.5, rate: 0.92, industry: 0.55, dust: "#c8a878" },
  three_horns: { wind: 0.66, rate: 0.96, industry: 0.3, dust: "#bfa176" },
  the_dust: { wind: 0.85, rate: 1.06, industry: 0.35, dust: "#d2b183" },
  // Not sand: the Blight's air carries reactor ash, so it reads cold and violet against the others.
  eridium_blight: { wind: 0.45, rate: 0.74, industry: 1, dust: "#9c8fb4" },
};

export const DEFAULT_AIR: ZoneAir = { wind: 0.6, rate: 1, industry: 0.3, dust: "#c8a878" };

export function airAt(zoneId: string | null): ZoneAir {
  return (zoneId === null ? undefined : ZONE_AIR[zoneId]) ?? DEFAULT_AIR;
}

/** Slow, deterministic gust curve — two incommensurate periods so it never audibly repeats. */
export function gust(nowMs: number): number {
  const t = nowMs / 1000;
  return 0.72 + 0.2 * Math.sin(t / 7.3) + 0.08 * Math.sin(t / 2.9);
}
