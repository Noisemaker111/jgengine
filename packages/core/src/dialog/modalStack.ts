/**
 * Headless, serializable model for a stack of modal dialogs — the data layer behind a pause menu, a
 * "quit to menu?" confirmation, a level-up popup, or any blocking overlay a game raises over its
 * scene. It carries an ordered stack of opaque {@link ModalRecord}s (push to open, pop/resolve to
 * close) and nothing about how they look: the model NEVER interprets a record's `kind` or a
 * resolution's `result` string — those are free-form game vocabulary the UI chrome in
 * `@jgengine/ui` renders. Observable ({@link ModalStack.subscribe}) and round-trips through a save
 * ({@link ModalStack.snapshot}/{@link ModalStack.restore}). An injected clock powers optional
 * per-modal auto-dismiss timers; leave those unset and the model is pure and clockless.
 */

/**
 * One entry on the modal stack — a caller-authored, opaque record the game renders however it likes.
 * `kind` and `payload` are never inspected by the model, so a confirm dialog, a pause menu, and a
 * bespoke reward popup all share this shape.
 */
export interface ModalRecord {
  /** Stable id, unique within the stack. Auto-assigned (`modal-<n>`) by {@link ModalStack.push} when omitted. */
  id: string;
  /** Free-form game style tag the renderer switches on (e.g. `"confirm"`, `"pause"`). Never interpreted here. */
  kind: string;
  payload?: unknown;
  /**
   * Auto-dismiss the modal this many ms after it opens, resolved by {@link ModalStack.tick} against
   * the injected clock. Omit for a modal that only closes on an explicit pop/resolve.
   */
  timeoutMs?: number;
  timeoutResult?: string;
}

export type ModalInput = Omit<ModalRecord, "id"> & { id?: string };

export interface ModalResolution {
  id: string;
  kind: string;
  /** Free-form outcome — e.g. {@link MODAL_CONFIRM}, {@link MODAL_CANCEL}, or a game-specific choice. Never interpreted here. */
  result: string;
  /** The resolved record's payload, echoed back so a handler needn't re-look-it-up. */
  payload?: unknown;
  /** Clock time (ms) the modal resolved, from the injected clock. */
  at: number;
}

export interface ModalStackEntry {
  record: ModalRecord;
  /** Clock time (ms) this modal was pushed — the base for its auto-dismiss timer. */
  openedAt: number;
}

export interface ModalStackSnapshot {
  entries: readonly ModalStackEntry[];
  seq: number;
}

export interface ModalStackOptions {
  /** Injected clock (ms) for timestamps and auto-dismiss timers. Default `Date.now`. */
  now?: () => number;
  initial?: readonly ModalInput[];
  onOpen?: (record: ModalRecord) => void;
  onResolve?: (resolution: ModalResolution) => void;
}

export const MODAL_CONFIRM = "confirm";
export const MODAL_CANCEL = "cancel";

export interface ModalStack {
  push(modal: ModalInput): ModalRecord;
  replace(modal: ModalInput): ModalRecord;
  pop(): ModalRecord | null;
  resolve(result: string, options?: { id?: string; payload?: unknown }): ModalResolution | null;
  top(): ModalRecord | null;
  isOpen(): boolean;
  has(id: string): boolean;
  depth(): number;
  stack(): readonly ModalRecord[];
  /** The most recent resolution (survives the modal being closed), or `null` if none yet. */
  lastResolution(): ModalResolution | null;
  clear(): void;
  /**
   * Resolve every modal whose {@link ModalRecord.timeoutMs} has elapsed against `now` (default: the
   * injected clock), top-first, using each record's `timeoutResult`. Call it from the game loop when
   * any modal uses a timer. Returns the resolutions fired (possibly empty).
   */
  tick(now?: number): ModalResolution[];
  /**
   * Milliseconds until the given modal (default: the top) auto-dismisses, or `null` when it has no
   * timer / is absent. Clamped at 0 once elapsed — feed a countdown ring off it.
   */
  timeRemaining(id?: string): number | null;
  subscribe(listener: () => void): () => void;
  snapshot(): ModalStackSnapshot;
  restore(snapshot: ModalStackSnapshot): void;
}

