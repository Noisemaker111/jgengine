import { describe, expect, test } from "bun:test";

import { devtools } from "@jgengine/core/devtools/devtools";
import { createLogBus } from "@jgengine/core/devtools/logBus";
import { toReportLogs } from "@jgengine/core/devtools/report";
import { buildFrameReport, countSceneNodes, attachGlCounters, reportGameId } from "./frameSampler";

/**
 * The in-page report is the same record `bun run perf` prints, so these assert the
 * shape and the joins a person would otherwise eyeball against a budget file.
 */

function inputs(overrides: Partial<Parameters<typeof buildFrameReport>[0]> = {}) {
  return {
    game: "harbor-heat",
    gpu: "ANGLE (NVIDIA GeForce RTX 3070)",
    quality: "full" as const,
    viewport: "1600x900",
    at: 1_700_000_000_000,
    frame: {
      fps: 60,
      avgFrameMs: 16.62,
      p95FrameMs: 18.004,
      maxFrameMs: 24.5,
      avgSimMs: 2.616,
      maxSimMs: 4,
      avgOutsideMs: 13.5,
      maxOutsideMs: 20,
      longFrames: 0,
      samples: 240,
      recentFrameMs: [16, 17],
      phases: [],
    },
    render: { drawCalls: 7_000, triangles: 3_600_000, geometries: 300, textures: 90 },
    scene: { nodes: 11_000, scenes: 1 },
    gl: {
      totals: { programsLinked: 57, framebuffers: 2, buffers: 1_790, textures: 101, vertexArrays: 40 },
      since: { programsLinked: 0, framebuffers: 0, buffers: 0, textures: 0, vertexArrays: 0 },
      residentPrograms: 56,
      attached: true,
    },
    systems: { "render/culling": { counters: { visible: 120 }, timers: { cullingMs: 0.42 }, state: "120/800 visible" } },
    logs: null,
    heapBytes: 512 * 1024 * 1024,
    ageMs: 12_345,
    warmedUp: true,
    buildMs: 1.234,
    ...overrides,
  };
}

describe("in-page frame report", () => {
  test("produces the shared record shape with rounded numbers and a window length", () => {
    const report = buildFrameReport(inputs());
    expect(report.frame).toEqual({ fps: 60, avgMs: 16.62, p95Ms: 18, maxMs: 24.5, samples: 240, longFrames: 0 });
    expect(report.seconds).toBe(4);
    expect(report.render).toEqual({
      draws: 7_000,
      triangles: 3_600_000,
      geometries: 300,
      textures: 90,
      nodes: 11_000,
      nodesSource: "scene-graph",
      scenes: 1,
    });
    expect(report.sim).toEqual({ avgMs: 2.62, outsideMs: 13.5 });
    expect(report.profile).toBeNull();
    expect(report.systems["render/culling"]!.state).toBe("120/800 visible");
    expect(report.telemetry).toEqual({ source: "in-page", warmedUp: true, ageMs: 12_345, buildMs: 1.23, heapBytes: 536_870_912 });
  });

  test("gl allocations sum the post-warmup counters, not the lifetime totals", () => {
    const report = buildFrameReport(
      inputs({
        gl: {
          totals: { programsLinked: 57, framebuffers: 2, buffers: 1_790, textures: 101, vertexArrays: 40 },
          since: { programsLinked: 1, framebuffers: 1, buffers: 2, textures: 3, vertexArrays: 0 },
          residentPrograms: 56,
          attached: true,
        },
      }),
    );
    expect(report.gl.allocations).toBe(7);
    expect(report.gl.programsLinked).toBe(1);
    expect(report.gl.framebuffers).toBe(1);
    expect(report.gl.total).toMatchObject({ programsLinked: 57, buffers: 1_790 });
    expect(report.gl.attached).toBe(true);
  });

  test("reports an unwalkable scene and an unattached counter as nulls, never as zeros that read like a pass", () => {
    const report = buildFrameReport(
      inputs({
        frame: null,
        render: null,
        scene: { nodes: null, scenes: 0 },
        gl: {
          totals: { programsLinked: 0, framebuffers: 0, buffers: 0, textures: 0, vertexArrays: 0 },
          since: { programsLinked: 0, framebuffers: 0, buffers: 0, textures: 0, vertexArrays: 0 },
          residentPrograms: null,
          attached: false,
        },
        logs: null,
        warmedUp: false,
      }),
    );
    expect(report.render.nodes).toBeNull();
    expect(report.render.nodesSource).toBe("unavailable");
    expect(report.render.draws).toBeNull();
    expect(report.gl.attached).toBe(false);
    expect(report.sim).toBeNull();
    expect(report.frame.samples).toBe(0);
  });

  test("carries a thrown error into the report after a flood of info lines", () => {
    const bus = createLogBus();
    bus.write("error", "runtime", "uncaught: cannot read properties of undefined");
    for (let index = 0; index < 500; index += 1) bus.write("info", "nav", `tick ${index}`);
    const report = buildFrameReport(inputs({ logs: toReportLogs(bus.snapshot()) }));
    expect(report.logs!.severe).toEqual([
      expect.objectContaining({ level: "error", system: "runtime", message: "uncaught: cannot read properties of undefined" }),
    ]);
    expect(report.logs!.dropped).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(report)).logs.severe).toHaveLength(1);
  });
});

