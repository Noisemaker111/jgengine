// @skill jgengine-gameplay
import type { GameEventMap } from "../game/events";
import type { QuestRewards, TrackedQuestView } from "../mission/quest";

export type OnboardingStyle = "tutorial-level" | "teaching-area" | "blended";

export type OnboardingPoint = readonly [number, number, number];

export type OnboardingTarget =
  | { entity: string }
  /** The nearest entity of this catalog name (or thing a `locate` hook finds) within `within` metres. Default 60. */
  | { kind: string; within?: number }
  | { at: OnboardingPoint };

export type OnboardingDone<C> =
  | { event: keyof GameEventMap; match?: Readonly<Record<string, string | number | boolean>>; count?: number }
  /** A condition on the world becomes true. */
  | { when: (ctx: C, userId: string) => boolean }
  /** A measured amount reaches `count` (shown as "3/10" in the tracker). */
  | { progress: (ctx: C, userId: string) => number; count: number }
  /** The player presses Next on the callout. */
  | { next: true };

export interface OnboardingStep<C> {
  id: string;
  text: string;
  /** A second line under the text. */
  detail?: string;
  target?: OnboardingTarget;
  minimap?: boolean;
  pointer?: boolean;
  anchor?: string;
  placement?: "top" | "bottom" | "left" | "right";
  done: OnboardingDone<C>;
  inArea?: boolean;
  locks?: readonly string[];
  grants?: QuestRewards;
}

/** Where a `"teaching-area"` onboarding guides: centre XZ and radius in metres, and what to call it. */
export interface OnboardingArea {
  center: readonly [number, number];
  radius: number;
  label?: string;
}

/** @internal */
export function onboardingAreaFor<C>(config: OnboardingConfig<C>, ctx: C, userId: string): OnboardingArea | undefined {
  return typeof config.area === "function" ? config.area(ctx, userId) : config.area;
}

export interface OnboardingConfig<C> {
  id: string;
  title: string;
  style: OnboardingStyle;
  steps: readonly OnboardingStep<C>[];
  skippable?: boolean;
  /**
   * `"teaching-area"`: the area the guidance lives in, centre XZ and radius in metres; a function
   * gives each player their own (around the start region they chose).
   */
  area?: OnboardingArea | ((ctx: C, userId: string) => OnboardingArea);
  finish?: (ctx: C, userId: string) => void;
  locate?: Readonly<Record<string, (ctx: C, from: OnboardingPoint, within: number) => OnboardingPoint | null>>;
}

export interface OnboardingStepView<C> {
  step: OnboardingStep<C>;
  index: number;
  total: number;
  progress: number;
  count: number;
}

export interface OnboardingSnapshot {
  done: readonly string[];
  progress: Readonly<Record<string, number>>;
  skipped: boolean;
}

export interface Onboarding<C> {
  readonly config: OnboardingConfig<C>;
  current(): OnboardingStepView<C> | null;
  event(name: keyof GameEventMap, payload: unknown): OnboardingStep<C> | null;
  evaluate(ctx: C, userId: string): OnboardingStep<C>[];
  acknowledge(): OnboardingStep<C> | null;
  skip(): boolean;
  lockedBy(id: string): OnboardingStep<C> | null;
  isDone(stepId: string): boolean;
  isFinished(): boolean;
  isSkipped(): boolean;
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

/** @internal */
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
