import { describe, expect, test } from "bun:test";

import { summarizeLeanReport, type buildLeanReport } from "./devtoolsReports";

type Lean = ReturnType<typeof buildLeanReport>;

function leanWithLongFrames(count: number): Lean {
  const longFrames = Array.from({ length: count }, (_, index) => ({
    at: index, frameMs: 4000, simMs: 1, outsideMs: 3999, culprit: "outside-sim", reason: "render hitch",
    phases: [{ name: "onTick", ms: 0.4 }],
    probes: { presentationRecovery: Array.from({ length: 40 }, (__, i) => ({ phase: "shell-reveal-layout", i })) },
    render: { drawCalls: 410, triangles: 1_286_549, geometries: 86, textures: 35 },
  }));
  return {
    game: "Beacon Bastion",
    at: 1,
    why: "outside-sim (5/5 recent long frames): Cost is outside the sim driver — three.js render, React commit, GPU. Check the render sample.",
    frame: {
      fps: 0.2, avgFrameMs: 4013.3, p95FrameMs: 9262.2, maxFrameMs: 9262.2, avgSimMs: 0.8, maxSimMs: 2.7,
      avgOutsideMs: 4012.5, maxOutsideMs: 9261.9, longFrames: count, samples: 9,
      phases: [{ name: "onTick", avgMs: 0.4, maxMs: 1, pctOfSim: 53 }],
    },
    render: { drawCalls: 410, triangles: 1_286_549, geometries: 86, textures: 35 },
    latency: null,
    longFrameSummary: { count, culprits: [{ culprit: "outside-sim", count }], maxFrameMs: 9262.2, maxDrawCalls: 410, maxGeometries: 86 },
    longFrames,
    probes: {},
    logs: Array.from({ length: 12 }, (_, i) => ({ at: i, level: "warn", message: `warning ${i} `.repeat(40) })),
    controls: undefined,
    discovered: undefined,
    discoveredCount: 0,
  } as unknown as Lean;
}

describe("summarizeLeanReport", () => {
  test("keeps the judging numbers and stays small however many long frames carry probes", () => {
    const lean = leanWithLongFrames(6);
    const summary = summarizeLeanReport(lean, 57);
    expect(summary).toMatchObject({
      game: "Beacon Bastion",
      fps: 0.2,
      frameMs: { avg: 4013.3, p95: 9262.2 },
      simMs: 0.8,
      drawCalls: 410,
      triangles: 1_286_549,
      entities: 57,
      longFrames: 6,
      topCulprit: { culprit: "outside-sim", count: 6 },
      topPhase: { name: "onTick", avgMs: 0.4 },
      warnings: 12,
    });
    expect(summary.lastWarnings).toHaveLength(3);
    expect(summary.why).toBe("outside-sim (5/5 recent long frames):");
    expect(JSON.stringify(summary).length).toBeLessThan(1200);
    expect(JSON.stringify(lean).length).toBeGreaterThan(10 * JSON.stringify(summary).length);
  });

  test("reports nulls before the first frame sample", () => {
    const lean = { ...leanWithLongFrames(0), frame: null, render: null, longFrameSummary: null, logs: undefined, why: null } as unknown as Lean;
    expect(summarizeLeanReport(lean, null)).toMatchObject({ fps: null, frameMs: null, drawCalls: null, longFrames: 0, warnings: 0, why: null });
  });
});
