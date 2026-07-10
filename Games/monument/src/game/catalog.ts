import type { MassingComposition, MassingProfile } from "@jgengine/core/world/massing";

export type Program = "housing" | "work" | "civic" | "culture" | "mixed";
export type Tool = "select" | Program | "plaza" | "demolish";
export type Lens = "material" | "program" | "structure" | "daylight" | "activity" | "carbon";
export type DistrictMood = "default" | "cyberpunk" | "green" | "totalitarian" | "university";
export type Tone = "raw" | "warm" | "sand" | "terracotta" | "charcoal" | "white";
export type Typology = "slab" | "tower" | "terrace" | "citadel" | "bridge" | "forum";
export type StructuralSystem = "frame" | "walls" | "cores";
export type FacadeStrategy = "ribbon" | "deep-grid" | "brise-soleil" | "punched" | "exoskeleton" | "screen";
export type DesignLanguage = "monolithic" | "civic" | "metabolist" | "tropical" | "infrastructural" | "garden";
export type PlazaKind = "water" | "garden" | "forum";

export interface DistrictCharter {
  undercroft?: "open" | "quiet";
  commons?: "shared" | "specialist";
  aggregate?: "reuse" | "formal";
}

export interface DecisionRecord {
  eventId: keyof DistrictCharter;
  choice: string;
  day: number;
}

export interface CitySignals {
  activity: number;
  nightAccess: "neutral" | "open" | "quiet";
  sharedRooms: boolean;
  specialistGrowth: boolean;
  reuse: boolean;
  formal: boolean;
}

export interface Building {
  id: string;
  name: string;
  x: number;
  z: number;
  height: number;
  width: number;
  depth: number;
  rotation: number;
  terraces: number;
  cantilever: number;
  porosity: number;
  rhythm: number;
  tone: Tone;
  program: Program;
  typology: Typology;
  condition: number;
  age: number;
  floorHeight: number;
  baySpacing: number;
  structural: StructuralSystem;
  facade: FacadeStrategy;
  pilotis: number;
  balconies: number;
  cores: number;
  podiumHeight: number;
  language: DesignLanguage;
  voids: number;
  taper: number;
  facadeDepth: number;
  weathering: number;
  vegetation: number;
  composition: MassingComposition;
  profile: MassingProfile;
  moduleDensity: number;
  articulation: number;
  branches: number;
  crown: number;
}

export interface Plaza {
  id: string;
  x: number;
  z: number;
  trees: number;
  kind: PlazaKind;
}

export interface CityMetrics {
  population: number;
  capacity: number;
  jobs: number;
  culture: number;
  civic: number;
  activity: number;
  approval: number;
  carbon: number;
}

export const GRID = 11;
export const CELL = 32;
export const HALF = (GRID - 1) / 2;
export const DAY_LENGTH = 54;

export const PROGRAMS: Record<Program, { label: string; short: string; color: string; description: string }> = {
  housing: { label: "Residential", short: "Residential", color: "#e96b50", description: "Apartments, duplexes, hotels, or live-work floors." },
  work: { label: "Studio / office", short: "Studio", color: "#7aa4e8", description: "Open commercial plates, workshops, laboratories, or offices." },
  civic: { label: "Institutional", short: "Institution", color: "#d7ff43", description: "University, library, government, medical, or research space." },
  culture: { label: "Gallery / event", short: "Gallery", color: "#bc86de", description: "Museum, auditorium, exhibition, performance, or event space." },
  mixed: { label: "Hybrid", short: "Hybrid", color: "#f0c65e", description: "Any combination of residential, commercial, institutional, and cultural use." },
};

export const TONES: Record<Tone, { label: string; color: string }> = {
  raw: { label: "Board-marked", color: "#aaa79e" },
  warm: { label: "Rose aggregate", color: "#b48a76" },
  sand: { label: "Golden aggregate", color: "#c1a979" },
  terracotta: { label: "Oxide concrete", color: "#a65f47" },
  charcoal: { label: "Carbon black", color: "#4d504d" },
  white: { label: "Pale cement", color: "#d9d4c7" },
};

