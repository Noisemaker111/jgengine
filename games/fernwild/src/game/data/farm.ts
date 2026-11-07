/**
 * ARK's Small Crop Plot: plant a seed, keep it watered and fertilized, and it grows a crop that is picked
 * again and again. Rain fills the plot's water, as does a waterskin poured into it; fertilizer is ground
 * from spoiled meat and thatch. ARK's numbers (water, fertilizer drain, growth time) are approximate here.
 */
export interface Plot {
  /** The seed planted, or null for bare soil. */
  seed: string | null;
  water: number;
  fertilizer: number;
  /** 0 just planted, 1 ripe. */
  growth: number;
}

export const PLOT = {
  waterMax: 100,
  fertilizerMax: 100,
  /** Water one waterskin pours in. */
  pour: 25,
  /** Fertilizer one bag of it adds. */
  fertilizerEach: 50,
  /** Game seconds from planting to ripe, with water and fertilizer the whole time. */
  growSeconds: 600,
  /** Water and fertilizer a growing crop uses per second. */
  waterUse: 0.1,
  fertilizerUse: 0.05,
  /** Water open rain adds per second at full strength. */
  rainFill: 2,
  /** What one picking gives, and how far back the crop drops to grow the next. */
  harvest: 10,
  regrow: 0.5,
} as const;

/** Each seed and the crop it grows. */
export const SEEDS: Readonly<Record<string, string>> = { mejoberry_seed: "mejoberry" };

export function emptyPlot(): Plot {
  return { seed: null, water: 0, fertilizer: 0, growth: 0 };
}

/** One step of a plot: rain (0-1) fills it; a planted seed grows only while it has both water and fertilizer, using them. */
export function growPlot(plot: Plot, dt: number, rain: number): Plot {
  let water = Math.min(PLOT.waterMax, plot.water + PLOT.rainFill * Math.max(0, rain) * dt);
  let fertilizer = plot.fertilizer;
  let growth = plot.growth;
  if (plot.seed !== null && growth < 1 && water > 0 && fertilizer > 0) {
    growth = Math.min(1, growth + dt / PLOT.growSeconds);
    water = Math.max(0, water - PLOT.waterUse * dt);
    fertilizer = Math.max(0, fertilizer - PLOT.fertilizerUse * dt);
  }
  return { seed: plot.seed, water, fertilizer, growth };
}
