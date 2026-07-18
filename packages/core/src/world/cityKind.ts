/**
 * `city` studio: a procedural district authored as a box volume — drop a volume and sliders tune
 * the whole synthesis, from a rigid Manhattan grid (`gridness` 1, `curviness` 0) to winding
 * hillside estates, a two-road crossroads farm town, or — at the loopiness-high / branching-and-
 * connectivity-low corner — a closed RACE CIRCUIT. Streets come from the unified seed-driven
 * {@link buildPathNetwork} engine (city and track are the same generator at opposite slider
 * extremes), carry a visible hierarchy (boulevards with medians, avenues, streets, lanes —
 * optionally gravel), and connect or deliberately dead-end into cul-de-sac bulbs; water gaps become
 * styled bridge decks and ridges become tunnel bores, both path features on continuous streets so a
 * lap stays closed. The block/parcel/building FABRIC is optional (`fabric` off = bare roads or a
 * plot-free track). Generation is BLOCK-FIRST (`cityBlocks`): the street graph's planar faces become closed
 * block polygons (a curved street bounds a curved block), each inset to curb and land rings with
 * the sidewalk band between them, then classified and subdivided into polygonal frontage PARCELS
 * whose buildable polygons (after setbacks) place every building. Inside the district a ZONE
 * layer (core/mid/edge bands, invertible or spatially uniform) drives what a parcel carries: a
 * weighted class mix per band picks the building class (tower, slab, shop, rowhouse, house,
 * mansion, farmhouse, barn, silo), and each class composes deterministic massing PIECES
 * (`cityContent`) — setback tower tiers, gabled houses, gambrel barns, domed silos. Blocks left
 * unbuilt become plazas/greens/meadows by band, or crop-row farm fields; slivers and block
 * interiors classify as buffers and courtyards, never leftover rectangles. Street
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
import {
  buildPathNetwork,
  pathNetworkMode,
  type PathFeatureKind,
  type PathLevel,
  type PathNetworkRules,
  type PathStreet,
} from "./pathNetwork";
import {
  buildablePolygon,
  carveCorridors,
  conformPolygonToRing,
  cutParcel,
  extractBlocks,
  isSliverBlock,
  pointsInPolygon,
  RingWalker,
  type CityBlockKind,
} from "./cityBlocks";
import {
  fitRectInPolygon,
  rayDistanceToRing,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonMeanWidth,
  polygonsOverlap,
  insetRingUniform,
  ringBounds,
  type Vec2,
} from "./cityGeometry";

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
  /** How loopy the network is: 0 = a tree that dead-ends; 1 collapses to one closed circuit (a race
   * track). High loopiness with branching/connectivity near zero is the "race circuit" corner. */
  loopiness: number;
  /** Extra chord edges knitting neighbors together — mesh density. 1 = a dense connected grid. */
  connectivity: number;
  /** Fraction of dangling ends kept as cul-de-sacs (vs reconnected into loops), 0..1. */
  deadEnds: number;
  /** Minimum curve radius (m): caps street wander curvature and corner tightness. */
  minCurveRadius: number;
  /** Shallowest corner (degrees) a street keeps — gentler bends straighten out. */
  minTurnAngle: number;
  /** Sharpest corner (degrees) a street may take — tighter ones are beveled away. */
  maxTurnAngle: number;
  /** Lay parcels + buildings against the streets (city fabric). Off = bare roads/track, no plots. */
  fabric: boolean;
  /** Streets bore through ridges on tunnel decks instead of climbing over them. */
  tunnels: boolean;
  /** Target block size (street spacing) in meters. */
  blockSize: number;
  /** Cross-axis spacing multiplier — 2+ gives long skinny Manhattan blocks with avenue/street rhythm. */
  blockAspect: number;
  /** Fraction of blocks left unbuilt as intentional open space (parks/plazas/fields), 0..1. */
  openSpace: number;
  /** Fraction of every street's frontage that carries a building, 0..1 — the compactness dial. */
  roadsideOccupancy: number;
  /** Chance deep blocks fill their interior with a second row of buildings, 0..1. */
  blockDensity: number;
  /** Base gap from the sidewalk edge to a lot's front, in meters (class factors scale it). */
  buildingRoadSetback: number;
  /** Base side gap between neighboring lots, in meters (rowhouses nearly touch, farms spread). */
  buildingSpacing: number;
  /** How strongly development clumps: junctions grow denser, density drifts in smooth waves, and
   * same-class runs form — 0 is uniform, 1 is strongly clustered. */
  clusterStrength: number;
  /** Main street width in meters (boulevards/avenues render wider, lanes narrower). */
  streetWidth: number;
  /** Share of avenues upgraded to median-divided boulevards, 0..1. */
  boulevards: number;
  /** Branch lanes render as gravel instead of asphalt (rural roads, alleys). */
  gravelLanes: boolean;
  /** District-wide surface: `auto` keeps asphalt mains (+ gravel lanes per `gravelLanes`); `gravel` unpaves everything. */
  surface: "auto" | "gravel";
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
  /** Sidewalk band width in meters at "street" hierarchy (boulevards scale up, lanes down). */
  sidewalkWidth: number;
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
  loopiness: 0,
  connectivity: 0.88,
  deadEnds: 0.35,
  minCurveRadius: 24,
  minTurnAngle: 0,
  maxTurnAngle: 150,
  fabric: true,
  tunnels: true,
  blockSize: 48,
  blockAspect: 1,
  openSpace: 0.12,
  roadsideOccupancy: 0.88,
  blockDensity: 0.6,
  buildingRoadSetback: 2.5,
  buildingSpacing: 1.4,
  clusterStrength: 0.5,
  streetWidth: 7,
  boulevards: 0.35,
  gravelLanes: false,
  surface: "auto",
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
  sidewalkWidth: 1.9,
  style: DEFAULT_BUILDING_STYLE,
  seed: "",
};

