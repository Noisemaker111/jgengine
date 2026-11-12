/**
 * Density and massing measures of a resolved `city` district — the numbers planners quote (building
 * coverage, floor-area ratio), the pavement share, and what the renderer will have to instance.
 * Coverage and FAR come two ways: GROSS over the whole footprint (streets included) and NET over the
 * land the blocks hold. Floor area is counted per wall piece (a podium tower is a wide podium plus a
 * slim shaft, not the podium area times the shaft's floors). Pure data over {@link ResolvedCity}.
 *
 * @capability city-district coverage, floor-area ratio, pavement share and render cost of a district
 */
import type { ResolvedCity } from "./cityKind";
import type { CityLotPiece } from "./cityContent";

/** Density and render-cost measures of one district. */
export interface CityMassingStats {
  /** Footprint area of the district volume, m². */
  districtArea: number;
  /** Land inside block polygons (behind the sidewalks), m². */
  landArea: number;
  /** Share of the footprint that is not block land: carriageways, sidewalks, curbs. */
  pavementShare: number;
  /** Ground floor area under buildings, m². */
  footprint: number;
  /** Gross floor area, m². */
  floorArea: number;
  /** Footprint over the whole district (gross coverage). */
  coverage: number;
  /** Footprint over block land (net coverage). */
  landCoverage: number;
  /** Floor area over the whole district (gross FAR). */
  far: number;
  /** Floor area over block land (net FAR). */
  landFar: number;
  buildings: number;
  landmarks: number;
  /** Distinct massing templates seen per building class. */
  templates: Record<string, number>;
  /** Massing pieces across all lots: the instances the renderer draws. */
  pieces: number;
}

/** Plan area of a grounded piece's footprint (an elliptical drum for cylinders). */
function planArea(piece: CityLotPiece): number {
  const area = piece.size[0] * piece.size[2];
  return piece.shape === "cylinder" ? (area * Math.PI) / 4 : area;
}

/**
 * A building's enclosing pieces: walls, the accent-coloured walls barns and byres use, and the
 * standing drums of silos and tanks — never plinths, porches, parapets or rooftop plant.
 */
function encloses(piece: CityLotPiece): boolean {
  if (piece.shape !== "box" && piece.shape !== "cylinder") return false;
  if (piece.role === "wall") return true;
  if (piece.role === "accent") return piece.grounded && piece.size[1] > 2;
  return piece.role === "trim" && piece.shape === "cylinder" && piece.grounded && piece.size[1] > 3;
}

/**
 * Measure a resolved district's density and massing. Pure; the same plan always gives the same numbers.
 * @capability city-district coverage, floor-area ratio, pavement share and render cost of a district
 */
export function cityMassingStats(city: ResolvedCity): CityMassingStats {
  const districtArea = Math.max(1, city.size[0] * city.size[1]);
  const landArea = city.blocks.reduce((sum, block) => sum + block.area, 0);
  const floorHeight = city.rules.floorHeight;
  let footprint = 0;
  let floorArea = 0;
  let pieces = 0;
  let landmarks = 0;
  const templates = new Map<string, Set<string>>();
  for (const lot of city.lots) {
    pieces += lot.pieces.length;
    if (lot.landmark !== undefined) landmarks += 1;
    else {
      const seen = templates.get(lot.class) ?? new Set<string>();
      seen.add(lot.template);
      templates.set(lot.class, seen);
    }
    const lotArea = lot.size[0] * lot.size[1];
    let ground = 0;
    let floors = 0;
    for (const piece of lot.pieces) {
      if (!encloses(piece)) continue;
      const area = planArea(piece);
      if (piece.grounded) ground += area;
      floors += area * Math.max(1, Math.round(piece.size[1] / floorHeight));
    }
    const lotFootprint = Math.min(ground, lotArea);
    footprint += lotFootprint;
    // Sheds are one tall storey per floor; their wall height overstates stacked floors.
    floorArea += lot.class === "warehouse" || lot.class === "barn" || lot.class === "silo" ? lotFootprint * lot.floors : floors;
  }
  return {
    districtArea,
    landArea,
    pavementShare: Math.max(0, 1 - landArea / districtArea),
    footprint,
    floorArea,
    coverage: footprint / districtArea,
    landCoverage: landArea > 0 ? footprint / landArea : 0,
    far: floorArea / districtArea,
    landFar: landArea > 0 ? floorArea / landArea : 0,
    buildings: city.lots.length,
    landmarks,
    templates: Object.fromEntries([...templates].map(([cls, set]) => [cls, set.size])),
    pieces,
  };
}
