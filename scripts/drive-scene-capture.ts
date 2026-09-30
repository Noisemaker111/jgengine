/** Drive the default Photo control and inspect its actual browser-downloaded PNG. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { inflateSync } from "node:zlib";
import { chromium, type Page } from "playwright-core";

const target = process.env["JG_PHOTO_PROOF_URL"];
const executablePath = process.env["CHROMIUM_PATH"];
const output = process.env["JG_PHOTO_PROOF_EVIDENCE"];
const expectedRevision = process.env["JG_PHOTO_PROOF_REVISION"];
if (!target || !executablePath || !output || !expectedRevision) throw new Error("Set JG_PHOTO_PROOF_URL, JG_PHOTO_PROOF_REVISION, CHROMIUM_PATH and JG_PHOTO_PROOF_EVIDENCE for the owned native host.");
const url = new URL(target);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Only an owned anonymous loopback host is supported");
assert.equal(url.searchParams.get("game"), "hosted-authority", "Use the original configured hosted game, with its recovery presentation");
assert.equal(url.searchParams.get("presentation"), "recovery");
const actor = url.searchParams.get("actor") ?? `photo-${randomUUID()}`;
url.searchParams.set("actor", actor);
const realm = new URL(process.env["JG_PHOTO_PROOF_REALM_URL"] ?? "http://127.0.0.1:4635");
assert.ok(["localhost", "127.0.0.1"].includes(realm.hostname));
const ws = new URL("/ws", realm); ws.protocol = "ws:";
const evidence = resolve(output);
mkdirSync(evidence, { recursive: true });
const result: Record<string, unknown> = { url: url.href, outcome: "pending", browserClosed: false };
const save = () => writeFileSync(resolve(evidence, "result.json"), JSON.stringify(result, null, 2));
result.phase = "launching-browser"; save();
const browser = await chromium.launch({ executablePath, headless: true, chromiumSandbox: process.platform === "win32", ...(process.platform === "win32" ? {} : { args: ["--no-sandbox"] }) });

/** Decode the actual browser PNG, preserving all pixel values and filter types. */
function inspectPng(png: Buffer) {
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(png[24], 8, "Canvas PNG must contain 8-bit samples");
  assert.ok(png[25] === 2 || png[25] === 6, "Inspect RGB or RGBA canvas pixels");
  assert.equal(png[28], 0, "Inspect non-interlaced canvas PNG");
  const channels = png[25] === 6 ? 4 : 3, stride = width * channels;
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.subarray(offset + 4, offset + 8).toString();
    if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const encoded = inflateSync(Buffer.concat(chunks));
  assert.equal(encoded.length, height * (stride + 1));
  let previous = Buffer.alloc(stride), nonblack = 0, opaque = 0;
  const palette = new Set<string>();
  const paeth = (a: number, b: number, c: number) => { const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c); return da <= db && da <= dc ? a : db <= dc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = encoded[y * (stride + 1)]!, row = Buffer.from(encoded.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    assert.ok(filter <= 4);
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels]! : 0, up = previous[i]!, upperLeft = i >= channels ? previous[i - channels]! : 0;
      row[i] = (row[i]! + (filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : 0)) & 255;
    }
    for (let x = 0; x < width; x++) {
      const i = x * channels, r = row[i]!, g = row[i + 1]!, b = row[i + 2]!, a = channels === 4 ? row[i + 3]! : 255;
      if (a > 0) opaque++;
      if (a > 0 && r + g + b > 24) nonblack++;
      palette.add(`${r >> 3},${g >> 3},${b >> 3},${a >> 3}`);
    }
    previous = row;
  }
  assert.ok(nonblack > width * height * 0.01 && palette.size > 16, "Downloaded normal world must have nonblack, varying pixels");
  return { width, height, opaque, nonblack, quantizedColors: palette.size };
}

