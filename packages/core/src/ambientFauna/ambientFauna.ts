import { createFlockStepper, type FlockBuffers, type FlockConfig, type FlockStepper } from "../ai/flock";
import { createMotionTrack, type MotionTrack } from "../movement/motionTrack";
import { seededRng } from "../random/rng";
import { discRegion, rectRegion, samplePoint, type SampleRegion } from "../world/spatialSample";
import type { Vec3 } from "../world/geometry";

/** How a group moves: `school` in water below its surface, `swarm` and `drift` around plants, `soar` on a loop over its area. */
export type FaunaMotion = "school" | "swarm" | "drift" | "soar";

/** Ground footprint of a group on X and Z, in metres. */
export type FaunaArea =
  | { shape: "disc"; x: number; z: number; radius: number }
  | { shape: "box"; x: number; z: number; halfX: number; halfZ: number };

/**
 * When a group is out. The sun height is -1 (deep night) to 1 (noon); the group fades in over `fade`
 * above `sunMin` and out over `fade` below `sunMax`. No sun in the scene leaves the group out.
 */
export interface FaunaWindow {
  sunMin?: number;
  sunMax?: number;
  /** Sun-height span of the fade. Default 0.08. */
  fade?: number;
}

/** One ambient group as data; the game supplies every species and number. */
export interface FaunaGroup {
  id: string;
  /** Key into the game's species table. */
  species: string;
  motion: FaunaMotion;
  area: FaunaArea;
  seed?: string | number;
  /** Agents; wins over `density`. */
  count?: number;
  /** Agents per 1000 m² of footprint. */
  density?: number;
  window?: FaunaWindow;
  /**
   * Metres. `school`: depth below the water surface (default 0.3 to 3). `swarm` and `drift`: height
   * above the ground (default 0.4 to 3). `soar`: altitude above the ground (default 40 to 70).
   */
  band?: { min?: number; max?: number };
  /** Water surface height for a school, when the world gives none. */
  surface?: number;
  /** Top speed in m/s. Default 2.5 for a school, 1.2 for a swarm, 0.6 for drift, 12 for a soarer. */
  speed?: number;
  /** Flock steering overrides for `school` and `swarm`. */
  steering?: Partial<FlockConfig>;
  /** How far a `swarm` or `drift` agent wanders from the plant it keeps to. Default 3. */
  wander?: number;
  /** Most agents drawn at once. Default every agent. */
  budget?: number;
  /** Distances in metres: a model up to `near`, a sprite to `far`, nothing beyond. Default 40 and 120. */
  lod?: { near: number; far: number };
}

/** What the world gives fauna to read. Everything is optional; groups degrade to their own numbers. */
export interface FaunaWorld {
  /** Water surface height at a point and time. */
  surfaceAt?(x: number, z: number, time: number): number;
  /** Ground height at a point; the seabed for a school. */
  groundAt?(x: number, z: number): number;
  /** True where a plant or grass grows, given the ground height there; swarms and drift spawn only there. */
  plantAt?(x: number, z: number, groundY: number): boolean;
  /** Wind at a height: a `windField(...)` fits. */
  wind?: { atHeight(x: number, z: number, heightM: number, time: number): readonly [number, number] };
}

/** Limits and rates of one {@link createAmbientFauna}. */
export interface AmbientFaunaOptions {
  /** Most agents across every group; groups listed first fill it. Default 2000. */
  globalCap?: number;
  /** Groups farther than this from the focus (plus their size) are not simulated. Default 400. */
  simulateRange?: number;
}

/** Hard bound on one group's agents. */
export const FAUNA_GROUP_LIMIT = 4096;
/** Default of {@link AmbientFaunaOptions.globalCap}. */
export const FAUNA_GLOBAL_CAP = 2000;

