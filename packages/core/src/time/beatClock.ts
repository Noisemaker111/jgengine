export interface BeatClockConfig {
  bpm: number;
  /** Beats per bar/measure, for bar-relative UI (rhythm-game combo windows). Default 4. */
  beatsPerBar?: number;
}

export interface BeatSnapshot {
  /** Fractional beat count since the clock started. */
  beat: number;
  beatIndex: number;
  bar: number;
  beatInBar: number;
  /** 0..1 fractional position within the current beat. */
  phase: number;
}

export interface BeatClock {
  /** Advance by a game-time delta (already scaled by ctx.time — never wall-clock). Returns the resulting snapshot and fires onBeat once per newly crossed integer beat. */
  advance(gameDt: number): BeatSnapshot;
  snapshot(): BeatSnapshot;
  /** Elapsed game-seconds since the clock started. */
  now(): number;
  beatDurationSec(): number;
  bpm(): number;
}

const MAX_BEAT_FIRES = 10_000;

export function createBeatClock(config: BeatClockConfig, onBeat?: (beatIndex: number) => void): BeatClock {
  const beatsPerBar = config.beatsPerBar !== undefined && config.beatsPerBar > 0 ? config.beatsPerBar : 4;
  const beatDurationSec = 60 / config.bpm;

  let elapsedSec = 0;
  let lastBeatIndex = -1;

  function toSnapshot(): BeatSnapshot {
    const beat = elapsedSec / beatDurationSec;
    const beatIndex = Math.floor(beat);
    return {
      beat,
      beatIndex,
      bar: Math.floor(beatIndex / beatsPerBar),
      beatInBar: ((beatIndex % beatsPerBar) + beatsPerBar) % beatsPerBar,
      phase: beat - beatIndex,
    };
  }

  function advance(gameDt: number): BeatSnapshot {
    if (gameDt > 0) elapsedSec += gameDt;
    const snapshot = toSnapshot();
    let fires = 0;
    while (lastBeatIndex < snapshot.beatIndex && fires < MAX_BEAT_FIRES) {
      lastBeatIndex += 1;
      onBeat?.(lastBeatIndex);
      fires += 1;
    }
    return snapshot;
  }

  return {
    advance,
    snapshot: toSnapshot,
    now: () => elapsedSec,
    beatDurationSec: () => beatDurationSec,
    bpm: () => config.bpm,
  };
}

/** Signed offset (game-seconds) from `nowSec` to the nearest beat boundary — negative = early, positive = late (#286.12). */
export function nearestBeatDelta(nowSec: number, beatDurationSec: number): number {
  const beatIndex = Math.round(nowSec / beatDurationSec);
  return nowSec - beatIndex * beatDurationSec;
}

export interface BeatAccuracyTier {
  id: string;
  /** Maximum absolute delta (game-seconds) from the beat that still earns this tier. */
  windowSec: number;
}

export interface BeatJudgement {
  /** The matched tier id, or `"miss"` beyond every tier. */
  tier: string;
  /** Signed delta to the nearest beat — negative = early, positive = late. */
  deltaSec: number;
}

export const DEFAULT_BEAT_TIERS: readonly BeatAccuracyTier[] = [
  { id: "perfect", windowSec: 0.06 },
  { id: "good", windowSec: 0.14 },
];

/** Classify a press against the nearest beat into tiered judgements (perfect/good/miss by default). Tiers must be ordered tightest-first. */
export function classifyBeatAccuracy(
  nowSec: number,
  beatDurationSec: number,
  tiers: readonly BeatAccuracyTier[] = DEFAULT_BEAT_TIERS,
): BeatJudgement {
  const deltaSec = nearestBeatDelta(nowSec, beatDurationSec);
  const magnitude = Math.abs(deltaSec);
  for (const tier of tiers) {
    if (magnitude <= tier.windowSec) return { tier: tier.id, deltaSec };
  }
  return { tier: "miss", deltaSec };
}

/** Whether a snapshot sits inside a bar-relative open window `[fromBeat, toBeat)` — e.g. "act on beats 2-4 of every bar" (#286.12). */
export function inBarWindow(snapshot: BeatSnapshot, fromBeat: number, toBeat: number): boolean {
  const barBeat = snapshot.beatInBar + snapshot.phase;
  return barBeat >= fromBeat && barBeat < toBeat;
}

const QUANTIZE_EPSILON = 1e-6;

/** The absolute beat-time (game-seconds) that a press at `nowSec` quantizes to: the same instant if it lands on a beat boundary, else the next one. */
export function nextBeatTime(nowSec: number, beatDurationSec: number, epsilon = QUANTIZE_EPSILON): number {
  const beatIndex = nowSec / beatDurationSec;
  const rounded = Math.round(beatIndex);
  if (Math.abs(beatIndex - rounded) <= epsilon) return rounded * beatDurationSec;
  return Math.ceil(beatIndex) * beatDurationSec;
}

export interface BufferedAction<T> {
  action: T;
  bufferedAtSec: number;
  fireAtSec: number;
}

export interface BeatInputBuffer<T> {
  /** Buffer an action; it quantizes to fire on the next beat tick (or immediately if `nowSec` is already on a beat). Returns the resolved fire time. */
  buffer(action: T, nowSec: number): number;
  /** Drain and return every action whose fire time has arrived, in the order they were buffered. */
  advance(nowSec: number): T[];
  pendingCount(): number;
  clear(): void;
}

export function createBeatInputBuffer<T>(beatDurationSec: number): BeatInputBuffer<T> {
  const pending: BufferedAction<T>[] = [];

  return {
    buffer(action, nowSec) {
      const fireAtSec = nextBeatTime(nowSec, beatDurationSec);
      pending.push({ action, bufferedAtSec: nowSec, fireAtSec });
      return fireAtSec;
    },
    advance(nowSec) {
      const due: T[] = [];
      const remaining: BufferedAction<T>[] = [];
      for (const entry of pending) {
        if (entry.fireAtSec <= nowSec + QUANTIZE_EPSILON) due.push(entry.action);
        else remaining.push(entry);
      }
      pending.length = 0;
      pending.push(...remaining);
      return due;
    },
    pendingCount: () => pending.length,
    clear: () => {
      pending.length = 0;
    },
  };
}
