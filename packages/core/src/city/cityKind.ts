/**
 * `city` studio: a procedural district authored as a box volume — drop a volume and sliders tune
 * the whole synthesis, from a rigid Manhattan grid (`gridness` 1, `curviness` 0) to winding
 * hillside estates, a two-road crossroads farm town, or — at the loopiness-high / branching-and-
 * connectivity-low corner — a closed RACE CIRCUIT. Streets come from the unified seed-driven
 * {@link STREET_NETWORK_GENERATOR} (city and track are the same generator at opposite slider
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
 * furniture (lights, species-mixed trees, estate hedges, driveways, parking lots, parked vehicles,
 * junction signals and sign posts) resolves as bounded, seeded data hooked to the network. Turn `race` on and the district also hands back a
 * {@link ResolvedRace}: a closed lap lifted out of its OWN streets with every side street leaving it
 * sealed off (barriers stood only while `startStreetRaceEvent(<volume id>)` holds) — the Monaco /
 * open-world street-race model, not a separate track. `extractStreetRaces` on {@link ResolvedCity.network}
 * lifts more named laps and sprints. Child `cityzone` volumes override the band/mix
 * locally, so hand-placed intent wins over the profile. Named presets (Manhattan, Los Angeles,
 * Beverly Hills, rural Ohio…) ship as plain slider bundles on the schema. Pure config + resolver
 * here; the instanced renderer lives in the `shell`. Everything is deterministic per seed and
 * persisted in `editor.scene.json`.
 *
 * @capability city-district editor-authorable procedural city district (streets, zoning, buildings, furniture)
 */
import { seededStreams } from "../random/rng";
import { registerSceneKind, type SceneKindObject, type SceneKindResolveContext } from "../scene/sceneKinds";
import { defineGenerator, registerGenerator, runGenerator, type GeneratorContext } from "../generator/generator";
import { defineParamSchema, parseParams, type ParamsOf, type WeightedParamEntry } from "../generator/paramSchema";
import { BUILDING_STYLE_PALETTES, DEFAULT_BUILDING_STYLE, type BuildingStyle } from "../buildings/buildings";
import {
  buildLandmarkPieces,
  buildLotPieces,
  landmarkFloors,
  pickClass,
  pickLandmarkClass,
  pickLotTemplate,
  pickSpecies,
  rollClassPlacement,
  STREETWALL_CLASSES,
  zoneBand,
  type CityLandmarkClass,
  type CityLotClass,
  type CityLotPiece,
  type CityTreeSpecies,
  type CityZoneBand,
} from "./cityContent";
import {
  CIRCUIT_ROUTE_SCHEMA,
  RACE_CIRCUIT_GENERATOR,
  circuitKerbs,
  extractCircuitRoute,
  type CircuitCorner,
  type CircuitGate,
  type CircuitRoute,
  type CircuitSealKind,
} from "../roads/raceCircuit";
import { furnitureSpots, parkingSpots } from "../roads/streets";
import { clearanceZonesFrom } from "../scatter/scatterRegion";
import type { SceneDocumentLike } from "../world/sceneShapes";
import { CITY_BUILDING_BUDGET, budgetWarning, placedCoverage } from "../scatter/scatterCoverage";
import type { RoadEnvironmentDescriptor } from "../world/features";
import type { WorldSolid } from "../world/worldSolids";
import type { RoadPoint } from "../roads/roads";
import {
  STREET_NETWORK_GENERATOR,
  type StreetFeatureKind,
  type StreetLevel,
  type StreetNetwork,
  type StreetNetworkParams,
  type StreetEdge,
  type StreetNode,
  type Street,
} from "../roads/streetGenerator";
import {
  buildablePolygon,
  carveCorridors,
  conformPolygonToRing,
  cutParcel,
  extractGraphBlocks,
  isSliverBlock,
  parkPaths,
  pointsInPolygon,
  RingWalker,
  type GraphBlockEdge,
  type GraphBlockNode,
  type GraphBlockRings,
  type CityBlockKind,
} from "./cityBlocks";
import { fitRectInPolygon, rayDistanceToRing, pointInPolygon, polygonArea, polygonCentroid, polygonMeanWidth, polygonsOverlap, insetRingUniform, rectsSeparated, ringBounds, ringSelfIntersects } from "../world/polygon";
import type { Vec2 } from "../world/geometry";
import { CHARACTER_CLASS_BIAS, CHARACTER_FILL, cityDistrictField, districtCharacter, type CityDistrictField, type CityDistrictKind } from "./cityDistricts";
import { VILLAGE_MAX_CELLS, villageGreen, villageLanes } from "./cityVillage";

/** The editor volume kind marking a box as a procedural city district. */
export const CITY_KIND = "city";

/** The editor volume kind that locally overrides a city's zone band/mix — a district in a district. */
export const CITY_ZONE_KIND = "cityzone";

/** The city parameter schema — drives the inspector sliders and `meta` parse via the studio seam. */
export const CITY_SCHEMA = defineParamSchema({
  groups: [
    { id: "layout", label: "Layout" },
    { id: "race", label: "Race" },
    { id: "placement", label: "Placement" },
    { id: "zoning", label: "Zoning" },
    { id: "buildings", label: "Buildings" },
    { id: "greenery", label: "Greenery & furniture" },
  ],
  fields: [
    { type: "range", key: "gridness", label: "grid-ness", group: "layout", min: 0, max: 1, step: 0.01, default: 0.85 },
    { type: "range", key: "curviness", label: "curviness", group: "layout", min: 0, max: 1, step: 0.01, default: 0.15 },
    { type: "range", key: "branching", label: "branching", group: "layout", min: 0, max: 1, step: 0.01, default: 0.4 },
    { type: "range", key: "loopiness", label: "loopiness", group: "layout", min: 0, max: 1, step: 0.01, default: 0 },
    { type: "range", key: "connectivity", label: "connectivity", group: "layout", min: 0, max: 1, step: 0.01, default: 0.88 },
    { type: "range", key: "deadEnds", label: "dead ends", group: "layout", min: 0, max: 1, step: 0.01, default: 0.35 },
    { type: "range", key: "minCurveRadius", label: "min curve radius", group: "layout", min: 6, max: 120, step: 1, default: 24, unit: "m" },
    { type: "range", key: "minTurnAngle", label: "min turn angle", group: "layout", min: 0, max: 60, step: 1, default: 0, unit: "°" },
    { type: "range", key: "maxTurnAngle", label: "max turn angle", group: "layout", min: 30, max: 180, step: 1, default: 150, unit: "°" },
    { type: "range", key: "outline", label: "outline", group: "layout", min: 0, max: 1, step: 0.01, default: 0 },
    { type: "range", key: "residentialBranches", label: "residential branches", group: "layout", min: 0, max: 1, step: 0.01, default: 0 },
    { type: "range", key: "elevation", label: "road elevation", group: "layout", min: 0, max: 1, step: 0.01, default: 0 },
    { type: "range", key: "maxGrade", label: "max grade", group: "layout", min: 0.01, max: 0.3, step: 0.005, default: 0.07 },
    { type: "range", key: "compactness", label: "circuit compactness", group: "layout", min: 0, max: 1, step: 0.01, default: 0 },
    { type: "range", key: "blockSize", label: "block size", group: "layout", min: 20, max: 140, step: 1, default: 48, unit: "m" },
    { type: "range", key: "blockAspect", label: "block aspect", group: "layout", min: 1, max: 3, step: 0.05, default: 1 },
    { type: "range", key: "openSpace", label: "open space", group: "layout", min: 0, max: 0.9, step: 0.01, default: 0.12 },
    { type: "range", key: "streetWidth", label: "street width", group: "layout", min: 3, max: 16, step: 0.5, default: 7, unit: "m" },
    { type: "range", key: "boulevards", label: "boulevards", group: "layout", min: 0, max: 1, step: 0.01, default: 0.35 },
    { type: "bool", key: "gravelLanes", label: "gravel lanes", group: "layout", default: false },
    {
      type: "select",
      key: "surface",
      label: "surface",
      group: "layout",
      default: "auto",
      options: [{ value: "auto" }, { value: "gravel" }],
    },
    { type: "bool", key: "fabric", label: "buildings & parcels", group: "layout", default: true },
    { type: "bool", key: "solid", label: "solid buildings", group: "layout", default: true },
    { type: "bool", key: "bridges", label: "bridges over water", group: "layout", default: true },
    { type: "bool", key: "tunnels", label: "tunnels through ridges", group: "layout", default: true },
    {
      type: "select",
      key: "bridgeStyle",
      label: "bridge style",
      group: "layout",
      default: "arch",
      options: [{ value: "arch" }, { value: "truss" }, { value: "beam" }],
    },
    { type: "bool", key: "sidewalks", label: "sidewalks", group: "layout", default: true },
    { type: "range", key: "sidewalkWidth", label: "sidewalk width", group: "layout", min: 1, max: 4, step: 0.1, default: 1.9, unit: "m" },
    { type: "action", key: "layoutRandomize", label: "randomize layout", group: "layout", action: "randomize" },
    { type: "bool", key: "race", label: "street race", group: "race", default: false },
    { type: "range", key: "raceLapLength", label: "lap length", group: "race", min: 200, max: 6000, step: 50, default: 1200, unit: "m" },
    { type: "range", key: "raceArterial", label: "arterial bias", group: "race", min: 0, max: 1, step: 0.01, default: 0.7 },
    { type: "range", key: "raceCheckpoints", label: "checkpoints", group: "race", min: 2, max: 48, step: 1, default: 12 },
    { type: "range", key: "raceLaps", label: "laps", group: "race", min: 1, max: 20, step: 1, default: 3 },
    { type: "bool", key: "raceSeals", label: "seal side streets", group: "race", default: true },
    { type: "range", key: "raceGridSlots", label: "grid slots", group: "race", min: 0, max: 40, step: 1, default: 12 },
    { type: "range", key: "raceCornerRadius", label: "corner radius", group: "race", min: 3, max: 40, step: 1, default: 9, unit: "m" },
    {
      type: "select",
      key: "profile",
      label: "zone profile",
      group: "zoning",
      default: "core-out",
      options: [{ value: "core-out" }, { value: "inverted" }, { value: "uniform" }],
    },
    { type: "range", key: "coreExtent", label: "core extent", group: "zoning", min: 0.05, max: 0.9, step: 0.01, default: 0.35 },
    { type: "range", key: "midExtent", label: "mid extent", group: "zoning", min: 0.1, max: 0.95, step: 0.01, default: 0.7 },
    { type: "weightedList", key: "coreMix", label: "core mix", group: "zoning", itemLabel: "class", default: [{ item: "tower", weight: 3 }, { item: "slab", weight: 1 }, { item: "shop", weight: 1 }] },
    { type: "weightedList", key: "midMix", label: "mid mix", group: "zoning", itemLabel: "class", default: [{ item: "slab", weight: 2 }, { item: "rowhouse", weight: 2 }, { item: "shop", weight: 1 }, { item: "warehouse", weight: 0.6 }] },
    { type: "weightedList", key: "edgeMix", label: "edge mix", group: "zoning", itemLabel: "class", default: [{ item: "house", weight: 3 }, { item: "rowhouse", weight: 1 }] },
    { type: "range", key: "lotScale", label: "lot scale", group: "zoning", min: 0.5, max: 2.5, step: 0.05, default: 1 },
    { type: "range", key: "landmarks", label: "landmarks", group: "zoning", min: 0, max: 0.5, step: 0.01, default: 0 },
    { type: "range", key: "roadsideOccupancy", label: "roadside occupancy", group: "placement", min: 0, max: 1, step: 0.01, default: 0.88 },
    { type: "range", key: "blockDensity", label: "block density", group: "placement", min: 0, max: 1, step: 0.01, default: 0.6 },
    { type: "range", key: "buildingRoadSetback", label: "road setback", group: "placement", min: 0, max: 12, step: 0.1, default: 2.5, unit: "m" },
    { type: "range", key: "buildingSpacing", label: "building spacing", group: "placement", min: 0.2, max: 10, step: 0.1, default: 1.4, unit: "m" },
    { type: "range", key: "clusterStrength", label: "cluster strength", group: "placement", min: 0, max: 1, step: 0.01, default: 0.5 },
    { type: "range", key: "floorsMin", label: "floors min", group: "buildings", min: 1, max: 60, step: 1, default: 1 },
    { type: "range", key: "floorsMax", label: "floors max", group: "buildings", min: 1, max: 60, step: 1, default: 30 },
    { type: "range", key: "floorHeight", label: "floor height", group: "buildings", min: 2, max: 5, step: 0.1, default: 3, unit: "m" },
    { type: "range", key: "maxSlope", label: "max slope", group: "buildings", min: 0.05, max: 2, step: 0.05, default: 0.5 },
    { type: "number", key: "minElevation", label: "build above y", group: "buildings", step: 0.5, default: -2 },
    {
      type: "select",
      key: "style",
      label: "style",
      group: "buildings",
      default: DEFAULT_BUILDING_STYLE,
      options: Object.keys(BUILDING_STYLE_PALETTES).map((style) => ({ value: style })),
    },
    { type: "text", key: "buildingKit", label: "building kit", group: "buildings", default: "" },
    { type: "range", key: "treeDensity", label: "tree density", group: "greenery", min: 0, max: 1, step: 0.01, default: 0.5 },
    { type: "weightedList", key: "treeMix", label: "tree mix", group: "greenery", itemLabel: "species", default: [{ item: "broadleaf", weight: 3 }, { item: "conifer", weight: 1 }] },
    { type: "range", key: "lightDensity", label: "street lights", group: "greenery", min: 0, max: 1, step: 0.01, default: 0.5 },
    { type: "range", key: "parkedCars", label: "parked cars", group: "greenery", min: 0, max: 1, step: 0.01, default: 0.55 },
    { type: "range", key: "signals", label: "traffic signals", group: "greenery", min: 0, max: 1, step: 0.01, default: 0.7 },
    { type: "bool", key: "hedges", label: "estate hedges", group: "greenery", default: true },
    { type: "bool", key: "driveways", label: "driveways", group: "greenery", default: true },
    { type: "bool", key: "parking", label: "parking lots", group: "greenery", default: true },
    { type: "bool", key: "fields", label: "farm fields", group: "greenery", default: false },
    { type: "seed", key: "seed", label: "seed", default: "" },
  ],
  presets: [
    {
      id: "manhattan",
      label: "Manhattan",
      values: {
        gridness: 1,
        curviness: 0,
        branching: 0,
        connectivity: 1,
        deadEnds: 0,
        blockSize: 80,
        blockAspect: 3.2,
        openSpace: 0.03,
        roadsideOccupancy: 0.98,
        blockDensity: 0.95,
        buildingRoadSetback: 0.55,
        buildingSpacing: 0.55,
        clusterStrength: 0.25,
        streetWidth: 9,
        sidewalkWidth: 2.6,
        boulevards: 0.15,
        gravelLanes: false,
        profile: "core-out",
        coreExtent: 0.6,
        midExtent: 0.88,
        coreMix: [
          { item: "tower", weight: 5 },
          { item: "slab", weight: 1 },
        ],
        midMix: [
          { item: "tower", weight: 3 },
          { item: "slab", weight: 2 },
        ],
        edgeMix: [
          { item: "slab", weight: 3 },
          { item: "tower", weight: 1 },
          { item: "rowhouse", weight: 1 },
        ],
        lotScale: 1,
        landmarks: 0.06,
        floorsMin: 5,
        floorsMax: 60,
        treeDensity: 0.3,
        treeMix: [{ item: "broadleaf", weight: 1 }],
        lightDensity: 0.8,
        parkedCars: 0.95,
        signals: 1,
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
        roadsideOccupancy: 0.96,
        blockDensity: 0.55,
        buildingRoadSetback: 2,
        buildingSpacing: 1.2,
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
          { item: "warehouse", weight: 0.8 },
        ],
        edgeMix: [
          { item: "house", weight: 5 },
          { item: "shop", weight: 1 },
          { item: "warehouse", weight: 0.6 },
        ],
        lotScale: 1.25,
        landmarks: 0.05,
        floorsMin: 1,
        floorsMax: 18,
        treeDensity: 0.55,
        treeMix: [
          { item: "palm", weight: 4 },
          { item: "broadleaf", weight: 1 },
          { item: "cypress", weight: 1 },
        ],
        lightDensity: 0.6,
        parkedCars: 0.7,
        signals: 0.8,
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
        roadsideOccupancy: 0.93,
        blockDensity: 0.3,
        buildingRoadSetback: 4.5,
        buildingSpacing: 1.6,
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
        lotScale: 1.4,
        landmarks: 0.04,
        floorsMin: 1,
        floorsMax: 3,
        treeDensity: 0.9,
        treeMix: [
          { item: "palm", weight: 3 },
          { item: "cypress", weight: 2 },
          { item: "broadleaf", weight: 2 },
        ],
        lightDensity: 0.35,
        parkedCars: 0.2,
        signals: 0.12,
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
        landmarks: 0.1,
        floorsMin: 1,
        floorsMax: 2,
        treeDensity: 0.35,
        treeMix: [
          { item: "broadleaf", weight: 3 },
          { item: "conifer", weight: 2 },
        ],
        lightDensity: 0.1,
        parkedCars: 0.04,
        signals: 0,
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
        compactness: 0.5,
        elevation: 0.3,
        maxGrade: 0.06,
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
        parkedCars: 0,
        signals: 0,
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
        outline: 0.5,
        elevation: 0.8,
        maxGrade: 0.14,
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
        parkedCars: 0,
        signals: 0,
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
        branching: 0.25,
        blockSize: 64,
        blockAspect: 1.3,
        openSpace: 0.12,
        roadsideOccupancy: 0.92,
        blockDensity: 0.85,
        buildingRoadSetback: 1.5,
        buildingSpacing: 1.2,
        clusterStrength: 0.45,
        streetWidth: 7.5,
        boulevards: 0.4,
        profile: "core-out",
        coreExtent: 0.45,
        midExtent: 0.85,
        landmarks: 0.05,
        floorsMin: 1,
        floorsMax: 40,
        treeDensity: 0.55,
        lightDensity: 0.6,
        parkedCars: 0.85,
        signals: 0.9,
        style: "generic",
      },
    },
  ],
});

