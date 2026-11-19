export interface SequenceCue<Payload = unknown> {
  /** Playhead time (ms from the start of the timeline) at which this cue fires. Must be `>= 0`. */
  atMs: number;
  /**
   * Free-string tag naming what this cue is — `"camera"`, `"dialogue"`, `"fade"`, anything.
   * The director never interprets it; the game switches on `kind` to act on the {@link SequenceCue.payload}.
   */
  kind: string;
  payload?: Payload;
  id?: string;
}

export interface EmittedCue<Payload = unknown> {
  cue: SequenceCue<Payload>;
  index: number;
  /** Playhead (ms) at the moment it was emitted — `>= cue.atMs`, possibly well past on a large jump. */
  atPlayheadMs: number;
}

/** A read-only view of the director's playback state, returned by {@link SequenceDirector.state}. */
export interface SequenceState {
  /** Current playhead position in ms from the start of the timeline. */
  playheadMs: number;
  durationMs: number;
  playing: boolean;
  done: boolean;
  /** Fraction of the timeline elapsed, in `[0, 1]`; `1` when `durationMs` is 0. */
  progress: number;
  firedCount: number;
  total: number;
}

export interface SequenceSnapshot {
  /** Playhead position in ms. */
  playheadMs: number;
  nextIndex: number;
  playing: boolean;
}

export interface SequenceDirectorOptions<Payload = unknown> {
  cues: readonly SequenceCue<Payload>[];
  /** Injected clock (ms) that drives playback. Default `Date.now`; inject a fake for deterministic tests. */
  now?: () => number;
  autoplay?: boolean;
}

export type CueListener<Payload = unknown> = (emitted: EmittedCue<Payload>) => void;

export interface SequenceDirector<Payload = unknown> {
  readonly cues: readonly SequenceCue<Payload>[];
  play(): void;
  /** Freeze the playhead, capturing elapsed clock time up to now. No-op if not playing. */
  pause(): void;
  /**
   * Jump the playhead to `ms` (clamped to `[0, durationMs]`). Moving forward fires every
   * un-fired cue up to `ms` in order (once each, even across a large jump); moving backward
   * re-arms cues now in the future without emitting them.
   */
  seek(ms: number): void;
  skip(): void;
  stop(): void;
  tick(): void;
  state(): SequenceState;
  onCue(listener: CueListener<Payload>): () => void;
  subscribe(listener: () => void): () => void;
  snapshot(): SequenceSnapshot;
  restore(snapshot: SequenceSnapshot): void;
}

/**
 * A serializable cutscene / sequence director: an ordered timeline of typed cues
 * (`{ atMs, kind, payload }`) advanced by one injected clock, firing each cue once
 * and in order as its time passes — even across a large seek — with play/pause/
 * seek/skip/stop controls. The director only *schedules and emits* cues; it never
 * interprets what a `kind` means, so the same primitive drives camera moves,
 * dialogue lines, fades, or any game event. `snapshot`/`restore` round-trip the
 * playhead and which cues have fired. Deterministic (no wall clock beyond the
 * injected `now`) and allocation-free on the tick path.
 *
 * @capability sequence-director data-driven cutscene timeline — fire typed camera/dialogue/event cues on one injected clock with play/pause/seek/skip and snapshot/restore
 */
export function createSequenceDirector<Payload = unknown>(
  options: SequenceDirectorOptions<Payload>,
): SequenceDirector<Payload> {
  const cues = [...options.cues].sort((a, b) => a.atMs - b.atMs);
  for (const cue of cues) {
    if (!(cue.atMs >= 0) || !Number.isFinite(cue.atMs)) {
      throw new Error(`sequence cue "${cue.kind}" needs a finite atMs >= 0, got ${cue.atMs}`);
    }
  }
  const durationMs = cues.length > 0 ? cues[cues.length - 1]!.atMs : 0;
  const now = options.now ?? Date.now;
  const cueListeners = new Set<CueListener<Payload>>();
  const stateListeners = new Set<() => void>();

  let playheadMs = 0;
  let nextIndex = 0;
  let playing = false;
  let lastNow = now();

  function notify(): void {
    for (const listener of stateListeners) listener();
  }

  function fireDue(): boolean {
    let fired = false;
    while (nextIndex < cues.length && cues[nextIndex]!.atMs <= playheadMs) {
      const cue = cues[nextIndex]!;
      const index = nextIndex;
      nextIndex += 1;
      fired = true;
      for (const listener of cueListeners) listener({ cue, index, atPlayheadMs: playheadMs });
    }
    return fired;
  }

  function advanceToNow(): boolean {
    const t = now();
    const delta = t - lastNow;
    lastNow = t;
    if (delta <= 0) return false;
    playheadMs = Math.min(durationMs, playheadMs + delta);
    const fired = fireDue();
    const stopped = playheadMs >= durationMs && playing;
    if (playheadMs >= durationMs) playing = false;
    return fired || stopped;
  }

  function isDone(): boolean {
    return nextIndex >= cues.length && playheadMs >= durationMs;
  }

  return {
    cues,
    play() {
      if (playing || isDone()) return;
      playing = true;
      lastNow = now();
      notify();
    },
    pause() {
      if (!playing) return;
      advanceToNow();
      playing = false;
      notify();
    },
    seek(ms) {
      const target = Math.max(0, Math.min(durationMs, ms));
      if (target < playheadMs) {
        // Backward scrub: re-arm cues now in the future, emit nothing.
        playheadMs = target;
        let i = 0;
        while (i < cues.length && cues[i]!.atMs <= target) i += 1;
        nextIndex = i;
      } else {
        playheadMs = target;
        fireDue();
      }
      lastNow = now();
      if (playheadMs >= durationMs && nextIndex >= cues.length) playing = false;
      notify();
    },
    skip() {
      playheadMs = durationMs;
      fireDue();
      playing = false;
      notify();
    },
    stop() {
      playheadMs = 0;
      nextIndex = 0;
      playing = false;
      lastNow = now();
      notify();
    },
    tick() {
      if (!playing) return;
      if (advanceToNow()) notify();
    },
    state() {
      return {
        playheadMs,
        durationMs,
        playing,
        done: isDone(),
        progress: durationMs > 0 ? Math.max(0, Math.min(1, playheadMs / durationMs)) : 1,
        firedCount: nextIndex,
        total: cues.length,
      };
    },
    onCue(listener) {
      cueListeners.add(listener);
      return () => cueListeners.delete(listener);
    },
    subscribe(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    snapshot() {
      return { playheadMs, nextIndex, playing };
    },
    restore(snapshot) {
      playheadMs = Math.max(0, Math.min(durationMs, snapshot.playheadMs));
      nextIndex = Math.max(0, Math.min(cues.length, snapshot.nextIndex));
      playing = snapshot.playing;
      lastNow = now();
      notify();
    },
  };
}
