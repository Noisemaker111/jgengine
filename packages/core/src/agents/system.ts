import type { UtilityInterrupt, UtilityOption, UtilityTunables } from "../ai/utilityBrain";
import type { NeedDefinition } from "../sim/needs";
import type { Vec3 } from "../world/geometry";
import {
  createAgent,
  type Agent,
  type AgentFallback,
  type AgentFrame,
  type AgentSnapshot,
  type AgentTarget,
} from "./agent";
import type { Mood, MoodTier, MoodWeight } from "./mood";
import type { AgentScheduleConfig } from "./schedule";

export type { Agent, AgentAction, AgentFallback, AgentFrame, AgentSnapshot, AgentTarget } from "./agent";
export type { AgentScheduleConfig, AgentScheduleStop, AgentSchedulePhase } from "./schedule";
export type { Mood, MoodTier, MoodWeight } from "./mood";
export type { NeedDefinition } from "../sim/needs";
export type { UtilityInterrupt, UtilityOption, UtilityTunables } from "../ai/utilityBrain";

export interface AgentMoodConfig {
  readonly weights?: readonly MoodWeight[];
  /** The game's own bands. A system must name them; a member may override them. */
  readonly tiers?: readonly MoodTier[];
}

export interface AgentSelectView {
  readonly id: string;
  readonly agent: Agent;
  readonly at: Vec3 | null;
  readonly now: number;
  readonly far: boolean;
}

/**
 * Everything the member could do right now, as the game's world offers it. Declared once per system.
 * The system reads the list within the member's update, so a selector may refill one list per call.
 */
export type AgentSelector = (view: AgentSelectView) => readonly AgentTarget[];

export interface AgentSystemStorage {
  read(): AgentSystemState | undefined;
  write(next: AgentSystemState): void;
}

export interface AgentMemberState {
  readonly agent: AgentSnapshot;
  readonly far: boolean;
}

export interface AgentSystemState {
  readonly version: 1;
  readonly members: Readonly<Record<string, AgentMemberState>>;
}

export interface AgentMemberSpec extends UtilityTunables {
  readonly id: string;
  /** Needs for this member; defaults to the system's. */
  readonly needs?: readonly NeedDefinition[];
  /** Scored actions for this member; defaults to the system's. */
  readonly options?: readonly UtilityOption[];
  readonly interrupts?: readonly UtilityInterrupt[];
  readonly schedule?: AgentScheduleConfig;
  readonly mood?: AgentMoodConfig;
  /** Targets for this member instead of the system's selector. */
  readonly select?: AgentSelector;
  /** `[0,1)` source; defaults to the system's `rng`. */
  readonly rng?: () => number;
  readonly devtoolsName?: string;
  readonly far?: boolean;
}

export interface AgentSystemConfig {
  /** Needs every member carries unless it declares its own. */
  readonly needs: readonly NeedDefinition[];
  /** Scored actions every member chooses between unless it declares its own. */
  readonly options: readonly UtilityOption[];
  readonly interrupts?: readonly UtilityInterrupt[];
  /** Mood policy every member feels on unless it declares its own. */
  readonly mood: AgentMoodConfig & { readonly tiers: readonly MoodTier[] };
  readonly members?: readonly AgentMemberSpec[];
  /** Resolve every member's targets. Called once per on-camera member per tick, never per option. */
  readonly select?: AgentSelector;
  /** Fallback given to every target that declares none - one fallback per system, not per target. */
  readonly fallback?: AgentFallback;
  readonly clock?: { now(): number };
  readonly position?: (id: string) => Vec3 | null;
  readonly storage?: AgentSystemStorage;
  /** Deterministic source shared by members that do not declare their own. */
  readonly rng?: () => number;
  readonly defaults?: UtilityTunables;
  readonly devtoolsName?: string;
}

export interface AgentSystem {
  /** Create and register one member; a member saved under this id resumes instead of starting fresh. */
  add(spec: AgentMemberSpec): Agent;
  get(id: string): Agent | null;
  has(id: string): boolean;
  remove(id: string): void;
  ids(): readonly string[];
  size(): number;
  tick(dt: number, now?: number): void;
  frame(id: string): AgentFrame | null;
  mood(id: string): Mood | null;
  moodMean(): number | null;
  action(id: string): AgentFrame["action"] | null;
  setFar(id: string, far: boolean): void;
  isFar(id: string): boolean;
  save(): AgentSystemState;
  load(next: AgentSystemState | undefined): void;
  dispose(): void;
}