const DEFAULT_BAND: Record<FaunaMotion, { min: number; max: number }> = {
  school: { min: 0.3, max: 3 },
  swarm: { min: 0.4, max: 3 },
  drift: { min: 0.4, max: 3 },
  soar: { min: 40, max: 70 },
};
const DEFAULT_SPEED: Record<FaunaMotion, number> = { school: 2.5, swarm: 1.2, drift: 0.6, soar: 12 };
const SOAR_LOOP_POINTS = 24;
const SEABED_CLEARANCE = 0.25;
const MIN_WATER_COLUMN = 0.6;
const WIND_REFRESH_SECONDS = 0.5;
const TWO_PI = Math.PI * 2;

/** A group with every default filled in and its footprint measured. */
export interface ResolvedFaunaGroup extends Required<Pick<FaunaGroup, "id" | "species" | "motion" | "area" | "wander">> {
  seed: string | number;
  window: FaunaWindow;
  band: { min: number; max: number };
  speed: number;
  steering: FlockConfig;
  budget: number;
  lod: { near: number; far: number };
  surface: number | undefined;
}

/** The live state of one group; the arrays are read by the renderer. */
export interface FaunaGroupState {
  readonly spec: ResolvedFaunaGroup;
  /** Agents this group owns. */
  readonly count: number;
  /** Agents out now: `count` scaled by how far into its window the group is. */
  readonly active: number;
  /** x,y,z per agent. */
  readonly position: Float32Array;
  /** x,y,z per agent, metres per second. */
  readonly velocity: Float32Array;
}

/** Plain-JSON state of every group. */
export interface AmbientFaunaState {
  groups: { id: string; position: number[]; velocity: number[] }[];
}

/** What {@link AmbientFauna.update} reads each frame; the caller reuses one object. */
export interface FaunaFrame {
  dt: number;
  /** Seconds on a clock that only grows. */
  time: number;
  /** Sun height -1 to 1, or null when the scene has no sun. */
  sunHeight: number | null;
  focusX: number;
  focusZ: number;
}

