/** Drive the real Relay Courtyard settings controls against its owned anonymous native host. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import type { WorldSyncFrame } from "@jgengine/core/runtime/transport";

const target = process.env["JG_SETTINGS_PROOF_URL"];
const realmTarget = process.env["JG_SETTINGS_PROOF_REALM_URL"];
const executablePath = process.env["CHROMIUM_PATH"];
const evidencePath = process.env["JG_SETTINGS_PROOF_EVIDENCE"];
const expectedRevision = process.env["JG_SETTINGS_PROOF_REVISION"];
if (!target || !realmTarget || !executablePath || !evidencePath || !expectedRevision) {
  throw new Error("Set JG_SETTINGS_PROOF_URL, JG_SETTINGS_PROOF_REALM_URL, CHROMIUM_PATH, JG_SETTINGS_PROOF_EVIDENCE and JG_SETTINGS_PROOF_REVISION for the owned native host.");
}
const url = new URL(target);
assert.equal(url.searchParams.get("game"), "hosted-authority");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "Only the isolated anonymous loopback fixture is supported");
url.searchParams.set("actor", `settings-proof-${randomUUID()}`);
const evidence = resolve(evidencePath);
mkdirSync(evidence, { recursive: true });
const host = await fetch(new URL("/__version", url), { signal: AbortSignal.timeout(5000) });
assert.ok(host.ok, "Native fixture frontend revision endpoint must be ready");
const identity = await host.json() as { revision: string; component: string };
assert.equal(identity.component, "frontend");
assert.equal(identity.revision, expectedRevision);
const realmUrl = new URL(realmTarget);
assert.ok(["127.0.0.1", "localhost"].includes(realmUrl.hostname), "Realm must be an anonymous loopback fixture");
assert.equal(realmUrl.protocol, "http:");
const expectedWebSocket = new URL("/ws", realmUrl);
expectedWebSocket.protocol = "ws:";
realmUrl.pathname = "/__version";
const realmResponse = await fetch(realmUrl, { signal: AbortSignal.timeout(5000) });
assert.ok(realmResponse.ok, "Native fixture realm revision endpoint must be ready");
const realmIdentity = await realmResponse.json() as { revision: string; component: string };
assert.equal(realmIdentity.component, "realm");
assert.equal(realmIdentity.revision, expectedRevision);
const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => {
  const keys: unknown[] = [];
  (window as unknown as { __jgSettingsKeys: unknown[] }).__jgSettingsKeys = keys;
  for (const type of ["keydown", "keyup"]) document.addEventListener(type, event => {
    const key = event as KeyboardEvent;
    if (key.code !== "KeyW") return;
    queueMicrotask(() => keys.push({ type, code: key.code, key: key.key, target: (key.target as Element | null)?.tagName, prevented: key.defaultPrevented, at: performance.timeOrigin + performance.now() }));
  }, true);
});
const page = await context.newPage();
page.setDefaultTimeout(5000);
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
const snapshots: unknown[] = [];
const websockets: string[] = [];

let frames = 0;
const inputPackets: unknown[] = [];
const inputRequests = new Map<number, { held: string[]; at: number }>();
const inputAcks: { id: number; held: string[]; result: unknown; at: number }[] = [];
const ackWaiters = new Set<() => void>();
const frameWaiters = new Set<() => void>();
let requestOrdinal = 0;
type AuthorityPose = { tick: number; x: number; z: number; revision: number };
const authoritativePoses: AuthorityPose[] = [];
const poseWaiters = new Set<(pose: AuthorityPose) => void>();
page.on("websocket", (socket) => {
  websockets.push(socket.url());
  if (socket.url() !== expectedWebSocket.toString()) return;
  const socketRequests = new Map<number, { held: string[]; at: number; ordinal: number }>();
  socket.on("framesent", ({ payload }) => {
    const packet = JSON.parse(typeof payload === "string" ? payload : payload.toString()) as { command?: string; id: number; input?: { held?: string[] } };
    if (packet.command !== "engine.input") return;
    const held = packet.input?.held ?? [];
    const request = { held, at: performance.now(), ordinal: ++requestOrdinal };
    socketRequests.set(packet.id, request);
    inputRequests.set(request.ordinal, request);
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
    const request = socketRequests.get(packet.id);
    if (packet.t !== "reply" || request === undefined) return;
    inputPackets.push({ direction: "ack", at: performance.now(), packet });
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
let outcome: "pass" | "fail" = "fail";
try {
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.getByRole("heading", { name: "Relay Courtyard", exact: true }).waitFor({ state: "visible" });
  assert.equal(await page.getByTestId("frontend-revision").textContent(), expectedRevision);
  await page.getByTestId("copper").filter({ hasText: /^\d/ }).waitFor({ state: "visible" });
  assert.ok(websockets.includes(expectedWebSocket.toString()), "The actual client must connect to the owned realm endpoint");
  const snapshot = async (step: string, style: string, fontSize: string) => {
    const state = await page.evaluate(() => {
      const readout = document.querySelector('[data-testid="copper"]');
      return { style: document.querySelector("main")?.getAttribute("data-readout-style"),
        saved: localStorage.getItem("jgengine:setting:relay.readoutStyle"),
        fontSize: readout ? getComputedStyle(readout).fontSize : null,
        cardHeight: readout?.parentElement?.getBoundingClientRect().height ?? 0,
        cardPadding: readout?.parentElement ? getComputedStyle(readout.parentElement).paddingTop : null };
    });
    assert.equal(state.style, style);
    assert.equal(state.fontSize, fontSize);
    snapshots.push({ step, ...state });
    return state;
  };
  const initial = await snapshot("initial", "detailed", "30px");
  assert.equal(initial.cardPadding, "20px");
  await page.screenshot({ animations: "disabled", path: resolve(evidence, "courtyard-detailed.png"), timeout: 10000 });
  await page.getByRole("button", { name: "Display settings", exact: true }).click();
  const group = page.getByRole("group", { name: "Readout style", exact: true });
  await group.getByRole("button", { name: "Detailed", pressed: true, exact: true }).waitFor({ state: "visible" });
  assert.equal(await group.getByRole("button", { name: "Compact", pressed: false, exact: true }).count(), 1);
  writeFileSync(resolve(evidence, "settings-initial-aria.txt"), await group.ariaSnapshot());
  await page.screenshot({ animations: "disabled", path: resolve(evidence, "settings-detailed.png"), timeout: 10000 });
  await group.getByRole("button", { name: "Compact", exact: true }).click();
  await group.getByRole("button", { name: "Compact", pressed: true, exact: true }).waitFor({ state: "visible" });
  assert.equal(await group.getByRole("button", { name: "Detailed", pressed: false, exact: true }).count(), 1);
  const compact = await snapshot("selected-compact", "compact", "22px");
  assert.equal(compact.saved, JSON.stringify("compact"));
  assert.equal(compact.cardPadding, "12px");
  assert.ok(compact.cardHeight < initial.cardHeight, "The real compact readout layout must shrink the cards");
  writeFileSync(resolve(evidence, "settings-compact-aria.txt"), await group.ariaSnapshot());
  await page.screenshot({ animations: "disabled", path: resolve(evidence, "settings-compact.png"), timeout: 10000 });
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.screenshot({ animations: "disabled", path: resolve(evidence, "courtyard-compact.png"), timeout: 10000 });
  await page.getByRole("button", { name: "Display settings", exact: true }).click();
  await group.getByRole("button", { name: "Compact", pressed: true, exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  await page.getByRole("button", { name: "Display settings", exact: true }).click();
  await group.getByRole("button", { name: "Compact", pressed: true, exact: true }).waitFor({ state: "visible" });
  const reloaded = await snapshot("full-reload", "compact", "22px");
  assert.equal(reloaded.saved, JSON.stringify("compact"));
  writeFileSync(resolve(evidence, "settings-reloaded-aria.txt"), await group.ariaSnapshot());
  await page.screenshot({ animations: "disabled", path: resolve(evidence, "settings-reloaded.png"), timeout: 10000 });
  await group.getByRole("button", { name: "Detailed", exact: true }).focus();
  await page.keyboard.press("Tab");
  assert.equal(await group.getByRole("button", { name: "Compact", exact: true }).evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Shift+Tab");
  assert.equal(await group.getByRole("button", { name: "Detailed", exact: true }).evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Space");
  await group.getByRole("button", { name: "Detailed", pressed: true, exact: true }).waitFor({ state: "visible" });
  const keyboard = await snapshot("keyboard-detailed", "detailed", "30px");
  assert.equal(keyboard.saved, JSON.stringify("detailed"));
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  const telemetry = () => page.evaluate(() => ({
    tick: Number(document.querySelector('[data-testid="host-tick"]')?.textContent),
    pose: (document.querySelector('[data-testid="pose"]')?.textContent ?? "").split(",").map(Number),
    controls: document.querySelector('[data-testid="controls-state"]')?.textContent,
    casts: Number(document.querySelector('[data-testid="signals"]')?.textContent),
  }));
  const advanceHost = async (ticks: number) => {
    const initial = await telemetry();
    await page.evaluate(({ target }) => new Promise<void>((resolve, reject) => {
      const tick = document.querySelector('[data-testid="host-tick"]');
      if (!tick) throw Error("The live host tick readout is required");
      const observer = new MutationObserver(() => {
        if (Number(tick.textContent) < target) return;
        observer.disconnect(); clearTimeout(deadline); resolve();
      });
      const deadline = setTimeout(() => { observer.disconnect(); reject(Error("Host tick event did not advance")); }, 5000);
      observer.observe(tick, { childList: true, characterData: true, subtree: true });
      if (Number(tick.textContent) >= target) { observer.disconnect(); clearTimeout(deadline); resolve(); }
    }), { target: initial.tick + ticks });
    return telemetry();
  };
  const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((value, index) => value - b[index]!));
  const heading = page.getByRole("heading", { name: "Relay Courtyard", exact: true });
  await page.getByRole("button", { name: "Choose courier · 3 copper", exact: true }).click();
  await page.getByTestId("command-result").filter({ hasText: "class.choose: applied" }).waitFor({ state: "visible" });
  await heading.click();
  const beforeMove = await telemetry();
  assert.equal(beforeMove.controls, "Controls active");
  snapshots.push({ step: "before-native-key", focus: await page.evaluate(() => ({ tag: document.activeElement?.tagName, tabIndex: (document.activeElement as HTMLElement | null)?.tabIndex })) });
  const forwardAck = waitNativeForwardAck();
  await page.keyboard.down("KeyW");
  await forwardAck;
  const moved = await advanceHost(10);
  assert.ok(distance(beforeMove.pose, moved.pose) > 0.1, "Real keyboard input must move the hosted courier");
  await page.getByRole("button", { name: "Display settings", exact: true }).click();
  await group.getByRole("button", { name: "Detailed", pressed: true, exact: true }).waitFor({ state: "visible" });
  const suspended = await advanceHost(6);
  assert.equal(suspended.controls, "Controls paused");
  const stillSuspended = await advanceHost(20);
  assert.ok(distance(suspended.pose, stillSuspended.pose) < 0.01, "Settings must suppress movement while host ticks continue");
  assert.equal(stillSuspended.casts, suspended.casts);
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  const resumedWithoutPress = await advanceHost(12);
  assert.equal(resumedWithoutPress.controls, "Controls active");
  assert.ok(distance(stillSuspended.pose, resumedWithoutPress.pose) < 0.01, "A physically held key must not leak back into play after close");
  await page.keyboard.up("KeyW");
  const freshAck = waitNativeForwardAck();
  await page.keyboard.down("KeyW");
  await freshAck;
  const freshMovement = await advanceHost(10);
  assert.ok(distance(resumedWithoutPress.pose, freshMovement.pose) > 0.1, "Fresh keyboard input must resume movement");
  const freshNeutralAck = waitNativeNeutralAck();
  await page.keyboard.up("KeyW");
  await freshNeutralAck;
  await advanceHost(6);
  await page.getByRole("button", { name: "Pause controls", exact: true }).click();
  await page.getByRole("button", { name: "Display settings", exact: true }).click();
  await page.getByRole("switch", { name: "Pause courier controls", checked: true, exact: true }).click();
  await page.getByRole("switch", { name: "Pause courier controls", checked: false, exact: true }).waitFor({ state: "visible" });
  const nested = await advanceHost(6);
  assert.equal(nested.controls, "Controls paused", "Releasing the courier owner must preserve settings' independent lease");
  const nestedStill = await advanceHost(20);
  assert.ok(distance(nested.pose, nestedStill.pose) < 0.01);
  await page.screenshot({ animations: "disabled", path: resolve(evidence, "settings-nested-suspension.png"), timeout: 10000 });
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  const finalRelease = await telemetry();
  assert.equal(finalRelease.controls, "Controls active");
  const finalAck = waitNativeForwardAck();
  await page.keyboard.down("KeyW");
  await finalAck;
  const finalMovement = await advanceHost(10);
  assert.ok(distance(finalRelease.pose, finalMovement.pose) > 0.1, "Final owner release must permit real keyboard movement");
  const finalNeutralAck = waitNativeNeutralAck();
  await page.keyboard.up("KeyW");
  await finalNeutralAck;
  snapshots.push({ step: "control-suspension", beforeMove, moved, suspended, stillSuspended, resumedWithoutPress, freshMovement, nested, nestedStill, finalRelease, finalMovement });
  await page.screenshot({ animations: "disabled", path: resolve(evidence, "courtyard-controls-resumed.png"), timeout: 10000 });
  await page.getByRole("button", { name: "Accept first signal", exact: true }).click();
  await page.getByTestId("command-result").filter({ hasText: "quest.accept: applied" }).waitFor({ state: "visible" });
  snapshots.push({ step: "existing-authority-command", result: await page.getByTestId("command-result").textContent() });
  await page.screenshot({ animations: "disabled", path: resolve(evidence, "courtyard-after-settings.png"), timeout: 10000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Display settings", exact: true }).click();
  await group.getByRole("button", { name: "Detailed", pressed: true, exact: true }).waitFor({ state: "visible" });
  await group.getByRole("button", { name: "Compact", exact: true }).click();
  await group.getByRole("button", { name: "Compact", pressed: true, exact: true }).waitFor({ state: "visible" });
  await page.screenshot({ animations: "disabled", path: resolve(evidence, "settings-mobile.png"), timeout: 10000 });
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.screenshot({ animations: "disabled", path: resolve(evidence, "courtyard-mobile.png"), timeout: 10000 });
  snapshots.push({ step: "mobile-compact", ...(await snapshot("mobile-readout", "compact", "22px")) });
  assert.deepEqual(errors, [], "Native page must not report runtime or console errors");
  outcome = "pass";
} catch (error) {
  errors.push(error instanceof Error ? error.stack ?? error.message : String(error));
  writeFileSync(resolve(evidence, "failure-dom.html"), await page.content().catch(() => "DOM capture failed"));
  writeFileSync(resolve(evidence, "failure-aria.txt"), await page.locator("body").ariaSnapshot().catch(() => "ARIA capture failed"));
  throw error;
} finally {
  writeFileSync(resolve(evidence, "result.json"), JSON.stringify({ outcome, inputPackets, authoritativePoses, nativeKeys: await page.evaluate(() => (window as unknown as { __jgSettingsKeys?: unknown[] }).__jgSettingsKeys ?? []).catch(() => []), identity, realmIdentity, actor: url.searchParams.get("actor"), websockets, snapshots, errors }, null, 2) + "\n");
  await browser.close();
  console.log(JSON.stringify({ outcome, evidence, revision: identity.revision }));
}
