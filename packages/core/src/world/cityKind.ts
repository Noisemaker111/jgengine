/**
 * `city` studio: a procedural district authored as a box volume — drop a volume and sliders tune
 * the whole synthesis, from a rigid Manhattan grid (`gridness` 1, `curviness` 0) to winding
 * hillside estates or a two-road crossroads farm town. Streets are perturbed grid polylines with a
 * visible hierarchy (boulevards with medians, avenues, streets, lanes — optionally gravel), cross
 * intersections and cul-de-sac bulbs are first-class data, and water gaps become styled bridge
 * decks. Inside the district a ZONE layer (core/mid/edge bands, invertible or spatially uniform)
 * drives everything a lot is: a weighted class mix per band picks the building class (tower, slab,
 * shop, rowhouse, house, mansion, farmhouse, barn, silo), and each class composes deterministic
 * massing PIECES (`cityContent`) — setback tower tiers, gabled houses, gambrel barns, domed silos.
 * Blocks left unbuilt become plazas/greens/meadows by band, or crop-row farm fields. Street
 * furniture (lights, species-mixed trees, estate hedges, driveways, parking lots) resolves as
 * bounded, seeded data hooked to the network. Child `cityzone` volumes override the band/mix
 * locally, so hand-placed intent wins over the profile. Named presets (Manhattan, Los Angeles,
 * Beverly Hills, rural Ohio…) ship as plain slider bundles on the schema. Pure config + resolver
 * here; the instanced renderer lives in the `shell`. Everything is deterministic per seed and
 * persisted in `editor.scene.json`.
 *
 * @capability city-district editor-authorable procedural city district (streets, zoning, buildings, furniture)
 */
import { seededStreams } from "../random/rng";
import {
  parseParams,
  registerSceneKind,
  type ParamSchema,
  type SceneKindObject,
  type SceneKindResolveContext,
  type WeightedParamEntry,
} from "../scene/sceneKinds";
import { BUILDING_STYLE_PALETTES, DEFAULT_BUILDING_STYLE, type BuildingStyle } from "./buildings";
import {
  buildLotPieces,
  pickClass,
  pickSpecies,
  rollClassPlacement,
  zoneBand,
  zoneMetric,
  type CityLotClass,
  type CityLotPiece,
  type CityTreeSpecies,
  type CityZoneBand,
  type CityZoneProfile,
} from "./cityContent";
import { furnitureSpots } from "./streets";
import type { RoadEnvironmentDescriptor } from "./features";
import type { RoadPoint } from "./roads";

/** The editor volume kind marking a box as a procedural city district. */
export const CITY_KIND = "city";

/** The editor volume kind that locally overrides a city's zone band/mix — a district in a district. */
export const CITY_ZONE_KIND = "cityzone";

/** Fully-defaulted city params parsed from a volume's `meta`. */
export interface CityRules {
  /** 1 = strict orthogonal grid (regular spacing, full through-streets); 0 = organic irregular net. */
  gridness: number;
  /** How much individual streets wander sideways. 0 = ruler-straight. */
  curviness: number;
  /** Density of branch lanes forking off the main streets, 0..1. */
  branching: number;
  /** Target block size (street spacing) in meters. */
  blockSize: number;
  /** Cross-axis spacing multiplier — 2+ gives long skinny Manhattan blocks with avenue/street rhythm. */
  blockAspect: number;
  /** Fraction of blocks left unbuilt as parks/plazas, 0..1. */
  openSpace: number;
  /** How full built frontage is with buildings, 0..1. */
  buildingDensity: number;
  /** Main street width in meters (boulevards/avenues render wider, lanes narrower). */
  streetWidth: number;
  /** Share of avenues upgraded to median-divided boulevards, 0..1. */
  boulevards: number;
  /** Branch lanes render as gravel instead of asphalt (rural roads, alleys). */
  gravelLanes: boolean;
  /** Zone banding: radial core-out, inverted (wealth at the rim), or spatially uniform mixing. */
  profile: CityZoneProfile;
  /** Fraction of the district radius covered by the core band. */
  coreExtent: number;
  /** Fraction of the district radius where the mid band ends and the edge begins. */
  midExtent: number;
  /** Weighted building-class mix of the core band. */
  coreMix: WeightedParamEntry[];
  /** Weighted building-class mix of the middle band. */
  midMix: WeightedParamEntry[];
  /** Weighted building-class mix of the edge band. */
  edgeMix: WeightedParamEntry[];
  /** Global lot footprint multiplier — estates want 1.5+, dense infill wants <1. */
  lotScale: number;
  /** Minimum building floors (district clamp over the class ranges). */
  floorsMin: number;
  /** Maximum building floors (district clamp over the class ranges). */
  floorsMax: number;
  /** Height of one floor in meters. */
  floorHeight: number;
  /** Street-tree planting density, 0..1. */
  treeDensity: number;
  /** Weighted species mix for street/park trees. */
  treeMix: WeightedParamEntry[];
  /** Street-light density along non-lane streets, 0..1. */
  lightDensity: number;
  /** Ring estate lots (mansions) with perimeter hedges and a gated gap. */
  hedges: boolean;
  /** Connect houses/estates/farms to their street with driveways. */
  driveways: boolean;
  /** Give commercial lots (shops, slabs) a parking pad behind the building. */
  parking: boolean;
  /** Unbuilt non-core blocks become crop-row farm fields instead of parks. */
  fields: boolean;
  /** Steepest ground (rise over run) a lot will build on; steeper slopes stay open cliff/canyon. */
  maxSlope: number;
  /** Lots below this ground height are skipped — keeps buildings out of rivers/lakes/canyons floors. */
  minElevation: number;
  /** Streets crossing ground below `minElevation` span it on a bridge deck instead of clipping. */
  bridges: boolean;
  /** Bridge silhouette: arched deck, overhead truss, or a plain beam span. */
  bridgeStyle: "arch" | "truss" | "beam";
  /** Render sidewalks flanking asphalt streets. */
  sidewalks: boolean;
  /** Building style palette id (see {@link BUILDING_STYLE_PALETTES}). */
  style: BuildingStyle;
  /** Seed string; same seed reproduces the same city. Empty falls back to the volume id. */
  seed: string;
}

/** City defaults: a zoned mixed metropolis — towers downtown, slabs mid-ring, houses at the edge. */
export const CITY_DEFAULTS: CityRules = {
  gridness: 0.85,
  curviness: 0.15,
  branching: 0.4,
  blockSize: 48,
  blockAspect: 1,
  openSpace: 0.12,
  buildingDensity: 0.8,
  streetWidth: 7,
  boulevards: 0.35,
  gravelLanes: false,
  profile: "core-out",
  coreExtent: 0.35,
  midExtent: 0.7,
  coreMix: [
    { item: "tower", weight: 3 },
    { item: "slab", weight: 1 },
    { item: "shop", weight: 1 },
  ],
  midMix: [
    { item: "slab", weight: 2 },
    { item: "rowhouse", weight: 2 },
    { item: "shop", weight: 1 },
  ],
  edgeMix: [
    { item: "house", weight: 3 },
    { item: "rowhouse", weight: 1 },
  ],
  lotScale: 1,
  floorsMin: 1,
  floorsMax: 30,
  floorHeight: 3,
  treeDensity: 0.5,
  treeMix: [
    { item: "broadleaf", weight: 3 },
    { item: "conifer", weight: 1 },
  ],
  lightDensity: 0.5,
  hedges: true,
  driveways: true,
  parking: true,
  fields: false,
  maxSlope: 0.5,
  minElevation: -2,
  bridges: true,
  bridgeStyle: "arch",
  sidewalks: true,
  style: DEFAULT_BUILDING_STYLE,
  seed: "",
};

