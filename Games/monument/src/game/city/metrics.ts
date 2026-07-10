import { CELL, type Building, type CityMetrics, type CitySignals, type DistrictCharter, type Plaza } from "../catalog";

export interface BuildingPerformance {
  floors: number;
  gfa: number;
  far: number;
  daylight: number;
  energy: number;
  carbon: number;
  egress: number;
  publicLife: number;
  shadeHours: number;
  diversity: number;
}

export function performanceFor(b: Building, buildings: readonly Building[], plazas: readonly Plaza[]): BuildingPerformance {
  const floors = Math.max(1, Math.floor((b.height - b.pilotis) / b.floorHeight));
  const morphologyEfficiency = Math.max(0.54, 0.82 - b.voids * 0.0024 - b.taper * 0.0011);
  const gfa = b.width * b.depth * floors * morphologyEfficiency;
  const neighbors = buildings.filter((n) => n.id !== b.id && Math.hypot(n.x - b.x, n.z - b.z) < CELL * 1.65);
  const taller = neighbors.filter((n) => n.height > b.height * 0.72).length;
  const diversity = new Set(neighbors.map((n) => n.program)).size;
  const plazaDistance = plazas.length > 0 ? Math.min(...plazas.map((p) => Math.hypot(p.x - b.x, p.z - b.z))) : 999;
  const publicAccess = plazaDistance < CELL * 1.55 ? 18 : plazaDistance < CELL * 2.5 ? 9 : 0;
  const orientationBonus = Math.abs(Math.sin((b.rotation * Math.PI) / 180)) * 7;
  const daylight = Math.max(19, Math.min(96, 88 - b.depth * 1.38 - taller * 5 + b.porosity * 0.2 + orientationBonus + b.voids * 0.16));
  const energy = Math.max(
    42,
    Math.round(
      72 +
        b.porosity * 0.76 +
        b.depth * 0.86 -
        b.balconies * 0.11 -
        b.vegetation * 0.08 +
        b.weathering * 0.05 +
        (b.facade === "brise-soleil" ? -14 - b.facadeDepth * 3 : 0),
    ),
  );
  const carbon = Math.round(gfa * (b.structural === "walls" ? 0.62 : b.structural === "cores" ? 0.54 : 0.48) * (1 - b.voids * 0.0018));
  const egress = Math.min(100, Math.round(38 + b.cores * 23 - Math.max(0, floors - 18) * 1.4 + (b.structural === "cores" ? 8 : 0)));
  const publicLife = Math.min(
    100,
    Math.round(
      26 +
        publicAccess +
        diversity * 8 +
        b.pilotis * 2 +
        b.vegetation * 0.08 +
        b.voids * 0.06 +
        (b.program === "culture" || b.program === "civic" ? 16 : 0),
    ),
  );
  return {
    floors,
    gfa: Math.round(gfa),
    far: gfa / ((CELL - 4.8) * (CELL - 4.8)),
    daylight: Math.round(daylight),
    energy,
    carbon,
    egress,
    publicLife,
    shadeHours: Math.max(1.2, Math.round((b.height / 14 + taller * 0.8) * 10) / 10),
    diversity,
  };
}

export function metricsFor(buildings: readonly Building[], plazas: readonly Plaza[]): CityMetrics {
  let capacity = 0;
  let jobs = 0;
  let culture = 0;
  let civic = 0;
  let carbon = 0;
  for (const b of buildings) {
    const perf = performanceFor(b, buildings, plazas);
    const floorArea = perf.gfa;
    const homes = b.program === "housing" ? 1 : b.program === "mixed" ? 0.5 : 0;
    const work = b.program === "work" ? 1 : b.program === "mixed" ? 0.55 : b.program === "civic" ? 0.22 : 0;
    capacity += (floorArea / 36) * homes * 2.1;
    jobs += (floorArea / 29) * work;
    culture += (floorArea / 24) * (b.program === "culture" ? 0.72 : b.program === "mixed" ? 0.13 : 0);
    civic += (floorArea / 24) * (b.program === "civic" ? 0.78 : b.program === "mixed" ? 0.1 : 0);
    carbon += floorArea * (b.structural === "walls" ? 0.62 : b.structural === "cores" ? 0.54 : 0.48) * (b.tone === "raw" ? 1.08 : 0.94);
  }
  const gardens = plazas.filter((p) => p.kind === "garden").length;
  const waters = plazas.filter((p) => p.kind === "water").length;
  const forums = plazas.filter((p) => p.kind === "forum").length;
  culture += forums * 58;
  civic += waters * 24 + gardens * 18;
  carbon = Math.max(0, carbon - gardens * 46 - plazas.reduce((sum, p) => sum + p.trees * 2.2, 0));
  capacity = Math.round(capacity);
  const population = Math.round(capacity * Math.min(0.94, 0.61 + (culture + civic + plazas.length * 55) / Math.max(1100, capacity * 2.6)));
  const activity = Math.round(Math.min(100, 24 + buildings.length * 1.15 + plazas.length * 4 + forums * 8 + gardens * 3 + Math.min(jobs, population) / 85));
  const balance = population > 0 ? Math.min(jobs, population) / Math.max(jobs, population) : 0.5;
  const approval = Math.round(
    Math.min(96, 40 + plazas.length * 3 + gardens * 2 + waters + balance * 24 + Math.min(17, (culture + civic) / 75) - Math.max(0, carbon / 12000 - 4)),
  );
  return {
    population,
    capacity,
    jobs: Math.round(jobs),
    culture: Math.round(culture),
    civic: Math.round(civic),
    activity,
    approval,
    carbon: Math.round(carbon),
  };
}

export function resolveCityMetrics(buildings: readonly Building[], plazas: readonly Plaza[], charter: DistrictCharter): CityMetrics {
  const m = metricsFor(buildings, plazas);
  m.population = Math.min(m.capacity, Math.round(m.population * 1.06));
  m.approval += 2;
  if (charter.undercroft === "open") m.activity = Math.min(100, m.activity + 11);
  if (charter.undercroft === "quiet") m.approval = Math.min(98, m.approval + 3);
  if (charter.commons === "shared") {
    m.approval = Math.min(98, m.approval + 7);
    m.activity = Math.min(100, m.activity + 4);
  }
  if (charter.commons === "specialist") {
    m.jobs = Math.round(m.jobs * 1.08);
    m.culture = Math.round(m.culture * 1.08);
    m.activity = Math.min(100, m.activity + 3);
  }
  if (charter.aggregate === "reuse") m.carbon = Math.round(m.carbon * 0.82);
  if (charter.aggregate === "formal") m.carbon = Math.round(m.carbon * 1.06);
  return m;
}

export function citySignals(metrics: CityMetrics, charter: DistrictCharter): CitySignals {
  return {
    activity: metrics.activity,
    nightAccess: charter.undercroft ?? "neutral",
    sharedRooms: charter.commons === "shared",
    specialistGrowth: charter.commons === "specialist",
    reuse: charter.aggregate === "reuse",
    formal: charter.aggregate === "formal",
  };
}

export const formatStat = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : Math.round(n).toString());
