import { afterEach, describe, expect, test } from "bun:test";

import { findReport, gameUrl, parseDebugArgs } from "./debug-report";
import type { PerfReport } from "../packages/core/src/devtools/report";

/**
 * `bun run debug` is the fast read path, so its argument handling and its choice of
 * server have to be boring: one game, an optional wait, no surprise budget skip, and
 * the report found on whichever dev server has it.
 */

const realFetch = globalThis.fetch;

function stubFetch(handler: (url: string) => Response): void {
  globalThis.fetch = ((input: string | URL | Request) => Promise.resolve(handler(String(input)))) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

function report(game = "deepward"): PerfReport {
  return {
    game,
    gpu: "ANGLE",
    quality: "full",
    viewport: "1600x900",
    seconds: 4,
    at: Date.now(),
    frame: { fps: 60, avgMs: 16.6, p95Ms: 18, maxMs: 24, samples: 240, longFrames: 0 },
    render: { draws: 74, drawsFrame: null, drawsFrames: 0, triangles: 50_748, geometries: 20, textures: 9, nodes: 142, nodesSource: "scene-graph", scenes: 1 },
    gl: {
      programsLinked: 0,
      framebuffers: 0,
      buffers: 0,
      textures: 0,
      vertexArrays: 0,
      allocations: 0,
      residentPrograms: 4,
      total: { buffers: 10 },
      attached: true,
    },
    sim: { avgMs: 1, outsideMs: 15 },
    profile: null,
    systems: {},
    logs: null,
    telemetry: null,
  };
}

const website = { base: "http://127.0.0.1:3001", kind: "website" as const };
const runner = { base: "http://127.0.0.1:4680", kind: "runner" as const };

describe("bun run debug arguments", () => {
  test("defaults to a 1.5s wait and the budget check", () => {
    expect(parseDebugArgs(["harbor-heat"])).toEqual({ game: "harbor-heat", waitMs: 1_500, budget: true });
  });

  test("takes an explicit wait and can skip the budget", () => {
    expect(parseDebugArgs(["deepward", "--wait", "0", "--no-budget"])).toEqual({
      game: "deepward",
      waitMs: 0,
      budget: false,
    });
  });

  test("refuses two games, an unknown flag and a negative wait", () => {
    expect(() => parseDebugArgs(["a", "b"])).toThrow(/one game/);
    expect(() => parseDebugArgs(["a", "--games"])).toThrow(/unknown flag/);
    expect(() => parseDebugArgs(["a", "--wait", "-1"])).toThrow(/0 or more/);
    expect(() => parseDebugArgs([])).toThrow(/game id is required/);
  });

  test("--help prints usage instead of running", () => {
    expect(parseDebugArgs(["--help"])).toBe("help");
  });
});

describe("choosing a dev server", () => {
  test("names the page to open for each kind of dev server", () => {
    expect(gameUrl(website, "deepward")).toBe("http://127.0.0.1:3001/games/deepward");
    expect(gameUrl(runner, "deepward")).toBe("http://127.0.0.1:4680/?game=deepward");
  });

  test("takes the report from the website dev server when it has one", async () => {
    stubFetch((url) =>
      url.startsWith("http://127.0.0.1:3001")
        ? Response.json(report())
        : Response.json({ error: "no report" }, { status: 404 }),
    );
    const found = await findReport([website, runner], "deepward", 0);
    expect("error" in found).toBe(false);
    expect("error" in found ? null : found.server.base).toBe("http://127.0.0.1:3001");
  });

  test("falls through to the runner when the website server has no report", async () => {
    stubFetch((url) =>
      url.startsWith("http://127.0.0.1:4680")
        ? Response.json(report())
        : Response.json({ error: "no report" }, { status: 404 }),
    );
    const found = await findReport([website, runner], "deepward", 0);
    expect("error" in found ? null : found.server.kind).toBe("runner");
  });

  test("says no report yet instead of inventing one, without waiting twice", async () => {
    stubFetch(() => Response.json({ error: 'no report for "deepward" yet — open it in the browser and play for a second' }, { status: 404 }));
    const started = Date.now();
    const found = await findReport([website, runner], "deepward", 0);
    expect("error" in found ? found.error : "").toContain("no report for \"deepward\" yet");
    expect(Date.now() - started).toBeLessThan(500);
  });
});
