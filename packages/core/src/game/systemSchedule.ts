import type { SystemDefinition, SystemTick } from "./defineSystem";

/** Default fixed-sim stage order — systems pick a stage; most need only this. */
export const DEFAULT_FIXED_STAGES = [
  "input",
  "movement",
  "combat",
  "ai",
  "activities",
  "cleanup",
] as const;

/**
 * Default frame stage order. Gameplay stages mirror the fixed table so once-per-frame systems
 * (`type: "frame"`) can pick `combat`/`ai`/… without falling into the unknown-stage bucket;
 * presentation stages follow.
 */
export const DEFAULT_FRAME_STAGES = [
  "input",
  "movement",
  "combat",
  "ai",
  "activities",
  "cleanup",
  "animation",
  "camera",
  "effects",
] as const;

const DEFAULT_FIXED_RATE = 60;

/** @internal */
export type TimingChannel = "fixed" | "frame" | "interval" | "manual" | "event";

/** @internal */
export interface ScheduledSystem {
  readonly id: string;
  readonly channel: TimingChannel;
  readonly stage: string;
  readonly rate?: number;
  readonly every?: number;
  readonly after: readonly string[];
  readonly before: readonly string[];
  readonly dependsOn: readonly string[];
}

/** @internal */
export interface StageBucket {
  readonly stage: string;
  /** System ids in deterministic order within this stage. */
  readonly systems: readonly string[];
}

/** @internal */
export interface FixedRateGroup {
  readonly rate: number;
  readonly stages: readonly StageBucket[];
  /** Flat ordered ids for this rate (all stages). */
  readonly order: readonly string[];
}

/**
 * Deterministic compiled schedule: stage buckets, multi-subscribe channels, dependency validation.
 * Order never depends on import order — only stage tables + explicit before/after constraints.
 */
export interface CompiledSystemSchedule {
  readonly systemsById: ReadonlyMap<string, SystemDefinition>;
  readonly scheduled: readonly ScheduledSystem[];
  /** Fixed-sim groups keyed by rate (Hz); multiple systems may share a rate. */
  readonly fixed: readonly FixedRateGroup[];
  readonly frame: readonly StageBucket[];
  readonly frameOrder: readonly string[];
  /** Interval systems — each keeps its own period; multi-subscribe is per-system. */
  readonly intervals: readonly ScheduledSystem[];
  readonly manual: readonly string[];
  readonly eventOnly: readonly string[];
  /** All auto-ticking systems in a diagnostic flat order (fixed rates → frame → intervals). */
  readonly tickOrder: readonly string[];
}

/** @internal */
export interface CompileSystemScheduleOptions {
  fixedStages?: readonly string[];
  frameStages?: readonly string[];
  defaultFixedRate?: number;
}

function asList(value: string | readonly string[] | undefined): readonly string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : value;
}

function channelOf(tick: SystemTick | undefined): TimingChannel {
  if (tick === undefined) return "event";
  return tick.type;
}

function stageOf(tick: SystemTick | undefined, channel: TimingChannel): string {
  if (tick === undefined || tick.type === "manual") return "";
  if (tick.type === "fixed" || tick.type === "frame" || tick.type === "interval") {
    return tick.stage ?? defaultStage(channel);
  }
  return "";
}

function defaultStage(channel: TimingChannel): string {
  if (channel === "fixed") return "combat";
  if (channel === "frame") return "effects";
  if (channel === "interval") return "activities";
  return "";
}

function rateOf(tick: SystemTick | undefined, defaultFixedRate: number): number | undefined {
  if (tick?.type === "fixed") return tick.rate ?? defaultFixedRate;
  return undefined;
}

function everyOf(tick: SystemTick | undefined): number | undefined {
  if (tick?.type === "interval") return tick.every;
  return undefined;
}

function afterOf(tick: SystemTick | undefined): readonly string[] {
  if (tick === undefined || tick.type === "manual") return [];
  if (tick.type === "fixed" || tick.type === "frame" || tick.type === "interval") {
    return asList(tick.after);
  }
  return [];
}

function beforeOf(tick: SystemTick | undefined): readonly string[] {
  if (tick === undefined || tick.type === "manual") return [];
  if (tick.type === "fixed" || tick.type === "frame" || tick.type === "interval") {
    return asList(tick.before);
  }
  return [];
}

/**
 * Topological sort with a stable tie-break on original declaration index, then id.
 * Edges: `after: "x"` means this runs after x (x → this); `before: "y"` means this → y.
 * @internal
 */
export function orderWithConstraints(
  ids: readonly string[],
  after: ReadonlyMap<string, readonly string[]>,
  before: ReadonlyMap<string, readonly string[]>,
  indexOf: ReadonlyMap<string, number>,
): string[] {
  const idSet = new Set(ids);
  const preds = new Map<string, Set<string>>();
  const succs = new Map<string, Set<string>>();
  for (const id of ids) {
    preds.set(id, new Set());
    succs.set(id, new Set());
  }

  const addEdge = (from: string, to: string): void => {
    if (!idSet.has(from) || !idSet.has(to) || from === to) return;
    succs.get(from)!.add(to);
    preds.get(to)!.add(from);
  };

  for (const id of ids) {
    for (const a of after.get(id) ?? []) addEdge(a, id);
    for (const b of before.get(id) ?? []) addEdge(id, b);
  }

  const ready = ids
    .filter((id) => preds.get(id)!.size === 0)
    .sort((a, b) => {
      const ia = indexOf.get(a) ?? 0;
      const ib = indexOf.get(b) ?? 0;
      if (ia !== ib) return ia - ib;
      return a < b ? -1 : a > b ? 1 : 0;
    });

  const ordered: string[] = [];
  while (ready.length > 0) {
    const next = ready.shift()!;
    ordered.push(next);
    for (const succ of succs.get(next) ?? []) {
      const set = preds.get(succ)!;
      set.delete(next);
      if (set.size === 0) {
        ready.push(succ);
        ready.sort((a, b) => {
          const ia = indexOf.get(a) ?? 0;
          const ib = indexOf.get(b) ?? 0;
          if (ia !== ib) return ia - ib;
          return a < b ? -1 : a > b ? 1 : 0;
        });
      }
    }
  }

  if (ordered.length !== ids.length) {
    const leftover = ids.filter((id) => !ordered.includes(id));
    throw new Error(
      `system schedule: cyclic before/after constraints among: ${leftover.join(", ")}`,
    );
  }
  return ordered;
}

