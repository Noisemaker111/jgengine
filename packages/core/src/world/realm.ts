import { createEnvironmentField, type EnvironmentField, type EnvironmentFieldConfig } from "./envField";
import type { WeatherState } from "./weather";

/** The recomposable environment parameters a realm card can override. */
export interface RealmEnvironmentParams {
  baseTemperature: number;
  nightDrop: number;
  altitudeLapse: number;
  /** Game-seconds per day (a "long night" minor card shortens the day cycle). */
  dayLength: number;
  /** Ambient rain intensity 0..1. */
  rain: number;
  /** Ambient light floor 0..1 (moonlight). */
  ambientFloor: number;
}

export const DEFAULT_REALM_ENVIRONMENT: RealmEnvironmentParams = {
  baseTemperature: 20,
  nightDrop: 12,
  altitudeLapse: 0,
  dayLength: 24 * 3600,
  rain: 0,
  ambientFloor: 0.05,
};

/** Spawn-table edits a card layers on: replace weights, add/scale, or remove ids. */
export interface SpawnTableOverride {
  set?: Record<string, number>;
  add?: Record<string, number>;
  scale?: Record<string, number>;
  remove?: readonly string[];
}

export interface RealmCard {
  id: string;
  /** A major card sets the biome base; minors layer weather/day-length/aesthetic on top. */
  kind: "major" | "minor";
  /** Environment param overrides (last write wins across the ordered deck). */
  environment?: Partial<RealmEnvironmentParams>;
  /** Weather state overrides (kind/intensity/wind). */
  weather?: Partial<WeatherState>;
  /** Spawn-table edits applied in deck order. */
  spawn?: SpawnTableOverride;
  /** Opaque aesthetic tag (skybox, palette) the renderer maps — engine never inspects it. */
  aesthetic?: string;
}

export interface RealmBase {
  environment?: Partial<RealmEnvironmentParams>;
  weather?: WeatherState;
  spawn?: Record<string, number>;
}

export interface ComposedRealm {
  params: RealmEnvironmentParams;
  weather: WeatherState;
  spawnTable: Record<string, number>;
  aesthetics: readonly string[];
  cards: readonly RealmCard[];
  /**
   * Build an environment field (#91) from the composed params, wired to the composed
   * weather's rain intensity. Extra config (terrain, occluders, heat sources) merges on top.
   */
  environmentField(extra?: Omit<EnvironmentFieldConfig, "baseTemperature" | "nightDrop" | "altitudeLapse" | "dayLength" | "rain" | "ambientFloor">): EnvironmentField;
}

function applySpawn(table: Record<string, number>, override: SpawnTableOverride | undefined): void {
  if (override === undefined) return;
  if (override.set !== undefined) for (const [id, weight] of Object.entries(override.set)) table[id] = weight;
  if (override.add !== undefined) for (const [id, weight] of Object.entries(override.add)) table[id] = (table[id] ?? 0) + weight;
  if (override.scale !== undefined) for (const [id, factor] of Object.entries(override.scale)) table[id] = (table[id] ?? 0) * factor;
  if (override.remove !== undefined) for (const id of override.remove) delete table[id];
}

/**
 * Assemble a played realm instance at runtime from a deck of modifier cards — the
 * Nightingale "realm card" model. A major card is the biome base; minor cards layer
 * weather, day length, and spawn edits. The result recomposes both the environment
 * (into a sampleable field via `environmentField()`) and the spawn table, and it depends
 * on the weather hooks in this group (#92) to turn its `weather` into gameplay modifiers.
 * Cards apply in array order; sort your deck (majors first) before composing.
 */
export function composeRealm(base: RealmBase, cards: readonly RealmCard[]): ComposedRealm {
  const params: RealmEnvironmentParams = { ...DEFAULT_REALM_ENVIRONMENT, ...base.environment };
  let weather: WeatherState = base.weather ?? { kind: "clear", intensity: 0 };
  const spawnTable: Record<string, number> = { ...base.spawn };
  const aesthetics: string[] = [];

  for (const card of cards) {
    if (card.environment !== undefined) Object.assign(params, card.environment);
    if (card.weather !== undefined) weather = { ...weather, ...card.weather };
    applySpawn(spawnTable, card.spawn);
    if (card.aesthetic !== undefined) aesthetics.push(card.aesthetic);
  }

  return {
    params,
    weather,
    spawnTable,
    aesthetics,
    cards,
    environmentField(extra) {
      return createEnvironmentField({
        ...extra,
        baseTemperature: params.baseTemperature,
        nightDrop: params.nightDrop,
        altitudeLapse: params.altitudeLapse,
        dayLength: params.dayLength,
        rain: weather.kind === "clear" ? 0 : params.rain,
        ambientFloor: params.ambientFloor,
      });
    },
  };
}
