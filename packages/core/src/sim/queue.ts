import { devtools } from "../devtools/devtools";

/**
 * Seconds one guest occupies the head of the line before any boarding interval has been measured.
 * A bootstrap only: the estimate switches to the queue's own measured throughput as soon as two
 * boardings have been observed.
 */
export const DEFAULT_QUEUE_SEED_SERVICE_SECONDS = 8;

/** Boarding events the throughput window keeps. */
export const DEFAULT_QUEUE_WINDOW = 8;

/** One guest waiting their turn, and when they joined the line. */
export interface QueueEntry {
  readonly id: string;
  readonly joinedAt: number;
}

/** A wait estimate read off the queue's own measured throughput. */
export interface QueueWait {
  /** Guests in front of the reader (the whole line for a new arrival). */
  readonly ahead: number;
  /** Seconds that wait. */
  readonly seconds: number;
  /** Seconds one guest spends at the head; the seed until an interval has been measured. */
  readonly perGuestSeconds: number;
  /** Guests boarded per second over the measured window; `0` before any interval is observed. */
  readonly throughput: number;
  /** True while the estimate still rests on the seed rather than a measured interval. */
  readonly seeded: boolean;
}

/** Tunables for {@link createWaitQueue}, every one retunable through a restore. */
export interface WaitQueueOptions {
  /** Seconds per guest used before the queue has measured an interval. Default 8. */
  readonly seedServiceSeconds?: number;
  /** Boarding events the throughput window keeps. Default 8. */
  readonly window?: number;
  /** Register a devtools probe under this name so the perf overlay shows the live line. */
  readonly devtoolsName?: string;
}

/** Serializable line state: who is waiting, and the boardings the estimate is measured from. */
export interface WaitQueueSnapshot {
  entries: QueueEntry[];
  boards: { at: number; count: number }[];
  seedServiceSeconds: number;
  window: number;
}

/**
 * A real line: guests join the back, leave the head, and the wait a new arrival faces comes from how
 * fast this queue has actually been boarding — not from a configured constant. A broken ride stops
 * boarding, the line grows, and the estimate grows with it.
 */
