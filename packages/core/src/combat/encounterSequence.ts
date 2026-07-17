import type { NavPoint } from "../nav/navGrid";

/**
 * Lifecycle status of one phase in an encounter sequence: waiting to run, currently
 * running, or finished. Groups and leaves share the same three states.
 */
export type PhaseStatus = "pending" | "active" | "complete";

/**
 * Reference to a registered completion predicate: a `kind` naming the evaluator plus
 * opaque `params` the evaluator reads. The sequence core never interprets `params`; the
 * predicate registered under `kind` does.
 */
export interface PhaseCompletionRef {
  kind: string;
  params?: Readonly<Record<string, unknown>>;
}

/**
 * Reference to a registered spawn provider invoked when a phase is entered: a `kind`
 * naming the provider plus opaque `params`. Spawning is one optional node adapter — a
 * phase without `spawn` simply emits no spawn requests.
 */
export interface PhaseSpawnRef {
  kind: string;
  params?: Readonly<Record<string, unknown>>;
}

/**
 * One node in an encounter sequence tree. `data` is caller-owned and opaque to the core.
 * A node with `children` is a group whose children run in order; a node without is a leaf.
 * `completion` gates when the node finishes, `spawn` names an on-enter provider, and
 * `repeat` re-runs the node's subtree that many extra times before advancing.
 */
export interface EncounterPhase<TData = unknown> {
  /** Stable, tree-unique id. Survives serialization and phase injection. */
  id: string;
  data?: TData;
  children?: readonly EncounterPhase<TData>[];
  /**
   * Completion predicate reference. A leaf without one completes immediately (a marker or
   * spawn-only phase); a group without one completes once all its children complete.
   */
  completion?: PhaseCompletionRef;
  spawn?: PhaseSpawnRef;
  /** Extra runs of this node's subtree before advancing. Default 0 (runs once). */
  repeat?: number;
}

/** Per-node runtime record. Serializable — holds no functions or tree references. */
export interface PhaseRuntime {
  status: PhaseStatus;
  /** 0-based repeat iteration currently running. */
  iteration: number;
  /** `elapsed` at which the node was most recently entered, for time-based predicates. */
  enteredAt: number;
}

/**
 * Full serializable encounter state: the working phase tree (including any injected
 * phases), a per-node runtime map, the active path from root to the deepest open node,
 * accumulated time, and whether the sequence has finished. Round-trips through JSON with
 * no behavioral change; the registries live in {@link EncounterConfig}, not here.
 */
export interface EncounterState<TData = unknown> {
  roots: EncounterPhase<TData>[];
  nodes: Record<string, PhaseRuntime>;
  /** Ids from a root down to the deepest open node; empty before start and once done. */
  activePath: string[];
  elapsed: number;
  started: boolean;
  done: boolean;
}

/**
 * Caller-supplied signals a completion predicate reads. Every field is optional and
 * opaque to the core: `counts` of tagged live entities, continuous `metrics`, cumulative
 * `events`, and boolean `flags`. Deterministic given the same values.
 */
export interface EncounterSignals {
  counts?: Readonly<Record<string, number>>;
  metrics?: Readonly<Record<string, number>>;
  events?: Readonly<Record<string, number>>;
  flags?: Readonly<Record<string, boolean>>;
}

/**
 * Context passed to {@link startEncounter} / {@link updateEncounter}: the caller signals
 * predicates evaluate against, plus named `spawnPoints` catalogs (authored in the scene,
 * referenced by key) that spawn providers place against. Never holds coordinates the
 * sequence itself owns.
 */
export interface EncounterContext {
  signals?: EncounterSignals;
  /** Named lists of authored scene spawn points, referenced by spawn providers by key. */
  spawnPoints?: Readonly<Record<string, readonly NavPoint[]>>;
}

/** Evaluation context a completion predicate receives for the node under test. */
export interface PredicateContext {
  phaseId: string;
  iteration: number;
  /** Total accumulated encounter time. */
  elapsed: number;
  /** Time since this node was entered (0 on the tick it is entered). */
  phaseElapsed: number;
  signals: EncounterSignals;
}

/**
 * A completion predicate: pure and deterministic, returns true when the node it gates is
 * finished. Registered under a `kind` and reused across phases with different `params`.
 */
