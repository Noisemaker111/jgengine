/**
 * A serializable set of named countdown / countup timers evaluated against an
 * injected clock. One primitive covers round timers, respawn clocks, and ability
 * cooldown/charge — they are the same mechanic (elapsed vs. duration on a clock),
 * so `id` and any labels are free strings the engine never interprets.
 *
 * No hidden interval math: the set stores only accumulated elapsed time plus a
 * clock anchor while running, and derives every read on demand. `subscribe`
 * reports structural changes (start/pause/stop/reset); `poll` reports expiry
 * edges so a game can react (respawn, round end, ability ready). `snapshot` /
 * `restore` round-trip through a save by resolving elapsed at snapshot time and
 * re-anchoring on restore, so pause/resume survives serialization.
 */

/** Direction a timer counts. `"down"` leads with `remainingMs` (countdown); `"up"` leads with `elapsedMs` (charge). */
export type TimerDirection = "down" | "up";

/** Options for {@link TimerSet.start}. */
export interface TimerStartOptions {
  /** Full span of the timer in milliseconds. Non-positive spans read as instantly expired. */
  durationMs: number;
  /** Count direction. Default `"down"`. Purely a read convenience — expiry is the same either way. */
  direction?: TimerDirection;
  /** When true the timer wraps at its duration and emits an expiry edge each cycle instead of stopping. Default `false`. */
  loop?: boolean;
}

/**
 * A single timer's resolved state for one read. All fields are plain numbers so
 * a HUD can render without touching the model. For a looping timer the values
 * describe the current cycle; `expired` is only ever `true` for a finished
 * non-looping timer (loops signal completion through {@link TimerSet.poll}).
 */
export interface TimerRead {
  /** The timer's id (free string). */
  id: string;
  /** The configured count direction — lets a readout auto-pick remaining (`"down"`) vs elapsed (`"up"`). */
  direction: TimerDirection;
  /** Milliseconds left in this cycle, clamped to `0`. */
  remainingMs: number;
  /** Milliseconds elapsed in this cycle, clamped to `durationMs`. */
  elapsedMs: number;
  /** The configured span in milliseconds. */
  durationMs: number;
  /** Fill fraction `0..1` = `elapsedMs / durationMs` — a ring or bar fills as time passes. */
  progress01: number;
  /** Whether the timer is counting (not paused/stopped). */
  running: boolean;
  /** True once a non-looping timer has reached its duration. Always `false` for a looping timer. */
  expired: boolean;
}

/** One timer's serializable state — elapsed resolved at snapshot time, ready to re-anchor on restore. */
export interface TimerSnapshot {
  id: string;
  durationMs: number;
  direction: TimerDirection;
  loop: boolean;
  /** Elapsed milliseconds at the moment of the snapshot. */
  elapsedMs: number;
  running: boolean;
  /** Whether this non-looping timer had already emitted its expiry edge. */
  fired: boolean;
}

/** Serializable state of a whole {@link TimerSet}. */
export interface TimerSetSnapshot {
  timers: TimerSnapshot[];
}

/** Options for {@link createTimerSet}. */
export interface TimerSetOptions {
  /** Injected clock (ms). Default `Date.now`. Inject a sim clock for determinism. */
  now?: () => number;
}

/** Listener notified when a timer newly expires. Receives the timer id. */
export type TimerExpiryListener = (id: string) => void;

/**
 * A named set of countdown / countup timers on an injected clock. Start, pause,
 * resume, stop, reset, and read timers by free-string id; observe structural
 * changes with {@link TimerSet.subscribe} and expiry edges with
 * {@link TimerSet.poll} / {@link TimerSet.onExpire}.
 */
