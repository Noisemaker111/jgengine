import type { DevtoolsLogLevel } from "./types";

/** Default measured window for the log ring; older lines are evicted, never grown. */
export const LOG_BUS_CAPACITY = 200;
/** Warnings and errors also land in their own ring, so an error is never pushed out by info traffic. */
export const LOG_BUS_SEVERE_CAPACITY = 64;
/** Longest kept message; a longer one is cut once, at write time. */
export const LOG_BUS_MESSAGE_MAX = 400;

/** One captured line: when, how bad, which system said it, and what it said. */
export interface LogBusEntry {
  at: number;
  level: DevtoolsLogLevel;
  /** Owning system tag, e.g. `needs`, `nav`, `render/culling`, `console`. */
  system: string;
  message: string;
}

/** Lifetime totals per level, plus how many lines the ring dropped. */
export interface LogBusCounts {
  log: number;
  info: number;
  warn: number;
  error: number;
}

/** Read-out of the log bus: newest-window entries, the warning/error ring, totals, and evictions. */
export interface LogBusSnapshot {
  entries: readonly LogBusEntry[];
  severe: readonly LogBusEntry[];
  counts: LogBusCounts;
  dropped: number;
  capacity: number;
}

/** Tunables for the log ring: capacity, the severity ring's capacity, and the clock. */
export interface LogBusOptions {
  capacity?: number;
  severeCapacity?: number;
  now?: () => number;
}

/**
 * A fixed-capacity ring of log lines tagged by owning system. `write` reuses a
 * preallocated slot — no array growth, no splice, no per-write object — so a hot
 * path can call it and only the message string (already built by the caller)
 * costs an allocation.
 *
 * @capability devtools-log-bus a bounded, per-system-tagged log ring a system writes to and a report reads
 */
export interface LogBus {
  write(level: DevtoolsLogLevel, system: string, message: string): void;
  /** Oldest-to-newest entries currently held. Allocates once per read. */
  list(): readonly LogBusEntry[];
  /** Warnings and errors only, oldest first. */
  severe(): readonly LogBusEntry[];
  counts(): LogBusCounts;
  dropped(): number;
  snapshot(): LogBusSnapshot;
  /** Empty every ring and counter, keeping the allocation. */
  reset(): void;
}

function blankEntry(): LogBusEntry {
  return { at: 0, level: "log", system: "", message: "" };
}

interface Ring {
  slots: LogBusEntry[];
  head: number;
  size: number;
  total: number;
}

function createRing(capacity: number): Ring {
  const slots = new Array<LogBusEntry>(capacity);
  for (let index = 0; index < capacity; index += 1) slots[index] = blankEntry();
  return { slots, head: 0, size: 0, total: 0 };
}

function ringPush(ring: Ring, at: number, level: DevtoolsLogLevel, system: string, message: string): void {
  const slot = ring.slots[ring.head]!;
  slot.at = at;
  slot.level = level;
  slot.system = system;
  slot.message = message.length > LOG_BUS_MESSAGE_MAX ? `${message.slice(0, LOG_BUS_MESSAGE_MAX)}…` : message;
  ring.head = (ring.head + 1) % ring.slots.length;
  if (ring.size < ring.slots.length) ring.size += 1;
  ring.total += 1;
}

function ringRead(ring: Ring): LogBusEntry[] {
  const out = new Array<LogBusEntry>(ring.size);
  const start = (ring.head - ring.size + ring.slots.length) % ring.slots.length;
  for (let offset = 0; offset < ring.size; offset += 1) {
    const slot = ring.slots[(start + offset) % ring.slots.length]!;
    out[offset] = { at: slot.at, level: slot.level, system: slot.system, message: slot.message };
  }
  return out;
}

/** Create the bounded log bus the devtools log facade writes through. */
export function createLogBus(options: LogBusOptions = {}): LogBus {
  const capacity = Math.max(1, Math.floor(options.capacity ?? LOG_BUS_CAPACITY));
  const severeCapacity = Math.max(1, Math.floor(options.severeCapacity ?? LOG_BUS_SEVERE_CAPACITY));
  const now = options.now ?? Date.now;
  const ring = createRing(capacity);
  const severeRing = createRing(Math.min(severeCapacity, capacity));
  const totals: LogBusCounts = { log: 0, info: 0, warn: 0, error: 0 };

  return {
    write(level, system, message) {
      const at = now();
      const text = message.length > LOG_BUS_MESSAGE_MAX ? `${message.slice(0, LOG_BUS_MESSAGE_MAX)}…` : message;
      ringPush(ring, at, level, system, text);
      totals[level] += 1;
      if (level === "warn" || level === "error") ringPush(severeRing, at, level, system, text);
    },
    list: () => ringRead(ring),
    severe: () => ringRead(severeRing),
    counts: () => ({ ...totals }),
    dropped: () => Math.max(0, ring.total - ring.size),
    snapshot() {
      return {
        entries: ringRead(ring),
        severe: ringRead(severeRing),
        counts: { ...totals },
        dropped: Math.max(0, ring.total - ring.size),
        capacity: ring.slots.length,
      };
    },
    reset() {
      ring.head = 0;
      ring.size = 0;
      ring.total = 0;
      severeRing.head = 0;
      severeRing.size = 0;
      severeRing.total = 0;
      totals.log = 0;
      totals.info = 0;
      totals.warn = 0;
      totals.error = 0;
    },
  };
}
