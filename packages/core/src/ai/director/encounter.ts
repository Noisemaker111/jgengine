import { seededRng } from "../../random/rng";
import type { FightIntent } from "./roles";

/**
 * One authored group inside a wave: what arrives, how many, where from, and when.
 * `unit` and `entry` are game-owned ids — the engine never resolves them.
 */
export interface EncounterGroup {
  /** Unit id the game's catalog knows. */
  unit: string;
  /** Authored spawn-point key, resolved by the game against its scene. */
  entry: string;
  /** How many enter at this open. Default `1`. */
  count?: number;
  /** Seconds into the wave before this group enters. Default `0`. */
  at?: number;
  /** Duty the group takes when it engages. Default the encounter's `defaultIntent`. */
  intent?: FightIntent;
  /** True when pressure may add copies of this group. Default `false`. */
  escalates?: boolean;
  /** True when this group only exists once pressure unlocks an elite slot. Default `false`. */
  elite?: boolean;
  /** Seeded scatter of up to ±this many seconds on `at`. Default `0`. */
  jitterSeconds?: number;
}

/** One authored wave. */
export interface EncounterWave {
  id: string;
  /** HUD or screen label. */
  label?: string;
  groups: readonly EncounterGroup[];
  /** Seconds the wave stays open after it opens. Omit to close when the last order lands. */
  durationSeconds?: number;
}

/** A whole encounter, authored as data instead of spawned in game code. */
export interface EncounterDefinition {
  id: string;
  waves: readonly EncounterWave[];
}

/** The subset of a pressure plan the encounter layer applies. */
export interface EncounterPressure {
  /** Extra copies for `escalates` groups. */
  countBonus?: number;
  /** Elite slots to unlock. A group marked `elite` enters only when a slot is free. */
  eliteSlots?: number;
  /** Multiplier on authored entry delays (`< 1` sends them sooner). */
  cadenceScale?: number;
}

/** One unit the director says should enter now. */
export interface EncounterOrder {
  /** 0-based wave index. */
  wave: number;
  waveId: string;
  unit: string;
  entry: string;
  intent: FightIntent;
  /** Seconds after the wave opened when this unit enters. */
  atSeconds: number;
  /** Which authored group this order came from, for logging and tests. */
  group: number;
  /** True when pressure added this unit rather than the authored composition. */
  pressureAdded: boolean;
}

/** Serializable encounter state. */
export interface EncounterState {
  /** 0-based index of the open wave, or of the next one before it opens. */
  wave: number;
  opened: boolean;
  /** Seconds the open wave has run. */
  elapsed: number;
  /** Orders already emitted for the open wave. */
  emitted: number;
  completedWaves: number;
  done: boolean;
  /** Pressure captured when the open wave opened, so re-deriving the schedule is stable. */
  countBonus: number;
  eliteSlots: number;
  cadenceScale: number;
}

/** Pooled per-frame readout of where the encounter stands. */
export interface EncounterView {
  /** 1-based wave for display. */
  wave: number;
  totalWaves: number;
  waveId: string | null;
  label: string | null;
  /** Orders in the open wave, authored plus pressure-added. */
  total: number;
  emitted: number;
  /** `0..1` through the open wave. */
  progress: number;
  /** True once the open wave has landed every order and its duration has run. */
  ready: boolean;
  done: boolean;
}

/** Live encounter: opens waves, emits timed spawn orders, and round-trips through a save. */
export interface Encounter {
  /** Open a wave (next one by default) and return its full ordered schedule. */
  openWave(index?: number, pressure?: EncounterPressure): EncounterOrder[];
  /** Advance the open wave and return the orders whose time has come since the last step. */
  update(dt: number): EncounterOrder[];
  /** Mark the open wave cleared and make the next one current. */
  completeWave(): void;
  /** The wave definition at an index, or null past the end. */
  waveAt(index: number): EncounterWave | null;
  /** The pooled readout to render. */
  view(): EncounterView;
  snapshot(): EncounterState;
  restore(state: EncounterState): void;
}

