import type { PlantSpecies } from "../plantSpecies";

/**
 * Eastern white pine. Traits from Silvics of North America (Wendel & Smith 1990), the USDA Wood
 * Handbook and USDA PLANTS: an excurrent conifer that sets one whorl of three to five branches at the
 * top of each year's leader, needles in fives kept two to three years. Carbon and architecture fitted
 * against the Carmean 1989 height curve, FIA site-tree diameters, Ek 1974 and Tallo crown widths and
 * the crown profile of open- and forest-grown trees. The crown radius limit is Ek 1974 at the largest
 * DBH.
 */
export const PINUS_STROBUS: PlantSpecies = {
  id: "pinus-strobus",
  version: 3,
  names: { scientific: "Pinus strobus L.", common: { en: "eastern white pine", fr: "pin blanc" } },
  ids: { usda: "PIST" },
  habit: "tree",
  architecture: { model: "rauh", phyllotaxis: "whorled", divergence: 137.5 },
  growth: {
    apicalControl: 0.6391,
    apicalControlMature: 0.4384,
    apicalControlHalfYears: 80,
    internodeMax: 0.1482,
    branchAngle: 48.55,
    lateralBudsPerNode: 5,
    maxMetamersPerShoot: 4,
    establishmentYears: 0,
    horizontalVigour: 0.2434,
    vigourIndexWeight: 0.4276,
    tropism: { gravity: 0.4305, gravityOrderDecay: 0.6, setpointAngle: 82.77, setpointPerOrder: 2.673, optimal: 0.137, wind: 0.2 },
    budLightThreshold: 0.06222,
    budDeathYears: 2,
    dormantBudYears: 2,
    spurYears: 3,
    shadow: { a: 1, b: 1, depth: 24 },
    extinction: 0.45,
    jitter: 0.1,
  },
  carbon: {
    lueGPerMJ: 3.338,
    lightHalfSaturation: 0.969,
    respiration: 2.459,
    sapwoodRespiration: 0.02,
    rootRespiration: 1.5,
    rootPerFoliage: 0.5,
    rootTurnover: 0.8,
    foliageTurnover: 0.4,
    growthEfficiency: 0.75,
    sapwoodPerFoliage: 4.01e-4,
    sapwoodTurnover: 0.04,
    pipeExponent: 2.3,
    reproductiveShare: 0.05,
    pruneDeficitYears: 2,
    coarseRootShare: 0.25,
    hydraulicExponent: 1,
  },
  wood: { densityKgM3: 340, greenFactor: 2, modulusGPa: 6.8, reactionCompensation: 0.7, shootRadiusM: 0.002 },
  limits: { maxAgeYears: 450, maxHeightM: 50, maxDbhCm: 150, maxCrownRadiusM: 13 },
  tolerance: { shade: 0.5, drought: 0.6, frost: 0.9, waterlogging: 0.3 },
  leaf: {
    shape: { kind: "needle", lobes: 0, lobeDepth: 0, aspect: 0.02, petioleFraction: 0.1 },
    sizeCm: 10,
    sla: 12,
    lifespanYears: 2.5,
    leavesPerNode: 6,
    color: { spring: "#7fa86a", summer: "#3d6b4a", autumn: "#4a6b45" },
  },
  bark: { kind: "furrowed", smoothUntilYears: 20, furrowDepth: 0.7, color: "#5a4f47" },
  reproduction: { firstFlowerYears: 10, seedMassMg: 17 },
  phenology: { forcingBaseC: 5, forcingSum: 200, chillingDays: 60, senescencePhotoperiodH: 11 },
  provenance: {
    limits: { source: "silvics-654" },
    "limits.maxCrownRadiusM": { source: "ek-1974" },
    tolerance: { source: "usda-plants" },
    leaf: { source: "silvics-654" },
    wood: { source: "wood-handbook" },
    reproduction: { source: "silvics-654" },
    growth: { source: "crown-fit", fitted: { score: 8.0, against: "carmean-1989, fia, ek-1974, tallo-2022" } },
    carbon: { source: "crown-fit", fitted: { score: 8.0, against: "carmean-1989, fia, ek-1974, tallo-2022" } },
  },
};
