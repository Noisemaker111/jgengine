/**
 * One street-and-lot layout for a city: lane width and count, parking lanes, sidewalk width, kerb
 * height, and per-zone setback, lot frontage, depth, spacing, driveways and building heights. Defaults
 * are a US city (3.5 m lanes, 2.5 m sidewalks, 15 cm kerbs, buildings 0-6 m back from the sidewalk by
 * zone). A game sets its numbers in one {@link createCityLayout} block, builds roads with
 * {@link cityRoad} and lots with {@link cityLots}, and {@link tuneCityLayout} turns every number into a
 * live dev-runner slider that re-lays the city while dragged.
 *
 * @capability city-layout one street, sidewalk, kerb and lot layout with real-world defaults and live sliders
 */
import { tunable } from "@jgengine/core/devtools/devtools";
import { seededStreams } from "@jgengine/core/random/rng";
import { deriveBuildingLots, type LotArea, type PlacedBuildingLot, type RoadFrontage } from "@jgengine/core/buildings/buildingLots";
import { rectsSeparated, type OrientedRect } from "@jgengine/core/world/polygon";
import { road, type LiveRoadSource, type RoadEnvironmentConfig, type RoadEnvironmentDescriptor } from "@jgengine/core/world/features";
import type { Vec2 } from "@jgengine/core/world/geometry";

export type CityRoadClass = "avenue" | "street";

export type CityZone = "core" | "commercial" | "residential" | "industrial";

export const CITY_ZONES: readonly CityZone[] = ["core", "commercial", "residential", "industrial"];

/** One zone's lots and buildings. Lengths are metres. */
export interface CityZoneLayout {
  setback: number;
  frontage: number;
  depth: number;
  spacing: number;
  minFloors: number;
  maxFloors: number;
  driveways: boolean;
}

/** A whole city's layout. Lengths are metres. */
export interface CityLayout {
  laneWidth: number;
  avenueLanes: number;
  streetLanes: number;
  avenueParking: number;
  streetParking: number;
  sidewalkWidth: number;
  kerbHeight: number;
  cornerClearance: number;
  drivewayWidth: number;
  /** Floor-to-floor height used for building heights. */
  storyHeight: number;
  zones: Record<CityZone, CityZoneLayout>;
}

export type CityLayoutPatch = Partial<Omit<CityLayout, "zones">> & {
  zones?: Partial<Record<CityZone, Partial<CityZoneLayout>>>;
};

/** US city defaults: 3.5 m lanes, 2.5 m sidewalks, 15 cm kerbs, zone setbacks 0 / 1.5 / 6 / 4 m. */
export const US_CITY_LAYOUT: CityLayout = {
  laneWidth: 3.5,
  avenueLanes: 4,
  streetLanes: 2,
  avenueParking: 0,
  streetParking: 2.4,
  sidewalkWidth: 2.5,
  kerbHeight: 0.15,
  cornerClearance: 3,
  drivewayWidth: 3,
  storyHeight: 3.4,
  zones: {
    core: { setback: 0, frontage: 26, depth: 24, spacing: 0, minFloors: 6, maxFloors: 24, driveways: false },
    commercial: { setback: 1.5, frontage: 18, depth: 18, spacing: 1, minFloors: 2, maxFloors: 5, driveways: false },
    residential: { setback: 6, frontage: 11, depth: 13, spacing: 4, minFloors: 1, maxFloors: 2, driveways: true },
    industrial: { setback: 4, frontage: 28, depth: 24, spacing: 6, minFloors: 1, maxFloors: 2, driveways: true },
  },
};

const NUMBER_RANGES: Record<Exclude<keyof CityLayout, "zones">, readonly [number, number, number]> = {
  laneWidth: [2.7, 4.5, 0.05],
  avenueLanes: [2, 8, 1],
  streetLanes: [1, 4, 1],
  avenueParking: [0, 3, 0.1],
  streetParking: [0, 3, 0.1],
  sidewalkWidth: [1.2, 8, 0.1],
  kerbHeight: [0, 0.3, 0.01],
  cornerClearance: [0, 15, 0.5],
  drivewayWidth: [2.4, 6, 0.1],
  storyHeight: [2.8, 5, 0.1],
};

const ZONE_RANGES: Record<Exclude<keyof CityZoneLayout, "driveways">, readonly [number, number, number]> = {
  setback: [0, 15, 0.25],
  frontage: [6, 60, 0.5],
  depth: [6, 60, 0.5],
  spacing: [0, 15, 0.25],
  minFloors: [1, 60, 1],
  maxFloors: [1, 80, 1],
};