describe("scene and GL counting", () => {
  test("counts every node in the live scene", () => {
    const scene = {
      traverse(visit: (node: unknown) => void) {
        for (const node of [1, 2, 3, 4]) visit(node);
      },
    };
    expect(countSceneNodes(scene)).toEqual({ nodes: 4, scenes: 1 });
    expect(countSceneNodes(null)).toEqual({ nodes: null, scenes: 0 });
    expect(countSceneNodes({})).toEqual({ nodes: null, scenes: 0 });
  });

  test("wraps only creation calls, counts them, and reports whether anything was wrapped", () => {
    const calls: string[] = [];
    const gl = {
      linkProgram: () => calls.push("linkProgram"),
      createFramebuffer: () => calls.push("createFramebuffer"),
      drawElements: () => calls.push("drawElements"),
    };
    const counters = attachGlCounters(gl);
    expect(counters.attached).toBe(true);
    gl.linkProgram();
    gl.linkProgram();
    gl.createFramebuffer();
    gl.drawElements();
    expect(counters.totals.programsLinked).toBe(2);
    expect(counters.totals.framebuffers).toBe(1);
    expect(counters.totals.buffers).toBe(0);
    expect(gl.drawElements).toBe(gl.drawElements);
    expect(calls).toEqual(["linkProgram", "linkProgram", "createFramebuffer", "drawElements"]);
    expect(attachGlCounters({}).attached).toBe(false);
  });
});

describe("report game id", () => {
  test("slugs the display name so the route key matches the budget file", () => {
    expect(reportGameId("Harbor Heat")).toBe("harbor-heat");
    expect(reportGameId("Beacon Bastion")).toBe("beacon-bastion");
    expect(reportGameId("Bogeylab")).toBe("bogeylab");
  });
});

describe("devtools lean report", () => {
  test("carries systems and the log summary so the CDP harness and the page print one shape", async () => {
    const { buildLeanReport } = await import("./devtoolsReports");
    // Other files' console warns land in the same global log buffer; this test is about the shape
    // of the summary, not about who else wrote a line.
    devtools.logs.clear();
    devtools.probes.registerSystem("report/test", { counters: () => ({ a: 1 }), state: () => "one" });
    devtools.logs.write("warn", "needs", "no bed nearby");
    const playable = { game: { name: "Report Probe" } } as unknown as Parameters<typeof buildLeanReport>[0];
    const lean = buildLeanReport(playable);
    expect(lean.systems["report/test"]).toEqual({ counters: { a: 1 }, timers: {}, state: "one" });
    expect(lean.logSummary.severe).toEqual([expect.objectContaining({ level: "warn", system: "needs" })]);
  });
});
