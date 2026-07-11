import { CELL, DESIGN_LANGUAGES, makeBuilding, type Building, type DecisionRecord, type DesignLanguage, type DistrictCharter, type DistrictMood, type Plaza, type PlazaKind, type Program, type Typology } from "../catalog";

export const CITY_LIBRARY_KEY = "jg-monument-city-library-v1";
export const CITY_LIBRARY_LIMIT = 30;

export interface SavedCity {
  buildings: Building[];
  plazas: Plaza[];
  briefStage: number;
  charter: DistrictCharter;
  decisions: DecisionRecord[];
  mood: DistrictMood;
  hour: number;
  day: number;
}

export interface CitySaveRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  snapshot: SavedCity;
}

export interface CityTemplate {
  id: "blank" | "civic-basin" | "garden-terraces" | "campus-forum";
  name: string;
  label: string;
  description: string;
  accent: string;
  create: (prefix: string) => SavedCity;
}

export type LibraryStorage = Pick<Storage, "getItem" | "setItem">;

const baseSnapshot = (buildings: Building[], plazas: Plaza[], mood: DistrictMood, hour: number): SavedCity => ({
  buildings,
  plazas,
  briefStage: 0,
  charter: {},
  decisions: [],
  mood,
  hour,
  day: 1,
});

const plaza = (prefix: string, index: number, x: number, z: number, kind: PlazaKind, trees: number): Plaza => ({
  id: `${prefix}-p-${index}`,
  x,
  z,
  kind,
  trees,
});

interface BuildingSeed {
  gx: number;
  gz: number;
  program: Program;
  typology: Typology;
  name: string;
  language: DesignLanguage;
  patch?: Partial<Building>;
}

const buildDistrict = (prefix: string, seeds: BuildingSeed[]): Building[] =>
  seeds.map((seed, index) => {
    const x = seed.gx * CELL;
    const z = seed.gz * CELL;
    const building = makeBuilding(`${prefix}-b-${index}`, x, z, seed.program, seed.typology, index);
    Object.assign(building, structuredClone(DESIGN_LANGUAGES[seed.language].patch), structuredClone(seed.patch ?? {}), {
      id: `${prefix}-b-${index}`,
      name: seed.name,
      x,
      z,
      program: seed.program,
      typology: seed.typology,
      language: seed.language,
    });
    return building;
  });

const concreteCommons = (prefix: string): Building[] =>
  buildDistrict(prefix, [
    { gx: -4, gz: 0, program: "housing", typology: "bridge", name: "West Inhabited Frame", language: "infrastructural", patch: { height: 62, width: 72, depth: 22, composition: "megastructure", branches: 5, crown: 64, rotation: 90, vegetation: 22, weathering: 48 } },
    { gx: -2, gz: -2, program: "housing", typology: "terrace", name: "Aggregate Steps", language: "garden", patch: { height: 42, tone: "terracotta", vegetation: 66, rotation: 8 } },
    { gx: 0, gz: -2, program: "civic", typology: "citadel", name: "Long Assembly", language: "civic", patch: { height: 36, width: 48, composition: "court", voids: 58, rotation: 0 } },
    { gx: 2, gz: -2, program: "work", typology: "bridge", name: "Aerial Workshop", language: "infrastructural", patch: { height: 54, branches: 4, crown: 52, rotation: 0 } },
    { gx: 4, gz: 0, program: "civic", typology: "tower", name: "Metropolitan Lantern", language: "monolithic", patch: { height: 104, width: 24, depth: 24, profile: "top-heavy", crown: 86, tone: "raw" } },
    { gx: -2, gz: 0, program: "mixed", typology: "slab", name: "Commons Bar", language: "tropical", patch: { height: 48, width: 42, depth: 18, rotation: 90, vegetation: 58 } },
    { gx: 2, gz: 0, program: "housing", typology: "tower", name: "Balcony House", language: "metabolist", patch: { height: 82, composition: "capsule", branches: 5, moduleDensity: 5, crown: 66, tone: "white" } },
    { gx: -2, gz: 2, program: "housing", typology: "slab", name: "Sun Court", language: "tropical", patch: { height: 52, width: 44, depth: 18, rotation: 90, vegetation: 74 } },
    { gx: 0, gz: 2, program: "culture", typology: "forum", name: "Assembly of Light", language: "civic", patch: { height: 31, width: 34, depth: 34, composition: "ring", crown: 46, tone: "warm" } },
    { gx: 2, gz: 2, program: "mixed", typology: "terrace", name: "Cascade Commons", language: "garden", patch: { height: 46, vegetation: 82, tone: "sand", rotation: -8 } },
    { gx: 0, gz: 4, program: "culture", typology: "citadel", name: "North Arts Citadel", language: "monolithic", patch: { height: 44, width: 54, depth: 28, profile: "top-heavy", articulation: 74, tone: "terracotta" } },
    { gx: -4, gz: -3, program: "work", typology: "slab", name: "Foundry Walk", language: "monolithic", patch: { height: 38, width: 54, depth: 16, rotation: 0 } },
    { gx: 4, gz: 3, program: "mixed", typology: "bridge", name: "Eastern Sky Rooms", language: "civic", patch: { height: 46, width: 50, depth: 17, branches: 3, rotation: 90 } },
  ]);

