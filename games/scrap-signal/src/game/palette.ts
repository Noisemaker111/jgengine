export const RARITY_COLORS = {
  common: "#ffffff",
  uncommon: "#3dd13d",
  rare: "#2f8cff",
  epic: "#b24bf3",
  legendary: "#ff9a00",
} as const;

export const ELEMENT_COLORS = {
  none: "#c8c8c8",
  incendiary: "#ff7a1a",
  shock: "#3fc9ff",
  corrosive: "#9dff2e",
  explosive: "#ffd23e",
  flux: "#c05cff",
} as const;

/**
 * Maple Hollow reads on one rule: **the yards are soft and green, the machines are hard and loud.**
 * Lawns, hedges and sky sit in fresh greens and a clean summer blue; every hostile appliance is
 * enamel white, chrome or a toy-bright plastic with glowing red LED eyes. That split is what makes a
 * Roomba legible at thirty metres against an overgrown lawn.
 */
export const SUBURB = {
  sky: "#6fb8ef",
  skyZenith: "#2f8be0",
  horizon: "#d9eefc",
  fog: "#cfe6f5",
  /** Aerial haze: a pale summer blue, so the far rooftops and hills fall back toward the sky. */
  haze: "#c8e2f2",
  /**
   * Terrain low/high: shaded lawn in the hollows, sunlit overgrown grass on the rises. Far enough
   * apart in value that the rolling yards still have relief.
   */
  rockLow: "#2f6222",
  rockHigh: "#6fae3c",
  /** Banks and slopes: packed garden soil, darker than the lawn so a slope separates by value. */
  cliff: "#7a5a3a",
  sand: "#5f9e38",
  dust: "#f6e7a8",
  hudAmber: "#ffd23f",
  hudRed: "#ff4a5a",
  hudShield: "#4cc3ff",
  hudXp: "#7ae05a",
  hudPanel: "rgba(20, 28, 48, 0.86)",
} as const;

/**
 * Machine finishes. Every robot chassis draws from these, never from the terrain
 * hues, so enemies never camouflage into the ground they stand on.
 */
/**
 * Machine finishes. Values are deliberately mid-to-light greys: in PBR a metal's albedo *is* its
 * reflectance, so a near-black chassis at high metalness reflects almost nothing and renders as a
 * flat black hole against bright sand. Everything here stays above ~#55 so robots read as machined
 * metal with visible form, not as silhouette cutouts.
 */
export const MACHINE = {
  /** Mass-production drone shell. */
  steel: "#b3bec9",
  /** Weathered scavenger plating. */
  scrap: "#93a0ad",
  /** Heavy frame / armour. */
  iron: "#75828f",
  /** Recessed joints, hydraulics, cabling — the darkest value, still well off black. */
  joint: "#586471",
  /** Corrosion bleed on old welds. */
  rust: "#8a4a2a",
  /** Rim-light edge on machine hostiles — cool, so it never reads as sun bounce off the sand. */
  rimCool: "#9fd0ff",
  /** Faction hazard stripe. */
  hazard: "#f0a828",
  /** Optic glow — the read for "this thing is alive and looking at you". */
  optic: "#3fd8ff",
  /** Elite/elite optic + trim. */
  opticElite: "#ff5a2e",
} as const;