async function photoReady(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolveReady, reject) => {
    const ready = () => Array.from(document.querySelectorAll<HTMLButtonElement>("[data-shell-photo-controls] button")).some((button) => button.textContent === "Photo" && !button.disabled);
    if (ready()) { resolveReady(); return; }
    const observer = new MutationObserver(() => { if (ready()) { observer.disconnect(); clearTimeout(deadline); resolveReady(); } });
    const deadline = setTimeout(() => { observer.disconnect(); reject(new Error("Default Photo renderer binding did not become ready")); }, 25000);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
  }));
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors: string[] = [];
  type Pose = { tick: number; x: number; z: number; connection: number };
  const poses: Pose[] = [], inputs: unknown[] = [], sockets: string[] = [];
  const poseListeners = new Set<(pose: Pose) => void>();
  const ackListeners = new Set<(ack: { held: string[]; result: unknown; ordinal: number }) => void>();
  const textureResponses: unknown[] = [];
  let downloads = 0, requestOrdinal = 0;
  result.poses = poses; result.inputs = inputs; result.sockets = sockets; result.textureResponses = textureResponses; result.errors = errors;
  page.on("response", response => { if (new URL(response.url()).pathname.includes("ambientcg-grass001/")) textureResponses.push({ url: response.url(), status: response.status() }); });
  page.on("download", () => { downloads++; });
  page.on("websocket", socket => {
    sockets.push(socket.url());
    if (socket.url() !== ws.href) return;
    const connection = sockets.length;
    const requests = new Map<number, { held: string[]; ordinal: number }>();
    socket.on("framesent", ({ payload }) => {
      const packet = JSON.parse(String(payload));
      if (packet.command !== "engine.input") return;
      requests.set(packet.id, { held: packet.input?.held ?? [], ordinal: ++requestOrdinal }); inputs.push({ direction: "sent", connection, packet });
    });
    socket.on("framereceived", ({ payload }) => {
      const packet = JSON.parse(String(payload));
      if (packet.t === "reply" && requests.has(packet.id)) {
        const ack = { ...requests.get(packet.id)!, result: packet.result };
        inputs.push({ direction: "ack", connection, packet, held: ack.held, ordinal: ack.ordinal });
        for (const listener of [...ackListeners]) listener(ack);
      }
      if (packet.t !== "update" || packet.channel !== "server") return;
      const frame = packet.data?.serverState;
      const entries = frame?.kind === "baseline" ? frame.snapshot.store : frame?.kind === "diff" ? frame.diff.store : null;
      if (!Array.isArray(entries)) return;
      const view = entries.find(entry => Array.isArray(entry) && entry[0] === `relay.view:${actor}`)?.[1];
      if (!Array.isArray(view?.position)) return;
      const pose = { tick: view.ticks, x: view.position[0], z: view.position[2], connection };
      poses.push(pose); for (const listener of [...poseListeners]) listener(pose);
    });
  });
  const waitPose = (predicate: (pose: Pose) => boolean, message: string) => new Promise<Pose>((done, reject) => {
    const listener = (pose: Pose) => { if (predicate(pose)) { clearTimeout(deadline); poseListeners.delete(listener); done(pose); } };
    const deadline = setTimeout(() => { poseListeners.delete(listener); reject(new Error(message)); }, 25000);
    poseListeners.add(listener);
  });
  const settle = () => { let previous: Pose | undefined, equal = 0; return waitPose(pose => {
    if (previous && pose.tick <= previous.tick) return false;
    equal = previous && pose.x === previous.x && pose.z === previous.z ? equal + 1 : 0; previous = pose; return equal >= 2;
  }, "Neutral input must settle at three identical advancing authoritative positions"); };
  const waitAck = (afterOrdinal: number, held: boolean) => {
    const promise = new Promise<void>((done, reject) => {
      const listener = (ack: { held: string[]; result: unknown; ordinal: number }) => {
        if (ack.ordinal <= afterOrdinal || (held ? !ack.held.includes("moveForward") : ack.held.length !== 0)) return;
        clearTimeout(deadline); ackListeners.delete(listener);
        if ((ack.result as { ok?: boolean })?.ok !== true) reject(new Error("Authority rejected native input")); else done();
      };
      const deadline = setTimeout(() => { ackListeners.delete(listener); reject(new Error(`Native ${held ? "held W" : "release"} must be accepted by the real host`)); }, 25000);
      ackListeners.add(listener);
    });
    void promise.catch(() => {});
    return promise;
  };
  const forward = async (step: string) => {
    const baseline = poses.at(-1); assert.ok(baseline);
    const heldAck = waitAck(requestOrdinal, true);
    const moved = waitPose(pose => pose.tick > baseline.tick && Math.hypot(pose.x - baseline.x, pose.z - baseline.z) > 0.25, "Fresh native W must move the real authoritative courier");
    void moved.catch(() => {});
    await page.keyboard.down("KeyW");
    const moving = await moved;
    const neutral = waitAck(requestOrdinal, false);
    const stationary = settle();
    void stationary.catch(() => {});
    await page.keyboard.up("KeyW"); await Promise.all([heldAck, neutral]);
    result[step] = { baseline, moving, stationary: await stationary };
  };
  page.on("pageerror", (error) => errors.push(error.message));
  result.phase = "loading-product"; save();
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  const frontendIdentity = await (await context.request.get(new URL("/__version", url).href)).json();
  const realmIdentity = await (await context.request.get(new URL("/__version", realm).href)).json();
  assert.equal(frontendIdentity.component, "frontend"); assert.equal(frontendIdentity.revision, expectedRevision);
  assert.equal(realmIdentity.component, "realm"); assert.equal(realmIdentity.revision, expectedRevision);
  result.identities = { frontend: frontendIdentity, realm: realmIdentity };
  await photoReady(page);
  await page.getByRole("button", { name: "Load textured ground", exact: true }).click();
  await photoReady(page);
  await page.getByRole("button", { name: "Choose courier", exact: true }).click();
  assert.ok(sockets.includes(ws.href));
  result.phase = "native-photo-download"; save();
  const before = await page.locator("[data-testid=host-tick]").textContent();
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  assert.ok(await page.getByRole("dialog", { name: "Photograph game" }).isVisible());
  const downloaded = page.waitForEvent("download", { timeout: 25000 });
  await page.getByRole("button", { name: "Save photo", exact: true }).click();
  const download = await downloaded;
  assert.equal(await download.failure(), null);
  const imagePath = resolve(evidence, "game-photo.png");
  await download.saveAs(imagePath);
  const png = readFileSync(imagePath);
  const pixels = inspectPng(png);
  const canvas = await page.locator("canvas").first().evaluate(element => ({ width: (element as HTMLCanvasElement).width, height: (element as HTMLCanvasElement).height }));
  assert.equal(pixels.width, canvas.width); assert.equal(pixels.height, canvas.height);
  assert.ok(await page.getByRole("dialog", { name: "Photograph game" }).isVisible(), "Capture restores its actual Photo overlay");
  const after = await page.locator("[data-testid=host-tick]").textContent();
  assert.ok(Number(after) > Number(before), "Shared authority continues during Photo mode");
  await page.getByRole("button", { name: "Back to game", exact: true }).click();
  assert.equal(await page.getByRole("dialog", { name: "Photograph game" }).count(), 0);
  const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, tabIndex: (document.activeElement as HTMLElement | null)?.tabIndex }));
  assert.ok(focus.tabIndex !== undefined && focus.tabIndex >= 0 && focus.tag !== "BODY", "Closing Photo returns native focus to its owned play surface");
  await forward("movement-after-photo-close");
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog", { name: "Photograph game" }).count(), 0);
  assert.equal(downloads, 1, "Canceling Photo mode must not initiate a second download");
  await forward("movement-after-photo-cancel");
  await page.screenshot({ path: resolve(evidence, "view-after-photo.png") });
  const preservedPose = poses.at(-1)!;
  const previousConnections = sockets.length;
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  const baselineAfterReload = waitPose(pose => pose.connection > previousConnections && pose.tick > preservedPose.tick, "Reload must rejoin the continuing saved authority through a new actual socket");
  await page.reload({ waitUntil: "domcontentloaded" });
  await photoReady(page);
  assert.equal(await page.getByRole("dialog", { name: "Photograph game" }).count(), 0);
  const reloadedPose = await baselineAfterReload;
  assert.equal(reloadedPose.x, preservedPose.x); assert.equal(reloadedPose.z, preservedPose.z);
  // Use the same official game's HUD presentation for its authored Display setting.
  const hud = new URL(url); hud.searchParams.delete("presentation");
  await page.goto(hud.href, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Display settings", exact: true }).click();
  const group = page.getByRole("group", { name: "Readout style", exact: true });
  await group.getByRole("button", { name: "Compact", exact: true }).click();
  const savedSetting = await page.evaluate(() => localStorage.getItem("jgengine:setting:relay.readoutStyle"));
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Display settings", exact: true }).click();
  assert.equal(await group.getByRole("button", { name: "Compact", pressed: true, exact: true }).count(), 1);
  result.savedSetting = await page.evaluate(() => localStorage.getItem("jgengine:setting:relay.readoutStyle"));
  assert.ok(savedSetting); assert.equal(result.savedSetting, savedSetting);
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.goto(url.href, { waitUntil: "domcontentloaded" }); await photoReady(page);
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page.getByRole("button", { name: "Back to game", exact: true }).click();
  await forward("movement-after-settings-fullreload");
  result.outcome = "native-download-pixels-close-cancel-active-unmount-settings-reload-pass";
  result.download = { path: imagePath, bytes: png.length, ...pixels, canvas, filename: download.suggestedFilename() };
  result.authorityTicks = { before, after };
  result.focusAfterClose = focus;
  result.errors = errors;
  result.unverified = ["Independent visual review of downloaded PNG", "Native cancel/unmount during an in-flight read (production lifecycle regression covers cancellation ownership)"];
  assert.deepEqual(errors, [], "Normal Photo journey must not introduce uncaught page errors");
  result.phase = "complete";
} catch (error) {
  result.outcome = "fail";
  result.failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  await browser.close();
  result.browserClosed = true;
  save();
}