/** Zone-override schema for `cityzone` volumes: pin a band and optionally a bespoke class mix. */
export const CITY_ZONE_SCHEMA = defineParamSchema({
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
});

/** Parsed `city` params. */
export type CityParams = ParamsOf<typeof CITY_SCHEMA>;

/**
 * The params a city grows from: the parsed schema values with the floor range ordered and the style
 * narrowed to a known palette.
 */
export type CityRules = Omit<CityParams, "style"> & { style: BuildingStyle };

function isBuildingStyle(value: string): value is BuildingStyle {
  return Object.hasOwn(BUILDING_STYLE_PALETTES, value);
}

function cityRules(params: CityParams): CityRules {
  return {
    ...params,
    floorsMin: Math.min(params.floorsMin, params.floorsMax),
    floorsMax: Math.max(params.floorsMin, params.floorsMax),
    style: isBuildingStyle(params.style) ? params.style : DEFAULT_BUILDING_STYLE,
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
  /** Grade-limited road-surface height per point, present only when `elevation` is above 0. This is
   * ROAD relief, not the terrain the district stands on. */
  heights?: readonly number[];
  /** Cul-de-sac turning bulb at a dangling end, when the lane never reconnected. */
  bulb?: RoadPoint;
  /** Bridge/tunnel spans along this street as `[from, to]` index windows into `points`. */
  features?: readonly { kind: StreetFeatureKind; from: number; to: number; bankHeight: number }[];
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
  /**
   * The lot's own seed, derived from the district's: what a renderer seeds the lot's near-detail
   * building and its paint from, so the same lot id in two districts still differs.
   */
  seed: string;
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
  /** The class's massing template the pieces follow (`podium`, `mansard`, `dutch`…), or the landmark class. */
  template: string;
  /** Id of the parcel this building stands on. */
  parcel?: string;
  /** Set when the building is a civic landmark filling its whole block; `class` is then the ordinary class used for styling. */
  landmark?: CityLandmarkClass;
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
  /** Zone band the block falls in (after overrides). */
  band: CityZoneBand;
  /** The district character the block reads as — what biased its class mix and how fully it filled. */
  district: CityDistrictKind;
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
  /** Footpath centerlines across greens, meadows and courtyards (about 2.4 m wide), world XZ. */
  paths?: readonly (readonly RoadPoint[])[];
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

/** Silhouette class of a parked vehicle — sizes the body the renderer instances. */
export type CityVehicleKind = "car" | "van" | "truck";

/** One parked vehicle standing at a curb or nose-in inside a parking pad. */
export interface CityVehicle {
  x: number;
  z: number;
  /** Yaw the body points down (engine rotationY convention). */
  rotationY: number;
  kind: CityVehicleKind;
  /** Seeded body-paint index; the renderer maps it into its own palette. */
  paint: number;
  /** Where it stands, so the renderer drapes it onto carriageway or pad height. */
  stall: "curb" | "lot";
}

/** One junction control on an approach arm: an arterial mast-arm signal, or a plain sign post. */
export interface CitySignal {
  x: number;
  z: number;
  /** Yaw the head faces — into the traffic approaching down this arm. */
  heading: number;
  kind: "signal" | "sign";
  /** How far the mast arm reaches over the carriageway, to the right of {@link CitySignal.heading}. */
  reach: number;
}

/** One street closed off where it leaves the race lap: world XZ, the yaw down the sealed street, and
 * the width the barrier run spans. */
export interface CityRaceSeal {
  x: number;
  z: number;
  heading: number;
  width: number;
  kind: CircuitSealKind;
}

/** One barrier run of a chicane: world XZ, the yaw of travel it stands across, and its run length. */
export interface CityRaceBarrier {
  x: number;
  z: number;
  heading: number;
  width: number;
  kind: CircuitSealKind;
}

/** A barrier chicane on one of the lap's secondary straights (`entry`/`exit` index the centerline). */
export interface CityRaceChicane {
  entry: number;
  exit: number;
  barriers: readonly CityRaceBarrier[];
}

/** One kerb strip hugging a corner's road edge, as a world-space polyline to stripe. */
export interface CityRaceKerb {
  points: readonly RoadPoint[];
  /** Strip width across, meters. */
  width: number;
  /** Which side of travel the strip sits on: -1 left, 1 right. */
  side: -1 | 1;
  /** Alternating stripe length along the run, meters. */
  stripe: number;
  /** Corner this kerb belongs to (index into {@link ResolvedRace.corners}). */
  corner: number;
}

/** The start/finish line: where it is, which way cars face, and the painted line across the road. */
export interface CityRaceStart {
  x: number;
  z: number;
  /** Yaw cars face on the grid (direction of travel). */
  heading: number;
  /** The two road-edge ends of the painted line. */
  line: readonly [RoadPoint, RoadPoint];
  /** Arc-length position of the line along the lap, meters. */
  distance: number;
  width: number;
}

/** One staggered spawn behind the start line. */
export interface CityRaceGridSlot {
  x: number;
  z: number;
  heading: number;
}

/**
 * An instanced street race lifted out of the district's OWN streets: a closed lap through the city,
 * with every side street leaving it sealed off. World space, like the rest of {@link ResolvedCity}.
 */
export interface ResolvedRace {
  /** Closed lap centerline — the last point joins the first. */
  centerline: readonly RoadPoint[];
  /** Road width at each centerline point, inherited from the streets the lap follows. */
  widths: readonly number[];
  /** Road-surface height per point, present only when the district carries `elevation`. */
  heights?: readonly number[];
  /** Lap length, meters. */
  length: number;
  /** Ids of the district streets the lap runs on — style exactly these as track surface. */
  streets: readonly string[];
  /**
   * Side streets closed off, and the chicanes' barriers: EVENT-SCOPED — the renderer stands them up
   * only while `startStreetRaceEvent(<city volume id>)` holds (`roads/raceEvents`).
   */
  seals: readonly CityRaceSeal[];
  chicanes: readonly CityRaceChicane[];
  corners: readonly CircuitCorner[];
  kerbs: readonly CityRaceKerb[];
  /** Ordered gates, finish last — ready for `raceTrack({ checkpoints, laps })`. */
  checkpoints: readonly CircuitGate[];
  laps: number;
  start: CityRaceStart;
  grid: readonly CityRaceGridSlot[];
  /** Arc-length fractions (0..1) where each timing sector begins; the first is always 0. */
  sectors: readonly number[];
  /** Tightest radius (m) the finished racing line actually holds. */
  tightestRadius: number;
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
  /** Parked vehicles along the curbs and inside the parking pads. */
  vehicles: readonly CityVehicle[];
  /** Traffic signals and sign posts, one per controlled junction approach. */
  signals: readonly CitySignal[];
  /** The instanced street race through these streets, when `race` is on and a lap could be found. */
  race?: ResolvedRace;
  /**
   * The street graph the district grew from, in district-local XZ (before `center` and `rotationY`).
   * Plain data: rebuild its road-surface field with `streetElevationField({ elevation, halfX, halfZ }, seed)`.
   */
  network?: StreetNetwork;
}

/** Lot pieces that block: walls and roofs. Trim and accents (cornices, awnings) stay passable. */
const SOLID_PIECE_ROLES: ReadonlySet<CityLotPiece["role"]> = new Set(["wall", "roof"]);

/**
 * One solid per wall and roof piece of every lot, grounded the way the city renderer grounds it:
 * grade at the highest lot corner, foundations down to half a metre under the lowest.
 * @capability city-district editor-authorable procedural city district (streets, zoning, buildings, furniture)
 */
export function citySolids(
  city: ResolvedCity,
  sampleHeight: (x: number, z: number) => number = () => 0,
): WorldSolid[] {
  const solids: WorldSolid[] = [];
  for (const lot of city.lots) {
    const c = Math.cos(lot.rotationY);
    const s = Math.sin(lot.rotationY);
    const hw = lot.size[0] / 2;
    const hd = lot.size[1] / 2;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [dx, dz] of [
      [hw, hd],
      [hw, -hd],
      [-hw, hd],
      [-hw, -hd],
    ] as const) {
      const y = sampleHeight(lot.center[0] + dx * c + dz * s, lot.center[1] - dx * s + dz * c);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const grade = maxY;
    const foundationBase = minY - 0.5;
    for (const piece of lot.pieces) {
      if (!SOLID_PIECE_ROLES.has(piece.role)) continue;
      const bottom = piece.grounded ? foundationBase : grade + piece.offset[1];
      const top = piece.grounded ? grade + piece.size[1] : grade + piece.offset[1] + piece.size[1];
      if (top - bottom <= 0 || piece.size[0] <= 0 || piece.size[2] <= 0) continue;
      const yaw = lot.rotationY + piece.rotationY;
      solids.push({
        center: [
          lot.center[0] + piece.offset[0] * c + piece.offset[2] * s,
          (bottom + top) / 2,
          lot.center[1] - piece.offset[0] * s + piece.offset[2] * c,
        ],
        halfExtents: [piece.size[0] / 2, (top - bottom) / 2, piece.size[2] / 2],
        ...(yaw === 0 ? {} : { rotationY: yaw }),
      });
    }
  }
  return solids;
}

/** Extended resolve context: sibling `cityzone` volumes that override the band/mix locally. */
export interface CityResolveContext extends SceneKindResolveContext {
  zoneOverrides?: readonly SceneKindObject[];
  /**
   * Gameplay spots to keep clear, world XZ discs. Omitted, they come from `objects`: every marker or
   * volume with `meta.clearance` or a default clearance kind (spawns, objectives) — the same discs
   * scatter avoids and terrain flattens ({@link clearanceZonesFrom}).
   */
  clearings?: readonly { x: number; z: number; radius: number }[];
}

/**
 * The clearance discs of a document's objects, as {@link clearanceZonesFrom} reads them — what a
 * city keeps building-free so it never sits on a spawn, a mine or an objective.
 * @capability city-district keep a district's buildings off clearance-tagged gameplay spots
 */
export function cityClearings(objects: readonly SceneKindObject[]): { x: number; z: number; radius: number }[] {
  const markers: { id: string; kind: string; position: { x: number; y: number; z: number }; meta?: Record<string, unknown> }[] = [];
  const volumes: { id: string; kind: string; center: { x: number; y: number; z: number }; radius?: number; meta?: Record<string, unknown> }[] = [];
  for (const object of objects) {
    if (object.position !== undefined) markers.push({ id: object.id, kind: object.kind, position: object.position, ...(object.meta === undefined ? {} : { meta: object.meta }) });
    else if (object.center !== undefined && object.kind !== CITY_KIND && object.kind !== CITY_ZONE_KIND) {
      volumes.push({ id: object.id, kind: object.kind, center: object.center, ...(object.radius === undefined ? {} : { radius: object.radius }), ...(object.meta === undefined ? {} : { meta: object.meta }) });
    }
  }
  return clearanceZonesFrom({ markers, volumes, paths: [] } as unknown as SceneDocumentLike).map((zone) => ({ x: zone.x, z: zone.z, radius: zone.radius }));
}

/** Bounded-work caps so a huge volume can never generate unbounded content. */
const MAX_STREETS = 320;
/** Building budget — the shared scatterable cap so the inspector's "capped at N (budget)" note is truthful. */
const MAX_LOTS = CITY_BUILDING_BUDGET;
const MAX_INTERSECTIONS = 600;
const MAX_TREES = 3200;
const MAX_LIGHTS = 1200;
const MAX_FIELD_ROWS = 2400;
const MAX_PARKING = 380;
const MAX_VEHICLES = 900;
const MAX_SIGNALS = 640;
const MAX_RACE_SEALS = 400;
const MAX_RACE_KERBS = 320;
/** Ridge height (m) above a street's banks that bores it through as a tunnel. */
const CITY_TUNNEL_CLEARANCE = 6;
const TAU = Math.PI * 2;
/**
 * Distances (m) closer than this are one distance. libm differs between platforms in the last bit, so
 * a seeded plan may never let a near-tie pick a winner: compare with this and break the tie by index.
 */
const TIE_EPSILON = 1e-7;

/** Body footprint per silhouette as `[half width across, half length along the heading]`. */
const VEHICLE_HALF_EXTENTS: Record<CityVehicleKind, readonly [number, number]> = {
  car: [0.95, 2.25],
  van: [1.05, 2.65],
  truck: [1.2, 3.5],
};
/** Paint slots the resolver spreads vehicles across; the renderer owns the actual colors. */
const VEHICLE_PAINT_COUNT = 8;

interface LocalStreet {
  points: [number, number][];
  width: number;
  level: CityStreet["level"];
  surface: CityStreet["surface"];
  sidewalk: boolean;
  heights?: number[];
  bulb?: [number, number];
  features?: readonly { kind: StreetFeatureKind; from: number; to: number; bankHeight: number }[];
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
            // Streets meeting at a junction sample the same node to within an ulp, so a probe there
            // is a tie that libm's last bit would break: within TIE_EPSILON the lower street wins.
            if (best === null || d < best.dist - TIE_EPSILON || (d <= best.dist + TIE_EPSILON && sample.street < best.street)) {
              best = { x: sample.x, z: sample.z, street: sample.street, dist: d };
            }
          }
        }
      }
      if (best !== null) return best;
    }
    return null;
  }
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
  paths?: Vec2[][];
}

