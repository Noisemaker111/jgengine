/**
 * Loads a generated interchange scene folder (`scene.json`, OBJ meshes, PNG textures) into a real
 * Chrome on this machine's GPU through `loadImportedScene`, and reports load time, batch and draw
 * counts, the longest frame while loading and frame times after. The scene is written once per size
 * under `.scratch/scene-import-bench/` and reused.
 *
 *   bun scripts/scene-import-bench.ts [--instances 20000] [--meshes 4600] [--textures 1500]
 *     [--rings 29] [--segments 50] [--texture-size 128] [--cell scene,512] [--idle-load]
 *     [--profile out.cpuprofile] [--headed]
 *
 * Defaults are the scale issue #3261 names: about 1 GB of OBJ text. `--cell` takes several sizes
 * (`scene` is the default single cell) and loads the scene once per size.
 */
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

import { buildBrowserFixture, chromeFrameClockArgs, findChromeExecutable } from "./browser-lib";
import { syntheticObj, syntheticPng, syntheticScene } from "../packages/core/src/sceneImport/testFixtures/syntheticScene";

const { values } = parseArgs({
  options: {
    instances: { type: "string", default: "20000" },
    meshes: { type: "string", default: "4600" },
    textures: { type: "string", default: "1500" },
    rings: { type: "string", default: "29" },
    segments: { type: "string", default: "50" },
    "texture-size": { type: "string", default: "128" },
    cell: { type: "string", default: "scene" },
    headed: { type: "boolean", default: false },
    /** Write a CPU profile of the page's main thread over the whole load to this file. */
    profile: { type: "string" },
    /** Draw nothing until the load finishes, to see the load alone. */
    "idle-load": { type: "boolean", default: false },
  },
});
const size = {
  instances: Number(values.instances), meshes: Number(values.meshes), textures: Number(values.textures),
  rings: Number(values.rings), segments: Number(values.segments), textureSize: Number(values["texture-size"]),
};
const root = resolve(import.meta.dir, "..").replaceAll("\\", "/");
const folder = `${root}/.scratch/scene-import-bench/${Object.values(size).join("-")}`;

async function writeScene(): Promise<void> {
  if (existsSync(join(folder, "scene.json"))) return;
  const started = performance.now();
  await rm(folder, { recursive: true, force: true });
  await mkdir(join(folder, "meshes"), { recursive: true });
  await mkdir(join(folder, "textures"), { recursive: true });
  const generated = syntheticScene(size);
  let bytes = 0;
  for (const [mesh, file] of generated.meshFiles.entries()) {
    const text = syntheticObj(mesh, size.rings, size.segments);
    bytes += text.length;
    await Bun.write(join(folder, file), text);
  }
  await Promise.all(generated.textureFiles.map((file, texture) => Bun.write(join(folder, file), syntheticPng(texture, size.textureSize))));
  // Written last: its presence means the folder is complete.
  await Bun.write(join(folder, "scene.json"), JSON.stringify(generated.scene));
  console.log(`wrote ${(bytes / 1e9).toFixed(2)} GB of OBJ in ${((performance.now() - started) / 1000).toFixed(1)} s to ${folder}`);
}