/** Ambient groups moving by their motion kind, all state in preallocated typed arrays. */
export interface AmbientFauna {
  readonly groups: readonly FaunaGroupState[];
  /** Agents owned by every group. */
  total(): number;
  /** Agents out now across every group. */
  activeTotal(): number;
  /** Advance every group in range by `frame.dt`. Allocates nothing. */
  update(frame: FaunaFrame): void;
  snapshot(): AmbientFaunaState;
  restore(state: AmbientFaunaState): void;
  /** Place every agent again from its seed. */
  reset(): void;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** How far into its window a group is, 0 (out of it) to 1 (fully in), for `sunHeight`. @internal */
export function windowPresence(window: FaunaWindow | undefined, sunHeight: number | null): number {
  if (window === undefined || (window.sunMin === undefined && window.sunMax === undefined)) return 1;
  if (sunHeight === null) return 0;
  const fade = Math.max(1e-6, window.fade ?? 0.08);
  const rise = window.sunMin === undefined ? 1 : clamp01((sunHeight - window.sunMin) / fade);
  const fall = window.sunMax === undefined ? 1 : clamp01((window.sunMax - sunHeight) / fade);
  return rise * fall;
}

function areaSize(area: FaunaArea): number {
  return area.shape === "disc" ? Math.PI * area.radius * area.radius : 4 * area.halfX * area.halfZ;
}

function areaExtent(area: FaunaArea): number {
  return area.shape === "disc" ? area.radius : Math.hypot(area.halfX, area.halfZ);
}

function areaRegion(area: FaunaArea): SampleRegion<readonly [number, number]> {
  if (area.shape === "disc") return discRegion([area.x, area.z], area.radius);
  return rectRegion({ minX: area.x - area.halfX, maxX: area.x + area.halfX, minZ: area.z - area.halfZ, maxZ: area.z + area.halfZ });
}

/** Agents a group owns before the global cap: `count`, else `density` over its footprint, bounded. @internal */
export function requestedAgents(group: FaunaGroup): number {
  if (!(areaExtent(group.area) > 0)) return 0;
  const wanted = group.count ?? Math.ceil(((group.density ?? 0) * areaSize(group.area)) / 1000);
  return Math.max(0, Math.min(FAUNA_GROUP_LIMIT, Number.isFinite(wanted) ? Math.floor(wanted) : 0));
}

function resolveGroup(group: FaunaGroup): ResolvedFaunaGroup {
  const defaults = DEFAULT_BAND[group.motion];
  const band = { min: group.band?.min ?? defaults.min, max: group.band?.max ?? defaults.max };
  if (!(band.max >= band.min)) band.max = band.min;
  const speed = group.speed ?? DEFAULT_SPEED[group.motion];
  const mate = Math.max(0.5, speed * 1.5);
  return {
    id: group.id,
    species: group.species,
    motion: group.motion,
    area: group.area,
    seed: group.seed ?? group.id,
    window: group.window ?? {},
    band,
    speed,
    wander: group.wander ?? 3,
    steering: { maxSpeed: speed, separationRadius: mate * 0.4, neighborRadius: mate, cohesionWeight: 0.8, alignmentWeight: 1, separationWeight: 1.5, seekWeight: 0.7, ...group.steering },
    budget: Math.max(0, Math.floor(group.budget ?? FAUNA_GROUP_LIMIT)),
    lod: group.lod ?? { near: 40, far: 120 },
    surface: group.surface,
  };
}

interface GroupRuntime extends FaunaGroupState {
  active: number;
  position: Float32Array;
  velocity: Float32Array;
  home: Float32Array;
  targets: Float32Array;
  before: Float32Array;
  phase: Float32Array;
  stepper: FlockStepper | null;
  track: MotionTrack | null;
  trackPoint: [number, number, number];
  buffers: FlockBuffers;
  schoolTarget: [number, number, number];
  windX: number;
  windZ: number;
  windAt: number;
  count: number;
}

function insideAreaProject(area: FaunaArea, position: Float32Array, velocity: Float32Array, base: number): void {
  if (area.shape === "disc") {
    const dx = (position[base] ?? 0) - area.x;
    const dz = (position[base + 2] ?? 0) - area.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= area.radius) return;
    const nx = dx / distance;
    const nz = dz / distance;
    position[base] = area.x + nx * area.radius;
    position[base + 2] = area.z + nz * area.radius;
    const out = (velocity[base] ?? 0) * nx + (velocity[base + 2] ?? 0) * nz;
    if (out > 0) { velocity[base] = (velocity[base] ?? 0) - 2 * out * nx; velocity[base + 2] = (velocity[base + 2] ?? 0) - 2 * out * nz; }
    return;
  }
  const lx = (position[base] ?? 0) - area.x;
  const lz = (position[base + 2] ?? 0) - area.z;
  if (lx > area.halfX) { position[base] = area.x + area.halfX; if ((velocity[base] ?? 0) > 0) velocity[base] = -(velocity[base] ?? 0); }
  else if (lx < -area.halfX) { position[base] = area.x - area.halfX; if ((velocity[base] ?? 0) < 0) velocity[base] = -(velocity[base] ?? 0); }
  if (lz > area.halfZ) { position[base + 2] = area.z + area.halfZ; if ((velocity[base + 2] ?? 0) > 0) velocity[base + 2] = -(velocity[base + 2] ?? 0); }
  else if (lz < -area.halfZ) { position[base + 2] = area.z - area.halfZ; if ((velocity[base + 2] ?? 0) < 0) velocity[base + 2] = -(velocity[base + 2] ?? 0); }
}

function surfaceOf(spec: ResolvedFaunaGroup, world: FaunaWorld, x: number, z: number, time: number): number {
  return world.surfaceAt?.(x, z, time) ?? spec.surface ?? 0;
}

