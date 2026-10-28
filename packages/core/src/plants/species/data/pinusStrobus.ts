import type { PlantSpecies } from "../plantSpecies";

/**
 * Eastern white pine. Traits from Silvics of North America (Wendel & Smith 1990), the USDA Wood
 * Handbook and USDA PLANTS: an excurrent conifer that sets one whorl of three to five branches at the
 * top of each year's leader, needles in fives kept two to three years. Carbon and architecture fitted
 * against the Carmean 1989 height curve, Ek 1974 and Tallo crown widths and the crown profile of open-
 * and forest-grown trees.
 */
export const PINUS_STROBUS: PlantSpecies = {
  id: "pinus-strobus",
  version: 2,
  names: { scientific: "Pinus strobus L.", common: { en: "eastern white pine", fr: "pin blanc" } },
  ids: { usda: "PIST" },
  habit: "tree",
  architecture: { model: "rauh", phyllotaxis: "whorled", divergence: 137.5 },
  growth: {
    apicalControl: 0.785,
    apicalControlMature: 0.6,
    apicalControlHalfYears: 30,
    internodeMax: 0.08,
    branchAngle: 74,
    lateralBudsPerNode: 5,
    maxMetamersPerShoot: 6,
    horizontalVigour: 0.461,
    vigourIndexWeight: 0.1,
    tropism: { gravity: 0.3, gravityOrderDecay: 0.6, setpointAngle: 89, setpointPerOrder: 2, optimal: 0.1, wind: 0.2 },
    budLightThreshold: 0.093,
    budDeathYears: 2,
    dormantBudYears: 2,
    spurYears: 3,
    shadow: { a: 1, b: 1, depth: 24 },
    extinction: 0.45,
    jitter: 0.1,
  },
  carbon: {
    lueGPerMJ: 2.2,
    respiration: 2,
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
    hydraulicExponent: 2,
  },
  wood: { densityKgM3: 340, greenFactor: 2, modulusGPa: 6.8, reactionCompensation: 0.7, shootRadiusM: 0.002 },
  limits: { maxAgeYears: 450, maxHeightM: 50, maxDbhCm: 150, maxCrownRadiusM: 9 },
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
    tolerance: { source: "usda-plants" },
    leaf: { source: "silvics-654" },
    wood: { source: "wood-handbook" },
    reproduction: { source: "silvics-654" },
    growth: { source: "crown-fit", fitted: { score: 36.7, against: "carmean-1989, ek-1974, tallo-2022" } },
    carbon: { source: "crown-fit", fitted: { score: 36.7, against: "carmean-1989, ek-1974, tallo-2022" } },
  },
};