function clampNumber(value: unknown, fallback: number, [min, max]: readonly [number, number, number]): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function resolveCityLayout(patch: CityLayoutPatch = {}, base: CityLayout = US_CITY_LAYOUT): CityLayout {
  const next = { ...base, zones: { ...base.zones } } as CityLayout;
  for (const key of Object.keys(NUMBER_RANGES) as (keyof typeof NUMBER_RANGES)[]) {
    next[key] = clampNumber(patch[key], base[key], NUMBER_RANGES[key]);
  }
  next.avenueLanes = Math.round(next.avenueLanes);
  next.streetLanes = Math.round(next.streetLanes);
  for (const zone of CITY_ZONES) {
    const from = base.zones[zone];
    const over = patch.zones?.[zone] ?? {};
    const resolved: CityZoneLayout = { ...from, driveways: typeof over.driveways === "boolean" ? over.driveways : from.driveways };
    for (const key of Object.keys(ZONE_RANGES) as (keyof typeof ZONE_RANGES)[]) {
      resolved[key] = clampNumber(over[key], from[key], ZONE_RANGES[key]);
    }
    resolved.minFloors = Math.round(resolved.minFloors);
    resolved.maxFloors = Math.max(resolved.minFloors, Math.round(resolved.maxFloors));
    next.zones[zone] = resolved;
  }
  return next;
}

export interface CityLayoutStore {
  /** The current layout. Do not mutate it; `set` a patch instead. */
  get(): CityLayout;
  set(patch: CityLayoutPatch): void;
  subscribe(listener: (layout: CityLayout) => void): () => void;
  snapshot(): CityLayout;
  restore(next: CityLayout): void;
  reset(): void;
}