/** The city parameter schema — drives the inspector sliders and `meta` parse via the studio seam. */
export const CITY_SCHEMA: ParamSchema = {
  groups: [
    { id: "layout", label: "Layout" },
    { id: "placement", label: "Placement" },
    { id: "zoning", label: "Zoning" },
    { id: "buildings", label: "Buildings" },
    { id: "greenery", label: "Greenery & furniture" },
  ],
  fields: [
    { type: "range", key: "gridness", label: "grid-ness", group: "layout", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.gridness },
    { type: "range", key: "curviness", label: "curviness", group: "layout", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.curviness },
    { type: "range", key: "branching", label: "branching", group: "layout", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.branching },
    { type: "range", key: "loopiness", label: "loopiness", group: "layout", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.loopiness },
    { type: "range", key: "connectivity", label: "connectivity", group: "layout", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.connectivity },
    { type: "range", key: "deadEnds", label: "dead ends", group: "layout", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.deadEnds },
    { type: "range", key: "minCurveRadius", label: "min curve radius", group: "layout", min: 6, max: 120, step: 1, default: CITY_DEFAULTS.minCurveRadius, unit: "m" },
    { type: "range", key: "minTurnAngle", label: "min turn angle", group: "layout", min: 0, max: 60, step: 1, default: CITY_DEFAULTS.minTurnAngle, unit: "°" },
    { type: "range", key: "maxTurnAngle", label: "max turn angle", group: "layout", min: 30, max: 180, step: 1, default: CITY_DEFAULTS.maxTurnAngle, unit: "°" },
    { type: "range", key: "blockSize", label: "block size", group: "layout", min: 20, max: 140, step: 1, default: CITY_DEFAULTS.blockSize, unit: "m" },
    { type: "range", key: "blockAspect", label: "block aspect", group: "layout", min: 1, max: 3, step: 0.05, default: CITY_DEFAULTS.blockAspect },
    { type: "range", key: "openSpace", label: "open space", group: "layout", min: 0, max: 0.9, step: 0.01, default: CITY_DEFAULTS.openSpace },
    { type: "range", key: "streetWidth", label: "street width", group: "layout", min: 3, max: 16, step: 0.5, default: CITY_DEFAULTS.streetWidth, unit: "m" },
    { type: "range", key: "boulevards", label: "boulevards", group: "layout", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.boulevards },
    { type: "bool", key: "gravelLanes", label: "gravel lanes", group: "layout", default: CITY_DEFAULTS.gravelLanes },
    {
      type: "select",
      key: "surface",
      label: "surface",
      group: "layout",
      default: CITY_DEFAULTS.surface,
      options: [{ value: "auto" }, { value: "gravel" }],
    },
    { type: "bool", key: "fabric", label: "buildings & parcels", group: "layout", default: CITY_DEFAULTS.fabric },
    { type: "bool", key: "bridges", label: "bridges over water", group: "layout", default: CITY_DEFAULTS.bridges },
    { type: "bool", key: "tunnels", label: "tunnels through ridges", group: "layout", default: CITY_DEFAULTS.tunnels },
    {
      type: "select",
      key: "bridgeStyle",
      label: "bridge style",
      group: "layout",
      default: CITY_DEFAULTS.bridgeStyle,
      options: [{ value: "arch" }, { value: "truss" }, { value: "beam" }],
    },
    { type: "bool", key: "sidewalks", label: "sidewalks", group: "layout", default: CITY_DEFAULTS.sidewalks },
    { type: "range", key: "sidewalkWidth", label: "sidewalk width", group: "layout", min: 1, max: 4, step: 0.1, default: CITY_DEFAULTS.sidewalkWidth, unit: "m" },
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
    { type: "range", key: "roadsideOccupancy", label: "roadside occupancy", group: "placement", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.roadsideOccupancy },
    { type: "range", key: "blockDensity", label: "block density", group: "placement", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.blockDensity },
    { type: "range", key: "buildingRoadSetback", label: "road setback", group: "placement", min: 0, max: 12, step: 0.1, default: CITY_DEFAULTS.buildingRoadSetback, unit: "m" },
    { type: "range", key: "buildingSpacing", label: "building spacing", group: "placement", min: 0.2, max: 10, step: 0.1, default: CITY_DEFAULTS.buildingSpacing, unit: "m" },
    { type: "range", key: "clusterStrength", label: "cluster strength", group: "placement", min: 0, max: 1, step: 0.01, default: CITY_DEFAULTS.clusterStrength },
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
        roadsideOccupancy: 0.97,
        blockDensity: 0.85,
        buildingRoadSetback: 0.8,
        buildingSpacing: 0.8,
        clusterStrength: 0.25,
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
        roadsideOccupancy: 0.9,
        blockDensity: 0.55,
        buildingRoadSetback: 3,
        buildingSpacing: 1.8,
        clusterStrength: 0.5,
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
        roadsideOccupancy: 0.85,
        blockDensity: 0.3,
        buildingRoadSetback: 4.5,
        buildingSpacing: 2.2,
        clusterStrength: 0.35,
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
        roadsideOccupancy: 0.6,
        blockDensity: 0.25,
        buildingRoadSetback: 6,
        buildingSpacing: 5,
        clusterStrength: 0.8,
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
      id: "circuit",
      label: "Race circuit",
      values: {
        gridness: 0.4,
        curviness: 0.55,
        branching: 0.15,
        loopiness: 1,
        connectivity: 0.05,
        deadEnds: 0,
        minCurveRadius: 34,
        minTurnAngle: 0,
        maxTurnAngle: 95,
        blockSize: 95,
        blockAspect: 1,
        openSpace: 0,
        streetWidth: 12,
        boulevards: 0,
        gravelLanes: false,
        surface: "auto",
        fabric: false,
        bridges: true,
        tunnels: true,
        sidewalks: false,
        treeDensity: 0.2,
        lightDensity: 0.25,
        hedges: false,
        driveways: false,
        parking: false,
        fields: false,
        style: "generic",
      },
    },
    {
      id: "rally",
      label: "Rally stage",
      values: {
        gridness: 0.1,
        curviness: 0.95,
        branching: 0.2,
        loopiness: 0.15,
        connectivity: 0.12,
        deadEnds: 0.3,
        minCurveRadius: 12,
        minTurnAngle: 0,
        maxTurnAngle: 150,
        blockSize: 72,
        blockAspect: 1,
        openSpace: 0,
        streetWidth: 6,
        boulevards: 0,
        gravelLanes: true,
        surface: "gravel",
        fabric: false,
        bridges: true,
        tunnels: true,
        sidewalks: false,
        treeDensity: 0.65,
        lightDensity: 0.05,
        hedges: false,
        driveways: false,
        parking: false,
        fields: false,
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
        roadsideOccupancy: 0.92,
        blockDensity: 0.7,
        buildingRoadSetback: 1.5,
        buildingSpacing: 1.2,
        clusterStrength: 0.45,
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
  // Legacy documents tuned `buildingDensity`; honor it as the occupancy dial when the volume
  // predates the placement params (and only then — presets/authors that set the new keys win).
  const legacyDensity = meta?.["buildingDensity"];
  const hasLegacy = typeof legacyDensity === "number" && Number.isFinite(legacyDensity) && meta?.["roadsideOccupancy"] === undefined;
  return {
    gridness: params["gridness"] as number,
    curviness: params["curviness"] as number,
    branching: params["branching"] as number,
    loopiness: params["loopiness"] as number,
    connectivity: params["connectivity"] as number,
    deadEnds: params["deadEnds"] as number,
    minCurveRadius: params["minCurveRadius"] as number,
    minTurnAngle: params["minTurnAngle"] as number,
    maxTurnAngle: params["maxTurnAngle"] as number,
    fabric: params["fabric"] as boolean,
    tunnels: params["tunnels"] as boolean,
    blockSize: params["blockSize"] as number,
    blockAspect: params["blockAspect"] as number,
    openSpace: params["openSpace"] as number,
    roadsideOccupancy: hasLegacy ? Math.max(0, Math.min(1, legacyDensity)) : (params["roadsideOccupancy"] as number),
    blockDensity: hasLegacy ? Math.max(0, Math.min(1, legacyDensity * 0.8)) : (params["blockDensity"] as number),
    buildingRoadSetback: params["buildingRoadSetback"] as number,
    buildingSpacing: params["buildingSpacing"] as number,
    clusterStrength: params["clusterStrength"] as number,
    streetWidth: params["streetWidth"] as number,
    boulevards: params["boulevards"] as number,
    gravelLanes: params["gravelLanes"] as boolean,
    surface: params["surface"] as CityRules["surface"],
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
    sidewalkWidth: params["sidewalkWidth"] as number,
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
  /** Bridge/tunnel spans along this street as `[from, to]` index windows into `points`. */
  features?: readonly { kind: PathFeatureKind; from: number; to: number; bankHeight: number }[];
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
  /** Id of the parcel this building stands on. */
  parcel?: string;
}

/** One closed city block: a face of the road graph, inset to curb and land boundaries. */
export interface CityBlock {
  id: string;
  /** How the block is used: buildable, a park/plaza/field open space, or a landscaped buffer sliver. */
  kind: CityBlockKind;
  /** Land polygon behind the sidewalk band (world XZ, closed ring). */
  polygon: readonly RoadPoint[];
  /** Pavement-edge polygon (curb line). The sidewalk band lies between `curb` and `polygon`. */
  curb: readonly RoadPoint[];
  /** Land area in m². */
  area: number;
}

/** One street-frontage edge of a parcel. */
export interface CityParcelFrontageOut {
  /** Street id (`street:N`) the frontage faces. */
  road: string;
  edgeStart: RoadPoint;
  edgeEnd: RoadPoint;
  /** Unit tangent along the frontage chord. */
  tangent: RoadPoint;
}

/** One polygonal parcel subdivided from a block's street frontage. */
export interface CityParcel {
  id: string;
  /** Owning block id. */
  block: string;
  polygon: readonly RoadPoint[];
  /** Buildable polygon after front/side/rear setbacks ([] when setbacks consume the parcel). */
  buildable: readonly RoadPoint[];
  frontage: readonly CityParcelFrontageOut[];
  area: number;
  /** Usable depth from the frontage chord to the parcel rear, meters. */
  depth: number;
  isCorner: boolean;
  /** built = carries a lot; vacant = intentionally unbuilt gap; yard = leftover strip kept green. */
  kind: "built" | "vacant" | "yard";
}

/** One bridge deck spanning water: bank-to-bank polyline plus the silhouette style. */
export interface CityBridge {
  id: string;
  points: readonly RoadPoint[];
  width: number;
  style: CityRules["bridgeStyle"];
  /** Ground height at the banks — the deck reference the renderer drapes to. */
  bankHeight: number;
}

/** One tunnel bore piercing a ridge: portal-to-portal polyline held at bank height. */
export interface CityTunnel {
  id: string;
  points: readonly RoadPoint[];
  width: number;
  /** Ground height at the portals — the road floor stays flat at this height through the ridge. */
  bankHeight: number;
}

/** One intentional open space: an unbuilt block, a block-interior courtyard, or a buffer sliver. */
export interface CityPark {
  id: string;
  center: RoadPoint;
  size: readonly [number, number];
  rotationY: number;
  type: "plaza" | "green" | "meadow" | "field" | "courtyard" | "buffer";
  jitter: number;
  /** Road-derived polygon (world XZ). Present on every block-pipeline park; the rect fields above
   * are its bounding proxy for coarse consumers. */
  polygon?: readonly RoadPoint[];
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
  /** Tunnel bores piercing ridges — path features on continuous streets. */
  tunnels: readonly CityTunnel[];
  /** Closed road-derived block polygons — the land the street network encloses. */
  blocks: readonly CityBlock[];
  /** Polygonal parcels subdivided from block frontage. */
  parcels: readonly CityParcel[];
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
const MAX_STREETS = 320;
const MAX_LOTS = 2600;
const MAX_INTERSECTIONS = 600;
const MAX_TREES = 3200;
const MAX_LIGHTS = 1200;
const MAX_FIELD_ROWS = 2400;
const MAX_PARKING = 380;
const TAU = Math.PI * 2;

interface LocalStreet {
  points: [number, number][];
  width: number;
  level: CityStreet["level"];
  surface: CityStreet["surface"];
  sidewalk: boolean;
  bulb?: [number, number];
  features?: readonly { kind: PathFeatureKind; from: number; to: number; bankHeight: number }[];
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

  /** Nearest centerline sample to a point (expanding ring search), or null when far from roads. */
  nearest(x: number, z: number, maxStreet = Infinity): { x: number; z: number; street: number; dist: number } | null {
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    for (let radius = 1; radius <= 4; radius += 1) {
      let best: { x: number; z: number; street: number; dist: number } | null = null;
      for (let i = cx - radius; i <= cx + radius; i += 1) {
        for (let j = cz - radius; j <= cz + radius; j += 1) {
          const bucket = this.cells.get(`${i}:${j}`);
          if (bucket === undefined) continue;
          for (const sample of bucket) {
            if (sample.street >= maxStreet) continue;
            const d = Math.hypot(sample.x - x, sample.z - z);
            if (best === null || d < best.dist) best = { x: sample.x, z: sample.z, street: sample.street, dist: d };
          }
        }
      }
      if (best !== null) return best;
    }
    return null;
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


interface LocalPark {
  id: string;
  center: [number, number];
  size: [number, number];
  type: CityPark["type"];
  jitter: number;
  polygon?: Vec2[];
  rows?: [number, number][][];
}

interface LocalBlock {
  id: string;
  kind: CityBlockKind;
  polygon: Vec2[];
  curb: Vec2[];
  area: number;
}

interface LocalParcel {
  id: string;
  block: number;
  polygon: Vec2[];
  buildable: Vec2[];
  frontage: { street: number; a: Vec2; b: Vec2; tangent: Vec2 }[];
  area: number;
  depth: number;
  isCorner: boolean;
  kind: CityParcel["kind"];
}

interface FabricResult {
  blocks: LocalBlock[];
  parcels: LocalParcel[];
  parks: LocalPark[];
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
    parcel: string;
  }[];
  placed: LotIndex;
  hedges: { center: [number, number]; size: [number, number]; rotationY: number }[];
  driveways: { points: [number, number][]; width: number; surface: CityDriveway["surface"] }[];
}

/**
 * The block-first fabric: extract closed block polygons from the street graph, classify each
 * block (park/plaza/field/buffer/buildable), subdivide buildable block frontage into polygonal
 * parcels, and derive every building from its parcel's buildable polygon. A curved street bounds
 * a curved block; a diagonal one yields diagonal parcels — placement never guesses from the
 * nearest road again.
 */
function buildFabric(
  rules: CityRules,
  streams: (stream: string) => () => number,
  streets: LocalStreet[],
  index: StreetIndex,
  hx: number,
  hz: number,
  slopeAt: ((x: number, z: number) => number) | null,
  heightAt: ((x: number, z: number) => number) | null,
  overrideAt: ((x: number, z: number) => { band: CityZoneBand; mix: WeightedParamEntry[] | null } | null) | null,
  junctions: readonly { x: number; z: number }[],
): FabricResult {
  const result: FabricResult = { blocks: [], parcels: [], parks: [], lots: [], placed: new LotIndex(), hedges: [], driveways: [] };
  const bandMix: Record<CityZoneBand, WeightedParamEntry[]> = { core: rules.coreMix, mid: rules.midMix, edge: rules.edgeMix };
  const junctionBoost = (x: number, z: number): number => {
    let best = Infinity;
    for (const j of junctions) {
      const d = Math.hypot(j.x - x, j.z - z);
      if (d < best) best = d;
    }
    return best === Infinity ? 0 : Math.max(0, 1 - best / (rules.blockSize * 0.6));
  };
  const commercialCore = rules.coreMix.some(
    (entry) => (entry.item === "tower" || entry.item === "slab" || entry.item === "shop") && entry.weight > 0,
  );
  const fabric = extractBlocks(
    streets.map((street) => ({ points: street.points, width: street.width, level: street.level, sidewalk: street.sidewalk })),
    hx,
    hz,
    { streetWidthBase: rules.streetWidth, sidewalkBase: rules.sidewalkWidth, curbMargin: 0.35 },
  );
  const bandAt = (x: number, z: number, roll: number): { band: CityZoneBand; mix: WeightedParamEntry[] } => {
    const override = overrideAt === null ? null : overrideAt(x, z);
    const band = override !== null ? override.band : zoneBand(zoneMetric(x, z, hx, hz), rules.profile, rules.coreExtent, rules.midExtent, roll);
    const mix = override !== null && override.mix !== null && override.mix.length > 0 ? override.mix : bandMix[band];
    return { band, mix };
  };
  const parkFromRing = (id: string, type: CityPark["type"], ring: Vec2[], jitter: number): LocalPark => {
    const bounds = ringBounds(ring);
    return {
      id,
      center: [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2],
      size: [Math.max(2, bounds.maxX - bounds.minX), Math.max(2, bounds.maxZ - bounds.minZ)],
      type,
      jitter,
      polygon: ring,
    };
  };

  for (let bi = 0; bi < fabric.blocks.length; bi += 1) {
    const rings = fabric.blocks[bi]!;
    const rng = streams(`block:${bi}`);
    const bandRoll = rng();
    const openRoll = rng();
    const parkJitter = rng();
    const land = rings.land;
    const blockId = result.blocks.length;
    if (land.length < 3) {
      // The inset consumed the face: whatever pavement-free scrap remains is a landscaped buffer.
      if (rings.curb.length >= 3 && polygonArea(rings.curb) > 30) {
        result.blocks.push({ id: `block:${bi}`, kind: "buffer", polygon: rings.curb, curb: rings.curb, area: polygonArea(rings.curb) });
        result.parks.push(parkFromRing(`park:${bi}`, "buffer", rings.curb, parkJitter));
      }
      continue;
    }
    const area = polygonArea(land);
    const [bcx, bcz] = polygonCentroid(land);
    const { band } = bandAt(bcx, bcz, bandRoll);
    const sliver = isSliverBlock(land, Math.max(90, rules.blockSize * rules.blockSize * 0.028), Math.max(5.5, rules.streetWidth * 0.75));
    if (sliver) {
      result.blocks.push({ id: `block:${bi}`, kind: "buffer", polygon: land, curb: rings.curb, area });
      result.parks.push(parkFromRing(`park:${bi}`, "buffer", land, parkJitter));
      continue;
    }
    let fieldBlock = false;
    if (openRoll < rules.openSpace) {
      // Intentional open-space block. Pocket plazas only in a commercial core, and only pocket-sized.
      const bounds = ringBounds(land);
      const pocket = band === "core" && commercialCore && Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) <= 52;
      const type: CityPark["type"] = rules.fields && !pocket ? "field" : pocket ? "plaza" : band === "edge" ? "meadow" : "green";
      result.blocks.push({ id: `block:${bi}`, kind: type === "plaza" ? "plaza" : type === "field" ? "field" : "park", polygon: land, curb: rings.curb, area });
      result.parks.push(parkFromRing(`park:${bi}`, type, land, parkJitter));
      // Farm fields never displace homesteads — the farmhouse standing in its own field IS the
      // look, so field blocks still subdivide their road frontage; other park types stay clear.
      if (type !== "field") continue;
      fieldBlock = true;
    } else {
      result.blocks.push({ id: `block:${bi}`, kind: "buildable", polygon: land, curb: rings.curb, area });
    }

    // --- parcel subdivision along the block's frontage ring ---
    const walker = new RingWalker(land);
    const halfW = Math.max(3, polygonMeanWidth(land) / 2);
    const wave = makeWander(rng, 0.5, rules.blockSize * 2.6);
    const blockParcels: LocalParcel[] = [];
    let cursor = rng() * 4;
    const endStation = walker.total - 2;
    let prevClass: CityLotClass | null = null;
    let maxDepthUsed = 0;
    let guard = 0;
    while (cursor < endStation && blockParcels.length < 64 && result.lots.length < MAX_LOTS && guard < 220) {
      guard += 1;
      const pBandRoll = rng();
      const classRoll = rng();
      const stickRoll = rng();
      const occupancyRoll = rng();
      const lotJitter = rng();
      const lotRng = streams(`lot:${bi}:${Math.round(cursor * 10)}`);
      const mid0 = walker.at(cursor);
      // Only true street frontage grows parcels: an arc along the district rim (or facing a
      // pruned dead end) has no road to face, so the cursor slides past it.
      const curbProbe: Vec2 = [mid0.p[0] - mid0.normal[0] * 2, mid0.p[1] - mid0.normal[1] * 2];
      const near = index.nearest(curbProbe[0], curbProbe[1], streets.length);
      if (near === null || near.dist > streets[near.street]!.width / 2 + rules.sidewalkWidth * 1.6 + 3) {
        cursor += 6;
        prevClass = null;
        continue;
      }
      const probe: Vec2 = [mid0.p[0] + mid0.normal[0] * 5, mid0.p[1] + mid0.normal[1] * 5];
      const { band: pBand, mix } = bandAt(probe[0], probe[1], pBandRoll);
      let cls = pickClass(mix, classRoll);
      // Sticky class runs: with clustering, a house is followed by more houses — rows form.
      if (prevClass !== null && stickRoll < 0.45 + rules.clusterStrength * 0.4 && mix.some((entry) => entry.item === prevClass && entry.weight > 0)) {
        cls = prevClass;
      }
      const placement = rollClassPlacement(cls, lotRng, rules.lotScale, rules.floorsMin, rules.floorsMax, rules.buildingRoadSetback, rules.buildingSpacing);
      const frontW = placement.width + placement.gap;
      if (cursor + frontW > walker.total - 0.5) break;
      // Parcel depth: setback + class depth + rear yard, deepened toward the block spine by
      // `blockDensity` (dense districts consume their block; loose ones keep green cores). The
      // hard cap is a per-station ray cast — parcels from opposite frontages meet halfway.
      const rayOrigin: Vec2 = [mid0.p[0] + mid0.normal[0] * 0.2, mid0.p[1] + mid0.normal[1] * 0.2];
      const across = rayDistanceToRing(land, rayOrigin, mid0.normal);
      const depthCap = Number.isFinite(across) ? Math.max(3, across * 0.5 - 0.3) : halfW;
      const depth = Math.min(depthCap, placement.setback + placement.depth + 2 + rules.blockDensity * Math.max(0, depthCap - placement.depth - placement.setback - 2));
      const s0 = cursor;
      const s1 = cursor + frontW;
      let usedDepth = depth;
      let poly = cutParcel(walker, land, { s0, s1, depth });
      const midS = walker.at((s0 + s1) / 2);
      if (poly !== null && fabric.deadEnds.length > 0) {
        // Cul-de-sac lanes were pruned from the face graph; carve their corridors out of parcels.
        const keep: Vec2 = [midS.p[0] + midS.normal[0] * 1.5, midS.p[1] + midS.normal[1] * 1.5];
        let carved = carveCorridors(poly, keep, fabric.deadEnds.map((d) => ({ pts: d.pts, width: d.width + 1 })), 0.8);
        // Carve chords can cross a concave notch of the block; conform the result again.
        if (carved.length >= 3 && carved.length !== poly.length) carved = conformPolygonToRing(carved, land);
        poly = carved.length >= 3 ? carved : null;
      }
      if (poly !== null) {
        // Never overlap a neighbor parcel: retry shallower once, then give the arc up as yard.
        let clash = blockParcels.some((other) => polygonsOverlap(poly!, other.polygon, 0.18));
        if (clash) {
          const shallow = cutParcel(walker, land, { s0, s1, depth: depth * 0.55 });
          if (shallow !== null && !blockParcels.some((other) => polygonsOverlap(shallow, other.polygon, 0.18))) {
            poly = shallow;
            usedDepth = depth * 0.55;
            clash = false;
          }
        }
        if (clash) poly = null;
      }
      if (poly === null) {
        cursor += frontW * 0.6;
        prevClass = null;
        continue;
      }
      const A = walker.at(s0).p;
      const B = walker.at(s1).p;
      const tangent: Vec2 = (() => {
        const tx = B[0] - A[0];
        const tz = B[1] - A[1];
        const l = Math.hypot(tx, tz) || 1;
        return [tx / l, tz / l];
      })();
      let isCorner = false;
      for (const vi of walker.verticesBetween(s0, s1)) {
        const angle = walker.interiorAngle(vi);
        if (angle < 2.53 || angle > Math.PI * 2 - 2.53) {
          isCorner = true;
          break;
        }
      }
      const frontProbe: Vec2 = [midS.p[0] - midS.normal[0] * 2, midS.p[1] - midS.normal[1] * 2];
      const nearestStreet = index.nearest(frontProbe[0], frontProbe[1], streets.length);
      const frontage: LocalParcel["frontage"] =
        nearestStreet === null ? [] : [{ street: nearestStreet.street, a: A, b: B, tangent }];
      const parcelId = `parcel:${bi}:${blockParcels.length}`;
      const parcel: LocalParcel = {
        id: parcelId,
        block: blockId,
        polygon: poly,
        buildable: [],
        frontage,
        area: polygonArea(poly),
        depth: usedDepth,
        isCorner,
        kind: "vacant",
      };
      // Local occupancy: the district dial, drifted by the smooth wave and boosted near
      // junctions so intersections read as centers of development.
      const local =
        rules.roadsideOccupancy * (1 - rules.clusterStrength * 0.3) +
        rules.clusterStrength * (wave(cursor) + 0.5) * 0.22 +
        rules.clusterStrength * junctionBoost(midS.p[0], midS.p[1]) * 0.6;
      if (occupancyRoll > local) {
        blockParcels.push(parcel);
        cursor += frontW;
        prevClass = null;
        continue;
      }
      const sideGap = Math.max(0.3, placement.gap / 2);
      const buildable = buildablePolygon(poly, A, B, placement.setback, sideGap, 1.2, usedDepth);
      parcel.buildable = buildable;
      let placedLot = false;
      if (buildable.length >= 3) {
        const outDir: Vec2 = [-midS.normal[0], -midS.normal[1]];
        const rotationY = Math.atan2(outDir[0], outDir[1]);
        const maxW = Math.max(3, Math.min(placement.width, frontW - placement.gap));
        const availDepth = usedDepth - placement.setback - 1.2;
        const maxD = Math.max(3, Math.min(placement.depth, availDepth));
        const cx0 = midS.p[0] + midS.normal[0] * (placement.setback + maxD / 2);
        const cz0 = midS.p[1] + midS.normal[1] * (placement.setback + maxD / 2);
        const fit = fitRectInPolygon(buildable, cx0, cz0, maxW, maxD, rotationY, 0.45);
        if (fit !== null && fit.w >= 3 && fit.d >= 2.6) {
          const slopeRoll = rng();
          const hw = fit.w / 2;
          const hd = fit.d / 2;
          const ca = Math.cos(rotationY);
          const sa = Math.sin(rotationY);
          let ok = true;
          if (slopeAt !== null && slopeAt(fit.cx, fit.cz) > rules.maxSlope * (0.85 + slopeRoll * 0.3)) ok = false;
          if (ok && heightAt !== null && heightAt(fit.cx, fit.cz) < rules.minElevation) ok = false;
          // Belt and braces against pavement (bridge approaches, cul-de-sac bulbs): the footprint
          // corners keep clearance to every street centerline.
          if (ok && index.clearance(fit.cx, fit.cz, 1) < 0) ok = false;
          if (ok) {
            for (const [dx, dz] of [
              [hw, hd],
              [hw, -hd],
              [-hw, hd],
              [-hw, -hd],
            ] as const) {
              if (index.clearance(fit.cx + dx * ca + dz * sa, fit.cz - dx * sa + dz * ca, 0.4) < 0) {
                ok = false;
                break;
              }
            }
          }
          const candidate: PlacedLot = { x: fit.cx, z: fit.cz, hw, hd, angle: rotationY };
          if (ok && !result.placed.overlapsAny(candidate, 0.8)) {
            result.placed.add(candidate);
            const pieces = buildLotPieces(cls, fit.w, fit.d, placement.floors, rules.floorHeight, lotRng);
            const anchor: [number, number] = nearestStreet === null ? [frontProbe[0], frontProbe[1]] : [nearestStreet.x, nearestStreet.z];
            result.lots.push({
              id: `lot:${bi}:${result.lots.length}`,
              center: [fit.cx, fit.cz],
              size: [fit.w, fit.d],
              rotationY,
              floors: placement.floors,
              jitter: lotJitter,
              cls,
              zone: pBand,
              anchor,
              pieces,
              parcel: parcelId,
            });
            parcel.kind = "built";
            placedLot = true;
            if (rules.driveways && (cls === "house" || cls === "mansion" || cls === "farmhouse" || cls === "barn" || cls === "silo")) {
              const dirX = fit.cx - anchor[0];
              const dirZ = fit.cz - anchor[1];
              const len = Math.hypot(dirX, dirZ) || 1;
              const ux = dirX / len;
              const uz = dirZ / len;
              const streetWidth = nearestStreet === null ? rules.streetWidth : streets[nearestStreet.street]!.width;
              const start: [number, number] = [anchor[0] + ux * (streetWidth / 2 - 0.4), anchor[1] + uz * (streetWidth / 2 - 0.4)];
              const end: [number, number] = [fit.cx - ux * (hd - 1), fit.cz - uz * (hd - 1)];
              const surface: CityDriveway["surface"] =
                cls === "farmhouse" || cls === "barn" || cls === "silo" || rules.gravelLanes ? "gravel" : "pavement";
              result.driveways.push({ points: [start, end], width: cls === "mansion" ? 3.2 : 2.6, surface });
            }
            if (rules.hedges && cls === "mansion") {
              // Perimeter hedge with a gated gap centered on the driveway mouth (street face).
              const m = 2.4;
              const hhw = hw + m;
              const hhd = hd + m;
              const th = 0.7;
              const gap = 2.2;
              const runs: { x: number; z: number; len: number; rot: number }[] = [
                { x: -hhw / 2 - gap / 2, z: hhd, len: hhw - gap, rot: 0 },
                { x: hhw / 2 + gap / 2, z: hhd, len: hhw - gap, rot: 0 },
                { x: 0, z: -hhd, len: hhw * 2, rot: 0 },
                { x: hhw, z: 0, len: hhd * 2, rot: Math.PI / 2 },
                { x: -hhw, z: 0, len: hhd * 2, rot: Math.PI / 2 },
              ];
              for (const run of runs) {
                const wx = fit.cx + run.x * ca + run.z * sa;
                const wz = fit.cz - run.x * sa + run.z * ca;
                result.hedges.push({ center: [wx, wz], size: [run.len, th], rotationY: rotationY + run.rot });
              }
            }
          }
        }
      }
      if (!placedLot && parcel.kind === "vacant") parcel.kind = "yard";
      blockParcels.push(parcel);
      if (placedLot) maxDepthUsed = Math.max(maxDepthUsed, usedDepth);
      // A pushed parcel owns its whole frontage arc — the cursor never re-enters it.
      cursor += frontW;
      prevClass = placedLot ? cls : null;
    }
    result.parcels.push(...blockParcels);
    if (fieldBlock) continue; // the field polygon already owns the interior
    if (blockParcels.length === 0) {
      // Nothing subdivided (tiny ring): the block is intentional green, not leftover.
      result.blocks[blockId]!.kind = "park";
      result.parks.push(parkFromRing(`park:${bi}`, band === "edge" ? "meadow" : "green", land, parkJitter));
      continue;
    }
    // Block interior left behind the deepest parcels: classify it (courtyard downtown, green
    // elsewhere) when it is big enough to read as a place rather than back yards.
    if (maxDepthUsed > 0) {
      const core = insetRingUniform(land, maxDepthUsed + 0.5);
      if (core.length >= 3 && polygonArea(core) > 240) {
        const type: CityPark["type"] = band === "core" ? "courtyard" : band === "mid" ? (parkJitter < 0.5 ? "courtyard" : "green") : "meadow";
        result.parks.push(parkFromRing(`court:${bi}`, type, core, parkJitter));
      }
    }
  }
  return result;
}

/** Crop rows for field parks, clipped to the park's road-derived polygon and around placed lots. */
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
        // Rows follow the field's road-derived polygon: a curved block edge ends the row early.
        const outside = park.polygon !== undefined && !pointInPolygon(park.polygon, x, z);
        const blocked = outside || placed.overlapsAny({ x, z, hw: 1.2, hd: 1.2, angle: 0 }, 1.5);
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
    tunnels: [],
    blocks: [],
    parcels: [],
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
  // The unified path-network engine grows the whole road/track graph from the sliders — a city street
  // net and a closed race circuit are the SAME generator at opposite slider extremes.
  const netRules: PathNetworkRules = {
    seed: rules.seed.length > 0 ? rules.seed : object.id,
    gridness: rules.gridness,
    loopiness: rules.loopiness,
    connectivity: rules.connectivity,
    branching: rules.branching,
    deadEnds: rules.deadEnds,
    segmentLength: rules.blockSize,
    aspect: rules.blockAspect,
    winding: rules.curviness,
    minCurveRadius: rules.minCurveRadius,
    minTurnAngle: rules.minTurnAngle,
    maxTurnAngle: rules.maxTurnAngle,
    width: rules.streetWidth,
    boulevards: rules.boulevards,
  };
  const network = buildPathNetwork(netRules, hx, hz, {
    heightAt: heightAt ?? undefined,
    minElevation: rules.minElevation,
    bridges: rules.bridges,
    tunnels: rules.tunnels,
  });
  // Resolve each generated street's surface + sidewalk from its hierarchy level.
  const surfaceFor = (level: PathLevel): CityStreet["surface"] =>
    rules.surface === "gravel" || (level === "lane" && rules.gravelLanes) ? "gravel" : "asphalt";
  const local: LocalStreet[] = network.streets.slice(0, MAX_STREETS).map((street: PathStreet) => {
    const surface = surfaceFor(street.level);
    return {
      points: street.points.map(([x, z]) => [x, z] as [number, number]),
      width: street.width,
      level: street.level,
      surface,
      sidewalk: rules.sidewalks && surface === "asphalt",
      ...(street.bulb === undefined ? {} : { bulb: [street.bulb[0], street.bulb[1]] as [number, number] }),
      ...(street.features.length === 0 ? {} : { features: street.features }),
    };
  });
  const index = new StreetIndex();
  local.forEach((street, i) => index.addStreet(i, street.points, street.width));
  const intersections = network.junctions
    .slice(0, MAX_INTERSECTIONS)
    .map((j) => ({ x: j.x, z: j.z, radius: j.radius, level: j.level, arms: j.arms.map((arm) => ({ ...arm })) }));
  const localBridges = network.bridges.map((b) => ({
    points: b.points.map(([x, z]) => [x, z] as [number, number]),
    width: b.width,
    bankHeight: b.bankHeight,
  }));
  const localTunnels = network.tunnels.map((t) => ({
    points: t.points.map(([x, z]) => [x, z] as [number, number]),
    width: t.width,
    bankHeight: t.bankHeight,
  }));
  // Fabric (block/parcel/building subdivision) is optional: a bare road or race track leaves it off,
  // so a circuit never carries forced-on plots — parcels and buildings appear only when you want it.
  const emptyFabric: FabricResult = { blocks: [], parcels: [], parks: [], lots: [], placed: new LotIndex(), hedges: [], driveways: [] };
  const lotResult = rules.fabric
    ? buildFabric(rules, streams, local, index, hx, hz, slopeAt, heightAt, overrideAt, intersections)
    : emptyFabric;
  const parks = lotResult.parks;
  if (rules.fabric) buildFieldRows(parks, lotResult.placed, streams);

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
        const x = spot.position[0] + (treeRng() - 0.5) * 1.2;
        const z = spot.position[1] + (treeRng() - 0.5) * 1.2;
        // Keep canopies out of the crossing sight-triangle and off the carriageway edge.
        if (!insideBounds(x, z) || nearIntersection(x, z, 5)) continue;
        if (index.clearance(x, z, 2.6) < 0) continue;
        if (lotResult.placed.overlapsAny({ x, z, hw: 0.5, hd: 0.5, angle: 0 }, 0.5)) continue;
        trees.push({ x, z, species: pickSpecies(rules.treeMix, treeRng()), scale: 0.85 + treeRng() * 0.5, jitter: treeRng() });
      }
    }
    // Park planting: formal corners on plazas, loose clusters on greens/courtyards, sparse
    // meadows and buffers — all sampled inside the park's road-derived polygon.
    const parkRng = streams("parkTrees");
    for (const park of parks) {
      if (trees.length >= MAX_TREES) break;
      const parkArea = park.polygon !== undefined ? polygonArea(park.polygon) : park.size[0] * park.size[1];
      const count =
        park.type === "plaza"
          ? 4
          : park.type === "green" || park.type === "courtyard"
            ? Math.min(10, Math.max(3, Math.floor(parkArea / 260)))
            : park.type === "meadow"
              ? 2 + Math.floor(parkRng() * 4)
              : park.type === "buffer"
                ? Math.min(4, Math.floor(parkArea / 320))
                : 0;
      if (count <= 0) continue;
      let spots: readonly (readonly [number, number])[];
      if (park.type === "plaza") {
        spots = ([
          [park.center[0] - park.size[0] * 0.36, park.center[1] - park.size[1] * 0.36],
          [park.center[0] + park.size[0] * 0.36, park.center[1] - park.size[1] * 0.36],
          [park.center[0] - park.size[0] * 0.36, park.center[1] + park.size[1] * 0.36],
          [park.center[0] + park.size[0] * 0.36, park.center[1] + park.size[1] * 0.36],
        ] as const).filter(([x, z]) => park.polygon === undefined || pointInPolygon(park.polygon, x, z));
      } else if (park.polygon !== undefined) {
        spots = pointsInPolygon(park.polygon, count, parkRng, 1.2);
      } else {
        const random: [number, number][] = [];
        for (let i = 0; i < count; i += 1) {
          random.push([park.center[0] + (parkRng() - 0.5) * park.size[0] * 0.8, park.center[1] + (parkRng() - 0.5) * park.size[1] * 0.8]);
        }
        spots = random;
      }
      for (const [x, z] of spots) {
        if (trees.length >= MAX_TREES) break;
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
      ...(street.features === undefined ? {} : { features: street.features.map((f) => ({ ...f })) }),
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
      bankHeight: bridge.bankHeight,
    })),
    tunnels: localTunnels.map((tunnel, i) => ({
      id: `tunnel:${i}`,
      points: tunnel.points.map(([x, z]) => toWorld(x, z)),
      width: tunnel.width,
      bankHeight: tunnel.bankHeight,
    })),
    blocks: lotResult.blocks.map((block) => ({
      id: block.id,
      kind: block.kind,
      polygon: block.polygon.map(([x, z]) => toWorld(x, z)),
      curb: block.curb.map(([x, z]) => toWorld(x, z)),
      area: block.area,
    })),
    parcels: lotResult.parcels.map((parcel) => ({
      id: parcel.id,
      block: lotResult.blocks[parcel.block]?.id ?? `block:${parcel.block}`,
      polygon: parcel.polygon.map(([x, z]) => toWorld(x, z)),
      buildable: parcel.buildable.map(([x, z]) => toWorld(x, z)),
      frontage: parcel.frontage.map((front) => ({
        road: `street:${front.street}`,
        edgeStart: toWorld(front.a[0], front.a[1]),
        edgeEnd: toWorld(front.b[0], front.b[1]),
        tangent: [
          front.tangent[0] * Math.cos(rotationY) + front.tangent[1] * Math.sin(rotationY),
          -front.tangent[0] * Math.sin(rotationY) + front.tangent[1] * Math.cos(rotationY),
        ] as RoadPoint,
      })),
      area: parcel.area,
      depth: parcel.depth,
      isCorner: parcel.isCorner,
      kind: parcel.kind,
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
      parcel: lot.parcel,
    })),
    parks: parks.map((park) => ({
      id: park.id,
      center: toWorld(park.center[0], park.center[1]),
      size: park.size,
      rotationY: -rotationY,
      type: park.type,
      jitter: park.jitter,
      ...(park.polygon === undefined ? {} : { polygon: park.polygon.map(([x, z]) => toWorld(x, z)) }),
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
    label: "City / track",
    addCategory: "Studios",
    accent: "#8fa8c9",
    schema: CITY_SCHEMA,
    resolve: (object, _params, context) => resolveCityObject(object, context),
    note: (object) => {
      const resolved = resolveCityObject(object);
      if (resolved === null) return "Give the volume a box footprint.";
      if (resolved.streets.length === 0) return `Footprint too small — needs at least ${Math.ceil(resolved.rules.blockSize * 1.5)} m across.`;
      const mode = pathNetworkMode({
        seed: resolved.rules.seed,
        gridness: resolved.rules.gridness,
        loopiness: resolved.rules.loopiness,
        connectivity: resolved.rules.connectivity,
        branching: resolved.rules.branching,
        deadEnds: resolved.rules.deadEnds,
        segmentLength: resolved.rules.blockSize,
        aspect: resolved.rules.blockAspect,
        winding: resolved.rules.curviness,
        minCurveRadius: resolved.rules.minCurveRadius,
        minTurnAngle: resolved.rules.minTurnAngle,
        maxTurnAngle: resolved.rules.maxTurnAngle,
        width: resolved.rules.streetWidth,
        boulevards: resolved.rules.boulevards,
      });
      const feats = [
        resolved.bridges.length > 0 ? `${resolved.bridges.length} bridges` : "",
        resolved.tunnels.length > 0 ? `${resolved.tunnels.length} tunnels` : "",
      ].filter((s) => s.length > 0);
      const head = mode === "circuit" ? `circuit · ${resolved.streets.length} streets` : `${resolved.streets.length} streets`;
      const fabric = resolved.rules.fabric ? ` · ${resolved.lots.length} buildings · ${resolved.parks.length} parks` : " · no fabric";
      return `${head}${fabric}${feats.length > 0 ? ` · ${feats.join(" · ")}` : ""}`;
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