export const DESIGN_LANGUAGES: Record<DesignLanguage, { label: string; subtitle: string; description: string; patch: Partial<Building> }> = {
  monolithic: { label: "Monolithic", subtitle: "mass / silence", description: "Deeply carved, weighty, and materially severe.", patch: { language: "monolithic", composition: "bar", profile: "straight", tone: "raw", structural: "walls", facade: "punched", voids: 12, taper: 4, facadeDepth: 0.35, weathering: 62, vegetation: 4, balconies: 8 } },
  civic: { label: "Civic", subtitle: "ritual / generosity", description: "Processional ground, legible frames, and public thresholds.", patch: { language: "civic", composition: "court", profile: "stepped", tone: "warm", structural: "frame", facade: "brise-soleil", voids: 38, taper: 10, facadeDepth: 1.1, weathering: 24, vegetation: 32, pilotis: 5 } },
  metabolist: { label: "Metabolist", subtitle: "plug-in / growth", description: "Exposed cores, replaceable modules, and bold cantilevers.", patch: { language: "metabolist", composition: "capsule", profile: "offset", tone: "white", structural: "cores", facade: "screen", voids: 26, taper: 18, facadeDepth: 1.8, weathering: 18, vegetation: 14, cantilever: 4.2, balconies: 58 } },
  tropical: { label: "Tropical", subtitle: "shade / porosity", description: "Deep shade, open ground, planted rooms, and air movement.", patch: { language: "tropical", composition: "split", profile: "stepped", tone: "warm", structural: "frame", facade: "brise-soleil", voids: 52, taper: 22, facadeDepth: 2.1, weathering: 34, vegetation: 92, pilotis: 7, balconies: 86, porosity: 64 } },
  infrastructural: { label: "Infrastructure", subtitle: "span / machine", description: "Long spans, service cores, bridges, and exposed systems.", patch: { language: "infrastructural", composition: "megastructure", profile: "straight", tone: "charcoal", structural: "cores", facade: "exoskeleton", voids: 44, taper: 6, facadeDepth: 2.8, weathering: 72, vegetation: 2, cantilever: 8.2, porosity: 32 } },
  garden: { label: "Garden", subtitle: "terrace / habitat", description: "Architecture as inhabited topography and cultivated ruin.", patch: { language: "garden", composition: "stack", profile: "tapered", tone: "sand", structural: "walls", facade: "ribbon", voids: 34, taper: 48, facadeDepth: 0.8, weathering: 44, vegetation: 100, terraces: 4, balconies: 94 } },
};

export const COMPOSITIONS: Record<MassingComposition, { label: string; subtitle: string }> = {
  bar: { label: "Bar", subtitle: "one continuous plate" },
  split: { label: "Split", subtitle: "paired wings + bridges" },
  cluster: { label: "Cluster", subtitle: "aggregated volumes" },
  stack: { label: "Stack", subtitle: "layered plates" },
  court: { label: "Court", subtitle: "inhabited perimeter" },
  bridge: { label: "Bridge", subtitle: "cores + airborne spans" },
  ring: { label: "Ring", subtitle: "cylindrical atrium" },
  capsule: { label: "Capsule", subtitle: "plug-in inhabitable pods" },
  megastructure: { label: "Megaframe", subtitle: "city-scale armature" },
};

export const PROFILES: Record<MassingProfile, { label: string; subtitle: string }> = {
  straight: { label: "Plumb", subtitle: "direct extrusion" },
  stepped: { label: "Stepped", subtitle: "setbacks + roof rooms" },
  tapered: { label: "Tapered", subtitle: "narrowing silhouette" },
  "top-heavy": { label: "Top-heavy", subtitle: "inverted monument" },
  offset: { label: "Offset", subtitle: "drifting plates" },
  twisted: { label: "Twisted", subtitle: "rotating tiers" },
};