function waterAllows(spec: ResolvedFaunaGroup, world: FaunaWorld, x: number, z: number, time: number): boolean {
  const surface = surfaceOf(spec, world, x, z, time);
  const floor = world.groundAt?.(x, z) ?? surface - spec.band.max - 1;
  return surface - floor >= spec.band.min + MIN_WATER_COLUMN;
}

function placeAgents(group: GroupRuntime, world: FaunaWorld): void {
  const { spec } = group;
  const rng = seededRng(spec.seed);
  const region = areaRegion(spec.area);
  const accept = (point: readonly number[]): boolean => {
    const x = (point[0] ?? 0);
    const z = (point[1] ?? 0);
    if (spec.motion === "school") return waterAllows(spec, world, x, z, 0);
    if (spec.motion === "soar") return true;
    return world.plantAt?.(x, z, world.groundAt?.(x, z) ?? 0) ?? true;
  };
  let placed = 0;
  for (let i = 0; i < group.count; i += 1) {
    const result = samplePoint({ region, rng, constraints: { accept }, maxAttempts: 40 });
    if (!result.ok || result.point === null) continue;
    const x = (result.point[0] ?? 0);
    const z = (result.point[1] ?? 0);
    const b = placed * 3;
    let y: number;
    if (spec.motion === "school") {
      const surface = surfaceOf(spec, world, x, z, 0);
      const floor = world.groundAt?.(x, z) ?? -Infinity;
      y = Math.max(floor + SEABED_CLEARANCE, surface - spec.band.max + (spec.band.max - spec.band.min) * rng());
      y = Math.min(y, surface - spec.band.min);
    } else {
      const ground = spec.motion === "soar" ? (world.groundAt?.(spec.area.x, spec.area.z) ?? 0) : (world.groundAt?.(x, z) ?? 0);
      y = ground + spec.band.min + (spec.band.max - spec.band.min) * rng();
    }
    group.position[b] = x; group.position[b + 1] = y; group.position[b + 2] = z;
    group.home[b] = x; group.home[b + 1] = y; group.home[b + 2] = z;
    const heading = rng() * TWO_PI;
    const speed = spec.speed * 0.3;
    group.velocity[b] = Math.cos(heading) * speed; group.velocity[b + 1] = 0; group.velocity[b + 2] = Math.sin(heading) * speed;
    group.phase[placed] = rng();
    placed += 1;
  }
  group.count = placed;
  group.active = placed;
}

function createSoarTrack(spec: ResolvedFaunaGroup): MotionTrack {
  const radius = areaExtent(spec.area) * (spec.area.shape === "disc" ? 0.7 : 0.55);
  const points: Vec3[] = [];
  for (let k = 0; k <= SOAR_LOOP_POINTS; k += 1) {
    const angle = (k / SOAR_LOOP_POINTS) * TWO_PI;
    points.push([spec.area.x + Math.cos(angle) * radius, 0, spec.area.z + Math.sin(angle) * radius]);
  }
  return createMotionTrack({ points, speed: Math.max(0.1, spec.speed), startAt: 0 });
}

