/** Median trunk diameter of measured stand-grown trees at a given age. */
export interface StandDiameterAtAge {
  ageYears: number;
  dbhCm: number;
}

/**
 * Median DBH of USDA Forest Inventory and Analysis site trees (US public domain) in Wisconsin,
 * Michigan and Minnesota on site index 55–75 ft, by age. Site trees are dominant or codominant trees
 * of a fully stocked stand, so they match a crown grown in a closed stand.
 */
export const FIA_STAND_DIAMETER: Readonly<Record<string, readonly StandDiameterAtAge[]>> = {
  "acer-saccharum": [
    { ageYears: 50, dbhCm: 22.6 },
    { ageYears: 100, dbhCm: 32 },
  ],
  "pinus-strobus": [
    { ageYears: 50, dbhCm: 30 },
    { ageYears: 100, dbhCm: 48 },
  ],
};

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
