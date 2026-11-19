export interface Plot {
  seed: string | null;
  water: number;
  fertilizer: number;
  growth: number;
}

export const PLOT = {
  waterMax: 100,
  fertilizerMax: 100,
  pour: 25,
  fertilizerEach: 50,
  /** Game seconds from planting to ripe, with water and fertilizer the whole time. */
  growSeconds: 600,
  /** Water and fertilizer a growing crop uses per second. */
  waterUse: 0.1,
  fertilizerUse: 0.05,
  /** Water open rain adds per second at full strength. */
  rainFill: 2,
  harvest: 10,
  regrow: 0.5,
} as const;

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