interface LocalBlock {
  id: string;
  kind: CityBlockKind;
  polygon: Vec2[];
  curb: Vec2[];
  area: number;
  band: CityZoneBand;
  district: CityDistrictKind;
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

interface LocalLot {
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
  template: string;
  parcel: string;
  landmark?: CityLandmarkClass;
}

interface FabricResult {
  blocks: LocalBlock[];
  parcels: LocalParcel[];
  parks: LocalPark[];
  lots: LocalLot[];
  placed: LotIndex;
  hedges: { center: [number, number]; size: [number, number]; rotationY: number }[];
  driveways: { points: [number, number][]; width: number; surface: CityDriveway["surface"] }[];
}

/** Ordinary lot class each landmark is styled as (palette and window rules). */
const LANDMARK_STYLE_CLASS: Record<CityLandmarkClass, CityLotClass> = {
  hall: "slab",
  arena: "slab",
  market: "shop",
  campus: "slab",
  skyscraper: "tower",
  church: "house",
};

/** A gameplay spot the fabric keeps clear (district-local XZ). */
interface KeepOut {
  x: number;
  z: number;
  radius: number;
}

/** Everything the block-first fabric reads besides the rules. */
interface FabricContext {
  rules: CityRules;
  streams: (stream: string) => () => number;
  streets: LocalStreet[];
  graph: Pick<StreetNetwork, "nodes" | "edges">;
  surfaceFor: (level: StreetLevel) => CityStreet["surface"];
  index: StreetIndex;
  slopeAt: ((x: number, z: number) => number) | null;
  heightAt: ((x: number, z: number) => number) | null;
  overrideAt: ((x: number, z: number) => { band: CityZoneBand; mix: WeightedParamEntry[] | null } | null) | null;
  junctions: readonly { x: number; z: number }[];
  field: CityDistrictField;
  halfX: number;
  halfZ: number;
  /** Gameplay spots no building, tree or parked car may cover. */
  keepOut: readonly KeepOut[];
  /** A village's green: parcels never cut into it. */
  green: Vec2[] | null;
  /** A village's junction: frontage clusters around it, thinning toward the lane ends. */
  hub: Vec2 | null;
}

/**
 * Stamp one civic landmark over a whole buildable block: the largest rect that fits the setback
 * land, facing the nearest street, massed by its landmark class. Returns false (leaving the block
 * to ordinary parcels) when the block is too small, too steep or too low.
 */
function placeLandmark(ctx: FabricContext, result: FabricResult, land: Vec2[], bi: number, blockId: number, band: CityZoneBand, landmark: CityLandmarkClass): boolean {
  const { rules } = ctx;
  const rng = ctx.streams(`landmark-lot:${bi}`);
  const found = landmarkSite(ctx, land);
  if (found === null) return false;
  const { site, fit, rotationY, near, depth } = found;
  const candidate: PlacedLot = { x: fit.cx, z: fit.cz, hw: fit.w / 2, hd: fit.d / 2, angle: rotationY };
  if (result.placed.overlapsAny(candidate, 0.8)) return false;
  result.placed.add(candidate);
  // The signature tower out-tops whatever the zone mix grows; every other landmark rolls its own range.
  const floors =
    landmark === "skyscraper"
      ? Math.max(20, Math.min(90, Math.round(rules.floorsMax * (1.15 + rng() * 0.25))))
      : landmarkFloors(landmark, rng, Math.max(rules.floorsMax, 3));
  const parcelId = `parcel:${bi}:landmark`;
  result.parcels.push({
    id: parcelId,
    block: blockId,
    polygon: land,
    buildable: site,
    frontage: [],
    area: polygonArea(land),
    depth,
    isCorner: false,
    kind: "built",
  });
  result.lots.push({
    id: `lot:${bi}:${result.lots.length}`,
    center: [fit.cx, fit.cz],
    size: [fit.w, fit.d],
    rotationY,
    floors,
    jitter: rng(),
    cls: LANDMARK_STYLE_CLASS[landmark],
    zone: band,
    anchor: [near.x, near.z],
    pieces: buildLandmarkPieces(landmark, fit.w, fit.d, floors, rules.floorHeight, rng),
    template: landmark,
    parcel: parcelId,
    landmark,
  });
  return true;
}

/**
 * Where a landmark would stand on a block: the largest rect in its setback land facing the nearest
 * street, or null when the block is too small, too steep or too low to hold one.
 */
function landmarkSite(
  ctx: FabricContext,
  land: Vec2[],
): { site: Vec2[]; fit: { cx: number; cz: number; w: number; d: number }; rotationY: number; near: { x: number; z: number }; depth: number } | null {
  const { rules } = ctx;
  const site = insetRingUniform(land, Math.max(1, rules.buildingRoadSetback));
  if (site.length < 3) return null;
  const [cx, cz] = polygonCentroid(site);
  // The street it faces: nearest to the centroid, or — on a block too big for the index's reach —
  // nearest to any corner of the site.
  let near = ctx.index.nearest(cx, cz, ctx.streets.length);
  if (near === null) {
    let bestD = Infinity;
    for (const [px, pz] of site) {
      const probe = ctx.index.nearest(px, pz, ctx.streets.length);
      if (probe === null) continue;
      const d = Math.hypot(probe.x - cx, probe.z - cz);
      if (d < bestD - 1e-9) {
        bestD = d;
        near = probe;
      }
    }
  }
  if (near === null) return null;
  const ox = near.x - cx;
  const oz = near.z - cz;
  const ol = Math.hypot(ox, oz) || 1;
  const out: Vec2 = [ox / ol, oz / ol];
  const rotationY = Math.atan2(out[0], out[1]);
  // Extents of the site along the frontage (x) and into the block (z) set the rect's proportions.
  let minA = Infinity;
  let maxA = -Infinity;
  let minB = Infinity;
  let maxB = -Infinity;
  for (const [px, pz] of site) {
    const a = (px - cx) * out[1] - (pz - cz) * out[0];
    const b = (px - cx) * out[0] + (pz - cz) * out[1];
    minA = Math.min(minA, a);
    maxA = Math.max(maxA, a);
    minB = Math.min(minB, b);
    maxB = Math.max(maxB, b);
  }
  const fit = fitRectInPolygon(site, cx, cz, maxA - minA, maxB - minB, rotationY, 0.3);
  if (fit === null || fit.w < 14 || fit.d < 12) return null;
  // A cul-de-sac lane poking into the block keeps its pavement: the footprint stays clear of it.
  if (!rectClearOfStreets(ctx.index, fit, rotationY)) return null;
  if (ctx.slopeAt !== null && ctx.slopeAt(fit.cx, fit.cz) > rules.maxSlope) return null;
  if (ctx.heightAt !== null && ctx.heightAt(fit.cx, fit.cz) < rules.minElevation) return null;
  return { site, fit, rotationY, near, depth: maxB - minB };
}

/** Whether a block-scale footprint keeps clear of every street, sampled every ~4 m across it. */
function rectClearOfStreets(index: StreetIndex, fit: { cx: number; cz: number; w: number; d: number }, rotationY: number): boolean {
  const ca = Math.cos(rotationY);
  const sa = Math.sin(rotationY);
  const nx = Math.max(2, Math.ceil(fit.w / 4));
  const nz = Math.max(2, Math.ceil(fit.d / 4));
  for (let i = 0; i <= nx; i += 1) {
    for (let j = 0; j <= nz; j += 1) {
      const dx = (i / nx - 0.5) * fit.w;
      const dz = (j / nz - 0.5) * fit.d;
      if (index.clearance(fit.cx + dx * ca + dz * sa, fit.cz - dx * sa + dz * ca, 0.6) < 0) return false;
    }
  }
  return true;
}

/** {@link polygonsOverlap} behind a bounding-box reject: parcel clash tests run per frontage step. */
function parcelsOverlap(a: readonly Vec2[], b: readonly Vec2[], shrink: number): boolean {
  const ba = ringBounds(a);
  const bb = ringBounds(b);
  if (ba.maxX < bb.minX || bb.maxX < ba.minX || ba.maxZ < bb.minZ || bb.maxZ < ba.minZ) return false;
  return polygonsOverlap(a, b, shrink);
}

/** The same closed ring, rotated to start at its sharpest corner (smallest interior angle; index breaks ties). */
function ringFromSharpestCorner(ring: Vec2[]): Vec2[] {
  const walker = new RingWalker(ring);
  let best = 0;
  let bestAngle = Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const angle = walker.interiorAngle(i);
    if (angle < bestAngle - 1e-9) {
      bestAngle = angle;
      best = i;
    }
  }
  return best === 0 ? ring : [...ring.slice(best), ...ring.slice(0, best)];
}