const gardenTerraces = (prefix: string): Building[] =>
  buildDistrict(prefix, [
    { gx: -3, gz: -2, program: "housing", typology: "terrace", name: "Rose Steps", language: "garden", patch: { height: 28, tone: "warm", vegetation: 100, rotation: -12 } },
    { gx: -2, gz: -2, program: "mixed", typology: "terrace", name: "Kitchen Gardens", language: "tropical", patch: { height: 24, tone: "terracotta", vegetation: 94, rotation: 6 } },
    { gx: -1, gz: -2, program: "housing", typology: "slab", name: "Shaded Walk", language: "tropical", patch: { height: 27, width: 25, depth: 15, vegetation: 88, rotation: 0 } },
    { gx: 1, gz: -2, program: "work", typology: "terrace", name: "Courtyard Studios", language: "garden", patch: { height: 22, tone: "sand", vegetation: 86, rotation: -7 } },
    { gx: 2, gz: -2, program: "housing", typology: "terrace", name: "Fig House", language: "garden", patch: { height: 32, tone: "warm", vegetation: 100, rotation: 11 } },
    { gx: 3, gz: -1, program: "civic", typology: "forum", name: "Garden Room", language: "tropical", patch: { height: 18, width: 25, depth: 25, composition: "ring", vegetation: 96 } },
    { gx: 3, gz: 1, program: "housing", typology: "slab", name: "East Loggia", language: "tropical", patch: { height: 34, width: 27, depth: 16, rotation: 90, vegetation: 92 } },
    { gx: 2, gz: 2, program: "mixed", typology: "terrace", name: "Orchard Terraces", language: "garden", patch: { height: 38, tone: "sand", vegetation: 100, rotation: -9 } },
    { gx: 1, gz: 2, program: "culture", typology: "forum", name: "Canopy Theatre", language: "garden", patch: { height: 20, width: 25, depth: 24, composition: "cluster", articulation: 64, vegetation: 90 } },
    { gx: -1, gz: 2, program: "housing", typology: "terrace", name: "Warm Court", language: "garden", patch: { height: 29, tone: "terracotta", vegetation: 96, rotation: 8 } },
    { gx: -2, gz: 2, program: "work", typology: "slab", name: "Garden Studios", language: "tropical", patch: { height: 25, width: 26, depth: 15, vegetation: 88, rotation: 0 } },
    { gx: -3, gz: 1, program: "housing", typology: "terrace", name: "Hill Rooms", language: "garden", patch: { height: 36, tone: "warm", vegetation: 100, rotation: 12 } },
    { gx: -3, gz: -1, program: "mixed", typology: "slab", name: "Market Veranda", language: "tropical", patch: { height: 21, width: 27, depth: 16, vegetation: 84, rotation: 90 } },
    { gx: 0, gz: 3, program: "housing", typology: "terrace", name: "North Cascade", language: "garden", patch: { height: 42, tone: "sand", vegetation: 100, rotation: 0 } },
    { gx: 0, gz: -3, program: "civic", typology: "citadel", name: "Baths and Nursery", language: "tropical", patch: { height: 19, width: 27, depth: 25, vegetation: 92, rotation: 0 } },
  ]);