/** The city parameter schema — drives the inspector sliders and `meta` parse via the studio seam. */
export const CITY_SCHEMA: ParamSchema = {
  groups: [
    { id: "layout", label: "Layout" },
    { id: "zoning", label: "Zoning" },
    { id: "buildings", label: "Buildings" },
    { id: "greenery", label: "Greenery & furniture" },
  ],
  fields: [
    { type: "range", key: "gridness", label: "grid-ness", group: "layout", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.gridness },
    { type: "range", key: "curviness", label: "curviness", group: "layout", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.curviness },
    { type: "range", key: "branching", label: "branching", group: "layout", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.branching },
    { type: "range", key: "blockSize", label: "block size", group: "layout", min: 20, max: 140, step: 1, default: CITY_DEFAULTS.blockSize, unit: "m" },
    { type: "range", key: "blockAspect", label: "block aspect", group: "layout", min: 1, max: 3, step: 0.05, default: CITY_DEFAULTS.blockAspect },
    { type: "range", key: "openSpace", label: "open space", group: "layout", min: 0, max: 0.9, step: 0.01, default: CITY_DEFAULTS.openSpace },
    { type: "range", key: "streetWidth", label: "street width", group: "layout", min: 3, max: 16, step: 0.5, default: CITY_DEFAULTS.streetWidth, unit: "m" },
    { type: "range", key: "boulevards", label: "boulevards", group: "layout", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.boulevards },
    { type: "bool", key: "gravelLanes", label: "gravel lanes", group: "layout", default: CITY_DEFAULTS.gravelLanes },
    { type: "bool", key: "bridges", label: "bridges over water", group: "layout", default: CITY_DEFAULTS.bridges },
    {
      type: "select",
      key: "bridgeStyle",
      label: "bridge style",
      group: "layout",
      default: CITY_DEFAULTS.bridgeStyle,
      options: [{ value: "arch" }, { value: "truss" }, { value: "beam" }],
    },
    { type: "bool", key: "sidewalks", label: "sidewalks", group: "layout", default: CITY_DEFAULTS.sidewalks },
    { type: "action", key: "layoutRandomize", label: "randomize layout", group: "layout", action: "randomize" },
    {
      type: "select",
      key: "profile",
      label: "zone profile",
      group: "zoning",
      default: CITY_DEFAULTS.profile,
      options: [{ value: "core-out" }, { value: "inverted" }, { value: "uniform" }],
    },
    { type: "range", key: "coreExtent", label: "core extent", group: "zoning", min: 0.05, max: 0.9, step: 0.01, default: CITY_DEFAULTS.coreExtent },
    { type: "range", key: "midExtent", label: "mid extent", group: "zoning", min: 0.1, max: 0.95, step: 0.01, default: CITY_DEFAULTS.midExtent },
    { type: "weightedList", key: "coreMix", label: "core mix", group: "zoning", itemLabel: "class", default: CITY_DEFAULTS.coreMix },
    { type: "weightedList", key: "midMix", label: "mid mix", group: "zoning", itemLabel: "class", default: CITY_DEFAULTS.midMix },
    { type: "weightedList", key: "edgeMix", label: "edge mix", group: "zoning", itemLabel: "class", default: CITY_DEFAULTS.edgeMix },
    { type: "range", key: "lotScale", label: "lot scale", group: "zoning", min: 0.5, max: 2.5, step: 0.05, default: CITY_DEFAULTS.lotScale },
    { type: "range", key: "buildingDensity", label: "density", group: "buildings", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.buildingDensity },
    { type: "range", key: "floorsMin", label: "floors min", group: "buildings", min: 1, max: 60, step: 1, default: CITY_DEFAULTS.floorsMin },
    { type: "range", key: "floorsMax", label: "floors max", group: "buildings", min: 1, max: 60, step: 1, default: CITY_DEFAULTS.floorsMax },
    { type: "range", key: "floorHeight", label: "floor height", group: "buildings", min: 2, max: 5, step: 0.1, default: CITY_DEFAULTS.floorHeight, unit: "m" },
    { type: "range", key: "maxSlope", label: "max slope", group: "buildings", min: 0.05, max: 2, step: 0.05, default: CITY_DEFAULTS.maxSlope },
    { type: "number", key: "minElevation", label: "build above y", group: "buildings", step: 0.5, default: CITY_DEFAULTS.minElevation },
    {
      type: "select",
      key: "style",
      label: "style",
      group: "buildings",
      default: CITY_DEFAULTS.style,
      options: Object.keys(BUILDING_STYLE_PALETTES).map((style) => ({ value: style })),
    },
    { type: "range", key: "treeDensity", label: "tree density", group: "greenery", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.treeDensity },
    { type: "weightedList", key: "treeMix", label: "tree mix", group: "greenery", itemLabel: "species", default: CITY_DEFAULTS.treeMix },
    { type: "range", key: "lightDensity", label: "street lights", group: "greenery", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.lightDensity },
    { type: "bool", key: "hedges", label: "estate hedges", group: "greenery", default: CITY_DEFAULTS.hedges },
    { type: "bool", key: "driveways", label: "driveways", group: "greenery", default: CITY_DEFAULTS.driveways },
    { type: "bool", key: "parking", label: "parking lots", group: "greenery", default: CITY_DEFAULTS.parking },
    { type: "bool", key: "fields", label: "farm fields", group: "greenery", default: CITY_DEFAULTS.fields },
    { type: "seed", key: "seed", label: "seed", default: CITY_DEFAULTS.seed },
  ],
  presets: [
    {
      id: "manhattan",
      label: "Manhattan",
      values: {
        gridness: 1,
        curviness: 0,
        branching: 0.05,
        blockSize: 32,
        blockAspect: 2.4,
        openSpace: 0.05,
        buildingDensity: 0.95,
        streetWidth: 9,
        boulevards: 0.5,
        gravelLanes: false,
        profile: "core-out",
        coreExtent: 0.6,
        midExtent: 0.88,
        coreMix: [
          { item: "tower", weight: 5 },
          { item: "slab", weight: 1 },
        ],
        midMix: [
          { item: "tower", weight: 2 },
          { item: "slab", weight: 2 },
        ],
        edgeMix: [
          { item: "slab", weight: 3 },
          { item: "rowhouse", weight: 2 },
        ],
        lotScale: 1,
        floorsMin: 5,
        floorsMax: 55,
        treeDensity: 0.3,
        treeMix: [{ item: "broadleaf", weight: 1 }],
        lightDensity: 0.8,
        hedges: false,
        driveways: false,
        parking: false,
        fields: false,
        sidewalks: true,
        style: "capital",
      },
    },
    {
      id: "losangeles",
      label: "Los Angeles",
      values: {
        gridness: 0.7,
        curviness: 0.25,
        branching: 0.5,
        blockSize: 62,
        blockAspect: 1.2,
        openSpace: 0.08,
        buildingDensity: 0.8,
        streetWidth: 8,
        boulevards: 0.45,
        gravelLanes: false,
        profile: "core-out",
        coreExtent: 0.25,
        midExtent: 0.55,
        coreMix: [
          { item: "tower", weight: 2 },
          { item: "slab", weight: 2 },
          { item: "shop", weight: 2 },
        ],
        midMix: [
          { item: "shop", weight: 2 },
          { item: "house", weight: 3 },
          { item: "slab", weight: 1 },
        ],
        edgeMix: [
          { item: "house", weight: 5 },
          { item: "shop", weight: 1 },
        ],
        lotScale: 1.1,
        floorsMin: 1,
        floorsMax: 18,
        treeDensity: 0.55,
        treeMix: [
          { item: "palm", weight: 4 },
          { item: "broadleaf", weight: 1 },
          { item: "cypress", weight: 1 },
        ],
        lightDensity: 0.6,
        hedges: false,
        driveways: true,
        parking: true,
        fields: false,
        sidewalks: true,
        style: "coastal",
      },
    },
    {
      id: "beverlyhills",
      label: "Beverly Hills",
      values: {
        gridness: 0.2,
        curviness: 0.8,
        branching: 0.6,
        blockSize: 90,
        blockAspect: 1,
        openSpace: 0.07,
        buildingDensity: 0.75,
        streetWidth: 6.5,
        boulevards: 0,
        gravelLanes: false,
        profile: "uniform",
        coreExtent: 0.35,
        midExtent: 0.7,
        coreMix: [
          { item: "mansion", weight: 3 },
          { item: "house", weight: 1 },
        ],
        midMix: [
          { item: "mansion", weight: 3 },
          { item: "house", weight: 1 },
        ],
        edgeMix: [
          { item: "mansion", weight: 2 },
          { item: "house", weight: 2 },
        ],
        lotScale: 1.5,
        floorsMin: 1,
        floorsMax: 3,
        treeDensity: 0.9,
        treeMix: [
          { item: "palm", weight: 3 },
          { item: "cypress", weight: 2 },
          { item: "broadleaf", weight: 2 },
        ],
        lightDensity: 0.35,
        hedges: true,
        driveways: true,
        parking: false,
        fields: false,
        sidewalks: true,
        style: "coastal",
      },
    },
    {
      id: "ruralohio",
      label: "Rural Ohio",
      values: {
        gridness: 1,
        curviness: 0.06,
        branching: 0.3,
        blockSize: 120,
        blockAspect: 1,
        openSpace: 0.55,
        buildingDensity: 0.4,
        streetWidth: 5.5,
        boulevards: 0,
        gravelLanes: true,
        profile: "core-out",
        coreExtent: 0.22,
        midExtent: 0.55,
        coreMix: [
          { item: "shop", weight: 2 },
          { item: "house", weight: 2 },
          { item: "rowhouse", weight: 1 },
        ],
        midMix: [
          { item: "farmhouse", weight: 2 },
          { item: "house", weight: 1 },
          { item: "barn", weight: 1 },
        ],
        edgeMix: [
          { item: "farmhouse", weight: 2 },
          { item: "barn", weight: 2 },
          { item: "silo", weight: 1 },
        ],
        lotScale: 1.4,
        floorsMin: 1,
        floorsMax: 2,
        treeDensity: 0.35,
        treeMix: [
          { item: "broadleaf", weight: 3 },
          { item: "conifer", weight: 2 },
        ],
        lightDensity: 0.1,
        hedges: false,
        driveways: true,
        parking: false,
        fields: true,
        sidewalks: false,
        style: "village",
      },
    },
    {
      id: "metropolis",
      label: "Zoned metropolis",
      values: {
        gridness: 0.85,
        curviness: 0.15,
        branching: 0.4,
        blockSize: 48,
        blockAspect: 1.3,
        openSpace: 0.12,
        buildingDensity: 0.85,
        streetWidth: 7.5,
        boulevards: 0.4,
        profile: "core-out",
        coreExtent: 0.45,
        midExtent: 0.75,
        floorsMin: 1,
        floorsMax: 34,
        treeDensity: 0.55,
        lightDensity: 0.6,
        style: "generic",
      },
    },
  ],
};

