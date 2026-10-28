import { validateForceField, type ForceFieldConfig } from "../physics/forceVolume";
import type { AuthoredWeatherConfig } from "@jgengine/core/weather/authoredWeather";
import { validateAuthoredWeather } from "@jgengine/core/weather/authoredWeather";
import { validateEmitterConfig, type EmitterConfig } from "../vfx/particles";
import { effectNames } from "../vfx/effectLibrary";
import { validateParticleAttachOptions, type ParticleAttachOptions } from "../vfx/particleDirector";
import { MOISTURE_SCENARIOS, standardFuelModel } from "../fire/fuelModels";
import type { FlockConfig } from "../ai/flock";
import type { EditorDocument, EditorVec3 } from "./types";

/** A named emitter authored in metres: either a library effect name or a full config. */
export interface AuthoredEmitter {
  id: string;
  /** Spawn only while this authored fire area burns; live particles finish their lifetime. */
  fireAreaId?: string;
  position: EditorVec3;
  /** Named effect from the shared library (`fire/flame`, `explosion/core`, …). */
  effect?: string;
  /** Full emitter config; used when `effect` is absent. */
  config?: EmitterConfig;
  options?: ParticleAttachOptions;
}

/** A bounded landscape fire (`@jgengine/core/fire`): standard fuel models per cell, burning under the authored weather. */
export interface AuthoredFireArea {
  id: string;
  /** World position of the grid's (0,0) corner, metres. */
  position: EditorVec3;
  cols: number;
  rows: number;
  /** Cell edge, metres. */
  cellSize: number;
  /** Standard fuel model codes the cells use (Scott & Burgan `GR2`, Anderson `FM4`, non-burnable `NB1`). */
  fuels: readonly string[];
  /** Index into `fuels` per cell, row-major; every cell uses `fuels[0]` when absent. */
  fuel?: readonly number[];
  /** Starting fuel moisture, a Scott & Burgan scenario `D1L1`..`D4L4`. Default `D2L2`. */
  moisture?: string;
  /** Air temperature the fuel dries in, °C, before the weather's temperature offset. Default 25. */
  airTemperatureC?: number;
  /** Relative humidity the fuel dries in, 0..1. Default 0.3. */
  relativeHumidity?: number;
  /** Seed for ember spotting. Default the area id. */
  seed?: string | number;
  ignitions?: readonly { col: number; row: number }[];
}

/** An authored habitat selects a game species and optionally follows a document path. */
export interface AuthoredFlockHabitat {
  id: string;
  species: string;
  position: EditorVec3;
  radius: number;
  count: number;
  seed: string | number;
  role: "cosmetic" | "gameplay";
  routeId?: string;
  steering: FlockConfig;
  /** Opt into authored wind/force acceleration; maxAcceleration is the game policy cap. */
  /** Coupling in 1/second, bounded to 0..1e12. */
  windResponse?: number;
  /** Maximum acceleration in metres/second², bounded to 0..1e12. */
  maxAcceleration?: number;
  forceMask?: number;
}

/** Authored simulation inputs. Runtime particles, heat, accumulation and actors save separately. */
export interface EditorSimulation {
  weather?: AuthoredWeatherConfig;
  /** Authoritative acceleration volumes; games select target masks and caps. */
  forces?: readonly ForceFieldConfig[];
  emitters?: readonly AuthoredEmitter[];
  fires?: readonly AuthoredFireArea[];
  habitats?: readonly AuthoredFlockHabitat[];
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected an object`);
  return value as Record<string, unknown>;
}

function known(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${path}.${key}: unknown field`);
}

function finite(value: unknown, path: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${path}: expected a finite number in ${min}..${max}`);
  return value;
}

function text(value: unknown, path: string): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128) throw new Error(`${path}: expected a nonempty string of at most 128 characters`);
}

function vector(value: unknown, path: string): void {
  const point = object(value, path);
  for (const axis of ["x", "y", "z"]) finite(point[axis], `${path}.${axis}`);
}

function tuple(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${path}: expected [x,y,z]`);
  value.forEach((component, index) => finite(component, `${path}[${index}]`));
}

function serializable(value: unknown, path: string, depth = 0): void {
  if (depth > 24) throw new Error(`${path}: nesting exceeds 24 levels`);
  if (value === null || typeof value === "string" || typeof value === "boolean" || value === undefined) return;
  if (typeof value === "number") { finite(value, path); return; }
  if (typeof value !== "object") throw new Error(`${path}: expected serializable data`);
  for (const [key, item] of Object.entries(value)) serializable(item, `${path}.${key}`, depth + 1);
}

function rows(value: unknown, path: string, limit: number, check: (row: Record<string, unknown>, path: string) => void): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > limit) throw new Error(`${path}: expected at most ${limit} entries`);
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const location = `${path}[${index}]`;
    const row = object(entry, location);
    text(row["id"], `${location}.id`);
    if (ids.has(row["id"] as string)) throw new Error(`${location}.id: duplicate id ${row["id"]}`);
    ids.add(row["id"] as string);
    vector(row["position"], `${location}.position`);
    check(row, location);
  });
}

