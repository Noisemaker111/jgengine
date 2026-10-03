import { createEnvironmentField, type EnvironmentField, type EnvironmentFieldConfig } from "./envField";
import { windField, type WindField, type WindFieldConfig, type WindVector } from "./wind";

/** Wind is metres/second along world X,Z; world Y points up. Times are simulation seconds. */
export type AuthoredWeatherMode = "clear" | "rain" | "snow" | "mixed" | "dust";

/** Precipitation intensity, temperature offset in degrees, and normalized lightning brightness. */
export interface WeatherConditions {
  mode: AuthoredWeatherMode;
  intensity: number;
  temperatureOffset?: number;
  lightning?: number;
}

/** A named set of conditions referenced by the authored schedule. */
export interface AuthoredWeatherProfile extends WeatherConditions {
  id: string;
}

/** An absolute simulation-time profile change with an optional continuous blend. */
export interface AuthoredWeatherTransition {
  atSeconds: number;
  profileId: string;
  transitionSeconds?: number;
}

/** A local weather override and additive wind source centered in world X,Z metres. */
export interface AuthoredWeatherZone {
  id: string;
  center: readonly [number, number];
  radius: number;
  /** Blend distance outside the radius, in metres. */
  falloff?: number;
  weather?: WeatherConditions;
  wind?: WindFieldConfig;
  /** Local wind points outward from the center; it adds to ambient wind. */
  radial?: boolean;
}

/** Serializable weather lists capped at 256 entries. Wind amplitudes and direction components are bounded to 1e6, gust frequency to 1000 Hz; coordinates and times to 1e12 metres/seconds. */
export interface AuthoredWeatherConfig {
  ambient?: WeatherConditions;
  profiles?: readonly AuthoredWeatherProfile[];
  initialProfileId?: string;
  /** Ordered absolute times, relative to the simulation clock. */
  schedule?: readonly AuthoredWeatherTransition[];
  wind?: WindFieldConfig;
  /** Later weather zones blend over earlier ones; wind zones add to ambient wind. */
  zones?: readonly AuthoredWeatherZone[];
}

/** Resolved conditions and wind at a world point and absolute simulation time. */
export interface AuthoredWeatherSample extends WeatherConditions {
  timeSeconds: number;
  wind: WindVector;
  precipitation: number;
  rain: number;
  snow: number;
  dust: number;
}

/** Pure spatial weather queries using the caller’s authoritative simulation clock. */
export interface AuthoredWeather {
  sample(x: number, z: number, timeSeconds: number): AuthoredWeatherSample;
}

const MAX_ENTRIES = 256;
const MAX_MAGNITUDE = 1_000_000;
const MAX_DOMAIN = 1_000_000_000_000;
const MODES: readonly string[] = ["clear", "rain", "snow", "mixed", "dust"];
const CLEAR: WeatherConditions = { mode: "clear", intensity: 0 };

function identifier(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128) throw new Error(`${label} must be a nonempty string of at most 128 characters`);
}

function finite(value: number, label: string, min = -Infinity, max = Infinity): void {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be finite and within ${min}..${max}`);
}

function objectKeys(value: object, allowed: readonly string[], label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label}.${key}: unknown field`);
}

function conditions(value: WeatherConditions, profile = false): void {
  objectKeys(value, ["mode", "intensity", "temperatureOffset", "lightning", ...(profile ? ["id"] : [])], "weather conditions");
  if (!MODES.includes(value.mode)) throw new Error(`unknown weather mode: ${value.mode}`);
  finite(value.intensity, "weather intensity", 0);
  if (value.intensity > 1) throw new Error("weather intensity must be <= 1");
  if (value.temperatureOffset !== undefined) finite(value.temperatureOffset, "weather temperatureOffset", -MAX_MAGNITUDE, MAX_MAGNITUDE);
  if (value.lightning !== undefined) {
    finite(value.lightning, "weather lightning", 0);
    if (value.lightning > 1) throw new Error("weather lightning must be <= 1");
  }
}

