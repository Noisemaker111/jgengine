import type { GameEvents } from "../game/events";

export type NoticeTone = "info" | "success" | "warn" | "deny";

export interface NoticeInput {
  text: string;
  tone?: NoticeTone;
  key?: string;
  /** Lifetime in ms. Defaults to the feed's `ttlMs`, or `denyTtlMs` for deny. */
  ttlMs?: number;
  silent?: boolean;
}

export interface Notice {
  id: string;
  text: string;
  tone: NoticeTone;
  key: string;
  count: number;
  /** Clock time (ms) of the latest push. */
  at: number;
  expiresAt: number;
  silent?: true;
}

export interface NoticeFeedState {
  notices: Notice[];
  counter: number;
}

export interface NoticeFeedConfig {
  cap?: number;
  /** Default lifetime in ms. Default 3200. */
  ttlMs?: number;
  denyTtlMs?: number;
}

export interface NoticeFeed {
  push(input: NoticeInput | string): Notice;
  dismiss(id: string): void;
  prune(): void;
  list(): readonly Notice[];
  clear(): void;
  subscribe(listener: () => void): () => void;
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
      const quiet = input.silent === true ? { silent: true as const } : {};
      const live = prunedAt(time);
      const index = live.findIndex((notice) => notice.key === key);
      let notice: Notice;
      if (index >= 0) {
        const { silent: _previousSilent, ...previous } = live[index]!;
        notice = { ...previous, text: input.text, tone, count: previous.count + 1, at: time, expiresAt: time + life, ...quiet };
        const next = [...live];
        next[index] = notice;
        set(next);
      } else {
        notice = { id: `notice-${counter}`, text: input.text, tone, key, count: 1, at: time, expiresAt: time + life, ...quiet };
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

export interface RefusalNoticeOptions {
  /** Which actors' refusals to show. Default: commands run without an actor or by `localUserId`. */
  accept?: (refusal: { command: string; reason: string; actor: string | null }) => boolean;
  /** The local player's id, used by the default `accept`. */
  localUserId?: () => string;
}

/** @capability refusal-feedback surface a refused command's player-facing message in the notice feed automatically */
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
