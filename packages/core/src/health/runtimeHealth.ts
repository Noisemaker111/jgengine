import type { AutoQualityConfig } from "./autoQuality";
import { createCrashSeam, type CrashReporter, type CrashSeam } from "./crashSeam";
import { createFrameTimeWindow } from "./frameTimeWindow";
import { createTelemetry, type Telemetry, type TelemetrySink } from "./telemetrySink";

/** What a game supplies to turn on crash reports, telemetry and auto quality. Every part is off unless set. */
export interface GameHealthConfig {
  /** Build label stamped on every report and session event, e.g. a commit or version. */
  build?: string;
  /** Receives each crash report. */
  reporter?: CrashReporter;
  /** Receives batched health events. */
  telemetry?: { sink: TelemetrySink; batchSize?: number; maxQueued?: number };
  /** Events kept per crash report. Default 20. */
  eventLimit?: number;
  /** Ms between frame-time percentile events. Default 30000. */
  percentilesEveryMs?: number;
  /** Frames per percentile event. Default 600. */
  percentileWindowFrames?: number;
  /** Pick the graphics tier from measured frame time; the player's own choice and every effect toggle win. */
  autoQuality?: AutoQualityConfig;
}

/** The running health parts for one session. */
export interface RuntimeHealth {
  crash: CrashSeam;
  telemetry: Telemetry;
  /** Feed one frame's duration (ms); emits a percentile event each interval. */
  onFrame(frameMs: number): void;
  /** Record a tier change as an event and a telemetry record. */
  tierChanged(from: string, to: string, reason: "auto" | "player"): void;
  /** Record a named load duration (ms). */
  loaded(name: string, ms: number): void;
}

/** Compose the crash seam and telemetry queue a shell session uses, with the injected clock and tier source. */
export function createRuntimeHealth(args: {
  game: string;
  config: GameHealthConfig;
  tier: () => string;
  now?: () => number;
}): RuntimeHealth {
  const { game, config, tier } = args;
  const now = args.now ?? (() => Date.now());
  const telemetry = createTelemetry({ ...config.telemetry, now });
  const crash = createCrashSeam({
    game,
    tier,
    now,
    ...(config.build === undefined ? {} : { build: config.build }),
    ...(config.reporter === undefined ? {} : { reporter: config.reporter }),
    ...(config.eventLimit === undefined ? {} : { eventLimit: config.eventLimit }),
    onReport: (report) => telemetry.crash(report.id, report.phase),
  });
  const window = createFrameTimeWindow(config.percentileWindowFrames ?? 600);
  const every = config.percentilesEveryMs ?? 30_000;
  let lastEmit = now();
  telemetry.sessionStart(game, config.build ?? "unknown", tier());
  return {
    crash,
    telemetry,
    onFrame(frameMs) {
      if (!telemetry.enabled) return;
      window.push(frameMs);
      const at = now();
      if (at - lastEmit < every || window.count() === 0) return;
      lastEmit = at;
      telemetry.framePercentiles(tier(), window.percentiles());
      window.reset();
    },
    tierChanged(from, to, reason) {
      crash.note(`tier ${from} -> ${to} (${reason})`);
      telemetry.tierChange(from, to, reason);
    },
    loaded(name, ms) {
      crash.note(`loaded ${name}`);
      telemetry.load(name, ms);
    },
  };
}
