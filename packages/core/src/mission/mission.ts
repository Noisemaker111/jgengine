// @skill jgengine-gameplay
/**
 * Missions as data: a mission is a graph of objectives a state machine walks, with named fail
 * states, per-objective timers, conditional branches and rewards. Nothing here is a genre kit —
 * escort, chase and defend are compositions of the same objective kinds, built in `compositions.ts`.
 *
 * The machine is pure, serializable and bounded: one active mission, one objective's worth of
 * work per tick, and every fact it reads is supplied by the caller.
 */

import { devtools } from "../devtools/devtools";
import { applyQuestRewards, type QuestRewards } from "./quest";
import { clamp } from "../math/scalar";
import { resolveRng } from "../random/resolveRng";
import type { ScenePoint3 } from "../world/sceneShapes";

export type MissionStatus = "active" | "completed" | "failed";

export type MissionObjectiveKind = "reach" | "interact" | "survive" | "pursue" | "kill" | "collect";

export const MISSION_COUNTER_KINDS: readonly MissionObjectiveKind[] = ["kill", "collect"];

/**
 * True when an objective kind completes from a counter rather than a world condition — the test the
 * counter-only lint is built on.
 *
 * @capability mission-validation tell whether an objective kind completes from a counter alone
 */
export function isCounterObjective(kind: MissionObjectiveKind): boolean {
  return kind === "kill" || kind === "collect";
}

export type MissionWorldEventKind = "kill" | "collect" | "deliver";

/**
 * One thing that happened in the world this tick, reported by the game. A constrained objective counts
 * matching events and an `event` fail condition reacts to them, so the machine judges the world instead
 * of the game polling its own counters.
 *
 * @capability mission-events count constrained kills and fail a mission on a matching world event
 */
export interface MissionWorldEvent {
  kind: MissionWorldEventKind;
  target: string;
  by?: string;
  tags?: readonly string[];
  count?: number;
}

/** Which world events an objective counts or a fail condition reacts to. Absent fields do not filter. */
export interface MissionEventFilter {
  /** Event kind; a `kill`/`collect` objective defaults to its own kind. */
  kind?: MissionWorldEventKind;
  target?: string;
  by?: string;
  /** Every one of these tags must be present. */
  tags?: readonly string[];
  withoutTags?: readonly string[];
}

export interface MissionFactCondition {
  fact: string;
  is?: string | number | boolean | undefined;
  atLeast?: number | undefined;
  atMost?: number | undefined;
  not?: boolean;
}

export interface MissionFailCondition {
  kind: "actor-died" | "timer" | "fact" | "event" | "left-area";
  actor?: string;
  /** `timer`: seconds in the current objective before the mission fails. */
  seconds?: number;
  fact?: string;
  is?: string | number | boolean;
  atLeast?: number;
  atMost?: number;
  match?: MissionEventFilter;
  /** `left-area`: authored marker the watched actor must stay near. */
  marker?: string;
  radius?: number;
  to?: string;
  message?: string;
}

export interface MissionBranch {
  to: string;
  when: MissionFactCondition | readonly MissionFactCondition[];
  label?: string;
}

export interface MissionObjectiveDef {
  id: string;
  kind: MissionObjectiveKind;
  label?: string | undefined;
  /** Tracked actor for `reach` / `interact` / `survive` / the `pursue` target. */
  actor?: string | undefined;
  /** Pursuer for `pursue`; defaults to the runtime's `defaultPursuer`. */
  pursuer?: string | undefined;
  /** Authored scene marker id the actor must reach or interact at. */
  marker?: string | undefined;
  radius?: number | undefined;
  /** Seconds the actor must hold for `survive`. */
  duration?: number | undefined;
  /**
   * World facts that complete a `survive` objective once they hold (after any `duration`): "lose the
   * police" is `until: { fact: "police_tier", atMost: 0 }`, not a game-side signal.
   */
  until?: MissionFactCondition | readonly MissionFactCondition[] | undefined;
  distance?: number | undefined;
  escapeDistance?: number | undefined;
  /** Seconds beyond `escapeDistance` before the pursuit fails. Default `0` (instant). */
  escapeGrace?: number | undefined;
  escapeFail?: string | undefined;
  /** Counter key for `kill` / `collect`; defaults to the objective id. */
  counter?: string | undefined;
  count?: number | undefined;
  /**
   * Count `kill` / `collect` objectives from reported world events instead of a bare counter, so only a
   * matching event credits progress (`tags`, `withoutTags`, `target`). Omitted keeps the counter path.
   */
  match?: MissionEventFilter | undefined;
  /** Survivors that must remain for `survive`; dropping below fails the mission. */
  minSurvivors?: number | undefined;
  minSurvivorsFail?: string | undefined;
  /** Seconds in this objective before it expires into `onTimeout`. */
  timeout?: number | undefined;
  /** Where expiry goes: an objective id, a fail state id, or `"done"`. Default: fail the mission. */
  onTimeout?: string | undefined;
  failOn?: readonly MissionFailCondition[] | undefined;
  next?: string | undefined;
  branches?: readonly MissionBranch[] | undefined;
}

export interface MissionFailDef {
  id: string;
  message?: string;
}

export interface MissionRewards extends QuestRewards {
  loot?: string[];
}