function validateWind(value: WindFieldConfig | undefined): void {
  if (value === undefined) return;
  objectKeys(value, ["direction", "speed", "gust", "gustFrequency", "turbulence", "seed"], "wind");
  if (value.direction !== undefined) {
    if (!Array.isArray(value.direction) || value.direction.length !== 2) throw new Error("wind direction requires world X,Z");
    for (const axis of value.direction) finite(axis, "wind direction", -MAX_MAGNITUDE, MAX_MAGNITUDE);
  }
  for (const key of ["speed", "gust", "gustFrequency", "turbulence"] as const) {
    if (value[key] !== undefined) finite(value[key]!, `wind.${key}`, 0, key === "gustFrequency" ? 1000 : MAX_MAGNITUDE);
  }
  if (value.seed !== undefined && typeof value.seed !== "string") finite(value.seed, "wind seed");
}

/** Validate authoring references and work bounds before persisting a weather document.
 * @capability authored-weather-validation Reject invalid weather profiles, schedules, zones and wind before authoring mutations.
 */
export function validateAuthoredWeather(config: AuthoredWeatherConfig): void {
  objectKeys(config, ["ambient", "profiles", "initialProfileId", "schedule", "wind", "zones"], "weather");
  for (const list of [config.profiles, config.schedule, config.zones]) {
    if (list !== undefined && !Array.isArray(list)) throw new Error("weather profiles, schedule and zones must be arrays");
    if (list !== undefined && list.length > MAX_ENTRIES) throw new Error(`weather lists are limited to ${MAX_ENTRIES} entries`);
  }
  if (config.ambient !== undefined) conditions(config.ambient);
  validateWind(config.wind);
  const ids = new Set<string>();
  for (const profile of config.profiles ?? []) {
    identifier(profile.id, "weather profile id");
    if (!profile.id || ids.has(profile.id)) throw new Error(`invalid or duplicate weather profile: ${profile.id}`);
    ids.add(profile.id);
    conditions(profile, true);
  }
  if (config.initialProfileId !== undefined) identifier(config.initialProfileId, "initial weather profile id");
  if (config.initialProfileId !== undefined && !ids.has(config.initialProfileId)) throw new Error(`unknown initial weather profile: ${config.initialProfileId}`);
  let previous = -1;
  for (const entry of config.schedule ?? []) {
    objectKeys(entry, ["atSeconds", "profileId", "transitionSeconds"], "weather schedule");
    identifier(entry.profileId, "scheduled weather profile id");
    finite(entry.atSeconds, "weather schedule time", 0, MAX_DOMAIN);
    if (entry.atSeconds <= previous) throw new Error("weather schedule times must be strictly increasing");
    previous = entry.atSeconds;
    if (!ids.has(entry.profileId)) throw new Error(`unknown weather profile: ${entry.profileId}`);
    if (entry.transitionSeconds !== undefined) finite(entry.transitionSeconds, "weather transition duration", 0, MAX_DOMAIN);
  }
  ids.clear();
  for (const zone of config.zones ?? []) {
    objectKeys(zone, ["id", "center", "radius", "falloff", "weather", "wind", "radial"], "weather zone");
    identifier(zone.id, "weather zone id");
    if (zone.radial !== undefined && typeof zone.radial !== "boolean") throw new Error("weather zone radial must be boolean");
    if (!zone.id || ids.has(zone.id)) throw new Error(`invalid or duplicate weather zone: ${zone.id}`);
    ids.add(zone.id);
    if (!Array.isArray(zone.center) || zone.center.length !== 2) throw new Error("weather zone center requires world X,Z");
    for (const axis of zone.center) finite(axis, "weather zone center", -MAX_DOMAIN, MAX_DOMAIN);
    finite(zone.radius, "weather zone radius", Number.MIN_VALUE, MAX_DOMAIN);
    if (zone.falloff !== undefined) finite(zone.falloff, "weather zone falloff", 0, MAX_DOMAIN);
    if (zone.weather !== undefined) conditions(zone.weather);
    validateWind(zone.wind);
  }
}

function amounts(value: WeatherConditions): readonly [number, number, number] {
  return [
    value.mode === "rain" ? value.intensity : value.mode === "mixed" ? value.intensity * 0.5 : 0,
    value.mode === "snow" ? value.intensity : value.mode === "mixed" ? value.intensity * 0.5 : 0,
    value.mode === "dust" ? value.intensity : 0,
  ];
}

