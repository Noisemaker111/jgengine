// @skill jgengine-gameplay
import type { GameEventMap } from "../game/events";
import type { QuestRewards, TrackedQuestView } from "../mission/quest";

/**
 * How a game teaches: a separate `"tutorial-level"` it leaves when done (its `finish` hook moves
 * the player on), a `"teaching-area"` start that guides only inside its `area` and points back
 * when the player wanders off, or `"blended"` hints that sit quietly in stage one (no banners, no
 * locks).
 */
export type OnboardingStyle = "tutorial-level" | "teaching-area" | "blended";

/** World position `[x, y, z]`. */
export type OnboardingPoint = readonly [number, number, number];

/** What a step points at: one entity, the nearest thing of a kind, or a spot. */
export type OnboardingTarget =
  | { entity: string }
  /** The nearest entity of this catalog name (or thing a `locate` hook finds) within `within` metres. Default 60. */
  | { kind: string; within?: number }
  | { at: OnboardingPoint };

/** When a step is done. */
export type OnboardingDone<C> =
  /** A game event fired `count` times (default 1) while this step is current, its payload matching `match`. */
  | { event: keyof GameEventMap; match?: Readonly<Record<string, string | number | boolean>>; count?: number }
  /** A condition on the world becomes true. */
  | { when: (ctx: C, userId: string) => boolean }
  /** A measured amount reaches `count` (shown as "3/10" in the tracker). */
  | { progress: (ctx: C, userId: string) => number; count: number }
  /** The player presses Next on the callout. */
  | { next: true };

/** One onboarding step, declared as data. */
export interface OnboardingStep<C> {
  /** Stable id; the saved progress is keyed by it. */
  id: string;
  /** What to do, as the tracker and callout say it. */
  text: string;
  /** A second line under the text. */
  detail?: string;
  /** The thing in the world the step points at with an on-screen arrow. */
  target?: OnboardingTarget;
  /** Show the target on the minimap. Default `true` when there is a target. */
  minimap?: boolean;
  /** Show the on-screen arrow and waypoint to the target. Default `true` when there is a target. */
  pointer?: boolean;
  /** CSS selector of a UI element the callout points at (`OnboardingCallout`); omit for a centred callout. */
  anchor?: string;
  /** Side of `anchor` the callout sits on. Default `"bottom"`. */
  placement?: "top" | "bottom" | "left" | "right";
  done: OnboardingDone<C>;
  /** `"teaching-area"`: `false` lets this step send the player past the area, so its pointer is not pulled back. Default `true`. */
  inArea?: boolean;
  /** Command ids (and UI ids a HUD asks about) refused until this step is done. */
  locks?: readonly string[];
  /** Given when this step is done: items, xp, currency, unlocks. */
  grants?: QuestRewards;
}

/** Where a `"teaching-area"` onboarding guides: centre XZ and radius in metres, and what to call it. */
export interface OnboardingArea {
  center: readonly [number, number];
  radius: number;
  label?: string;
}

/** The teaching area for one player: the config's own, or what its function gives for them. */
export function onboardingAreaFor<C>(config: OnboardingConfig<C>, ctx: C, userId: string): OnboardingArea | undefined {
  return typeof config.area === "function" ? config.area(ctx, userId) : config.area;
}

/** A game's whole onboarding, declared as data. */
export interface OnboardingConfig<C> {
  id: string;
  /** Title over the steps in the quest tracker. */
  title: string;
  style: OnboardingStyle;
  steps: readonly OnboardingStep<C>[];
  /** Whether the player may skip it. Default `true`. */
  skippable?: boolean;
  /**
   * `"teaching-area"`: the area the guidance lives in, centre XZ and radius in metres; a function
   * gives each player their own (around the start region they chose).
   */
  area?: OnboardingArea | ((ctx: C, userId: string) => OnboardingArea);
  /** `"tutorial-level"`: move the player into the real game once every step is done or skipped. */
  finish?: (ctx: C, userId: string) => void;
  /** Finders for `{ kind }` targets that are not entities (scatter rocks, resource nodes), by kind. */
  locate?: Readonly<Record<string, (ctx: C, from: OnboardingPoint, within: number) => OnboardingPoint | null>>;
}

/** The current step as the HUD reads it. */
export interface OnboardingStepView<C> {
  step: OnboardingStep<C>;
  index: number;
  total: number;
  /** Progress toward `count` (events seen or the measured amount). */
  progress: number;
  count: number;
}

/** One player's saved onboarding: finished step ids, partial progress, and whether it was skipped. */
export interface OnboardingSnapshot {
  done: readonly string[];
  progress: Readonly<Record<string, number>>;
  skipped: boolean;
}

/** One player's run through an {@link OnboardingConfig}. */
export interface Onboarding<C> {
  readonly config: OnboardingConfig<C>;
  /** The first unfinished step, or `null` once finished or skipped. */
  current(): OnboardingStepView<C> | null;
  /** Feed a game event; returns the step it completed, if any. */
  event(name: keyof GameEventMap, payload: unknown): OnboardingStep<C> | null;
  /** Check the current step's condition (and the ones after it, while they hold); returns the steps completed. */
  evaluate(ctx: C, userId: string): OnboardingStep<C>[];
  /** The player pressed Next: completes a `{ next: true }` step. */
  acknowledge(): OnboardingStep<C> | null;
  /** Skip the rest. Returns false when the config is not skippable or nothing is left. */
  skip(): boolean;
  /** The unfinished step that locks `id`, or `null` when `id` is free. */
  lockedBy(id: string): OnboardingStep<C> | null;
  isDone(stepId: string): boolean;
  isFinished(): boolean;
  isSkipped(): boolean;
  /** The steps as a quest for `QuestTracker`. */
  tracked(): TrackedQuestView;
  subscribe(listener: () => void): () => void;
  snapshot(): OnboardingSnapshot;
  restore(snapshot: OnboardingSnapshot): void;
  reset(): void;
}