/** Fuel model a saved scene's fire area burns when it was authored with the cellular grid's 0..1 fuel amounts. */
const MIGRATED_FIRE_FUEL = "GR2";

/** Rewrite a fire area saved by the cellular fire grid (`config: { cols, rows, cellSize, ... }`, 0..1 fuel) as a fuel-model area. */
function migrateFireArea(entry: unknown): unknown {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return entry;
  const { config, fuel, ...rest } = entry as Record<string, unknown>;
  delete rest["extinguishRate"];
  if (config === null || typeof config !== "object" || Array.isArray(config)) return entry;
  const grid = config as Record<string, unknown>;
  const amounts = Array.isArray(fuel) ? fuel : undefined;
  const bare = amounts?.some((amount) => amount === 0) === true;
  return {
    ...rest,
    cols: grid["cols"],
    rows: grid["rows"],
    cellSize: grid["cellSize"],
    fuels: bare ? [MIGRATED_FIRE_FUEL, "NB1"] : [MIGRATED_FIRE_FUEL],
    ...(bare && amounts !== undefined ? { fuel: amounts.map((amount) => (amount === 0 ? 1 : 0)) } : {}),
  };
}

/** Decode authoring inputs with located diagnostics and bounded work before any document mutation.
 * @capability validate-simulation diagnose authored weather, effect, fire, force and habitat documents before publication
 */
