import type { PlantSpecies } from "../plantSpecies";

/**
 * Sugar maple. Traits from Silvics of North America (Godman, Yawney & Tubbs 1990), the USDA Wood
 * Handbook and USDA PLANTS. Decurrent: apical control falls with age until laterals overtake the leader
 * into a broad rounded crown. Architecture and carbon parameters fitted against the Carmean 1989
 * height curve, FIA site-tree and UTD open-grown diameters, Ek 1974 and Tallo crown widths and the crown
 * profile of open- and forest-grown trees.
 */
export const ACER_SACCHARUM: PlantSpecies = {
  id: "acer-saccharum",
  version: 3,
  names: { scientific: "Acer saccharum Marshall", common: { en: "sugar maple", fr: "érable à sucre" } },
  ids: { usda: "ACSA3" },
  habit: "tree",
  architecture: { model: "rauh", phyllotaxis: "opposite", divergence: 90 },
  growth: {
    apicalControl: 0.9358,
    apicalControlMature: 0.8173,
    apicalControlHalfYears: 7.839,
    internodeMax: 0.1613,
    branchAngle: 35.33,
    lateralBudsPerNode: 2,
    maxMetamersPerShoot: 3,
    establishmentYears: 0,
    horizontalVigour: 0.4762,
    vigourIndexWeight: 0.2078,
    tropism: { gravity: 0.197, gravityOrderDecay: 0.4, setpointAngle: 82.64, setpointPerOrder: 16.27, optimal: 0.206, wind: 0.15 },
    budLightThreshold: 0.02,
    budDeathYears: 3,
    dormantBudYears: 5,
    spurYears: 28,
    shadow: { a: 1, b: 1, depth: 24 },
    extinction: 0.5,
    jitter: 0.12,
  },
  carbon: {
    lueGPerMJ: 2.084,
    lightHalfSaturation: 0.2212,
    respiration: 1.096,
    sapwoodRespiration: 0.02,
    rootRespiration: 2,
    rootPerFoliage: 0.6,
    rootTurnover: 0.8,
    foliageTurnover: 1,
    growthEfficiency: 0.75,
    sapwoodPerFoliage: 1.75e-4,
    sapwoodTurnover: 0.04,
    pipeExponent: 2.3,
    reproductiveShare: 0.06,
    pruneDeficitYears: 2,
    coarseRootShare: 0.25,
    hydraulicExponent: 3,
  },
  wood: { densityKgM3: 560, greenFactor: 1.8, modulusGPa: 10.7, reactionCompensation: 0.6, shootRadiusM: 0.0015 },
  limits: { maxAgeYears: 400, maxHeightM: 33, maxDbhCm: 120, maxCrownRadiusM: 12 },
  tolerance: { shade: 0.9, drought: 0.4, frost: 0.9, waterlogging: 0.2 },
  leaf: {
    shape: { kind: "lobed", lobes: 5, lobeDepth: 0.45, aspect: 1, petioleFraction: 0.35 },
    sizeCm: 12,
    sla: 22,
    lifespanYears: 0.5,
    leavesPerNode: 2,
    color: { spring: "#9cc25a", summer: "#3f7a2c", autumn: "#d9541e" },
  },
  bark: { kind: "furrowed", smoothUntilYears: 25, furrowDepth: 0.6, color: "#6d6359" },
  reproduction: { firstFlowerYears: 22, flowerColor: "#c9c96a", seedMassMg: 65 },
  phenology: { forcingBaseC: 5, forcingSum: 150, chillingDays: 60, senescencePhotoperiodH: 11.5 },
  provenance: {
    limits: { source: "silvics-654" },
    tolerance: { source: "usda-plants" },
    leaf: { source: "usda-plants" },
    wood: { source: "wood-handbook" },
    reproduction: { source: "silvics-654" },
    growth: { source: "crown-fit", fitted: { score: 22.2, against: "carmean-1989, fia, utd, ek-1974, tallo-2022" } },
    carbon: { source: "crown-fit", fitted: { score: 22.2, against: "carmean-1989, fia, utd, ek-1974, tallo-2022" } },
  },
};