/**
 * Throw when a config cannot run: no steps, repeated ids, or a style missing what it needs.
 *
 * @internal
 */
export function validateOnboarding<C>(config: OnboardingConfig<C>): void {
  if (config.steps.length === 0) throw new Error(`onboarding "${config.id}": no steps`);
  const ids = new Set<string>();
  for (const step of config.steps) {
    if (ids.has(step.id)) throw new Error(`onboarding "${config.id}": step id "${step.id}" repeats`);
    ids.add(step.id);
    if ("count" in step.done && step.done.count !== undefined && !(step.done.count >= 1)) throw new Error(`onboarding "${config.id}": step "${step.id}" count must be >= 1`);
    if (config.style === "blended" && (step.locks?.length ?? 0) > 0) throw new Error(`onboarding "${config.id}": blended hints cannot lock ("${step.id}")`);
  }
  if (config.style === "teaching-area" && config.area === undefined) throw new Error(`onboarding "${config.id}": a teaching-area needs an area`);
  if (config.style === "tutorial-level" && config.finish === undefined) throw new Error(`onboarding "${config.id}": a tutorial-level needs a finish hook`);
}

function countOf<C>(done: OnboardingDone<C>): number {
  return "count" in done && done.count !== undefined ? done.count : 1;
}

function matches(payload: unknown, match: Readonly<Record<string, string | number | boolean>> | undefined): boolean {
  if (match === undefined) return true;
  if (typeof payload !== "object" || payload === null) return false;
  for (const [key, value] of Object.entries(match)) {
    if (Reflect.get(payload, key) !== value) return false;
  }
  return true;
}

/**
 * One player's onboarding: ordered steps, each done by a game event, a condition, a measured
 * amount or a Next press, with locks that hold until their step is done, grants handed back as
 * steps finish, skip, and save. Pure model; `createOnboardingSystem` wires it to a game.
 *
 * @internal
 */
export function createOnboarding<C>(config: OnboardingConfig<C>): Onboarding<C> {
  validateOnboarding(config);
  const steps = config.steps;
  const done = new Set<string>();
  let progress = new Map<string, number>();
  let skipped = false;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const currentIndex = (): number => (skipped ? -1 : steps.findIndex((step) => !done.has(step.id)));
  const currentStep = (): OnboardingStep<C> | null => steps[currentIndex()] ?? null;
  const complete = (step: OnboardingStep<C>): OnboardingStep<C> => {
    done.add(step.id);
    progress.delete(step.id);
    return step;
  };

  const model: Onboarding<C> = {
    config,
    current() {
      const index = currentIndex();
      const step = steps[index];
      if (step === undefined) return null;
      return { step, index, total: steps.length, progress: progress.get(step.id) ?? 0, count: countOf(step.done) };
    },
    event(name, payload) {
      const step = currentStep();
      if (step === null || !("event" in step.done) || step.done.event !== name || !matches(payload, step.done.match)) return null;
      const seen = (progress.get(step.id) ?? 0) + 1;
      progress.set(step.id, seen);
      const finished = seen >= countOf(step.done) ? complete(step) : null;
      notify();
      return finished;
    },
    evaluate(ctx, userId) {
      const finished: OnboardingStep<C>[] = [];
      let changed = false;
      for (let step = currentStep(); step !== null; step = currentStep()) {
        const rule = step.done;
        if ("when" in rule) {
          if (!rule.when(ctx, userId)) break;
        } else if ("progress" in rule) {
          const amount = Math.max(0, Math.min(rule.count, rule.progress(ctx, userId)));
          if (amount !== (progress.get(step.id) ?? 0)) {
            progress.set(step.id, amount);
            changed = true;
          }
          if (amount < rule.count) break;
        } else break;
        finished.push(complete(step));
      }
      if (changed || finished.length > 0) notify();
      return finished;
    },
    acknowledge() {
      const step = currentStep();
      if (step === null || !("next" in step.done)) return null;
      complete(step);
      notify();
      return step;
    },
    skip() {
      if (config.skippable === false || skipped || currentStep() === null) return false;
      skipped = true;
      notify();
      return true;
    },
    lockedBy(id) {
      if (skipped) return null;
      return steps.find((step) => !done.has(step.id) && step.locks?.includes(id) === true) ?? null;
    },
    isDone: (stepId) => done.has(stepId),
    isFinished: () => skipped || steps.every((step) => done.has(step.id)),
    isSkipped: () => skipped,
    tracked() {
      const finished = model.isFinished();
      return {
        id: config.id,
        title: config.title,
        status: finished ? "completed" : "active",
        objectives: steps.map((step) => {
          const count = countOf(step.done);
          const complete = done.has(step.id);
          return { id: step.id, label: step.text, count, progress: complete ? count : progress.get(step.id) ?? 0, complete };
        }),
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    snapshot: () => ({ done: steps.filter((step) => done.has(step.id)).map((step) => step.id), progress: Object.fromEntries(progress), skipped }),
    restore(snapshot) {
      done.clear();
      for (const id of snapshot.done) if (steps.some((step) => step.id === id)) done.add(id);
      progress = new Map(Object.entries(snapshot.progress));
      skipped = snapshot.skipped;
      notify();
    },
    reset() {
      done.clear();
      progress = new Map();
      skipped = false;
      notify();
    },
  };
  return model;
}
