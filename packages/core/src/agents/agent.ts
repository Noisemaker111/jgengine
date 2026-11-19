// @skill jgengine-gameplay
import {
  createUtilityBrain,
  type UtilityBrainSnapshot,
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

export interface AgentFallback {
  readonly option: string;
  readonly target: string;
}

export interface AgentTarget {
  readonly option: string;
  readonly target: string;
  /** Effort the caller wants priced in: travel, queue seconds, price. */
  readonly cost?: number;
  /** What to do when this target stops existing, instead of re-deciding from scratch. */
  readonly fallback?: AgentFallback;
}

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

export interface AgentUpdate {
  readonly dt: number;
  /** Absolute game-second from the world clock; the schedule reads it. */
  readonly now?: number;
  readonly targets?: readonly AgentTarget[];
}

export interface AgentFrame {
  readonly action: AgentAction;
  readonly mood: Mood;
  readonly phase: AgentSchedulePhase | null;
  readonly post: string | null;
  readonly changed: boolean;
  readonly reason: AgentActionReason | null;
}

export interface AgentConfig {
  readonly id: string;
  /** Decaying needs, in the survival meter shape (`sim/needs`). Order breaks ties. */
  readonly needs: readonly NeedDefinition[];
  readonly options: readonly UtilityOption[];
  readonly interrupts?: readonly UtilityInterrupt[];
  readonly schedule?: AgentScheduleConfig;
  readonly mood: { readonly weights?: readonly MoodWeight[]; readonly tiers: readonly MoodTier[] };
  readonly switchMargin?: number;
  readonly minHoldSeconds?: number;
  readonly costWeight?: number;
  readonly jitter?: number;
  readonly rng?: () => number;
  readonly devtoolsName?: string;
}

export interface AgentSnapshot {
  needs: NeedSnapshot;
  mood: MoodSnapshot;
  brain: UtilityBrainSnapshot;
  action: AgentAction;
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
  readonly needs: NeedSet;
  mood(): Mood;
  readonly moodSources: MoodReader;
  readonly schedule: AgentSchedule | null;
  action(): AgentAction;
  phaseAt(now: number): AgentSchedulePhase | null;
  update(next: AgentUpdate): AgentFrame;
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

/** @capability agents a needs, thought, action and mood loop an agent runs on the world clock */
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
    ...(config.mood.weights === undefined ? {} : { weights: config.mood.weights }),
    tiers: config.mood.tiers,
  });
  const schedule = config.schedule === undefined ? null : createAgentSchedule(config.schedule);

  let action: AgentAction = { ...IDLE_ACTION };
  let far = false;
  let scheduleMark: string | null = null;
  // The schedule phase `scheduleMark` names (`stop@since`), kept apart so a tick compares two values
  // instead of building the mark string.
  let markStop = Number.NaN;
  let markSince = Number.NaN;
  let reason: AgentActionReason | null = null;
  let changed = false;
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
    if (phase.stop !== markStop || phase.since !== markSince || scheduleMark === null) {
      markStop = phase.stop;
      markSince = phase.since;
      const mark = `${phase.stop}@${phase.since}`;
      const repeated = mark === scheduleMark;
      scheduleMark = mark;
      if (repeated) return phase;
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

  function adopt(target: AgentTarget, nextReason: AgentActionReason, usedFallback: boolean, now: number): void {
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
  }

  function think(targets: readonly AgentTarget[], now: number): void {
    // A target is a utility candidate already (its option and cost); the brain keeps none of them.
    const decision = brain.decide(targets);
    const pickedOption = decision.option;
    const pickedTarget = firstOfOption(targets, pickedOption);
    const held = findTarget(targets, action.option, action.target);

    if (action.option !== null && held === null) {
      const fallback = action.fallback;
      const fallbackTarget = fallback === null ? null : findTarget(targets, fallback.option, fallback.target);
      if (fallbackTarget !== null) {
        adopt(fallbackTarget, "fallback", true, now);
        return;
      }
      if (pickedTarget === null) {
        action = { ...IDLE_ACTION, since: now };
        changed = true;
        reason = "cleared";
        return;
      }
      adopt(pickedTarget, decision.reason ?? "unavailable", false, now);
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
      adopt(pickedTarget, decision.reason ?? "score", false, now);
      return;
    }

    if (action.option === null) {
      adopt(pickedTarget, decision.reason ?? "initial", false, now);
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
      markStop = Number.NaN;
      markSince = Number.NaN;
      changed = false;
      reason = null;
    },
    dispose() {
      brain.dispose();
    },
  };
}