function stepSchool(g: GroupRuntime, world: FaunaWorld, time: number, dt: number): void {
  const { spec, active, position, velocity, before } = g;
  const area = spec.area;
  const reachX = area.shape === "disc" ? area.radius * 0.6 : area.halfX * 0.6;
  const reachZ = area.shape === "disc" ? area.radius * 0.6 : area.halfZ * 0.6;
  const t = g.schoolTarget;
  t[0] = area.x + Math.sin(time * 0.05 + (g.phase[0] ?? 0) * TWO_PI) * reachX;
  t[2] = area.z + Math.sin(time * 0.037 + (g.phase[0] ?? 0) * 5) * reachZ;
  t[1] = 0;
  for (let i = 0; i < active * 3; i += 1) before[i] = (position[i] ?? 0);
  for (let i = 0; i < active; i += 1) {
    const b = i * 3;
    g.targets[b] = t[0]; g.targets[b + 1] = (position[b + 1] ?? 0); g.targets[b + 2] = t[2];
  }
  g.stepper?.step(g.buffers, active, spec.steering, dt, null, g.targets);
  for (let i = 0; i < active; i += 1) {
    const b = i * 3;
    insideAreaProject(area, position, velocity, b);
    const x = (position[b] ?? 0);
    const z = (position[b + 2] ?? 0);
    if (!waterAllows(spec, world, x, z, time)) {
      position[b] = (before[b] ?? 0); position[b + 2] = (before[b + 2] ?? 0);
      velocity[b] = -(velocity[b] ?? 0) * 0.6; velocity[b + 2] = -(velocity[b + 2] ?? 0) * 0.6;
    }
    const px = (position[b] ?? 0);
    const pz = (position[b + 2] ?? 0);
    const surface = surfaceOf(spec, world, px, pz, time);
    const floor = world.groundAt?.(px, pz) ?? -Infinity;
    const top = surface - spec.band.min;
    const bottom = Math.min(top, Math.max(floor + SEABED_CLEARANCE, surface - spec.band.max));
    const y = (position[b + 1] ?? 0);
    if (y > top) { position[b + 1] = top; if ((velocity[b + 1] ?? 0) > 0) velocity[b + 1] = 0; }
    else if (y < bottom) { position[b + 1] = bottom; if ((velocity[b + 1] ?? 0) < 0) velocity[b + 1] = 0; }
  }
}

function stepSwarm(g: GroupRuntime, world: FaunaWorld, time: number, dt: number): void {
  const { spec, active, home, targets, phase } = g;
  for (let i = 0; i < active; i += 1) {
    const b = i * 3;
    const w = (phase[i] ?? 0) * TWO_PI;
    const orbit = time * (0.4 + (phase[i] ?? 0) * 0.5) + w;
    targets[b] = (home[b] ?? 0) + Math.cos(orbit) * spec.wander;
    targets[b + 1] = (home[b + 1] ?? 0) + Math.sin(orbit * 1.3) * spec.wander * 0.3;
    targets[b + 2] = (home[b + 2] ?? 0) + Math.sin(orbit) * spec.wander;
  }
  g.stepper?.step(g.buffers, active, spec.steering, dt, null, targets);
  clampToPlants(g, world, active);
}

function stepDrift(g: GroupRuntime, world: FaunaWorld, time: number, dt: number): void {
  const { spec, active, position, velocity, home, phase } = g;
  refreshWind(g, world, time, spec.band.max);
  const relax = Math.min(1, dt * 1.5);
  const pull = 0.35;
  for (let i = 0; i < active; i += 1) {
    const b = i * 3;
    const w = (phase[i] ?? 0) * TWO_PI;
    const gx = g.windX * 0.5 + Math.sin(time * 0.9 + w) * spec.speed * 0.6 + ((home[b] ?? 0) - (position[b] ?? 0)) * pull;
    const gy = Math.sin(time * 0.7 + w * 1.7) * spec.speed * 0.3 + ((home[b + 1] ?? 0) - (position[b + 1] ?? 0)) * pull;
    const gz = g.windZ * 0.5 + Math.cos(time * 0.8 + w) * spec.speed * 0.6 + ((home[b + 2] ?? 0) - (position[b + 2] ?? 0)) * pull;
    let vx = (velocity[b] ?? 0) + (gx - (velocity[b] ?? 0)) * relax;
    let vy = (velocity[b + 1] ?? 0) + (gy - (velocity[b + 1] ?? 0)) * relax;
    let vz = (velocity[b + 2] ?? 0) + (gz - (velocity[b + 2] ?? 0)) * relax;
    const speed = Math.hypot(vx, vy, vz);
    if (speed > spec.speed) { const k = spec.speed / speed; vx *= k; vy *= k; vz *= k; }
    velocity[b] = vx; velocity[b + 1] = vy; velocity[b + 2] = vz;
    position[b] = (position[b] ?? 0) + vx * dt;
    position[b + 1] = (position[b + 1] ?? 0) + vy * dt;
    position[b + 2] = (position[b + 2] ?? 0) + vz * dt;
  }
  clampToPlants(g, world, active);
}