export interface WaitQueue {
  /** Join the back of the line; false when the id is already waiting. */
  enqueue(id: string, now: number): boolean;
  /** Leave from anywhere in the line. */
  remove(id: string): boolean;
  has(id: string): boolean;
  /** 0-based place in line, or `-1` when not waiting. */
  positionOf(id: string): number;
  /** When the guest joined, or `null` when not waiting. */
  joinedAt(id: string): number | null;
  size(): number;
  headId(): string | null;
  /** Id at a 0-based index from the head, or `null` past the end. */
  at(index: number): string | null;
  /** Everyone in line, head first. Allocates — debug and tests. */
  ids(): readonly string[];
  /** Take the guest at the head, or `null` when the line is empty. */
  dequeue(): string | null;
  /** Record that `count` guests left the head at `now`; the throughput window reads these. */
  recordBoard(now: number, count: number): void;
  /**
   * Wait facing `id`, or the whole line when `id` is omitted or not waiting — what a guest joining
   * now would face.
   */
  wait(id?: string): QueueWait;
  snapshot(): WaitQueueSnapshot;
  restore(next: WaitQueueSnapshot): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

/**
 * Create a line whose wait estimate is derived from its own throughput. The queue owns the order and
 * the measurement; the ride owns how fast guests are taken off the head, so a slower cycle raises the
 * estimate without the queue being told a cycle time.
 *
 * `enqueue` is O(1) and `dequeue` amortized O(1) — a long line never re-indexes.
 *
 * @capability wait-queue a real line whose wait estimate comes from its own measured throughput
 */
export function createWaitQueue(options: WaitQueueOptions = {}): WaitQueue {
  let seedServiceSeconds = options.seedServiceSeconds ?? DEFAULT_QUEUE_SEED_SERVICE_SECONDS;
  let window = Math.max(2, Math.floor(options.window ?? DEFAULT_QUEUE_WINDOW));
  let entries: QueueEntry[] = [];
  let boards: { at: number; count: number }[] = [];
  let head = 0;
  const waiting = new Set<string>();

  const live = (): number => entries.length - head;

  function compact(): void {
    if (head > 32 && head * 2 >= entries.length) {
      entries = entries.slice(head);
      head = 0;
    }
  }

  /** Guests boarded per second, from consecutive boarding intervals; `0` until one is observed. */
  function throughput(): number {
    if (boards.length < 2) return 0;
    const first = boards[0]!;
    const last = boards[boards.length - 1]!;
    const span = last.at - first.at;
    if (!(span > 0)) return 0;
    let guests = 0;
    for (let index = 1; index < boards.length; index += 1) guests += boards[index]!.count;
    return guests / span;
  }

  function readWait(ahead: number): QueueWait {
    const rate = throughput();
    const perGuestSeconds = rate > 0 ? 1 / rate : Math.max(0, seedServiceSeconds);
    return {
      ahead,
      seconds: ahead * perGuestSeconds,
      perGuestSeconds,
      throughput: rate,
      seeded: rate <= 0,
    };
  }

  const unregister =
    options.devtoolsName === undefined ? null : devtools.probes.register(options.devtoolsName, () => probeLine());

  function probeLine(): string {
    const wait = readWait(live());
    return `${live()} in line · ${wait.seconds.toFixed(1)}s wait · ${wait.perGuestSeconds.toFixed(2)}s per guest${wait.seeded ? " (seed)" : ""}`;
  }

  function indexOf(id: string): number {
    for (let index = head; index < entries.length; index += 1) {
      if (entries[index]!.id === id) return index;
    }
    return -1;
  }

  function positionOfId(id: string): number {
    const at = indexOf(id);
    return at < 0 ? -1 : at - head;
  }

  return {
    enqueue(id, now) {
      if (waiting.has(id)) return false;
      entries.push({ id, joinedAt: Number.isFinite(now) ? now : 0 });
      waiting.add(id);
      return true;
    },
    remove(id) {
      if (!waiting.has(id)) return false;
      waiting.delete(id);
      const at = indexOf(id);
      if (at === head) {
        head += 1;
        compact();
        return true;
      }
      entries.splice(at, 1);
      return true;
    },
    has: (id) => waiting.has(id),
    positionOf: positionOfId,
    joinedAt(id) {
      if (!waiting.has(id)) return null;
      const at = indexOf(id);
      return at < 0 ? null : entries[at]!.joinedAt;
    },
    size: live,
    headId: () => entries[head]?.id ?? null,
    at(index) {
      const absolute = head + Math.floor(index);
      if (!(index >= 0) || absolute >= entries.length) return null;
      return entries[absolute]?.id ?? null;
    },
    ids() {
      const out: string[] = [];
      for (let index = head; index < entries.length; index += 1) out.push(entries[index]!.id);
      return out;
    },
    dequeue() {
      const entry = entries[head];
      if (entry === undefined) return null;
      head += 1;
      waiting.delete(entry.id);
      compact();
      return entry.id;
    },
    recordBoard(now, count) {
      const boarded = Math.floor(count);
      if (!(boarded > 0) || !Number.isFinite(now)) return;
      boards.push({ at: now, count: boarded });
      if (boards.length > window) boards = boards.slice(boards.length - window);
    },
    wait(id) {
      const position = id === undefined ? -1 : positionOfId(id);
      return readWait(position >= 0 ? position : live());
    },
    snapshot: () => ({
      entries: entries.slice(head).map((entry) => ({ id: entry.id, joinedAt: entry.joinedAt })),
      boards: boards.map((board) => ({ at: board.at, count: board.count })),
      seedServiceSeconds,
      window,
    }),
    restore(next) {
      entries = [];
      head = 0;
      waiting.clear();
      for (const entry of next.entries) {
        if (typeof entry?.id !== "string" || entry.id === "") continue;
        entries.push({ id: entry.id, joinedAt: Number.isFinite(entry.joinedAt) ? entry.joinedAt : 0 });
        waiting.add(entry.id);
      }
      boards = [];
      for (const board of next.boards) {
        if (!Number.isFinite(board?.at) || !(board?.count > 0)) continue;
        boards.push({ at: board.at, count: Math.floor(board.count) });
      }
      if (boards.length > window) boards = boards.slice(boards.length - window);
      if (Number.isFinite(next.seedServiceSeconds)) seedServiceSeconds = Math.max(0, next.seedServiceSeconds);
      if (Number.isFinite(next.window)) window = Math.max(2, Math.floor(next.window));
    },
    dispose() {
      unregister?.();
    },
  };
}
