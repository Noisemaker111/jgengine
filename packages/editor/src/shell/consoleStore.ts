/**
 * Bounded editor event log backing the Console dock tab. Only real editor events are recorded —
 * notifications, save/import/export results, RPC and agent errors — never fabricated runtime logs.
 */

/** Console entry severity, driving the filter chips and row tinting. */
export type ConsoleSeverity = "info" | "warning" | "error";

/** One recorded editor event. */
export interface ConsoleEntry {
  id: number;
  at: number;
  severity: ConsoleSeverity;
  /** Which editor subsystem produced the event (ui, save, import, agent, rpc). */
  source: string;
  message: string;
}

/** Subscribable, bounded editor event log. */
export interface EditorConsoleStore {
  getEntries(): readonly ConsoleEntry[];
  log(severity: ConsoleSeverity, source: string, message: string): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
  counts(): Record<ConsoleSeverity, number>;
}

/** Entries kept before the oldest are dropped. */
export const CONSOLE_CAPACITY = 500;

/** Creates the editor console store. `now` is injectable for tests. */
export function createEditorConsoleStore(now: () => number = () => Date.now()): EditorConsoleStore {
  let entries: ConsoleEntry[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    getEntries: () => entries,
    log(severity, source, message) {
      entries = [...entries, { id: nextId++, at: now(), severity, source, message }];
      if (entries.length > CONSOLE_CAPACITY) entries = entries.slice(entries.length - CONSOLE_CAPACITY);
      emit();
    },
    clear() {
      if (entries.length === 0) return;
      entries = [];
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    counts() {
      const counts: Record<ConsoleSeverity, number> = { info: 0, warning: 0, error: 0 };
      for (const entry of entries) counts[entry.severity] += 1;
      return counts;
    },
  };
}