function modeOf(rain: number, snow: number, dust: number): AuthoredWeatherMode {
  if (rain > 0 && snow > 0) return "mixed";
  if (rain > 0) return "rain";
  if (snow > 0) return "snow";
  return dust > 0 ? "dust" : "clear";
}

interface Blend {
  rain: number;
  snow: number;
  dust: number;
  temperatureOffset: number;
  lightning: number;
}

function blendOf(value: WeatherConditions): Blend {
  const [rain, snow, dust] = amounts(value);
  return { rain, snow, dust, temperatureOffset: value.temperatureOffset ?? 0, lightning: value.lightning ?? 0 };
}

function blend(a: Blend, b: Blend, weight: number): Blend {
  const out = { ...a };
  for (const key of ["rain", "snow", "dust", "temperatureOffset", "lightning"] as const) out[key] += (b[key] - a[key]) * weight;
  return out;
}

interface CompiledTransition {
  readonly at: number;
  readonly duration: number;
  readonly from: Readonly<Blend>;
  readonly to: Readonly<Blend>;
}

interface CompiledWeather {
  readonly initial: Readonly<Blend>;
  readonly profiles: ReadonlyMap<string, Readonly<Blend>>;
  readonly ambientWind: WindField | null;
  readonly zones: readonly { readonly zone: AuthoredWeatherZone; readonly field: WindField | null }[];
  readonly transitions: readonly CompiledTransition[];
}

function scheduledWeather(initial: Readonly<Blend>, transitions: readonly CompiledTransition[], time: number): Readonly<Blend> {
  let current = initial;
  for (const entry of transitions) {
    if (time < entry.at) break;
    current = blend(entry.from, entry.to, entry.duration === 0 ? 1 : Math.min(1, (time - entry.at) / entry.duration));
  }
  return current;
}

function compileWeather(source: AuthoredWeatherConfig): CompiledWeather {
  validateAuthoredWeather(source);
  const config = JSON.parse(JSON.stringify(source)) as AuthoredWeatherConfig;
  const profiles = new Map((config.profiles ?? []).map((profile) => [profile.id, Object.freeze(blendOf(profile))]));
  const initial = config.initialProfileId === undefined ? Object.freeze(blendOf(config.ambient ?? CLEAR)) : profiles.get(config.initialProfileId)!;
  const ambientWind = config.wind === undefined ? null : windField(config.wind);
  const zones = (config.zones ?? []).map((zone) => Object.freeze({ zone, field: zone.wind === undefined ? null : windField(zone.wind) }));
  const transitions: CompiledTransition[] = [];
  for (const entry of config.schedule ?? []) {
    transitions.push(Object.freeze({ at: entry.atSeconds, duration: entry.transitionSeconds ?? 0, from: Object.freeze(scheduledWeather(initial, transitions, entry.atSeconds)), to: profiles.get(entry.profileId)! }));
  }
  return Object.freeze({ initial, profiles, ambientWind, zones: Object.freeze(zones), transitions: Object.freeze(transitions) });
}

/** Pure authored weather sampling; the caller's simulation clock owns pause, replay and restore.
 * @capability authored-weather Sample scheduled precipitation and local wind from one authored document and simulation clock.
 */
export function createAuthoredWeather(source: AuthoredWeatherConfig = {}): AuthoredWeather {
  const compiled = compileWeather(source);
  return {
    sample(x, z, timeSeconds) {
      finite(x, "weather sample x", -MAX_DOMAIN, MAX_DOMAIN);
      finite(z, "weather sample z", -MAX_DOMAIN, MAX_DOMAIN);
      finite(timeSeconds, "weather sample time", 0, MAX_DOMAIN);
      let value = scheduledWeather(compiled.initial, compiled.transitions, timeSeconds);
      const ambient = compiled.ambientWind?.atPoint(x, z, timeSeconds) ?? [0, 0];
      let wx = ambient[0]!;
      let wz = ambient[1]!;
      for (const { zone, field } of compiled.zones) {
        const dx = x - zone.center[0];
        const dz = z - zone.center[1];
        const distance = Math.hypot(dx, dz);
        const falloff = zone.falloff ?? 0;
        if (distance > zone.radius + falloff) continue;
        const t = distance <= zone.radius ? 1 : 1 - (distance - zone.radius) / falloff;
        const weight = t * t * (3 - 2 * t);
        if (zone.weather !== undefined) value = blend(value, blendOf(zone.weather), weight);
        if (field !== null) {
          const vector = zoneWind(field, zone.radial ?? false, dx, dz, distance, timeSeconds);
          wx += vector[0] * weight;
          wz += vector[1] * weight;
        }
      }
      const precipitation = value.rain + value.snow;
      return { ...value, mode: modeOf(value.rain, value.snow, value.dust), intensity: Math.min(1, precipitation + value.dust), timeSeconds, wind: [wx, wz], precipitation };
    },
  };
}

