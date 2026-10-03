import { validateForceField, type ForceFieldConfig } from "../physics/forceVolume";
import type { AuthoredWeatherConfig } from "../world/authoredWeather";
import { validateAuthoredWeather } from "../world/authoredWeather";
import { validateEmitterConfig, type EmitterConfig } from "../vfx/particles";
import { validateParticleAttachOptions, type ParticleAttachOptions } from "../vfx/particleDirector";
import type { FireGridConfig } from "../world/weather";
import type { FlockConfig } from "../ai/flock";
import type { EditorDocument, EditorVec3 } from "./types";

/** A named emitter authored in metres, with game-owned appearance and attachment ids. */
export interface AuthoredEmitter {
  id: string;
  /** Spawn only while this authored fire area burns; live particles finish their lifetime. */
  fireAreaId?: string;
  position: EditorVec3;
  config: EmitterConfig;
  options?: ParticleAttachOptions;
}

/** A bounded fire grid; fuel and damage policy remain game content. */
export interface AuthoredFireArea {
  id: string;
  /** Rain cooling in heat units/second at full exposure; zero disables automatic extinguishing. */
  extinguishRate?: number;
  position: EditorVec3;
  config: Omit<FireGridConfig, "fuelAt" | "origin" | "wind">;
  fuel?: readonly number[];
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
    text(row.id, `${location}.id`);
    if (ids.has(row.id as string)) throw new Error(`${location}.id: duplicate id ${row.id}`);
    ids.add(row.id as string);
    vector(row.position, `${location}.position`);
    check(row, location);
  });
}

/** Decode authoring inputs with located diagnostics and bounded work before any document mutation.
 * @capability validate-simulation diagnose authored weather, effect, fire, force and habitat documents before publication
 */
