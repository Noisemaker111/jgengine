import { stepFlock, type FlockStepAgent } from "../ai/flock";
import { seededRng } from "../random/rng";
import { sampleForceField } from "../physics/forceVolume";
import { decodeEditorSimulation, type EditorSimulation } from "../editor/simulation";
import type { EditorDocument, EditorVolume } from "../editor/types";
import { createEmptyEditorDocument } from "../editor/document";
import { createAuthoredWeather, createWeatherExposure, type AuthoredWeatherSample, type WeatherExposure, type WeatherExposureSnapshot, type WeatherExposureSurface } from "@jgengine/core/weather/authoredWeather";
import { createFireLandscape, type FireLandscape, type FireLandscapeSnapshot } from "../fire/fireLandscape";
import { MOISTURE_SCENARIOS, standardFuelModel, type FuelModel } from "../fire/fuelModels";
import { createFuelMoistureModel, type FuelMoistureModel, type FuelMoistureSnapshot } from "../fire/fuelMoisture";
import type { AuthoredFireArea } from "../editor/simulation";
import type { EffectRequest, ParticleDirector } from "../vfx/particleDirector";
import type { Vec3 } from "./geometry";

/** A watched surface is sampled in metres. Its accumulation survives runtime save/restore. */
export interface AuthoredSurface extends WeatherExposureSurface { y?: number }

/** Appearance adapters consume these units without owning weather state or its clock. */
export interface EnvironmentAppearanceSignals {
  timeSeconds: number;
  wind: Vec3;
  wetness: number;
  snow: number;
  exposure: number;
  /** Normalized local fire heat, independent of the temperature offset in degrees Celsius. */
  heat: number;
  temperatureOffsetC: number;
}

/** Runtime state excludes authored configuration and cosmetic particle pools. */
export interface AuthoredSimulationSnapshot {
  surfaces: WeatherExposureSnapshot;
  watched: AuthoredSurface[];
  fires: { id: string; fire: FireLandscapeSnapshot; moisture: FuelMoistureSnapshot; pendingSeconds: number }[];
  flocks: { id: string; agents: FlockStepAgent[]; routeIndex: number }[];
}

/** One authored fire area at runtime: its landscape fire and the fuel moisture authored weather drives. */
export interface AuthoredFireRuntime {
  readonly fire: FireLandscape;
  readonly moisture: FuelMoistureModel;
  /** Light the cell under a world position; false off the grid. */
  ignite(x: number, z: number): boolean;
  /** Douse the cell under a world position: soak its fine fuel and its neighbours', and put it out. */
  extinguish(x: number, z: number): boolean;
  /** Cells flaming or smouldering. */
  readonly burning: number;
}

interface FireAreaState extends AuthoredFireRuntime {
  pendingSeconds: number;
}

/** Authored rain intensity 1 as a rain rate, mm/h (heavy rain). */
const RAIN_MM_PER_HOUR = 10;
/** Fuel moisture follows the weather in steps of this many game seconds. */
const MOISTURE_STEP_SECONDS = 60;
const DEFAULT_CLIMATE = { airTemperatureC: 25, relativeHumidity: 0.35 };

function fireAreaFuel(area: AuthoredFireArea): { fuels: FuelModel[]; fuel: Uint8Array } {
  const n = area.config.cols * area.config.rows;
  const codes = area.fuel ?? "GR2";
  const fuels: FuelModel[] = [];
  const index = new Map<string, number>();
  const fuel = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const code = typeof codes === "string" ? codes : (codes[i] ?? "GR2");
    let k = index.get(code);
    if (k === undefined) {
      const model = standardFuelModel(code);
      if (model === undefined) throw new Error(`unknown fuel model ${code}`);
      k = fuels.length;
      fuels.push(model);
      index.set(code, k);
    }
    fuel[i] = k;
  }
  return { fuels, fuel };
}

