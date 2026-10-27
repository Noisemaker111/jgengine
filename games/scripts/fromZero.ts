/**
 * The from-zero proof and the depth numbers it measures.
 *
 * Every game has `proofs/flows/from-zero.flow.ts`: a headless flow with no `state`, so it boots a new
 * game (the game's own `capture.play`, the Play button) with no prepared state and no save, and plays
 * the first 10 minutes through real input. This file plays it with the game's probe read every
 * quarter second of play, then holds the run to the game's design brief (`designBrief.ts`):
 *
 *   from-zero fails when the start state goes beyond what the brief declares for second 0, when
 *   nothing is taught or unlocked by minute 2, or when new verbs, items or areas stop appearing at
 *   the brief's pace;
 *
 *   depth fails on too few systems touched, a late first unlock, too few unlocks per 10 minutes,
 *   content below the brief's budget, a longest cycle shorter than a session, or too few minutes
 *   of content, measured or estimated.
 *
 * "Real input" means keys, the camera and the commands the game's own buttons dispatch. Teleports,
 * clock scaling and dev or debug commands are refused: they are how a demo skips its first minutes.
 */
import { FLOW_PRESS_MS, type Flow, type HeadlessProofFlow, type ProbeCheck } from "../../packages/core/src/play/flow";
import type { FlowRunReport } from "../../packages/core/src/play/flowSteps";
import { runFlowHeadless } from "../../packages/core/src/play/headlessFlow.draw";
import type { ProbeReadings } from "../../packages/core/src/game/playableGame";

import { TAUGHT_PROBE, UNLOCKS_PROBE, clock, seenProbe, totalProbe, type DesignBrief } from "./designBrief";

/** The name every game's from-zero proof has. */
export const FROM_ZERO_FLOW = "from-zero";

/**
 * The bars a game clears to count as deep. They fail every game built as a two-minute demo, which is
 * the point. Never loosen one to pass a game: fix the game, or list it in depth-known-failing.json
 * when the rule lands, never after.
 */
export const DEPTH_BARS = {
  /** A from-zero proof plays at least this much of the first session. */
  playedMs: 10 * 60_000,
  /** Something is taught or unlocked by now. */
  firstTeachMs: 2 * 60_000,
  /** The first unlock comes by now. */
  firstUnlockMs: 2 * 60_000,
  /** At least this many unlocks per 10 minutes of play. */
  unlocksPer10Minutes: 3,
  /** At least this many of the brief's systems move under the player's hands in the run. */
  systemsTouched: 4,
  /** The longest real-time cycle (a day, a season, a dive) is at least one session long. */
  longestCycleMinutes: 10,
  /** The brief's estimate of minutes until everything has been seen. */
  minutesOfContent: 180,
  /** The same estimate measured: all content divided by how fast the run met new things. */
  measuredMinutesOfContent: 120,
} as const;

/** One step of play the game advances; `createPlaySession`'s default. */
const TICK_MS = 1000 / 60;
/** Ticks a `press` takes: the press itself plus the release tick. */
const PRESS_TICKS = Math.ceil(FLOW_PRESS_MS / TICK_MS - 1e-9) + 1;
/** How often the run keeps a reading, in play milliseconds. */
const SAMPLE_MS = 250;
/** Commands a from-zero proof may not run: they skip play rather than play it. */
const DEV_COMMAND = /(?:^|[.:_/-])(?:dev|debug|cheat|test|seed)(?:[.:_/-]|$)/i;

/** One reading of the probe, at a moment of play. */
export interface Sample {
  /** Milliseconds of play since boot. */
  t: number;
  probe: ProbeReadings;
}

export interface FromZeroRun {
  report: FlowRunReport;
  samples: Sample[];
  /** Play milliseconds when the player first acted; `null` when the proof never acted. */
  actedAtMs: number | null;
  /** Play milliseconds the run covered. */
  playedMs: number;
}

/** Refuse a flow that is not a from-zero proof by shape, before playing it. */
export function fromZeroShapeProblems(flow: { browser: boolean; state: string | undefined }): string[] {
  const problems: string[] = [];
  if (flow.browser) problems.push("the from-zero proof sets browser: true; it must run headless so it can play 10 minutes in seconds");
  if (flow.state !== undefined) problems.push(`the from-zero proof boots capture state "${flow.state}"; it must start a new game with no prepared state`);
  return problems;
}