export function decodeEditorSimulation(value: unknown, document?: Pick<EditorDocument, "paths">): EditorSimulation {
  const source = object(value, "$.simulation");
  known(source, ["weather", "forces", "emitters", "fires", "habitats"], "$.simulation");
  serializable(source, "$.simulation");
  if (source.weather !== undefined) {
    object(source.weather, "$.simulation.weather");
    try { validateAuthoredWeather(source.weather as AuthoredWeatherConfig); }
    catch (error) { throw new Error(`$.simulation.weather: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (source.forces !== undefined) {
    if (!Array.isArray(source.forces) || source.forces.length > 128) throw new Error("$.simulation.forces: expected at most 128 fields");
    source.forces.forEach((value, index) => {
      try { validateForceField(value as ForceFieldConfig); }
      catch (error) { throw new Error(`$.simulation.forces[${index}]: ${error instanceof Error ? error.message : String(error)}`); }
    });
  }
  rows(source.emitters, "$.simulation.emitters", 128, (row, path) => {
    known(row, ["id", "position", "config", "options", "fireAreaId"], path);
    if (row.fireAreaId !== undefined) {
      text(row.fireAreaId, `${path}.fireAreaId`);
      if (!Array.isArray(source.fires) || !source.fires.some((area) => area !== null && typeof area === "object" && (area as Record<string, unknown>).id === row.fireAreaId)) throw new Error(`${path}.fireAreaId: missing fire area ${row.fireAreaId}`);
    }
    const diagnostics = validateEmitterConfig(row.config);
    if (diagnostics.length) throw new Error(`${path}.config: ${diagnostics.join("; ")}`);
    if (row.options !== undefined) { const errors = validateParticleAttachOptions(row.options); if (errors.length) throw new Error(`${path}.options: ${errors.join("; ")}`); }
    const config = object(row.config, `${path}.config`);
    for (const key of ["max", "rate", "spread", "drag"]) if (config[key] !== undefined) finite(config[key], `${path}.config.${key}`, 0, key === "max" ? 100_000 : key === "drag" ? 1 : Infinity);
    if (config.max !== undefined && !Number.isInteger(config.max)) throw new Error(`${path}.config.max: expected an integer`);
    for (const key of ["position", "spawnJitter", "direction", "gravity"]) if (config[key] !== undefined) tuple(config[key], `${path}.config.${key}`);
    for (const key of ["lifetime", "speed"]) if (config[key] !== undefined) {
      const range = object(config[key], `${path}.config.${key}`);
      finite(range.min, `${path}.config.${key}.min`, 0);
      finite(range.max, `${path}.config.${key}.max`, range.min as number);
    }
    if (row.options !== undefined) {
      const options = object(row.options, `${path}.options`);
      if (options.space !== undefined && options.space !== "local" && options.space !== "world") throw new Error(`${path}.options.space: expected local or world`);
      if (options.active !== undefined && typeof options.active !== "boolean") throw new Error(`${path}.options.active: expected boolean`);
    }
  });
  rows(source.fires, "$.simulation.fires", 32, (row, path) => {
    known(row, ["id", "position", "config", "fuel", "ignitions", "extinguishRate"], path);
    if (row.extinguishRate !== undefined) finite(row.extinguishRate, `${path}.extinguishRate`, 0);
    const config = object(row.config, `${path}.config`);
    known(config, ["cols", "rows", "cellSize", "ignitionThreshold", "spreadRate", "burnRate", "windBias", "maxCells"], `${path}.config`);
    const cols = finite(config.cols, `${path}.config.cols`, 1, 256);
    const count = cols * finite(config.rows, `${path}.config.rows`, 1, 256);
    if (!Number.isInteger(cols) || !Number.isInteger(config.rows) || count > 16_384) throw new Error(`${path}.config: expected integral dimensions with at most 16384 cells`);
    finite(config.cellSize, `${path}.config.cellSize`, Number.EPSILON);
    if (config.maxCells !== undefined) {
      const capacity = finite(config.maxCells, `${path}.config.maxCells`, count, 1_048_576);
      if (!Number.isInteger(capacity)) throw new Error(`${path}.config.maxCells: expected an integer`);
    }
    for (const key of ["ignitionThreshold", "spreadRate", "burnRate", "windBias"]) if (config[key] !== undefined) finite(config[key], `${path}.config.${key}`, 0, key === "windBias" ? 1 : Infinity);
    if (row.fuel !== undefined) {
      if (!Array.isArray(row.fuel) || row.fuel.length !== count) throw new Error(`${path}.fuel: expected ${count} cell values`);
      row.fuel.forEach((fuel, index) => finite(fuel, `${path}.fuel[${index}]`, 0, 1));
    }
    if (row.ignitions !== undefined) {
      if (!Array.isArray(row.ignitions) || row.ignitions.length > count) throw new Error(`${path}.ignitions: expected at most ${count} cells`);
      for (const cell of row.ignitions) {
        const point = object(cell, `${path}.ignitions`);
        known(point, ["col", "row"], `${path}.ignitions`);
        finite(point.col, `${path}.ignitions.col`, 0, cols - 1);
        finite(point.row, `${path}.ignitions.row`, 0, (config.rows as number) - 1);
        if (!Number.isInteger(point.col) || !Number.isInteger(point.row)) throw new Error(`${path}.ignitions: expected integral cell coordinates`);
      }
    }
  });
  rows(source.habitats, "$.simulation.habitats", 32, (row, path) => {
    known(row, ["id", "species", "position", "radius", "count", "seed", "role", "routeId", "steering", "windResponse", "maxAcceleration", "forceMask"], path);
    text(row.species, `${path}.species`);
    finite(row.radius, `${path}.radius`, Number.EPSILON);
    const count = finite(row.count, `${path}.count`, 0, 256);
    if (!Number.isInteger(count)) throw new Error(`${path}.count: expected an integer`);
    if (row.role !== "cosmetic" && row.role !== "gameplay") throw new Error(`${path}.role: expected cosmetic or gameplay`);
    if (typeof row.seed !== "string" && typeof row.seed !== "number") throw new Error(`${path}.seed: expected string or number`);
    if (typeof row.seed === "number") finite(row.seed, `${path}.seed`);
    for (const key of ["windResponse", "maxAcceleration"]) if (row[key] !== undefined) finite(row[key], `${path}.${key}`, 0, 1e12);
    if (row.forceMask !== undefined) {
      finite(row.forceMask, `${path}.forceMask`, 0, 0xffffffff);
      if (!Number.isInteger(row.forceMask)) throw new Error(`${path}.forceMask: expected a uint32`);
    }
    const steering = object(row.steering, `${path}.steering`);
    known(steering, ["maxSpeed", "accel", "separationRadius", "separationWeight", "neighborRadius", "cohesionWeight", "alignmentWeight", "seekWeight", "stragglerRadius", "stragglerBoost"], `${path}.steering`);
    for (const key of ["maxSpeed", "separationRadius", "neighborRadius"]) finite(steering[key], `${path}.steering.${key}`, Number.EPSILON);
    for (const [key, item] of Object.entries(steering)) finite(item, `${path}.steering.${key}`, 0);
    if (row.routeId !== undefined) {
      text(row.routeId, `${path}.routeId`);
      if (document !== undefined && !document.paths.some((route) => route.id === row.routeId && route.points.length > 1)) throw new Error(`${path}.routeId: missing route ${row.routeId} with at least two points`);
    }
  });
  return structuredClone(source) as EditorSimulation;
}
