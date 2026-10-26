/**
 * Which part of its life a banner is in: flying `"in"`, holding centered, or
 * fading `"out"`. Progress `0..1` (see {@link ObjectiveBannerView.progress})
 * runs within whichever phase is active — the renderer maps phase + progress to
 * opacity/scale/translate however it likes.
 */
export type ObjectiveBannerPhase = "in" | "hold" | "out";

/** One announcement request handed to {@link ObjectiveBannerController.announce}. */
export interface ObjectiveBannerAnnouncement {
  /** The big centered headline (e.g. `"WAVE 3"`, `"VICTORY"`). */
  title: string;
  /** Optional smaller line under the title (e.g. `"Defend the core"`). */
  subtitle?: string;
  /**
   * Free-string label the game owns and styles ("wave", "victory", "defeat",
   * "objective", …); the model never interprets it — it only carries it through
   * to the renderer so a game can color/skin per kind. Default `"default"`.
   */
  kind?: string;
  /** Fly-in duration in ms. Default `350`. */
  inMs?: number;
  /** Centered hold duration in ms. Default `2000`. */
  holdMs?: number;
  /** Fade-out duration in ms. Default `500`. */
  outMs?: number;
}

/**
 * The banner to draw right now: its content, the game-owned `kind`, the current
 * {@link ObjectiveBannerPhase}, and `progress` `0..1` through that phase. This
 * object is pooled and overwritten on the next {@link ObjectiveBannerController.current}
 * call — read it, don't retain it.
 */
export interface ObjectiveBannerView {
  /** Stable id assigned at announce time. */
  id: number;
  /** The headline. */
  title: string;
  /** The optional subtitle, or `undefined`. */
  subtitle: string | undefined;
  /** The game-owned free-string label. */
  kind: string;
  /** Which phase the banner is in. */
  phase: ObjectiveBannerPhase;
  /** Progress `0..1` within the current phase. */
  progress: number;
}

/** A persisted banner record — all announcement fields resolved, plus id and schedule. */
export interface StoredObjectiveBanner {
  id: number;
  title: string;
  subtitle: string | undefined;
  kind: string;
  inMs: number;
  holdMs: number;
  outMs: number;
  /** Clock time (ms) this banner started its fly-in, or `null` while still queued. */
  startAt: number | null;
}

/** Serializable state of the queue and the active banner, for save/restore. */
export interface ObjectiveBannerSnapshot {
  /** Wall-clock (ms) the snapshot was taken, so restore re-anchors elapsed time. */
  now: number;
  /** Next id to hand out. */
  nextId: number;
  /** The active banner (head) followed by everything still queued, in order. */
  queue: readonly StoredObjectiveBanner[];
}

/** A live, clock-driven objective/stage banner controller. */
export interface ObjectiveBannerController {
  /**
   * Enqueue a banner. If nothing is showing it starts flying in immediately;
   * otherwise it waits its turn (one banner shows at a time). Returns the new id.
   */
  announce(announcement: ObjectiveBannerAnnouncement): number;
  /**
   * Advance the clock: transition the active banner through in → hold → out,
   * reap it when its life ends, and start the next queued banner. Pass an explicit
   * `nowMs` to drive deterministically, else the injected clock is read. Notifies
   * subscribers. Call it each frame from the renderer.
   */
  advance(nowMs?: number): void;
  /** The banner to draw right now (pooled — do not retain), or `null` when idle. */
  current(): ObjectiveBannerView | null;
  /** Dismiss the active banner immediately and start the next queued one, if any. */
  skip(): void;
  /** Drop the active banner and everything queued. */
  clear(): void;
  /** How many banners are waiting behind the active one. */
  pending(): number;
  /** Whether a banner is currently active. */
  isActive(): boolean;
  /** Observe changes (announce, advance, skip, clear, restore). Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /** Serializable state for a save. */
  snapshot(): ObjectiveBannerSnapshot;
  /** Restore from an {@link ObjectiveBannerSnapshot}. */
  restore(snapshot: ObjectiveBannerSnapshot): void;
}

/** Options for {@link createObjectiveBanner}. */
export interface ObjectiveBannerOptions {
  /** Injected clock (ms). Default `Date.now`. */
  now?: () => number;
  /** Default fly-in ms for announcements that omit `inMs`. Default `350`. */
  inMs?: number;
  /** Default hold ms for announcements that omit `holdMs`. Default `2000`. */
  holdMs?: number;
  /** Default fade-out ms for announcements that omit `outMs`. Default `500`. */
  outMs?: number;
}