export interface TimerSet {
  /** Start (or replace) a timer by id, running from zero. */
  start(id: string, options: TimerStartOptions): void;
  /** Pause a running timer, freezing its elapsed time. No-op if unknown or already paused. */
  pause(id: string): void;
  /** Resume a paused timer from where it stopped. No-op if unknown or already running. */
  resume(id: string): void;
  /** Halt a timer and reset its elapsed time to zero, keeping it in the set (not running). */
  stop(id: string): void;
  /** Restart a timer's elapsed time from zero, preserving its running state. */
  reset(id: string): void;
  /** Remove a timer from the set entirely. */
  remove(id: string): void;
  /** Pause every running timer (e.g. a global game pause). */
  pauseAll(): void;
  /** Resume every paused timer. */
  resumeAll(): void;
  /** Whether a timer with this id exists. */
  has(id: string): boolean;
  /** Every timer id currently in the set. */
  ids(): readonly string[];
  /**
   * Resolve a timer's current state. Pass `out` to reuse an object and avoid
   * per-read allocation in a hot HUD loop. Returns `null` for an unknown id.
   */
  read(id: string, out?: TimerRead): TimerRead | null;
  /** Resolve every timer, newest reads. Allocates an array — for per-frame reads prefer {@link TimerSet.read} with `out`. */
  list(): TimerRead[];
  /**
   * Advance expiry detection to the current clock time and return the ids that
   * newly expired since the last poll (firing {@link TimerSet.onExpire}
   * listeners for each). Looping timers report once per completed cycle. Call
   * once per frame/tick to react to finished timers.
   */
  poll(): readonly string[];
  /** Observe structural changes (start/pause/resume/stop/reset/remove/restore). Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /** Observe expiry edges surfaced by {@link TimerSet.poll}. Returns an unsubscribe fn. */
  onExpire(listener: TimerExpiryListener): () => void;
  /** Serializable state for a save. */
  snapshot(): TimerSetSnapshot;
  /** Restore from a {@link TimerSetSnapshot}, re-anchoring running timers to the current clock. */
  restore(snapshot: TimerSetSnapshot): void;
}