const campusForum = (prefix: string): Building[] =>
  buildDistrict(prefix, [
    { gx: 0, gz: -3, program: "civic", typology: "slab", name: "South Library", language: "civic", patch: { height: 34, width: 58, depth: 18, rotation: 0, tone: "white" } },
    { gx: -2, gz: -2, program: "housing", typology: "slab", name: "West Residence", language: "civic", patch: { height: 39, width: 44, depth: 17, rotation: 90, tone: "sand" } },
    { gx: 0, gz: -2, program: "culture", typology: "forum", name: "Auditorium Court", language: "monolithic", patch: { height: 27, width: 38, depth: 29, composition: "ring", tone: "terracotta", crown: 52 } },
    { gx: 2, gz: -2, program: "work", typology: "slab", name: "Fabrication Hall", language: "infrastructural", patch: { height: 32, width: 45, depth: 18, rotation: 90, tone: "raw" } },
    { gx: -3, gz: 0, program: "housing", typology: "tower", name: "Scholars Tower", language: "civic", patch: { height: 78, width: 21, depth: 21, crown: 70, tone: "white" } },
    { gx: -2, gz: 0, program: "civic", typology: "citadel", name: "Archive Cloister", language: "civic", patch: { height: 25, width: 30, depth: 29, composition: "court", voids: 62, tone: "sand" } },
    { gx: 2, gz: 0, program: "work", typology: "bridge", name: "Bridge Laboratory", language: "infrastructural", patch: { height: 47, width: 48, depth: 17, branches: 4, rotation: 90 } },
    { gx: 3, gz: 0, program: "mixed", typology: "tower", name: "Graduate House", language: "metabolist", patch: { height: 68, width: 23, depth: 21, composition: "capsule", moduleDensity: 4, branches: 3, tone: "white" } },
    { gx: -2, gz: 2, program: "culture", typology: "forum", name: "Gallery Arcade", language: "civic", patch: { height: 23, width: 31, depth: 27, composition: "ring", tone: "warm" } },
    { gx: 0, gz: 2, program: "civic", typology: "citadel", name: "Great Forum", language: "civic", patch: { height: 32, width: 52, depth: 29, composition: "court", voids: 56, tone: "white" } },
    { gx: 2, gz: 2, program: "housing", typology: "slab", name: "East Residence", language: "civic", patch: { height: 41, width: 45, depth: 17, rotation: 90, tone: "sand" } },
    { gx: 0, gz: 3, program: "work", typology: "bridge", name: "North Research Bridge", language: "infrastructural", patch: { height: 46, width: 58, depth: 18, rotation: 0, branches: 3 } },
    { gx: 3, gz: 3, program: "culture", typology: "tower", name: "Observatory Lantern", language: "civic", patch: { height: 62, width: 20, depth: 20, crown: 92, tone: "terracotta" } },
  ]);