function bucketByStage(
  items: readonly ScheduledSystem[],
  stageOrder: readonly string[],
  indexOf: ReadonlyMap<string, number>,
): StageBucket[] {
  const stageIndex = new Map<string, number>();
  stageOrder.forEach((s, i) => stageIndex.set(s, i));

  const unknownStages = new Set<string>();
  for (const item of items) {
    if (item.stage !== "" && !stageIndex.has(item.stage)) unknownStages.add(item.stage);
  }
  const stages = [...stageOrder, ...[...unknownStages].sort()];

  const buckets: StageBucket[] = [];
  for (const stage of stages) {
    const inStage = items.filter((s) => s.stage === stage);
    if (inStage.length === 0) continue;
    const after = new Map<string, readonly string[]>();
    const before = new Map<string, readonly string[]>();
    for (const s of inStage) {
      after.set(s.id, s.after);
      before.set(s.id, s.before);
    }
    const order = orderWithConstraints(
      inStage.map((s) => s.id),
      after,
      before,
      indexOf,
    );
    buckets.push({ stage, systems: order });
  }
  return buckets;
}

/**
 * Compile system definitions into a deterministic schedule.
 * Validates unique ids, `dependsOn`, and before/after cycles.
 *
 * @capability system-schedule compile fixed/frame/interval system ticks into deterministic ordered stages
 */
export function compileSystemSchedule(
  systems: readonly SystemDefinition[],
  options?: CompileSystemScheduleOptions,
): CompiledSystemSchedule {
  const fixedStages = options?.fixedStages ?? DEFAULT_FIXED_STAGES;
  const frameStages = options?.frameStages ?? DEFAULT_FRAME_STAGES;
  const defaultFixedRate = options?.defaultFixedRate ?? DEFAULT_FIXED_RATE;

  const systemsById = new Map<string, SystemDefinition>();
  const indexOf = new Map<string, number>();
  systems.forEach((system, index) => {
    if (systemsById.has(system.id)) {
      throw new Error(`system schedule: duplicate system id "${system.id}"`);
    }
    systemsById.set(system.id, system);
    indexOf.set(system.id, index);
  });

  for (const system of systems) {
    for (const dep of system.dependsOn ?? []) {
      if (!systemsById.has(dep)) {
        throw new Error(
          `system schedule: "${system.id}" dependsOn unknown system "${dep}"`,
        );
      }
    }
  }

  const scheduled: ScheduledSystem[] = systems.map((system) => {
    const channel = channelOf(system.tick);
    return {
      id: system.id,
      channel,
      stage: stageOf(system.tick, channel),
      rate: rateOf(system.tick, defaultFixedRate),
      every: everyOf(system.tick),
      after: afterOf(system.tick),
      before: beforeOf(system.tick),
      dependsOn: system.dependsOn ?? [],
    };
  });

  const fixedItems = scheduled.filter((s) => s.channel === "fixed");
  const rates = [...new Set(fixedItems.map((s) => s.rate ?? defaultFixedRate))].sort(
    (a, b) => b - a,
  );
  const fixed: FixedRateGroup[] = rates.map((rate) => {
    const group = fixedItems.filter((s) => (s.rate ?? defaultFixedRate) === rate);
    const stages = bucketByStage(group, fixedStages, indexOf);
    return {
      rate,
      stages,
      order: stages.flatMap((b) => b.systems),
    };
  });

  const frameItems = scheduled.filter((s) => s.channel === "frame");
  const frame = bucketByStage(frameItems, frameStages, indexOf);
  const frameOrder = frame.flatMap((b) => b.systems);

  const intervals = scheduled.filter((s) => s.channel === "interval");
  // Stable order for intervals: stage buckets then constraints across all interval systems
  const intervalBuckets = bucketByStage(intervals, fixedStages, indexOf);
  const intervalOrder = intervalBuckets.flatMap((b) => b.systems);
  const intervalsOrdered = intervalOrder.map(
    (id) => intervals.find((s) => s.id === id)!,
  );

  const manual = scheduled.filter((s) => s.channel === "manual").map((s) => s.id);
  const eventOnly = scheduled
    .filter((s) => s.channel === "event")
    .map((s) => s.id);

  const tickOrder = [
    ...fixed.flatMap((g) => g.order),
    ...frameOrder,
    ...intervalOrder,
  ];

  return {
    systemsById,
    scheduled,
    fixed,
    frame,
    frameOrder,
    intervals: intervalsOrdered,
    manual,
    eventOnly,
    tickOrder,
  };
}