export interface MissionDef {
  id: string;
  title: string;
  description?: string | undefined;
  /** Objective the mission starts on. Defaults to the first objective. */
  start?: string;
  objectives: readonly MissionObjectiveDef[];
  fail?: readonly MissionFailDef[];
  rewards?: MissionRewards | undefined;
  objectiveRewards?: Readonly<Record<string, MissionRewards>>;
  /** One named fact rolled from `options` at start with the injected RNG — deterministic variation. */
  rollout?: { fact: string; options: readonly (string | number)[] };
  next?: string | undefined;
}

export interface MissionActorFact {
  /** Defaults to alive. */
  alive?: boolean;
  position?: ScenePoint3;
}

export interface MissionTickInput {
  actors?: Readonly<Record<string, MissionActorFact>>;
  counters?: Readonly<Record<string, number>>;
  events?: readonly MissionWorldEvent[];
  facts?: Readonly<Record<string, string | number | boolean>>;
  /**
   * Read one transient fact by name, in place of `facts`: for a caller whose facts live in more than
   * one table (saved facts, totals, live facts), so a tick looks up the few a condition names instead
   * of copying every table into one record.
   */
  readFact?: (name: string) => string | number | boolean | undefined;
  interact?: readonly string[];
  /** Survivors on the ground for a `survive` objective; defaults to the living actors in `actors`. */
  survivors?: number;
}

export interface MissionState {
  missionId: string;
  status: MissionStatus;
  objective: string | null;
  path: string[];
  /** Seconds spent in the current objective. */
  objectiveElapsed: number;
  /** Seconds since the mission started. */
  elapsed: number;
  progress: Record<string, number>;
  facts: Record<string, string | number | boolean>;
  /** Per-objective transient accumulators (pursuit escape seconds). */
  timers: Record<string, number>;
  /** Running survival score — survivors counted as `survive` objectives complete. */
  score: number;
  outcome: string | null;
  reason: string | null;
}

export type MissionEvent =
  | { kind: "started"; missionId: string; mission: MissionDef }
  | { kind: "objective"; missionId: string; objectiveId: string; label: string }
  | { kind: "branch"; missionId: string; from: string; to: string; label?: string }
  | { kind: "timeout"; missionId: string; objectiveId: string; to: string }
  | { kind: "reward"; missionId: string; objectiveId: string | null; rewards: MissionRewards }
  | { kind: "failed"; missionId: string; state: string; reason: string }
  | { kind: "completed"; missionId: string; score: number; rewards: MissionRewards | null }
  | { kind: "chained"; missionId: string; nextMissionId: string };

export interface MissionView {
  missionId: string;
  title: string;
  status: MissionStatus;
  objectiveId: string | null;
  label: string;
  objectiveElapsed: number;
  /** Seconds left on the current objective's timer (a `timeout` or a `survive` duration), or null when it has none. */
  remaining: number | null;
  /** Counter fraction 0..1 for the current objective, or 0 when it is not a counter. */
  progress: number;
  counted: number;
  count: number;
  step: number;
  steps: number;
  score: number;
  outcome: string | null;
  reason: string | null;
  path: readonly string[];
}

export interface MissionStats {
  missions: number;
  ticks: number;
  started: number;
  completed: number;
  failed: number;
  branches: number;
  timeouts: number;
  /** Slowest single `tick` seen so far, in milliseconds. */
  slowestTickMs: number;
}

export interface MissionRuntimeSnapshot {
  state: MissionState | null;
  ticks: number;
  started: number;
  completed: number;
  failed: number;
  branches: number;
  timeouts: number;
}

export interface MissionRewardAppliers {
  grantXp?(amount: number): void;
  grantEconomy?(currencyId: string, amount: number): void;
  grantItem?(inventoryId: string, itemId: string, count: number): { reason: string } | null | void;
  grantItems?(items: Readonly<NonNullable<QuestRewards["items"]>>): { reason: string } | null | void;
  grantUnlock?(unlockId: string): void;
  grantLoot?(tableId: string): void;
}

export interface MissionRuntimeConfig {
  readonly missions: readonly MissionDef[];
  readonly markers?: Readonly<Record<string, ScenePoint3>>;
  readonly markerProximity?: MissionMarkerProximity;
  /** Actor id used for a `pursue` objective that names no `pursuer`. */
  readonly defaultPursuer?: string;
  readonly rng?: () => number;
  /** Register a devtools probe under this name so the overlay shows the active mission. */
  readonly devtoolsName?: string;
  readonly skipValidation?: boolean;
}

export interface MissionRuntime {
  missionIds(): readonly string[];
  /** A mission definition, or null when unknown. */
  mission(id: string): MissionDef | null;
  /** Start a mission; returns its first state, or null when the id is unknown. Replaces any active run. */
  start(missionId: string, facts?: Readonly<Record<string, string | number | boolean>>): MissionState | null;
  /** Advance the active mission by `dt` seconds against the world. Returns every event this tick. */
  tick(dt: number, input?: MissionTickInput): readonly MissionEvent[];
  signal(missionId: string, objectiveId: string): readonly MissionEvent[];
  fail(missionId: string, state: string, reason?: string): readonly MissionEvent[];
  abandon(): void;
  /** The active mission's live state, or null when none is running. */
  state(): MissionState | null;
  /** The pooled per-frame readout to render (do not retain). */
  view(): MissionView | null;
  subscribe(listener: () => void): () => void;
  stats(): MissionStats;
  snapshot(): MissionRuntimeSnapshot;
  restore(next: MissionRuntimeSnapshot): void;
  dispose(): void;
}

export type MissionMarkerPlane = "horizontal" | "spatial";