/** What the pre-pass learns about one traced block before any of them is used. */
interface BlockInfo {
  bi: number;
  rings: GraphBlockRings;
  rng: () => number;
  parkJitter: number;
  land: Vec2[];
  area: number;
  centroid: Vec2;
  band: CityZoneBand;
  character: CityDistrictKind;
  sliver: boolean;
  extent: number;
}

/** How a selected block is used before frontage subdivision. */
type BlockUse = { kind: "open"; type: CityPark["type"] } | { kind: "landmark"; landmark: CityLandmarkClass };

/**
 * Choose, deliberately rather than by per-block dice, which blocks become the district's squares,
 * parks and landmarks: a square (or green) at every centre, the signature buildings next to them, the
 * remaining landmarks on the biggest well-spaced blocks, then open space spread by farthest-point
 * sampling over the blocks that suit it.
 */
function selectBlockUses(ctx: FabricContext, infos: readonly BlockInfo[]): Map<number, BlockUse> {
  const { rules, field } = ctx;
  const uses = new Map<number, BlockUse>();
  const eligible = infos.filter((info) => !info.sliver);
  if (eligible.length === 0) return uses;
  const free = (info: BlockInfo): boolean => !uses.has(info.bi);
  const dist = (a: Vec2, b: readonly [number, number]): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const nearestFree = (point: readonly [number, number], accept: (info: BlockInfo) => boolean = () => true): BlockInfo | null => {
    let best: BlockInfo | null = null;
    let bestD = Infinity;
    for (const info of eligible) {
      if (!free(info) || !accept(info)) continue;
      const d = dist(info.centroid, point);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = info;
      }
    }
    return best;
  };
  const anchors: Vec2[] = [];
  const has = (mix: readonly WeightedParamEntry[], cls: CityLotClass): boolean => mix.some((entry) => entry.item === cls && entry.weight > 0);
  // Squares at the centres — a paved plaza in a commercial core, a green where the blocks run large —
  // drawn first from the open-space budget, one per centre while it lasts.
  const openBudget = Math.round(rules.openSpace * eligible.length);
  if (eligible.length >= 6) {
    for (const centre of field.centres.slice(0, openBudget)) {
      const info = nearestFree([centre.x, centre.z]);
      if (info === null) continue;
      const commercial = has(rules.coreMix, "tower") || has(rules.coreMix, "slab") || has(rules.coreMix, "shop");
      uses.set(info.bi, { kind: "open", type: info.band === "core" && commercial && info.extent <= 80 ? "plaza" : "green" });
      anchors.push(info.centroid);
    }
  }
  const squares = uses.size;
  if (rules.landmarks > 0) {
    const target = Math.max(1, Math.round(rules.landmarks * eligible.length));
    let placed = 0;
    const fitMemo = new Map<number, boolean>();
    const fits = (info: BlockInfo): boolean => {
      let known = fitMemo.get(info.bi);
      if (known === undefined) {
        known = landmarkSite(ctx, info.land) !== null;
        fitMemo.set(info.bi, known);
      }
      return known;
    };
    const take = (info: BlockInfo | null, landmark: CityLandmarkClass): void => {
      if (info === null || placed >= target) return;
      uses.set(info.bi, { kind: "landmark", landmark });
      anchors.push(info.centroid);
      placed += 1;
    };
    const tall = has(rules.coreMix, "tower") && rules.floorsMax >= 20;
    field.centres.forEach((centre, i) => {
      if (centre.primary) take(nearestFree([centre.x, centre.z], fits), tall ? "skyscraper" : rules.floorsMax <= 3 ? "church" : "hall");
      else take(nearestFree([centre.x, centre.z], fits), i % 2 === 1 ? "church" : "market");
    });
    const spacing = Math.max(2.2 * rules.blockSize, 70);
    const byArea = eligible.filter(free).sort((a, b) => b.area - a.area || a.bi - b.bi);
    for (const info of byArea) {
      if (placed >= target) break;
      if (!free(info)) continue;
      if (anchors.some((anchor) => dist(info.centroid, anchor) < spacing) || !fits(info)) continue;
      take(info, pickLandmarkClass(info.band, ctx.streams(`landmark:${info.bi}`)()));
    }
  }
  const openTarget = Math.max(0, openBudget - squares);
  if (openTarget > 0) {
    const meanArea = eligible.reduce((sum, info) => sum + info.area, 0) / eligible.length;
    const bandSuit: Record<CityZoneBand, number> = rules.fields ? { edge: 1, mid: 0.7, core: 0.15 } : { mid: 1, edge: 0.85, core: 0.45 };
    const opens: Vec2[] = uses.size === 0 ? [] : eligible.filter((info) => uses.get(info.bi)?.kind === "open").map((info) => info.centroid);
    for (let n = 0; n < openTarget; n += 1) {
      let best: BlockInfo | null = null;
      let bestScore = -Infinity;
      for (const info of eligible) {
        if (!free(info)) continue;
        const suit = bandSuit[info.band] * Math.min(1.6, Math.max(0.5, Math.sqrt(info.area / Math.max(1, meanArea))));
        const spread = opens.length === 0 ? 1 : Math.min(4, Math.min(...opens.map((o) => dist(info.centroid, o))) / Math.max(1, rules.blockSize));
        const score = suit * (1 + spread);
        if (score > bestScore + 1e-9) {
          bestScore = score;
          best = info;
        }
      }
      if (best === null) break;
      uses.set(best.bi, { kind: "open", type: rules.fields ? "field" : best.band === "edge" ? "meadow" : "green" });
      opens.push(best.centroid);
    }
  }
  return uses;
}

/** Whether ground near a block centroid drops below the build floor — a block on the water's edge. */
function frontsWater(ctx: FabricContext, centroid: Vec2, area: number): boolean {
  if (ctx.heightAt === null) return false;
  const reach = Math.min(70, Math.max(20, Math.sqrt(area) / 2 + 12));
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    const x = centroid[0] + Math.cos(a) * reach;
    const z = centroid[1] + Math.sin(a) * reach;
    if (Math.abs(x) > ctx.halfX || Math.abs(z) > ctx.halfZ) continue;
    if (ctx.heightAt(x, z) < ctx.rules.minElevation) return true;
  }
  return false;
}

/**
 * Close the district's outer blocks along its rim when the street graph leaves them open: every
 * street end dangling on the footprint edge is joined round the rim (with the four corners) by
 * zero-width, sidewalk-free boundary edges, so frontage along those streets still bounds a block.
 * A network that already frames its footprint has no dangling rim ends and gets nothing.
 */