/** Zone-override schema for `cityzone` volumes: pin a band and optionally a bespoke class mix. */
export const CITY_ZONE_SCHEMA: ParamSchema = {
  fields: [
    {
      type: "select",
      key: "band",
      label: "zone band",
      default: "core",
      options: [{ value: "core" }, { value: "mid" }, { value: "edge" }],
    },
    { type: "weightedList", key: "mix", label: "class mix", itemLabel: "class", default: [] },
  ],
};

/** Parse a volume's `meta` into fully-defaulted city rules. @internal */
export function readCityRules(meta: Record<string, unknown> | undefined): CityRules {
  const params = parseParams(CITY_SCHEMA, meta);
  const floorsMin = params["floorsMin"] as number;
  const floorsMax = params["floorsMax"] as number;
  return {
    gridness: params["gridness"] as number,
    curviness: params["curviness"] as number,
    branching: params["branching"] as number,
    blockSize: params["blockSize"] as number,
    blockAspect: params["blockAspect"] as number,
    openSpace: params["openSpace"] as number,
    buildingDensity: params["buildingDensity"] as number,
    streetWidth: params["streetWidth"] as number,
    boulevards: params["boulevards"] as number,
    gravelLanes: params["gravelLanes"] as boolean,
    profile: params["profile"] as CityZoneProfile,
    coreExtent: params["coreExtent"] as number,
    midExtent: params["midExtent"] as number,
    coreMix: params["coreMix"] as WeightedParamEntry[],
    midMix: params["midMix"] as WeightedParamEntry[],
    edgeMix: params["edgeMix"] as WeightedParamEntry[],
    lotScale: params["lotScale"] as number,
    floorsMin: Math.min(floorsMin, floorsMax),
    floorsMax: Math.max(floorsMin, floorsMax),
    floorHeight: params["floorHeight"] as number,
    treeDensity: params["treeDensity"] as number,
    treeMix: params["treeMix"] as WeightedParamEntry[],
    lightDensity: params["lightDensity"] as number,
    hedges: params["hedges"] as boolean,
    driveways: params["driveways"] as boolean,
    parking: params["parking"] as boolean,
    fields: params["fields"] as boolean,
    maxSlope: params["maxSlope"] as number,
    minElevation: params["minElevation"] as number,
    bridges: params["bridges"] as boolean,
    bridgeStyle: params["bridgeStyle"] as CityRules["bridgeStyle"],
    sidewalks: params["sidewalks"] as boolean,
    style: params["style"] as BuildingStyle,
    seed: params["seed"] as string,
  };
}

/** One synthesized street: a world-space XZ polyline with width, hierarchy level, and surface. */
export interface CityStreet {
  id: string;
  points: readonly RoadPoint[];
  width: number;
  level: "boulevard" | "avenue" | "street" | "lane";
  surface: "asphalt" | "gravel";
  /** Whether sidewalk ribbons flank this street. */
  sidewalk: boolean;
  /** Cul-de-sac turning bulb at a dangling end, when the lane never reconnected. */
  bulb?: RoadPoint;
}

/** One crossing of two through streets: patch center/radius plus crosswalk arm directions. */
export interface CityIntersection {
  id: string;
  x: number;
  z: number;
  /** Patch radius covering the crossing so the two ribbons never z-fight. */
  radius: number;
  level: CityStreet["level"];
  /** Outgoing arm directions (radians) with the crossing road width, for crosswalk stripes. */
  arms: readonly { angle: number; width: number }[];
}

/** One building lot: footprint, zone band, class, seeded floors, massing pieces, street anchor. */
export interface CityLot {
  id: string;
  center: RoadPoint;
  size: readonly [number, number];
  rotationY: number;
  floors: number;
  jitter: number;
  /** Building class the zone mix picked. */
  class: CityLotClass;
  /** Zone band the lot fell in (after overrides). */
  zone: CityZoneBand;
  /** Frontage point on the street centerline the lot faces. */
  anchor: RoadPoint;
  /** Deterministic massing pieces in lot-local space (see {@link CityLotPiece}). */
  pieces: readonly CityLotPiece[];
}

/** One bridge deck spanning water: bank-to-bank polyline plus the silhouette style. */
export interface CityBridge {
  id: string;
  points: readonly RoadPoint[];
  width: number;
  style: CityRules["bridgeStyle"];
}

/** One unbuilt block: plaza (core), green (mid), meadow (edge), or crop field. */
export interface CityPark {
  id: string;
  center: RoadPoint;
  size: readonly [number, number];
  rotationY: number;
  type: "plaza" | "green" | "meadow" | "field";
  jitter: number;
  /** Crop-row polylines for `field` parks, clipped around farm lots. */
  rows?: readonly (readonly RoadPoint[])[];
}

/** One placed tree: world XZ, species, and seeded scale/color jitter. */
export interface CityTree {
  x: number;
  z: number;
  species: CityTreeSpecies;
  scale: number;
  jitter: number;
}

/** One street light: curb position plus the yaw its arm faces (over the road). */
export interface CityLight {
  x: number;
  z: number;
  /** Yaw facing the road (engine rotationY convention). */
  heading: number;
}

/** One hedge run: a thin box strip (estate perimeter). */
export interface CityHedge {
  center: RoadPoint;
  /** Length along the run and thickness across it. */
  size: readonly [number, number];
  rotationY: number;
}

/** One driveway ribbon from a street to a lot. */
export interface CityDriveway {
  points: readonly RoadPoint[];
  width: number;
  surface: "gravel" | "pavement";
}

/** One parking pad behind a commercial lot. */
export interface CityParking {
  center: RoadPoint;
  size: readonly [number, number];
  rotationY: number;
}

/** A resolved city district: world-space network, zoned lots, parks, and furniture. */
export interface ResolvedCity {
  center: readonly [number, number, number];
  size: readonly [number, number];
  rotationY: number;
  rules: CityRules;
  streets: readonly CityStreet[];
  intersections: readonly CityIntersection[];
  bridges: readonly CityBridge[];
  lots: readonly CityLot[];
  parks: readonly CityPark[];
  trees: readonly CityTree[];
  lights: readonly CityLight[];
  hedges: readonly CityHedge[];
  driveways: readonly CityDriveway[];
  parkingLots: readonly CityParking[];
}

/** Extended resolve context: sibling `cityzone` volumes that override the band/mix locally. */
export interface CityResolveContext extends SceneKindResolveContext {
  zoneOverrides?: readonly SceneKindObject[];
}

/** Bounded-work caps so a huge volume can never generate unbounded content. */
const MAX_LINES_PER_AXIS = 40;
const MAX_STREETS = 320;
const MAX_LOTS = 2200;
const MAX_INTERSECTIONS = 600;
const MAX_TREES = 3200;
const MAX_LIGHTS = 1200;
const MAX_FIELD_ROWS = 2400;
const MAX_PARKING = 380;
const TAU = Math.PI * 2;

interface LocalStreet {
  axis: "x" | "z";
  points: [number, number][];
  width: number;
  level: CityStreet["level"];
  surface: CityStreet["surface"];
  sidewalk: boolean;
  bulb?: [number, number];
}

function axisValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Smooth two-octave sideways wander along a street, deterministic per street. */
function makeWander(rng: () => number, amplitude: number, wavelength: number): (t: number) => number {
  const f1 = TAU / (wavelength * (0.75 + rng() * 0.5));
  const f2 = f1 * (2.3 + rng() * 0.8);
  const p1 = rng() * TAU;
  const p2 = rng() * TAU;
  return (t) => amplitude * (Math.sin(t * f1 + p1) * 0.65 + Math.sin(t * f2 + p2) * 0.35);
}

