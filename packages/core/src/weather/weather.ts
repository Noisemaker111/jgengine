// @skill jgengine-world
import type { WindVector } from "@jgengine/core/world/wind";

/** A weather kind's name, as a game's {@link WeatherModifierTable} keys it (`"rain"`, `"storm"`, ...). */
export type WeatherKind = string;

/** The weather now: its kind, intensity 0..1 and optional wind. */
export interface WeatherState {
  kind: WeatherKind;
  intensity: number;
  wind?: WindVector;
}

/** How one weather kind changes play at full intensity: grip, visibility, structure damage, chill, fire ignition and spread. */
export interface WeatherModifier {
  grip?: number;
  visibility?: number;
  structureDamage?: number;
  chill?: number;
  ignition?: number;
  spread?: number;
}

/** A game's weather kinds, each with its {@link WeatherModifier}. */
export type WeatherModifierTable<K extends string = string> = Record<K, WeatherModifier>;

/** The kind names a {@link WeatherModifierTable} defines. */
export type WeatherKindOf<TTable extends WeatherModifierTable> = Extract<keyof TTable, string>;

/** Every {@link WeatherModifier} field for the current weather, scaled by its intensity. */
export interface ResolvedWeather {
  grip: number;
  visibility: number;
  structureDamage: number;
  chill: number;
  ignition: number;
  spread: number;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Resolve the current weather against a game's modifier table; throws on a kind the table does not define. */
export function resolveWeather<TTable extends WeatherModifierTable>(
  state: WeatherState,
  table: TTable,
): ResolvedWeather {
  const entry = table[state.kind as WeatherKindOf<TTable>] as WeatherModifier | undefined;
  if (entry === undefined) {
    const known = Object.keys(table).sort().join(", ");
    throw new Error(
      `Unknown weather kind "${state.kind}". Known kinds: ${known.length > 0 ? known : "(none)"}.`,
    );
  }
  const t = Math.max(0, Math.min(1, state.intensity));
  return {
    grip: lerp(1, entry.grip ?? 1, t),
    visibility: lerp(1, entry.visibility ?? 1, t),
    structureDamage: (entry.structureDamage ?? 0) * t,
    chill: (entry.chill ?? 0) * t,
    ignition: (entry.ignition ?? 0) * t,
    spread: lerp(1, entry.spread ?? 1, t),
  };
}
