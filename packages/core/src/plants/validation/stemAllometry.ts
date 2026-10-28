/** The 10th–90th percentile leaf area per sapwood area at breast height, m² per m². */
export interface LeafToSapwoodBand {
  low: number;
  high: number;
}

/**
 * Leaf area per sapwood area at breast height of temperate and boreal trees taller than 5 m in the
 * Biomass And Allometry Database (Falster et al. 2015, CC0), 10th–90th percentile by leaf habit.
 */
export const BAAD_LEAF_TO_SAPWOOD: Readonly<Record<"evergreen" | "deciduous", LeafToSapwoodBand>> = {
  evergreen: { low: 701, high: 7189 },
  deciduous: { low: 1787, high: 12572 },
};