/** Irregularly-spaced line coordinates across `[-half, half]` — regular when gridness is 1. */
function lineCoords(rng: () => number, half: number, spacing: number, gridness: number): number[] {
  const coords: number[] = [];
  const jitter = (1 - gridness) * 0.7;
  let pos = -half + spacing * (0.5 + (rng() - 0.5) * jitter);
  while (pos < half - spacing * 0.35 && coords.length < MAX_LINES_PER_AXIS) {
    coords.push(pos);
    pos += spacing * (1 + (rng() - 0.5) * jitter);
  }
  return coords;
}

/** Nearest value in `coords` to `target`, or `fallback` when the list is empty. */
function snapToCoord(coords: readonly number[], target: number, fallback: number): number {
  let best = fallback;
  let bestDist = Infinity;
  for (const c of coords) {
    const d = Math.abs(c - target);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/**
 * Spatial hash of dense street centerline samples (with per-sample clearance radius). Serves both
 * "is this point on/near a road" lot rejection and branch-to-street connection tests without
 * quadratic polyline scans.
 */
class StreetIndex {
  private cells = new Map<string, { x: number; z: number; r: number; street: number }[]>();
  private readonly cell = 10;

  private key(x: number, z: number): string {
    return `${Math.floor(x / this.cell)}:${Math.floor(z / this.cell)}`;
  }

  addStreet(index: number, points: readonly [number, number][], width: number): void {
    const r = width / 2;
    for (let i = 0; i + 1 < points.length; i += 1) {
      const [ax, az] = points[i]!;
      const [bx, bz] = points[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / 3));
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        const key = this.key(x, z);
        const bucket = this.cells.get(key);
        const sample = { x, z, r, street: index };
        if (bucket === undefined) this.cells.set(key, [sample]);
        else bucket.push(sample);
      }
    }
  }

  /** Smallest (distance − clearance) to any street sample near the point; Infinity when clear. */
  clearance(x: number, z: number, margin: number, excludeStreet = -1): number {
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    let worst = Infinity;
    for (let i = cx - 1; i <= cx + 1; i += 1) {
      for (let j = cz - 1; j <= cz + 1; j += 1) {
        const bucket = this.cells.get(`${i}:${j}`);
        if (bucket === undefined) continue;
        for (const sample of bucket) {
          if (sample.street === excludeStreet) continue;
          const d = Math.hypot(sample.x - x, sample.z - z) - sample.r - margin;
          if (d < worst) worst = d;
        }
      }
    }
    return worst;
  }
}

/** Separating-axis test for two rotated rectangles (center, half-extents, yaw): true when a gap exists. */
function rectsSeparated(
  a: { x: number; z: number; hw: number; hd: number; angle: number },
  b: { x: number; z: number; hw: number; hd: number; angle: number },
): boolean {
  const axes: [number, number][] = [];
  for (const angle of [a.angle, b.angle]) {
    axes.push([Math.cos(angle), -Math.sin(angle)], [Math.sin(angle), Math.cos(angle)]);
  }
  const corners = (r: typeof a): [number, number][] => {
    const c = Math.cos(r.angle);
    const s = Math.sin(r.angle);
    const out: [number, number][] = [];
    for (const [dx, dz] of [
      [r.hw, r.hd],
      [r.hw, -r.hd],
      [-r.hw, r.hd],
      [-r.hw, -r.hd],
    ] as const) {
      out.push([r.x + dx * c + dz * s, r.z - dx * s + dz * c]);
    }
    return out;
  };
  const ca = corners(a);
  const cb = corners(b);
  for (const [ax, az] of axes) {
    let minA = Infinity,
      maxA = -Infinity,
      minB = Infinity,
      maxB = -Infinity;
    for (const [x, z] of ca) {
      const p = x * ax + z * az;
      if (p < minA) minA = p;
      if (p > maxA) maxA = p;
    }
    for (const [x, z] of cb) {
      const p = x * ax + z * az;
      if (p < minB) minB = p;
      if (p > maxB) maxB = p;
    }
    if (maxA < minB || maxB < minA) return true; // gap on this axis → no overlap
  }
  return false;
}

interface PlacedLot {
  x: number;
  z: number;
  hw: number;
  hd: number;
  angle: number;
}

/** Broadphase grid over placed lots so overlap tests only touch neighbors. */
class LotIndex {
  private cells = new Map<string, PlacedLot[]>();
  private readonly cell = 24;

  private key(x: number, z: number): string {
    return `${Math.floor(x / this.cell)}:${Math.floor(z / this.cell)}`;
  }

  overlapsAny(lot: PlacedLot, gap: number): boolean {
    const grown = { ...lot, hw: lot.hw + gap / 2, hd: lot.hd + gap / 2 };
    const cx = Math.floor(lot.x / this.cell);
    const cz = Math.floor(lot.z / this.cell);
    for (let i = cx - 1; i <= cx + 1; i += 1) {
      for (let j = cz - 1; j <= cz + 1; j += 1) {
        const bucket = this.cells.get(`${i}:${j}`);
        if (bucket === undefined) continue;
        for (const other of bucket) {
          if (!rectsSeparated(grown, other)) return true;
        }
      }
    }
    return false;
  }

  add(lot: PlacedLot): void {
    const key = this.key(lot.x, lot.z);
    const bucket = this.cells.get(key);
    if (bucket === undefined) this.cells.set(key, [lot]);
    else bucket.push(lot);
  }
}

const LEVEL_RANK: Record<CityStreet["level"], number> = { boulevard: 3, avenue: 2, street: 1, lane: 0 };

function buildMainStreets(
  rules: CityRules,
  streams: (stream: string) => () => number,
  hx: number,
  hz: number,
): { streets: LocalStreet[]; xs: number[]; zs: number[] } {
  const layoutRng = streams("layout");
  const levelRng = streams("levels");
  // Cross-axis rhythm: `blockAspect` stretches the x-line spacing so blocks go long and skinny —
  // the widely-spaced lines become avenues, the tight cross streets stay narrow (Manhattan).
  const xs = lineCoords(layoutRng, hx, rules.blockSize * rules.blockAspect, rules.gridness);
  const zs = lineCoords(layoutRng, hz, rules.blockSize, rules.gridness);
  const streets: LocalStreet[] = [];
  const aspected = rules.blockAspect >= 1.6;
  const build = (axis: "x" | "z", bases: number[], crossCoords: number[], runHalf: number) => {
    for (let i = 0; i < bases.length; i += 1) {
      const rng = streams(`street:${axis}:${i}`);
      const base = bases[i]!;
      // Organic nets drop some through-streets down to partial spans — snapped to cross-street
      // coordinates so the street terminates AT an intersection instead of dangling mid-block.
      let start = -runHalf;
      let end = runHalf;
      if (rng() < (1 - rules.gridness) * 0.4 && crossCoords.length >= 2) {
        const span = Math.max(rules.blockSize * 2, runHalf * (0.4 + rng() * 0.5));
        const rawStart = -runHalf + rng() * Math.max(0, runHalf * 2 - span);
        start = snapToCoord(crossCoords, rawStart, -runHalf);
        end = snapToCoord(crossCoords, rawStart + span, runHalf);
        if (end - start < rules.blockSize * 1.5) {
          start = -runHalf;
          end = runHalf;
        }
      }
      // Straightness: wander amplitude from curviness, whole-street tilt from lost gridness.
      const amplitude = rules.curviness * rules.blockSize * 0.42;
      const wander = makeWander(rng, amplitude, rules.blockSize * 3.2);
      const drift = Math.tan((1 - rules.gridness) * (rng() - 0.5) * 0.5);
      const clampHalf = axis === "x" ? hx : hz;
      const step = Math.min(Math.max(rules.blockSize / 3, 6), 18);
      const points: [number, number][] = [];
      const sample = (t: number) => {
        const offset = wander(t) + drift * t;
        const cross = Math.max(-clampHalf + 1, Math.min(clampHalf - 1, base + offset));
        points.push(axis === "x" ? [cross, t] : [t, cross]);
      };
      for (let t = start; t < end; t += step) sample(t);
      sample(end);
      // Hierarchy: on an aspected grid every widely-spaced line is an avenue and every 8th cross
      // street is a crosstown avenue; on square grids every 4th line of a big-enough net. A share
      // of avenues (`boulevards`) upgrades to a median-divided boulevard.
      let level: CityStreet["level"] = "street";
      if (aspected) level = axis === "x" ? "avenue" : i % 8 === 4 ? "avenue" : "street";
      else if (bases.length >= 5 && i % 4 === 0) level = "avenue";
      if (level === "avenue" && levelRng() < rules.boulevards) level = "boulevard";
      const width = level === "boulevard" ? rules.streetWidth * 2.2 : level === "avenue" ? rules.streetWidth * 1.5 : rules.streetWidth;
      streets.push({ axis, points, width, level, surface: "asphalt", sidewalk: rules.sidewalks });
    }
  };
  build("x", xs, zs, hz);
  build("z", zs, xs, hx);
  return { streets, xs, zs };
}