export type CompletionPredicate = (
  params: Readonly<Record<string, unknown>>,
  ctx: PredicateContext,
) => boolean;

/** A single spawn request a provider emits; `ref` is caller-defined, `point` optional. */
export interface EncounterSpawnRequest {
  ref: string;
  point?: NavPoint;
  data?: unknown;
}

/** Evaluation context a spawn provider receives when its phase is entered. */
export interface SpawnProviderContext {
  phaseId: string;
  iteration: number;
  elapsed: number;
  spawnPoints: Readonly<Record<string, readonly NavPoint[]>>;
}

/**
 * A spawn provider: given the phase's `params` and context, returns the spawn requests to
 * emit on enter. Deterministic; reads authored scene points from `ctx.spawnPoints` rather
 * than embedding coordinates.
 */
export type SpawnProvider = (
  params: Readonly<Record<string, unknown>>,
  ctx: SpawnProviderContext,
) => readonly EncounterSpawnRequest[];

/** A lifecycle event emitted while stepping an encounter, carrying provenance. */
export type EncounterEvent =
  | { type: "enter"; phaseId: string; iteration: number }
  | { type: "spawn"; phaseId: string; provider: string; requests: readonly EncounterSpawnRequest[] }
  | { type: "complete"; phaseId: string; iteration: number; reason: string }
  | { type: "done" };

/** Result of a step: the (mutated, returned) state and the events emitted this step. */
export interface EncounterStep<TData = unknown> {
  state: EncounterState<TData>;
  events: EncounterEvent[];
}

/**
 * Non-serializable configuration for an encounter: the authored phase tree plus predicate
 * and spawn-provider registries. Re-supplied alongside a loaded {@link EncounterState}, the
 * way `advanceSpawnDirector` pairs config with state, so the state itself stays pure data.
 */
export interface EncounterConfig<TData = unknown> {
  phases: readonly EncounterPhase<TData>[];
  /** Extra predicates, merged over the built-ins (a same-named entry overrides). */
  predicates?: Readonly<Record<string, CompletionPredicate>>;
  /** Extra spawn providers, merged over the built-ins. */
  spawnProviders?: Readonly<Record<string, SpawnProvider>>;
}

/** Where to insert an injected phase, relative to an existing node by id. */
export type PhaseInjectAt =
  | { before: string }
  | { after: string }
  | { childOf: string; index?: number };

function clone<TData>(phase: EncounterPhase<TData>): EncounterPhase<TData> {
  const copy: EncounterPhase<TData> = { id: phase.id };
  if (phase.data !== undefined) copy.data = phase.data;
  if (phase.completion !== undefined) copy.completion = phase.completion;
  if (phase.spawn !== undefined) copy.spawn = phase.spawn;
  if (phase.repeat !== undefined) copy.repeat = phase.repeat;
  if (phase.children !== undefined) copy.children = phase.children.map(clone);
  return copy;
}

