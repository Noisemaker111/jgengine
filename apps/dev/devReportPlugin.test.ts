import { describe, expect, test } from "bun:test";

import { createReportStore, handleReportPush } from "./devReportPlugin";
import type { PerfReport } from "../../packages/core/src/devtools/report";

/**
 * The report route is the whole read path for `bun run debug`: a pushed record must
 * come back as the record itself, an empty server must say so instead of hanging,
 * and a malformed push must not poison the store.
 */

function report(game = "harbor-heat"): PerfReport {
  return {
    game,
    gpu: "ANGLE (NVIDIA)",
    quality: "full",
    viewport: "1600x900",
    seconds: 4,
    at: 1,
    frame: { fps: 60, avgMs: 16.6, p95Ms: 18, maxMs: 24, samples: 240, longFrames: 0 },
    render: { draws: 7_000, drawsFrame: null, drawsFrames: 0, triangles: 3_600_000, geometries: 300, textures: 90, nodes: 11_000, nodesSource: "scene-graph", scenes: 1 },
    gl: {
      programsLinked: 0,
      framebuffers: 0,
      buffers: 0,
      textures: 0,
      vertexArrays: 0,
      allocations: 0,
      residentPrograms: 56,
      total: { buffers: 1_790, textures: 101 },
      attached: true,
    },
    sim: { avgMs: 2.6, outsideMs: 13 },
    profile: null,
    systems: {},
    logs: null,
    telemetry: null,
  };
}

describe("dev report route", () => {
  test("a pushed report reads back unchanged, per game", () => {
    const store = createReportStore(() => 1_000);
    const pushed = handleReportPush(store, JSON.stringify({ gameId: "harbor-heat", report: report() }));
    expect(pushed.status).toBe(200);
    expect(store.get("harbor-heat")!.report).toEqual(report());
    expect(store.get("harbor-heat")!.at).toBe(1_000);
    expect(store.get("deepward")).toBeNull();
  });

  test("rejects a malformed or mislabelled push instead of storing it", () => {
    const store = createReportStore();
    expect(handleReportPush(store, "not json").status).toBe(400);
    expect(handleReportPush(store, JSON.stringify({ gameId: "../evil", report: report() })).status).toBe(400);
    expect(handleReportPush(store, JSON.stringify({ gameId: "harbor-heat", report: { game: 1 } })).status).toBe(400);
    expect(store.games()).toEqual([]);
  });

  test("waiting for a report resolves as soon as the page pushes one", async () => {
    const store = createReportStore();
    const pending = store.next("harbor-heat", 2_000);
    store.put("harbor-heat", report());
    expect((await pending)!.gameId).toBe("harbor-heat");
  });

  test("waiting with nothing arriving resolves null rather than hanging", async () => {
    const store = createReportStore();
    expect(await store.next("harbor-heat", 20)).toBeNull();
    expect(await store.next("harbor-heat", 0)).toBeNull();
  });

  test("a wait for a game that already reported returns immediately", async () => {
    const store = createReportStore();
    store.put("deepward", report("deepward"));
    const started = Date.now();
    expect((await store.next("deepward", 5_000))!.report.game).toBe("deepward");
    expect(Date.now() - started).toBeLessThan(100);
  });

  test("a crash line survives the clean report that follows a reload", () => {
    const store = createReportStore(() => 5_000);
    const crash: PerfReport = {
      ...report(),
      logs: {
        counts: { log: 0, info: 0, warn: 0, error: 1 },
        dropped: 0,
        severe: [{ at: 4_900, level: "error", system: "runtime", message: "uncaught: cannot read properties of undefined" }],
      },
    };
    store.put("harbor-heat", crash);
    const clean = report();
    store.put("harbor-heat", { ...clean, logs: { counts: { log: 0, info: 0, warn: 0, error: 0 }, dropped: 0, severe: [] } });
    const served = store.get("harbor-heat")!.report;
    expect(served.logs!.severe.map((line) => line.message)).toEqual(["uncaught: cannot read properties of undefined"]);
    expect(served.frame).toEqual(clean.frame);
  });

  test("the same line pushed twice is kept once", () => {
    const store = createReportStore(() => 5_000);
    const line = { at: 4_900, level: "warn" as const, system: "console", message: "minimap intersects hotbar" };
    for (const at of [4_900, 4_950, 4_990]) {
      store.put("harbor-heat", {
        ...report(),
        logs: { counts: { log: 0, info: 0, warn: 1, error: 0 }, dropped: 0, severe: [{ ...line, at }] },
      });
    }
    expect(store.get("harbor-heat")!.report.logs!.severe).toHaveLength(1);
  });
});
