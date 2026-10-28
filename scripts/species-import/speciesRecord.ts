import type { PlantSpecies } from "../../packages/core/src/plants/species/plantSpecies";
import type { PlantSourceId } from "../../packages/core/src/plants/species/speciesSources";
import { SHADE_TOLERANCE, type SpeciesTraits } from "./speciesTraits";

/** Values the importer read from downloaded tables for one species. */
export interface ImportedValues {
  /** Basic density from FIA wood specific gravity, dry kg per green m³. */
  densityKgM3?: number;
  /** Green over dry mass from FIA green moisture content. */
  greenFactor?: number;
  /** BAAD median specific leaf area, m² per kg. */
  sla?: number;
  /** Half of the Ek 1974 open-grown crown width at the species' largest DBH, m. */
  maxCrownRadiusM: number;
  maxCrownRadiusSource: PlantSourceId;
}

/** The growth and carbon parameters a fit found, with its score and what it was scored against. */
export interface FittedParameters {
  growth: PlantSpecies["growth"];
  carbon: PlantSpecies["carbon"];
  score: number;
  against: string;
}

/**
 * A full species record from its traits, the imported values and fitted growth and carbon, starting
 * from `base` (the prior species) for anything neither sets.
 */
export function buildSpeciesRecord(traits: SpeciesTraits, imported: ImportedValues, fitted: FittedParameters, base: PlantSpecies, version: number): PlantSpecies {
  const fittedProvenance = { source: "crown-fit" as const, fitted: { score: Math.round(fitted.score * 100) / 100, against: fitted.against } };
  const provenance: PlantSpecies["provenance"] = {
    names: { source: "usda-plants" },
    architecture: { source: "silvics-654" },
    limits: { source: "silvics-654" },
    "limits.maxCrownRadiusM": { source: imported.maxCrownRadiusSource },
    tolerance: { source: "silvics-654" },
    leaf: { source: "silvics-654" },
    ...(imported.sla === undefined ? {} : { "leaf.sla": { source: "baad-2015" as const } }),
    wood: { source: "wood-handbook" },
    ...(imported.densityKgM3 === undefined ? {} : { "wood.densityKgM3": { source: "fia" as const }, "wood.greenFactor": { source: "fia" as const } }),
    bark: { source: "silvics-654" },
    reproduction: { source: "silvics-654" },
    phenology: { source: "silvics-654" },
    growth: fittedProvenance,
    carbon: fittedProvenance,
  };
  return {
    id: traits.id,
    version,
    names: { scientific: traits.scientific, common: { en: traits.common.en, fr: traits.common.fr } },
    ids: { usda: traits.usda },
    habit: "tree",
    architecture: { ...traits.architecture },
    growth: {
      ...fitted.growth,
      basalStems: traits.basalStems ?? 1,
      lateralBudsPerNode: traits.lateralBudsPerNode,
      tropism: { ...fitted.growth.tropism, setpointMax: traits.setpointMax ?? 90 },
      shadow: { ...fitted.growth.shadow },
    },
    carbon: { ...fitted.carbon, hydraulicHeightShare: fitted.carbon.hydraulicHeightShare ?? 1 },
    wood: {
      ...base.wood,
      densityKgM3: imported.densityKgM3 ?? base.wood.densityKgM3,
      greenFactor: imported.greenFactor ?? base.wood.greenFactor,
      modulusGPa: traits.modulusGPa,
    },
    limits: { ...traits.limits, maxCrownRadiusM: imported.maxCrownRadiusM },
    tolerance: { shade: SHADE_TOLERANCE[traits.shade], ...traits.tolerance },
    leaf: { ...traits.leaf, sla: imported.sla ?? traits.leaf.sla, shape: { ...traits.leaf.shape }, color: { ...traits.leaf.color } },
    bark: { ...traits.bark },
    reproduction: { ...traits.reproduction },
    phenology: { ...traits.phenology },
    provenance,
  };
}

function literal(value: unknown, indent: string): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(4)));
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => literal(v, indent)).join(", ")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    const inner = indent + "  ";
    const flat = `{ ${entries.map(([k, v]) => `${key(k)}: ${literal(v, inner)}`).join(", ")} }`;
    if (flat.length + indent.length < 100 && !flat.includes("\n")) return flat;
    return `{\n${entries.map(([k, v]) => `${inner}${key(k)}: ${literal(v, inner)},`).join("\n")}\n${indent}}`;
  }
  return "undefined";
}

function key(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

/** TypeScript source of a species record file, as `bun run jgengine plants write` emits it. */
export function speciesRecordSource(traits: SpeciesTraits, record: PlantSpecies, summary: string): string {
  return `import type { PlantSpecies } from "../plantSpecies";

/**
 * ${summary}
 */
export const ${traits.exportName}: PlantSpecies = ${literal(record, "")};
`;
}