function clampToPlants(g: GroupRuntime, world: FaunaWorld, active: number): void {
  const { spec, position, velocity } = g;
  for (let i = 0; i < active; i += 1) {
    const b = i * 3;
    insideAreaProject(spec.area, position, velocity, b);
    const ground = world.groundAt?.((position[b] ?? 0), (position[b + 2] ?? 0)) ?? 0;
    const low = ground + spec.band.min;
    const high = Math.max(low, ground + spec.band.max);
    const y = (position[b + 1] ?? 0);
    if (y < low) { position[b + 1] = low; if ((velocity[b + 1] ?? 0) < 0) velocity[b + 1] = 0; }
    else if (y > high) { position[b + 1] = high; if ((velocity[b + 1] ?? 0) > 0) velocity[b + 1] = 0; }
  }
}

function refreshWind(g: GroupRuntime, world: FaunaWorld, time: number, height: number): void {
  if (world.wind === undefined || time - g.windAt < WIND_REFRESH_SECONDS) return;
  const wind = world.wind.atHeight(g.spec.area.x, g.spec.area.z, height, time);
  g.windX = wind[0];
  g.windZ = wind[1];
  g.windAt = time;
}

function stepSoar(g: GroupRuntime, world: FaunaWorld, time: number, dt: number): void {
  const { spec, active, position, velocity, phase, track, trackPoint } = g;
  if (track === null) return;
  const loop = track;
  const period = Math.max(1e-3, loop.length() / Math.max(0.1, spec.speed));
  const mid = (spec.band.min + spec.band.max) / 2;
  refreshWind(g, world, mid, mid);
  const windSpeed = Math.hypot(g.windX, g.windZ);
  const ground = world.groundAt?.(spec.area.x, spec.area.z) ?? 0;
  const lean = Math.min(areaExtent(spec.area) * 0.25, windSpeed * 2);
  const leanX = windSpeed > 1e-6 ? (g.windX / windSpeed) * lean : 0;
  const leanZ = windSpeed > 1e-6 ? (g.windZ / windSpeed) * lean : 0;
  const lift = Math.min(1, windSpeed / 12);
  const invDt = dt > 1e-6 ? 1 / dt : 0;
  for (let i = 0; i < active; i += 1) {
    const b = i * 3;
    const own = (phase[i] ?? 0);
    const at = ((time / period + own) % 1) * period;
    loop.sampleInto(own > 0.5 ? at : period - at, trackPoint);
    const spread = 0.55 + 0.45 * ((own * 7.13) % 1);
    const x = spec.area.x + (trackPoint[0] - spec.area.x) * spread + leanX;
    const z = spec.area.z + (trackPoint[2] - spec.area.z) * spread + leanZ;
    const rise = 0.5 + 0.5 * Math.sin(time * 0.06 + own * TWO_PI);
    const y = ground + spec.band.min + (spec.band.max - spec.band.min) * Math.min(1, rise * (0.7 + 0.3 * lift));
    velocity[b] = (x - (position[b] ?? 0)) * invDt;
    velocity[b + 1] = (y - (position[b + 1] ?? 0)) * invDt;
    velocity[b + 2] = (z - (position[b + 2] ?? 0)) * invDt;
    position[b] = x; position[b + 1] = y; position[b + 2] = z;
  }
}

/**
 * Build ambient groups: fish schools below the water surface, swarms and drifting motes near plants,
 * and flyers soaring on the wind. Schools and swarms steer with the flock stepper, soarers ride a motion
 * track, every spawn point is a seeded spatial sample. Species, counts and areas are the caller's data.
 *
 * @capability ambient-fauna groups of fish, insects, motes and soaring flyers that stay in an area, below the water surface or near plants, out in a time-of-day window, with a global agent cap
 */
