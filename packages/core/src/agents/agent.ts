import {
  createUtilityBrain,
  type UtilityBrainSnapshot,
  type UtilityCandidate,
  type UtilityInterrupt,
  type UtilityOption,
  type UtilitySwitchReason,
} from "../ai/utilityBrain";
import { createNeedSet, type NeedDefinition, type NeedSet, type NeedSnapshot } from "../sim/needs";
import {
  createMoodReader,
  type Mood,
  type MoodReader,
  type MoodSnapshot,
  type MoodTier,
  type MoodWeight,
} from "./mood";
import { createAgentSchedule, type AgentSchedule, type AgentScheduleConfig, type AgentSchedulePhase } from "./schedule";

/** Where an agent goes when the thing it wanted is gone: a named option and a named place. */
export interface AgentFallback {
  readonly option: string;
  readonly target: string;
}

/** One reachable thing the agent could do this tick, as the game sees its own world. */
export interface AgentTarget {
  /** Option id declared in the agent's `options`; unknown ids are skipped. */
  readonly option: string;
  /** Opaque place or object id the option would be done at. */
  readonly target: string;
  /** Effort the caller wants priced in: travel, queue seconds, price. */
  readonly cost?: number;
  /** What to do when this target stops existing, instead of re-deciding from scratch. */
  readonly fallback?: AgentFallback;
}

/** What the agent is doing. */
export interface AgentAction {
  readonly option: string | null;
  readonly target: string | null;
  readonly fallback: AgentFallback | null;
  /** True while the action is the declared fallback rather than the agent's own pick. */
  readonly usedFallback: boolean;
  /** Game-second the action began. */
  readonly since: number;
  readonly score: number;
}

/** Why the action last changed. */
export type AgentActionReason = UtilitySwitchReason | "fallback" | "schedule" | "cleared";

/** One call per tick: the clock, and the targets the game's world currently offers. */
export interface AgentUpdate {
  readonly dt: number;
  /** Absolute game-second from the world clock; the schedule reads it. */
  readonly now?: number;
  readonly targets?: readonly AgentTarget[];
}

/** What one update produced: the action, the feeling, and where the day plan puts the agent. */
export interface AgentFrame {
  readonly action: AgentAction;
  readonly mood: Mood;
  readonly phase: AgentSchedulePhase | null;
  /** Place the work beat posts the agent to now; `null` with no schedule or while travelling. */
  readonly post: string | null;
  readonly changed: boolean;
  readonly reason: AgentActionReason | null;
}

/** Everything an agent is made of. Policy is data; nothing about a game is compiled in. */
export interface AgentConfig {
  readonly id: string;
  /** Decaying needs, in the survival meter shape (`sim/needs`). Order breaks ties. */
  readonly needs: readonly NeedDefinition[];
  /** Scored actions, in the utility option shape (`ai/utilityBrain`). */
  readonly options: readonly UtilityOption[];
  readonly interrupts?: readonly UtilityInterrupt[];
  /** The authored day plan, or omitted for an agent with no schedule. */
  readonly schedule?: AgentScheduleConfig;
  readonly mood?: { readonly weights?: readonly MoodWeight[]; readonly tiers?: readonly MoodTier[] };
  readonly switchMargin?: number;
  readonly minHoldSeconds?: number;
  readonly costWeight?: number;
  readonly jitter?: number;
  /** `[0,1)` source for `jitter`; pass `ctx.rng` so runs replay. */
  readonly rng?: () => number;
  readonly devtoolsName?: string;
}

/** Serializable whole agent: needs, feeling, held action, day-plan cursor and the far flag. */
export interface AgentSnapshot {
  needs: NeedSnapshot;
  mood: MoodSnapshot;
  brain: UtilityBrainSnapshot;
  action: AgentAction;
  /** True while the agent runs on its schedule alone, with no utility pass per tick. */
  far: boolean;
  /**
   * Identity of the schedule stop the needs were last refilled at (`stop@arrival`). Saved so a
   * loaded agent does not eat the same meal twice.
   */
  scheduleMark: string | null;
}