function rimClosure(nodes: readonly StreetNode[], edges: readonly StreetEdge[], hx: number, hz: number): { nodes: GraphBlockNode[]; edges: GraphBlockEdge[] } {
  const degree = new Array<number>(nodes.length).fill(0);
  for (const edge of edges) {
    degree[edge.a] = (degree[edge.a] ?? 0) + 1;
    degree[edge.b] = (degree[edge.b] ?? 0) + 1;
  }
  const perimeter = 4 * (hx + hz);
  // Arc-length station counter-clockwise round the rim from the (-hx, -hz) corner.
  const station = (x: number, z: number): number => {
    if (Math.abs(z + hz) < 1.5) return x + hx;
    if (Math.abs(x - hx) < 1.5) return 2 * hx + (z + hz);
    if (Math.abs(z - hz) < 1.5) return 2 * hx + 2 * hz + (hx - x);
    return 4 * hx + 2 * hz + (hz - z);
  };
  const onRim = (x: number, z: number): boolean => Math.abs(Math.abs(x) - hx) < 1.5 || Math.abs(Math.abs(z) - hz) < 1.5;
  const stops: { id: number; s: number; x: number; z: number }[] = [];
  nodes.forEach((node, id) => {
    if (degree[id] === 1 && onRim(node.x, node.z)) stops.push({ id, s: station(node.x, node.z), x: node.x, z: node.z });
  });
  if (stops.length < 2) return { nodes: [], edges: [] };
  const outNodes: GraphBlockNode[] = [];
  const corners: readonly (readonly [number, number])[] = [
    [-hx, -hz],
    [hx, -hz],
    [hx, hz],
    [-hx, hz],
  ];
  for (const [x, z] of corners) {
    const id = nodes.length + outNodes.length;
    outNodes.push({ x, z });
    stops.push({ id, s: station(x, z) % perimeter, x, z });
  }
  stops.sort((a, b) => a.s - b.s || a.id - b.id);
  const outEdges: GraphBlockEdge[] = [];
  for (let i = 0; i < stops.length; i += 1) {
    const a = stops[i]!;
    const b = stops[(i + 1) % stops.length]!;
    if (a.id === b.id || Math.hypot(a.x - b.x, a.z - b.z) < 0.05) continue;
    outEdges.push({ a: a.id, b: b.id, points: [[a.x, a.z], [b.x, b.z]], width: 0, level: "lane", sidewalk: false });
  }
  return { nodes: outNodes, edges: outEdges };
}

/**
 * The block-first fabric: extract closed block polygons from the street graph, read each block's
 * band and district character off the organic zoning field, choose the district's squares, parks
 * and landmarks deliberately, subdivide every other buildable block's frontage into polygonal
 * parcels filled as its character demands (wall-to-wall streetwalls downtown, perimeter blocks
 * round a courtyard in the old town, detached houses in their yards out in the suburbs), then fill
 * or green the block interior. A curved street bounds a curved block; a diagonal one yields diagonal
 * parcels — placement never guesses from the nearest road again.
 */
