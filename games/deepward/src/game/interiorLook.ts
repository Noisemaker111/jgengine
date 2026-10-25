import { findLibraryMaterial, libraryMaterialMaps } from "@jgengine/assets/catalogs/materialLibrary";
import type { AuthoredSurfaceConfig } from "@jgengine/shell/render/authoredSurfaceMaterial";
import type { InteriorDressingSurfaces } from "@jgengine/shell/render/InteriorDressing";

import type { Stratum } from "./strata";

/**
 * The CC0 ambientCG scans the floors are built from, by library name. The source ids are spelled
 * out so `bun run provision` finds and pulls each one into `public/materials/`.
 */
export const LIBRARY_SOURCES = {
  "metal/painted": "ambientcg-paintedmetal006",
  "metal/chipped": "ambientcg-paintedmetal002",
  "metal/steel": "ambientcg-metal007",
  "metal/corrugated": "ambientcg-corrugatedsteel009",
  "metal/diamond-plate": "ambientcg-diamondplate005a",
  "metal/rust": "ambientcg-rust007",
  "metal/plate": "ambientcg-metalplates001",
  "concrete/smooth": "ambientcg-concrete006",
  "concrete/poured": "ambientcg-concrete013",
  "concrete/rough": "ambientcg-concrete025",
  "tile/ceramic": "ambientcg-tiles007",
  "ground/rock": "ambientcg-rock022",
  "stone/terrazzo": "ambientcg-terrazzo005",
  "fabric/canvas": "ambientcg-fabric007",
} as const;
export type LibrarySurfaceName = keyof typeof LIBRARY_SOURCES;

/**
 * Scans whose colour map is a strong hue of its own (blue diamond plate, gold steel, blue and green
 * paint). The floors keep their grain, normal and roughness but take the floor's tint as the colour.
 */
const OWN_HUE: ReadonlySet<LibrarySurfaceName> = new Set(["metal/diamond-plate", "metal/steel", "metal/chipped", "metal/painted"]);

/** A library scan as an instanced-box surface: its maps tiled in metres, its own response, a tint. */
export function librarySurface(name: LibrarySurfaceName, tint: string, extra: Partial<AuthoredSurfaceConfig> = {}): AuthoredSurfaceConfig {
  const entry = findLibraryMaterial(name);
  if (entry === null || entry.source !== LIBRARY_SOURCES[name]) throw new Error(`Deepward: library material ${name} moved from ${LIBRARY_SOURCES[name]}`);
  const maps = Object.fromEntries(Object.entries(libraryMaterialMaps(entry)).filter(([role]) => !(OWN_HUE.has(name) && role === "color")).map(([role, map]) => [role, map!.url]));
  return { color: tint, maps, repeatMetres: entry.tileMetres, roughness: entry.response.roughness, metalness: entry.response.metalness, anisotropy: 4, ...extra };
}

/** Everything that makes one floor its own place: its shell, its dressing and its light. */
export interface FloorLook {
  wall: AuthoredSurfaceConfig;
  floor: AuthoredSurfaceConfig;
  ceiling: AuthoredSurfaceConfig;
  /** What the authored station parts wear here, by their editor surface. */
  structure: { paint: LibrarySurfaceName; steel: LibrarySurfaceName; floor: LibrarySurfaceName; printed: LibrarySurfaceName; brass: LibrarySurfaceName };
  /** How far an authored part's colour is pulled toward this floor's palette, 0..1. */
  structureBlend: number;
  structureTint: string;
  dressing: InteriorDressingSurfaces;
  cable: string;
  /** Wall-lamp light: colour, strength, range and how many lamps light at once. */
  practical: { color: string; intensity: number; distance: number; count: number; shadowed: number };
}

const lens = (color: string, intensity: number): AuthoredSurfaceConfig => ({ color: "#ffffff", emissive: color, emissiveIntensity: intensity, roughness: 0.3, metalness: 0 });
/** A burned-out lamp's lens: grey glass, no glow. */
const dark: AuthoredSurfaceConfig = { color: "#3a3835", roughness: 0.3, metalness: 0 };

/**
 * I Receiving reads like a working dock (painted plate, diamond-plate floor, cream service pipes,
 * warm wall lamps under cool strips); II the cold stores are white tile and bare concrete under
 * blue-white strips; III the ink wells are dark wet rock over rusted catwalk, sodium lamps over
 * violet ink; IV the choir is rough brutalist concrete and terrazzo lit red.
 */