function sameLayout(a: CityLayout, b: CityLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** @capability city-layout-store a city layout a game sets once and sliders change live */
export function createCityLayout(patch: CityLayoutPatch = {}): CityLayoutStore {
  const initial = resolveCityLayout(patch);
  let current = initial;
  const listeners = new Set<(layout: CityLayout) => void>();
  const replace = (next: CityLayout): void => {
    if (sameLayout(next, current)) return;
    current = next;
    for (const listener of [...listeners]) listener(current);
  };
  return {
    get: () => current,
    set: (next) => replace(resolveCityLayout(next, current)),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => resolveCityLayout({}, current),
    restore: (next) => replace(resolveCityLayout(next, US_CITY_LAYOUT)),
    reset: () => replace(initial),
  };
}

export function cityLaneCount(layout: CityLayout, roadClass: CityRoadClass): number {
  return roadClass === "avenue" ? layout.avenueLanes : layout.streetLanes;
}

export function cityRoadWidth(layout: CityLayout, roadClass: CityRoadClass): number {
  const parking = roadClass === "avenue" ? layout.avenueParking : layout.streetParking;
  return cityLaneCount(layout, roadClass) * layout.laneWidth + parking * 2;
}

export function cityLaneOffsets(layout: CityLayout, roadClass: CityRoadClass): readonly number[] {
  const lanes = cityLaneCount(layout, roadClass);
  const half = lanes / 2;
  const offsets: number[] = [];
  for (let index = 0; index < lanes; index += 1) offsets.push((index - half + 0.5) * layout.laneWidth);
  return offsets;
}

export interface CityRoadSpec extends Omit<RoadEnvironmentConfig, "width"> {
  roadClass: CityRoadClass;
}

export function cityRoad(layout: CityLayout, spec: CityRoadSpec): RoadEnvironmentDescriptor {
  const { roadClass, sidewalk, ...rest } = spec;
  return road({
    ...rest,
    width: cityRoadWidth(layout, roadClass),
    sidewalk:
      sidewalk === false
        ? false
        : { ...(sidewalk ?? {}), width: layout.sidewalkWidth, kerb: layout.kerbHeight },
  });
}

/**
 * Roads that follow a layout store: `current()` is rebuilt from `specs` whenever the layout changes,
 * so an `environment({ roadSource })` redraws streets as a slider moves.
 */
export function cityRoadSource(store: CityLayoutStore, specs: readonly CityRoadSpec[]): LiveRoadSource & {
  readonly initial: readonly RoadEnvironmentDescriptor[];
} {
  const build = (layout: CityLayout) => specs.map((spec) => cityRoad(layout, spec));
  const initial = build(store.get());
  let roads = initial;
  let built = store.get();
  return {
    initial,
    current() {
      const layout = store.get();
      if (layout !== built) {
        built = layout;
        roads = build(layout);
      }
      return roads;
    },
    subscribe: (listener) => store.subscribe(() => listener()),
  };
}

export interface CityLotRoad {
  path: readonly Vec2[];
  roadClass: CityRoadClass;
}

export interface CityLotOptions {
  roads: readonly CityLotRoad[];
  zoneAt: (x: number, z: number) => CityZone | null;
  /** Clip region lots must fall inside. */
  area?: LotArea;
  avoid?: readonly RoadFrontage[];
  seed?: string;
  maxLots?: number;
}

export interface CityLayoutDriveway {
  center: Vec2;
  rotationY: number;
  length: number;
  width: number;
}

export interface CityLayoutLot extends PlacedBuildingLot {
  zone: CityZone;
  floors: number;
  height: number;
  driveway?: CityLayoutDriveway;
}

/**
 * Lay a city's building lots from its layout. Each zone lines every road with its own frontage,
 * depth and side gap, set back past the sidewalk by its own setback; lots keep `cornerClearance`
 * from the roads they do not front, never touch asphalt or each other, and a zone with driveways
 * gets one per lot in the side gap. Deterministic for the same inputs and seed.
 * @capability city-lots lay zoned building lots, corners and driveways from one city layout
 */
export function cityLots(layout: CityLayout, options: CityLotOptions): CityLayoutLot[] {
  const maxLots = Math.max(0, Math.floor(options.maxLots ?? 400));
  const roads: RoadFrontage[] = options.roads.map((entry) => ({
    path: entry.path,
    width: cityRoadWidth(layout, entry.roadClass),
    sidewalk: layout.sidewalkWidth,
  }));
  const accepted: OrientedRect[] = [];
  const lots: CityLayoutLot[] = [];
  const streams = seededStreams(`city-lots:${options.seed ?? ""}`);
  for (const zone of CITY_ZONES) {
    const params = layout.zones[zone];
    const spacing = params.driveways ? Math.max(params.spacing, layout.drivewayWidth + 1) : params.spacing;
    const placed = deriveBuildingLots({
      roads,
      footprint: { w: params.frontage, d: params.depth },
      spacing,
      setback: params.setback,
      crossClearance: layout.cornerClearance,
      ...(options.avoid === undefined ? {} : { avoid: options.avoid }),
      ...(options.area === undefined ? {} : { area: options.area }),
      seed: `${options.seed ?? ""}:${zone}`,
      maxLots,
    });
    const floorsRoll = streams(`floors:${zone}`);
    for (const lot of placed) {
      if (lots.length >= maxLots) break;
      if (options.zoneAt(lot.center[0], lot.center[1]) !== zone) continue;
      const rect: OrientedRect = { x: lot.center[0], z: lot.center[1], hw: lot.footprint.w / 2, hd: lot.footprint.d / 2, angle: lot.rotationY };
      if (accepted.some((other) => !rectsSeparated(rect, other))) continue;
      accepted.push(rect);
      const span = params.maxFloors - params.minFloors;
      const floors = params.minFloors + Math.min(span, Math.floor(floorsRoll() * (span + 1)));
      const entry: CityLayoutLot = { ...lot, zone, floors, height: floors * layout.storyHeight };
      if (params.driveways) entry.driveway = drivewayFor(lot, layout, params);
      lots.push(entry);
    }
  }
  return lots;
}

function drivewayFor(lot: PlacedBuildingLot, layout: CityLayout, zone: CityZoneLayout): CityLayoutDriveway {
  const length = Math.max(0.5, layout.sidewalkWidth + zone.setback);
  const toRoad: Vec2 = [Math.sin(lot.rotationY), Math.cos(lot.rotationY)];
  const along: Vec2 = [toRoad[1], -toRoad[0]];
  const sideOffset = lot.footprint.w / 2 + layout.drivewayWidth / 2 + 0.5;
  const front = lot.footprint.d / 2;
  return {
    center: [
      lot.center[0] + along[0] * sideOffset + toRoad[0] * (front + length / 2),
      lot.center[1] + along[1] * sideOffset + toRoad[1] * (front + length / 2),
    ],
    rotationY: lot.rotationY,
    length,
    width: layout.drivewayWidth,
  };
}

export interface TuneCityLayoutOptions {
  group?: string;
}

/**
 * Register a devtools slider for every number in the layout (and a toggle per zone's driveways);
 * dragging one sets the store, which re-lays whatever listens to it. Registering again keeps the
 * values already dragged, so a hot reload does not snap the sliders back.
 * @capability city-layout-sliders live dev-runner sliders for every city layout number
 */
export function tuneCityLayout(store: CityLayoutStore, options: TuneCityLayoutOptions = {}): void {
  const group = options.group ?? "city";
  const start = store.get();
  for (const key of Object.keys(NUMBER_RANGES) as (keyof typeof NUMBER_RANGES)[]) {
    const [min, max, step] = NUMBER_RANGES[key];
    const control = tunable(`${group}/${key}`, start[key], {
      min,
      max,
      step,
      group,
      label: key,
      onChange: (value) => store.set({ [key]: value }),
    });
    if (control.value !== start[key]) store.set({ [key]: control.value });
  }
  for (const zone of CITY_ZONES) {
    const zoneGroup = `${group} ${zone}`;
    for (const key of Object.keys(ZONE_RANGES) as (keyof typeof ZONE_RANGES)[]) {
      const [min, max, step] = ZONE_RANGES[key];
      const control = tunable(`${group}/${zone}.${key}`, start.zones[zone][key], {
        min,
        max,
        step,
        group: zoneGroup,
        label: key,
        onChange: (value) => store.set({ zones: { [zone]: { [key]: value } } }),
      });
      if (control.value !== start.zones[zone][key]) store.set({ zones: { [zone]: { [key]: control.value } } });
    }
    const driveways = tunable(`${group}/${zone}.driveways`, start.zones[zone].driveways, {
      group: zoneGroup,
      label: "driveways",
      onChange: (value) => store.set({ zones: { [zone]: { driveways: value } } }),
    });
    if (driveways.value !== start.zones[zone].driveways) store.set({ zones: { [zone]: { driveways: driveways.value } } });
  }
}
