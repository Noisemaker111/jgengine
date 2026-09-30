/** Drive the real Relay Courtyard settings controls against its owned anonymous native host. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

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
const page = await context.newPage();
page.setDefaultTimeout(5000);
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
const snapshots: unknown[] = [];
const websockets: string[] = [];
page.on("websocket", (socket) => websockets.push(socket.url()));
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
  writeFileSync(resolve(evidence, "result.json"), JSON.stringify({ outcome, identity, realmIdentity, actor: url.searchParams.get("actor"), websockets, snapshots, errors }, null, 2) + "\n");
  await browser.close();
  console.log(JSON.stringify({ outcome, evidence, revision: identity.revision }));
}
