import type {
  Devtools,
  FrameRecordSample,
  FrameStats,
  LongFrameEvent,
  PhaseStats,
  RenderSample,
} from "./types";

const FRAME_CAPACITY = 240;
const RECENT_FRAMES = 60;
/** Frame duration in milliseconds above which a frame is recorded as a long-frame spike (~30fps budget). */
export const LONG_FRAME_MS = 33.4;
const LONG_FRAME_CAPACITY = 40;
const MAX_PHASES_PER_FRAME = 24;
const MAX_LONG_FRAME_PHASES = 8;
const PHASE_HOT_MS = 2;

/** @internal */
export function nowMs(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf !== undefined ? perf.now() : Date.now();
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index]!;
}

function clampMs(value: number): number {
  return value > 0 && Number.isFinite(value) ? value : 0;
}

function rankPhases(phases: Readonly<Record<string, number>>): { name: string; ms: number; pct: number }[] {
  const entries = Object.entries(phases)
    .filter(([, ms]) => Number.isFinite(ms) && ms > 0)
    .map(([name, ms]) => ({ name, ms }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, MAX_LONG_FRAME_PHASES);
  const total = entries.reduce((sum, entry) => sum + entry.ms, 0);
  return entries.map((entry) => ({
    name: entry.name,
    ms: entry.ms,
    pct: total > 0 ? (entry.ms / total) * 100 : 0,
  }));
}

function explainLongFrame(
  frameMs: number,
  simMs: number,
  outsideMs: number,
  ranked: readonly { name: string; ms: number; pct: number }[],
): { topPhase: string | null; culprit: string; reason: string } {
  const top = ranked[0] ?? null;
  const topPhaseMs = top?.ms ?? 0;
  const phaseBits = ranked
    .filter((entry) => entry.ms >= PHASE_HOT_MS)
    .slice(0, 3)
    .map((entry) => `${entry.name} ${entry.ms.toFixed(1)}ms`);

  const outsideDominates =
    outsideMs > topPhaseMs && outsideMs >= simMs * 0.55 && outsideMs >= frameMs * 0.4;

  if (outsideDominates) {
    const detail = phaseBits.length > 0 ? ` · sim was ${phaseBits.join(", ")}` : simMs > 1 ? ` · sim ${simMs.toFixed(1)}ms` : "";
    return {
      topPhase: top?.name ?? null,
      culprit: "outside-sim",
      reason: `display/render/browser hitch ${outsideMs.toFixed(1)}ms outside sim${detail}`,
    };
  }

  if (top !== null && top.ms >= PHASE_HOT_MS) {
    const rest = phaseBits.slice(1);
    const restText = rest.length > 0 ? ` · also ${rest.join(", ")}` : "";
    const outsideText = outsideMs >= PHASE_HOT_MS ? ` · +${outsideMs.toFixed(1)}ms outside sim` : "";
    return {
      topPhase: top.name,
      culprit: top.name,
      reason: `${top.name} ${top.ms.toFixed(1)}ms (${top.pct.toFixed(0)}% of timed sim)${restText}${outsideText}`,
    };
  }

  if (simMs >= frameMs * 0.5) {
    return {
      topPhase: null,
      culprit: "sim",
      reason: `sim ${simMs.toFixed(1)}ms with no named phase ≥${PHASE_HOT_MS}ms — wrap hot work in measure("name", fn)`,
    };
  }

  return {
    topPhase: null,
    culprit: "outside-sim",
    reason: `frame ${frameMs.toFixed(1)}ms · sim ${simMs.toFixed(1)}ms · outside ${outsideMs.toFixed(1)}ms (render/React/GC/tab throttle)`,
  };
}

interface PhaseAccumulator {
  sumMs: number;
  maxMs: number;
  lastMs: number;
  samples: number;
}

/** Frame subsystem exposing the frame-timing, profiling, and render-sample facades. */
export interface FrameModule {
  frame: Devtools["frame"];
  profile: Devtools["profile"];
  render: Devtools["render"];
}

/** Create the frame subsystem that records frame/sim/phase timings, computes stats, and captures long-frame events. */
export const createFrameModule = (deps: {
  readProbes: () => Record<string, unknown>;
}): FrameModule => {
  const { readProbes } = deps;

  const frameMsBuffer = new Float64Array(FRAME_CAPACITY);
  const simMsBuffer = new Float64Array(FRAME_CAPACITY);
  const outsideMsBuffer = new Float64Array(FRAME_CAPACITY);
  let frameIndex = 0;
  let frameCount = 0;

  let renderSample: RenderSample | null = null;

  const longFrameEvents: LongFrameEvent[] = [];
  const phaseAccumulators = new Map<string, PhaseAccumulator>();
  let currentPhases: Record<string, number> = {};
  let currentPhaseCount = 0;

  const addPhaseMs = (name: string, ms: number): void => {
    const elapsed = clampMs(ms);
    if (elapsed === 0 || name.length === 0) return;
    if (currentPhases[name] === undefined) {
      if (currentPhaseCount >= MAX_PHASES_PER_FRAME) return;
      currentPhaseCount += 1;
      currentPhases[name] = elapsed;
      return;
    }
    currentPhases[name] = currentPhases[name]! + elapsed;
  };

  const resetCurrentPhases = (): void => {
    currentPhases = {};
    currentPhaseCount = 0;
  };

  const recordPhaseStats = (phases: Readonly<Record<string, number>>): void => {
    for (const [name, ms] of Object.entries(phases)) {
      const elapsed = clampMs(ms);
      if (elapsed === 0) continue;
      const existing = phaseAccumulators.get(name);
      if (existing === undefined) {
        phaseAccumulators.set(name, { sumMs: elapsed, maxMs: elapsed, lastMs: elapsed, samples: 1 });
      } else {
        existing.sumMs += elapsed;
        existing.maxMs = Math.max(existing.maxMs, elapsed);
        existing.lastMs = elapsed;
        existing.samples += 1;
      }
    }
  };

  const phaseStatsList = (avgSimMs: number): PhaseStats[] => {
    const list: PhaseStats[] = [];
    for (const [name, acc] of phaseAccumulators) {
      const avgMs = acc.sumMs / acc.samples;
      list.push({
        name,
        avgMs,
        maxMs: acc.maxMs,
        lastMs: acc.lastMs,
        samples: acc.samples,
        pctOfSim: avgSimMs > 0 ? (avgMs / avgSimMs) * 100 : 0,
      });
    }
    list.sort((a, b) => b.avgMs - a.avgMs);
    return list;
  };

  const frameStats = (): FrameStats | null => {
    if (frameCount === 0) return null;
    const size = Math.min(frameCount, FRAME_CAPACITY);
    const frames: number[] = [];
    const sims: number[] = [];
    const outsides: number[] = [];
    for (let offset = 0; offset < size; offset += 1) {
      const at = (frameIndex - size + offset + FRAME_CAPACITY) % FRAME_CAPACITY;
      frames.push(frameMsBuffer[at]!);
      sims.push(simMsBuffer[at]!);
      outsides.push(outsideMsBuffer[at]!);
    }
    const recent = frames.slice(-RECENT_FRAMES);
    const recentAvg = recent.reduce((sum, ms) => sum + ms, 0) / recent.length;
    const sorted = [...frames].sort((a, b) => a - b);
    const avgSimMs = sims.reduce((sum, ms) => sum + ms, 0) / sims.length;
    return {
      fps: recentAvg > 0 ? 1000 / recentAvg : 0,
      avgFrameMs: frames.reduce((sum, ms) => sum + ms, 0) / frames.length,
      p95FrameMs: percentile(sorted, 0.95),
      maxFrameMs: sorted[sorted.length - 1]!,
      avgSimMs,
      maxSimMs: sims.reduce((max, ms) => Math.max(max, ms), 0),
      avgOutsideMs: outsides.reduce((sum, ms) => sum + ms, 0) / outsides.length,
      maxOutsideMs: outsides.reduce((max, ms) => Math.max(max, ms), 0),
      longFrames: frames.filter((ms) => ms > LONG_FRAME_MS).length,
      samples: size,
      recentFrameMs: recent,
      phases: phaseStatsList(avgSimMs),
    };
  };

  const recordFrame = (sample: FrameRecordSample): void => {
    const frameMs = clampMs(sample.frameMs);
    const simMs = clampMs(sample.simMs);
    const outsideMs = clampMs(frameMs - simMs);
    const phases =
      sample.phases !== undefined
        ? Object.fromEntries(
            Object.entries(sample.phases)
              .filter(([, ms]) => Number.isFinite(ms) && ms > 0)
              .slice(0, MAX_PHASES_PER_FRAME),
          )
        : { ...currentPhases };

    frameMsBuffer[frameIndex] = frameMs;
    simMsBuffer[frameIndex] = simMs;
    outsideMsBuffer[frameIndex] = outsideMs;
    frameIndex = (frameIndex + 1) % FRAME_CAPACITY;
    frameCount += 1;

    recordPhaseStats(phases);

    if (frameMs > LONG_FRAME_MS) {
      const ranked = rankPhases(phases);
      const explained = explainLongFrame(frameMs, simMs, outsideMs, ranked);
      longFrameEvents.push({
        at: Date.now(),
        frameMs,
        simMs,
        outsideMs,
        phases: ranked,
        topPhase: explained.topPhase,
        culprit: explained.culprit,
        reason: explained.reason,
        probes: readProbes(),
        render: renderSample,
      });
      if (longFrameEvents.length > LONG_FRAME_CAPACITY) {
        longFrameEvents.splice(0, longFrameEvents.length - LONG_FRAME_CAPACITY);
      }
    }

    resetCurrentPhases();
  };

  return {
    frame: {
      record: recordFrame,
      stats: frameStats,
      longFrames: () => longFrameEvents,
      clearLongFrames() {
        longFrameEvents.length = 0;
      },
      reset() {
        frameIndex = 0;
        frameCount = 0;
        longFrameEvents.length = 0;
        phaseAccumulators.clear();
        resetCurrentPhases();
      },
    },
    profile: {
      begin(name) {
        const start = nowMs();
        return () => addPhaseMs(name, nowMs() - start);
      },
      measure(name, fn) {
        const start = nowMs();
        try {
          return fn();
        } finally {
          addPhaseMs(name, nowMs() - start);
        }
      },
      add: addPhaseMs,
      current: () => ({ ...currentPhases }),
      reset: resetCurrentPhases,
    },
    render: {
      record(sample) {
        renderSample = sample;
      },
      latest: () => renderSample,
    },
  };
};
