/** A transient HUD message that expires on its own — banner, pickup note, alert. */
export interface Toast<T = string> {
  /** Stable id for keying in a UI list. */
  id: string;
  /** Message payload (a string, or any structured content the HUD renders). */
  body: T;
  /** Wall-clock time (seconds) after which the toast should be dropped. */
  expiresAt: number;
}

/**
 * Append `toast`, keeping only the newest `cap` entries.
 *
 * @capability toast-feed queue of transient self-expiring on-screen messages (toasts, announcer, kill-feed)
 */
export function appendToast<T>(toasts: readonly Toast<T>[], toast: Toast<T>, cap: number): readonly Toast<T>[] {
  const next = [...toasts, toast];
  return cap > 0 && next.length > cap ? next.slice(next.length - cap) : next;
}

/** Drop every toast whose `expiresAt` is at or before `now`. Returns the same array when nothing expired. */
export function pruneToasts<T>(toasts: readonly Toast<T>[], now: number): readonly Toast<T>[] {
  const kept = toasts.filter((toast) => toast.expiresAt > now);
  return kept.length === toasts.length ? toasts : kept;
}

/** Stateful transient-toast list with a size cap and time-to-live eviction. */
export interface ToastQueue<T = string> {
  /** Raise a toast at `now` living `ttlSeconds` (falling back to the queue default); returns it. */
  push(body: T, now: number, ttlSeconds?: number): Toast<T>;
  /** Evict toasts that have expired as of `now`. */
  prune(now: number): void;
  /** Current live toasts, oldest first. */
  list(): readonly Toast<T>[];
  /** Remove all toasts. */
  clear(): void;
}

/** Options for {@link createToastQueue}. */
export interface ToastQueueOptions {
  /** Maximum toasts retained; older ones fall off. Defaults to 4. */
  cap?: number;
  /** Default lifetime in seconds when `push` is not given one. Defaults to 3. */
  ttlSeconds?: number;
}

/**
 * A capped, self-expiring toast queue — the append-with-limit plus TTL-prune list every HUD hand-rolled
 * on top of a plain array. Feed it game time: `push` raises a message, `prune(now)` drops expired ones,
 * `list()` is what the HUD renders. Unlike the append-only event feed, toasts evict themselves.
 *
 * @capability toast-feed queue of transient self-expiring on-screen messages (toasts, announcer, kill-feed)
 */
export function createToastQueue<T = string>(options: ToastQueueOptions = {}): ToastQueue<T> {
  const cap = options.cap ?? 4;
  const defaultTtl = options.ttlSeconds ?? 3;
  let toasts: readonly Toast<T>[] = [];
  let counter = 0;
  return {
    push(body, now, ttlSeconds) {
      const toast: Toast<T> = { id: `toast-${counter}`, body, expiresAt: now + (ttlSeconds ?? defaultTtl) };
      counter += 1;
      toasts = appendToast(toasts, toast, cap);
      return toast;
    },
    prune(now) {
      toasts = pruneToasts(toasts, now);
    },
    list() {
      return toasts;
    },
    clear() {
      toasts = [];
    },
  };
}
