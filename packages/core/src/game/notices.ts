import type { GameEvents } from "./events";

/** How a notice reads: neutral info, a win, a caution, or a refused action. */
export type NoticeTone = "info" | "success" | "warn" | "deny";

/** What a caller pushes: plain text, or text with a tone, a dedupe key and a lifetime. */
export interface NoticeInput {
  text: string;
  /** Default "info". */
  tone?: NoticeTone;
  /** Live notices with the same key stack into one (count +1, lifetime refreshed). Default `${tone}:${text}`. */
  key?: string;
  /** Lifetime in ms. Defaults to the feed's `ttlMs`, or `denyTtlMs` for deny. */
  ttlMs?: number;
}

/** A live notice as the HUD renders it. */
export interface Notice {
  id: string;
  text: string;
  tone: NoticeTone;
  key: string;
  /** How many pushes stacked into this notice; render "×N" when above 1. */
  count: number;
  /** Clock time (ms) of the latest push. */
  at: number;
  expiresAt: number;
}

/** Plain JSON state of a {@link NoticeFeed}. */
export interface NoticeFeedState {
  notices: Notice[];
  counter: number;
}

/** Tunables for {@link createNoticeFeed}; all retunable at runtime. */
export interface NoticeFeedConfig {
  /** Maximum live notices; the oldest falls off. Default 4. */
  cap?: number;
  /** Default lifetime in ms. Default 3200. */
  ttlMs?: number;
  /** Lifetime for deny notices, which are short reactions. Default 2400. */
  denyTtlMs?: number;
}

/** A capped, self-expiring, deduping notice list every game reaches through `ctx.game.notices`. */
export interface NoticeFeed {
  /** Raise a notice (or stack it onto a live one with the same key); returns the live entry. */
  push(input: NoticeInput | string): Notice;
  /** Remove one notice early. */
  dismiss(id: string): void;
  /** Drop expired notices as of the feed clock. */
  prune(): void;
  /** Live notices, oldest first. Stable reference until the next change. */
  list(): readonly Notice[];
  clear(): void;
  /** Called after every change. */
  subscribe(listener: () => void): () => void;
  /** Called once per push; `stacked` is true when it merged into a live notice. */
  onPush(listener: (notice: Notice, stacked: boolean) => void): () => void;
  retune(config: NoticeFeedConfig): void;
  snapshot(): NoticeFeedState;
  restore(next: NoticeFeedState): void;
}

const DEFAULT_CAP = 4;
const DEFAULT_TTL_MS = 3200;
const DEFAULT_DENY_TTL_MS = 2400;

/**
 * Player-facing notice feed: info/success/warn/deny messages with stacking dedupe and TTL. Pure state with
 * an injected clock, so it runs headless; the shell renders it and plays a UI cue per push.
 *
 * @capability notice-feed push toned, deduped, self-expiring player notices from game logic via ctx.game.notices
 */
export function createNoticeFeed(config: NoticeFeedConfig & { now?: () => number } = {}): NoticeFeed {
  const now = config.now ?? Date.now;
  let cap = config.cap ?? DEFAULT_CAP;
  let ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
  let denyTtlMs = config.denyTtlMs ?? DEFAULT_DENY_TTL_MS;
  let notices: readonly Notice[] = [];
  let counter = 0;
  const listeners = new Set<() => void>();
  const pushListeners = new Set<(notice: Notice, stacked: boolean) => void>();

  function set(next: readonly Notice[]): void {
    if (next === notices) return;
    notices = next;
    for (const listener of [...listeners]) listener();
  }

  function prunedAt(time: number): readonly Notice[] {
    return notices.every((notice) => notice.expiresAt > time) ? notices : notices.filter((notice) => notice.expiresAt > time);
  }

  return {
    push(raw) {
      const input = typeof raw === "string" ? { text: raw } : raw;
      const tone = input.tone ?? "info";
      const key = input.key ?? `${tone}:${input.text}`;
      const time = now();
      const life = input.ttlMs ?? (tone === "deny" ? denyTtlMs : ttlMs);
      const live = prunedAt(time);
      const index = live.findIndex((notice) => notice.key === key);
      let notice: Notice;
      if (index >= 0) {
        const previous = live[index]!;
        notice = { ...previous, text: input.text, tone, count: previous.count + 1, at: time, expiresAt: time + life };
        const next = [...live];
        next[index] = notice;
        set(next);
      } else {
        notice = { id: `notice-${counter}`, text: input.text, tone, key, count: 1, at: time, expiresAt: time + life };
        counter += 1;
        const next = [...live, notice];
        set(cap > 0 && next.length > cap ? next.slice(next.length - cap) : next);
      }
      for (const listener of [...pushListeners]) listener(notice, index >= 0);
      return notice;
    },
    dismiss(id) {
      if (notices.some((notice) => notice.id === id)) set(notices.filter((notice) => notice.id !== id));
    },
    prune() {
      set(prunedAt(now()));
    },
    list: () => notices,
    clear() {
      if (notices.length > 0) set([]);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onPush(listener) {
      pushListeners.add(listener);
      return () => pushListeners.delete(listener);
    },
    retune(next) {
      cap = next.cap ?? cap;
      ttlMs = next.ttlMs ?? ttlMs;
      denyTtlMs = next.denyTtlMs ?? denyTtlMs;
      if (cap > 0 && notices.length > cap) set(notices.slice(notices.length - cap));
    },
    snapshot: () => ({ notices: notices.map((notice) => ({ ...notice })), counter }),
    restore(next) {
      counter = next.counter;
      set(next.notices.map((notice) => ({ ...notice })));
    },
  };
}

/** Options for {@link attachRefusalNotices}. */
export interface RefusalNoticeOptions {
  /** Which actors' refusals to show. Default: commands run without an actor or by `localUserId`. */
  accept?: (refusal: { command: string; reason: string; actor: string | null }) => boolean;
  /** The local player's id, used by the default `accept`. */
  localUserId?: () => string;
}

/**
 * Show every player-facing command refusal (`validate` returned `{ reason, message }`) as a deny notice.
 * Refusals without a `message` stay silent: `reason` is a machine string. Returns the detach function.
 *
 * @capability refusal-feedback surface a refused command's player-facing message in the notice feed automatically
 */
export function attachRefusalNotices(
  events: Pick<GameEvents, "on">,
  notices: Pick<NoticeFeed, "push">,
  options: RefusalNoticeOptions = {},
): () => void {
  const accept = options.accept ?? ((refusal) =>
    refusal.actor === null || options.localUserId === undefined || refusal.actor === options.localUserId());
  return events.on("command.refused", (refusal) => {
    if (refusal.message === undefined || refusal.message === "") return;
    if (!accept(refusal)) return;
    notices.push({ text: refusal.message, tone: "deny", key: `refusal:${refusal.command}:${refusal.message}` });
  });
}