/**
 * A stack of modal dialogs: push opaque records to open blocking overlays (a pause menu, a confirm
 * prompt, a reward popup), pop or resolve them with a free-form result to close, and query the top /
 * open / depth to gate game input. The model is deliberately vocabulary-free — it never reads a
 * record's `kind` or a resolution's `result`, so a game owns every dialog style — and fully
 * serializable, with an optional injected clock driving per-modal auto-dismiss. A UI host renders
 * `top()`; `subscribe` re-renders it, `snapshot`/`restore` round-trip it through a save.
 *
 * @capability modal-stack serializable, observable stack of opaque modal/dialog records — push/pop/resolve blocking overlays (pause menu, confirm dialog) with optional auto-dismiss; never interprets kind or result
 */
export function createModalStack(options: ModalStackOptions = {}): ModalStack {
  const now = options.now ?? Date.now;
  const onOpen = options.onOpen;
  const onResolve = options.onResolve;
  const listeners = new Set<() => void>();
  let entries: ModalStackEntry[] = [];
  let seq = 0;
  let last: ModalResolution | null = null;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function nextId(): string {
    return `modal-${seq++}`;
  }

  function toRecord(input: ModalInput): ModalRecord {
    const record: ModalRecord = { id: input.id ?? nextId(), kind: input.kind };
    if (input.payload !== undefined) record.payload = input.payload;
    if (input.timeoutMs !== undefined) record.timeoutMs = input.timeoutMs;
    if (input.timeoutResult !== undefined) record.timeoutResult = input.timeoutResult;
    return record;
  }

  /** @internal Remove the entry at `index` and produce+record its resolution. Does not notify. */
  function resolveAt(index: number, result: string, payload?: unknown, at: number = now()): ModalResolution {
    const [entry] = entries.splice(index, 1);
    const record = entry!.record;
    const resolution: ModalResolution = {
      id: record.id,
      kind: record.kind,
      result,
      at,
    };
    const echo = payload !== undefined ? payload : record.payload;
    if (echo !== undefined) resolution.payload = echo;
    last = resolution;
    onResolve?.(resolution);
    return resolution;
  }

  function push(input: ModalInput): ModalRecord {
    const record = toRecord(input);
    entries.push({ record, openedAt: now() });
    onOpen?.(record);
    notify();
    return record;
  }

  for (const input of options.initial ?? []) push(input);

  return {
    push,
    replace(input) {
      if (entries.length > 0) resolveAt(entries.length - 1, MODAL_CANCEL);
      return push(input);
    },
    pop() {
      if (entries.length === 0) return null;
      const record = entries[entries.length - 1]!.record;
      resolveAt(entries.length - 1, MODAL_CANCEL);
      notify();
      return record;
    },
    resolve(result, opts) {
      const index =
        opts?.id !== undefined
          ? entries.findIndex((entry) => entry.record.id === opts.id)
          : entries.length - 1;
      if (index < 0) return null;
      const resolution = resolveAt(index, result, opts?.payload);
      notify();
      return resolution;
    },
    top() {
      return entries.length === 0 ? null : entries[entries.length - 1]!.record;
    },
    isOpen() {
      return entries.length > 0;
    },
    has(id) {
      return entries.some((entry) => entry.record.id === id);
    },
    depth() {
      return entries.length;
    },
    stack() {
      return entries.map((entry) => entry.record);
    },
    lastResolution() {
      return last;
    },
    clear() {
      if (entries.length === 0) return;
      while (entries.length > 0) resolveAt(entries.length - 1, MODAL_CANCEL);
      notify();
    },
    tick(nowOverride) {
      const at = nowOverride ?? now();
      const fired: ModalResolution[] = [];
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const entry = entries[i]!;
        const timeout = entry.record.timeoutMs;
        if (timeout !== undefined && at - entry.openedAt >= timeout) {
          fired.push(resolveAt(i, entry.record.timeoutResult ?? MODAL_CANCEL, undefined, at));
        }
      }
      if (fired.length > 0) notify();
      return fired;
    },
    timeRemaining(id) {
      const entry =
        id !== undefined
          ? entries.find((e) => e.record.id === id)
          : entries[entries.length - 1];
      if (entry === undefined || entry.record.timeoutMs === undefined) return null;
      return Math.max(0, entry.openedAt + entry.record.timeoutMs - now());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return {
        entries: entries.map((entry) => ({ record: { ...entry.record }, openedAt: entry.openedAt })),
        seq,
      };
    },
    restore(snapshot) {
      entries = snapshot.entries.map((entry) => ({ record: { ...entry.record }, openedAt: entry.openedAt }));
      seq = snapshot.seq;
      last = null;
      notify();
    },
  };
}