/**
 * Branch lanes grow from a main street until they CONNECT to another street (or run out of room).
 * A dangling lane that earned its length survives as a cul-de-sac with a turning bulb at the end.
 */
function buildBranches(
  rules: CityRules,
  streams: (stream: string) => () => number,
  mains: LocalStreet[],
  index: StreetIndex,
  hx: number,
  hz: number,
): LocalStreet[] {
  if (mains.length === 0) return [];
  const count = Math.min(Math.round(rules.branching * mains.length * 1.6), MAX_STREETS - mains.length);
  const branches: LocalStreet[] = [];
  for (let i = 0; i < count; i += 1) {
    const rng = streams(`branch:${i}`);
    const hostIndex = Math.floor(rng() * mains.length);
    const host = mains[hostIndex]!;
    if (host.points.length < 2) continue;
    const at = host.points[Math.floor(rng() * host.points.length)]!;
    const direction = rng() < 0.5 ? 1 : -1;
    const maxLength = rules.blockSize * (1.2 + rng() * 2);
    const wander = makeWander(rng, rules.curviness * rules.blockSize * 0.3, rules.blockSize * 2.4);
    const step = Math.min(Math.max(rules.blockSize / 4, 4), 12);
    const points: [number, number][] = [];
    let connected = false;
    for (let t = 0; t <= maxLength; t += step) {
      const along = at[host.axis === "x" ? 0 : 1] + direction * t;
      const cross = at[host.axis === "x" ? 1 : 0] + wander(t);
      const point: [number, number] = host.axis === "x" ? [along, cross] : [cross, along];
      if (Math.abs(point[0]) > hx - 1 || Math.abs(point[1]) > hz - 1) break;
      points.push(point);
      // Past the leaving-home stretch, stop the moment we touch another street — a T junction.
      if (t > rules.blockSize * 0.5 && index.clearance(point[0], point[1], 0, hostIndex) < rules.streetWidth * 0.5) {
        connected = true;
        break;
      }
    }
    // A lane that never reached anything and is shorter than half a block is a driveway — drop it.
    if (points.length < 2 || (!connected && points.length * step < rules.blockSize * 0.6)) continue;
    const lane: LocalStreet = {
      axis: host.axis === "x" ? "z" : "x",
      points,
      width: rules.streetWidth * 0.65,
      level: "lane",
      surface: rules.gravelLanes ? "gravel" : "asphalt",
      sidewalk: rules.sidewalks && !rules.gravelLanes,
    };
    if (!connected) lane.bulb = points[points.length - 1]!;
    branches.push(lane);
  }
  return branches;
}

/**
 * Cross intersections between through streets of opposite axes, found via a shared-cell spatial
 * hash instead of quadratic polyline sweeps. Each crossing carries a patch radius and the four
 * outgoing arm directions for crosswalk stripes.
 */
function findIntersections(
  streets: LocalStreet[],
): { x: number; z: number; radius: number; level: CityStreet["level"]; arms: { angle: number; width: number }[] }[] {
  interface Sample {
    x: number;
    z: number;
    street: number;
    tangent: readonly [number, number];
  }
  const cell = 6;
  const cells = new Map<string, Sample[]>();
  for (let s = 0; s < streets.length; s += 1) {
    const street = streets[s]!;
    if (street.level === "lane") continue;
    for (let i = 0; i + 1 < street.points.length; i += 1) {
      const [ax, az] = street.points[i]!;
      const [bx, bz] = street.points[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const tangent: readonly [number, number] = [(bx - ax) / len, (bz - az) / len];
      const steps = Math.max(1, Math.ceil(len / 2.5));
      for (let k = 0; k <= steps; k += 1) {
        const t = k / steps;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        const key = `${Math.floor(x / cell)}:${Math.floor(z / cell)}`;
        const bucket = cells.get(key);
        const sample: Sample = { x, z, street: s, tangent };
        if (bucket === undefined) cells.set(key, [sample]);
        else bucket.push(sample);
      }
    }
  }
  // Track the closest sample pair per street pair; a pair whose min distance is under the summed
  // half-widths is a real crossing.
  const best = new Map<string, { d: number; a: Sample; b: Sample }>();
  for (const bucket of cells.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const a = bucket[i]!;
        const b = bucket[j]!;
        if (a.street === b.street) continue;
        if (streets[a.street]!.axis === streets[b.street]!.axis) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        const key = a.street < b.street ? `${a.street}:${b.street}` : `${b.street}:${a.street}`;
        const prev = best.get(key);
        if (prev === undefined || d < prev.d) best.set(key, { d, a, b });
      }
    }
  }
  const out: { x: number; z: number; radius: number; level: CityStreet["level"]; arms: { angle: number; width: number }[] }[] = [];
  const taken = new Map<string, true>();
  for (const { d, a, b } of best.values()) {
    const sa = streets[a.street]!;
    const sb = streets[b.street]!;
    if (d > (sa.width + sb.width) / 2) continue;
    const x = (a.x + b.x) / 2;
    const z = (a.z + b.z) / 2;
    const dedupe = `${Math.round(x / 6)}:${Math.round(z / 6)}`;
    if (taken.has(dedupe)) continue;
    taken.set(dedupe, true);
    const radius = Math.max(sa.width, sb.width) * 0.72 + 0.6;
    const level = LEVEL_RANK[sa.level] >= LEVEL_RANK[sb.level] ? sa.level : sb.level;
    const arms = [
      { angle: Math.atan2(a.tangent[0], a.tangent[1]), width: sa.width },
      { angle: Math.atan2(-a.tangent[0], -a.tangent[1]), width: sa.width },
      { angle: Math.atan2(b.tangent[0], b.tangent[1]), width: sb.width },
      { angle: Math.atan2(-b.tangent[0], -b.tangent[1]), width: sb.width },
    ];
    out.push({ x, z, radius, level, arms });
    if (out.length >= MAX_INTERSECTIONS) break;
  }
  return out;
}

interface LocalPark {
  id: string;
  center: [number, number];
  size: [number, number];
  type: CityPark["type"];
  jitter: number;
  rows?: [number, number][][];
}

function buildParks(
  rules: CityRules,
  streams: (stream: string) => () => number,
  xs: number[],
  zs: number[],
  hx: number,
  hz: number,
): LocalPark[] {
  const rng = streams("parks");
  const parks: LocalPark[] = [];
  for (let i = 0; i + 1 < xs.length; i += 1) {
    for (let j = 0; j + 1 < zs.length; j += 1) {
      const keep = rng() < rules.openSpace;
      const bandRoll = rng();
      if (!keep) continue;
      const width = xs[i + 1]! - xs[i]! - rules.streetWidth - 4;
      const depth = zs[j + 1]! - zs[j]! - rules.streetWidth - 4;
      if (width < 6 || depth < 6) continue;
      const cx = (xs[i]! + xs[i + 1]!) / 2;
      const cz = (zs[j]! + zs[j + 1]!) / 2;
      const band = zoneBand(zoneMetric(cx, cz, hx, hz), rules.profile, rules.coreExtent, rules.midExtent, bandRoll);
      const type: CityPark["type"] =
        rules.fields && band !== "core" ? "field" : band === "core" ? "plaza" : band === "mid" ? "green" : "meadow";
      parks.push({ id: `park:${i}:${j}`, center: [cx, cz], size: [width, depth], type, jitter: rng() });
    }
  }
  return parks;
}

function insideAnyPark(parks: readonly LocalPark[], x: number, z: number, margin: number): boolean {
  for (const park of parks) {
    // Farm fields never displace lots — the farmhouse standing in its own field IS the look.
    if (park.type === "field") continue;
    if (Math.abs(x - park.center[0]) < park.size[0] / 2 + margin && Math.abs(z - park.center[1]) < park.size[1] / 2 + margin) return true;
  }
  return false;
}

interface LotBuildResult {
  lots: {
    id: string;
    center: [number, number];
    size: [number, number];
    rotationY: number;
    floors: number;
    jitter: number;
    cls: CityLotClass;
    zone: CityZoneBand;
    anchor: [number, number];
    pieces: readonly CityLotPiece[];
  }[];
  placed: LotIndex;
  hedges: { center: [number, number]; size: [number, number]; rotationY: number }[];
  driveways: { points: [number, number][]; width: number; surface: CityDriveway["surface"] }[];
}