export const CITY_TEMPLATES: CityTemplate[] = [
  {
    id: "blank",
    name: "Open Ground",
    label: "New city",
    accent: "#d7ff43",
    description: "A clear site for building a city from scratch.",
    create: () => baseSnapshot([], [], "default", 15),
  },
  {
    id: "civic-basin",
    name: "Concrete Commons",
    label: "Ready city",
    accent: "#e96b50",
    description: "A dense civic center of inhabited bridges, stepped megaframes, water courts, and evening gathering spaces.",
    create: (prefix) =>
      baseSnapshot(
        concreteCommons(prefix),
        [plaza(prefix, 0, 0, 0, "forum", 9), plaza(prefix, 1, -CELL, 0, "garden", 8), plaza(prefix, 2, CELL, 0, "water", 5), plaza(prefix, 3, 0, -CELL, "water", 6)],
        "default",
        17.25,
      ),
  },
  {
    id: "garden-terraces",
    name: "Garden Terraces",
    label: "Ready city",
    accent: "#7fe083",
    description: "A leafy neighborhood of planted terraces, warm homes, garden rooms, and shaded lanes.",
    create: (prefix) =>
      baseSnapshot(
        gardenTerraces(prefix),
        [plaza(prefix, 0, 0, 0, "garden", 14), plaza(prefix, 1, 0, CELL, "garden", 12), plaza(prefix, 2, 0, -CELL, "water", 8), plaza(prefix, 3, -CELL, 0, "garden", 10), plaza(prefix, 4, CELL, 0, "forum", 9)],
        "green",
        15.25,
      ),
  },
  {
    id: "campus-forum",
    name: "Campus Forum",
    label: "Ready city",
    accent: "#f0c65e",
    description: "A lively academic quarter of libraries, workshops, residences, arcades, and a central forum.",
    create: (prefix) =>
      baseSnapshot(
        campusForum(prefix),
        [plaza(prefix, 0, 0, 0, "forum", 10), plaza(prefix, 1, -CELL, 0, "garden", 9), plaza(prefix, 2, CELL, 0, "garden", 9), plaza(prefix, 3, 0, -CELL, "water", 5), plaza(prefix, 4, 0, CELL, "forum", 8)],
        "university",
        19.75,
      ),
  },
];

const validSnapshot = (value: unknown): value is SavedCity =>
  Boolean(value && typeof value === "object" && Array.isArray((value as SavedCity).buildings) && Array.isArray((value as SavedCity).plazas));

const defaultStorage = (): LibraryStorage | null => (typeof localStorage === "undefined" ? null : localStorage);

export function readCityLibrary(storage: LibraryStorage | null = defaultStorage()): CitySaveRecord[] {
  if (storage === null) return [];
  try {
    const saved = JSON.parse(storage.getItem(CITY_LIBRARY_KEY) ?? "null") as unknown;
    if (Array.isArray(saved)) {
      return saved
        .filter((record): record is CitySaveRecord => Boolean(record && typeof record === "object" && validSnapshot((record as CitySaveRecord).snapshot)))
        .slice(0, CITY_LIBRARY_LIMIT);
    }
  } catch {
    return [];
  }
  return [];
}

export function writeCityLibrary(records: CitySaveRecord[], storage: LibraryStorage | null = defaultStorage()): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(CITY_LIBRARY_KEY, JSON.stringify(records.slice(0, CITY_LIBRARY_LIMIT)));
    return true;
  } catch {
    return false;
  }
}

export function snapshotSummary(snapshot: SavedCity): { structures: number; plazas: number; day: number; mood: DistrictMood } {
  return { structures: snapshot.buildings.length, plazas: snapshot.plazas.length, day: snapshot.day, mood: snapshot.mood };
}

export const MOOD_DEFS: ReadonlyArray<{ id: DistrictMood; label: string; accent: string; hour: number }> = [
  { id: "default", label: "Default", accent: "#d7ff43", hour: 16.5 },
  { id: "cyberpunk", label: "Cyberpunk", accent: "#51f4ff", hour: 22 },
  { id: "green", label: "Green", accent: "#7fe083", hour: 14.5 },
  { id: "totalitarian", label: "Totalitarian", accent: "#9d111b", hour: 20.5 },
  { id: "university", label: "University", accent: "#f0c65e", hour: 19.75 },
];
