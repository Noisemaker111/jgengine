/** One recent engine or game event kept for a crash report. */
export interface CrashEvent {
  at: number;
  name: string;
}

/** What the engine hands a game's reporter. It carries no personal data: text is scrubbed of emails, URL queries and home paths. */
export interface CrashReport {
  id: string;
  at: number;
  build: string;
  game: string;
  tier: string;
  /** Where it was caught: `ui-render`, `tick`, `init`, `window-error`, `unhandled-rejection`, or a game's own label. */
  phase: string;
  message: string;
  stack?: string;
  componentStack?: string;
  /** The last N events, oldest first. */
  events: readonly CrashEvent[];
}

/** The injected receiver. A game wires its own (Sentry, a fetch, a file); the engine ships no vendor SDK. */
export interface CrashReporter {
  report(report: CrashReport): void | Promise<void>;
}

/** Tunables and injected dependencies for {@link createCrashSeam}. */
export interface CrashSeamOptions {
  game: string;
  build?: string;
  /** Current graphics tier, read when a report is built. */
  tier?: () => string;
  /** Off when absent: reports are still built and returned, nothing is sent. */
  reporter?: CrashReporter | undefined;
  /** Events kept per report. Default 20. */
  eventLimit?: number;
  /** An identical phase and message inside this window is dropped. Default 5000 ms. */
  duplicateWindowMs?: number;
  /** Reports sent per session; later ones are dropped. Default 20. */
  maxReports?: number;
  now?: () => number;
  /** Unique id source; inject a deterministic one in tests. */
  newId?: () => string;
  /** Called with every report that was built and not dropped, e.g. to emit a telemetry crash event. */
  onReport?: (report: CrashReport) => void;
}

/** Serializable seam state. */
export interface CrashSeamState {
  events: readonly CrashEvent[];
  sent: number;
  dropped: number;
}

/** Where a caught error goes. */
export interface CrashSeam {
  /** Remember one event for the next report; the ring is bounded. */
  note(name: string): void;
  /** Build a report, hand it to the reporter and return it; `null` when dropped as a duplicate or over the limit. */
  capture(error: unknown, phase: string, componentStack?: string): CrashReport | null;
  /** Run `fn`; an error is captured under `phase` and `undefined` returned. */
  guard<T>(phase: string, fn: () => T): T | undefined;
  /** Await `fn`; a rejection is captured under `phase` and `undefined` returned. */
  guardAsync<T>(phase: string, fn: () => Promise<T>): Promise<T | undefined>;
  snapshot(): CrashSeamState;
  reset(): void;
}

const MESSAGE_MAX = 500;
const STACK_MAX = 4_000;
const EVENT_NAME_MAX = 80;

/** Strip what could identify a person from error text: emails, URL queries and fragments, home directories. */
export function scrubCrashText(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<email>")
    .replace(/(https?:\/\/[^\s?#)'"]+)[?#][^\s)'"]*/g, "$1")
    .replace(/\/(?:home|Users)\/[^/\s:)]+/g, "/<home>")
    .replace(/[A-Za-z]:\\Users\\[^\\\s:)]+/g, "C:\\Users\\<home>");
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return error.stack === undefined
      ? { message: error.message }
      : { message: error.message, stack: error.stack };
  }
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error) ?? String(error) };
  } catch {
    return { message: String(error) };
  }
}

let idCounter = 0;
function defaultId(at: number): string {
  idCounter += 1;
  return `${at.toString(36)}-${idCounter.toString(36)}`;
}

/** The one place the engine catches render, tick and async errors and hands a structured, scrubbed report to the game's reporter. */
export function createCrashSeam(options: CrashSeamOptions): CrashSeam {
  const eventLimit = Math.max(0, Math.floor(options.eventLimit ?? 20));
  const duplicateWindow = options.duplicateWindowMs ?? 5_000;
  const maxReports = options.maxReports ?? 20;
  const now = options.now ?? (() => Date.now());
  const newId = options.newId ?? (() => defaultId(now()));
  const ring: CrashEvent[] = [];
  const lastSeen = new Map<string, number>();
  let sent = 0;
  let dropped = 0;

  function capture(error: unknown, phase: string, componentStack?: string): CrashReport | null {
    const at = now();
    const { message, stack } = describe(error);
    const key = `${phase}\n${message}`;
    const previous = lastSeen.get(key);
    if (sent >= maxReports || (previous !== undefined && at - previous < duplicateWindow)) {
      dropped += 1;
      return null;
    }
    lastSeen.set(key, at);
    if (lastSeen.size > 64) {
      for (const oldest of lastSeen.keys()) {
        lastSeen.delete(oldest);
        break;
      }
    }
    const report: CrashReport = {
      id: newId(),
      at,
      build: options.build ?? "unknown",
      game: options.game,
      tier: options.tier?.() ?? "unknown",
      phase,
      message: clip(scrubCrashText(message), MESSAGE_MAX),
      events: ring.map((event) => ({ ...event })),
      ...(stack === undefined ? {} : { stack: clip(scrubCrashText(stack), STACK_MAX) }),
      ...(componentStack === undefined ? {} : { componentStack: clip(scrubCrashText(componentStack), STACK_MAX) }),
    };
    sent += 1;
    try {
      options.onReport?.(report);
    } catch {
      /* a failing observer must not hide the crash */
    }
    try {
      const result = options.reporter?.report(report);
      if (result instanceof Promise) result.catch(() => {});
    } catch {
      /* a failing reporter must not raise a second crash */
    }
    return report;
  }

  return {
    note(name) {
      if (eventLimit === 0) return;
      if (ring.length >= eventLimit) ring.shift();
      ring.push({ at: now(), name: clip(scrubCrashText(name), EVENT_NAME_MAX) });
    },
    capture,
    guard(phase, fn) {
      try {
        return fn();
      } catch (error) {
        capture(error, phase);
        return undefined;
      }
    },
    async guardAsync(phase, fn) {
      try {
        return await fn();
      } catch (error) {
        capture(error, phase);
        return undefined;
      }
    },
    snapshot: () => ({ events: ring.map((event) => ({ ...event })), sent, dropped }),
    reset() {
      ring.length = 0;
      lastSeen.clear();
      sent = 0;
      dropped = 0;
    },
  };
}

/** The slice of `window` the global handlers need. */
export interface CrashEventTarget {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

function fieldOf(event: Event, key: "error" | "reason" | "message"): unknown {
  return key in event ? (event as unknown as Record<string, unknown>)[key] : undefined; // type-escape: ErrorEvent and PromiseRejectionEvent are not in every lib
}

/** Route uncaught script errors and unhandled promise rejections into the seam; returns the uninstall function. */
export function installCrashHandlers(seam: CrashSeam, target: CrashEventTarget): () => void {
  const onError = (event: Event) => {
    seam.capture(fieldOf(event, "error") ?? fieldOf(event, "message") ?? "Script error", "window-error");
  };
  const onRejection = (event: Event) => {
    seam.capture(fieldOf(event, "reason") ?? "Unhandled rejection", "unhandled-rejection");
  };
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}