function zoneWind(field: WindField, radial: boolean, dx: number, dz: number, distance: number, time: number): WindVector {
  if (!radial) return field.atPoint(dx, dz, time);
  if (distance === 0) return [0, 0];
  const speed = field.strengthAt(dx, dz, time);
  return [dx / distance * speed, dz / distance * speed];
}

/** Surface capacity and normalized wetting, drying, snowfall and melting rates per second. */
export interface WeatherExposureConfig {
  maxSurfaces?: number;
  /** Accumulation and drying rates in normalized coverage/second. */
  wettingRate?: number;
  dryingRate?: number;
  snowRate?: number;
  meltRate?: number;
}

/** A stable surface id and world X,Z position with explicit sky exposure and temperature. */
export interface WeatherExposureSurface {
  id: string;
  x: number;
  z: number;
  /** Fraction of open sky; 0 means fully sheltered. */
  exposure?: number;
  /** Degrees above zero melt snow; omitted uses the weather temperature offset. */
  temperature?: number;
}

/** Retained normalized wetness and snow coverage, temperature, and sky exposure. */
export interface WeatherExposureSample {
  wetness: number;
  snow: number;
  heat: number;
  exposure: number;
}

/** Detached accumulation values keyed by retained surface id. */
export interface WeatherExposureSnapshot {
  surfaces: { id: string; value: WeatherExposureSample }[];
}

/** Injected persistence for detached surface accumulation snapshots. */
export interface WeatherExposureStorage {
  read(): WeatherExposureSnapshot | undefined;
  write(snapshot: WeatherExposureSnapshot): void;
}

/** Bounded surface accumulation with restoration, live rate tuning and explicit release. */
export interface WeatherExposure {
  step(dt: number, timeSeconds: number, surfaces: readonly WeatherExposureSurface[], weather: AuthoredWeather): void;
  sample(id: string): WeatherExposureSample | null;
  forget(id: string): void;
  snapshot(): WeatherExposureSnapshot;
  restore(state: WeatherExposureSnapshot): void;
  retune(config: WeatherExposureConfig): void;
}