export function decodeEditorSimulation(value: unknown, document?: Pick<EditorDocument, "paths">): EditorSimulation {
  const source = { ...object(value, "$.simulation") };
  if (Array.isArray(source["fires"])) source["fires"] = source["fires"].map(migrateFireArea);
  known(source, ["weather", "forces", "emitters", "fires", "habitats"], "$.simulation");
  serializable(source, "$.simulation");
  if (source["weather"] !== undefined) {
    object(source["weather"], "$.simulation.weather");
    try { validateAuthoredWeather(source["weather"] as AuthoredWeatherConfig); }
    catch (error) { throw new Error(`$.simulation.weather: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (source["forces"] !== undefined) {
    if (!Array.isArray(source["forces"]) || source["forces"].length > 128) throw new Error("$.simulation.forces: expected at most 128 fields");
    source["forces"].forEach((value, index) => {
      try { validateForceField(value as ForceFieldConfig); }
      catch (error) { throw new Error(`$.simulation.forces[${index}]: ${error instanceof Error ? error.message : String(error)}`); }
    });
  }
  rows(source["emitters"], "$.simulation.emitters", 128, (row, path) => {
    known(row, ["id", "position", "effect", "config", "options", "fireAreaId"], path);
    if (row["fireAreaId"] !== undefined) {
      text(row["fireAreaId"], `${path}.fireAreaId`);
      if (!Array.isArray(source["fires"]) || !source["fires"].some((area) => area !== null && typeof area === "object" && (area as Record<string, unknown>)["id"] === row["fireAreaId"])) throw new Error(`${path}.fireAreaId: missing fire area ${row["fireAreaId"]}`);
    }
    if ((row["effect"] === undefined) === (row["config"] === undefined)) throw new Error(`${path}: expected exactly one of effect or config`);
    if (row["effect"] !== undefined) {
      text(row["effect"], `${path}.effect`);
      if (!effectNames().includes(row["effect"] as string)) throw new Error(`${path}.effect: unknown effect ${row["effect"]}`);
    } else {
      const diagnostics = validateEmitterConfig(row["config"]);
      if (diagnostics.length) throw new Error(`${path}.config: ${diagnostics.join("; ")}`);
      const config = object(row["config"], `${path}.config`);
      for (const key of ["max", "rate", "spread", "drag"]) if (config[key] !== undefined) finite(config[key], `${path}.config.${key}`, 0, key === "max" ? 100_000 : key === "drag" ? 1 : Infinity);
      if (config["max"] !== undefined && !Number.isInteger(config["max"])) throw new Error(`${path}.config.max: expected an integer`);
      for (const key of ["position", "spawnJitter", "direction", "gravity"]) if (config[key] !== undefined) tuple(config[key], `${path}.config.${key}`);
      for (const key of ["lifetime", "speed"]) if (config[key] !== undefined) {
        const range = object(config[key], `${path}.config.${key}`);
        finite(range["min"], `${path}.config.${key}.min`, 0);
        finite(range["max"], `${path}.config.${key}.max`, range["min"] as number);
      }
    }
    if (row["options"] !== undefined) { const errors = validateParticleAttachOptions(row["options"]); if (errors.length) throw new Error(`${path}.options: ${errors.join("; ")}`); }
    if (row["options"] !== undefined) {
      const options = object(row["options"], `${path}.options`);
      if (options["space"] !== undefined && options["space"] !== "local" && options["space"] !== "world") throw new Error(`${path}.options.space: expected local or world`);
      if (options["active"] !== undefined && typeof options["active"] !== "boolean") throw new Error(`${path}.options.active: expected boolean`);
    }
  });
  rows(source["fires"], "$.simulation.fires", 32, (row, path) => {
    known(row, ["id", "position", "cols", "rows", "cellSize", "fuels", "fuel", "moisture", "airTemperatureC", "relativeHumidity", "seed", "ignitions"], path);
    const cols = finite(row["cols"], `${path}.cols`, 1, 256);
    const rowCount = finite(row["rows"], `${path}.rows`, 1, 256);
    const count = cols * rowCount;
    if (!Number.isInteger(cols) || !Number.isInteger(rowCount) || count > 16_384) throw new Error(`${path}: expected integral dimensions with at most 16384 cells`);
    finite(row["cellSize"], `${path}.cellSize`, Number.EPSILON);
    const fuels = row["fuels"];
    if (!Array.isArray(fuels) || fuels.length < 1 || fuels.length > 255) throw new Error(`${path}.fuels: expected 1..255 fuel model codes`);
    fuels.forEach((code, index) => { if (typeof code !== "string" || standardFuelModel(code) === undefined) throw new Error(`${path}.fuels[${index}]: unknown fuel model ${String(code)}`); });
    if (row["fuel"] !== undefined) {
      if (!Array.isArray(row["fuel"]) || row["fuel"].length !== count) throw new Error(`${path}.fuel: expected ${count} cell values`);
      row["fuel"].forEach((fuel, index) => { if (!Number.isInteger(finite(fuel, `${path}.fuel[${index}]`, 0, fuels.length - 1))) throw new Error(`${path}.fuel[${index}]: expected a fuel index`); });
    }
    if (row["moisture"] !== undefined && (typeof row["moisture"] !== "string" || MOISTURE_SCENARIOS[row["moisture"]] === undefined)) throw new Error(`${path}.moisture: expected a moisture scenario D1L1..D4L4`);
    if (row["airTemperatureC"] !== undefined) finite(row["airTemperatureC"], `${path}.airTemperatureC`, -60, 60);
    if (row["relativeHumidity"] !== undefined) finite(row["relativeHumidity"], `${path}.relativeHumidity`, 0, 1);
    if (row["seed"] !== undefined && typeof row["seed"] !== "string") finite(row["seed"], `${path}.seed`);
    if (row["ignitions"] !== undefined) {
      if (!Array.isArray(row["ignitions"]) || row["ignitions"].length > count) throw new Error(`${path}.ignitions: expected at most ${count} cells`);
      for (const cell of row["ignitions"]) {
        const point = object(cell, `${path}.ignitions`);
        known(point, ["col", "row"], `${path}.ignitions`);
        finite(point["col"], `${path}.ignitions.col`, 0, cols - 1);
        finite(point["row"], `${path}.ignitions.row`, 0, rowCount - 1);
        if (!Number.isInteger(point["col"]) || !Number.isInteger(point["row"])) throw new Error(`${path}.ignitions: expected integral cell coordinates`);
      }
    }
  });
  rows(source["habitats"], "$.simulation.habitats", 32, (row, path) => {
    known(row, ["id", "species", "position", "radius", "count", "seed", "role", "routeId", "steering", "windResponse", "maxAcceleration", "forceMask"], path);
    text(row["species"], `${path}.species`);
    finite(row["radius"], `${path}.radius`, Number.EPSILON);
    const count = finite(row["count"], `${path}.count`, 0, 256);
    if (!Number.isInteger(count)) throw new Error(`${path}.count: expected an integer`);
    if (row["role"] !== "cosmetic" && row["role"] !== "gameplay") throw new Error(`${path}.role: expected cosmetic or gameplay`);
    if (typeof row["seed"] !== "string" && typeof row["seed"] !== "number") throw new Error(`${path}.seed: expected string or number`);
    if (typeof row["seed"] === "number") finite(row["seed"], `${path}.seed`);
    for (const key of ["windResponse", "maxAcceleration"]) if (row[key] !== undefined) finite(row[key], `${path}.${key}`, 0, 1e12);
    if (row["forceMask"] !== undefined) {
      finite(row["forceMask"], `${path}.forceMask`, 0, 0xffffffff);
      if (!Number.isInteger(row["forceMask"])) throw new Error(`${path}.forceMask: expected a uint32`);
    }
    const steering = object(row["steering"], `${path}.steering`);
    known(steering, ["maxSpeed", "accel", "separationRadius", "separationWeight", "neighborRadius", "cohesionWeight", "alignmentWeight", "seekWeight", "stragglerRadius", "stragglerBoost"], `${path}.steering`);
    for (const key of ["maxSpeed", "separationRadius", "neighborRadius"]) finite(steering[key], `${path}.steering.${key}`, Number.EPSILON);
    for (const [key, item] of Object.entries(steering)) finite(item, `${path}.steering.${key}`, 0);
    if (row["routeId"] !== undefined) {
      text(row["routeId"], `${path}.routeId`);
      if (document !== undefined && !document.paths.some((route) => route.id === row["routeId"] && route.points.length > 1)) throw new Error(`${path}.routeId: missing route ${row["routeId"]} with at least two points`);
    }
  });
  return structuredClone(source) as EditorSimulation;
}
