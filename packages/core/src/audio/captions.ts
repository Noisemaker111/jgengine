/** One caption line as the overlay renders it. */
export interface Caption {
  id: number;
  text: string;
  /** Free-string kind the game styles ("hit", "pickup", "wave"). */
  kind: string;
  /** How many identical lines stacked into this one. */
  count: number;
  at: number;
  expiresAt: number;
}

/** Tunables for {@link createCaptionFeed}; all retunable at runtime. */
export interface CaptionFeedConfig {
  /** Maximum live lines. Default 3. */
  cap?: number;
  /** Line lifetime in ms. Default 2400. */
  ttlMs?: number;
  /** Injected clock; default `Date.now`. */
  now?: () => number;
}

/** A capped, self-expiring list of caption lines that the accessibility captions setting turns on. */
export interface CaptionFeed {
  /** Show `text`; an identical line still live stacks into one with a count. */
  push(text: string, kind?: string): Caption;
  /** Live lines, oldest first. Stable reference until the next change. */
  list(): readonly Caption[];
  /** Drop expired lines as of the feed clock. */
  prune(nowMs?: number): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
  retune(config: Omit<CaptionFeedConfig, "now">): void;
  snapshot(): { captions: Caption[]; counter: number };
  restore(state: { captions: Caption[]; counter: number }): void;
}

const DEFAULT_CAP = 3;
const DEFAULT_TTL_MS = 2400;

/**
 * The caption list the feedback seam writes to and the HUD overlay reads: bounded, self-expiring, and
 * deduped so three hits read as "Hit x3" rather than three copies. Pure state with an injected clock,
 * so it runs headless.
 *
 * @capability caption-feed bounded, self-expiring, deduped caption lines for the accessibility captions overlay
 */
export function createCaptionFeed(config: CaptionFeedConfig = {}): CaptionFeed {
  const now = config.now ?? Date.now;
  let cap = Math.max(1, config.cap ?? DEFAULT_CAP);
  let ttlMs = Math.max(0, config.ttlMs ?? DEFAULT_TTL_MS);
  let captions: readonly Caption[] = [];
  let counter = 0;
  const listeners = new Set<() => void>();

  function set(next: readonly Caption[]): void {
    if (next === captions) return;
    captions = next;
    for (const listener of [...listeners]) listener();
  }

  function live(time: number): readonly Caption[] {
    return captions.every((caption) => caption.expiresAt > time)
      ? captions
      : captions.filter((caption) => caption.expiresAt > time);
  }

  return {
    push(text, kind = "default") {
      const time = now();
      const current = live(time);
      const index = current.findIndex((caption) => caption.text === text);
      if (index >= 0) {
        const previous = current[index]!;
        const next = [...current];
        next[index] = { ...previous, kind, count: previous.count + 1, at: time, expiresAt: time + ttlMs };
        set(next);
        return next[index]!;
      }
      const caption: Caption = { id: counter, text, kind, count: 1, at: time, expiresAt: time + ttlMs };
      counter += 1;
      const appended = [...current, caption];
      set(appended.length > cap ? appended.slice(appended.length - cap) : appended);
      return caption;
    },
    list() {
      return live(now());
    },
    prune(nowMs) {
      set(live(nowMs ?? now()));
    },
    clear() {
      if (captions.length > 0) set([]);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    retune(next) {
      if (next.cap !== undefined) cap = Math.max(1, next.cap);
      if (next.ttlMs !== undefined) ttlMs = Math.max(0, next.ttlMs);
      set(live(now()));
    },
    snapshot() {
      return { captions: [...captions], counter };
    },
    restore(state) {
      captions = [...state.captions];
      counter = state.counter;
      set(live(now()));
    },
  };
}