export const ARCHITECTURAL_TRAJECTORIES: Record<string, { label: string; subtitle: string; description: string; patch: Partial<Building> }> = {
  fivePoints: { label: "Five Points", subtitle: "pilotis / ribbon / roof garden", description: "A free plan lifted above the ground with long horizontal glazing and a cultivated roof.", patch: { composition: "bar", profile: "straight", height: 30, width: 38, depth: 16, pilotis: 6.5, podiumHeight: 0, cantilever: 2.2, voids: 20, taper: 4, structural: "frame", facade: "ribbon", facadeDepth: 1.35, porosity: 68, vegetation: 72, balconies: 28, tone: "white", cores: 2, moduleDensity: 2, articulation: 18, branches: 0, crown: 18 } },
  unite: { label: "Habitation Block", subtitle: "brise-soleil / roof city", description: "A deep residential bar with a monumental frame, duplex rhythm, and a highly programmed roof.", patch: { composition: "bar", profile: "straight", height: 62, width: 46, depth: 24, pilotis: 7, cantilever: 1.5, voids: 16, taper: 2, structural: "frame", facade: "brise-soleil", facadeDepth: 2.8, porosity: 52, vegetation: 48, balconies: 82, tone: "raw", cores: 3, moduleDensity: 3, articulation: 12, branches: 1, crown: 36 } },
  capsules: { label: "Capsule Tower", subtitle: "service spine / plug-in pods", description: "Replaceable inhabitable capsules lock into a permanent concrete and service armature.", patch: { composition: "capsule", profile: "offset", height: 76, width: 34, depth: 22, pilotis: 3, cantilever: 7, voids: 46, taper: 12, structural: "cores", facade: "screen", facadeDepth: 2.2, porosity: 58, vegetation: 10, balconies: 8, tone: "white", cores: 2, moduleDensity: 5, articulation: 88, branches: 4, crown: 58 } },
  mega: { label: "Megastructure", subtitle: "giant frame / suspended districts", description: "A city-scale armature carries variable neighborhoods, sky streets, bridges, and service towers.", patch: { composition: "megastructure", profile: "offset", height: 118, width: 94, depth: 30, pilotis: 9, cantilever: 13, voids: 58, taper: 8, structural: "cores", facade: "exoskeleton", facadeDepth: 4, porosity: 46, vegetation: 26, balconies: 34, tone: "charcoal", cores: 4, moduleDensity: 4, articulation: 76, branches: 6, crown: 82 } },
  courtyard: { label: "Courtyard Fortress", subtitle: "perimeter / carved interior", description: "A massive inhabited wall surrounds a deep open court, cut by gates and roof terraces.", patch: { composition: "court", profile: "stepped", height: 38, width: 62, depth: 62, pilotis: 0, cantilever: 2, voids: 68, taper: 28, structural: "walls", facade: "punched", facadeDepth: 1.4, porosity: 34, vegetation: 46, balconies: 18, tone: "warm", cores: 3, moduleDensity: 3, articulation: 42, branches: 2, crown: 22 } },
  plastic: { label: "Plastic Concrete", subtitle: "chapel / bunker / sculpture", description: "Top-heavy sculptural masses, deep shadow, and asymmetric light turn concrete into inhabited geology.", patch: { composition: "cluster", profile: "top-heavy", height: 34, width: 38, depth: 32, pilotis: 1, cantilever: 7, voids: 42, taper: 52, structural: "walls", facade: "screen", facadeDepth: 3.2, porosity: 24, vegetation: 18, balconies: 6, tone: "terracotta", cores: 2, moduleDensity: 4, articulation: 72, branches: 3, crown: 28 } },
};

export const TYPOLOGIES: Record<
  Typology,
  {
    label: string;
    subtitle: string;
    height: number;
    width: number;
    depth: number;
    terraces: number;
    cantilever: number;
    floorHeight: number;
    baySpacing: number;
    structural: StructuralSystem;
    facade: FacadeStrategy;
    pilotis: number;
    balconies: number;
    cores: number;
    podiumHeight: number;
    composition: MassingComposition;
    profile: MassingProfile;
  }
> = {
  slab: { label: "The Slab", subtitle: "efficient / rhythmic", height: 34, width: 28, depth: 14, terraces: 1, cantilever: 0, floorHeight: 3.15, baySpacing: 3.3, structural: "frame", facade: "ribbon", pilotis: 4.4, balconies: 42, cores: 2, podiumHeight: 0, composition: "bar", profile: "straight" },
  tower: { label: "The Tower", subtitle: "vertical / luminous", height: 70, width: 19, depth: 19, terraces: 2, cantilever: 1.2, floorHeight: 3.25, baySpacing: 3.2, structural: "cores", facade: "deep-grid", pilotis: 4.5, balconies: 12, cores: 1, podiumHeight: 7, composition: "stack", profile: "tapered" },
  terrace: { label: "The Cascade", subtitle: "stepped / social", height: 32, width: 28, depth: 26, terraces: 4, cantilever: 0, floorHeight: 3.2, baySpacing: 3.4, structural: "walls", facade: "punched", pilotis: 0, balconies: 76, cores: 2, podiumHeight: 4, composition: "cluster", profile: "stepped" },
  citadel: { label: "The Citadel", subtitle: "civic / monumental", height: 24, width: 28, depth: 27, terraces: 2, cantilever: 2.4, floorHeight: 4.2, baySpacing: 4.6, structural: "frame", facade: "brise-soleil", pilotis: 5.2, balconies: 18, cores: 2, podiumHeight: 4, composition: "court", profile: "top-heavy" },
  bridge: { label: "The Bridge", subtitle: "porous / connective", height: 38, width: 28, depth: 14, terraces: 2, cantilever: 4.8, floorHeight: 3.35, baySpacing: 3.6, structural: "cores", facade: "deep-grid", pilotis: 7, balconies: 30, cores: 2, podiumHeight: 0, composition: "bridge", profile: "straight" },
  forum: { label: "The Forum", subtitle: "sculptural / collective", height: 24, width: 26, depth: 26, terraces: 2, cantilever: 2.8, floorHeight: 4.6, baySpacing: 4.2, structural: "frame", facade: "brise-soleil", pilotis: 3.8, balconies: 22, cores: 1, podiumHeight: 3, composition: "ring", profile: "top-heavy" },
};