function exposureConfig(config: WeatherExposureConfig): Required<WeatherExposureConfig> {
  const out = { maxSurfaces: config.maxSurfaces ?? 1024, wettingRate: config.wettingRate ?? 0.2, dryingRate: config.dryingRate ?? 0.05, snowRate: config.snowRate ?? 0.1, meltRate: config.meltRate ?? 0.02 };
  if (!Number.isInteger(out.maxSurfaces) || out.maxSurfaces < 1 || out.maxSurfaces > 65_536) throw new Error("weather exposure maxSurfaces must be an integer in 1..65536");
  for (const key of ["wettingRate", "dryingRate", "snowRate", "meltRate"] as const) finite(out[key], `weather exposure ${key}`, 0);
  return out;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Bounded surface accumulation shared by gameplay and material adapters, with injected persistence.
 * @capability weather-surface-accumulation Persist and retune bounded surface wetness, snow, temperature and exposure independently of rendering.
 */
export function createWeatherExposure(config: WeatherExposureConfig = {}, storage?: WeatherExposureStorage): WeatherExposure {
  let tuning = exposureConfig(config);
  const values = new Map<string, WeatherExposureSample>();
  const snapshot = (): WeatherExposureSnapshot => ({ surfaces: Array.from(values, ([id, value]) => ({ id, value: { ...value } })) });
  const persist = (): void => storage?.write(snapshot());
  function restore(state: WeatherExposureSnapshot): void {
    if (state.surfaces.length > tuning.maxSurfaces) throw new Error("weather exposure snapshot exceeds capacity");
    const next = new Map<string, WeatherExposureSample>();
    for (const entry of state.surfaces) {
      if (!entry.id || next.has(entry.id)) throw new Error("weather exposure snapshot has invalid surface ids");
      for (const key of ["wetness", "snow", "heat", "exposure"] as const) finite(entry.value[key], `weather exposure ${key}`);
      for (const key of ["wetness", "snow", "exposure"] as const) if (entry.value[key] < 0 || entry.value[key] > 1) throw new Error(`weather exposure ${key} must be in 0..1`);
      next.set(entry.id, { ...entry.value });
    }
    values.clear();
    for (const [id, value] of next) values.set(id, value);
    persist();
  }
  const saved = storage?.read();
  if (saved !== undefined) restore(saved);
  return {
    step(dt, timeSeconds, surfaces, weather) {
      finite(dt, "weather exposure dt", 0);
      finite(timeSeconds, "weather exposure time", 0);
      if (dt === 0) return;
      if (surfaces.length > tuning.maxSurfaces) throw new Error("weather exposure step exceeds capacity");
      const ids = new Set<string>();
      let added = 0;
      for (const surface of surfaces) {
        if (!surface.id || ids.has(surface.id)) throw new Error("weather exposure step has invalid surface ids");
        ids.add(surface.id);
        finite(surface.x, "weather exposure x");
        finite(surface.z, "weather exposure z");
        if (surface.exposure !== undefined) finite(surface.exposure, "weather exposure exposure", 0);
        if ((surface.exposure ?? 1) > 1) throw new Error("weather exposure exposure must be <= 1");
        if (surface.temperature !== undefined) finite(surface.temperature, "weather exposure temperature");
        if (!values.has(surface.id)) added += 1;
      }
      if (values.size + added > tuning.maxSurfaces) throw new Error("weather exposure capacity exhausted; forget unused surfaces");
      for (const surface of surfaces) {
        const sample = weather.sample(surface.x, surface.z, timeSeconds);
        const current = values.get(surface.id) ?? { wetness: 0, snow: 0, heat: 0, exposure: 1 };
        const exposure = surface.exposure ?? 1;
        const heat = surface.temperature ?? sample.temperatureOffset ?? 0;
        const rain = sample.rain * exposure;
        const snowfall = sample.snow * exposure * tuning.snowRate * dt;
        const melt = Math.min(current.snow + snowfall, Math.max(0, heat) * tuning.meltRate * dt);
        values.set(surface.id, {
          wetness: clamp01(current.wetness + (rain * tuning.wettingRate - (1 - rain) * tuning.dryingRate) * dt + melt),
          snow: clamp01(current.snow + snowfall - melt),
          heat,
          exposure,
        });
      }
      persist();
    },
    sample(id) { const value = values.get(id); return value === undefined ? null : { ...value }; },
    forget(id) { if (values.delete(id)) persist(); },
    snapshot,
    restore,
    retune(next) {
      const resolved = exposureConfig(next);
      if (values.size > resolved.maxSurfaces) throw new Error("weather exposure retune capacity is below retained surface count");
      tuning = resolved;
    },
  };
}

/** Environment temperature, sunlight and shelter read the same authored precipitation as rendering.
 * @capability weather-environment-field Connect authored precipitation and temperature changes to spatial environment queries.
 */
export function createWeatherEnvironmentField(weather: AuthoredWeather, config: Omit<EnvironmentFieldConfig, "rain"> = {}): EnvironmentField {
  const base = createEnvironmentField({ ...config, rain: (x, z, time) => weather.sample(x, z, time).rain });
  const temperature = (x: number, z: number, time: number, y?: number): number => base.temperature(x, z, time, y) + (weather.sample(x, z, time).temperatureOffset ?? 0);
  return {
    ...base,
    temperature,
    sample(x, z, time, y) { return { ...base.sample(x, z, time, y), temperature: temperature(x, z, time, y) }; },
  };
}