/** Construction options for {@link createEncounter}. */
export interface EncounterConfig {
  definition: EncounterDefinition;
  /** Seed for the per-wave entry scatter. Default `1`. */
  seed?: number;
  /** Duty for groups that omit `intent`. Default `"assault"`. */
  defaultIntent?: FightIntent;
  /** Most pressure may add to one escalating group, whatever the plan says. Default `4`. */
  maxExtraPerGroup?: number;
}

interface ScheduleEntry {
  order: EncounterOrder;
  groupIndex: number;
  itemIndex: number;
}

function clampInt(value: number | undefined, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * Expand one authored wave into the units it sends, at the times it sends them.
 *
 * Authoring stays data: composition (`unit`, `count`), entry (`entry`), timing (`at`, `jitterSeconds`,
 * `durationSeconds`) and escalation (`escalates`, `elite`) all live in the
 * definition. Pressure only *adds*: extra copies for `escalates` groups (capped at
 * `maxExtraPerGroup`) and elite slots, and it shortens delays through `cadenceScale` — it never
 * rewrites an authored unit or entry. Same definition, seed and pressure always produce the same
 * schedule.
 *
 * @capability encounter-expand turn an authored wave into a deterministic, pressure-adjusted list of timed spawn orders
 */
export function expandWave(config: EncounterConfig, waveIndex: number, pressure: EncounterPressure = {}): EncounterOrder[] {
  const waves = config.definition.waves;
  if (waveIndex < 0 || waveIndex >= waves.length) return [];
  const wave = waves[waveIndex]!;
  const seed = config.seed ?? 1;
  const defaultIntent = config.defaultIntent ?? "assault";
  const maxExtra = Math.max(0, Math.floor(config.maxExtraPerGroup ?? 4));
  const countBonus = clampInt(pressure.countBonus, 0, maxExtra);
  const eliteSlots = clampInt(pressure.eliteSlots, 0, Number.MAX_SAFE_INTEGER);
  const cadenceScale =
    pressure.cadenceScale === undefined || !Number.isFinite(pressure.cadenceScale) || pressure.cadenceScale <= 0
      ? 1
      : Math.min(1, pressure.cadenceScale);
  const rng = seededRng(`${seed}:${waveIndex}`);
  const schedule: ScheduleEntry[] = [];
  let eliteUsed = 0;

  for (let groupIndex = 0; groupIndex < wave.groups.length; groupIndex += 1) {
    const group = wave.groups[groupIndex]!;
    if (group.elite === true) {
      if (eliteUsed >= eliteSlots) continue;
      eliteUsed += 1;
    }
    const authored = Math.max(0, Math.floor(group.count ?? 1));
    const extra = group.escalates === true ? countBonus : 0;
    const at = Math.max(0, group.at ?? 0) * cadenceScale;
    for (let itemIndex = 0; itemIndex < authored + extra; itemIndex += 1) {
      const jitter = group.jitterSeconds === undefined || group.jitterSeconds <= 0
        ? 0
        : (rng() * 2 - 1) * group.jitterSeconds;
      schedule.push({
        groupIndex,
        itemIndex,
        order: {
          wave: waveIndex,
          waveId: wave.id,
          unit: group.unit,
          entry: group.entry,
          intent: group.intent ?? defaultIntent,
          atSeconds: Math.max(0, at + jitter),
          group: groupIndex,
          pressureAdded: itemIndex >= authored,
        },
      });
    }
  }

  schedule.sort(
    (a, b) =>
      a.order.atSeconds - b.order.atSeconds || a.groupIndex - b.groupIndex || a.itemIndex - b.itemIndex,
  );
  return schedule.map((entry) => entry.order);
}

/**
 * Create a live encounter over an authored definition: open a wave, step its clock, take the orders
 * whose time has come, and close the wave when the game says it is cleared.
 *
 * This is the composition layer, not a second spawn system: every order names a game-owned `unit`
 * and `entry`, exactly like a `SpawnRequest` names an `entryId`, and the game builds the entity.
 * Pair it with `combat/encounterSequence` when a fight needs scripted phase gates, and with
 * `ai/waveRunner` when a wave should be drawn from a budget instead of authored.
 *
 * Pressure is captured when a wave opens, so a wave's composition cannot change mid-arrival; read
 * `evaluatePressure` when the wave opens and pass the plan in.
 *
 * @capability encounter-runner open authored waves, emit their timed orders, and track wave progress through a save
 */
export function createEncounter(config: EncounterConfig): Encounter {
  const waves = config.definition.waves;
  let state: EncounterState = {
    wave: 0,
    opened: false,
    elapsed: 0,
    emitted: 0,
    completedWaves: 0,
    done: waves.length === 0,
    countBonus: 0,
    eliteSlots: 0,
    cadenceScale: 1,
  };
  const readout: EncounterView = {
    wave: 1,
    totalWaves: waves.length,
    waveId: null,
    label: null,
    total: 0,
    emitted: 0,
    progress: 0,
    ready: false,
    done: false,
  };

  function pressureOf(): EncounterPressure {
    return { countBonus: state.countBonus, eliteSlots: state.eliteSlots, cadenceScale: state.cadenceScale };
  }

  function schedule(): EncounterOrder[] {
    return state.opened ? expandWave(config, state.wave, pressureOf()) : [];
  }

  function durationSeconds(): number {
    const wave = waves[state.wave];
    if (wave?.durationSeconds === undefined) return 0;
    return Math.max(0, wave.durationSeconds) * state.cadenceScale;
  }

  return {
    openWave(index, pressure = {}) {
      const target = index ?? state.completedWaves;
      if (target < 0 || target >= waves.length) {
        state = { ...state, done: true };
        return [];
      }
      state = {
        ...state,
        wave: target,
        opened: true,
        elapsed: 0,
        emitted: 0,
        done: false,
        countBonus: clampInt(pressure.countBonus, 0, Math.max(0, Math.floor(config.maxExtraPerGroup ?? 4))),
        eliteSlots: clampInt(pressure.eliteSlots, 0, Number.MAX_SAFE_INTEGER),
        cadenceScale:
          pressure.cadenceScale === undefined || !Number.isFinite(pressure.cadenceScale) || pressure.cadenceScale <= 0
            ? 1
            : Math.min(1, pressure.cadenceScale),
      };
      return schedule();
    },
    update(dt) {
      if (!state.opened || state.done || !(dt > 0)) return [];
      state = { ...state, elapsed: state.elapsed + dt };
      const all = schedule();
      const orders: EncounterOrder[] = [];
      while (state.emitted < all.length && all[state.emitted]!.atSeconds <= state.elapsed + 1e-9) {
        orders.push(all[state.emitted]!);
        state = { ...state, emitted: state.emitted + 1 };
      }
      return orders;
    },
    completeWave() {
      if (!state.opened) return;
      const completedWaves = state.wave + 1;
      state = {
        ...state,
        opened: false,
        elapsed: 0,
        emitted: 0,
        completedWaves,
        wave: Math.min(completedWaves, waves.length),
        done: completedWaves >= waves.length,
      };
    },
    waveAt(index) {
      return waves[index] ?? null;
    },
    view() {
      const wave = waves[state.wave] ?? null;
      const all = schedule();
      const duration = durationSeconds();
      readout.wave = Math.min(state.wave + 1, waves.length);
      readout.waveId = wave?.id ?? null;
      readout.label = wave?.label ?? null;
      readout.total = all.length;
      readout.emitted = state.emitted;
      readout.progress =
        all.length === 0
          ? state.opened && state.elapsed >= duration
            ? 1
            : 0
          : Math.min(1, state.emitted / all.length);
      readout.ready = state.opened && state.emitted >= all.length && state.elapsed >= duration;
      readout.done = state.done;
      return readout;
    },
    snapshot() {
      return { ...state };
    },
    restore(next) {
      state = { ...next };
    },
  };
}