function buildLots(
  rules: CityRules,
  streams: (stream: string) => () => number,
  streets: LocalStreet[],
  index: StreetIndex,
  parks: LocalPark[],
  hx: number,
  hz: number,
  slopeAt: ((x: number, z: number) => number) | null,
  heightAt: ((x: number, z: number) => number) | null,
  overrideAt: ((x: number, z: number) => { band: CityZoneBand; mix: WeightedParamEntry[] | null } | null) | null,
): LotBuildResult {
  const result: LotBuildResult = { lots: [], placed: new LotIndex(), hedges: [], driveways: [] };
  const bandMix: Record<CityZoneBand, WeightedParamEntry[]> = { core: rules.coreMix, mid: rules.midMix, edge: rules.edgeMix };
  const blockMin = Math.min(rules.blockSize, rules.blockSize * rules.blockAspect);
  for (let s = 0; s < streets.length; s += 1) {
    const street = streets[s]!;
    const rng = streams(`lots:${s}`);
    const sidewalkPad = street.sidewalk ? 1.9 : 0.7;
    let travelled = 0;
    let nextLot = 6 + rng() * 8;
    for (let i = 0; i + 1 < street.points.length; i += 1) {
      const [ax, az] = street.points[i]!;
      const [bx, bz] = street.points[i + 1]!;
      const segLen = Math.hypot(bx - ax, bz - az);
      while (travelled + segLen >= nextLot) {
        const t = (nextLot - travelled) / segLen;
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        const tangent = Math.atan2(bx - ax, bz - az);
        let advance = 7;
        for (const side of [1, -1] as const) {
          // Every side rolls its own band/class/dims so the two frontages differ.
          const densityRoll = rng();
          const bandRoll = rng();
          const classRoll = rng();
          const lotRng = streams(`lot:${s}:${Math.round(nextLot * 10)}:${side}`);
          const nx = Math.cos(tangent);
          const nz = -Math.sin(tangent);
          const probeX = px + nx * (street.width / 2 + 8) * side;
          const probeZ = pz + nz * (street.width / 2 + 8) * side;
          const override = overrideAt === null ? null : overrideAt(probeX, probeZ);
          const band =
            override !== null ? override.band : zoneBand(zoneMetric(probeX, probeZ, hx, hz), rules.profile, rules.coreExtent, rules.midExtent, bandRoll);
          const mix = override !== null && override.mix !== null && override.mix.length > 0 ? override.mix : bandMix[band];
          const cls = pickClass(mix, classRoll);
          const placement = rollClassPlacement(cls, lotRng, rules.lotScale, rules.floorsMin, rules.floorsMax);
          advance = Math.max(advance, placement.width + placement.gap);
          if (densityRoll > rules.buildingDensity) continue;
          const rows = placement.backRow && blockMin > placement.depth * 2.2 + street.width + placement.setback ? 2 : 1;
          for (let row = 0; row < rows; row += 1) {
            if (row > 0 && rng() > rules.buildingDensity * 0.7) continue;
            const slopeRoll = rng();
            const offset = street.width / 2 + sidewalkPad + placement.setback + placement.depth / 2 + row * (placement.depth + 4);
            const cx = px + nx * offset * side;
            const cz = pz + nz * offset * side;
            if (Math.abs(cx) > hx - 3 || Math.abs(cz) > hz - 3) continue;
            if (insideAnyPark(parks, cx, cz, placement.depth * 0.25)) continue;
            // Never build on a road: the lot's center and corners all keep clearance to ALL street
            // centerlines — this stops houses landing on a curvy cross-street without the huge
            // half-diagonal dead zone a center-only test needs. Lots face their street: local +z
            // points from the lot center back to the frontage anchor.
            const rotationY = tangent - (side * Math.PI) / 2;
            const ca = Math.cos(rotationY);
            const sa = Math.sin(rotationY);
            const hw = placement.width / 2;
            const hd = placement.depth / 2;
            let onRoad = index.clearance(cx, cz, 1) < 0;
            if (!onRoad) {
              for (const [dx, dz] of [
                [hw, hd],
                [hw, -hd],
                [-hw, hd],
                [-hw, -hd],
              ] as const) {
                if (index.clearance(cx + dx * ca + dz * sa, cz - dx * sa + dz * ca, 0.5) < 0) {
                  onRoad = true;
                  break;
                }
              }
            }
            if (onRoad) continue;
            // Cliff rule: reject lots on ground steeper than maxSlope (with a little seeded fuzz so
            // the cutoff line isn't a hard contour), leaving steep faces open.
            if (slopeAt !== null && slopeAt(cx, cz) > rules.maxSlope * (0.85 + slopeRoll * 0.3)) continue;
            // Water/canyon-floor rule: never build below the district's minimum elevation.
            if (heightAt !== null && heightAt(cx, cz) < rules.minElevation) continue;
            const candidate: PlacedLot = { x: cx, z: cz, hw, hd, angle: rotationY };
            // Exact rotated-rect collision against neighbors — buildings know about each other.
            if (result.placed.overlapsAny(candidate, 1)) continue;
            result.placed.add(candidate);
            const pieces = buildLotPieces(cls, placement.width, placement.depth, placement.floors, rules.floorHeight, lotRng);
            result.lots.push({
              id: `lot:${s}:${result.lots.length}`,
              center: [cx, cz],
              size: [placement.width, placement.depth],
              rotationY,
              floors: placement.floors,
              jitter: rng(),
              cls,
              zone: band,
              anchor: [px, pz],
              pieces,
            });
            if (row === 0 && rules.driveways && (cls === "house" || cls === "mansion" || cls === "farmhouse" || cls === "barn" || cls === "silo")) {
              const dirX = cx - px;
              const dirZ = cz - pz;
              const len = Math.hypot(dirX, dirZ) || 1;
              const ux = dirX / len;
              const uz = dirZ / len;
              const start: [number, number] = [px + ux * (street.width / 2 - 0.4), pz + uz * (street.width / 2 - 0.4)];
              const end: [number, number] = [cx - ux * (hd - 1), cz - uz * (hd - 1)];
              const surface: CityDriveway["surface"] =
                cls === "farmhouse" || cls === "barn" || cls === "silo" || rules.gravelLanes ? "gravel" : "pavement";
              result.driveways.push({ points: [start, end], width: cls === "mansion" ? 3.2 : 2.6, surface });
            }
            if (row === 0 && rules.hedges && cls === "mansion") {
              // Perimeter hedge with a gated gap centered on the driveway mouth (street face).
              const m = 2.4;
              const hhw = hw + m;
              const hhd = hd + m;
              const th = 0.7;
              const gap = 2.2;
              const local: { x: number; z: number; len: number; rot: number }[] = [
                { x: -hhw / 2 - gap / 2, z: hhd, len: hhw - gap, rot: 0 },
                { x: hhw / 2 + gap / 2, z: hhd, len: hhw - gap, rot: 0 },
                { x: 0, z: -hhd, len: hhw * 2, rot: 0 },
                { x: hhw, z: 0, len: hhd * 2, rot: Math.PI / 2 },
                { x: -hhw, z: 0, len: hhd * 2, rot: Math.PI / 2 },
              ];
              for (const run of local) {
                const wx = cx + run.x * ca + run.z * sa;
                const wz = cz - run.x * sa + run.z * ca;
                result.hedges.push({ center: [wx, wz], size: [run.len, th], rotationY: rotationY + run.rot });
              }
            }
            if (result.lots.length >= MAX_LOTS) return result;
          }
        }
        nextLot += advance;
      }
      travelled += segLen;
    }
  }
  return result;
}

/** Crop rows for field parks, clipped around any placed lot so rows never run through a farmhouse. */
function buildFieldRows(parks: LocalPark[], placed: LotIndex, streams: (stream: string) => () => number): void {
  let total = 0;
  const rng = streams("fields");
  for (const park of parks) {
    if (park.type !== "field") continue;
    const rows: [number, number][][] = [];
    const alongX = park.size[0] >= park.size[1];
    const runLength = alongX ? park.size[0] : park.size[1];
    const across = alongX ? park.size[1] : park.size[0];
    const spacing = 3.2 + rng() * 0.8;
    const count = Math.floor((across - 3) / spacing);
    for (let r = 0; r < count && total < MAX_FIELD_ROWS; r += 1) {
      const offset = -across / 2 + 2 + r * spacing;
      let current: [number, number][] = [];
      const steps = Math.max(2, Math.ceil(runLength / 4));
      for (let sIdx = 0; sIdx <= steps; sIdx += 1) {
        const along = -runLength / 2 + 2 + ((runLength - 4) * sIdx) / steps;
        const x = park.center[0] + (alongX ? along : offset);
        const z = park.center[1] + (alongX ? offset : along);
        const blocked = placed.overlapsAny({ x, z, hw: 1.2, hd: 1.2, angle: 0 }, 1.5);
        if (blocked) {
          if (current.length >= 2) rows.push(current);
          current = [];
        } else {
          current.push([x, z]);
        }
      }
      if (current.length >= 2) rows.push(current);
      total += 1;
    }
    if (rows.length > 0) park.rows = rows;
  }
}