function buildFabric(ctx: FabricContext): FabricResult {
  const { rules, streams, streets, index, slopeAt, heightAt, overrideAt, junctions, field } = ctx;
  const result: FabricResult = { blocks: [], parcels: [], parks: [], lots: [], placed: new LotIndex(), hedges: [], driveways: [] };
  // Gameplay spots are pre-claimed footprints: every lot, landmark, pad, tree and car avoids them.
  for (const spot of ctx.keepOut) result.placed.add({ x: spot.x, z: spot.z, hw: spot.radius, hd: spot.radius, angle: 0 });
  const bandMix: Record<CityZoneBand, WeightedParamEntry[]> = { core: rules.coreMix, mid: rules.midMix, edge: rules.edgeMix };
  const junctionBoost = (x: number, z: number): number => {
    let best = Infinity;
    for (const j of junctions) {
      const d = Math.hypot(j.x - x, j.z - z);
      if (d < best) best = d;
    }
    return best === Infinity ? 0 : Math.max(0, 1 - best / (rules.blockSize * 0.6));
  };
  // Blocks are traced from the exact street graph, so curved and filleted streets still close
  // their faces (proximity welding of centerlines collapses on them).
  const graphEdges: GraphBlockEdge[] = ctx.graph.edges.map((edge) => {
    const surface = ctx.surfaceFor(edge.level);
    return { a: edge.a, b: edge.b, points: edge.points, width: edge.width, level: edge.level, sidewalk: rules.sidewalks && surface === "asphalt" };
  });
  const rim = rimClosure(ctx.graph.nodes, ctx.graph.edges, ctx.halfX, ctx.halfZ);
  const fabric = extractGraphBlocks([...ctx.graph.nodes, ...rim.nodes], [...graphEdges, ...rim.edges], { sidewalkBase: rules.sidewalkWidth, curbMargin: 0.35 });
  const bandAt = (x: number, z: number, roll: number): { band: CityZoneBand; mix: WeightedParamEntry[] } => {
    const override = overrideAt === null ? null : overrideAt(x, z);
    const band = override !== null ? override.band : zoneBand(field.metric(x, z), rules.profile, rules.coreExtent, rules.midExtent, roll);
    const mix = override !== null && override.mix !== null && override.mix.length > 0 ? override.mix : bandMix[band];
    return { band, mix };
  };
  const characterAt = (x: number, z: number, band: CityZoneBand, mix: readonly WeightedParamEntry[], waterfront: boolean): CityDistrictKind =>
    districtCharacter({ band, primaryCentre: field.centres[field.centreAt(x, z)]?.primary ?? true, industry: field.industry(x, z), waterfront, mix });
  const parkFromRing = (id: string, type: CityPark["type"], ring: Vec2[], jitter: number): LocalPark => {
    const bounds = ringBounds(ring);
    const paths = type === "green" || type === "meadow" || type === "courtyard" ? parkPaths(ring) : [];
    return {
      id,
      center: [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2],
      size: [Math.max(2, bounds.maxX - bounds.minX), Math.max(2, bounds.maxZ - bounds.minZ)],
      type,
      jitter,
      polygon: ring,
      ...(paths.length === 0 ? {} : { paths }),
    };
  };

  // --- pre-pass: band, character and shape of every traced block ---
  const infos: BlockInfo[] = [];
  const scraps: { bi: number; rings: GraphBlockRings; parkJitter: number }[] = [];
  for (let bi = 0; bi < fabric.blocks.length; bi += 1) {
    const rings = fabric.blocks[bi]!;
    const rng = streams(`block:${bi}`);
    const bandRoll = rng();
    const parkJitter = rng();
    const land = rings.land;
    if (land.length < 3) {
      scraps.push({ bi, rings, parkJitter });
      continue;
    }
    const area = polygonArea(land);
    const centroid = polygonCentroid(land);
    const { band, mix } = bandAt(centroid[0], centroid[1], bandRoll);
    const bounds = ringBounds(land);
    infos.push({
      bi,
      rings,
      rng,
      parkJitter,
      land,
      area,
      centroid,
      band,
      character: characterAt(centroid[0], centroid[1], band, mix, frontsWater(ctx, centroid, area)),
      sliver: isSliverBlock(land, Math.max(90, rules.blockSize * rules.blockSize * 0.028), Math.max(5.5, rules.streetWidth * 0.75)),
      extent: Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ),
    });
  }
  const uses = selectBlockUses(ctx, infos);
  const order = [...scraps.map((s) => ({ bi: s.bi, scrap: s, info: null as BlockInfo | null })), ...infos.map((info) => ({ bi: info.bi, scrap: null, info }))].sort((a, b) => a.bi - b.bi);

  for (const entry of order) {
    const bi = entry.bi;
    if (entry.scrap !== null) {
      // The inset consumed the face: whatever pavement-free scrap remains is a landscaped buffer.
      const { rings, parkJitter } = entry.scrap;
      if (rings.curb.length >= 3 && polygonArea(rings.curb) > 30) {
        const [sx, sz] = polygonCentroid(rings.curb);
        const scrapBand = bandAt(sx, sz, parkJitter).band;
        result.blocks.push({ id: `block:${bi}`, kind: "buffer", polygon: rings.curb, curb: rings.curb, area: polygonArea(rings.curb), band: scrapBand, district: scrapBand === "core" ? "cbd" : scrapBand === "mid" ? "residential" : "suburb" });
        result.parks.push(parkFromRing(`park:${bi}`, "buffer", rings.curb, parkJitter));
      }
      continue;
    }
    const info = entry.info!;
    const { rings, rng, land, area, band, character, parkJitter } = info;
    const blockId = result.blocks.length;
    if (info.sliver) {
      result.blocks.push({ id: `block:${bi}`, kind: "buffer", polygon: land, curb: rings.curb, area, band, district: character });
      result.parks.push(parkFromRing(`park:${bi}`, "buffer", land, parkJitter));
      continue;
    }
    const use = uses.get(bi);
    let fieldBlock = false;
    if (use?.kind === "open") {
      const type = use.type;
      result.blocks.push({ id: `block:${bi}`, kind: type === "plaza" ? "plaza" : type === "field" ? "field" : "park", polygon: land, curb: rings.curb, area, band, district: character });
      result.parks.push(parkFromRing(`park:${bi}`, type, land, parkJitter));
      // Farm fields never displace homesteads — the farmhouse standing in its own field IS the
      // look, so field blocks still subdivide their road frontage; other park types stay clear.
      if (type !== "field") continue;
      fieldBlock = true;
    } else {
      result.blocks.push({ id: `block:${bi}`, kind: "buildable", polygon: land, curb: rings.curb, area, band, district: character });
      if (use?.kind === "landmark" && result.lots.length < MAX_LOTS && placeLandmark(ctx, result, land, bi, blockId, band, use.landmark)) continue;
    }

    // --- parcel subdivision along the block's frontage ring ---
    // A village clusters its frontage: its terraces and shops close up into a continuous street front.
    const fill = Math.min(1, Math.max(rules.blockDensity * CHARACTER_FILL[character], ctx.hub === null ? 0 : 0.7));
    const bias = CHARACTER_CLASS_BIAS[character];
    // Walk the frontage from the block's sharpest corner, so the first parcel is a true corner lot
    // and the walk closes back onto that corner instead of splitting it at a random station.
    const front = ringFromSharpestCorner(land);
    const walker = new RingWalker(front);
    const halfW = Math.max(3, polygonMeanWidth(land) / 2);
    const wave = makeWander(rng, 0.5, rules.blockSize * 2.6);
    const blockParcels: LocalParcel[] = [];
    let cursor = rng() * (fill >= 0.55 ? 0.5 : 4);
    const endStation = walker.total - 2;
    // No parcel runs deeper than a building lot does, even off a block's short end.
    const depthLimit = Math.max(12, rules.blockSize * 0.55);
    let prevClass: CityLotClass | null = null;
    let maxDepthUsed = 0;
    let guard = 0;
    while (cursor < endStation && blockParcels.length < 64 && result.lots.length < MAX_LOTS && guard < 400) {
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
      let cls = pickClass(mix, classRoll, bias);
      // Sticky class runs: with clustering, a house is followed by more houses — rows form.
      if (prevClass !== null && stickRoll < 0.45 + rules.clusterStrength * 0.4 && mix.some((e) => e.item === prevClass && e.weight > 0)) {
        cls = prevClass;
      }
      const dense = fill >= 0.55 && STREETWALL_CLASSES.has(cls);
      const placement = rollClassPlacement(
        cls,
        lotRng,
        rules.lotScale,
        rules.floorsMin,
        rules.floorsMax,
        rules.buildingRoadSetback,
        rules.buildingSpacing * (ctx.green !== null ? 0.6 : 1),
        dense && ctx.hub === null ? 1 + fill * 0.35 : 1,
        field.intensity(probe[0], probe[1]),
      );
      const frontW = placement.width + placement.gap;
      if (cursor + frontW > walker.total - 0.5) break;
      // Parcel depth: setback + class depth + rear yard, deepened toward the block spine by the
      // block fill (a CBD consumes its block, a suburb keeps its gardens). The hard cap is a
      // per-station ray cast — parcels from opposite frontages meet halfway.
      const rayOrigin: Vec2 = [mid0.p[0] + mid0.normal[0] * 0.2, mid0.p[1] + mid0.normal[1] * 0.2];
      const across = rayDistanceToRing(land, rayOrigin, mid0.normal);
      const depthCap = Number.isFinite(across) ? Math.max(3, across * 0.5 - 0.3) : halfW;
      const baseDepth = placement.setback + placement.depth + 2;
      const reach = dense ? fill * fill : rules.blockDensity;
      const depth = Math.min(depthCap, Math.max(baseDepth, depthLimit), baseDepth + reach * Math.max(0, depthCap - baseDepth));
      const s0 = cursor;
      // A dense street wall never leaves a sliver at the end of its walk: the last parcel takes it.
      let s1 = dense && walker.total - 0.4 - (cursor + frontW) < frontW * 0.5 ? walker.total - 0.4 : cursor + frontW;
      // A parcel never wraps a block corner (an L-shaped scrap no building fits): it ends at the
      // corner, and an arc too short to build on before one is skipped.
      const corner = walker.verticesBetween(s0, s1).find((vi) => {
        const angle = walker.interiorAngle(vi);
        return angle < 2.53 || angle > Math.PI * 2 - 2.53;
      });
      if (corner !== undefined) {
        const station = walker.cum[corner]!;
        if (station - s0 < Math.max(4, frontW * 0.45)) {
          cursor = station + 0.05;
          prevClass = null;
          continue;
        }
        s1 = station - 0.05;
      }
      let usedDepth = depth;
      let poly = cutParcel(walker, front, { s0, s1, depth });
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
        let clash = blockParcels.some((other) => parcelsOverlap(poly!, other.polygon, 0.18));
        if (clash) {
          const shallow = cutParcel(walker, front, { s0, s1, depth: depth * 0.55 });
          if (shallow !== null && !blockParcels.some((other) => parcelsOverlap(shallow, other.polygon, 0.18))) {
            poly = shallow;
            usedDepth = depth * 0.55;
            clash = false;
          }
        }
        if (clash) poly = null;
      }
      // A village keeps its green: no parcel is cut into it.
      if (poly !== null && ctx.green !== null && parcelsOverlap(poly, ctx.green, 0.1)) poly = null;
      // A cut that folded over itself at a tight corner is no parcel.
      if (poly !== null && ringSelfIntersects(poly)) poly = null;
      if (poly === null) {
        // Slide on in short steps: a corner square or a carved lane frees up within a few metres.
        cursor += Math.min(frontW * 0.6, 2.5);
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
      const frontage: LocalParcel["frontage"] = nearestStreet === null ? [] : [{ street: nearestStreet.street, a: A, b: B, tangent }];
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
      const sideGap = dense ? (cls === "shop" || cls === "rowhouse" ? 0.06 : 0.12) : Math.max(0.3, placement.gap / 2);
      const frontSetback = Math.max(0.05, placement.setback * (dense ? 0.35 : 1));
      const buildable = buildablePolygon(poly, A, B, frontSetback, sideGap, dense ? 0.6 : 1.2, usedDepth);
      // A scrap the class could never stand on (a carved cul-de-sac corridor, a notch) is not a
      // parcel: slide on a few metres instead of burning a whole frontage on a yard.
      if (polygonArea(buildable) < placement.width * placement.depth * 0.3 || polygonArea(poly) < placement.width * placement.depth * 0.6) {
        cursor += Math.min(frontW * 0.6, 2.5);
        prevClass = null;
        continue;
      }
      // Local occupancy: the district dial, drifted by the smooth wave and boosted near
      // junctions so intersections read as centers of development.
      const local =
        rules.roadsideOccupancy * (1 - rules.clusterStrength * 0.3) +
        rules.clusterStrength * (wave(cursor) + 0.5) * 0.22 +
        rules.clusterStrength * junctionBoost(midS.p[0], midS.p[1]) * 0.6 +
        (dense ? fill * 0.25 : 0) +
        (ctx.hub === null ? 0 : 0.2 + 0.4 * Math.max(0, 1 - Math.hypot(midS.p[0] - ctx.hub[0], midS.p[1] - ctx.hub[1]) / (0.9 * Math.max(ctx.halfX, ctx.halfZ))));
      if (occupancyRoll > local) {
        blockParcels.push(parcel);
        cursor = s1;
        prevClass = null;
        continue;
      }
      parcel.buildable = buildable;
      let placedLot = false;
      if (buildable.length >= 3) {
        const outDir: Vec2 = [-midS.normal[0], -midS.normal[1]];
        const rotationY = Math.atan2(outDir[0], outDir[1]);
        const maxW = Math.max(3, dense ? s1 - s0 - sideGap * 2 : Math.min(placement.width, frontW - Math.max(0.15, placement.gap)));
        const availDepth = usedDepth - frontSetback - (dense ? 0.6 : 1.2);
        const maxD = Math.max(3, Math.min(availDepth, dense ? Math.max(placement.depth, availDepth * (0.7 + 0.3 * fill)) : placement.depth));
        const cx0 = midS.p[0] + midS.normal[0] * (frontSetback + maxD / 2);
        const cz0 = midS.p[1] + midS.normal[1] * (frontSetback + maxD / 2);
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
          if (ok && !result.placed.overlapsAny(candidate, dense ? 0.2 : 0.8)) {
            result.placed.add(candidate);
            const template = pickLotTemplate(cls, fit.w, fit.d, placement.floors, lotRng(), dense ? fill : 0);
            const pieces = buildLotPieces(cls, fit.w, fit.d, placement.floors, rules.floorHeight, lotRng, template);
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
              template,
              parcel: parcelId,
            });
            parcel.kind = "built";
            placedLot = true;
            // Farmsteads and village plots keep an outbuilding in the back yard: a barn behind the
            // farmhouse, a shed or byre behind a cottage.
            if ((cls === "farmhouse" || (ctx.hub !== null && cls !== "barn" && cls !== "silo")) && result.lots.length < MAX_LOTS) {
              const rear = usedDepth - frontSetback - fit.d - 1.2;
              const shedD = Math.min(cls === "farmhouse" ? 11 : 5, rear - 1.5);
              if (shedD >= 3.5) {
                const shedW = Math.min(fit.w * (cls === "farmhouse" ? 1 : 0.75), cls === "farmhouse" ? 15 : 6.5);
                const back = fit.d / 2 + 1.5 + shedD / 2;
                const shed = fitRectInPolygon(buildable, fit.cx + midS.normal[0] * back, fit.cz + midS.normal[1] * back, shedW, shedD, rotationY, 0.75);
                if (shed !== null && !result.placed.overlapsAny({ x: shed.cx, z: shed.cz, hw: shed.w / 2, hd: shed.d / 2, angle: rotationY }, 0.8)) {
                  result.placed.add({ x: shed.cx, z: shed.cz, hw: shed.w / 2, hd: shed.d / 2, angle: rotationY });
                  const shedTemplate = pickLotTemplate("barn", shed.w, shed.d, 1, lotRng());
                  result.lots.push({
                    id: `lot:${bi}:${result.lots.length}`,
                    center: [shed.cx, shed.cz],
                    size: [shed.w, shed.d],
                    rotationY,
                    floors: 1,
                    jitter: lotRng(),
                    cls: "barn",
                    zone: pBand,
                    anchor,
                    pieces: buildLotPieces("barn", shed.w, shed.d, 1, rules.floorHeight, lotRng, shedTemplate),
                    template: shedTemplate,
                    parcel: parcelId,
                  });
                }
              }
            }
            if (rules.driveways && (cls === "house" || cls === "mansion" || cls === "farmhouse" || cls === "barn" || cls === "silo" || cls === "warehouse")) {
              const dirX = fit.cx - anchor[0];
              const dirZ = fit.cz - anchor[1];
              const len = Math.hypot(dirX, dirZ) || 1;
              const ux = dirX / len;
              const uz = dirZ / len;
              const streetWidth = nearestStreet === null ? rules.streetWidth : streets[nearestStreet.street]!.width;
              const start: [number, number] = [anchor[0] + ux * (streetWidth / 2 - 0.4), anchor[1] + uz * (streetWidth / 2 - 0.4)];
              const end: [number, number] = [fit.cx - ux * (hd - 1), fit.cz - uz * (hd - 1)];
              const surface: CityDriveway["surface"] = cls === "farmhouse" || cls === "barn" || cls === "silo" || rules.gravelLanes ? "gravel" : "pavement";
              result.driveways.push({ points: [start, end], width: cls === "mansion" ? 3.2 : cls === "warehouse" ? 5 : 2.6, surface });
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
      cursor = s1;
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
    // Block interior left behind the deepest parcels: a rear building where the district works its
    // land hard (CBD back lots, industrial yards, old-town rear wings), otherwise a courtyard or
    // green that reads as a place rather than back yards.
    if (maxDepthUsed > 0) {
      const core = insetRingUniform(land, maxDepthUsed + 0.5);
      if (core.length >= 3 && polygonArea(core) > 120) {
        // The interior is only a parcel of its own where no frontage parcel (built or not) reaches it.
        const infill =
          (character === "cbd" || character === "industrial" || character === "waterfront" || character === "oldtown") &&
          fill >= 0.5 &&
          !blockParcels.some((other) => parcelsOverlap(other.polygon, core, 0.18));
        if (infill && result.lots.length < MAX_LOTS && placeInfill(ctx, result, core, bi, blockId, band, character, land)) continue;
        const type: CityPark["type"] = band === "core" ? "courtyard" : band === "mid" ? (parkJitter < 0.55 ? "courtyard" : "green") : "meadow";
        result.parks.push(parkFromRing(`court:${bi}`, type, core, parkJitter));
      }
    }
  }
  return result;
}

/**
 * A rear building inside a block's leftover interior: a back-lot slab downtown and on the
 * waterfront, a shed in an industrial estate, a rear wing in the old town — set back from the
 * frontage parcels, aligned with the block's longest side. Returns false when nothing fits.
 */
function placeInfill(
  ctx: FabricContext,
  result: FabricResult,
  core: Vec2[],
  bi: number,
  blockId: number,
  band: CityZoneBand,
  character: CityDistrictKind,
  land: Vec2[],
): boolean {
  const { rules } = ctx;
  const site = insetRingUniform(core, 2.5);
  if (site.length < 3 || polygonArea(site) < 300) return false;
  // Align with the block's longest edge so the rear building runs parallel to its streets.
  let ex = 1;
  let ez = 0;
  let longest = -1;
  for (let i = 0; i < land.length; i += 1) {
    const a = land[i]!;
    const b = land[(i + 1) % land.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > longest + 1e-9) {
      longest = len;
      ex = (b[0] - a[0]) / (len || 1);
      ez = (b[1] - a[1]) / (len || 1);
    }
  }
  const rotationY = Math.atan2(-ez, ex);
  const [cx, cz] = polygonCentroid(site);
  let minA = Infinity;
  let maxA = -Infinity;
  let minB = Infinity;
  let maxB = -Infinity;
  for (const [px, pz] of site) {
    const a = (px - cx) * ex + (pz - cz) * ez;
    const b = -(px - cx) * ez + (pz - cz) * ex;
    minA = Math.min(minA, a);
    maxA = Math.max(maxA, a);
    minB = Math.min(minB, b);
    maxB = Math.max(maxB, b);
  }
  const fit = fitRectInPolygon(site, cx, cz, (maxA - minA) * 0.92, (maxB - minB) * 0.92, rotationY, 0.3);
  if (fit === null || fit.w < 8 || fit.d < 8 || !rectClearOfStreets(ctx.index, fit, rotationY)) return false;
  if (ctx.slopeAt !== null && ctx.slopeAt(fit.cx, fit.cz) > rules.maxSlope) return false;
  if (ctx.heightAt !== null && ctx.heightAt(fit.cx, fit.cz) < rules.minElevation) return false;
  const candidate: PlacedLot = { x: fit.cx, z: fit.cz, hw: fit.w / 2, hd: fit.d / 2, angle: rotationY };
  if (result.placed.overlapsAny(candidate, 1.5)) return false;
  const near = ctx.index.nearest(fit.cx, fit.cz, ctx.streets.length);
  if (near === null) return false;
  result.placed.add(candidate);
  const cls: CityLotClass = character === "industrial" ? "warehouse" : character === "oldtown" ? "rowhouse" : "slab";
  const rng = ctx.streams(`infill:${bi}`);
  const placement = rollClassPlacement(cls, rng, 1, rules.floorsMin, rules.floorsMax, 0, 0, 1, ctx.field.intensity(fit.cx, fit.cz) * 0.8);
  const template = pickLotTemplate(cls, fit.w, fit.d, placement.floors, rng());
  const parcelId = `parcel:${bi}:interior`;
  result.parcels.push({ id: parcelId, block: blockId, polygon: core, buildable: site, frontage: [], area: polygonArea(core), depth: maxB - minB, isCorner: false, kind: "built" });
  result.lots.push({
    id: `lot:${bi}:${result.lots.length}`,
    center: [fit.cx, fit.cz],
    size: [fit.w, fit.d],
    rotationY,
    floors: placement.floors,
    jitter: rng(),
    cls,
    zone: band,
    anchor: [near.x, near.z],
    pieces: buildLotPieces(cls, fit.w, fit.d, placement.floors, rules.floorHeight, rng, template),
    template,
    parcel: parcelId,
  });
  return true;
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

/** Ids of the through-streets carrying a lap's graph edges, in lap order and without repeats. */
function lapStreetIds(network: StreetNetwork, edges: readonly number[], streetCount: number): string[] {
  const pairKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const owner = new Map<string, number>();
  for (let index = 0; index < Math.min(network.streets.length, streetCount); index += 1) {
    const nodes = network.streets[index]!.nodes;
    for (let i = 0; i + 1 < nodes.length; i += 1) owner.set(pairKey(nodes[i]!, nodes[i + 1]!), index);
  }
  const byId = new Map(network.edges.map((edge) => [edge.id, edge] as const));
  const ids: string[] = [];
  const seen = new Set<number>();
  for (const id of edges) {
    const edge = byId.get(id);
    if (edge === undefined) continue;
    const index = owner.get(pairKey(edge.a, edge.b));
    if (index === undefined || seen.has(index)) continue;
    seen.add(index);
    ids.push(`street:${index}`);
  }
  return ids;
}

/** Rotate and translate a volume-local circuit route into the world frame the rest of the plan uses. */
function raceToWorld(
  route: CircuitRoute,
  streets: readonly string[],
  seals: boolean,
  toWorld: (x: number, z: number) => RoadPoint,
  rotationY: number,
): ResolvedRace {
  // `toWorld` rotates a local direction BY `rotationY`, so a heading turns with it rather than against.
  const heading = (local: number): number => local + rotationY;
  // A checkpoint is an AABB with no yaw of its own; grow it to the bounds of the rotated gate.
  const gateX = Math.abs(Math.cos(rotationY));
  const gateZ = Math.abs(Math.sin(rotationY));
  const [sx, sz] = toWorld(route.start.x, route.start.z);
  return {
    centerline: route.centerline.map(([x, z]) => toWorld(x, z)),
    widths: [...route.widths],
    ...(route.heights === undefined ? {} : { heights: [...route.heights] }),
    length: route.length,
    streets,
    seals: seals
      ? route.seals.slice(0, MAX_RACE_SEALS).map((seal) => {
          const [x, z] = toWorld(seal.x, seal.z);
          return { x, z, heading: heading(seal.heading), width: seal.width, kind: seal.kind };
        })
      : [],
    chicanes: route.chicanes.map((chicane) => ({
      entry: chicane.entry,
      exit: chicane.exit,
      barriers: chicane.barriers.map((barrier) => {
        const [x, z] = toWorld(barrier.x, barrier.z);
        return { x, z, heading: heading(barrier.heading), width: barrier.width, kind: barrier.kind };
      }),
    })),
    corners: route.corners.map((corner) => ({ ...corner })),
    kerbs: circuitKerbs(route)
      .slice(0, MAX_RACE_KERBS)
      .map((kerb) => ({
        points: kerb.points.map(([x, z]) => toWorld(x, z)),
        width: kerb.width,
        side: kerb.side,
        stripe: kerb.stripe,
        corner: kerb.corner,
      })),
    checkpoints: route.checkpoints.map((gate) => {
      const [x, z] = toWorld(gate.center[0], gate.center[2]);
      return {
        id: gate.id,
        center: [x, gate.center[1], z] as const,
        half: [
          gate.half[0] * gateX + gate.half[2] * gateZ,
          gate.half[1],
          gate.half[0] * gateZ + gate.half[2] * gateX,
        ] as const,
      };
    }),
    laps: route.laps,
    start: {
      x: sx,
      z: sz,
      heading: heading(route.start.heading),
      line: [toWorld(route.start.line[0][0], route.start.line[0][1]), toWorld(route.start.line[1][0], route.start.line[1][1])],
      distance: route.start.distance,
      width: route.start.width,
    },
    grid: route.grid.map((slot) => {
      const [x, z] = toWorld(slot.x, slot.z);
      return { x, z, heading: heading(slot.heading) };
    }),
    sectors: [...route.sectors],
    tightestRadius: route.tightestRadius,
  };
}

/** The city generator's output family: a {@link ResolvedCity}. */
export const CITY_OUTPUT = "city";

/**
 * Where a district stands and what it reads from around it: the city generator's world input. A
 * placed `city` volume hands in its footprint, frame, the terrain and its sibling `cityzone` volumes
 * ({@link resolveCityObject}); without an input (the variant grid) a district grows 400 m square at the origin.
 */
export interface CityInput {
  /** World centre of the district. Default the origin. */
  center?: { x: number; y: number; z: number };
  /** Half-extents of the footprint (m). Default 200 each. */
  halfX?: number;
  halfZ?: number;
  /** Yaw of the district frame (radians). Default 0. */
  rotationY?: number;
  /** World ground height; lots respect the `maxSlope` cliff rule and streets bridge gaps and bore ridges over it. */
  sampleHeight?: ((x: number, z: number) => number) | undefined;
  /** Sibling `cityzone` volumes: lots inside one adopt its band and mix. */
  zoneOverrides?: readonly SceneKindObject[] | undefined;
  /**
   * Gameplay spots (world XZ discs) the district keeps clear — spawns, mines, objectives. No
   * building, tree or parked vehicle covers one. {@link resolveCityObject} derives them from the
   * document's clearance-tagged markers and volumes.
   */
  keepOut?: readonly { x: number; z: number; radius: number }[] | undefined;
}

/** The default district footprint half-extent (m) when the input names none. */
const DEFAULT_CITY_HALF_EXTENT = 200;

/**
 * Synthesize the deterministic city plan: streets → bridges → parks → zoned frontage lots with
 * massing pieces → furniture, all in the district's local frame and then rotated/translated into
 * world space. Every random draw comes from the injected seed.
 */
function generateCity(rules: CityRules, context: GeneratorContext<CityInput>): ResolvedCity {
  const input = context.input ?? {};
  const center = input.center ?? { x: 0, y: 0, z: 0 };
  const hx = input.halfX ?? DEFAULT_CITY_HALF_EXTENT;
  const hz = input.halfZ ?? DEFAULT_CITY_HALF_EXTENT;
  const rotationY = input.rotationY ?? 0;
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
    vehicles: [],
    signals: [],
  };
  // A footprint only a few blocks across is a hamlet: one or two lanes, not a street lattice.
  const village = rules.fabric && (4 * hx * hz) / Math.max(1, rules.blockSize * rules.blockSize) < VILLAGE_MAX_CELLS;
  const minHalf = village ? Math.max(8, rules.streetWidth * 2) : rules.blockSize * 0.75;
  if (hx < minHalf || hz < minHalf) return empty;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const toWorld = (x: number, z: number): RoadPoint => [center.x + x * cos + z * sin, center.z - x * sin + z * cos];
  const toLocal = (wx: number, wz: number): Vec2 => {
    const dx = wx - center.x;
    const dz = wz - center.z;
    return [dx * cos - dz * sin, dx * sin + dz * cos];
  };

  const sampleHeight = input.sampleHeight;
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
  const overrides = (input.zoneOverrides ?? []).filter((volume) => volume.kind === CITY_ZONE_KIND);
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
            return { band: params.band, mix: params.mix.length > 0 ? params.mix : null };
          }
          return null;
        };

  const streams = seededStreams(`city:${context.seed}`);
  // The unified path-network engine grows the whole road/track graph from the sliders — a city street
  // net and a closed race circuit are the SAME generator at opposite slider extremes. It shares this
  // district's seed, and reads the ground through the district frame.
  const streetParams: StreetNetworkParams = {
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
    sidewalkWidth: rules.sidewalkWidth,
    elevation: rules.elevation,
    maxGrade: rules.maxGrade,
    compactness: rules.compactness,
    halfX: hx,
    halfZ: hz,
    bridges: rules.bridges,
    tunnels: rules.tunnels,
    minElevation: rules.minElevation,
    tunnelClearance: CITY_TUNNEL_CLEARANCE,
    seed: context.seed,
  };
  const villagePlan = village
    ? villageLanes({ halfX: hx, halfZ: hz, width: rules.streetWidth, curviness: rules.curviness, branching: rules.branching, rng: streams("village") })
    : null;
  const network = villagePlan?.network ?? STREET_NETWORK_GENERATOR.generate(streetParams, { ...context, input: { heightAt: heightAt ?? undefined } });
  // Resolve each generated street's surface + sidewalk from its hierarchy level.
  const surfaceFor = (level: StreetLevel): CityStreet["surface"] =>
    rules.surface === "gravel" || (level === "lane" && rules.gravelLanes) ? "gravel" : "asphalt";
  const local: LocalStreet[] = network.streets.slice(0, MAX_STREETS).map((street: Street) => {
    const surface = surfaceFor(street.level);
    return {
      points: street.points.map(([x, z]) => [x, z] as [number, number]),
      width: street.width,
      level: street.level,
      surface,
      sidewalk: rules.sidewalks && surface === "asphalt",
      ...(street.heights === undefined ? {} : { heights: [...street.heights] }),
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
  // The race is a SECTION OF THIS CITY blocked off: the same streets the district already grew,
  // with a closed lap lifted out of them. A district with no drivable cycle simply has no race.
  const route = rules.race
    ? extractCircuitRoute(
        network,
        parseParams(CIRCUIT_ROUTE_SCHEMA, {
          lapLength: rules.raceLapLength,
          arterialBias: rules.raceArterial,
          minCornerRadius: rules.raceCornerRadius,
          checkpoints: rules.raceCheckpoints,
          laps: rules.raceLaps,
          gridSlots: rules.raceGridSlots,
        }),
        context,
      )
    : null;
  // Fabric (block/parcel/building subdivision) is optional: a bare road or race track leaves it off,
  // so a circuit never carries forced-on plots — parcels and buildings appear only when you want it.
  const emptyFabric: FabricResult = { blocks: [], parcels: [], parks: [], lots: [], placed: new LotIndex(), hedges: [], driveways: [] };
  const field = cityDistrictField({ halfX: hx, halfZ: hz, blockSize: rules.blockSize, profile: rules.profile, coreExtent: rules.coreExtent, midExtent: rules.midExtent, rng: streams, primary: villagePlan?.hub });
  const keepOut = (input.keepOut ?? []).map((spot) => {
    const [x, z] = toLocal(spot.x, spot.z);
    return { x, z, radius: spot.radius };
  });
  const green = villagePlan === null ? null : villageGreen(villagePlan, { halfX: hx, halfZ: hz, width: rules.streetWidth, rng: streams("green") });
  const lotResult = rules.fabric
    ? buildFabric({
        rules,
        streams,
        streets: local,
        graph: network,
        surfaceFor,
        index,
        slopeAt,
        heightAt,
        overrideAt,
        junctions: intersections,
        field,
        halfX: hx,
        halfZ: hz,
        keepOut,
        green,
        hub: villagePlan?.hub ?? null,
      })
    : emptyFabric;
  if (green !== null) {
    const bounds = ringBounds(green);
    lotResult.parks.push({
      id: "park:green",
      center: [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2],
      size: [bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ],
      type: "green",
      jitter: streams("green-park")(),
      polygon: green,
    });
  }
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

  // Parked vehicles: curbside anchors come from the shared street helper, pad stalls from the
  // pads laid above. Every candidate clears other streets, footprints, and the cars already parked.
  const vehicles: { x: number; z: number; rotationY: number; kind: CityVehicleKind; paint: number; stall: CityVehicle["stall"] }[] = [];
  if (rules.parkedCars > 0) {
    const carRng = streams("vehicles");
    const carIndex = new LotIndex();
    const park = (x: number, z: number, heading: number, mix: number, stall: CityVehicle["stall"], street: number): void => {
      const kind: CityVehicleKind = mix < 0.68 ? "car" : mix < 0.9 ? "van" : "truck";
      const half = VEHICLE_HALF_EXTENTS[kind];
      const rect: PlacedLot = { x, z, hw: half[0], hd: half[1], angle: heading };
      if (!insideBounds(x, z)) return;
      if (index.clearance(x, z, stall === "curb" ? 0.6 : 0.5, street) < 0) return;
      if (lotResult.placed.overlapsAny(rect, 0.4)) return;
      if (carIndex.overlapsAny(rect, 0.35)) return;
      carIndex.add(rect);
      vehicles.push({ x, z, rotationY: heading, kind, paint: Math.floor(mix * 9973) % VEHICLE_PAINT_COUNT, stall });
    };
    const spacing = Math.max(7, 26 - 19 * rules.parkedCars);
    for (let si = 0; si < local.length && vehicles.length < MAX_VEHICLES; si += 1) {
      const street = local[si]!;
      // Gravel shoulders and narrow lanes have no curb lane: `parkingSpots` would seat the body
      // over the centreline of anything under ~6.5 m.
      if (street.surface === "gravel" || street.width < 6.5) continue;
      for (const spot of parkingSpots(asDescriptor(street), { spacing })) {
        if (vehicles.length >= MAX_VEHICLES) break;
        const mix = carRng();
        if (carRng() > rules.parkedCars) continue;
        const [x, z] = spot.position;
        if (nearIntersection(x, z, 4)) continue;
        park(x, z, spot.heading, mix, "curb", si);
      }
    }
    for (const pad of parking) {
      if (vehicles.length >= MAX_VEHICLES) break;
      const ca = Math.cos(pad.rotationY);
      const sa = Math.sin(pad.rotationY);
      const rows = pad.size[1] >= 11 ? 2 : 1;
      const stalls = Math.max(1, Math.floor(pad.size[0] / 2.9));
      for (let row = 0; row < rows; row += 1) {
        const lz = rows === 1 ? 0 : (row === 0 ? -1 : 1) * pad.size[1] * 0.25;
        for (let s = 0; s < stalls; s += 1) {
          if (vehicles.length >= MAX_VEHICLES) break;
          const mix = carRng();
          if (carRng() > rules.parkedCars * 0.92) continue;
          const lx = ((s + 0.5) / stalls - 0.5) * pad.size[0];
          // Facing rows nose in on the aisle between them.
          park(pad.center[0] + lx * ca + lz * sa, pad.center[1] - lx * sa + lz * ca, pad.rotationY + row * Math.PI, mix, "lot", -1);
        }
      }
    }
  }
  // Junction control, one device per approach arm: arterial crossings get a signal on a mast arm,
  // everything above lane level gets a sign post instead.
  const signals: { x: number; z: number; heading: number; kind: CitySignal["kind"]; reach: number }[] = [];
  if (rules.signals > 0) {
    const signalRng = streams("signals");
    for (const cross of intersections) {
      if (signals.length >= MAX_SIGNALS) break;
      if (cross.arms.length < 3 || cross.level === "lane") continue;
      const arterial = LEVEL_RANK[cross.level] >= LEVEL_RANK.avenue;
      if (signalRng() > rules.signals * (arterial ? 1 : 0.75)) continue;
      for (const arm of cross.arms) {
        if (signals.length >= MAX_SIGNALS) break;
        const dir: readonly [number, number] = [Math.sin(arm.angle), Math.cos(arm.angle)];
        // Right-hand traffic: the pole stands on the near-right corner of the approach.
        const perp: readonly [number, number] = [-dir[1], dir[0]];
        const out = cross.radius + 1.8;
        const side = arm.width / 2 + 1;
        const x = cross.x + dir[0] * out + perp[0] * side;
        const z = cross.z + dir[1] * out + perp[1] * side;
        if (!insideBounds(x, z)) continue;
        if (index.clearance(x, z, 0.3) < 0) continue;
        signals.push({ x, z, heading: arm.angle, kind: arterial ? "signal" : "sign", reach: arm.width / 2 + 0.6 });
      }
    }
  }

  return {
    center: [center.x, center.y, center.z],
    size: [hx * 2, hz * 2],
    rotationY,
    rules,
    network,
    streets: local.map((street, i) => ({
      id: `street:${i}`,
      points: street.points.map(([x, z]) => toWorld(x, z)),
      width: street.width,
      level: street.level,
      surface: street.surface,
      sidewalk: street.sidewalk,
      ...(street.heights === undefined ? {} : { heights: [...street.heights] }),
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
      band: block.band,
      district: block.district,
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
      seed: `${context.seed}/${lot.id}`,
      center: toWorld(lot.center[0], lot.center[1]),
      size: lot.size,
      rotationY: lot.rotationY - rotationY,
      floors: lot.floors,
      jitter: lot.jitter,
      class: lot.cls,
      zone: lot.zone,
      anchor: toWorld(lot.anchor[0], lot.anchor[1]),
      pieces: lot.pieces,
      template: lot.template,
      parcel: lot.parcel,
      ...(lot.landmark === undefined ? {} : { landmark: lot.landmark }),
    })),
    parks: parks.map((park) => ({
      id: park.id,
      center: toWorld(park.center[0], park.center[1]),
      size: park.size,
      // Never -0: a stored plan must read back identical.
      rotationY: rotationY === 0 ? 0 : -rotationY,
      type: park.type,
      jitter: park.jitter,
      ...(park.polygon === undefined ? {} : { polygon: park.polygon.map(([x, z]) => toWorld(x, z)) }),
      ...(park.rows === undefined ? {} : { rows: park.rows.map((row) => row.map(([x, z]) => toWorld(x, z))) }),
      ...(park.paths === undefined ? {} : { paths: park.paths.map((path) => path.map(([x, z]) => toWorld(x, z))) }),
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
    vehicles: vehicles.map((vehicle) => {
      const [x, z] = toWorld(vehicle.x, vehicle.z);
      return { x, z, rotationY: vehicle.rotationY + rotationY, kind: vehicle.kind, paint: vehicle.paint, stall: vehicle.stall };
    }),
    signals: signals.map((signal) => {
      const [x, z] = toWorld(signal.x, signal.z);
      return { x, z, heading: signal.heading + rotationY, kind: signal.kind, reach: signal.reach };
    }),
    ...(route === null
      ? {}
      : { race: raceToWorld(route, lapStreetIds(network, route.edges, local.length), rules.raceSeals, toWorld, rotationY) }),
  };
}

/**
 * The city generator: a whole district (street network, blocks, parcels, zoned lots with massing
 * pieces, parks and street furniture, and with `race` on a sealed-off lap through its own streets)
 * from the {@link CITY_SCHEMA} params and one injected seed. Same params, seed and {@link CityInput}
 * always give the identical plain-data plan.
 *
 * @capability city-district editor-authorable procedural city district (streets, zoning, buildings, furniture)
 */
export const CITY_GENERATOR = defineGenerator({
  id: "city",
  label: "City / track",
  output: CITY_OUTPUT,
  schema: CITY_SCHEMA,
  generate(params, context: GeneratorContext<CityInput>): ResolvedCity {
    return generateCity(cityRules(params), context);
  },
});

/**
 * The `city` kind's resolve: run {@link CITY_GENERATOR} for one placed volume, with its footprint,
 * frame, the ground sampler and its sibling `cityzone` volumes as the input, and its id as the seed
 * when `meta.seed` is empty. Returns null without a usable footprint.
 *
 * @capability city-district resolve a `city` volume into deterministic streets, zoned lots, parks, and furniture
 */
export function resolveCityObject(object: SceneKindObject, context?: CityResolveContext): ResolvedCity | null {
  const center = object.center ?? object.position;
  if (center === undefined) return null;
  const keepOut = context?.clearings ?? (context?.objects === undefined ? [] : cityClearings(context.objects));
  const input: CityInput = {
    center,
    halfX: axisValue(object.halfExtents?.x) ?? object.radius ?? 0,
    halfZ: axisValue(object.halfExtents?.z) ?? object.radius ?? 0,
    rotationY: object.rotationY ?? 0,
    sampleHeight: context?.sampleHeight,
    zoneOverrides: context?.zoneOverrides ?? context?.objects,
    ...(keepOut.length === 0 ? {} : { keepOut }),
  };
  return runGenerator(CITY_GENERATOR, object.meta, { fallbackSeed: object.id, input });
}

/**
 * Registers the street, race circuit and city generators and the `city` + `cityzone` scene kinds
 * (schema + resolver). Called by {@link registerBuiltinSceneKinds}. @internal
 */
export function registerCityKind(): void {
  registerGenerator(STREET_NETWORK_GENERATOR);
  registerGenerator(RACE_CIRCUIT_GENERATOR);
  registerGenerator(CITY_GENERATOR);
  registerSceneKind<ResolvedCity | null>({
    kind: CITY_KIND,
    generator: CITY_GENERATOR.id,
    target: "volume",
    label: "City / track",
    addCategory: "Studios",
    accent: "#8fa8c9",
    schema: CITY_SCHEMA,
    coverage: { spec: "city", densityKey: "roadsideOccupancy" },
    resolve: (object, _params, context) => resolveCityObject(object, context),
    solids: (resolved, _object, params, context) =>
      resolved === null || params["solid"] === false ? [] : citySolids(resolved, context.sampleHeight),
    note: (object) => {
      const resolved = resolveCityObject(object);
      if (resolved === null) return "Give the volume a box footprint.";
      if (resolved.streets.length === 0) return `Footprint too small — needs at least ${Math.ceil(resolved.rules.blockSize * 1.5)} m across.`;
      const mode = resolved.network?.mode ?? "net";
      const feats = [
        resolved.bridges.length > 0 ? `${resolved.bridges.length} bridges` : "",
        resolved.tunnels.length > 0 ? `${resolved.tunnels.length} tunnels` : "",
        resolved.rules.race
          ? resolved.race === undefined
            ? "no raceable lap in these streets"
            : `${Math.round(resolved.race.length)} m lap · ${resolved.race.seals.length} seals`
          : "",
      ].filter((s) => s.length > 0);
      const head = mode === "circuit" ? `circuit · ${resolved.streets.length} streets` : `${resolved.streets.length} streets`;
      // Shared clamp-and-warn: when the block/parcel pipeline hits the building budget, surface it in
      // the same "capped at N (budget)" wording grass and scatter use.
      const buildingCap = resolved.rules.fabric ? budgetWarning(placedCoverage("city", 0, resolved.lots.length)) : "";
      const fabric = resolved.rules.fabric ? ` · ${resolved.lots.length} buildings${buildingCap} · ${resolved.parks.length} parks` : " · no fabric";
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
      return `Pins the "${params.band}" band${params.mix.length > 0 ? " with a custom mix" : ""} inside any city district it overlaps.`;
    },
  });
}