function readNumber(params: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readString(params: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" ? value : null;
}

/**
 * Built-in completion predicates covering the common encounter gates: `immediate` (leaf
 * marker), `manual`/`flag` (external event via a caller flag), `timer` (phase seconds),
 * `cleared` (tagged entity count drained), `metric` (threshold on a live value), `event`
 * (cumulative event count), and `quorum` (at least N of nested predicates met). Merge your
 * own over these through {@link EncounterConfig.predicates}.
 *
 * @capability encounter-predicates gate encounter phase completion on timers, cleared spawns, metrics, events, or a quorum of conditions
 */
export const BUILTIN_COMPLETION_PREDICATES: Readonly<Record<string, CompletionPredicate>> = {
  immediate: () => true,
  manual: (params, ctx) => {
    const flag = readString(params, "flag") ?? ctx.phaseId;
    return ctx.signals.flags?.[flag] === true;
  },
  flag: (params, ctx) => {
    const flag = readString(params, "flag") ?? ctx.phaseId;
    return ctx.signals.flags?.[flag] === true;
  },
  timer: (params, ctx) => ctx.phaseElapsed >= readNumber(params, "seconds", 0),
  cleared: (params, ctx) => {
    const tag = readString(params, "tag");
    if (tag === null) return false;
    const remaining = readNumber(params, "remaining", 0);
    return (ctx.signals.counts?.[tag] ?? 0) <= remaining;
  },
  metric: (params, ctx) => {
    const name = readString(params, "name");
    if (name === null) return false;
    const value = ctx.signals.metrics?.[name] ?? 0;
    const target = readNumber(params, "target", 0);
    return readString(params, "direction") === "atMost" ? value <= target : value >= target;
  },
  event: (params, ctx) => {
    const name = readString(params, "name");
    if (name === null) return false;
    return (ctx.signals.events?.[name] ?? 0) >= readNumber(params, "count", 1);
  },
  quorum: (params, ctx) => {
    const refs = params["predicates"];
    if (!Array.isArray(refs)) return false;
    const need = readNumber(params, "count", refs.length);
    let met = 0;
    for (const raw of refs) {
      const ref = raw as PhaseCompletionRef;
      const predicate = BUILTIN_COMPLETION_PREDICATES[ref.kind];
      if (predicate !== undefined && predicate(ref.params ?? {}, ctx)) met += 1;
      if (met >= need) return true;
    }
    return false;
  },
};

/**
 * Built-in spawn providers. `points` reads a named authored scene point list from context
 * and cycles it to emit `count` requests, keeping coordinates in the scene rather than the
 * sequence. `list` echoes literal requests authored in `params.requests`. Merge your own
 * catalog- or director-backed providers through {@link EncounterConfig.spawnProviders}.
 *
 * @capability encounter-spawn-providers turn an entered encounter phase into spawn requests from authored scene points or an inline list
 */
export const BUILTIN_SPAWN_PROVIDERS: Readonly<Record<string, SpawnProvider>> = {
  points: (params, ctx) => {
    const ref = readString(params, "ref");
    if (ref === null) return [];
    const points = ctx.spawnPoints[ref] ?? [];
    if (points.length === 0) return [];
    const count = Math.max(0, Math.floor(readNumber(params, "count", points.length)));
    const entityRef = readString(params, "entity") ?? ref;
    const requests: EncounterSpawnRequest[] = [];
    for (let index = 0; index < count; index += 1) {
      requests.push({ ref: entityRef, point: points[index % points.length]! });
    }
    return requests;
  },
  list: (params) => {
    const raw = params["requests"];
    return Array.isArray(raw) ? (raw as EncounterSpawnRequest[]) : [];
  },
};

function collectIds<TData>(phases: readonly EncounterPhase<TData>[], out: Set<string>): void {
  for (const phase of phases) {
    if (out.has(phase.id)) throw new Error(`encounter phase id "${phase.id}" is not unique`);
    out.add(phase.id);
    if (phase.children !== undefined) collectIds(phase.children, out);
  }
}

function indexTree<TData>(
  phases: readonly EncounterPhase<TData>[],
  parent: EncounterPhase<TData> | null,
  index: Map<string, { phase: EncounterPhase<TData>; parent: EncounterPhase<TData> | null }>,
): void {
  for (const phase of phases) {
    index.set(phase.id, { phase, parent });
    if (phase.children !== undefined) indexTree(phase.children, phase, index);
  }
}

function ensureRuntime<TData>(state: EncounterState<TData>, id: string): PhaseRuntime {
  let runtime = state.nodes[id];
  if (runtime === undefined) {
    runtime = { status: "pending", iteration: 0, enteredAt: state.elapsed };
    state.nodes[id] = runtime;
  }
  return runtime;
}

/**
 * Build the initial, serializable state for an encounter from its config. Deep-copies the
 * authored phase tree (so later injection never mutates the config), verifies phase ids are
 * unique, and leaves every node pending. Does not enter the first phase — call
 * {@link startEncounter} for that.
 *
 * @capability encounter-state create the serializable starting state of a hierarchical encounter sequence
 */
export function createEncounterState<TData>(config: EncounterConfig<TData>): EncounterState<TData> {
  const ids = new Set<string>();
  collectIds(config.phases, ids);
  const roots = config.phases.map(clone);
  const nodes: Record<string, PhaseRuntime> = {};
  for (const id of ids) nodes[id] = { status: "pending", iteration: 0, enteredAt: 0 };
  return { roots, nodes, activePath: [], elapsed: 0, started: false, done: false };
}

interface TreeAccess<TData> {
  index: Map<string, { phase: EncounterPhase<TData>; parent: EncounterPhase<TData> | null }>;
  siblingsOf(id: string): readonly EncounterPhase<TData>[];
}

function access<TData>(state: EncounterState<TData>): TreeAccess<TData> {
  const index = new Map<string, { phase: EncounterPhase<TData>; parent: EncounterPhase<TData> | null }>();
  indexTree(state.roots, null, index);
  return {
    index,
    siblingsOf(id: string) {
      const parent = index.get(id)?.parent;
      return parent?.children ?? state.roots;
    },
  };
}

function resetSubtree<TData>(state: EncounterState<TData>, phase: EncounterPhase<TData>): void {
  const runtime = ensureRuntime(state, phase.id);
  runtime.status = "pending";
  if (phase.children !== undefined) for (const child of phase.children) resetSubtree(state, child);
}

/**
 * Enter a node and, if it is a group, descend to its first child, pushing every entered id
 * onto the active path and emitting enter + spawn events. Leaves the deepest entered node
 * as the new cursor. Bounded by tree depth.
 */
function enterChain<TData>(
  config: EncounterConfig<TData>,
  state: EncounterState<TData>,
  tree: TreeAccess<TData>,
  startId: string,
  ctx: EncounterContext,
  events: EncounterEvent[],
  spawned: Set<string>,
): void {
  let currentId: string | undefined = startId;
  const providers = { ...BUILTIN_SPAWN_PROVIDERS, ...config.spawnProviders };
  let guard = tree.index.size + 1;
  while (currentId !== undefined && guard > 0) {
    guard -= 1;
    const entry = tree.index.get(currentId);
    if (entry === undefined) return;
    const phase = entry.phase;
    const runtime = ensureRuntime(state, currentId);
    runtime.status = "active";
    runtime.enteredAt = state.elapsed;
    state.activePath.push(currentId);
    events.push({ type: "enter", phaseId: currentId, iteration: runtime.iteration });
    if (phase.spawn !== undefined) {
      // A phase that introduces spawns cannot complete on the same tick it enters — the
      // caller has not observed the spawn yet — so defer its evaluation to the next update.
      spawned.add(currentId);
      const provider = providers[phase.spawn.kind];
      if (provider !== undefined) {
        const requests = provider(phase.spawn.params ?? {}, {
          phaseId: currentId,
          iteration: runtime.iteration,
          elapsed: state.elapsed,
          spawnPoints: ctx.spawnPoints ?? {},
        });
        if (requests.length > 0)
          events.push({ type: "spawn", phaseId: currentId, provider: phase.spawn.kind, requests });
      }
    }
    const firstChild = phase.children?.[0];
    currentId = firstChild?.id;
  }
}

/**
 * Start a created encounter: enter the first root phase, descending to its first leaf, and
 * return the initial enter/spawn events. A no-op (with no events) on an already-started or
 * empty encounter. Mutates and returns `state`.
 *
 * @capability encounter-start enter the first phase of a hierarchical encounter and emit its opening spawn events
 */
export function startEncounter<TData>(
  config: EncounterConfig<TData>,
  state: EncounterState<TData>,
  ctx: EncounterContext = {},
): EncounterStep<TData> {
  const events: EncounterEvent[] = [];
  if (state.started || state.done || state.roots.length === 0) return { state, events };
  state.started = true;
  const tree = access(state);
  enterChain(config, state, tree, state.roots[0]!.id, ctx, events, new Set());
  return { state, events };
}

function predicateMet<TData>(
  config: EncounterConfig<TData>,
  phase: EncounterPhase<TData>,
  runtime: PhaseRuntime,
  state: EncounterState<TData>,
  ctx: EncounterContext,
): { met: boolean; reason: string } {
  const completion = phase.completion;
  if (completion === undefined) return { met: true, reason: phase.children === undefined ? "immediate" : "children" };
  const predicates = { ...BUILTIN_COMPLETION_PREDICATES, ...config.predicates };
  const predicate = predicates[completion.kind];
  if (predicate === undefined) return { met: false, reason: completion.kind };
  const met = predicate(completion.params ?? {}, {
    phaseId: phase.id,
    iteration: runtime.iteration,
    elapsed: state.elapsed,
    phaseElapsed: state.elapsed - runtime.enteredAt,
    signals: ctx.signals ?? {},
  });
  return { met, reason: completion.kind };
}

/**
 * Advance an encounter by `dt` seconds against the caller `ctx`. Accumulates time, then
 * repeatedly: evaluates the cursor node's completion predicate; on completion, either
 * re-runs its subtree (`repeat`) or marks it complete and advances to the next sibling —
 * bubbling up to parent groups whose children are exhausted — entering the next chain and
 * emitting enter/spawn/complete events. Emits a final `done` event when the last phase
 * completes. Bounded per call by node count; mutates and returns `state`.
 *
 * @capability encounter-advance step a hierarchical encounter, resolving predicate-gated completion, repeats, and nested advance with lifecycle events
 */
export function updateEncounter<TData>(
  config: EncounterConfig<TData>,
  state: EncounterState<TData>,
  dt: number,
  ctx: EncounterContext = {},
): EncounterStep<TData> {
  const events: EncounterEvent[] = [];
  if (!state.started || state.done || state.activePath.length === 0) return { state, events };
  if (dt > 0) state.elapsed += dt;

  const tree = access(state);
  const justSpawned = new Set<string>();
  let guard = tree.index.size * 2 + 2;
  while (guard > 0 && state.activePath.length > 0) {
    guard -= 1;
    const cursorId = state.activePath[state.activePath.length - 1]!;
    // A phase that spawned earlier in this same step defers its completion to the next update.
    if (justSpawned.has(cursorId)) break;
    const entry = tree.index.get(cursorId);
    if (entry === undefined) {
      state.activePath.pop();
      continue;
    }
    const phase = entry.phase;
    const runtime = ensureRuntime(state, cursorId);
    const { met, reason } = predicateMet(config, phase, runtime, state, ctx);
    if (!met) break;

    if (runtime.iteration < Math.max(0, Math.floor(phase.repeat ?? 0))) {
      runtime.iteration += 1;
      if (phase.children !== undefined) for (const child of phase.children) resetSubtree(state, child);
      state.activePath.pop();
      enterChain(config, state, tree, cursorId, ctx, events, justSpawned);
      continue;
    }

    runtime.status = "complete";
    events.push({ type: "complete", phaseId: cursorId, iteration: runtime.iteration, reason });
    state.activePath.pop();

    const siblings = tree.siblingsOf(cursorId);
    const position = siblings.findIndex((sibling) => sibling.id === cursorId);
    const nextSibling = position >= 0 ? siblings[position + 1] : undefined;
    if (nextSibling !== undefined) {
      enterChain(config, state, tree, nextSibling.id, ctx, events, justSpawned);
    } else if (state.activePath.length === 0) {
      state.done = true;
      events.push({ type: "done" });
      break;
    }
  }
  return { state, events };
}

/**
 * Force the deepest active phase (or a named active phase) to complete now, regardless of
 * its predicate — the escape hatch for external/scripted completion and failure/retry flows.
 * Advances into the next phase and emits the same lifecycle events as a natural completion.
 * Returns no events if the phase is not currently active. Mutates and returns `state`.
 *
 * @capability encounter-force-complete externally complete an active encounter phase to drive scripted or failure-retry transitions
 */
export function forceCompletePhase<TData>(
  config: EncounterConfig<TData>,
  state: EncounterState<TData>,
  ctx: EncounterContext = {},
  phaseId?: string,
): EncounterStep<TData> {
  const events: EncounterEvent[] = [];
  if (!state.started || state.done || state.activePath.length === 0) return { state, events };
  const targetId = phaseId ?? state.activePath[state.activePath.length - 1]!;
  if (!state.activePath.includes(targetId)) return { state, events };
  // Collapse the active path down to the target so update resolves it as the cursor, then
  // advance it via an always-true synthetic predicate scoped to this single phase.
  while (state.activePath.length > 0 && state.activePath[state.activePath.length - 1] !== targetId) {
    state.activePath.pop();
  }
  const tree = access(state);
  const entry = tree.index.get(targetId);
  if (entry === undefined) return { state, events };
  const originalCompletion = entry.phase.completion;
  entry.phase.completion = { kind: "__forced__" };
  const forcedConfig: EncounterConfig<TData> = {
    ...config,
    predicates: { ...config.predicates, __forced__: () => true },
  };
  const step = updateEncounter(forcedConfig, state, 0, ctx);
  // Restore the authored predicate on the (possibly repeating) phase for future runs.
  if (originalCompletion === undefined) delete entry.phase.completion;
  else entry.phase.completion = originalCompletion;
  return step;
}

/**
 * Insert a phase into the working tree at runtime — before/after a sibling, or as a child of
 * a group — without disturbing already-completed or active nodes. The injected subtree
 * becomes part of the serializable state (so a mid-encounter save preserves it) and is
 * reached in normal order if it sits ahead of the cursor. Ids must stay tree-unique. Mutates
 * and returns `state`.
 *
 * @capability encounter-inject-phase dynamically insert a phase or branch into a running encounter, e.g. a boss on the final wave
 */
export function injectPhase<TData>(
  state: EncounterState<TData>,
  phase: EncounterPhase<TData>,
  at: PhaseInjectAt,
): EncounterState<TData> {
  const existing = new Set<string>();
  collectIds(state.roots, existing);
  const incoming = new Set<string>();
  collectIds([phase], incoming);
  for (const id of incoming) if (existing.has(id)) throw new Error(`encounter phase id "${id}" is not unique`);
  const copy = clone(phase);

  const tree = access(state);
  if ("childOf" in at) {
    const parentEntry = tree.index.get(at.childOf);
    if (parentEntry === undefined) throw new Error(`inject target "${at.childOf}" not found`);
    const parent = parentEntry.phase;
    const children = parent.children !== undefined ? [...parent.children] : [];
    const index = at.index === undefined ? children.length : Math.max(0, Math.min(children.length, at.index));
    children.splice(index, 0, copy);
    parent.children = children;
  } else {
    const targetId = "before" in at ? at.before : at.after;
    const targetEntry = tree.index.get(targetId);
    if (targetEntry === undefined) throw new Error(`inject target "${targetId}" not found`);
    const siblings = targetEntry.parent?.children ?? state.roots;
    const list = [...siblings];
    const position = list.findIndex((sibling) => sibling.id === targetId);
    const insertAt = "before" in at ? position : position + 1;
    list.splice(insertAt, 0, copy);
    if (targetEntry.parent === null) state.roots = list;
    else targetEntry.parent.children = list;
  }
  resetSubtree(state, copy);
  return state;
}

/**
 * The deepest active phase id — the completion cursor a HUD reads to label the current
 * wave/phase — or null before start and once done.
 *
 * @capability encounter-active-phase read the id of the phase an encounter is currently waiting on
 */
export function activePhaseId<TData>(state: EncounterState<TData>): string | null {
  return state.activePath.length > 0 ? state.activePath[state.activePath.length - 1]! : null;
}

/**
 * The runtime status of a phase by id (pending/active/complete), or null if the id is
 * unknown — for driving per-phase HUD ticks and objective checklists.
 *
 * @capability encounter-phase-status read whether a specific encounter phase is pending, active, or complete
 */
export function phaseStatus<TData>(state: EncounterState<TData>, id: string): PhaseStatus | null {
  return state.nodes[id]?.status ?? null;
}

/**
 * Progress across the whole tree: how many phases have completed out of the total node
 * count, plus whether the encounter has finished. Counts injected phases.
 *
 * @capability encounter-progress read completed-vs-total progress across a hierarchical encounter for HUD or objective display
 */
export function encounterProgress<TData>(state: EncounterState<TData>): {
  completed: number;
  total: number;
  done: boolean;
} {
  let total = 0;
  let completed = 0;
  const walk = (phases: readonly EncounterPhase<TData>[]): void => {
    for (const phase of phases) {
      total += 1;
      if (state.nodes[phase.id]?.status === "complete") completed += 1;
      if (phase.children !== undefined) walk(phase.children);
    }
  };
  walk(state.roots);
  return { completed, total, done: state.done };
}
