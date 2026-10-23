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

/** The mood policy a member runs on: which needs matter, and the game's own words for the bands. */
export interface AgentMoodConfig {
  readonly weights?: readonly MoodWeight[];
  readonly tiers?: readonly MoodTier[];
}

/** What a selector is told about the member asking: who it is, its live agent, and where it stands. */
export interface AgentSelectView {
  readonly id: string;
  /** The live agent, for a selector that reads needs, mood or the held action. */
  readonly agent: Agent;
  /** Body position from the system's `position` reader, or `null` when the game has no body for it. */
  readonly at: Vec3 | null;
  readonly now: number;
  /** True while the member is off camera and takes no utility pass this tick. */
  readonly far: boolean;
}

/** Everything the member could do right now, as the game's world offers it. Declared once per system. */
export type AgentSelector = (view: AgentSelectView) => readonly AgentTarget[];

/** Where a system keeps its save data: a key-value store, a save slot, or a test's map. */
export interface AgentSystemStorage {
  read(): AgentSystemState | undefined;
  write(next: AgentSystemState): void;
}

/** One member's saved state: its agent snapshot plus the off-camera flag the snapshot does not carry. */
export interface AgentMemberState {
  readonly agent: AgentSnapshot;
  readonly far: boolean;
}

/** The whole system as plain JSON - drop it in a save, read it back with {@link AgentSystem.load}. */
export interface AgentSystemState {
  readonly version: 1;
  readonly members: Readonly<Record<string, AgentMemberState>>;
}

/** One member: an id, and only what differs from the system's defaults. */
export interface AgentMemberSpec extends UtilityTunables {
  readonly id: string;
  /** Needs for this member; defaults to the system's. */
  readonly needs?: readonly NeedDefinition[];
  /** Scored actions for this member; defaults to the system's. */
  readonly options?: readonly UtilityOption[];
  readonly interrupts?: readonly UtilityInterrupt[];
  /** The member's authored day; omit for one that only reacts to targets. */
  readonly schedule?: AgentScheduleConfig;
  readonly mood?: AgentMoodConfig;
  /** Targets for this member instead of the system's selector. */
  readonly select?: AgentSelector;
  /** `[0,1)` source; defaults to the system's `rng`. */
  readonly rng?: () => number;
  readonly devtoolsName?: string;
  /** Start off camera: schedule and needs only, no utility pass, until `setFar(id, false)`. */
  readonly far?: boolean;
}

/** The game's data, in one place: what its people need, what they can do, and how they feel. */
export interface AgentSystemConfig {
  /** Needs every member carries unless it declares its own. */
  readonly needs: readonly NeedDefinition[];
  /** Scored actions every member chooses between unless it declares its own. */
  readonly options: readonly UtilityOption[];
  readonly interrupts?: readonly UtilityInterrupt[];
  readonly mood?: AgentMoodConfig;
  /** Members present at creation; more join later with {@link AgentSystem.add}. */
  readonly members?: readonly AgentMemberSpec[];
  /** Resolve every member's targets. Called once per on-camera member per tick, never per option. */
  readonly select?: AgentSelector;
  /** Fallback given to every target that declares none - one fallback per system, not per target. */
  readonly fallback?: AgentFallback;
  /** The world clock, so `tick(dt)` needs no `now` argument. */
  readonly clock?: { now(): number };
  /** Where a member's body is, handed to the selector as `at`. */
  readonly position?: (id: string) => Vec3 | null;
  /** Save storage, hydrated on the first tick and written by {@link AgentSystem.save}. */
  readonly storage?: AgentSystemStorage;
  /** Deterministic source shared by members that do not declare their own. */
  readonly rng?: () => number;
  /** Dials every member starts with; a member may override any of them. */
  readonly defaults?: UtilityTunables;
  /** Devtools prefix: member `x` registers as `<devtoolsName>.x`. */
  readonly devtoolsName?: string;
}

/**
 * A whole cast of agents behind one factory and one tick.
 *
 * Feed it a game's data once - needs, options, mood weights, the members and their schedules - and it
 * owns the parts a game should not write: the roster, lazy creation, one tick for everyone, where a
 * target came from, and a save blob that is plain JSON. Everything an individual {@link Agent} can do
 * stays reachable through {@link get}.
 */
export interface AgentSystem {
  /** Create and register one member; a member saved under this id resumes instead of starting fresh. */
  add(spec: AgentMemberSpec): Agent;
  get(id: string): Agent | null;
  has(id: string): boolean;
  remove(id: string): void;
  /** Member ids in creation order. */
  ids(): readonly string[];
  size(): number;
  /** One call per game tick: decay, day plan and decision for every member, near or far. */
  tick(dt: number, now?: number): void;
  /** What the last tick produced for a member, or `null` before it has ticked. */
  frame(id: string): AgentFrame | null;
  /** A member's mood, readable before its first tick. */
  mood(id: string): Mood | null;
  /** Mean mood across members, or `null` for an empty system. */
  moodMean(): number | null;
  /** Action of a member, `null` before its first tick. */
  action(id: string): AgentFrame["action"] | null;
  setFar(id: string, far: boolean): void;
  isFar(id: string): boolean;
  /** Plain-JSON state, also written to `storage` when one was given. */
  save(): AgentSystemState;
  /** Restore members saved under ids this system knows, and hold the rest until they join. */
  load(next: AgentSystemState | undefined): void;
  dispose(): void;
}

/**
 * One call for a whole cast: a game hands over its needs, options, mood weights, schedules and one
 * target selector, and gets back a running system with a single `tick(dt)` and a save blob that goes
 * into the game's own save.
 *
 * @capability agents a needs, thought, action and mood loop an agent runs on the world clock
 */
export function createAgentSystem(config: AgentSystemConfig): AgentSystem {
  const agents = new Map<string, Agent>();
  const frames = new Map<string, AgentFrame>();
  const selectors = new Map<string, AgentSelector>();
  const saved = new Map<string, AgentMemberState>();
  const order: string[] = [];
  let hydrated = false;
  let lastNow = 0;

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
        ...optional("weights", spec.mood?.weights ?? config.mood?.weights),
        ...optional("tiers", spec.mood?.tiers ?? config.mood?.tiers),
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
            targets = selector({
              id,
              agent,
              at: config.position?.(id) ?? null,
              now: time,
              far: false,
            });
            if (config.fallback !== undefined) targets = withFallback(targets, config.fallback);
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

/** Targets keep their own fallback; the rest inherit the system's one. */
function withFallback(targets: readonly AgentTarget[], fallback: AgentFallback): readonly AgentTarget[] {
  let changed = false;
  const next = targets.map((target) => {
    if (target.fallback !== undefined) return target;
    changed = true;
    return { ...target, fallback };
  });
  return changed ? next : targets;
}

/** Spread a config field only when the game set it, so `createAgent`'s own default stands otherwise. */
function optional<K extends string, V>(key: K, value: V | undefined): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