/** Wrap a flow's steps so every tick of play is counted and the probe is read along the way. */
function instrument(api: Flow<ProbeReadings>, run: { ticks: number; actedAtMs: number | null; samples: Sample[] }): Flow<ProbeReadings> {
  const now = (): number => run.ticks * TICK_MS;
  const record = (probe: ProbeReadings, force = false): void => {
    const last = run.samples.at(-1);
    if (force || last === undefined || now() - last.t >= SAMPLE_MS) run.samples.push({ t: now(), probe: { ...probe } });
  };
  const acted = (): void => {
    if (run.actedAtMs === null) run.actedAtMs = now();
  };
  /** A check the runner calls once per tick while it waits: the second call onwards is one tick later. */
  const counted = (check: ProbeCheck<ProbeReadings>, label: string): ProbeCheck<ProbeReadings> => {
    let first = true;
    const wrapped = (probe: ProbeReadings): boolean => {
      if (!first) run.ticks += 1;
      first = false;
      record(probe);
      return check(probe);
    };
    // The runner prints a check's source in its step label; print the flow's own words instead.
    wrapped.toString = () => label;
    return wrapped;
  };
  const forTicks = (ms: number): number => Math.max(1, Math.ceil(ms / TICK_MS - 1e-9));
  const elapsed = (ms: number): ProbeCheck<ProbeReadings> => {
    const start = run.ticks;
    const need = forTicks(ms);
    return () => run.ticks - start >= need;
  };
  const refuse = (what: string): never => {
    throw new Error(`a from-zero proof plays through real input; ${what} skips play`);
  };
  const guard = (name: string): void => {
    if (DEV_COMMAND.test(name)) refuse(`the command "${name}"`);
  };
  const settle = async (): Promise<void> => record(await api.probe(), true);

  return {
    async hold(keys, how) {
      acted();
      const minimum = how.ms ?? 0;
      const atLeast = elapsed(minimum);
      if (how.until === undefined) {
        await api.hold(keys, { until: counted(atLeast, `${minimum} ms`), timeoutMs: minimum + 1000 });
      } else {
        const until = how.until;
        await api.hold(keys, { until: counted((probe) => atLeast(probe) && until(probe), until.toString()), timeoutMs: (how.timeoutMs ?? 15_000) + minimum });
      }
      run.ticks += 1;
      await settle();
    },
    async press(keys) {
      acted();
      await api.press(keys);
      run.ticks += PRESS_TICKS;
      await settle();
    },
    async heading(yaw) {
      acted();
      await api.heading(yaw);
      run.ticks += 1;
      await settle();
    },
    teleport: async () => refuse("teleport"),
    async command(name, input) {
      guard(name);
      acted();
      await api.command(name, input);
      await settle();
    },
    async tryCommand(name, input) {
      guard(name);
      acted();
      const result = await api.tryCommand(name, input);
      await settle();
      return result;
    },
    timeScale: async () => refuse("timeScale"),
    async wait(ms) {
      await api.waitFor(counted(elapsed(ms), `${ms} ms`), { timeoutMs: ms + 1000, note: `${ms} ms` });
      await settle();
    },
    async waitFor(check, options) {
      const readings = await api.waitFor(counted(check, check.toString()), options);
      await settle();
      return readings;
    },
    expect: (check, note) => api.expect((probe) => {
      record(probe, true);
      return check(probe);
    }, note),
    probe: () => api.probe(),
    report: (label) => api.report(label),
    shot: (name) => api.shot(name),
  };
}

/** Play a game's from-zero proof headless and keep its readings. */
export async function playFromZero(flow: HeadlessProofFlow<ProbeReadings>): Promise<FromZeroRun> {
  const run: { ticks: number; actedAtMs: number | null; samples: Sample[] } = { ticks: 0, actedAtMs: null, samples: [] };
  const instrumented: HeadlessProofFlow<ProbeReadings> = {
    ...flow,
    run: async (api) => {
      run.samples.push({ t: 0, probe: { ...(await api.probe()) } });
      await flow.run(instrument(api, run));
    },
  };
  const report = await runFlowHeadless(instrumented);
  return { report, samples: run.samples, actedAtMs: run.actedAtMs, playedMs: run.ticks * TICK_MS };
}