export const FLOOR_LOOK: Readonly<Record<Stratum, FloorLook>> = {
  vault: {
    wall: librarySurface("metal/plate", "#a9b8b3"),
    floor: librarySurface("metal/diamond-plate", "#7c8688"),
    ceiling: librarySurface("concrete/poured", "#6c7472"),
    structure: { paint: "metal/plate", steel: "metal/steel", floor: "metal/diamond-plate", printed: "metal/plate", brass: "metal/painted" },
    structureBlend: 0.25, structureTint: "#8b9a96",
    dressing: {
      trim: librarySurface("metal/steel", "#77827f"),
      pipe: librarySurface("metal/painted", "#c9b98e"),
      fitting: librarySurface("metal/chipped", "#5b6562"),
      housing: librarySurface("metal/steel", "#4a5250"),
      lens: lens("#ffe3b8", 4),
      lensOff: dark,
      panel: librarySurface("metal/chipped", "#5d6b62"),
      hatch: librarySurface("metal/painted", "#6e7466"),
    },
    cable: "#151a1a",
    // Warm sodium wall lamps against the cool ceiling strips: each lamp throws its own pool.
    practical: { color: "#ffd29a", intensity: 26, distance: 8, count: 4, shadowed: 1 },
  },
  cold: {
    wall: librarySurface("tile/ceramic", "#c9d6de"),
    floor: librarySurface("concrete/smooth", "#8b979d"),
    ceiling: librarySurface("metal/corrugated", "#7d8890"),
    structure: { paint: "metal/plate", steel: "metal/steel", floor: "concrete/smooth", printed: "metal/plate", brass: "metal/steel" },
    structureBlend: 0.45, structureTint: "#d5e1e8",
    dressing: {
      trim: librarySurface("metal/steel", "#9aa7af"),
      pipe: librarySurface("metal/steel", "#c3d0d8"),
      fitting: librarySurface("metal/painted", "#5f7686"),
      housing: librarySurface("metal/steel", "#5b666d"),
      lens: lens("#e2f1ff", 4),
      lensOff: dark,
      panel: librarySurface("metal/painted", "#7e98a6"),
      hatch: librarySurface("metal/steel", "#8f9ca3"),
    },
    cable: "#1b2228",
    practical: { color: "#dcecff", intensity: 20, distance: 8, count: 3, shadowed: 1 },
  },
  wells: {
    wall: librarySurface("ground/rock", "#3d3638", { normalScale: [1.1, 1.1] }),
    floor: librarySurface("metal/rust", "#6e5a50"),
    ceiling: librarySurface("ground/rock", "#2c272b"),
    structure: { paint: "metal/rust", steel: "metal/rust", floor: "metal/rust", printed: "metal/chipped", brass: "metal/chipped" },
    structureBlend: 0.6, structureTint: "#5e5254",
    dressing: {
      trim: librarySurface("metal/rust", "#6a554e"),
      pipe: librarySurface("metal/rust", "#8c6c5a"),
      fitting: librarySurface("metal/chipped", "#4e4650"),
      housing: librarySurface("metal/rust", "#3f3638"),
      lens: lens("#ffb066", 4),
      lensOff: dark,
      panel: librarySurface("metal/rust", "#5a4a44"),
      hatch: librarySurface("metal/chipped", "#4a4648"),
    },
    cable: "#141016",
    // The wells' violet lives in the ink; the few working lamps burn sodium orange over it.
    practical: { color: "#f0a468", intensity: 9, distance: 7, count: 3, shadowed: 1 },
  },
  choir: {
    wall: librarySurface("concrete/rough", "#8e857e"),
    floor: librarySurface("stone/terrazzo", "#6f6561"),
    ceiling: librarySurface("concrete/smooth", "#4a4442"),
    structure: { paint: "concrete/smooth", steel: "metal/chipped", floor: "stone/terrazzo", printed: "concrete/smooth", brass: "metal/chipped" },
    structureBlend: 0.55, structureTint: "#8d827c",
    dressing: {
      trim: librarySurface("concrete/smooth", "#7a706a"),
      pipe: librarySurface("metal/chipped", "#5c3a34"),
      fitting: librarySurface("metal/steel", "#3c3534"),
      housing: librarySurface("metal/steel", "#2e2827"),
      lens: lens("#ff8a6c", 4),
      lensOff: dark,
      panel: librarySurface("concrete/smooth", "#5f5450"),
      hatch: librarySurface("metal/chipped", "#4a3a36"),
    },
    cable: "#120c0c",
    practical: { color: "#ff7c60", intensity: 16, distance: 8, count: 2, shadowed: 1 },
  },
};

/** Pull an authored colour part of the way toward a floor's palette, so the station parts belong to it. */
export function blendTint(authored: string, toward: string, amount: number): string {
  const parse = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const a = parse(authored), b = parse(toward);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return authored;
  return `#${a.map((value, i) => Math.round(value + (b[i]! - value) * amount).toString(16).padStart(2, "0")).join("")}`;
}