/**
 * Synthesize the deterministic city plan for one `city` volume: streets → bridges → parks → zoned
 * frontage lots with massing pieces → furniture, all in the volume's local frame and then
 * rotated/translated into world space. Same volume (id, footprint, meta) over the same terrain
 * always resolves to the identical plan. When `context` provides a ground sampler, lots respect
 * the `maxSlope` cliff rule — hillside and canyon districts keep their steep faces open. When
 * `context.zoneOverrides` carries sibling `cityzone` volumes, lots inside them adopt the override
 * band/mix. Returns null without a usable footprint.
 *
 * @capability city-district resolve a `city` volume into deterministic streets, zoned lots, parks, and furniture
 */
export function resolveCityObject(object: SceneKindObject, context?: CityResolveContext): ResolvedCity | null {
  const center = object.center ?? object.position;
  if (center === undefined) return null;
  const he = object.halfExtents;
  const hx = axisValue(he?.x) ?? object.radius ?? 0;
  const hz = axisValue(he?.z) ?? object.radius ?? 0;
  const rules = readCityRules(object.meta);
  const rotationY = object.rotationY ?? 0;
  const empty: ResolvedCity = {
    center: [center.x, center.y, center.z],
    size: [hx * 2, hz * 2],
    rotationY,
    rules,
    streets: [],
    intersections: [],
    bridges: [],
    lots: [],
    parks: [],
    trees: [],
    lights: [],
    hedges: [],
    driveways: [],
    parkingLots: [],
  };
  if (hx < rules.blockSize * 0.75 || hz < rules.blockSize * 0.75) return empty;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const toWorld = (x: number, z: number): RoadPoint => [center.x + x * cos + z * sin, center.z - x * sin + z * cos];

  const sampleHeight = context?.sampleHeight;
  const heightAt =
    sampleHeight === undefined
      ? null
      : (x: number, z: number): number => {
          const [wx, wz] = toWorld(x, z);
          return sampleHeight(wx, wz);
        };
  const slopeAt =
    sampleHeight === undefined
      ? null
      : (x: number, z: number): number => {
          const [wx, wz] = toWorld(x, z);
          const d = 4;
          const dx = sampleHeight(wx + d, wz) - sampleHeight(wx - d, wz);
          const dz = sampleHeight(wx, wz + d) - sampleHeight(wx, wz - d);
          return Math.hypot(dx, dz) / (2 * d);
        };

  // Child `cityzone` volumes override the band (and optionally the class mix) for lots inside them.
  const overrides = (context?.zoneOverrides ?? []).filter((volume) => volume.kind === CITY_ZONE_KIND);
  const overrideAt =
    overrides.length === 0
      ? null
      : (x: number, z: number): { band: CityZoneBand; mix: WeightedParamEntry[] | null } | null => {
          const [wx, wz] = toWorld(x, z);
          for (const volume of overrides) {
            const vc = volume.center ?? volume.position;
            if (vc === undefined) continue;
            const vhx = axisValue(volume.halfExtents?.x) ?? volume.radius ?? 0;
            const vhz = axisValue(volume.halfExtents?.z) ?? volume.radius ?? 0;
            if (vhx <= 0 || vhz <= 0) continue;
            const yaw = volume.rotationY ?? 0;
            const dx = wx - vc.x;
            const dz = wz - vc.z;
            const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
            const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
            if (Math.abs(lx) > vhx || Math.abs(lz) > vhz) continue;
            const params = parseParams(CITY_ZONE_SCHEMA, volume.meta);
            const mix = params["mix"] as WeightedParamEntry[];
            return { band: params["band"] as CityZoneBand, mix: mix.length > 0 ? mix : null };
          }
          return null;
        };

  const streams = seededStreams(`city:${rules.seed.length > 0 ? rules.seed : object.id}`);
  const built = buildMainStreets(rules, streams, hx, hz);
  const xs = built.xs;
  const zs = built.zs;
  // Streets stop at the water's edge instead of running on under a lake/canyon river: split each
  // polyline into the runs whose ground stays above the district's minimum elevation. A short
  // underwater run bounded by land on both sides becomes a BRIDGE deck (bank point to bank point)
  // when the district allows them — lanes never bridge, and spans longer than a few blocks clip.
  const localBridges: { points: [number, number][]; width: number }[] = [];
  const maxBridgeSpan = rules.blockSize * 2.5;
  const clipToLand = (streets: LocalStreet[]): LocalStreet[] => {
    if (heightAt === null) return streets;
    const out: LocalStreet[] = [];
    for (const street of streets) {
      let run: [number, number][] = [];
      let wet: [number, number][] = [];
      const flushLand = () => {
        if (run.length >= 2) out.push({ ...street, points: run });
      };
      for (const point of street.points) {
        if (heightAt(point[0], point[1]) >= rules.minElevation) {
          if (wet.length > 0) {
            // Land after water: bridge it when short enough and there was land before.
            const bank = run.length > 0 ? run[run.length - 1]! : null;
            let span = 0;
            const deck: [number, number][] = bank === null ? [...wet] : [bank, ...wet];
            deck.push(point);
            for (let i = 1; i < deck.length; i += 1) span += Math.hypot(deck[i]![0] - deck[i - 1]![0], deck[i]![1] - deck[i - 1]![1]);
            if (rules.bridges && bank !== null && street.level !== "lane" && span <= maxBridgeSpan) {
              // Record the deck, then split the land street at the banks so the draped road ends
              // at the shore instead of sagging underwater beneath the deck.
              localBridges.push({ points: deck, width: street.width });
            }
            wet = [];
            flushLand();
            run = [point];
            continue;
          }
          run.push(point);
        } else {
          wet.push(point);
        }
      }
      flushLand();
    }
    return out;
  };
  const mains = clipToLand(built.streets);
  const index = new StreetIndex();
  mains.forEach((street, i) => index.addStreet(i, street.points, street.width));
  const branches = clipToLand(buildBranches(rules, streams, mains, index, hx, hz));
  branches.forEach((street, i) => index.addStreet(mains.length + i, street.points, street.width));
  localBridges.forEach((bridge, i) => index.addStreet(mains.length + branches.length + i, bridge.points, bridge.width));
  const local = [...mains, ...branches].slice(0, MAX_STREETS);
  const intersections = findIntersections(local);
  const parks = buildParks(rules, streams, xs, zs, hx, hz);
  const lotResult = buildLots(rules, streams, local, index, parks, hx, hz, slopeAt, heightAt, overrideAt);
  buildFieldRows(parks, lotResult.placed, streams);

  // --- Street furniture: bounded, seeded, and hooked to the network. ---
  const trees: { x: number; z: number; species: CityTreeSpecies; scale: number; jitter: number }[] = [];
  const lights: { x: number; z: number; heading: number }[] = [];
  const nearIntersection = (x: number, z: number, pad: number): boolean => {
    for (const cross of intersections) {
      if (Math.hypot(cross.x - x, cross.z - z) < cross.radius + pad) return true;
    }
    return false;
  };
  const insideBounds = (x: number, z: number): boolean => Math.abs(x) < hx - 1.5 && Math.abs(z) < hz - 1.5;
  const asDescriptor = (street: LocalStreet): RoadEnvironmentDescriptor => ({
    kind: "road",
    path: street.points,
    width: street.width,
    color: "",
    markings: false,
    markingColor: "",
    elevation: 0,
    sidewalk: street.sidewalk ? { width: 1.9, color: "" } : false,
  });
  if (rules.lightDensity > 0) {
    const lightRng = streams("lights");
    // Density drives pole spacing directly (0.1 → a pole every ~120 m; 1 → every 18 m), and at low
    // densities only the avenue-and-up hierarchy is lit — a farm road keeps its dark sky.
    const spacing = Math.min(120, Math.max(14, 18 / rules.lightDensity));
    for (const street of local) {
      if (street.level === "lane" || street.surface === "gravel") continue;
      if (rules.lightDensity < 0.3 && LEVEL_RANK[street.level] < LEVEL_RANK.avenue) continue;
      const spots = furnitureSpots(asDescriptor(street), { spacing, outset: street.sidewalk ? 0.6 : 0.2 });
      for (const spot of spots) {
        if (lights.length >= MAX_LIGHTS) break;
        const [x, z] = spot.position;
        if (!insideBounds(x, z) || nearIntersection(x, z, 1.5)) continue;
        if (index.clearance(x, z, 1.0) < 0) continue;
        if (lightRng() > 0.95) continue; // occasional missing pole so rows never read stamped
        // Lamp arm faces back over the road: flip the outward-facing spot heading.
        lights.push({ x, z, heading: spot.heading + Math.PI });
      }
    }
  }
  if (rules.treeDensity > 0) {
    const treeRng = streams("trees");
    const spacing = 30 - 21 * rules.treeDensity;
    for (const street of local) {
      if (street.surface === "gravel" && rules.treeDensity < 0.6) continue;
      const spots = furnitureSpots(asDescriptor(street), { spacing, stagger: false, outset: street.sidewalk ? 2.6 : 2.0 });
      for (const spot of spots) {
        if (trees.length >= MAX_TREES) break;
        if (treeRng() > rules.treeDensity * 0.85 + 0.15) continue;
        const x = spot.position[0] + (treeRng() - 0.5) * 1.6;
        const z = spot.position[1] + (treeRng() - 0.5) * 1.6;
        if (!insideBounds(x, z) || nearIntersection(x, z, 1)) continue;
        if (index.clearance(x, z, 1.2) < 0) continue;
        if (lotResult.placed.overlapsAny({ x, z, hw: 0.5, hd: 0.5, angle: 0 }, 0.5)) continue;
        trees.push({ x, z, species: pickSpecies(rules.treeMix, treeRng()), scale: 0.85 + treeRng() * 0.5, jitter: treeRng() });
      }
    }
    // Park planting: formal corners on plazas, loose clusters on greens, sparse meadows.
    const parkRng = streams("parkTrees");
    for (const park of parks) {
      if (trees.length >= MAX_TREES) break;
      const count =
        park.type === "plaza"
          ? 4
          : park.type === "green"
            ? Math.min(10, Math.max(3, Math.floor((park.size[0] * park.size[1]) / 260)))
            : park.type === "meadow"
              ? 2 + Math.floor(parkRng() * 4)
              : 0;
      for (let i = 0; i < count && trees.length < MAX_TREES; i += 1) {
        let x: number;
        let z: number;
        if (park.type === "plaza") {
          const sx = i % 2 === 0 ? -1 : 1;
          const sz = i < 2 ? -1 : 1;
          x = park.center[0] + sx * park.size[0] * 0.36;
          z = park.center[1] + sz * park.size[1] * 0.36;
        } else {
          x = park.center[0] + (parkRng() - 0.5) * park.size[0] * 0.8;
          z = park.center[1] + (parkRng() - 0.5) * park.size[1] * 0.8;
        }
        if (!insideBounds(x, z)) continue;
        if (index.clearance(x, z, 0.4) < 0) continue;
        if (lotResult.placed.overlapsAny({ x, z, hw: 0.5, hd: 0.5, angle: 0 }, 0.5)) continue;
        trees.push({ x, z, species: pickSpecies(rules.treeMix, parkRng()), scale: 0.9 + parkRng() * 0.6, jitter: parkRng() });
      }
    }
  }
  // Parking pads behind commercial lots, collision-checked against every placed footprint.
  const parking: { center: [number, number]; size: [number, number]; rotationY: number }[] = [];
  if (rules.parking) {
    const parkingRng = streams("parking");
    const padIndex = new LotIndex();
    for (const lot of lotResult.lots) {
      if (parking.length >= MAX_PARKING) break;
      if (lot.cls !== "shop" && lot.cls !== "slab") continue;
      if (parkingRng() > 0.6) continue;
      const depth = 9 + parkingRng() * 5;
      const ca = Math.cos(lot.rotationY);
      const sa = Math.sin(lot.rotationY);
      // Behind the lot: away from the street face (-z in lot-local space).
      const off = lot.size[1] / 2 + depth / 2 + 1.2;
      const x = lot.center[0] - sa * off;
      const z = lot.center[1] - ca * off;
      const pad: PlacedLot = { x, z, hw: (lot.size[0] * 1.05) / 2, hd: depth / 2, angle: lot.rotationY };
      if (Math.abs(x) > hx - 3 || Math.abs(z) > hz - 3) continue;
      if (index.clearance(x, z, 0.5) < 0) continue;
      if (lotResult.placed.overlapsAny(pad, 0.5) || padIndex.overlapsAny(pad, 0.5)) continue;
      padIndex.add(pad);
      parking.push({ center: [x, z], size: [lot.size[0] * 1.05, depth], rotationY: lot.rotationY });
    }
  }

  return {
    center: [center.x, center.y, center.z],
    size: [hx * 2, hz * 2],
    rotationY,
    rules,
    streets: local.map((street, i) => ({
      id: `street:${i}`,
      points: street.points.map(([x, z]) => toWorld(x, z)),
      width: street.width,
      level: street.level,
      surface: street.surface,
      sidewalk: street.sidewalk,
      ...(street.bulb === undefined ? {} : { bulb: toWorld(street.bulb[0], street.bulb[1]) }),
    })),
    intersections: intersections.map((cross, i) => {
      const [x, z] = toWorld(cross.x, cross.z);
      return {
        id: `cross:${i}`,
        x,
        z,
        radius: cross.radius,
        level: cross.level,
        arms: cross.arms.map((arm) => ({ angle: arm.angle - rotationY, width: arm.width })),
      };
    }),
    bridges: localBridges.map((bridge, i) => ({
      id: `bridge:${i}`,
      points: bridge.points.map(([x, z]) => toWorld(x, z)),
      width: bridge.width,
      style: rules.bridgeStyle,
    })),
    lots: lotResult.lots.map((lot) => ({
      id: lot.id,
      center: toWorld(lot.center[0], lot.center[1]),
      size: lot.size,
      rotationY: lot.rotationY - rotationY,
      floors: lot.floors,
      jitter: lot.jitter,
      class: lot.cls,
      zone: lot.zone,
      anchor: toWorld(lot.anchor[0], lot.anchor[1]),
      pieces: lot.pieces,
    })),
    parks: parks.map((park) => ({
      id: park.id,
      center: toWorld(park.center[0], park.center[1]),
      size: park.size,
      rotationY: -rotationY,
      type: park.type,
      jitter: park.jitter,
      ...(park.rows === undefined ? {} : { rows: park.rows.map((row) => row.map(([x, z]) => toWorld(x, z))) }),
    })),
    trees: trees.map((tree) => {
      const [x, z] = toWorld(tree.x, tree.z);
      return { x, z, species: tree.species, scale: tree.scale, jitter: tree.jitter };
    }),
    lights: lights.map((light) => {
      const [x, z] = toWorld(light.x, light.z);
      return { x, z, heading: light.heading - rotationY };
    }),
    hedges: lotResult.hedges.map((hedge) => {
      const [x, z] = toWorld(hedge.center[0], hedge.center[1]);
      return { center: [x, z] as RoadPoint, size: hedge.size, rotationY: hedge.rotationY - rotationY };
    }),
    driveways: lotResult.driveways.map((drive) => ({
      points: drive.points.map(([x, z]) => toWorld(x, z)),
      width: drive.width,
      surface: drive.surface,
    })),
    parkingLots: parking.map((pad) => {
      const [x, z] = toWorld(pad.center[0], pad.center[1]);
      return { center: [x, z] as RoadPoint, size: pad.size, rotationY: pad.rotationY - rotationY };
    }),
  };
}

