import type { ChangeSignal } from "../store/changeSignal";
import type { Devtools, DevtoolsLogEntry, DevtoolsLogLevel, LatencyStats } from "./types";

const LATENCY_CAPACITY = 120;
const LOG_CAPACITY = 200;
const LOG_MESSAGE_MAX = 400;

/** @internal */
export function formatLogArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

/** Format an array of console arguments into a single truncated log message string. */
export function formatLogMessage(args: readonly unknown[]): string {
  const message = args.map(formatLogArg).join(" ");
  return message.length > LOG_MESSAGE_MAX ? `${message.slice(0, LOG_MESSAGE_MAX)}…` : message;
}

/** Logs subsystem exposing the log-capture and latency-tracking facades. */
export interface LogsModule {
  logs: Devtools["logs"];
  latency: Devtools["latency"];
}

/** Create the logs subsystem that buffers captured console output and records latency samples. */
export const createLogsModule = (deps: { signal: ChangeSignal }): LogsModule => {
  const { signal } = deps;

  const logEntries: DevtoolsLogEntry[] = [];
  let consoleCaptured = false;

  const latencySamples: number[] = [];

  const pushLog = (level: DevtoolsLogLevel, message: string): void => {
    logEntries.push({ at: Date.now(), level, message });
    if (logEntries.length > LOG_CAPACITY) logEntries.splice(0, logEntries.length - LOG_CAPACITY);
  };

  const latencyStats = (): LatencyStats | null => {
    if (latencySamples.length === 0) return null;
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    let sum = 0;
    for (const ms of latencySamples) {
      min = Math.min(min, ms);
      max = Math.max(max, ms);
      sum += ms;
    }
    return {
      lastMs: latencySamples[latencySamples.length - 1]!,
      avgMs: sum / latencySamples.length,
      minMs: min,
      maxMs: max,
      samples: latencySamples.length,
    };
  };

  return {
    logs: {
      push: pushLog,
      captureConsole() {
        if (consoleCaptured) return;
        const globalConsole = (globalThis as { console?: Console }).console;
        if (globalConsole === undefined) return;
        consoleCaptured = true;
        const levels: DevtoolsLogLevel[] = ["log", "info", "warn", "error"];
        for (const level of levels) {
          const original = globalConsole[level].bind(globalConsole);
          globalConsole[level] = (...args: unknown[]) => {
            pushLog(level, formatLogMessage(args));
            original(...args);
          };
        }
      },
      list: () => logEntries,
      clear() {
        logEntries.length = 0;
        signal.notify();
      },
    },
    latency: {
      record(ms) {
        latencySamples.push(ms);
        if (latencySamples.length > LATENCY_CAPACITY) latencySamples.splice(0, latencySamples.length - LATENCY_CAPACITY);
      },
      stats: latencyStats,
    },
  };
};
