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
 * Ferralon reads on one rule: **the world is warm, the machines are cold.**
 * Ground, rock, and haze sit in sandstone/ochre; every robot chassis sits in
 * blue-grey steel with a saturated hazard accent. That hue split is what makes a
 * silhouette legible at 60 m against open desert — the previous single-brown
 * palette put enemies and terrain in the same hue *and* value, so nothing read.
 */
export const FERRALON = {
  sky: "#5b93bd",
  skyZenith: "#0f4c86",
  horizon: "#dcc39c",
  fog: "#c9a677",
  /**
   * Aerial-perspective haze. Cooler and lighter than {@link FERRALON.fog} on purpose: distance in a
   * dusty desert desaturates *toward the sky*, so a warm sand-coloured fog just repaints the sand
   * over the ridgelines instead of pushing them back.
   */
  haze: "#b9bfc0",
  /**
   * Terrain low/high. The gap between these two is what gives an open desert its relief — the old
   * pair sat close together in value, so every ridge read as one smooth tan blob. Deep shadowed
   * ochre in the hollows, bleached sandstone on the ridgelines.
   */
  rockLow: "#5f3c22",
  rockHigh: "#dba869",
  /** Slope/cliff face: cooler and darker than the flats so relief separates by value, not just shading. */
  cliff: "#5c4c40",
  sand: "#cdab74",
  dust: "#b3663a",
  hudAmber: "#ffb400",
  hudRed: "#e23c2e",
  hudShield: "#39a8e0",
  hudXp: "#8ee43e",
  hudPanel: "rgba(12, 14, 16, 0.82)",
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
  /** Faction hazard stripe. */
  hazard: "#f0a828",
  /** Optic glow — the read for "this thing is alive and looking at you". */
  optic: "#3fd8ff",
  /** Badass/elite optic + trim. */
  opticElite: "#ff5a2e",
} as const;