function createFireArea(area: AuthoredFireArea, exposureAt: (x: number, y: number, z: number) => number): FireAreaState {
  const { cols, rows, cellSize } = area.config;
  const n = cols * rows;
  const exposure = new Float32Array(n);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) exposure[r * cols + c] = exposureAt(area.position.x + (c + 0.5) * cellSize, area.position.y, area.position.z + (r + 0.5) * cellSize);
  const scenario = area.moisture ?? "D2L2";
  const initial = MOISTURE_SCENARIOS[scenario];
  if (initial === undefined) throw new Error(`unknown moisture scenario ${scenario}`);
  const fire = createFireLandscape({ cols, rows, cellSize, originX: area.position.x, originZ: area.position.z, ...fireAreaFuel(area), seed: area.id, maxCells: 16_384 });
  const moisture = createFuelMoistureModel({ cells: n, initial, exposure, rainShare: exposure });
  fire.setMoistureField(moisture);
  for (const ignition of area.ignitions ?? []) fire.ignite(ignition.col, ignition.row);
  return {
    fire,
    moisture,
    pendingSeconds: 0,
    ignite: (x, z) => fire.igniteAt(x, z),
    extinguish(x, z) {
      const i = fire.cellIndexAt(x, z);
      if (i < 0) return false;
      const col = i % cols;
      const row = (i - col) / cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const c = col + dc;
          const r = row + dr;
          if (c >= 0 && r >= 0 && c < cols && r < rows) moisture.wet(r * cols + c, 1);
        }
      }
      return fire.extinguish(col, row);
    },
    get burning() {
      return fire.activeCells().length;
    },
  };
}

/** A habitat's live poses; game species determine appearance and gameplay actor policy. */
export interface AuthoredFlockState {
  readonly id: string;
  readonly species: string;
  readonly role: "cosmetic" | "gameplay";
  readonly agents: readonly Readonly<FlockStepAgent>[];
  readonly routeIndex: number;
}

interface MutableAuthoredFlockState extends Omit<AuthoredFlockState, "agents" | "routeIndex"> {
  agents: FlockStepAgent[];
  routeIndex: number;
}

/** Engine-owned authority uses the caller's simulation clock; render quality cannot change it. */
export interface AuthoredSimulationRuntime {
  sample(x: number, z: number): AuthoredWeatherSample;
  appearanceAt(surfaceId: string, position: Vec3): EnvironmentAppearanceSignals;
  /** Fraction of open sky from bounded authored shelter volumes. World Y points up. */
  exposureAt(x: number, y: number, z: number): number;
  readonly surfaces: WeatherExposure;
  watch(surface: AuthoredSurface): void;
  forget(id: string): void;
  /** XZ wind adapted to [x,0,z]; response is 1/second, cap is metres/second² (both 0..1e12). */
  windAcceleration(position: Vec3, response: number, maxAcceleration: number): Vec3;
  /** Sum authored fields and wind (response 1/second), capped in metres/second² by game policy. */
  accelerationAt(position: Vec3, timeSeconds: number, windResponse: number, maxAcceleration: number, mask?: number, out?: [number, number, number]): Vec3;
  fire(id: string): AuthoredFireRuntime | undefined;
  /** Cosmetic poses render directly; gameplay habitats are consumed by game actor adapters. */
  flocks(): readonly AuthoredFlockState[];
  step(gameDt: number): void;
  retune(document: EditorDocument): void;
  snapshot(): AuthoredSimulationSnapshot;
  restore(state: AuthoredSimulationSnapshot): void;
  dispose(): void;
}