/** Registers the `city` + `cityzone` scene kinds (schema + resolver). Called by {@link registerBuiltinSceneKinds}. @internal */
export function registerCityKind(): void {
  registerSceneKind<ResolvedCity | null>({
    kind: CITY_KIND,
    target: "volume",
    label: "City district",
    addCategory: "Studios",
    accent: "#8fa8c9",
    schema: CITY_SCHEMA,
    resolve: (object, _params, context) => resolveCityObject(object, context),
    note: (object) => {
      const resolved = resolveCityObject(object);
      if (resolved === null) return "Give the volume a box footprint.";
      if (resolved.streets.length === 0) return `Footprint too small — needs at least ${Math.ceil(resolved.rules.blockSize * 1.5)} m across.`;
      return `${resolved.streets.length} streets · ${resolved.lots.length} buildings · ${resolved.parks.length} parks · ${resolved.trees.length} trees`;
    },
  });
  registerSceneKind({
    kind: CITY_ZONE_KIND,
    target: "volume",
    label: "City zone override",
    addCategory: "Studios",
    accent: "#c9b88f",
    schema: CITY_ZONE_SCHEMA,
    note: (object) => {
      const params = parseParams(CITY_ZONE_SCHEMA, object.meta);
      const mix = params["mix"] as WeightedParamEntry[];
      return `Pins the "${params["band"] as string}" band${mix.length > 0 ? " with a custom mix" : ""} inside any city district it overlaps.`;
    },
  });
}