export function createAmbientFauna(groups: readonly FaunaGroup[], world: FaunaWorld = {}, options: AmbientFaunaOptions = {}): AmbientFauna {
  const cap = Math.max(0, Math.floor(options.globalCap ?? FAUNA_GLOBAL_CAP));
  const range = options.simulateRange ?? 400;
  const runtimes: GroupRuntime[] = [];
  let remaining = cap;
  for (const group of groups) {
    const spec = resolveGroup(group);
    const count = Math.min(requestedAgents(group), remaining);
    remaining -= count;
    const buffers: FlockBuffers = { position: new Float32Array(count * 3), velocity: new Float32Array(count * 3) };
    const flocking = spec.motion === "school" || spec.motion === "swarm";
    runtimes.push({
      spec,
      count,
      active: 0,
      position: buffers.position,
      velocity: buffers.velocity,
      buffers,
      home: new Float32Array(count * 3),
      targets: new Float32Array(count * 3),
      before: new Float32Array(count * 3),
      phase: new Float32Array(Math.max(1, count)),
      stepper: flocking ? createFlockStepper(Math.max(1, count)) : null,
      track: spec.motion === "soar" ? createSoarTrack(spec) : null,
      trackPoint: [0, 0, 0],
      schoolTarget: [spec.area.x, 0, spec.area.z],
      windX: 0,
      windZ: 0,
      windAt: -Infinity,
    });
  }

  function place(): void {
    for (const g of runtimes) {
      const requested = g.position.length / 3;
      g.count = requested;
      placeAgents(g, world);
      for (let i = 0; i < g.count; i += 1) { g.targets[i * 3] = (g.home[i * 3] ?? 0); g.targets[i * 3 + 1] = (g.home[i * 3 + 1] ?? 0); g.targets[i * 3 + 2] = (g.home[i * 3 + 2] ?? 0); }
      g.windAt = -Infinity;
      if (g.spec.motion === "soar") stepSoar(g, world, 0, 0);
      g.active = 0;
    }
  }
  place();

  return {
    groups: runtimes,
    total: () => runtimes.reduce((sum, g) => sum + g.count, 0),
    activeTotal: () => runtimes.reduce((sum, g) => sum + g.active, 0),
    update(frame) {
      const dt = Math.min(frame.dt, 0.1);
      for (const g of runtimes) {
        const presence = windowPresence(g.spec.window, frame.sunHeight);
        g.active = Math.min(g.count, Math.round(g.count * presence));
        if (g.active === 0 || dt <= 0) continue;
        const reach = range + areaExtent(g.spec.area);
        if (Math.hypot(frame.focusX - g.spec.area.x, frame.focusZ - g.spec.area.z) > reach) continue;
        if (g.spec.motion === "school") stepSchool(g, world, frame.time, dt);
        else if (g.spec.motion === "swarm") stepSwarm(g, world, frame.time, dt);
        else if (g.spec.motion === "drift") stepDrift(g, world, frame.time, dt);
        else stepSoar(g, world, frame.time, dt);
      }
    },
    snapshot: () => ({ groups: runtimes.map((g) => ({ id: g.spec.id, position: Array.from(g.position.subarray(0, g.count * 3)), velocity: Array.from(g.velocity.subarray(0, g.count * 3)) })) }),
    restore(state) {
      if (state.groups.length !== runtimes.length) throw new Error("restored fauna cardinality differs from its groups");
      state.groups.forEach((saved, index) => {
        const g = runtimes[index];
        if (g === undefined) return;
        if (saved.id !== g.spec.id || saved.position.length !== g.count * 3 || saved.velocity.length !== g.count * 3) throw new Error(`invalid restored fauna group ${saved.id}`);
        if (![...saved.position, ...saved.velocity].every(Number.isFinite)) throw new Error(`non-finite restored fauna group ${saved.id}`);
        g.position.set(saved.position);
        g.velocity.set(saved.velocity);
      });
    },
    reset: place,
  };
}