interface TimerRecord {
  id: string;
  durationMs: number;
  direction: TimerDirection;
  loop: boolean;
  /** Accumulated elapsed ms banked at the last pause/anchor. */
  base: number;
  running: boolean;
  /** Clock time the timer last (re)started running; only meaningful while `running`. */
  anchor: number;
  /** Completed expiry cycles already reported (0 or 1 for non-loop; grows for loop). */
  reported: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function rawElapsed(rec: TimerRecord, t: number): number {
  const live = rec.running ? Math.max(0, t - rec.anchor) : 0;
  return rec.base + live;
}

/**
 * Create a serializable set of named countdown / countup timers on an injected
 * clock — one primitive for round timers, respawn clocks, and ability
 * cooldown/charge. Start/pause/resume/stop/reset timers by free-string id, read
 * `{ remainingMs, elapsedMs, durationMs, progress01, running, expired }` for a
 * mm:ss readout or a radial/bar fill, and `poll` for expiry edges. Ids and
 * labels carry no genre meaning; `snapshot`/`restore` round-trip through a save.
 *
 * @capability countdown-timers named countdown/countup timer set on an injected clock — round timers, respawn clocks, ability cooldown/charge; read remaining/elapsed/progress + expiry, snapshot/restore
 */
export function createTimerSet(options: TimerSetOptions = {}): TimerSet {
  const now = options.now ?? Date.now;
  const timers = new Map<string, TimerRecord>();
  const listeners = new Set<() => void>();
  const expiryListeners = new Set<TimerExpiryListener>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function completedCycles(rec: TimerRecord, t: number): number {
    if (rec.durationMs <= 0) return rec.loop ? 0 : 1;
    const raw = rawElapsed(rec, t);
    if (rec.loop) return Math.floor(raw / rec.durationMs);
    return raw >= rec.durationMs ? 1 : 0;
  }

  function fill(rec: TimerRecord, t: number, out: TimerRead): TimerRead {
    const duration = rec.durationMs;
    const raw = rawElapsed(rec, t);
    let cycleElapsed: number;
    let expired: boolean;
    if (duration <= 0) {
      cycleElapsed = 0;
      expired = !rec.loop;
    } else if (rec.loop) {
      cycleElapsed = raw % duration;
      expired = false;
    } else {
      cycleElapsed = raw < duration ? raw : duration;
      expired = raw >= duration;
    }
    out.id = rec.id;
    out.direction = rec.direction;
    out.durationMs = duration;
    out.elapsedMs = cycleElapsed;
    out.remainingMs = duration > 0 ? duration - cycleElapsed : 0;
    out.progress01 = duration > 0 ? clamp01(cycleElapsed / duration) : 1;
    out.running = rec.running;
    out.expired = expired;
    return out;
  }

  function blankRead(): TimerRead {
    return {
      id: "",
      direction: "down",
      remainingMs: 0,
      elapsedMs: 0,
      durationMs: 0,
      progress01: 0,
      running: false,
      expired: false,
    };
  }

  return {
    start(id, startOptions) {
      timers.set(id, {
        id,
        durationMs: startOptions.durationMs,
        direction: startOptions.direction ?? "down",
        loop: startOptions.loop ?? false,
        base: 0,
        running: true,
        anchor: now(),
        reported: 0,
      });
      notify();
    },
    pause(id) {
      const rec = timers.get(id);
      if (rec === undefined || !rec.running) return;
      rec.base = rawElapsed(rec, now());
      rec.running = false;
      notify();
    },
    resume(id) {
      const rec = timers.get(id);
      if (rec === undefined || rec.running) return;
      rec.anchor = now();
      rec.running = true;
      notify();
    },
    stop(id) {
      const rec = timers.get(id);
      if (rec === undefined) return;
      rec.base = 0;
      rec.running = false;
      rec.reported = 0;
      notify();
    },
    reset(id) {
      const rec = timers.get(id);
      if (rec === undefined) return;
      rec.base = 0;
      rec.anchor = now();
      rec.reported = 0;
      notify();
    },
    remove(id) {
      if (timers.delete(id)) notify();
    },
    pauseAll() {
      const t = now();
      let changed = false;
      for (const rec of timers.values()) {
        if (rec.running) {
          rec.base = rawElapsed(rec, t);
          rec.running = false;
          changed = true;
        }
      }
      if (changed) notify();
    },
    resumeAll() {
      const t = now();
      let changed = false;
      for (const rec of timers.values()) {
        if (!rec.running) {
          rec.anchor = t;
          rec.running = true;
          changed = true;
        }
      }
      if (changed) notify();
    },
    has(id) {
      return timers.has(id);
    },
    ids() {
      return [...timers.keys()];
    },
    read(id, out) {
      const rec = timers.get(id);
      if (rec === undefined) return null;
      return fill(rec, now(), out ?? blankRead());
    },
    list() {
      const t = now();
      const reads: TimerRead[] = [];
      for (const rec of timers.values()) reads.push(fill(rec, t, blankRead()));
      return reads;
    },
    poll() {
      const t = now();
      const fired: string[] = [];
      for (const rec of timers.values()) {
        const cycles = completedCycles(rec, t);
        if (cycles > rec.reported) {
          const times = cycles - rec.reported;
          rec.reported = cycles;
          for (let i = 0; i < times; i += 1) {
            fired.push(rec.id);
            for (const listener of expiryListeners) listener(rec.id);
          }
        }
      }
      return fired;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onExpire(listener) {
      expiryListeners.add(listener);
      return () => expiryListeners.delete(listener);
    },
    snapshot() {
      const t = now();
      const out: TimerSnapshot[] = [];
      for (const rec of timers.values()) {
        out.push({
          id: rec.id,
          durationMs: rec.durationMs,
          direction: rec.direction,
          loop: rec.loop,
          elapsedMs: rawElapsed(rec, t),
          running: rec.running,
          fired: rec.reported > 0,
        });
      }
      return { timers: out };
    },
    restore(snapshot) {
      timers.clear();
      const t = now();
      for (const snap of snapshot.timers) {
        timers.set(snap.id, {
          id: snap.id,
          durationMs: snap.durationMs,
          direction: snap.direction,
          loop: snap.loop,
          base: snap.elapsedMs,
          running: snap.running,
          anchor: t,
          reported: snap.fired ? 1 : 0,
        });
      }
      notify();
    },
  };
}
