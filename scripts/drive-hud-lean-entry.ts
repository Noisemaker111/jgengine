/** Measure an actual CLI-created HUD game's cold entry and drive its native controls. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { WorldSyncFrame } from "@jgengine/core/runtime/transport";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

if (process.env["JG_HUD_PROOF_CASE"] === "authority3d") {
  await driveAuthorityCodeReload();
  process.exit(0);
}

const target = process.env["JG_HUD_PROOF_URL"];
const executablePath = process.env["CHROMIUM_PATH"];
const evidencePath = process.env["JG_HUD_PROOF_EVIDENCE"];
const receiptPath = process.env["JG_HUD_PROOF_ARTIFACT_RECEIPT"];
const proofCase = process.env["JG_HUD_PROOF_CASE"];
assert.ok(target && executablePath && evidencePath && receiptPath);
assert.ok(proofCase === "baseline" || proofCase === "lean");
const url = new URL(target);
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.equal(url.searchParams.has("debug"), false, "Cold entry starts with developer UI closed");
const artifact = JSON.parse(readFileSync(receiptPath, "utf8")) as {
  sourceRevision: string;
  generatedSourceHash: string;
  packageHashes: Record<string, string>;
  threeDChunks: string[];
};
assert.ok(artifact.sourceRevision && artifact.generatedSourceHash);
assert.ok(Object.keys(artifact.packageHashes).length > 0);
assert.ok(Array.isArray(artifact.threeDChunks));
if (proofCase === "lean") assert.ok(artifact.threeDChunks.length > 0, "Candidate receipt must identify actual deferred 3D chunks");
const evidence = resolve(evidencePath); mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, serviceWorkers: "block" });
const page = await context.newPage(); page.setDefaultTimeout(10000);
const session = await context.newCDPSession(page);
await session.send("Network.enable");
await session.send("Network.setCacheDisabled", { cacheDisabled: true });
let stage = "cold";
const requests = new Map<string, { url: string; stage: string; type?: string; status?: number; mimeType?: string; headers?: Record<string, unknown>; encodedTransferBytes?: number }>();
session.on("Network.requestWillBeSent", (event) => requests.set(event.requestId, { url: event.request.url, stage, type: event.type }));
session.on("Network.responseReceived", (event) => {
  const row = requests.get(event.requestId);
  if (row) Object.assign(row, { type: event.type, status: event.response.status, mimeType: event.response.mimeType, headers: event.response.headers });
});
session.on("Network.loadingFinished", (event) => {
  const row = requests.get(event.requestId); if (row) row.encodedTransferBytes = event.encodedDataLength;
});
const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
const steps: unknown[] = [];
let outcome = "fail";
let failure: { message: string; stack?: string } | undefined;
try {
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("main [data-cell]").first().waitFor({ state: "visible" });
  const cold = await page.evaluate(() => ({
    atMs: performance.now(), canvasCount: document.querySelectorAll("canvas").length,
    resources: performance.getEntriesByType("resource").map((entry) => {
      const resource = entry as PerformanceResourceTiming;
      return { name: resource.name, initiator: resource.initiatorType, encodedBodyBytes: resource.encodedBodySize, decodedBodyBytes: resource.decodedBodySize, transferBytes: resource.transferSize, durationMs: resource.duration };
    }),
  }));
  assert.equal(cold.canvasCount, 0);
  const coldRequests = [...requests.values()].filter((row) => row.stage === "cold");
  if (proofCase === "lean") for (const chunk of artifact.threeDChunks) {
    assert.equal(coldRequests.some((row) => new URL(row.url).pathname.endsWith(chunk)), false, `HUD requested deferred 3D chunk ${chunk}`);
  }
  const scriptResources = cold.resources.filter((row) => row.initiator === "script" || /\.m?js(?:\?|$)/.test(row.name));
  steps.push({ step: "cold-entry", ...cold, scripts: { decodedBodyBytes: scriptResources.reduce((sum, row) => sum + row.decodedBodyBytes, 0), encodedBodyBytes: scriptResources.reduce((sum, row) => sum + row.encodedBodyBytes, 0), transferBytes: scriptResources.reduce((sum, row) => sum + row.transferBytes, 0) }, requests: coldRequests });

  stage = "native-board";
  const cursor = () => page.evaluate(() => [...document.querySelectorAll("main [data-cell]")].findIndex((cell) => cell.classList.contains("outline")));
  const originalCursor = await cursor(); assert.ok(originalCursor >= 0);
  await page.keyboard.press("ArrowRight");
  await page.evaluate((previous) => new Promise<void>((done, reject) => {
    const changed = () => [...document.querySelectorAll("main [data-cell]")].findIndex((cell) => cell.classList.contains("outline")) !== previous;
    if (changed()) { done(); return; }
    const timeout = setTimeout(() => { observer.disconnect(); reject(new Error("Native ArrowRight did not move board cursor")); }, 10000);
    const observer = new MutationObserver(() => { if (changed()) { clearTimeout(timeout); observer.disconnect(); done(); } });
    observer.observe(document.body, { subtree: true, attributes: true });
  }), originalCursor);
  const movedCursor = await cursor(); assert.equal(movedCursor, originalCursor + 1);
  await page.keyboard.press("Space");
  await page.locator('main [data-cell="filled"]').first().waitFor({ state: "visible" });
  steps.push({ step: "native-board", originalCursor, movedCursor, filledCells: await page.locator('main [data-cell="filled"]').count() });
  await page.screenshot({ path: resolve(evidence, "created-hud.png"), timeout: 10000 });

  stage = "developer-controls";
  await page.keyboard.down("F2"); await page.keyboard.press("KeyD"); await page.keyboard.up("F2");
  await page.getByRole("button", { name: "Tune", exact: true }).click();
  const row = page.locator('[title="engine/movement.walkSpeedMultiplier"]').locator("..");
  await row.getByRole("checkbox").check();
  const field = row.getByRole("spinbutton"); const originalValue = Number(await field.inputValue());
  const savedValue = originalValue + 0.125;
  await field.fill(String(savedValue)); await field.press("Tab");
  const readRuntime = () => page.evaluate(() => {
    const global = window as unknown as { __JG_DEVTOOLS?: { snapshotFull(): { game: string; controls: { name: string; value: unknown }[]; probes: Record<string, unknown> } } };
    const snapshot = global.__JG_DEVTOOLS?.snapshotFull();
    return { snapshot, stored: snapshot ? localStorage.getItem(`jg-devtools:${snapshot.game}`) : null };
  });
  const changed = await readRuntime();
  assert.equal(changed.snapshot?.controls.find((entry) => entry.name === "engine/movement.walkSpeedMultiplier")?.value, savedValue);
  assert.ok(changed.stored); assert.equal(JSON.parse(changed.stored).values["engine/movement.walkSpeedMultiplier"], savedValue);
  await page.getByRole("button", { name: "Tune", exact: true }).click();
  await page.keyboard.down("F2"); await page.keyboard.press("KeyD"); await page.keyboard.up("F2");
  assert.equal(new URL(page.url()).searchParams.has("debug"), false);
  stage = "closed-full-reload";
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("main [data-cell]").first().waitFor({ state: "visible" });
  await page.keyboard.press("ArrowRight");
  const restored = await readRuntime();
  assert.equal(restored.snapshot?.controls.find((entry) => entry.name === "engine/movement.walkSpeedMultiplier")?.value, savedValue, "Stored overrides must apply before visual developer UI opens");
  assert.ok(restored.snapshot?.probes["entities"] !== undefined, "Closed diagnostic probes remain installed");
  assert.equal(await page.getByRole("button", { name: "Tune", exact: true }).count(), 0);
  assert.equal(await page.locator("canvas").count(), 0);
  steps.push({ step: "saved-controls-closed-reload", originalValue, savedValue, restored });
  await page.screenshot({ path: resolve(evidence, "created-hud-reloaded.png"), timeout: 10000 });
  assert.deepEqual(errors, []); outcome = "pass";
} catch (error) {
  failure = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  throw error;
} finally {
  let browserClosed = false;
  try { await browser.close(); browserClosed = true; }
  finally {
    writeFileSync(resolve(evidence, "result.json"), JSON.stringify({ outcome, failure, proofCase, artifact, steps, requests: [...requests.values()], errors, cleanup: { browserClosed } }, null, 2));
  }
}

async function driveAuthorityCodeReload() {
const target = process.env["JG_HUD_AUTHORITY_URL"];
const realmTarget = process.env["JG_HUD_AUTHORITY_REALM_URL"];
const executablePath = process.env["CHROMIUM_PATH"];
const evidencePath = process.env["JG_HUD_AUTHORITY_EVIDENCE"];
const revision = process.env["JG_HUD_AUTHORITY_REVISION"];
assert.ok(target && realmTarget && executablePath && evidencePath && revision, "Declare the isolated frontend, realm, Chromium, evidence and expected revision");
const url = new URL(target);
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.equal(url.searchParams.get("game"), "hosted-authority");
url.searchParams.set("presentation", "recovery");
url.searchParams.set("actor", `recovery-proof-${randomUUID()}`);
const realm = new URL(realmTarget);
assert.ok(["127.0.0.1", "localhost"].includes(realm.hostname));
const ws = new URL("/ws", realm); ws.protocol = "ws:";
const identities = [];
for (const [base, component] of [[url, "frontend"], [realm, "realm"]] as const) {
  const response = await fetch(new URL("/__version", base), { signal: AbortSignal.timeout(5000) });
  assert.ok(response.ok);
  const identity = await response.json() as { component: string; revision: string };
  assert.equal(identity.component, component); assert.equal(identity.revision, revision); identities.push(identity);
}
const artifact = JSON.parse(readFileSync(process.env["JG_HUD_AUTHORITY_ARTIFACT"]!, "utf8")) as { entryChunk: string };
assert.ok(artifact.entryChunk);
const evidence = resolve(evidencePath); mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
await context.addInitScript(() => {
  const observations: { start: number; duration: number }[] = [];
  (window as unknown as { __jgRecoveryLongTasks: typeof observations }).__jgRecoveryLongTasks = observations;
  new PerformanceObserver((entries) => { for (const entry of entries.getEntries()) observations.push({ start: entry.startTime, duration: entry.duration }); }).observe({ type: "longtask", buffered: true });
  const keys: { type: string; code: string; target: string; prevented: boolean; epochMs: number; monotonicMs: number }[] = [];
  (window as unknown as { __jgRecoveryKeys: typeof keys }).__jgRecoveryKeys = keys;
  for (const type of ["keydown", "keyup"]) document.addEventListener(type, (event) => {
    const key = event as KeyboardEvent;
    if (key.code !== "KeyW") return;
    const monotonicMs = performance.now();
    const epochMs = performance.timeOrigin + monotonicMs;
    queueMicrotask(() => keys.push({ type, code: key.code, target: (key.target as Element | null)?.tagName ?? "none", prevented: key.defaultPrevented, epochMs, monotonicMs }));
  }, true);
  const wire: unknown[] = [];
  (window as unknown as { __jgRecoveryWire: unknown[] }).__jgRecoveryWire = wire;
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function(data) {
    if (typeof data === "string") {
      try {
        const packet = JSON.parse(data);
        if (packet.command === "engine.input") wire.push({ stage: "client-send", packet, epochMs: performance.timeOrigin + performance.now(), monotonicMs: performance.now(), bufferedAmount: this.bufferedAmount });
      } catch { /* Observation must not alter real sending. */ }
    }
    return send.call(this, data);
  };
  const inputIds = new Set<number>();
  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = new Proxy(OriginalWebSocket, {
    construct(Target, args) {
      const socket = Reflect.construct(Target, args) as WebSocket;
      const realSend = socket.send;
      socket.send = function(data) {
        try { if (typeof data === "string") { const packet = JSON.parse(data); if (packet.command === "engine.input") inputIds.add(packet.id); } } catch {}
        return realSend.call(this, data);
      };
      socket.addEventListener("message", event => {
        try {
          const packet = JSON.parse(String(event.data));
          if (packet.t === "reply" && inputIds.has(packet.id)) wire.push({ stage: "client-ack-delivery", packet, epochMs: performance.timeOrigin + performance.now(), monotonicMs: performance.now() });
        } catch {}
      });
      return socket;
    },
  });
  const state = window as unknown as { __jgRecoveryDrawArmed?: boolean };
  const seen = new WeakSet<object>();
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, ...args: Parameters<typeof originalGetContext>) {
    const value = originalGetContext.apply(this, args);
    if (value === null || !(value instanceof WebGLRenderingContext || value instanceof WebGL2RenderingContext) || seen.has(value)) return value;
    seen.add(value);
    const gl = value;
    let queued = false;
    let draws = 0;
    for (const method of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
      const methods = gl as unknown as Record<string, unknown>;
      const original = methods[method];
      if (typeof original !== "function") continue;
      methods[method] = (...parameters: number[]) => {
        original.apply(gl, parameters);
        draws++;
        if (!state.__jgRecoveryDrawArmed || queued || !(gl.canvas instanceof HTMLCanvasElement) || !gl.canvas.isConnected || gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null) return;
        queued = true;
        queueMicrotask(() => {
          queued = false;
          if (!state.__jgRecoveryDrawArmed || gl.isContextLost()) return;
          const started = performance.now();
          gl.finish();
          const pixel = new Uint8Array(4);
          gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          state.__jgRecoveryDrawArmed = false;
          document.dispatchEvent(new CustomEvent("jg-proof-completed-draw", { detail: { at: performance.now(), finishMs: performance.now() - started, draws, pixel: [...pixel], width: gl.drawingBufferWidth, height: gl.drawingBufferHeight } }));
        });
      };
    }
    return value;
  } as typeof originalGetContext;
});
const page = await context.newPage();
const errors: string[] = [], sockets: string[] = [], snapshots: unknown[] = [];
const requests: Record<string, number> = {};
const responses: { path: string; status: number }[] = [];
let frames = 0;
const inputPackets: unknown[] = [];
const inputRequests = new Map<number, { held: string[]; at: number }>();
const inputAcks: { id: number; held: string[]; result: unknown; at: number }[] = [];
const ackWaiters = new Set<() => void>();
const frameWaiters = new Set<() => void>();
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("request", (request) => { const path = new URL(request.url()).pathname; if (path.includes("ambientcg-grass001/")) requests[path] = (requests[path] ?? 0) + 1; });
page.on("response", (response) => { const path = new URL(response.url()).pathname; if (path.includes("ambientcg-grass001/")) responses.push({ path, status: response.status() }); });
type AuthorityPose = { tick: number; x: number; z: number; revision: number };
const authoritativePoses: AuthorityPose[] = [];
const poseWaiters = new Set<(pose: AuthorityPose) => void>();
let requestOrdinal = 0;
page.on("websocket", (socket) => {
  const socketRequests = new Map<number, { held: string[]; at: number; ordinal: number }>();
  sockets.push(socket.url());
  const connectionOrdinal = sockets.length;
  if (socket.url() !== ws.toString()) return;
  socket.on("framesent", ({ payload }) => {
    const packet = JSON.parse(typeof payload === "string" ? payload : payload.toString()) as { command?: string; id: number; input?: { held?: string[] } };
    if (packet.command !== "engine.input") return;
    const held = packet.input?.held ?? [];
    const ordinal = ++requestOrdinal;
    const request = { held, at: performance.now(), ordinal };
    socketRequests.set(packet.id, request);
    inputRequests.set(ordinal, request);
    inputPackets.push({ direction: "sent", at: performance.now(), connectionOrdinal, requestOrdinal: ordinal, packet });
  });
  socket.on("framereceived", ({ payload }) => {
    frames++; for (const notify of [...frameWaiters]) notify();
    const packet = JSON.parse(typeof payload === "string" ? payload : payload.toString()) as { t: string; id: number; result?: unknown; channel?: string; data?: { serverState?: WorldSyncFrame } };
    if (packet.t === "update" && packet.channel === "server") {
      const frame = packet.data?.serverState;
      const entries = frame?.kind === "baseline" ? frame.snapshot["store"] : frame?.kind === "diff" ? frame.diff.store : null;
      if (Array.isArray(entries)) {
        const entry = entries.find(entry => Array.isArray(entry) && entry[0] === `relay.view:${url.searchParams.get("actor")}`);
        const view = entry?.[1] as { ticks: number; position: number[] } | undefined;
        if (view?.position?.length === 3 && frame !== undefined) {
          const pose = { tick: view.ticks, x: view.position[0]!, z: view.position[2]!, revision: frame.revision };
          authoritativePoses.push(pose);
          for (const notify of [...poseWaiters]) notify(pose);
        }
      }
    }
    const request = socketRequests.get(packet.id);
    if (packet.t !== "reply" || request === undefined) return;
    inputPackets.push({ direction: "ack", at: performance.now(), connectionOrdinal, requestOrdinal: request.ordinal, packet });
    inputAcks.push({ id: request.ordinal, held: request.held, result: packet.result, at: performance.now() });
    for (const notify of [...ackWaiters]) notify();
  });
});
const waitNativeForwardAck = () => {
  const firstNewAck = inputAcks.length;
  const firstNewRequest = Math.max(0, ...inputRequests.keys());
  return new Promise<void>((resolveAck, reject) => {
    const done = () => {
      const ack = inputAcks.slice(firstNewAck).find((entry) => entry.id > firstNewRequest && entry.held.includes("moveForward"));
      if (ack === undefined) return;
      clearTimeout(deadline); ackWaiters.delete(done);
      if ((ack.result as { ok?: boolean } | undefined)?.ok !== true) { reject(new Error("Native held movement was rejected by the real authority")); return; }
      resolveAck();
    };
    const deadline = setTimeout(() => { ackWaiters.delete(done); reject(new Error("Native W did not reach an accepted engine.input acknowledgement within 25s")); }, 25000);
    ackWaiters.add(done);
  });
};
const waitNativeNeutralAck = () => {
  const firstNewAck = inputAcks.length;
  const firstNewRequest = Math.max(0, ...inputRequests.keys());
  return new Promise<void>((resolveAck, reject) => {
    const done = () => {
      const ack = inputAcks.slice(firstNewAck).find((entry) => entry.id > firstNewRequest && entry.held.length === 0);
      if (ack === undefined) return;
      clearTimeout(deadline); ackWaiters.delete(done);
      if ((ack.result as { ok?: boolean } | undefined)?.ok !== true) { reject(new Error("Native key release was rejected by the real authority")); return; }
      resolveAck();
    };
    const deadline = setTimeout(() => { ackWaiters.delete(done); reject(new Error("Native W release did not reach an accepted neutral engine.input acknowledgement within 25s")); }, 25000);
    ackWaiters.add(done);
  });
};
// Ground movement retains exponentially decaying velocity after neutral input.
// Observe three identical authoritative poses at advancing ticks before requiring
// exact stationary samples; a sustained held command can never satisfy this gate.
const waitNeutralSettled = (step: string) => new Promise<AuthorityPose>((resolvePose, reject) => {
  const samples: AuthorityPose[] = [];
  let previous: AuthorityPose | null = null;
  let identical = 0;
  const onPose = (pose: AuthorityPose) => {
    if (previous !== null && pose.tick <= previous.tick) return;
    samples.push(pose);
    identical = previous !== null && previous.x === pose.x && previous.z === pose.z ? identical + 1 : 0;
    previous = pose;
    if (identical < 2) return;
    clearTimeout(deadline); poseWaiters.delete(onPose);
    snapshots.push({ step, authoritativeSettled: pose, physicalDecaySamples: samples });
    resolvePose(pose);
  };
  const deadline = setTimeout(() => { poseWaiters.delete(onPose); reject(new Error("Neutral input did not settle over actual authoritative pose events within 6s")); }, 6000);
  poseWaiters.add(onPose);
});
const waitFrames = (count: number) => new Promise<void>((resolveWait, reject) => {
  const targetFrame = frames + count;
  const done = () => { if (frames < targetFrame) return; clearTimeout(deadline); frameWaiters.delete(done); resolveWait(); };
  const deadline = setTimeout(() => { frameWaiters.delete(done); reject(new Error("Expected actual realm frames did not arrive")); }, 6000);
  frameWaiters.add(done);
});
const read = () => page.evaluate(() => (window as unknown as { __jgProbe: () => Record<string, number> }).__jgProbe());
let outcome = "fail";
let failure: string | undefined;
let renderer: unknown = null;
let phase = "navigation";
const phases: { phase: string; elapsedMs: number }[] = [];
const started = performance.now();
const mark = (next: string) => { phase = next; phases.push({ phase, elapsedMs: Math.round(performance.now() - started) }); writeFileSync(resolve(evidence, "phases.json"), JSON.stringify(phases, null, 2)); };
try {
  const draw = () => page.evaluate(() => new Promise<unknown>((done, reject) => {
    const onDraw = (event: Event) => { clearTimeout(deadline); done((event as CustomEvent).detail); };
    const deadline = setTimeout(() => { document.removeEventListener("jg-proof-completed-draw", onDraw); reject(new Error("No actual completed renderer draw within 25s")); }, 25000);
    document.addEventListener("jg-proof-completed-draw", onDraw, { once: true });
    (window as unknown as { __jgRecoveryDrawArmed: boolean }).__jgRecoveryDrawArmed = true;
  }));
  const gesture = async (step: string) => {
    const forward = waitNativeForwardAck(); const neutral = waitNativeNeutralAck();
    await page.keyboard.press("w", { delay: 200 });
    await Promise.all([forward, neutral]); await waitNeutralSettled(step);
    return read();
  };
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.getByRole("heading", { name: "Relay material workshop", exact: true }).waitFor({ state: "visible", timeout: 25000 });
  await page.getByRole("button", { name: "Choose courier", exact: true }).click();
  await page.getByRole("button", { name: "Load textured ground", exact: true }).click();
  snapshots.push({ step: "baseline-completed-draw", draw: await draw() });
  await waitFrames(4);
  const before = await read(); assert.equal(before.textured, 1); assert.equal(before.controlsActive, 1);
  await page.mouse.click(900, 500);
  const saved = await gesture("baseline-neutral-settled"); assert.notEqual(saved.z, before.z);
  const oldClient = await page.evaluate(() => ({ timeOrigin: performance.timeOrigin, actor: document.querySelector('[data-testid="actor"]')?.textContent }));
  snapshots.push({ step: "baseline-saved-authority", ...saved, client: oldClient });
  let deny = true;
  const chunkPath = "/" + artifact.entryChunk;
  await page.route("**/" + artifact.entryChunk, async route => {
    if (deny) await route.fulfill({ status: 503, contentType: "text/javascript", body: "Temporary view code outage in isolated anonymous proof" });
    else await route.continue();
  });
  mark("actual-view-chunk-failure");
  const rejected = page.waitForResponse(response => new URL(response.url()).pathname === chunkPath && response.status() === 503, { timeout: 20000 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }); await rejected;
  const reload = page.getByRole("button", { name: "Reload game", exact: true });
  await reload.waitFor({ state: "visible", timeout: 25000 });
  assert.equal(await reload.evaluate(node => document.activeElement === node), true, "Actual failed code action receives focus");
  assert.equal(await page.getByRole("button", { name: "Retry display", exact: true }).count(), 0);
  await page.screenshot({ path: resolve(evidence, "view-code-failed.png"), timeout: 20000 });
  deny = false;
  const restored = page.waitForResponse(response => new URL(response.url()).pathname === chunkPath && response.status() === 200, { timeout: 25000 });
  mark("native-reload-restored-code");
  await reload.click(); await restored;
  await page.getByRole("heading", { name: "Relay material workshop", exact: true }).waitFor({ state: "visible", timeout: 25000 });
  await page.getByRole("button", { name: "Load textured ground", exact: true }).click();
  snapshots.push({ step: "new-client-completed-draw", draw: await draw() }); await waitFrames(4);
  const loaded = await read();
  const newClient = await page.evaluate(() => ({ timeOrigin: performance.timeOrigin, actor: document.querySelector('[data-testid="actor"]')?.textContent }));
  assert.notEqual(newClient.timeOrigin, oldClient.timeOrigin); assert.equal(newClient.actor, oldClient.actor);
  assert.equal(loaded.z, saved.z, "Backend saved courier pose survives normal new-client reload"); assert.ok(loaded.hostTick > saved.hostTick); assert.equal(loaded.controlsActive, 1);
  snapshots.push({ step: "saved-authority-new-client", ...loaded, client: newClient });
  await page.mouse.click(900, 500);
  const moved = await gesture("reloaded-neutral-settled"); assert.notEqual(moved.z, loaded.z);
  assert.ok(moved.z >= moved.groundMinZ && moved.z <= moved.groundMaxZ);
  await page.screenshot({ path: resolve(evidence, "view-code-reloaded.png"), timeout: 20000 });
  const captured = await read(); assert.equal(captured.z, moved.z);
  snapshots.push({ step: "native-movement-stationary-capture", ...captured });
  const unexpected = errors.filter(error => !error.includes(artifact.entryChunk) && !error.includes("Failed to fetch dynamically imported module") && !error.includes("503"));
  assert.deepEqual(unexpected, []); outcome = "pass";
} catch (error) { failure = String(error); throw error; }
finally {
  const wire = await page.evaluate(() => (window as unknown as { __jgRecoveryWire: unknown }).__jgRecoveryWire).catch(() => null);
  const serverTrace = await fetch(new URL("/__fixture/input-trace", ws.toString().replace(/^ws/, "http"))).then(response => response.json()).catch(() => null);
  const finalDom = await page.evaluate(() => ({ headings: [...document.querySelectorAll("h1,h2")].map(node => node.textContent), recovery: [...document.querySelectorAll("button")].map(node => node.textContent), canvasCount: document.querySelectorAll("canvas").length })).catch(() => null);
  await browser.close();
  writeFileSync(resolve(evidence, "result.json"), JSON.stringify({ outcome, failure, artifact, identities, sockets, frames, inputPackets, authoritativePoses, requests, responses, snapshots, wire, serverTrace, finalDom, errors, cleanup: { browserClosed: true } }, null, 2));
}

}