/** Mutable queued/active banner record (internal). */
interface QueuedBanner extends StoredObjectiveBanner {
  /** Cached current phase, refreshed by {@link recompute}. */
  phase: ObjectiveBannerPhase;
  /** Cached progress `0..1` within {@link phase}. */
  progress: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * A serializable, clock-driven stage/objective banner controller: the classic
 * transient centered title stamp ("WAVE 3", "VICTORY", "OBJECTIVE COMPLETE"). A
 * game calls `announce({ title, subtitle?, kind? })` and the controller queues it,
 * flies it in, holds it, and fades it out on an injected clock — one banner at a
 * time — exposing the current banner plus its phase (in/hold/out) and `progress`
 * `0..1` for a renderer to animate opacity/scale/translate. Nothing here is
 * genre-specific: `kind` is a free label the game owns and styles, and all timings
 * are parameters. Call `advance()` each frame; `current()` returns the pooled view
 * to draw; `snapshot`/`restore` round-trips the queue through a save.
 *
 * @capability objective-banner serializable, clock-driven stage/objective banner queue — flies a big transient centered title + optional subtitle in, holds, and fades out one at a time, with phase + progress for animation, free-string kinds the game styles, and snapshot/restore
 */
export function createObjectiveBanner(options: ObjectiveBannerOptions = {}): ObjectiveBannerController {
  const now = options.now ?? Date.now;
  const defaultIn = Math.max(0, options.inMs ?? 350);
  const defaultHold = Math.max(0, options.holdMs ?? 2000);
  const defaultOut = Math.max(0, options.outMs ?? 500);

  // queue[0] is the active banner; the rest wait their turn.
  const queue: QueuedBanner[] = [];
  const listeners = new Set<() => void>();
  // Pooled view — reused across current() calls, never per-frame allocated.
  const view: ObjectiveBannerView = { id: 0, title: "", subtitle: undefined, kind: "", phase: "in", progress: 0 };

  let nextId = 1;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  /** Total lifetime of a banner in ms. */
  function totalMs(banner: QueuedBanner): number {
    return banner.inMs + banner.holdMs + banner.outMs;
  }

  /**
   * Activate/chain the head, reap any that have fully expired at `t`, and cache
   * the active banner's phase + progress. Deterministic regardless of how often
   * it is called: a finished banner hands its scheduled end time to the next.
   */
  function recompute(t: number): void {
    while (queue.length > 0) {
      const head = queue[0]!;
      if (head.startAt === null) head.startAt = t;
      const total = totalMs(head);
      const elapsed = t - head.startAt;
      if (total <= 0 || elapsed >= total) {
        queue.shift();
        const next = queue[0];
        if (next !== undefined && next.startAt === null) next.startAt = head.startAt + total;
        continue;
      }
      if (elapsed < head.inMs) {
        head.phase = "in";
        head.progress = head.inMs > 0 ? clamp01(elapsed / head.inMs) : 1;
      } else if (elapsed < head.inMs + head.holdMs) {
        head.phase = "hold";
        head.progress = head.holdMs > 0 ? clamp01((elapsed - head.inMs) / head.holdMs) : 1;
      } else {
        head.phase = "out";
        head.progress = head.outMs > 0 ? clamp01((elapsed - head.inMs - head.holdMs) / head.outMs) : 1;
      }
      return;
    }
  }

  return {
    announce(announcement) {
      const id = nextId++;
      queue.push({
        id,
        title: announcement.title,
        subtitle: announcement.subtitle,
        kind: announcement.kind ?? "default",
        inMs: Math.max(0, announcement.inMs ?? defaultIn),
        holdMs: Math.max(0, announcement.holdMs ?? defaultHold),
        outMs: Math.max(0, announcement.outMs ?? defaultOut),
        startAt: null,
        phase: "in",
        progress: 0,
      });
      recompute(now());
      notify();
      return id;
    },
    advance(nowMs) {
      recompute(nowMs ?? now());
      notify();
    },
    current() {
      const head = queue[0];
      if (head === undefined || head.startAt === null) return null;
      view.id = head.id;
      view.title = head.title;
      view.subtitle = head.subtitle;
      view.kind = head.kind;
      view.phase = head.phase;
      view.progress = head.progress;
      return view;
    },
    skip() {
      if (queue.length === 0) return;
      queue.shift();
      recompute(now());
      notify();
    },
    clear() {
      if (queue.length === 0) return;
      queue.length = 0;
      notify();
    },
    pending() {
      return queue.length === 0 ? 0 : queue.length - 1;
    },
    isActive() {
      const head = queue[0];
      return head !== undefined && head.startAt !== null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return {
        now: now(),
        nextId,
        queue: queue.map((banner) => ({
          id: banner.id,
          title: banner.title,
          subtitle: banner.subtitle,
          kind: banner.kind,
          inMs: banner.inMs,
          holdMs: banner.holdMs,
          outMs: banner.outMs,
          startAt: banner.startAt,
        })),
      };
    },
    restore(snapshot) {
      queue.length = 0;
      nextId = snapshot.nextId;
      const t = now();
      const drift = t - snapshot.now;
      for (const stored of snapshot.queue) {
        queue.push({
          ...stored,
          startAt: stored.startAt === null ? null : stored.startAt + drift,
          phase: "in",
          progress: 0,
        });
      }
      recompute(t);
      notify();
    },
  };
}