/**
 * Needs, mood, schedule and a chosen action, in one object a game ticks.
 *
 * `update` is the loop: needs decay (`sim/needs`), the day plan says where the agent belongs
 * (`sim/routine` through an agent schedule), the utility brain picks among the targets the game
 * offers (`ai/utilityBrain`), and the mood reads how satisfied those needs are. A target that
 * disappears falls back to the declared fallback rather than freezing the agent.
 */
export interface Agent {
  readonly id: string;
  /** The agent's own need set - the game refills it after a meal, a ride or a night's sleep. */
  readonly needs: NeedSet;
  /** Current mood: weighted need satisfaction plus any source the game raised. */
  mood(): Mood;
  /** The game-raised mood sources (a queue outside, litter underfoot). */
  readonly moodSources: MoodReader;
  /** The resigned day plan, or `null` for an agent that only reacts to targets. */
  readonly schedule: AgentSchedule | null;
  /** The held action. */
  action(): AgentAction;
  /** Where the schedule puts the agent now; `null` without a schedule. */
  phaseAt(now: number): AgentSchedulePhase | null;
  /** Run one tick: decay, day plan, decision. Returns the same frame object each call. */
  update(next: AgentUpdate): AgentFrame;
  /**
   * Put the agent off camera: it keeps decaying and follows its schedule, but takes no utility
   * pass - the cheap state a far body should be. A far agent with no schedule holds its action.
   */
  setFar(far: boolean): void;
  isFar(): boolean;
  retune(patch: {
    readonly switchMargin?: number;
    readonly minHoldSeconds?: number;
    readonly costWeight?: number;
    readonly jitter?: number;
  }): void;
  snapshot(): AgentSnapshot;
  restore(next: AgentSnapshot): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

const IDLE_ACTION: AgentAction = {
  option: null,
  target: null,
  fallback: null,
  usedFallback: false,
  since: 0,
  score: 0,
};

function findTarget(
  targets: readonly AgentTarget[],
  option: string | null,
  target: string | null,
): AgentTarget | null {
  for (const candidate of targets) {
    if (candidate.option === option && candidate.target === target) return candidate;
  }
  return null;
}

function firstOfOption(targets: readonly AgentTarget[], option: string | null): AgentTarget | null {
  if (option === null) return null;
  for (const candidate of targets) if (candidate.option === option) return candidate;
  return null;
}

/**
 * Create one agent. The same factory serves a park guest, a household being, a patrolling janitor
 * and a soldier: `options` is what it can choose between, `schedule` is where its day puts it.
 *
 * @capability agents a needs, thought, action and mood loop an agent runs on the world clock
 */
export function createAgent(config: AgentConfig): Agent {
  const needs = createNeedSet(config.needs);
  const brain = createUtilityBrain({
    needs,
    options: config.options,
    ...(config.interrupts === undefined ? {} : { interrupts: config.interrupts }),
    ...(config.switchMargin === undefined ? {} : { switchMargin: config.switchMargin }),
    ...(config.minHoldSeconds === undefined ? {} : { minHoldSeconds: config.minHoldSeconds }),
    ...(config.costWeight === undefined ? {} : { costWeight: config.costWeight }),
    ...(config.jitter === undefined ? {} : { jitter: config.jitter }),
    ...(config.rng === undefined ? {} : { rng: config.rng }),
    ...(config.devtoolsName === undefined ? {} : { devtoolsName: config.devtoolsName }),
  });
  const moodReader = createMoodReader({
    needs,
    ...(config.mood?.weights === undefined ? {} : { weights: config.mood.weights }),
    ...(config.mood?.tiers === undefined ? {} : { tiers: config.mood.tiers }),
  });
  const schedule = config.schedule === undefined ? null : createAgentSchedule(config.schedule);

  let action: AgentAction = { ...IDLE_ACTION };
  let far = false;
  let scheduleMark: string | null = null;
  let reason: AgentActionReason | null = null;
  let changed = false;
  const candidates: UtilityCandidate[] = [];
  let frame: AgentFrame = {
    action,
    mood: moodReader.read(),
    phase: null,
    post: null,
    changed: false,
    reason: null,
  };

  function applySchedule(now: number): AgentSchedulePhase | null {
    if (schedule === null) return null;
    const phase = schedule.phaseAt(now);
    const mark = `${phase.stop}@${phase.since}`;
    if (mark !== scheduleMark) {
      scheduleMark = mark;
      if (phase.refill !== null && !phase.travelling) {
        for (const [id, amount] of Object.entries(phase.refill)) needs.refill(id, amount);
      }
    }
    return phase;
  }

  function commit(option: string | null, target: string, score: number, since: number): void {
    if (option === null) {
      action = { ...action, option: null, target: null, since };
      return;
    }
    if (brain.chosen() !== option) brain.decide([{ option, cost: 0 }]);
    action = { ...action, option, target, since, score };
  }

  function think(targets: readonly AgentTarget[], now: number): void {
    candidates.length = 0;
    for (const target of targets) {
      candidates.push(target.cost === undefined ? { option: target.option } : { option: target.option, cost: target.cost });
    }
    const decision = brain.decide(candidates);
    const pickedOption = decision.option;
    const pickedTarget = firstOfOption(targets, pickedOption);
    const held = findTarget(targets, action.option, action.target);

    const adopt = (target: AgentTarget, nextReason: AgentActionReason, usedFallback: boolean): void => {
      const nextScore = brain.scoreOf(target.option);
      const changedIdentity = target.option !== action.option || target.target !== action.target;
      commit(target.option, target.target, nextScore, now);
      action = {
        ...action,
        fallback: usedFallback ? null : target.fallback ?? null,
        usedFallback,
      };
      changed = changedIdentity;
      reason = changed ? nextReason : reason;
    };

    if (action.option !== null && held === null) {
      const fallback = action.fallback;
      const fallbackTarget = fallback === null ? null : findTarget(targets, fallback.option, fallback.target);
      if (fallbackTarget !== null) {
        adopt(fallbackTarget, "fallback", true);
        return;
      }
      if (pickedTarget === null) {
        action = { ...IDLE_ACTION, since: now };
        changed = true;
        reason = "cleared";
        return;
      }
      adopt(pickedTarget, decision.reason ?? "unavailable", false);
      return;
    }

    if (pickedTarget === null) {
      if (action.option === null) {
        changed = false;
        reason = null;
        return;
      }
      return;
    }

    if (decision.changed && pickedOption !== action.option) {
      adopt(pickedTarget, decision.reason ?? "score", false);
      return;
    }

    if (action.option === null) {
      adopt(pickedTarget, decision.reason ?? "initial", false);
      return;
    }

    changed = false;
  }

  return {
    id: config.id,
    needs,
    mood: () => moodReader.read(),
    moodSources: moodReader,
    schedule,
    action: () => action,
    phaseAt: (now) => (schedule === null ? null : schedule.phaseAt(now)),
    update(next) {
      if (next.dt > 0) brain.advance(next.dt);
      const now = next.now ?? 0;
      const phase = applySchedule(now);
      changed = false;
      reason = null;

      if (far) {
        if (phase !== null) {
          const option = phase.travelling ? "travel" : phase.activity;
          const target = phase.travelling ? phase.nextPlace : phase.post;
          if (option !== action.option || target !== action.target) {
            action = {
              option,
              target,
              fallback: null,
              usedFallback: false,
              since: now,
              score: 0,
            };
            changed = true;
            reason = "schedule";
          }
        }
      } else {
        think(next.targets ?? [], now);
      }

      frame = {
        action,
        mood: moodReader.read(),
        phase,
        post: phase?.post ?? null,
        changed,
        reason,
      };
      return frame;
    },
    setFar(next) {
      if (far === next) return;
      far = next;
      changed = true;
      reason = "schedule";
    },
    isFar: () => far,
    retune(patch) {
      brain.retune(patch);
    },
    snapshot: () => ({
      needs: needs.snapshot(),
      mood: moodReader.snapshot(),
      brain: brain.snapshot(),
      action: { ...action },
      far,
      scheduleMark,
    }),
    restore(next) {
      needs.restore(next.needs);
      moodReader.restore(next.mood);
      brain.restore(next.brain);
      action = { ...next.action };
      far = next.far;
      scheduleMark = next.scheduleMark;
      changed = false;
      reason = null;
    },
    dispose() {
      brain.dispose();
    },
  };
}
