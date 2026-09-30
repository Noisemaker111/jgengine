/** Drive the actual isolated material failure, realm continuity and display Retry controls. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import type { WorldSyncFrame } from "@jgengine/core/runtime/transport";

const target = process.env["JG_RECOVERY_PROOF_URL"];
const realmTarget = process.env["JG_RECOVERY_PROOF_REALM_URL"];
const executablePath = process.env["CHROMIUM_PATH"];
const evidencePath = process.env["JG_RECOVERY_PROOF_EVIDENCE"];
const revision = process.env["JG_RECOVERY_PROOF_REVISION"];
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
  const loadClicks: { epochMs: number; monotonicMs: number }[] = [];
  (window as unknown as { __jgRecoveryLoadClicks: typeof loadClicks }).__jgRecoveryLoadClicks = loadClicks;
  document.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest("button");
    if (button?.textContent === "Load textured ground") loadClicks.push({ epochMs: performance.timeOrigin + performance.now(), monotonicMs: performance.now() });
  }, true);
  const visibility: unknown[] = [];
  (window as unknown as { __jgRecoveryVisibility: unknown[] }).__jgRecoveryVisibility = visibility;
  const observeSurface = (phase: string) => {
    const wrapper = document.querySelector("canvas")?.closest("[tabindex]");
    visibility.push({ phase, at: performance.now(), active: document.activeElement?.tagName,
      connected: wrapper?.isConnected ?? false, rect: wrapper?.getBoundingClientRect().toJSON() ?? null,
      display: wrapper ? getComputedStyle(wrapper).display : null,
      ownsFocus: document.activeElement === wrapper,
      loading: document.querySelector("[data-shell-code-loading]") !== null });
  };
  document.addEventListener("focusin", () => observeSurface("focusin"), true);
  document.addEventListener("focusout", () => observeSurface("focusout"), true);
  document.addEventListener("DOMContentLoaded", () => {
    new MutationObserver((mutations) => {
      if (mutations.some(m => m.type === "attributes" && (m.target instanceof HTMLCanvasElement || m.target instanceof HTMLElement && m.target.hasAttribute("tabindex")) || m.type === "childList" && [...m.addedNodes, ...m.removedNodes].some(node => node instanceof Element && (node.matches("canvas,[tabindex],[data-shell-code-loading],[data-presentation-recovery]") || node.querySelector("canvas,[tabindex],[data-shell-code-loading],[data-presentation-recovery]"))))) observeSurface("surface-mutation");
    }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["style", "tabindex"], childList: true });
  }, { once: true });
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
          const owner = (window as unknown as { __jgProbe?: () => Record<string, number> }).__jgProbe?.();
          const surface = gl.canvas instanceof HTMLCanvasElement ? gl.canvas.closest("[tabindex]") : null;
          const bounds = surface?.getBoundingClientRect();
          if (owner?.renderAttached !== 1 || owner.textured !== 1 || owner.controlsActive !== 1 || !bounds || bounds.width === 0 || bounds.height === 0) return;
          const started = performance.now();
          gl.finish();
          const pixel = new Uint8Array(4);
          gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          state.__jgRecoveryDrawArmed = false;
          document.dispatchEvent(new CustomEvent("jg-proof-completed-draw", { detail: { owner, at: performance.now(), finishMs: performance.now() - started, draws, pixel: [...pixel], width: gl.drawingBufferWidth, height: gl.drawingBufferHeight } }));
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
page.on("websocket", (socket) => {
  sockets.push(socket.url());
  if (socket.url() !== ws.toString()) return;
  socket.on("framesent", ({ payload }) => {
    const packet = JSON.parse(typeof payload === "string" ? payload : payload.toString()) as { command?: string; id: number; input?: { held?: string[] } };
    if (packet.command !== "engine.input") return;
    const held = packet.input?.held ?? [];
    inputRequests.set(packet.id, { held, at: performance.now() });
    inputPackets.push({ direction: "sent", at: performance.now(), packet });
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
    const request = inputRequests.get(packet.id);
    if (packet.t !== "reply" || request === undefined) return;
    inputPackets.push({ direction: "ack", at: performance.now(), packet });
    inputAcks.push({ id: packet.id, held: request.held, result: packet.result, at: performance.now() });
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
let renderer: unknown = null;
let phase = "navigation";
const phases: { phase: string; elapsedMs: number }[] = [];
const started = performance.now();
const mark = (next: string) => { phase = next; phases.push({ phase, elapsedMs: Math.round(performance.now() - started) }); writeFileSync(resolve(evidence, "phases.json"), JSON.stringify(phases, null, 2)); };
try {
  let releaseFailure!: () => void;
  let materialRequested!: () => void;
  const failureResponse = new Promise<void>(resolveResponse => { releaseFailure = resolveResponse; });
  const materialRequest = new Promise<void>(resolveRequest => { materialRequested = resolveRequest; });
  await page.route("**/materials/ambientcg-grass001/color.jpg", async route => {
    materialRequested();
    await failureResponse;
    await route.fulfill({ status: 503, contentType: "text/plain", body: "Temporary material outage in isolated anonymous proof" });
  });
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.getByRole("heading", { name: "Relay material workshop", exact: true }).waitFor({ state: "visible", timeout: 20000 });
  await page.locator("canvas").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Choose courier", exact: true }).click();
  await waitFrames(12);
  const before = await read();
  assert.ok(before.contextLifetime > 0 && before.hostTick > 0); assert.equal(before.controlsActive, 1);
  assert.equal(await page.getByTestId("frontend-revision").textContent(), revision);
  snapshots.push({ step: "before-failure", ...before });
  mark("baseline-native-keyboard-movement");
  await page.mouse.click(900, 500);
  const baselineAck = waitNativeForwardAck();
  const baselineNeutralAck = waitNativeNeutralAck();
  await page.keyboard.press("w", { delay: 200 });
  await Promise.all([baselineAck, baselineNeutralAck]);
  await waitNeutralSettled("native-keyup-authoritative-settled");
  snapshots.push({ step: "baseline-native-movement", ...await read() });
  const baseline = await read(); assert.notEqual(baseline.z, before.z, "Authored courier must move before injecting the asset failure");
  mark("inspect-live-renderer");
  renderer = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!gl || !(gl instanceof WebGLRenderingContext || gl instanceof WebGL2RenderingContext)) return null;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const samples: number[][] = [];
    for (const x of [0.25, 0.5, 0.75]) for (const y of [0.25, 0.5, 0.75]) {
      const pixel = new Uint8Array(4);
      gl.readPixels(Math.floor(gl.drawingBufferWidth * x), Math.floor(gl.drawingBufferHeight * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      samples.push([...pixel]);
    }
    return { samples, distinctSamples: new Set(samples.map((pixel) => pixel.join(","))).size, width: canvas?.width, height: canvas?.height, vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  mark("trigger-material-failure");
  mark("held-native-input-before-material-load");
  const loadButton = page.getByRole("button", { name: "Load textured ground", exact: true });
  const loadBounds = await loadButton.boundingBox();
  assert.ok(loadBounds && loadBounds.width > 0 && loadBounds.height > 0);
  await page.mouse.click(900, 500);
  const heldFailureAck = waitNativeForwardAck();
  const failureNeutralAck = waitNativeNeutralAck();
  await page.keyboard.down("w");
  // Finish the real pointer gesture before observing delayed ACKs or evaluating the page.
  await page.mouse.click(loadBounds.x + loadBounds.width / 2, loadBounds.y + loadBounds.height / 2);
  await Promise.all([heldFailureAck, failureNeutralAck, materialRequest]);
  const gesture = await page.evaluate(() => ({
    keys: (window as unknown as { __jgRecoveryKeys: { type: string; code: string; target: string; epochMs: number }[] }).__jgRecoveryKeys,
    clicks: (window as unknown as { __jgRecoveryLoadClicks: { epochMs: number }[] }).__jgRecoveryLoadClicks,
    wire: (window as unknown as { __jgRecoveryWire: { stage: string; packet: { input?: { held?: string[] } }; epochMs: number }[] }).__jgRecoveryWire,
  }));
  const click = gesture.clicks.at(-1); assert.ok(click, "Native pointer must actually click Load textured ground");
  const key = gesture.keys.filter(key => key.type === "keydown" && key.code === "KeyW").at(-1);
  assert.ok(key && key.target === "DIV" && key.epochMs < click.epochMs);
  const held = gesture.wire.filter(event => event.stage === "client-send" && event.packet.input?.held?.includes("moveForward") && event.epochMs >= key.epochMs && event.epochMs < click.epochMs).at(-1);
  assert.ok(held, "Real held input must reach transport before the actual Load click");
  assert.equal(gesture.keys.filter(event => event.type === "keyup" && event.epochMs >= key.epochMs).length, 0, "Loading neutral must precede physical W release");
  snapshots.push({ step: "held-native-load-gesture", key, click, held, heldUntilClickMs: click.epochMs - key.epochMs });
  snapshots.push({ step: "pending-material-neutral", ...await read(), display: await page.evaluate(() => ({
    activeElement: document.activeElement?.tagName,
    canvas: [...document.querySelectorAll("canvas")].map(canvas => ({ connected: canvas.isConnected, display: getComputedStyle(canvas).display, bounds: { width: canvas.getBoundingClientRect().width, height: canvas.getBoundingClientRect().height } })),
    loadingText: document.body.innerText.includes("Loading game view"),
  })) });
  releaseFailure();
  const retry = page.getByRole("button", { name: "Retry display", exact: true });
  await retry.waitFor({ state: "visible", timeout: 15000 });
  await page.getByRole("alert").filter({ hasText: "Could not load /materials/ambientcg-grass001/color.jpg" }).waitFor({ state: "visible" });
  await failureNeutralAck;
  await waitNeutralSettled("failure-held-key-authoritative-settled");
  const failed = await read(); assert.equal(failed.contextLifetime, before.contextLifetime); assert.equal(failed.controlsActive, 0);
  await waitFrames(20);
  const failedLater = await read(); assert.equal(failedLater.contextLifetime, before.contextLifetime); assert.ok(failedLater.hostTick > failed.hostTick); assert.equal(failedLater.z, failed.z); assert.equal(failedLater.controlsActive, 0);
  await page.keyboard.up("w");
  snapshots.push({ step: "failed", ...failed }, { step: "realm-keeps-running", ...failedLater });
  assert.equal(await page.getByRole("heading", { name: "The game view couldn’t load", exact: true }).count(), 1);
  const details = page.locator('[data-presentation-recovery="failed"] details');
  assert.equal(await details.getAttribute("open"), null);
  assert.equal(await page.getByText("Copy error", { exact: true }).isVisible(), false);
  mark("capture-failure-screen");
  await page.screenshot({ path: resolve(evidence, "material-workshop-failed.png"), animations: "disabled", timeout: 20000 });
  await page.unroute("**/materials/ambientcg-grass001/color.jpg");
  mark("retry-restored-material");
  const restoredResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/materials/ambientcg-grass001/color.jpg" && response.status() === 200, { timeout: 25000 });
  let resolveDraw!: (draw: unknown) => void;
  const drawObserved = new Promise<unknown>(resolveObserved => { resolveDraw = resolveObserved; });
  await page.exposeFunction("__jgProofRecoveredDraw", resolveDraw);
  await page.evaluate(() => {
    document.addEventListener("jg-proof-completed-draw", (event) => {
      void (window as unknown as { __jgProofRecoveredDraw: (draw: unknown) => Promise<void> }).__jgProofRecoveredDraw((event as CustomEvent).detail);
    }, { once: true });
    (window as unknown as { __jgRecoveryDrawArmed: boolean }).__jgRecoveryDrawArmed = true;
  });
  let drawDeadline: ReturnType<typeof setTimeout>;
  const completedDrawWithinDeadline = Promise.race([drawObserved, new Promise<never>((_, reject) => {
    drawDeadline = setTimeout(() => reject(new Error("No completed restored renderer draw within 25s of Retry")), 25000);
  })]);
  void completedDrawWithinDeadline.catch(() => {});
  try {
    await retry.click();
    await restoredResponse;
    mark("await-actual-recovered-draw");
    const completedDraw = await completedDrawWithinDeadline;
    snapshots.push({ step: "actual-completed-recovered-draw", completedDraw });
  } finally { clearTimeout(drawDeadline!); }
  mark("await-recovered-realm-frames");
  await waitFrames(15);
  const recovered = await read(); assert.equal(recovered.contextLifetime, before.contextLifetime); assert.equal(recovered.textured, 1); assert.equal(recovered.controlsActive, 1); assert.ok(recovered.hostTick > failedLater.hostTick);
  assert.equal(sockets.filter((value) => value === ws.toString()).length, 1, "Retry must retain the actual realm connection");
  for (const name of ["color", "normal", "roughness", "ao"]) {
    const path = `/materials/ambientcg-grass001/${name}.jpg`;
    assert.ok(requests[path] >= (name === "color" ? 2 : 1), "Retry must refetch the rejected image while successful shared image-cache entries survive");
    assert.ok(responses.some((response) => response.path === path && response.status === 200), "The restored material must return through the real asset server");
  }
  snapshots.push({ step: "recovered", ...recovered });
  mark("fresh-native-keyboard-movement");
  const recoveredAck = waitNativeForwardAck();
  const recoveredNeutralAck = waitNativeNeutralAck();
  // Complete the normal key gesture before waiting on delayed browser ACK delivery/rendering.
  // Otherwise the QA wait itself deliberately holds movement through expensive frames.
  await page.keyboard.press("w", { delay: 200 });
  await Promise.all([recoveredAck, recoveredNeutralAck]);
  await waitNeutralSettled("native-keyup-authoritative-settled");
  const moved = await read();
   assert.notEqual(moved.z, recovered.z); assert.equal(moved.contextLifetime, before.contextLifetime);
  snapshots.push({ step: "fresh-keyboard-movement", ...moved });
  assert.equal(await page.getByText("JG engine error", { exact: true }).count(), 0, "An actual recovered draw must retire only its handled presentation diagnostic");
  await waitFrames(4);
  const released = await read();
  snapshots.push({ step: "neutral-accepted-before-capture", ...released });
  assert.equal(released.renderAttached, 1);
  assert.ok(released.x >= released.groundMinX && released.x <= released.groundMaxX && released.z >= released.groundMinZ && released.z <= released.groundMaxZ, "The real released courier must remain on the editor-authored rendered terrain");
  mark("capture-recovered-display");
  await page.screenshot({ path: resolve(evidence, "material-workshop-recovered.png"), animations: "disabled", timeout: 20000 });
  const afterCapture = await read();
  snapshots.push({ step: "captured-stable-neutral-courier", ...afterCapture });
  assert.equal(afterCapture.z, released.z, "Accepted native key release must keep the authoritative courier stationary during capture");
  const unexpected = errors.filter((message) => !message.includes("Could not load /materials/ambientcg-grass001/color.jpg") && !message.includes("503"));
  assert.deepEqual(unexpected, []);
  outcome = "pass";
} finally {
  const wire = await page.evaluate(() => (window as unknown as { __jgRecoveryWire: unknown }).__jgRecoveryWire).catch(() => null);
  const serverTrace = await fetch(new URL("/__fixture/input-trace", ws.toString().replace(/^ws/, "http"))).then(response => response.json()).catch(() => null);
  const loadClicks = await page.evaluate(() => (window as unknown as { __jgRecoveryLoadClicks: unknown }).__jgRecoveryLoadClicks).catch(() => null);
  const nativeKeys = await page.evaluate(() => (window as unknown as { __jgRecoveryKeys: unknown }).__jgRecoveryKeys).catch(() => null);
  const longTasks = await page.evaluate(() => (window as unknown as { __jgRecoveryLongTasks: unknown }).__jgRecoveryLongTasks).catch(() => null);
  const recoveryLifecycle = await page.evaluate(() => ({ visibility: (window as unknown as { __jgRecoveryVisibility: unknown }).__jgRecoveryVisibility, runtime: (window as unknown as { __JG_DEVTOOLS?: { snapshot: () => unknown } }).__JG_DEVTOOLS?.snapshot() })).catch(() => null);
  const finalDom = await page.evaluate(() => ({ title: document.title, headings: Array.from(document.querySelectorAll("h1,h2")).map((node) => node.textContent), recovery: Array.from(document.querySelectorAll("[data-presentation-recovery],button")).map((node) => ({ text: node.textContent, recovery: node.getAttribute("data-presentation-recovery"), rect: node.getBoundingClientRect().toJSON() })), canvasCount: document.querySelectorAll("canvas").length })).catch(() => null);
  writeFileSync(resolve(evidence, "result.json"), JSON.stringify({ outcome, recoveryLifecycle, inputPackets, wire, serverTrace, authoritativePoses, nativeKeys, loadClicks, finalDom, finalPhase: phase, phases, longTasks, viewport: { width: 1024, height: 640 }, renderer, identities, sockets, frames, requests, responses, snapshots, expectedAssetFailure: "/materials/ambientcg-grass001/color.jpg", errors }, null, 2));
  await context.close(); await browser.close();
}
