import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { codeOwner, decodeSourceMap, frameScore, loadScore, mainScore, productionProblem, profileSources, renderScorecard, scoreProfile, sourceAt, type Scorecard } from "./perf-scorecard";
import { prodFile } from "./prodServer";

test("a frame score counts the slow frames a middle frame hides", () => {
  const score = frameScore([...Array.from({ length: 96 }, () => 3), 17, 20, 34, 120]);
  expect(score.p50Ms).toBe(3);
  expect(score.p99Ms).toBe(120);
  expect(score.worstMs).toBe(120);
  expect(score.over16).toBe(4);
  expect(score.over33).toBe(2);
  expect(frameScore([]).frames).toBe(0);
});

test("a source path names whose code it is, with r3f's bundled reconciler counted as r3f", () => {
  expect(codeOwner("../../../../node_modules/.bun/react-dom@19.2.0/node_modules/react-dom/cjs/react-dom-client.production.js")).toBe("react");
  expect(codeOwner("../../node_modules/scheduler/cjs/scheduler.production.js")).toBe("react");
  expect(codeOwner("../../node_modules/.bun/@react-three+fiber@9/node_modules/@react-three/fiber/dist/events.esm.js")).toBe("r3f");
  expect(codeOwner("../../node_modules/react-reconciler/cjs/react-reconciler.production.js")).toBe("r3f");
  expect(codeOwner("../../node_modules/@react-three/drei/core/Environment.js")).toBe("drei");
  expect(codeOwner("../../node_modules/three/build/three.core.js")).toBe("three");
  expect(codeOwner("../../../packages/core/src/render/shaderWarmup.draw.ts")).toBe("engine");
  expect(codeOwner("../../../games/deepward/src/game/state.ts")).toBe("game");
  expect(codeOwner("/node_modules/.vite/deps/react-dom_client.js")).toBe("react");
  expect(codeOwner("/node_modules/.vite/deps/@react-three_fiber.js")).toBe("r3f");
  expect(codeOwner("/@fs/C:/repo/packages/core/src/hud/hud.view.tsx")).toBe("engine");
  expect(codeOwner("../../node_modules/zustand/esm/vanilla.mjs")).toBe("library");
});

// Two generated lines. Line 0: column 0 -> source 0, column 10 -> source 1. Line 1: column 4 -> source 1.
const MAP = { sources: ["../node_modules/react-dom/cjs/react-dom-client.production.js", "../packages/core/src/a.ts"], mappings: "AAAA,UCAA;IACA" };

test("a source map names the file a minified position came from", () => {
  const map = decodeSourceMap(MAP);
  expect(sourceAt(map, 0, 0)).toBe(MAP.sources[0]!);
  expect(sourceAt(map, 0, 9)).toBe(MAP.sources[0]!);
  expect(sourceAt(map, 0, 500)).toBe(MAP.sources[1]!);
  expect(sourceAt(map, 1, 0)).toBe(MAP.sources[1]!);
  expect(sourceAt(map, 7, 0)).toBeNull();
});

const frame = (id: number, functionName: string, url: string, columnNumber: number, children?: number[]) => ({ id, callFrame: { functionName, url, lineNumber: 0, columnNumber }, ...(children === undefined ? {} : { children }) });

test("the engine JSX runtime, bridge, wasm and component callbacks have their own measured UI share", () => {
  for (const source of [
    "../../../packages/core/src/ui/jsx/reconciler.ts",
    "/@fs/C:/repo/packages/core/src/ui/rune/nativeSurface.view.ts",
    "../../../packages/ui/src/hooks.ts",
    "../../node_modules/@jgengine/core/dist/ui/jsx/reconciler.js",
    "../../node_modules/@jgengine/ui/dist/hooks.js",
    "/jg-ui/jg_ui_bg.wasm",
  ]) expect(codeOwner(source)).toBe("ui");
  const score = scoreProfile({
    nodes: [
      frame(1, "renderFunction", "/packages/core/src/ui/jsx/reconciler.ts", 0, [2]),
      frame(2, "HUD", "/games/deepward/src/HUD.tsx", 0),
      frame(3, "wasm-function[4]", "/jg-ui/jg_ui_bg.wasm", 0),
      frame(4, "tick", "/games/deepward/src/game.ts", 0),
      frame(5, "jsxDEV", "/packages/core/src/ui/jsx/element.ts", 0),
    ],
    samples: [1, 2, 3, 4, 5], timeDeltas: [1000, 2000, 3000, 4000, 1000],
  }, () => null);
  expect(score.selfMs.ui).toBe(5);
  expect(score.uiInclusiveMs).toBe(7);
  expect(score.devReactMs).toBe(0);
  const main = mainScore(score, 10, 1, null);
  expect(main.uiSelfMsPerFrame).toBe(0.5);
  expect(main.uiInclusiveMsPerFrame).toBe(0.7);
  expect(renderScorecard([{ label: "Rune", card: card({ main }) }], true)).toContain("| engine UI self | 45.5% (0.500 ms) |");
});

