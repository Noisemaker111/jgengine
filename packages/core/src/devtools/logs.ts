import type { ChangeSignal } from "../store/changeSignal";
import type { DevtoolsLogLevel, DevtoolsLogs, DevtoolsLatency, LatencyStats } from "./types";
import { createLogBus, LOG_BUS_MESSAGE_MAX, type LogBus } from "./logBus";

const LATENCY_CAPACITY = 120;

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
  return message.length > LOG_BUS_MESSAGE_MAX ? `${message.slice(0, LOG_BUS_MESSAGE_MAX)}…` : message;
}

/** Logs subsystem exposing the log-capture and latency-tracking facades. */
export interface LogsModule {
  logs: DevtoolsLogs;
  latency: DevtoolsLatency;
  /** The ring the facade writes through, for a reporter that needs the whole window at once. */
  bus: LogBus;
}

/** Create the logs subsystem that buffers captured console output and records latency samples. */
export const createLogsModule = (deps: { signal: ChangeSignal }): LogsModule => {
  const { signal } = deps;

  const bus = createLogBus();
  let consoleCaptured = false;

  const latencySamples: number[] = [];

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
      write(level: DevtoolsLogLevel, system: string, message: string) {
        bus.write(level, system, message);
      },
      push(level: DevtoolsLogLevel, message: string, system = "console") {
        bus.write(level, system, message);
      },
      captureConsole() {
        if (consoleCaptured) return;
        const globalConsole = (globalThis as { console?: Console }).console;
        if (globalConsole === undefined) return;
        consoleCaptured = true;
        const levels: DevtoolsLogLevel[] = ["log", "info", "warn", "error"];
        for (const level of levels) {
          const original = globalConsole[level].bind(globalConsole);
          globalConsole[level] = (...args: unknown[]) => {
            bus.write(level, "console", formatLogMessage(args));
            original(...args);
          };
        }
      },
      list: () => bus.list(),
      severe: () => bus.severe(),
      counts: () => bus.counts(),
      dropped: () => bus.dropped(),
      snapshot: () => bus.snapshot(),
      clear() {
        bus.reset();
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
    bus,
  };
};