function finite(value: number, label: string, min = -Infinity, max = Infinity): void {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be finite in ${min}..${max}`);
}

function inside(shelter: EditorVolume, x: number, y: number, z: number): boolean {
  const dx = x - shelter.center.x, dy = y - shelter.center.y, dz = z - shelter.center.z;
  if (shelter.shape === "box") {
    const extents = shelter.halfExtents;
    return extents !== undefined && Math.abs(dx) <= extents.x && Math.abs(dy) <= extents.y && Math.abs(dz) <= extents.z;
  }
  const radius = shelter.radius ?? 0;
  return shelter.shape === "sphere" ? dx * dx + dy * dy + dz * dz <= radius * radius : dx * dx + dz * dz <= radius * radius && Math.abs(dy) <= (shelter.height ?? 0) / 2;
}

/** Compose authored weather, shelter, accumulation, named effect intents and fire with one clock.
 * @capability authored-environment compose authored weather, shelter, accumulation, fire, flocks and effects using one simulation clock
 */
export function createAuthoredSimulation(options: { document?: EditorDocument | undefined; timeSeconds: () => number; particles?: ParticleDirector | undefined; maxSurfaces?: number }): AuthoredSimulationRuntime {
  let document = options.document ?? createEmptyEditorDocument();
  let config: EditorSimulation = decodeEditorSimulation(document.simulation ?? {}, document);
  let weather = createAuthoredWeather(config.weather ?? {});
  let shelters: EditorVolume[] = [];
  const surfaces = createWeatherExposure({ maxSurfaces: options.maxSurfaces ?? 1024 });
  const watched = new Map<string, AuthoredSurface>();
  let fires = new Map<string, FireAreaState>();
  let emitterIds: string[] = [];
  let flocks: MutableAuthoredFlockState[] = [];
  let disposed = false;
  let authoredSignature: string | undefined;
  const forceScratch: [number, number, number] = [0, 0, 0];

  function install(next: EditorDocument): void {
    const nextConfig = decodeEditorSimulation(next.simulation ?? {}, next);
    const routeIds = new Set((nextConfig.habitats ?? []).map((habitat) => habitat.routeId));
    const signature = JSON.stringify({ config: nextConfig, shelters: next.volumes.filter((volume) => volume.kind === "shelter"), routes: next.paths.filter((route) => routeIds.has(route.id)).map(({ id, points }) => ({ id, points })) });
    if (signature === authoredSignature) return;
    const nextDocument = structuredClone(next);
    const nextEmitterIds = (nextConfig.emitters ?? []).map((emitter) => `authored:${emitter.id}`);
    if (options.particles !== undefined) {
      const existing = options.particles.emitters();
      const owned = new Set(emitterIds);
      const projected = existing.filter((emitter) => !owned.has(emitter.id)).length + nextEmitterIds.length;
      if (projected > options.particles.limits().maxEmitters) throw new Error("authored emitters exceed the shared particle director capacity");
      for (const id of nextEmitterIds) if (!owned.has(id) && existing.some((emitter) => emitter.id === id)) throw new Error(`authored emitter id is already owned: ${id}`);
    }
    const nextShelters = next.volumes.filter((volume) => volume.kind === "shelter");
    if (nextShelters.length > 256) throw new Error("authored shelters are limited to 256 volumes");
    const nextWeather = createAuthoredWeather(nextConfig.weather ?? {});
    const nextFires = new Map<string, FireAreaState>();
    for (const area of nextConfig.fires ?? []) {
      const previousArea = config.fires?.find((previous) => previous.id === area.id);
      const previous = fires.get(area.id);
      const keep = previous !== undefined && previousArea !== undefined && JSON.stringify(previousArea) === JSON.stringify(area);
      nextFires.set(area.id, keep ? previous : createFireArea(area, (x, y, z) => exposureIn(nextShelters, x, y, z)));
    }
    const nextFlocks = (nextConfig.habitats ?? []).map((habitat) => {
      const previous = flocks.find((state) => state.id === habitat.id);
      const previousConfig = config.habitats?.find((state) => state.id === habitat.id);
      if (previous !== undefined && previousConfig !== undefined && ["species", "role", "count", "seed", "position", "radius"].every((key) => JSON.stringify(previousConfig[key as keyof typeof previousConfig]) === JSON.stringify(habitat[key as keyof typeof habitat]))) {
        const route = habitat.routeId === undefined ? undefined : next.paths.find((entry) => entry.id === habitat.routeId);
        return { ...previous, routeIndex: previousConfig.routeId !== habitat.routeId ? 0 : previous.routeIndex % (route?.points.length ?? 1) };
      }
      const rng = seededRng(habitat.seed);
      const agents = Array.from({ length: habitat.count }, () => {
        const angle = rng() * Math.PI * 2, radius = Math.sqrt(rng()) * habitat.radius;
        return { position: [habitat.position.x + Math.cos(angle) * radius, habitat.position.y, habitat.position.z + Math.sin(angle) * radius] as const, velocity: [0, 0, 0] as const };
      });
      return { id: habitat.id, species: habitat.species, role: habitat.role, agents, routeIndex: 0 };
    });
    for (const id of emitterIds) if (!nextEmitterIds.includes(id)) options.particles?.detach(id);
    for (const emitter of nextConfig.emitters ?? []) {
      const id = `authored:${emitter.id}`;
      const previous = config.emitters?.find((entry) => entry.id === emitter.id);
      if (emitterIds.includes(id) && JSON.stringify(previous) === JSON.stringify(emitter)) continue;
      const position: Vec3 = [emitter.position.x, emitter.position.y, emitter.position.z];
      const fire = emitter.fireAreaId === undefined ? undefined : { active: emitter.options?.active !== false && nextFires.get(emitter.fireAreaId)!.burning > 0 };
      const request: EffectRequest = { position, options: { ...emitter.options, ...(fire ?? {}) } };
      if (emitter.effect !== undefined) options.particles?.attachEffect(id, emitter.effect, request);
      else options.particles?.attach(id, { ...emitter.config, position }, request.options);
    }
    emitterIds = nextEmitterIds;
    document = nextDocument;
    config = nextConfig;
    weather = nextWeather;
    shelters = structuredClone(nextShelters);
    fires = nextFires;
    flocks = nextFlocks;
    authoredSignature = signature;
    syncFireEmitters();
  }

  function exposureAt(x: number, y: number, z: number): number {
    return exposureIn(shelters, x, y, z);
  }

  function exposureIn(list: readonly EditorVolume[], x: number, y: number, z: number): number {
    finite(x, "exposure x"); finite(y, "exposure y"); finite(z, "exposure z");
    let exposure = 1;
    for (const shelter of list) {
      if (!inside(shelter, x, y, z)) continue;
      const authored = shelter.meta?.["exposure"];
      const amount = typeof authored === "number" && Number.isFinite(authored) ? Math.max(0, Math.min(1, authored)) : 0;
      exposure = Math.min(exposure, amount);
    }
    return exposure;
  }

  function accelerationAt(position: Vec3, timeSeconds: number, windResponse: number, maxAcceleration: number, mask = 0xffffffff, out: [number, number, number] = [0, 0, 0]): Vec3 {
      if (position.length !== 3) throw new Error("acceleration position must contain three components");
      for (const axis of position) finite(axis, "acceleration position");
      finite(timeSeconds, "acceleration time", 0);
      if (!Number.isInteger(mask) || mask < 0 || mask > 0xffffffff) throw new Error("acceleration mask must be a uint32");
      finite(windResponse, "wind response", 0, 1e12); finite(maxAcceleration, "acceleration cap", 0, 1e12);
      const wind = weather.sample(position[0], position[2], timeSeconds).wind;
      let x = wind[0] * windResponse, y = 0, z = wind[1] * windResponse;
      for (const field of config.forces ?? []) { sampleForceField(field, position, mask, forceScratch); x += forceScratch[0]; y += forceScratch[1]; z += forceScratch[2]; }
      const magnitude = Math.hypot(x, y, z), scale = magnitude > maxAcceleration && magnitude > 0 ? maxAcceleration / magnitude : 1;
      out[0] = x * scale; out[1] = y * scale; out[2] = z * scale;
      return out;
    }

  function syncFireEmitters(): void {
    for (const emitter of config.emitters ?? []) {
      if (emitter.fireAreaId === undefined) continue;
      if (emitter.options?.active !== false && fires.get(emitter.fireAreaId)!.burning > 0) options.particles?.start(`authored:${emitter.id}`);
      else options.particles?.stop(`authored:${emitter.id}`);
    }
  }

  install(document);
  return {
    sample: (x, z) => weather.sample(x, z, options.timeSeconds()),
    appearanceAt(surfaceId, position) {
      const exposure = exposureAt(...position);
      const sample = weather.sample(position[0], position[2], options.timeSeconds());
      const accumulated = surfaces.sample(surfaceId);
      let heat = 0;
      for (const area of config.fires ?? []) {
        if (Math.abs(position[1] - area.position.y) > area.config.cellSize) continue;
        const fire = fires.get(area.id)?.fire;
        const i = fire?.cellIndexAt(position[0], position[2]) ?? -1;
        const state = i >= 0 ? (fire?.layers.state[i] ?? 0) : 0;
        heat = Math.max(heat, state === 1 ? 1 : state === 2 ? 0.5 : 0);
      }
      return { timeSeconds: sample.timeSeconds, wind: [sample.wind[0], 0, sample.wind[1]], wetness: accumulated?.wetness ?? 0, snow: accumulated?.snow ?? 0, exposure, heat, temperatureOffsetC: sample.temperatureOffset ?? 0 };
    },
    exposureAt,
    surfaces,
    watch(surface) {
      if (disposed) throw new Error("authored simulation is disposed");
      if (!surface.id || surface.id.length > 128) throw new Error("surface id must be nonempty and at most 128 characters");
      finite(surface.x, "surface x"); finite(surface.z, "surface z"); finite(surface.y ?? 0, "surface y");
      if (surface.exposure !== undefined) { finite(surface.exposure, "surface exposure", 0); if (surface.exposure > 1) throw new Error("surface exposure must be <= 1"); }
      if (surface.temperature !== undefined) finite(surface.temperature, "surface temperature");
      if (!watched.has(surface.id) && watched.size >= (options.maxSurfaces ?? 1024)) throw new Error("authored surface budget exceeded");
      watched.set(surface.id, { ...surface });
    },
    forget(id) { watched.delete(id); surfaces.forget(id); },
    windAcceleration(position, response, maxAcceleration) {
      for (const axis of position) finite(axis, "wind position");
      if (position.length !== 3) throw new Error("wind position must contain three components");
      finite(response, "wind response", 0, 1e12); finite(maxAcceleration, "wind acceleration cap", 0, 1e12);
      const wind = weather.sample(position[0], position[2], options.timeSeconds()).wind;
      const x = wind[0] * response, z = wind[1] * response;
      const magnitude = Math.hypot(x, z), scale = magnitude > maxAcceleration && magnitude > 0 ? maxAcceleration / magnitude : 1;
      return [x * scale, 0, z * scale];
    },
    accelerationAt,
    fire: (id) => fires.get(id),
    flocks: () => flocks,
    step(gameDt) {
      finite(gameDt, "authored simulation dt", 0);
      if (disposed || gameDt === 0) return;
      const time = options.timeSeconds();
      const samples = Array.from(watched.values(), (surface) => ({ ...surface, exposure: (surface.exposure ?? 1) * exposureAt(surface.x, surface.y ?? 0, surface.z) }));
      surfaces.step(gameDt, time, samples, weather);
      for (const state of flocks) {
        const habitat = config.habitats!.find((entry) => entry.id === state.id)!;
        const route = habitat.routeId === undefined ? undefined : document.paths.find((entry) => entry.id === habitat.routeId);
        const point = route?.points[state.routeIndex % route.points.length];
        const target: Vec3 = point === undefined ? [habitat.position.x, habitat.position.y, habitat.position.z] : [point.x, point.y, point.z];
        const acceleration = (habitat.maxAcceleration ?? 0) === 0 ? undefined : (agent: Readonly<FlockStepAgent>) => accelerationAt(agent.position, time, habitat.windResponse ?? 0, habitat.maxAcceleration!, habitat.forceMask ?? 0xffffffff);
        stepFlock(state.agents, habitat.steering, gameDt, target, acceleration);
        const lead = state.agents[0];
        if (route !== undefined && lead !== undefined && Math.hypot(lead.position[0] - target[0], lead.position[1] - target[1], lead.position[2] - target[2]) < Math.max(1, habitat.steering.maxSpeed * gameDt)) state.routeIndex = (state.routeIndex + 1) % route.points.length;
      }
      for (const area of config.fires ?? []) {
        const runtime = fires.get(area.id);
        if (runtime === undefined) continue;
        const local = weather.sample(area.position.x + (area.config.cols * area.config.cellSize) / 2, area.position.z + (area.config.rows * area.config.cellSize) / 2, time);
        const climate = area.climate ?? DEFAULT_CLIMATE;
        const airTemperatureC = climate.airTemperatureC + (local.temperatureOffset ?? 0);
        runtime.pendingSeconds += gameDt;
        if (runtime.pendingSeconds >= MOISTURE_STEP_SECONDS) {
          runtime.moisture.step(runtime.pendingSeconds, {
            airTemperatureC,
            relativeHumidity: climate.relativeHumidity + (1 - climate.relativeHumidity) * local.precipitation,
            rainRateMmPerHour: local.rain * RAIN_MM_PER_HOUR,
            cloudCover: local.cloudCover,
          });
          runtime.pendingSeconds = 0;
        }
        runtime.fire.step(gameDt, { twentyFootWind: Math.hypot(local.wind[0], local.wind[1]), windDirection: Math.atan2(local.wind[1], local.wind[0]), airTemperatureC, moisture: runtime.moisture.moistureAt(0) });
      }
      syncFireEmitters();
    },
    retune(next) { if (disposed) throw new Error("authored simulation is disposed"); install(next); },
    snapshot: () => ({ surfaces: surfaces.snapshot(), watched: Array.from(watched.values(), (surface) => ({ ...surface })), fires: Array.from(fires, ([id, area]) => ({ id, fire: area.fire.snapshot(), moisture: area.moisture.snapshot(), pendingSeconds: area.pendingSeconds })), flocks: structuredClone(flocks.map(({ id, agents, routeIndex }) => ({ id, agents, routeIndex }))) }),
    restore(state) {
      if (disposed) throw new Error("authored simulation is disposed");
      if (!Array.isArray(state.watched) || state.watched.length > (options.maxSurfaces ?? 1024)) throw new Error("authored surface restore budget exceeded");
      if (!Array.isArray(state.fires) || state.fires.length !== fires.size) throw new Error("restored fire cardinality differs from authored areas");
      if (!Array.isArray(state.flocks) || state.flocks.length !== flocks.length) throw new Error("restored flock cardinality differs from authored habitats");
      const watchedIds = new Set<string>();
      const fireIds = new Set<string>();
      const flockIds = new Set<string>();
      const next = createAuthoredSimulation({ ...options, document, particles: undefined });
      try {
        next.surfaces.restore(state.surfaces);
        for (const surface of state.watched) {
          if (watchedIds.has(surface.id)) throw new Error(`duplicate restored surface id: ${surface.id}`);
          watchedIds.add(surface.id);
          next.watch(surface);
        }
        for (const saved of state.fires) {
          if (fireIds.has(saved.id)) throw new Error(`duplicate restored fire id: ${saved.id}`);
          fireIds.add(saved.id);
          const area = next.fire(saved.id);
          if (area === undefined) throw new Error(`unknown restored fire area: ${saved.id}`);
          finite(saved.pendingSeconds, "restored fire moisture clock", 0, MOISTURE_STEP_SECONDS);
          area.fire.restore(saved.fire);
          area.moisture.restore(saved.moisture);
        }
        const restoredFlocks = state.flocks.map((saved) => {
          if (flockIds.has(saved.id)) throw new Error(`duplicate restored flock id: ${saved.id}`);
          flockIds.add(saved.id);
          const current = flocks.find((entry) => entry.id === saved.id);
          if (current === undefined || !Array.isArray(saved.agents) || current.agents.length !== saved.agents.length) throw new Error(`invalid restored flock ${saved.id}`);
          const habitat = config.habitats!.find((entry) => entry.id === saved.id)!;
          const route = habitat.routeId === undefined ? undefined : document.paths.find((entry) => entry.id === habitat.routeId);
          if (!Number.isSafeInteger(saved.routeIndex) || saved.routeIndex < 0 || saved.routeIndex >= (route?.points.length ?? 1)) throw new Error(`invalid restored flock route ${saved.id}`);
          for (const agent of saved.agents) {
            if (!Array.isArray(agent.position) || !Array.isArray(agent.velocity) || agent.position.length !== 3 || agent.velocity.length !== 3) throw new Error(`invalid restored flock vector ${saved.id}`);
            for (const axis of [...agent.position, ...agent.velocity]) finite(axis, "restored flock vector");
          }
          return { ...current, agents: structuredClone(saved.agents), routeIndex: saved.routeIndex };
        });
        surfaces.restore(next.surfaces.snapshot());
        watched.clear();
        for (const surface of state.watched) watched.set(surface.id, { ...surface });
        for (const saved of state.fires) {
          const area = fires.get(saved.id);
          if (area === undefined) continue;
          area.fire.restore(saved.fire);
          area.moisture.restore(saved.moisture);
          area.pendingSeconds = saved.pendingSeconds;
        }
        flocks = restoredFlocks;
        syncFireEmitters();
      } finally { next.dispose(); }
    },

    dispose() { for (const id of emitterIds) options.particles?.detach(id); emitterIds = []; watched.clear(); surfaces.restore({ surfaces: [] }); fires.clear(); flocks = []; disposed = true; },
  };
}