export const TYPOLOGY_CYCLE: readonly Typology[] = ["slab", "tower", "terrace", "citadel", "bridge", "forum"];

export const PLAZA_KINDS: Record<PlazaKind, { label: string; description: string }> = {
  water: { label: "Reflecting court", description: "A still basin cools the ground and doubles the sky." },
  garden: { label: "Canopy garden", description: "Planted rooms and deep shade between the megastructures." },
  forum: { label: "Civic forum", description: "Hard paving, steps, and speech — the district's open floor." },
};

const BUILDING_NAMES = [
  "Barbican House",
  "Trellick Court",
  "Habitat Hall",
  "Robin Hood Block",
  "Balfron Works",
  "Unité Forum",
  "Boston Assembly",
  "Preston Stack",
  "Rossi Archive",
  "Goldfinger House",
  "Smithson Yard",
  "Breuer Hall",
];

const PLACEMENT_TONES: readonly Tone[] = ["warm", "white", "sand", "raw", "terracotta", "warm"];

export function makeBuilding(id: string, x: number, z: number, program: Program, typology: Typology, index: number): Building {
  const t = TYPOLOGIES[typology];
  return {
    id,
    name: BUILDING_NAMES[index % BUILDING_NAMES.length],
    x,
    z,
    program,
    typology,
    height: t.height,
    width: t.width,
    depth: t.depth,
    terraces: t.terraces,
    cantilever: t.cantilever,
    rotation: (x + z) % 2 === 0 ? 0 : 90,
    porosity: 36 + (index * 7) % 38,
    rhythm: 3 + (index % 5),
    tone: PLACEMENT_TONES[index % 6],
    condition: 94,
    age: index % 18,
    floorHeight: t.floorHeight,
    baySpacing: t.baySpacing,
    structural: t.structural,
    facade: t.facade,
    pilotis: t.pilotis,
    balconies: t.balconies,
    cores: t.cores,
    podiumHeight: t.podiumHeight,
    language: "civic",
    voids: 28,
    taper: 12,
    facadeDepth: 1,
    weathering: 24,
    vegetation: 34,
    composition: t.composition,
    profile: t.profile,
    moduleDensity: 3,
    articulation: 34,
    branches: 1,
    crown: 24,
  };
}

const STARTER_SEEDS: ReadonlyArray<[number, number, Program, Typology, number, string, DesignLanguage]> = [
  [-2, -2, "housing", "slab", -8, "Barbican Walk", "tropical"],
  [0, -2, "civic", "citadel", 90, "Civic Water Court", "civic"],
  [2, -2, "work", "bridge", 0, "Aerial Works", "infrastructural"],
  [-2, 0, "mixed", "terrace", 10, "Habitat Gardens", "garden"],
  [0, 0, "culture", "forum", 0, "Assembly of Light", "civic"],
  [2, 0, "housing", "slab", 90, "Sun House", "metabolist"],
  [-2, 2, "work", "slab", -6, "Garden Studios", "monolithic"],
  [2, 2, "mixed", "terrace", 7, "Cascade Commons", "garden"],
  [-4, 0, "housing", "bridge", 90, "Bridge House", "infrastructural"],
  [4, 0, "civic", "tower", 0, "Metropolitan Hall", "monolithic"],
  [0, 4, "culture", "citadel", -12, "Terrace Theatre", "civic"],
];

export function initialBuildings(): Building[] {
  return STARTER_SEEDS.map(([gx, gz, program, typology, rotation, name, language], i) => {
    const building = makeBuilding(`b-seed-${i}`, gx * CELL, gz * CELL, program, typology, i);
    building.rotation = rotation;
    building.name = name;
    building.language = language;
    const patch = DESIGN_LANGUAGES[language].patch;
    building.voids = patch.voids ?? building.voids;
    building.taper = patch.taper ?? building.taper;
    building.facadeDepth = patch.facadeDepth ?? building.facadeDepth;
    building.weathering = patch.weathering ?? building.weathering;
    building.vegetation = patch.vegetation ?? building.vegetation;
    building.composition = patch.composition ?? building.composition;
    building.profile = patch.profile ?? building.profile;
    return building;
  });
}

export const lots = Array.from({ length: GRID * GRID }, (_, i) => {
  const gx = (i % GRID) - HALF;
  const gz = Math.floor(i / GRID) - HALF;
  return { gx, gz, x: gx * CELL, z: gz * CELL };
});