/** @capability agents a needs, thought, action and mood loop an agent runs on the world clock */
export function createAgentSystem(config: AgentSystemConfig): AgentSystem {
  const agents = new Map<string, Agent>();
  const frames = new Map<string, AgentFrame>();
  const selectors = new Map<string, AgentSelector>();
  const saved = new Map<string, AgentMemberState>();
  const order: string[] = [];
  let hydrated = false;
  let lastNow = 0;
  // Refilled for each member a tick: the selector's view, and the targets with the system's fallback
  // filled in. Neither outlives the member's update, so a tick of the whole cast allocates neither.
  const view: { id: string; agent: Agent; at: Vec3 | null; now: number; far: boolean } = {
    id: "",
    agent: null as unknown as Agent,
    at: null,
    now: 0,
    far: false,
  };
  const filled: FilledTarget[] = [];

  function selectFor(id: string): AgentSelector | undefined {
    return selectors.get(id) ?? config.select;
  }

  function restoreInto(agent: Agent, state: AgentMemberState): void {
    agent.restore(state.agent);
    if (state.far) agent.setFar(true);
  }

  function hydrate(): void {
    if (hydrated) return;
    const state = config.storage?.read();
    if (state === undefined) return;
    hydrated = true;
    loadState(state);
  }

  function loadState(next: AgentSystemState | undefined): void {
    if (next === undefined) return;
    for (const [id, state] of Object.entries(next.members)) {
      const agent = agents.get(id);
      if (agent === undefined) {
        saved.set(id, state);
        continue;
      }
      restoreInto(agent, state);
      saved.delete(id);
    }
  }

  function create(spec: AgentMemberSpec): Agent {
    const defaults = config.defaults;
    const tuned = <K extends keyof UtilityTunables>(key: K): NonNullable<UtilityTunables[K]> | undefined =>
      spec[key] ?? defaults?.[key];
    const devtoolsName = spec.devtoolsName ?? (config.devtoolsName === undefined ? undefined : `${config.devtoolsName}.${spec.id}`);
    const agent = createAgent({
      id: spec.id,
      needs: spec.needs ?? config.needs,
      options: spec.options ?? config.options,
      ...optional("interrupts", spec.interrupts ?? config.interrupts),
      ...optional("schedule", spec.schedule),
      mood: {
        ...optional("weights", spec.mood?.weights ?? config.mood.weights),
        tiers: spec.mood?.tiers ?? config.mood.tiers,
      },
      ...optional("switchMargin", tuned("switchMargin")),
      ...optional("minHoldSeconds", tuned("minHoldSeconds")),
      ...optional("costWeight", tuned("costWeight")),
      ...optional("jitter", tuned("jitter")),
      ...optional("rng", spec.rng ?? config.rng),
      ...optional("devtoolsName", devtoolsName),
    });
    agents.set(agent.id, agent);
    order.push(agent.id);
    if (spec.select !== undefined) selectors.set(agent.id, spec.select);
    if (spec.far === true) agent.setFar(true);
    const pending = saved.get(spec.id);
    if (pending !== undefined) {
      restoreInto(agent, pending);
      saved.delete(spec.id);
    }
    return agent;
  }

  const system: AgentSystem = {
    add(spec) {
      const existing = agents.get(spec.id);
      if (existing !== undefined) return existing;
      return create(spec);
    },
    get: (id) => agents.get(id) ?? null,
    has: (id) => agents.has(id),
    remove(id) {
      const agent = agents.get(id);
      if (agent === undefined) return;
      agent.dispose();
      agents.delete(id);
      frames.delete(id);
      selectors.delete(id);
      saved.delete(id);
      const at = order.indexOf(id);
      if (at >= 0) order.splice(at, 1);
    },
    ids: () => order,
    size: () => order.length,
    tick(dt, now) {
      hydrate();
      const time = now ?? config.clock?.now() ?? lastNow;
      lastNow = time;
      for (const id of order) {
        const agent = agents.get(id);
        if (agent === undefined) continue;
        let targets: readonly AgentTarget[] = [];
        if (!agent.isFar()) {
          const selector = selectFor(id);
          if (selector !== undefined) {
            view.id = id;
            view.agent = agent;
            view.at = config.position?.(id) ?? null;
            view.now = time;
            targets = selector(view);
            if (config.fallback !== undefined) targets = withFallback(targets, config.fallback, filled);
          }
        }
        frames.set(id, agent.update({ dt, now: time, targets }));
      }
    },
    frame: (id) => frames.get(id) ?? null,
    mood: (id) => agents.get(id)?.mood() ?? null,
    moodMean() {
      if (order.length === 0) return null;
      let total = 0;
      for (const id of order) {
        const agent = agents.get(id);
        if (agent !== undefined) total += agent.mood().score;
      }
      return total / order.length;
    },
    action: (id) => frames.get(id)?.action ?? null,
    setFar(id, far) {
      const agent = agents.get(id);
      if (agent === undefined) return;
      agent.setFar(far);
      if (far) frames.delete(id);
    },
    isFar: (id) => agents.get(id)?.isFar() ?? false,
    save() {
      hydrate();
      const members: Record<string, AgentMemberState> = {};
      for (const id of order) {
        const agent = agents.get(id);
        if (agent !== undefined) members[id] = { agent: agent.snapshot(), far: agent.isFar() };
      }
      const state: AgentSystemState = { version: 1, members };
      config.storage?.write(state);
      return state;
    },
    load: loadState,
    dispose() {
      for (const agent of agents.values()) agent.dispose();
      agents.clear();
      frames.clear();
      saved.clear();
      order.length = 0;
    },
  };

  hydrate();
  for (const spec of config.members ?? []) create(spec);
  return system;
}

/** A target with the system's fallback filled in, refilled in place every tick. */
interface FilledTarget {
  option: string;
  target: string;
  cost: number;
  fallback: AgentFallback;
}

/**
 * Targets keep their own fallback; the rest inherit the system's one. Written into `into`'s records
 * (a missing cost reads as 0, as the brain prices it), so the copy costs no allocation once warm.
 */
function withFallback(targets: readonly AgentTarget[], fallback: AgentFallback, into: FilledTarget[]): readonly AgentTarget[] {
  let missing = false;
  for (const target of targets) if (target.fallback === undefined) missing = true;
  if (!missing) return targets;
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]!;
    const record = into[index] ?? (into[index] = { option: "", target: "", cost: 0, fallback });
    record.option = target.option;
    record.target = target.target;
    record.cost = target.cost ?? 0;
    record.fallback = target.fallback ?? fallback;
  }
  into.length = targets.length;
  return into;
}

/** Spread a config field only when the game set it, so `createAgent`'s own default stands otherwise. */
function optional<K extends string, V>(key: K, value: V | undefined): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