const PAGE = `
import * as THREE from "three";
import { loadImportedScene } from "${root}/packages/core/src/sceneImport/importedScene.draw";

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};

globalThis.runImport = async (cellSize, renderWhileLoading = true) => {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(1280, 720);
  document.body.append(renderer.domElement);
  const gl = renderer.getContext();
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = debug === null ? "unknown" : gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb6cc);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(300, 600, 200);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(60, 1280 / 720, 0.5, 6000);
  camera.position.set(0, 1800, 2400);
  camera.lookAt(0, 0, 0);

  let deltas = [];
  const long = [];
  let phase = "start";
  let last = performance.now();
  let renderMs = [];
  let running = true;
  let loaded = false;
  const frame = () => {
    if (!running) return;
    const now = performance.now();
    deltas.push(now - last);
    if (now - last > 50) long.push({ ms: Math.round(now - last), phase, programs: renderer.info.programs?.length ?? 0 });
    last = now;
    const before = performance.now();
    if (renderWhileLoading || loaded) renderer.render(scene, camera);
    renderMs.push(performance.now() - before);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const timeline = [];
  const loadStart = performance.now();
  const imported = await loadImportedScene("/scene.json", {
    parent: scene,
    renderer,
    cellSize,
    onProgress: (p) => {
      phase = JSON.stringify(p);
      const t = Math.round(performance.now() - loadStart);
      if (timeline.length === 0 || t - timeline.at(-1).t >= 1000) timeline.push({ t, mesh: p.meshFilesLoaded, tex: p.texturesLoaded, placed: p.instancesPlaced, mb: Math.round(p.bytes / 1e6) });
    },
    spawn: () => new Worker("/objMeshWorker.js", { type: "module" }),
  });
  loaded = true;
  const loading = { longestFrameMs: Math.max(...deltas.slice(1)), p95FrameMs: percentile(deltas.slice(1), 0.95), frames: deltas.length, long, timeline };
  // Views around the scene's centre, which the import puts at its root's position.
  const { x: cx, z: cz } = imported.root.position;
  const views = {
    overview: [[cx, 1500, cz + 1500], [cx, 0, cz]],
    street: [[cx, 2, cz], [cx + 400, 2, cz + 50]],
    edge: [[cx - 1900, 30, cz - 1900], [cx, 0, cz]],
  };
  const frames = {};
  for (const [name, [eye, target]] of Object.entries(views)) {
    camera.position.set(...eye);
    camera.lookAt(...target);
    for (let warm = 0; warm < 30; warm += 1) await new Promise((r) => requestAnimationFrame(r));
    deltas = [];
    renderMs = [];
    for (let sample = 0; sample < 200; sample += 1) await new Promise((r) => requestAnimationFrame(r));
    renderer.render(scene, camera);
    frames[name] = {
      p50Ms: percentile(deltas, 0.5), p95Ms: percentile(deltas, 0.95),
      renderCpuP50Ms: percentile(renderMs, 0.5),
      calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    };
  }
  running = false;
  const result = { gpu, cellSize, stats: imported.stats, loading, frames };
  imported.dispose();
  renderer.dispose();
  renderer.domElement.remove();
  return result;
};
`;

await writeScene();
const bench = `${root}/packages/core/.scratch/scene-import-bench`;
await mkdir(bench, { recursive: true });
await Bun.write(`${bench}/page.ts`, PAGE);
const page = buildBrowserFixture(`${bench}/page.ts`);
const worker = buildBrowserFixture(`${root}/packages/core/src/sceneImport/objMeshWorker.ts`);
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/") return new Response(`<!doctype html><html><body style="margin:0"><script type="module">${page}</script></body></html>`, { headers: { "content-type": "text/html" } });
    if (path === "/objMeshWorker.js") return new Response(worker, { headers: { "content-type": "text/javascript" } });
    const file = Bun.file(join(folder, decodeURIComponent(path)));
    return file.size > 0 ? new Response(file) : new Response("missing", { status: 404 });
  },
});
const browser = await chromium.launch({
  executablePath: findChromeExecutable(),
  headless: !values.headed,
  args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", ...chromeFrameClockArgs("uncapped"), "--window-size=1300,800"],
});
try {
  for (const cell of values.cell.split(",")) {
    const tab = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    tab.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") console.log(`[page] ${message.text()}`);
    });
    await tab.goto(`http://localhost:${server.port}/`);
    await tab.waitForFunction("typeof globalThis.runImport === 'function'");
    const cdp = values.profile === undefined ? null : await tab.context().newCDPSession(tab);
    await cdp?.send("Profiler.enable");
    await cdp?.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp?.send("Profiler.start");
    const result = await tab.evaluate(`globalThis.runImport(${cell === "scene" ? "undefined" : Number(cell)}, ${!values["idle-load"]})`);
    if (cdp !== null) await Bun.write(values.profile!, JSON.stringify((await cdp.send("Profiler.stop")).profile));
    console.log(JSON.stringify(result, null, 2));
    await tab.close();
  }
} finally {
  await browser.close();
  await server.stop(true);
}
