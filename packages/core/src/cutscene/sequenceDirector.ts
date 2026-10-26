/** One scheduled beat of a cutscene: a typed cue that fires when the playhead reaches `atMs`. */
export interface SequenceCue<Payload = unknown> {
  /** Playhead time (ms from the start of the timeline) at which this cue fires. Must be `>= 0`. */
  atMs: number;
  /**
   * Free-string tag naming what this cue is — `"camera"`, `"dialogue"`, `"fade"`, anything.
   * The director never interprets it; the game switches on `kind` to act on the {@link SequenceCue.payload}.
   */
  kind: string;
  /** Arbitrary serializable data the game reads when the cue fires. Opaque to the director. */
  payload?: Payload;
  /** Optional stable id, surfaced on emission and useful for logging/debugging. */
  id?: string;
}

/** A cue plus the resolved firing context passed to {@link SequenceDirector.onCue} listeners. */
export interface EmittedCue<Payload = unknown> {
  /** The cue that fired. */
  cue: SequenceCue<Payload>;
  /** Its index in the ordered cue list. */
  index: number;
  /** Playhead (ms) at the moment it was emitted — `>= cue.atMs`, possibly well past on a large jump. */
  atPlayheadMs: number;
}

/** A read-only view of the director's playback state, returned by {@link SequenceDirector.state}. */
export interface SequenceState {
  /** Current playhead position in ms from the start of the timeline. */
  playheadMs: number;
  /** Total timeline length — the largest cue `atMs` (0 when empty). */
  durationMs: number;
  /** Whether the clock is currently advancing the playhead. */
  playing: boolean;
  /** True once the playhead has reached the end (every cue has fired). */
  done: boolean;
  /** Fraction of the timeline elapsed, in `[0, 1]`; `1` when `durationMs` is 0. */
  progress: number;
  /** How many cues have fired so far (a prefix of the ordered list). */
  firedCount: number;
  /** Total number of cues. */
  total: number;
}

/** Serializable snapshot — enough to resume a cutscene exactly where a save left it. */
export interface SequenceSnapshot {
  /** Playhead position in ms. */
  playheadMs: number;
  /** Index of the next cue to fire; cues before it are considered already fired. */
  nextIndex: number;
  /** Whether playback was running when captured. */
  playing: boolean;
}

/** Options for {@link createSequenceDirector}. */
export interface SequenceDirectorOptions<Payload = unknown> {
  /** The timeline: cues in any order (sorted by `atMs` internally, stably). */
  cues: readonly SequenceCue<Payload>[];
  /** Injected clock (ms) that drives playback. Default `Date.now`; inject a fake for deterministic tests. */
  now?: () => number;
  /** Start playing immediately (default `false` — call {@link SequenceDirector.play}). */
  autoplay?: boolean;
}

/** A cue listener, called once per cue as it fires. Returns nothing. */
export type CueListener<Payload = unknown> = (emitted: EmittedCue<Payload>) => void;

/**
 * A data-driven cutscene: an ordered timeline of typed cues that fire on a single
 * injected clock. See {@link createSequenceDirector}.
 */
export interface SequenceDirector<Payload = unknown> {
  /** The cues, sorted by `atMs`. */
  readonly cues: readonly SequenceCue<Payload>[];
  /** Start (or resume) playback from the current playhead. No-op if already playing or done. */
  play(): void;
  /** Freeze the playhead, capturing elapsed clock time up to now. No-op if not playing. */
  pause(): void;
  /**
   * Jump the playhead to `ms` (clamped to `[0, durationMs]`). Moving forward fires every
   * un-fired cue up to `ms` in order (once each, even across a large jump); moving backward
   * re-arms cues now in the future without emitting them.
   */
  seek(ms: number): void;
  /** Fast-forward to the end: emit every remaining cue in order, then stop and mark done. */
  skip(): void;
  /** Halt and rewind: pause, reset the playhead to 0, and re-arm every cue. */
  stop(): void;
  /**
   * Advance the playhead by the elapsed injected-clock time since the last tick/resume and
   * emit any cues now due. A host calls this once per frame while playing; a no-op when paused.
   */
  tick(): void;
  /** Current playback state (playhead, duration, playing/done, progress). */
  state(): SequenceState;
  /** Register a cue listener; returns an unsubscribe fn. */
  onCue(listener: CueListener<Payload>): () => void;
  /** Observe state changes (play/pause/seek/skip/stop/tick/restore); returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /** Serializable state for a save. */
  snapshot(): SequenceSnapshot;
  /** Restore from a {@link SequenceSnapshot}; does not re-emit already-fired cues. */
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

  /** Emit every un-fired cue with `atMs <= playheadMs`, in order. Allocation-free. */
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

  /** Fold elapsed injected-clock time into the playhead and fire due cues. */
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