/** A reading at a sample, or `undefined` when the probe does not report it. */
function reading(sample: Sample | undefined, key: string): number | undefined {
  const value = sample?.probe[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** The probe readings a brief needs that the game's probe does not report at boot. */
export function missingReadings(run: FromZeroRun, brief: DesignBrief): string[] {
  const boot = run.samples[0];
  const needed = [
    TAUGHT_PROBE,
    UNLOCKS_PROBE,
    ...brief.startState.keys(),
    ...[...brief.budget.keys()].flatMap((kind) => [seenProbe(kind), totalProbe(kind)]),
    ...brief.systems.values(),
  ];
  return [...new Set(needed)].filter((key) => reading(boot, key) === undefined);
}

/** The total of every kind's `<kind>Seen`: how much the player has met so far. */
function novelty(sample: Sample, brief: DesignBrief): number {
  let sum = 0;
  for (const kind of brief.budget.keys()) sum += reading(sample, seenProbe(kind)) ?? 0;
  return sum;
}

function runProblems(run: FromZeroRun): string[] {
  const problems: string[] = [];
  if (!run.report.ok) problems.push(`the proof failed at step ${run.report.failure.index} (${run.report.failure.label}): ${run.report.failure.message}`);
  if (run.playedMs < DEPTH_BARS.playedMs) problems.push(`the proof plays ${clock(run.playedMs / 1000)}; it plays the first ${clock(DEPTH_BARS.playedMs / 1000)} through real input`);
  if (run.actedAtMs === null) problems.push("the proof never acted: no key, camera turn or button command");
  return problems;
}

/** Where a from-zero proof falls short of its brief. */
export function fromZeroProblems(run: FromZeroRun, brief: DesignBrief): string[] {
  const problems = runProblems(run);
  const boot = run.samples[0];
  for (const [key, cap] of brief.startState) {
    const value = reading(boot, key);
    if (value !== undefined && value > cap) problems.push(`a new game starts with ${key} ${value}, beyond the brief's second 0 (at most ${cap})`);
  }
  const missing = missingReadings(run, brief);
  if (missing.length > 0) {
    problems.push(`the probe does not report ${missing.join(", ")}; the brief's start state, budget and systems are measured through them`);
    return problems;
  }

  const learned = (sample: Sample): number => (reading(sample, TAUGHT_PROBE) ?? 0) + (reading(sample, UNLOCKS_PROBE) ?? 0);
  const startLearned = boot === undefined ? 0 : learned(boot);
  if (!run.samples.some((sample) => sample.t <= DEPTH_BARS.firstTeachMs && learned(sample) > startLearned)) {
    problems.push(`nothing is taught or unlocked by ${clock(DEPTH_BARS.firstTeachMs / 1000)} (${TAUGHT_PROBE} and ${UNLOCKS_PROBE} stay at their start)`);
  }

  const gap = longestNoveltyGap(run, brief);
  if (gap !== null && gap.ms > brief.paceMinutes * 60_000) {
    problems.push(`nothing new from ${clock(gap.from / 1000)} to ${clock(gap.to / 1000)} (${clock(gap.ms / 1000)}); the brief's pace is something new every ${brief.paceMinutes} minutes`);
  }
  return problems;
}

/** The longest stretch of play after the first input where no `<kind>Seen` rose. */
export function longestNoveltyGap(run: FromZeroRun, brief: DesignBrief): { from: number; to: number; ms: number } | null {
  if (run.actedAtMs === null) return null;
  const acted = run.actedAtMs;
  const after = run.samples.filter((sample) => sample.t >= acted);
  const first = after[0];
  if (first === undefined) return null;
  let best = { from: acted, to: acted, ms: 0 };
  let since = acted;
  let seen = novelty(first, brief);
  for (const sample of after) {
    const value = novelty(sample, brief);
    if (value > seen) {
      if (sample.t - since > best.ms) best = { from: since, to: sample.t, ms: sample.t - since };
      since = sample.t;
      seen = value;
    }
  }
  if (run.playedMs - since > best.ms) best = { from: since, to: run.playedMs, ms: run.playedMs - since };
  return best;
}

/** The depth numbers one from-zero run measures. */
export interface DepthNumbers {
  systemsTouched: string[];
  firstUnlockMs: number | null;
  unlocksPer10Minutes: number;
  /** Kind -> [content the game has, the brief's budget]. */
  content: Map<string, [number, number]>;
  longestCycleMinutes: number;
  briefMinutesOfContent: number;
  /** All content over the run's rate of meeting new things; `null` when the run met nothing new. */
  measuredMinutesOfContent: number | null;
}

export function measureDepth(run: FromZeroRun, brief: DesignBrief): DepthNumbers {
  const boot = run.samples[0];
  const last = run.samples.at(-1);
  const acted = run.actedAtMs ?? Number.POSITIVE_INFINITY;
  const played = run.samples.filter((sample) => sample.t >= acted);
  const systemsTouched = [...brief.systems].filter(([, key]) => {
    const values = played.map((sample) => reading(sample, key)).filter((value) => value !== undefined);
    return values.length > 0 && Math.max(...values) > Math.min(...values);
  }).map(([name]) => name);

  const startUnlocks = reading(boot, UNLOCKS_PROBE) ?? 0;
  const firstUnlock = run.samples.find((sample) => (reading(sample, UNLOCKS_PROBE) ?? 0) > startUnlocks);
  const unlocks = (reading(last, UNLOCKS_PROBE) ?? 0) - startUnlocks;
  const unlocksPer10Minutes = run.playedMs > 0 ? unlocks / (run.playedMs / 600_000) : 0;

  const content = new Map<string, [number, number]>();
  let total = 0;
  for (const [kind, budget] of brief.budget) {
    const has = reading(boot, totalProbe(kind)) ?? 0;
    content.set(kind, [has, budget]);
    total += has;
  }
  const met = last === undefined || boot === undefined ? 0 : novelty(last, brief) - novelty(boot, brief);
  const minutes = run.playedMs / 60_000;
  const measuredMinutesOfContent = met > 0 && minutes > 0 ? total / (met / minutes) : null;

  return {
    systemsTouched,
    firstUnlockMs: firstUnlock?.t ?? null,
    unlocksPer10Minutes,
    content,
    longestCycleMinutes: brief.longestCycleMinutes,
    briefMinutesOfContent: brief.minutesOfContent,
    measuredMinutesOfContent,
  };
}

/** Where a game's measured depth falls short of the bars and of its own brief. */
export function depthProblems(run: FromZeroRun, brief: DesignBrief): string[] {
  const problems = runProblems(run);
  const missing = missingReadings(run, brief);
  if (missing.length > 0) {
    problems.push(`the probe does not report ${missing.join(", ")}, so depth cannot be measured`);
    return problems;
  }
  const depth = measureDepth(run, brief);
  if (depth.systemsTouched.length < DEPTH_BARS.systemsTouched) {
    problems.push(`the run touched ${depth.systemsTouched.length} of the brief's systems (${depth.systemsTouched.join(", ") || "none"}); a deep game puts at least ${DEPTH_BARS.systemsTouched} in the player's hands in 10 minutes`);
  }
  if (depth.firstUnlockMs === null) problems.push("nothing unlocked in the whole run");
  else if (depth.firstUnlockMs > DEPTH_BARS.firstUnlockMs) problems.push(`the first unlock came at ${clock(depth.firstUnlockMs / 1000)}; it comes by ${clock(DEPTH_BARS.firstUnlockMs / 1000)}`);
  if (depth.unlocksPer10Minutes < DEPTH_BARS.unlocksPer10Minutes) {
    problems.push(`${depth.unlocksPer10Minutes.toFixed(1)} unlocks per 10 minutes; at least ${DEPTH_BARS.unlocksPer10Minutes}`);
  }
  for (const [kind, [has, budget]] of depth.content) {
    if (has < budget) problems.push(`the game has ${has} ${kind}; the brief budgets ${budget}`);
  }
  if (depth.longestCycleMinutes < DEPTH_BARS.longestCycleMinutes) {
    problems.push(`the longest real-time cycle is ${depth.longestCycleMinutes} minutes; a cycle shorter than a ${DEPTH_BARS.longestCycleMinutes}-minute session cannot carry hours`);
  }
  if (depth.briefMinutesOfContent < DEPTH_BARS.minutesOfContent) {
    problems.push(`the brief estimates ${depth.briefMinutesOfContent} minutes of content; at least ${DEPTH_BARS.minutesOfContent}`);
  }
  if (depth.measuredMinutesOfContent === null) problems.push("the run met nothing new, so the content would last no time at its pace");
  else if (depth.measuredMinutesOfContent < DEPTH_BARS.measuredMinutesOfContent) {
    problems.push(`at the pace the run met new things, all the content is seen in ${Math.round(depth.measuredMinutesOfContent)} minutes; at least ${DEPTH_BARS.measuredMinutesOfContent}`);
  }
  return problems;
}