test("a production profile is split by package through the chunk's source map", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jg-scorecard-"));
  try {
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "app-abc123.js.map"), JSON.stringify(MAP));
    const url = "http://127.0.0.1:5000/assets/app-abc123.js";
    const profile = {
      nodes: [
        frame(1, "(root)", "", 0, [2, 5, 6]),
        frame(2, "a", url, 0, [3]),
        frame(3, "b", url, 20, [4]),
        frame(4, "(garbage collector)", "", 0),
        frame(5, "(idle)", "", 0),
        frame(6, "c", url, 30),
      ],
      samples: [2, 3, 4, 5, 6],
      timeDeltas: [1000, 2000, 500, 4000, 3000],
    };
    const score = scoreProfile(profile, await profileSources(profile.nodes.map((node) => node.callFrame.url), { outDir: dir }));
    expect(score.totalMs).toBe(10.5);
    expect(score.busyMs).toBe(6.5);
    expect(score.selfMs.react).toBe(1);
    expect(score.selfMs.engine).toBe(5);
    expect(score.selfMs.browser).toBe(0.5);
    // Everything React called counts as inside React: its own 1 ms, the engine's 2 ms and the GC under them.
    expect(score.reactInclusiveMs).toBe(3.5);
    expect(score.gcMs).toBe(0.5);
    expect(score.devReactMs).toBe(0);
    const main = mainScore(score, 10, 1, 2 * 1_048_576);
    expect(main.msPerFrame).toBe(0.65);
    expect(main.reactSelfPct).toBe(15.4);
    expect(main.allocatedMbPerSecond).toBe(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const card = (over: Partial<Scorecard>): Scorecard => ({ build: "production", slow: null, pcBusyPct: 5, frame: frameScore([3, 3, 3]), main: null, load: null, ...over });

test("a run asked for as production fails when React's development build ran or source modules loaded", async () => {
  const dev = scoreProfile(
    { nodes: [frame(1, "jsxDEV", "http://127.0.0.1:4600/node_modules/.vite/deps/react_jsx-dev-runtime.js", 0)], samples: [1], timeDeltas: [2000] },
    await profileSources([], {}),
  );
  expect(dev.devReactMs).toBe(2);
  expect(productionProblem(card({ main: mainScore(dev, 1, 1, null) }))).toContain("development build");
  const sources = loadScore([["http://x/", 500], ["http://x/src/main.tsx", 900], ["http://x/@fs/C:/repo/packages/core/src/a.ts", 100]], 1200);
  expect(sources.sourceModules).toBe(2);
  expect(productionProblem(card({ load: sources }))).toContain("source modules");
  const bundled = loadScore([["http://x/", 500], ["http://x/assets/index-BeU6t6LW.js", 900], ["http://x/assets/rapier-CJPErHuH.wasm", 300], ["http://x/games/deepward/models/a.glb", 4000]], 1200);
  expect(bundled).toMatchObject({ jsBytes: 900, wasmBytes: 300, totalBytes: 5700, scripts: 1, sourceModules: 0, requests: 4 });
  expect(productionProblem(card({ load: bundled }))).toBeNull();
  expect(productionProblem(card({ build: "dev", load: sources }))).toBeNull();
});

test("the scorecard leads with the slow frames, the hitches and the slow-CPU window", () => {
  const text = renderScorecard([
    { label: "production", card: card({ frame: frameScore([3, 3, 3, 40]), slow: { rate: 4, frame: frameScore([12, 12, 50]) } }) },
    { label: "dev", card: null },
  ], true);
  expect(text).toContain("|  | production | dev |");
  expect(text).toContain("| frame p50 ms | 3.00 | failed |");
  expect(text).toContain("| frames over 33 ms | 1 of 4 | failed |");
  expect(text).toContain("| CPU 4x slower: p50 / p95 ms | 12.00 / 50.00 | failed |");
});

test("production accepts Rune's generated wasm bindings while still rejecting dev and unexpected scripts", () => {
  const runtime: Array<[string, number]> = [
    ["http://x/assets/app-abc123.js", 100],
    ["http://x/jg-ui/jg_ui.js", 200],
    ["http://x/jg-ui/snippets/jg-ui-b9455b9e79605d58/inline0.js", 10],
    ["http://x/jg-ui/snippets/rune-bcdf3621eaa7cec8/src/platform/web/bridge.js", 30],
    ["http://x/jg-ui/snippets/rune-bcdf3621eaa7cec8/src/platform/web/platform.js", 40],
    ["http://x/jg-ui/jg_ui_bg.wasm", 500],
  ];
  const bundled = loadScore(runtime, 1000);
  expect(bundled).toMatchObject({ jsBytes: 380, wasmBytes: 500, scripts: 5, sourceModules: 0 });
  expect(productionProblem(card({ load: bundled }))).toBeNull();
  for (const path of ["/src/game.js", "/@vite/client", "/jg-ui/src/debug.js", "/jg-ui/snippets/rune-abcdef/src/other.js"]) {
    const dev = loadScore([...runtime, [`http://x${path}`, 100]], 1000);
    expect(dev.sourceModules).toBe(1);
    expect(productionProblem(card({ load: dev }))).toContain("source modules");
  }
});

test("the production server serves only the build's own files, never its source maps", () => {
  const dir = mkdtempSync(join(tmpdir(), "jg-prodfile-"));
  try {
    mkdirSync(join(dir, "assets"));
    for (const name of ["index.html", join("assets", "a-abc123.js"), join("assets", "a-abc123.js.map"), join("assets", "a-abc123.js.br")]) writeFileSync(join(dir, name), "x");
    expect(prodFile(dir, "/")).toBe(join(dir, "index.html"));
    expect(prodFile(dir, "/assets/a-abc123.js")).toBe(join(dir, "assets", "a-abc123.js"));
    expect(prodFile(dir, "/assets/a-abc123.js.map")).toBeNull();
    expect(prodFile(dir, "/assets/a-abc123.js.br")).toBeNull();
    expect(prodFile(dir, "/../outside.txt")).toBeNull();
    expect(prodFile(dir, "/assets/missing.js")).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
