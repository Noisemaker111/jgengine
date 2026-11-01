import { describe, expect, test } from "bun:test";

import { createFrameTimeWindow } from "./frameTimeWindow";
import { createRuntimeHealth } from "./runtimeHealth";
import { createTelemetry, type TelemetryEvent } from "./telemetrySink";

describe("telemetry", () => {
  test("is off with no sink: nothing queues", () => {
    const telemetry = createTelemetry();
    telemetry.load("scene", 12);
    telemetry.flush();
    expect(telemetry.enabled).toBe(false);
    expect(telemetry.snapshot()).toEqual({ enabled: false, queued: 0, dropped: 0, sent: 0 });
  });

  test("batches events and flushes the rest", () => {
    const batches: (readonly TelemetryEvent[])[] = [];
    const telemetry = createTelemetry({ sink: { send: (batch) => void batches.push(batch) }, batchSize: 3, now: () => 5 });
    for (let i = 0; i < 7; i += 1) telemetry.load(`l${i}`, i);
    expect(batches.map((batch) => batch.length)).toEqual([3, 3]);
    telemetry.flush();
    expect(batches.map((batch) => batch.length)).toEqual([3, 3, 1]);
    expect(telemetry.snapshot().sent).toBe(7);
  });

  test("is bounded: a sink that never answers loses the oldest, not memory", () => {
    const batches: (readonly TelemetryEvent[])[] = [];
    const telemetry = createTelemetry({ sink: { send: (batch) => { batches.push(batch); return new Promise<void>(() => {}); } }, batchSize: 2, maxQueued: 5 });
    for (let i = 0; i < 12; i += 1) telemetry.crash(`c${i}`, "tick");
    expect(batches).toHaveLength(1);
    expect(telemetry.snapshot()).toMatchObject({ queued: 5, dropped: 5 });
    telemetry.flush();
    expect(telemetry.snapshot().queued).toBe(0);
  });

  test("a throwing sink does not raise", () => {
    const telemetry = createTelemetry({ sink: { send: () => { throw new Error("offline"); } }, batchSize: 1 });
    telemetry.crash("c", "tick");
    expect(telemetry.snapshot().sent).toBe(1);
  });
});

describe("frame time window", () => {
  test("reads percentiles over the last N frames and ignores bad values", () => {
    const window = createFrameTimeWindow(100);
    for (let i = 1; i <= 100; i += 1) window.push(i);
    window.push(Number.NaN);
    window.push(0);
    expect(window.full()).toBe(true);
    expect(window.percentiles()).toMatchObject({ frames: 100, p50: 51, p95: 96, p99: 100, maxMs: 100 });
    for (let i = 0; i < 100; i += 1) window.push(10);
    expect(window.percentiles().maxMs).toBe(10);
    const frames = window.snapshot();
    expect(frames).toHaveLength(100);
    window.reset();
    expect(window.percentiles()).toMatchObject({ frames: 0, p95: 0 });
    window.restore(frames);
    expect(window.percentiles()).toMatchObject({ frames: 100, p95: 10 });
  });
});

describe("runtime health", () => {
  test("emits session start, percentiles per interval, tier changes and crash ids", () => {
    const events: TelemetryEvent[] = [];
    let t = 0;
    const health = createRuntimeHealth({
      game: "demo",
      tier: () => "high",
      now: () => t,
      config: { build: "b1", telemetry: { sink: { send: (batch) => void events.push(...batch) }, batchSize: 1 }, percentilesEveryMs: 1000 },
    });
    for (let i = 0; i < 10; i += 1) {
      t += 100;
      health.onFrame(16);
    }
    health.tierChanged("high", "medium", "auto");
    health.loaded("scene", 420);
    health.crash.capture(new Error("x"), "tick");
    expect(events.map((event) => event.kind)).toEqual(["session_start", "frame_percentiles", "tier_change", "load", "crash"]);
    expect(events[0]).toMatchObject({ game: "demo", build: "b1", tier: "high" });
    const crash = health.crash.snapshot().events.map((event) => event.name);
    expect(crash).toEqual(["tier high -> medium (auto)", "loaded scene"]);
  });

  test("a game with no sink pays nothing for frames", () => {
    const health = createRuntimeHealth({ game: "demo", tier: () => "low", config: {} });
    for (let i = 0; i < 100; i += 1) health.onFrame(16);
    expect(health.telemetry.snapshot().queued).toBe(0);
  });
});
