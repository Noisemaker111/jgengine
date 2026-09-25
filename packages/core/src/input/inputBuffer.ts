/** One action's press history inside an {@link InputBuffer}. */
export interface BufferedAction {
  pressedAt: number;
  previousPressAt: number | null;
  releasedAt: number | null;
  consumed: boolean;
}

/** Serializable state for an {@link InputBuffer}. */
export interface InputBufferSnapshot {
  windowMs: number;
  actions: Record<string, BufferedAction>;
}

/** Remembers recent action presses so a press slightly early (a jump before landing) still counts. Times are caller-supplied ms, so it runs the same on a client, a host or in a replay. */
export interface InputBuffer {
  /** Record a press edge. */
  press(action: string, nowMs: number): void;
  /** Record a release edge; {@link InputBuffer.hold} stops growing. */
  release(action: string, nowMs: number): void;
  /** `true` once for a press no older than `windowMs` (default: the buffer's window), then the press is spent. */
  consume(action: string, nowMs: number, windowMs?: number): boolean;
  /** `true` while `nowMs` is within `windowMs` of `groundedAtMs` — late-jump grace after leaving a ledge. `null` never qualifies. */
  coyote(groundedAtMs: number | null, nowMs: number, windowMs: number): boolean;
  /** How long the action has been held, ms; `0` when released or never pressed. */
  hold(action: string, nowMs: number): number;
  /** `true` when the last two presses were at most `gapMs` apart and the latest is no older than `gapMs`. */
  doubleTap(action: string, nowMs: number, gapMs: number): boolean;
  /** Change the default buffer window. */
  retune(next: { windowMs: number }): void;
  snapshot(): InputBufferSnapshot;
  restore(snapshot: InputBufferSnapshot): void;
}

/**
 * Creates an input buffer for jump buffering, coyote time, hold duration and double taps.
 * @capability input-buffer buffer early presses, coyote time, hold duration and double tap for responsive controls
 */
export function createInputBuffer(options: { windowMs: number }): InputBuffer {
  let windowMs = options.windowMs;
  let actions = new Map<string, BufferedAction>();

  return {
    press(action, nowMs) {
      const previous = actions.get(action);
      actions.set(action, {
        pressedAt: nowMs,
        previousPressAt: previous === undefined ? null : previous.pressedAt,
        releasedAt: null,
        consumed: false,
      });
    },
    release(action, nowMs) {
      const entry = actions.get(action);
      if (entry !== undefined && entry.releasedAt === null) entry.releasedAt = nowMs;
    },
    consume(action, nowMs, window = windowMs) {
      const entry = actions.get(action);
      if (entry === undefined || entry.consumed || nowMs - entry.pressedAt > window) return false;
      entry.consumed = true;
      return true;
    },
    coyote(groundedAtMs, nowMs, window) {
      return groundedAtMs !== null && nowMs - groundedAtMs <= window;
    },
    hold(action, nowMs) {
      const entry = actions.get(action);
      if (entry === undefined || entry.releasedAt !== null) return 0;
      return Math.max(0, nowMs - entry.pressedAt);
    },
    doubleTap(action, nowMs, gapMs) {
      const entry = actions.get(action);
      if (entry === undefined || entry.previousPressAt === null) return false;
      return entry.pressedAt - entry.previousPressAt <= gapMs && nowMs - entry.pressedAt <= gapMs;
    },
    retune(next) {
      windowMs = next.windowMs;
    },
    snapshot() {
      const copy: Record<string, BufferedAction> = {};
      for (const [action, entry] of actions) copy[action] = { ...entry };
      return { windowMs, actions: copy };
    },
    restore(snapshot) {
      windowMs = snapshot.windowMs;
      actions = new Map(Object.entries(snapshot.actions).map(([action, entry]) => [action, { ...entry }]));
    },
  };
}