/**
 * How a positional objective compares an actor to its authored marker.
 *
 * Authored markers sit on a flat plan (`y = 0`) while the terrain around them rises, so a straight
 * 3D test can leave a marker unreachable from the ground below it. `"horizontal"` compares the
 * ground distance and allows the actor up to `tolerance` metres off the marker's height;
 * `"spatial"` is the plain 3D check, for a world whose stacked platforms must stay distinct.
 */
export interface MissionMarkerProximity {
  plane?: MissionMarkerPlane;
  tolerance?: number;
}

export const DEFAULT_REACH_RADIUS = 2.5;
export const DEFAULT_MARKER_TOLERANCE = 8;
export const DEFAULT_PURSUE_DISTANCE = 3;
export const DEFAULT_ESCAPE_MULTIPLE = 3;

function distance(a: ScenePoint3, b: ScenePoint3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function markerWithin(
  from: ScenePoint3,
  to: ScenePoint3,
  radius: number,
  plane: MissionMarkerPlane,
  tolerance: number,
): boolean {
  const dy = from.y - to.y;
  const limit = radius * radius;
  if (plane === "spatial") {
    const dx = from.x - to.x;
    const dz = from.z - to.z;
    return dx * dx + dy * dy + dz * dz <= limit;
  }
  if (Math.abs(dy) > tolerance) return false;
  const dx = from.x - to.x;
  const dz = from.z - to.z;
  return dx * dx + dz * dz <= limit;
}

function cloneState(state: MissionState): MissionState {
  return {
    ...state,
    path: [...state.path],
    progress: { ...state.progress },
    facts: { ...state.facts },
    timers: { ...state.timers },
  };
}

function counterKey(objective: MissionObjectiveDef): string {
  return objective.counter ?? objective.id;
}

function eventMatches(filter: MissionEventFilter, event: MissionWorldEvent): boolean {
  if (filter.kind !== undefined && filter.kind !== event.kind) return false;
  if (filter.target !== undefined && filter.target !== event.target) return false;
  if (filter.by !== undefined && filter.by !== event.by) return false;
  const tags = event.tags ?? [];
  for (const required of filter.tags ?? []) if (!tags.includes(required)) return false;
  for (const banned of filter.withoutTags ?? []) if (tags.includes(banned)) return false;
  return true;
}

function hasFailState(def: MissionDef, id: string): boolean {
  return def.fail?.some((entry) => entry.id === id) ?? false;
}

function objectiveLabel(objective: MissionObjectiveDef): string {
  if (objective.label !== undefined && objective.label !== "") return objective.label;
  switch (objective.kind) {
    case "reach":
      return `Reach ${objective.marker ?? objective.actor ?? objective.id}`;
    case "interact":
      return `Interact at ${objective.marker ?? objective.id}`;
    case "survive":
      return `Hold for ${objective.duration ?? 0}s`;
    case "pursue":
      return `Stay on ${objective.actor ?? objective.id}`;
    case "kill":
      return `Defeat ${objective.count ?? 1} ${counterKey(objective)}`;
    case "collect":
      return `Collect ${objective.count ?? 1} ${counterKey(objective)}`;
  }
}

function defaultFailStateId(objective: MissionObjectiveDef, def: MissionDef): string {
  const named = objective.minSurvivorsFail ?? objective.failOn?.[0]?.to;
  if (named !== undefined && def.fail?.some((state) => state.id === named)) return named;
  return def.fail?.[0]?.id ?? "failed";
}

/**
 * Apply a mission's rewards through the same appliers quests use, then roll any named loot tables.
 * Economy, XP, items and unlocks go through {@link applyQuestRewards}; loot is a table id the game's
 * loot registry resolves, so a mission never grows its own reward path.
 *
 * @capability mission-rewards pay mission rewards through the quest appliers and the loot registry
 */
export function applyMissionRewards(
  rewards: MissionRewards,
  appliers: MissionRewardAppliers,
): { reason: string } | null {
  const fail = applyQuestRewards(rewards, appliers);
  if (fail !== null) return fail;
  for (const table of rewards.loot ?? []) appliers.grantLoot?.(table);
  return null;
}

/**
 * Run missions as a state machine. One mission is active at a time; `tick` advances it against the
 * world the caller supplies, moving through objectives on completion, branching on facts, and landing
 * in a named fail state on a fail condition, an expiry or a `minSurvivors` breach. Completion pays
 * rewards through {@link applyMissionRewards} appliers the caller wires, and a mission's `next` chains
 * the follow-up. Escort, chase and defend are compositions of the same objective kinds
 * (`compositions.ts`), never three bespoke systems.
 *
 * Cost per tick is bounded by the active objective's own fail list plus one goal test.
 *
 * Marker proximity runs on the plane `markerProximity` picks: horizontal by default, so a marker
 * authored on a flat `y = 0` plan still triggers from ground that rises under it; `spatial` for a
 * world whose stacked platforms must stay apart.
 *
 * @capability mission-runtime missions as a data-driven objective state machine with fail states, timers, branches and rewards
 */
export function createMissionRuntime(config: MissionRuntimeConfig): MissionRuntime {
  const defs = new Map<string, MissionDef>();
  for (const def of config.missions) defs.set(def.id, def);
  const markers = config.markers ?? {};
  const markerPlane: MissionMarkerPlane = config.markerProximity?.plane ?? "horizontal";
  const markerTolerance = Math.max(0, config.markerProximity?.tolerance ?? DEFAULT_MARKER_TOLERANCE);
  let rng = config.rng;
  let state: MissionState | null = null;
  let ticks = 0;
  let started = 0;
  let completed = 0;
  let failed = 0;
  let branches = 0;
  let timeouts = 0;
  let slowestTickMs = 0;
  const listeners = new Set<() => void>();
  const readout: MissionView = {
    missionId: "",
    title: "",
    status: "active",
    objectiveId: null,
    label: "",
    objectiveElapsed: 0,
    remaining: null,
    progress: 0,
    counted: 0,
    count: 0,
    step: 0,
    steps: 0,
    score: 0,
    outcome: null,
    reason: null,
    path: [],
  };

  function rollRng(): number {
    if (rng === undefined) rng = resolveRng(undefined, "createMissionRuntime");
    return rng();
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function activeDef(): MissionDef | null {
    if (state === null) return null;
    return defs.get(state.missionId) ?? null;
  }

  function objectiveOf(def: MissionDef, id: string | null): MissionObjectiveDef | null {
    if (id === null) return null;
    return def.objectives.find((objective) => objective.id === id) ?? null;
  }

  function factValue(name: string, input: MissionTickInput): string | number | boolean | undefined {
    if (name === "score") return state?.score ?? 0;
    const fromInput = input.readFact !== undefined ? input.readFact(name) : input.facts?.[name];
    if (fromInput !== undefined) return fromInput;
    return state?.facts[name];
  }

  function matches(condition: MissionFactCondition, input: MissionTickInput): boolean {
    const value = factValue(condition.fact, input);
    let ok = true;
    if (condition.is !== undefined) ok = ok && value === condition.is;
    if (condition.atLeast !== undefined) {
      ok = ok && typeof value === "number" && value >= condition.atLeast;
    }
    if (condition.atMost !== undefined) {
      ok = ok && typeof value === "number" && value <= condition.atMost;
    }
    if (condition.is === undefined && condition.atLeast === undefined && condition.atMost === undefined) {
      ok = value !== undefined;
    }
    return condition.not === true ? !ok : ok;
  }

  function conditionHolds(condition: MissionFactCondition | readonly MissionFactCondition[], input: MissionTickInput): boolean {
    return Array.isArray(condition)
      ? (condition as readonly MissionFactCondition[]).every((entry) => matches(entry, input))
      : matches(condition as MissionFactCondition, input);
  }

  function survivorsOf(input: MissionTickInput): number {
    if (input.survivors !== undefined) return input.survivors;
    let alive = 0;
    for (const actor of Object.values(input.actors ?? {})) if (actor.alive !== false) alive += 1;
    return alive;
  }

  function positionOf(actorId: string | undefined, input: MissionTickInput): ScenePoint3 | undefined {
    if (actorId === undefined) return undefined;
    return input.actors?.[actorId]?.position;
  }

  function pursuitDistance(objective: MissionObjectiveDef, input: MissionTickInput): number | undefined {
    const pursuer = objective.pursuer ?? config.defaultPursuer;
    const from = positionOf(pursuer, input);
    const to = positionOf(objective.actor, input);
    if (from === undefined || to === undefined) return undefined;
    return distance(from, to);
  }

  function goalMet(objective: MissionObjectiveDef, input: MissionTickInput): boolean {
    switch (objective.kind) {
      case "reach": {
        const from = positionOf(objective.actor, input);
        const to = objective.marker === undefined ? undefined : markers[objective.marker];
        if (from === undefined || to === undefined) return false;
        return markerWithin(from, to, objective.radius ?? DEFAULT_REACH_RADIUS, markerPlane, markerTolerance);
      }
      case "interact": {
        if (objective.actor === undefined || !(input.interact ?? []).includes(objective.actor)) return false;
        const to = objective.marker === undefined ? undefined : markers[objective.marker];
        if (to === undefined) return true;
        const from = positionOf(objective.actor, input);
        return from !== undefined
          && markerWithin(from, to, objective.radius ?? DEFAULT_REACH_RADIUS, markerPlane, markerTolerance);
      }
      case "survive":
        if (state!.objectiveElapsed < (objective.duration ?? 0)) return false;
        return objective.until === undefined || conditionHolds(objective.until, input);
      case "pursue": {
        const d = pursuitDistance(objective, input);
        return d !== undefined && d <= (objective.distance ?? DEFAULT_PURSUE_DISTANCE);
      }
      case "kill":
      case "collect": {
        const key = counterKey(objective);
        const counted = objective.match === undefined
          ? (input.counters?.[key] ?? 0)
          : (state!.progress[key] ?? 0);
        return counted >= (objective.count ?? 1);
      }
    }
  }

  /**
   * Record this tick's progress for a counter objective: matching world events for a `match` objective,
   * or the game's cumulative counter otherwise. Mirrored into `state.progress` so `view()` and a save
   * both see it.
   */
  function accumulateEvents(objective: MissionObjectiveDef, input: MissionTickInput): void {
    if (!isCounterObjective(objective.kind)) return;
    const key = counterKey(objective);
    const filter = objective.match;
    if (filter === undefined) {
      const external = input.counters?.[key];
      if (external !== undefined) state!.progress[key] = external;
      return;
    }
    if (input.events === undefined) return;
    const kind = filter.kind ?? objective.kind;
    for (const event of input.events) {
      if (event.kind !== kind || !eventMatches(filter, event)) continue;
      state!.progress[key] = (state!.progress[key] ?? 0) + (event.count ?? 1);
    }
  }

  function eventFails(match: MissionEventFilter | undefined, input: MissionTickInput): boolean {
    for (const event of input.events ?? []) {
      if (match === undefined || eventMatches(match, event)) return true;
    }
    return false;
  }

  function failOf(
    objective: MissionObjectiveDef,
    input: MissionTickInput,
    dt: number,
  ): { state: string; reason: string } | null {
    const current = state!;
    for (const condition of objective.failOn ?? []) {
      if (condition.kind === "actor-died") {
        if (condition.actor !== undefined && input.actors?.[condition.actor]?.alive === false) {
          return { state: condition.to ?? "failed", reason: condition.message ?? `${condition.actor} died` };
        }
        continue;
      }
      if (condition.kind === "timer") {
        if (current.objectiveElapsed >= (condition.seconds ?? 0)) {
          return { state: condition.to ?? "failed", reason: condition.message ?? "timer expired" };
        }
        continue;
      }
      if (condition.kind === "event") {
        if (eventFails(condition.match, input)) {
          return { state: condition.to ?? "failed", reason: condition.message ?? "wrong event" };
        }
        continue;
      }
      if (condition.kind === "left-area") {
        const actor = condition.actor ?? objective.actor;
        const from = positionOf(actor, input);
        const to = condition.marker === undefined ? undefined : markers[condition.marker];
        const radius = condition.radius ?? DEFAULT_REACH_RADIUS;
        if (from !== undefined && to !== undefined && !markerWithin(from, to, radius, markerPlane, markerTolerance)) {
          return { state: condition.to ?? "failed", reason: condition.message ?? `${actor ?? "actor"} left the area` };
        }
        continue;
      }
      if (matches({ fact: condition.fact ?? "", is: condition.is, atLeast: condition.atLeast, atMost: condition.atMost }, input)) {
        return { state: condition.to ?? "failed", reason: condition.message ?? `fact ${condition.fact}` };
      }
    }
    if (objective.kind === "pursue") {
      const d = pursuitDistance(objective, input);
      const keep = objective.distance ?? DEFAULT_PURSUE_DISTANCE;
      const escape = objective.escapeDistance ?? keep * DEFAULT_ESCAPE_MULTIPLE;
      if (d !== undefined && d > escape) {
        const held = (current.timers[objective.id] ?? 0) + dt;
        current.timers[objective.id] = held;
        if (held >= (objective.escapeGrace ?? 0)) {
          return { state: objective.escapeFail ?? "failed", reason: `${objective.actor ?? "target"} escaped` };
        }
      } else if (current.timers[objective.id] !== undefined) {
        current.timers[objective.id] = 0;
      }
    }
    if (objective.minSurvivors !== undefined && survivorsOf(input) < objective.minSurvivors) {
      return {
        state: defaultFailStateId(objective, activeDef()!),
        reason: `survivors below ${objective.minSurvivors}`,
      };
    }
    return null;
  }

  function objectiveReward(def: MissionDef, objectiveId: string): MissionRewards | undefined {
    return def.objectiveRewards?.[objectiveId];
  }

  function enterObjective(def: MissionDef, objectiveId: string): MissionEvent[] {
    const objective = objectiveOf(def, objectiveId);
    if (objective === null) return [];
    state!.objective = objectiveId;
    state!.objectiveElapsed = 0;
    state!.timers = {};
    state!.path.push(objectiveId);
    return [{ kind: "objective", missionId: def.id, objectiveId, label: objectiveLabel(objective) }];
  }

  function startMission(
    missionId: string,
    facts: Readonly<Record<string, string | number | boolean>> | undefined,
  ): MissionEvent[] {
    const def = defs.get(missionId);
    if (def === undefined) return [];
    const first = def.start ?? def.objectives[0]?.id;
    if (first === undefined) return [];
    state = {
      missionId,
      status: "active",
      objective: null,
      path: [],
      objectiveElapsed: 0,
      elapsed: 0,
      progress: {},
      facts: { ...facts },
      timers: {},
      score: 0,
      outcome: null,
      reason: null,
    };
    started += 1;
    if (def.rollout !== undefined && def.rollout.options.length > 0) {
      const index = clamp(Math.floor(rollRng() * def.rollout.options.length), 0, def.rollout.options.length - 1);
      state.facts[def.rollout.fact] = def.rollout.options[index]!;
    }
    const events: MissionEvent[] = [{ kind: "started", missionId, mission: def }];
    events.push(...enterObjective(def, first));
    return events;
  }

  function finish(def: MissionDef): MissionEvent[] {
    const current = state!;
    current.status = "completed";
    current.objective = null;
    current.outcome = "done";
    completed += 1;
    const events: MissionEvent[] = [
      { kind: "completed", missionId: def.id, score: current.score, rewards: def.rewards ?? null },
    ];
    if (def.rewards !== undefined) {
      events.push({ kind: "reward", missionId: def.id, objectiveId: null, rewards: def.rewards });
    }
    if (def.next !== undefined && defs.has(def.next)) {
      events.push({ kind: "chained", missionId: def.id, nextMissionId: def.next });
      events.push(...startMission(def.next, undefined));
    }
    return events;
  }

  function failMission(def: MissionDef, failState: string, reason: string): MissionEvent[] {
    const current = state!;
    const named = def.fail?.find((entry) => entry.id === failState);
    const message = named?.message ?? reason;
    current.status = "failed";
    current.objective = null;
    current.outcome = failState;
    current.reason = message;
    failed += 1;
    return [{
      kind: "failed",
      missionId: def.id,
      state: failState,
      reason: message,
    }];
  }

  function route(def: MissionDef, from: MissionObjectiveDef, to: string, label?: string): MissionEvent[] {
    if (to === "done") return finish(def);
    if (hasFailState(def, to)) return failMission(def, to, `branch to ${to}`);
    const events: MissionEvent[] = [];
    if (label !== undefined) {
      branches += 1;
      events.push({ kind: "branch", missionId: def.id, from: from.id, to, label });
    }
    const entered = enterObjective(def, to);
    if (entered.length === 0) return failMission(def, "failed", `unknown objective ${to}`);
    events.push(...entered);
    return events;
  }

  function completeObjective(def: MissionDef, objective: MissionObjectiveDef, input: MissionTickInput): MissionEvent[] {
    const current = state!;
    if (objective.kind === "survive") current.score += survivorsOf(input);
    const events: MissionEvent[] = [];
    const reward = objectiveReward(def, objective.id);
    if (reward !== undefined) {
      events.push({ kind: "reward", missionId: def.id, objectiveId: objective.id, rewards: reward });
    }
    for (const branch of objective.branches ?? []) {
      if (conditionHolds(branch.when, input)) {
        events.push(...route(def, objective, branch.to, branch.label ?? `branch ${branch.to}`));
        return events;
      }
    }
    events.push(...route(def, objective, objective.next ?? "done"));
    return events;
  }

  function advance(dt: number, input: MissionTickInput): MissionEvent[] {
    if (state === null || state.status !== "active") return [];
    const def = activeDef();
    if (def === null) return [];
    state.elapsed += dt;
    state.objectiveElapsed += dt;
    const objective = objectiveOf(def, state.objective);
    if (objective === null) return [];
    accumulateEvents(objective, input);
    const fail = failOf(objective, input, dt);
    if (fail !== null) return failMission(def, fail.state, fail.reason);
    if (objective.timeout !== undefined && state.objectiveElapsed >= objective.timeout) {
      timeouts += 1;
      const to = objective.onTimeout ?? "failed";
      const events: MissionEvent[] = [{ kind: "timeout", missionId: def.id, objectiveId: objective.id, to }];
      if (to === "done") return [...events, ...finish(def)];
      if (hasFailState(def, to)) return [...events, ...failMission(def, to, `timeout on ${objective.id}`)];
      events.push(...enterObjective(def, to));
      return events;
    }
    if (!goalMet(objective, input)) return [];
    return completeObjective(def, objective, input);
  }

  if (config.skipValidation !== true) {
    const issues = validateMissionCatalog(config.missions, { markerIds: Object.keys(markers) });
    const blocking = issues.filter((issue) => issue.severity === "error");
    if (blocking.length > 0) {
      throw new Error(
        `mission catalog invalid:\n${blocking.map((issue) => `  ${issue.code} ${issue.path} ${issue.message}`).join("\n")}`,
      );
    }
  }

  function probeLine(): string {
    if (state === null) return `${defs.size} missions idle ${ticks} ticks`;
    return `${defs.size} missions "${state.missionId}" ${state.status} ${state.objective ?? "-"} ${state.path.length} steps ${state.score} score ${ticks} ticks ${slowestTickMs.toFixed(2)} ms slowest`;
  }

  const unregister =
    config.devtoolsName === undefined ? null : devtools.probes.register(config.devtoolsName, () => probeLine());

  return {
    missionIds: () => [...defs.keys()],
    mission(id) {
      return defs.get(id) ?? null;
    },
    start(missionId, facts) {
      const events = startMission(missionId, facts);
      if (events.length === 0 || state === null) return null;
      notify();
      return cloneState(state);
    },
    tick(dt, input = {}) {
      const begin = performance.now();
      const events = advance(dt, input);
      const elapsedMs = performance.now() - begin;
      if (elapsedMs > slowestTickMs) slowestTickMs = elapsedMs;
      ticks += 1;
      if (events.length > 0) notify();
      return events;
    },
    signal(missionId, objectiveId) {
      if (state === null || state.missionId !== missionId || state.status !== "active") return [];
      const def = activeDef();
      if (def === null) return [];
      const objective = objectiveOf(def, objectiveId);
      if (objective === null || state.objective !== objectiveId) return [];
      const events = completeObjective(def, objective, {});
      if (events.length > 0) notify();
      return events;
    },
    fail(missionId, failState, reason) {
      if (state === null || state.missionId !== missionId || state.status !== "active") return [];
      const def = activeDef();
      if (def === null) return [];
      const events = failMission(def, failState, reason ?? `failed at ${failState}`);
      notify();
      return events;
    },
    abandon() {
      if (state === null) return;
      state = null;
      notify();
    },
    state() {
      return state;
    },
    view() {
      if (state === null) return null;
      const def = activeDef();
      if (def === null) return null;
      const objective = objectiveOf(def, state.objective);
      readout.missionId = state.missionId;
      readout.title = def.title;
      readout.status = state.status;
      readout.objectiveId = state.objective;
      readout.label = objective === null ? "" : objectiveLabel(objective);
      readout.objectiveElapsed = state.objectiveElapsed;
      const timer = objective === null
        ? undefined
        : objective.timeout ?? (objective.kind === "survive" ? objective.duration : undefined);
      readout.remaining = timer === undefined ? null : Math.max(0, timer - state.objectiveElapsed);
      const counted = objective === null || !isCounterObjective(objective.kind)
        ? 0
        : (state.progress[counterKey(objective)] ?? 0);
      const count = objective !== null && isCounterObjective(objective.kind) ? (objective.count ?? 1) : 0;
      readout.counted = counted;
      readout.count = count;
      readout.progress = count === 0 ? 0 : clamp(counted / count, 0, 1);
      readout.step = state.path.length;
      readout.steps = def.objectives.length;
      readout.score = state.score;
      readout.outcome = state.outcome;
      readout.reason = state.reason;
      readout.path = state.path;
      return readout;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stats: () => ({ missions: defs.size, ticks, started, completed, failed, branches, timeouts, slowestTickMs }),
    snapshot: () => ({ state: state === null ? null : cloneState(state), ticks, started, completed, failed, branches, timeouts }),
    restore(next) {
      state = next.state === null ? null : cloneState(next.state);
      ticks = next.ticks;
      started = next.started;
      completed = next.completed;
      failed = next.failed;
      branches = next.branches;
      timeouts = next.timeouts;
      notify();
    },
    dispose() {
      unregister?.();
      listeners.clear();
    },
  };
}

export interface MissionIssue {
  code:
    | "duplicate-mission"
    | "duplicate-objective"
    | "empty-mission"
    | "missing-start"
    | "unknown-objective"
    | "unknown-fail-state"
    | "unknown-marker"
    | "missing-actor"
    | "missing-marker"
    | "missing-count"
    | "missing-duration"
    | "missing-target"
    | "invalid-number"
    | "invalid-match"
    | "unreachable-objective"
    | "counter-only";
  severity: "error" | "warning";
  message: string;
  path: string;
  missionId?: string;
  objectiveId?: string;
}

export interface MissionValidationOptions {
  markerIds?: Iterable<string>;
}

function successTargets(objective: MissionObjectiveDef): string[] {
  const out: string[] = [];
  for (const branch of objective.branches ?? []) out.push(branch.to);
  out.push(objective.next ?? "done");
  return out;
}

function counterOnlyPath(def: MissionDef, byId: ReadonlyMap<string, MissionObjectiveDef>): boolean {
  const start = def.start ?? def.objectives[0]?.id;
  if (start === undefined) return false;
  const seen = new Set<string>();
  const stack: string[] = [start];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const objective = byId.get(id);
    if (objective === undefined || !isCounterObjective(objective.kind)) continue;
    for (const target of successTargets(objective)) {
      if (target === "done") return true;
      if (hasFailState(def, target)) continue;
      stack.push(target);
    }
  }
  return false;
}

/**
 * Validate a mission catalog without mutation: duplicate ids, unknown branch/next targets, unknown
 * fail states and markers, per-kind required fields, unreachable objectives, and the counter-only
 * rule — a mission that has a completion path made entirely of `kill`/`collect` objectives is an
 * error, because it can be won on a counter alone.
 *
 * Games run this over their mission catalogs (and {@link createMissionRuntime} runs it at
 * construction), so a counter-only mission fails rather than shipping.
 *
 * @capability mission-validation lint mission catalogs, including failing a mission that completes on a counter alone
 */
export function validateMissionCatalog(
  missions: readonly MissionDef[],
  options: MissionValidationOptions = {},
): MissionIssue[] {
  const issues: MissionIssue[] = [];
  const markerIds = options.markerIds === undefined ? null : new Set(options.markerIds);
  const seenMissions = new Set<string>();
  for (const [index, def] of missions.entries()) {
    const base = `/${index}`;
    if (seenMissions.has(def.id)) {
      issues.push({ code: "duplicate-mission", severity: "error", missionId: def.id, path: `${base}/id`,
        message: `Duplicate mission "${def.id}".` });
    }
    seenMissions.add(def.id);
    if (def.objectives.length === 0) {
      issues.push({ code: "empty-mission", severity: "error", missionId: def.id, path: `${base}/objectives`,
        message: `Mission "${def.id}" has no objectives.` });
      continue;
    }
    const byId = new Map<string, MissionObjectiveDef>();
    for (const [objectiveIndex, objective] of def.objectives.entries()) {
      const field = `${base}/objectives/${objectiveIndex}`;
      if (byId.has(objective.id)) {
        issues.push({ code: "duplicate-objective", severity: "error", missionId: def.id, objectiveId: objective.id,
          path: `${field}/id`, message: `Duplicate objective "${objective.id}" in mission "${def.id}".` });
      }
      byId.set(objective.id, objective);
      function require(condition: boolean, code: MissionIssue["code"], suffix: string, message: string): void {
        if (!condition) {
          issues.push({ code, severity: "error", missionId: def.id, objectiveId: objective.id,
            path: `${field}/${suffix}`, message });
        }
      }
      require(objective.kind !== "reach" || objective.marker !== undefined, "missing-marker", "marker",
        `Objective "${objective.id}" is a reach goal with no marker.`);
      require(objective.kind !== "reach" || objective.actor !== undefined, "missing-actor", "actor",
        `Objective "${objective.id}" is a reach goal with no actor.`);
      require(objective.kind !== "survive" || objective.duration !== undefined || objective.until !== undefined, "missing-duration", "duration",
        `Objective "${objective.id}" is a survive goal with no duration or until.`);
      require(objective.kind !== "pursue" || objective.actor !== undefined, "missing-target", "actor",
        `Objective "${objective.id}" is a pursuit with no target.`);
      require(!isCounterObjective(objective.kind) || objective.count !== undefined, "missing-count", "count",
        `Objective "${objective.id}" is a counter goal with no count.`);
      if (objective.count !== undefined && (!Number.isFinite(objective.count) || objective.count < 0)) {
        require(false, "invalid-number", "count", `Objective "${objective.id}" count must be finite and nonnegative.`);
      }
      if (objective.duration !== undefined && (!Number.isFinite(objective.duration) || objective.duration < 0)) {
        require(false, "invalid-number", "duration", `Objective "${objective.id}" duration must be finite and nonnegative.`);
      }
      if (markerIds !== null && objective.marker !== undefined && !markerIds.has(objective.marker)) {
        require(false, "unknown-marker", "marker", `Objective "${objective.id}" references unknown marker "${objective.marker}".`);
      }
    }
    const start = def.start ?? def.objectives[0]?.id;
    if (def.start !== undefined && !byId.has(def.start)) {
      issues.push({ code: "missing-start", severity: "error", missionId: def.id, path: `${base}/start`,
        message: `Mission "${def.id}" starts on unknown objective "${def.start}".` });
    }
    for (const [objectiveIndex, objective] of def.objectives.entries()) {
      const field = `${base}/objectives/${objectiveIndex}`;
      for (const [branchIndex, branch] of (objective.branches ?? []).entries()) {
        if (branch.to !== "done" && !byId.has(branch.to) && !hasFailState(def, branch.to)) {
          issues.push({ code: "unknown-objective", severity: "error", missionId: def.id, objectiveId: objective.id,
            path: `${field}/branches/${branchIndex}/to`, message: `Branch target "${branch.to}" is not an objective or fail state.` });
        }
      }
      const next = objective.next ?? "done";
      if (next !== "done" && !byId.has(next) && !hasFailState(def, next)) {
        issues.push({ code: "unknown-objective", severity: "error", missionId: def.id, objectiveId: objective.id,
          path: `${field}/next`, message: `Next objective "${next}" is not an objective or fail state.` });
      }
      const onTimeout = objective.onTimeout ?? "failed";
      if (objective.timeout !== undefined && onTimeout !== "done" && !byId.has(onTimeout) && !hasFailState(def, onTimeout)) {
        issues.push({ code: "unknown-objective", severity: "error", missionId: def.id, objectiveId: objective.id,
          path: `${field}/onTimeout`, message: `Timeout target "${onTimeout}" is not an objective or fail state.` });
      }
      for (const [failIndex, condition] of (objective.failOn ?? []).entries()) {
        if (condition.to !== undefined && !hasFailState(def, condition.to)) {
          issues.push({ code: "unknown-fail-state", severity: "error", missionId: def.id, objectiveId: objective.id,
            path: `${field}/failOn/${failIndex}/to`, message: `Fail condition targets unknown fail state "${condition.to}".` });
        }
        if (condition.kind === "left-area") {
          if (condition.actor === undefined && objective.actor === undefined) {
            issues.push({ code: "missing-actor", severity: "error", missionId: def.id, objectiveId: objective.id,
              path: `${field}/failOn/${failIndex}/actor`, message: `Left-area fail condition on "${objective.id}" watches no actor.` });
          }
          if (condition.marker === undefined) {
            issues.push({ code: "missing-marker", severity: "error", missionId: def.id, objectiveId: objective.id,
              path: `${field}/failOn/${failIndex}/marker`, message: `Left-area fail condition on "${objective.id}" has no marker.` });
          } else if (markerIds !== null && !markerIds.has(condition.marker)) {
            issues.push({ code: "unknown-marker", severity: "error", missionId: def.id, objectiveId: objective.id,
              path: `${field}/failOn/${failIndex}/marker`, message: `Left-area fail condition references unknown marker "${condition.marker}".` });
          }
        }
      }
      if (objective.match !== undefined && !isCounterObjective(objective.kind)) {
        issues.push({ code: "invalid-match", severity: "error", missionId: def.id, objectiveId: objective.id,
          path: `${field}/match`, message: `Objective "${objective.id}" is a ${objective.kind} goal; only kill and collect objectives read world events.` });
      }
    }
    const reachable = new Set<string>();
    const queue: string[] = start === undefined ? [] : [start];
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const objective = byId.get(id);
      if (objective === undefined) continue;
      for (const target of successTargets(objective)) {
        if (target !== "done" && !hasFailState(def, target)) queue.push(target);
      }
      for (const condition of objective.failOn ?? []) {
        if (condition.to !== undefined && byId.has(condition.to)) queue.push(condition.to);
      }
      if (objective.onTimeout !== undefined && byId.has(objective.onTimeout)) queue.push(objective.onTimeout);
    }
    for (const [objectiveIndex, objective] of def.objectives.entries()) {
      if (!reachable.has(objective.id)) {
        issues.push({ code: "unreachable-objective", severity: "warning", missionId: def.id, objectiveId: objective.id,
          path: `${base}/objectives/${objectiveIndex}`, message: `Objective "${objective.id}" is not reachable from the start.` });
      }
    }
    if (counterOnlyPath(def, byId)) {
      issues.push({ code: "counter-only", severity: "error", missionId: def.id, path: `${base}/objectives`,
        message: `Mission "${def.id}" can complete on a counter alone; add a reach, interact, survive or pursue objective to its success path.` });
    }
  }
  return issues;
}
