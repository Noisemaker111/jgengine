/** One recent engine or game event kept for a crash report. */
export interface CrashEvent {
  at: number;
  name: string;
}

export interface CrashReport {
  id: string;
  at: number;
  build: string;
  game: string;
  tier: string;
  phase: string;
  message: string;
  stack?: string;
  componentStack?: string;
  events: readonly CrashEvent[];
}

export interface CrashReporter {
  report(report: CrashReport): void | Promise<void>;
}

export interface CrashSeamOptions {
  game: string;
  build?: string;
  tier?: () => string;
  reporter?: CrashReporter | undefined;
  eventLimit?: number;
  /** An identical phase and message inside this window is dropped. Default 5000 ms. */
  duplicateWindowMs?: number;
  maxReports?: number;
  now?: () => number;
  /** Unique id source; inject a deterministic one in tests. */
  newId?: () => string;
  /** Called with every report that was built and not dropped, e.g. to emit a telemetry crash event. */
  onReport?: (report: CrashReport) => void;
}

export interface CrashSeamState {
  events: readonly CrashEvent[];
  sent: number;
  dropped: number;
}

export interface CrashSeam {
  /** Remember one event for the next report; the ring is bounded. */
  note(name: string): void;
  capture(error: unknown, phase: string, componentStack?: string): CrashReport | null;
  guard<T>(phase: string, fn: () => T): T | undefined;
  guardAsync<T>(phase: string, fn: () => Promise<T>): Promise<T | undefined>;
  snapshot(): CrashSeamState;
  reset(): void;
}

const MESSAGE_MAX = 500;
const STACK_MAX = 4_000;
const EVENT_NAME_MAX = 80;

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

export interface CrashEventTarget {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

function fieldOf(event: Event, key: "error" | "reason" | "message"): unknown {
  return key in event ? (event as unknown as Record<string, unknown>)[key] : undefined; // type-escape: ErrorEvent and PromiseRejectionEvent are not in every lib
}

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
